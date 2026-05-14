-- ============================================================
-- CLIMBY LEAGUE — Supabase SQL Schema
-- Вставить в Supabase → SQL Editor → Run
-- ============================================================

-- ─── Extensions ─────────────────────────────────────────────
create extension if not exists "pgcrypto";


-- ─── Enums ──────────────────────────────────────────────────
create type user_role      as enum ('guest', 'player', 'admin');
create type player_role    as enum ('captain', 'sniper', 'entry', 'support');
create type match_status   as enum ('scheduled', 'live', 'done', 'cancelled');


-- ============================================================
-- ТАБЛИЦА: users
-- Создаётся автоматически при регистрации через Supabase Auth.
-- Хранит профиль и роль.
-- ============================================================
create table public.users (
  id              uuid primary key default gen_random_uuid(),
  auth_id         uuid unique not null references auth.users(id) on delete cascade,
  telegram_nick   text,                          -- @ник без @
  standoff_id     text,                          -- игровой ID в Standoff 2
  nickname        text,                          -- ник в игре
  hours           int check (hours >= 0),        -- часов в Standoff 2
  role            user_role not null default 'guest',
  verified_at     timestamptz,                   -- когда прошёл верификацию
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Верификация: все поля должны быть заполнены и часов >= 100
-- Это constraint, который нельзя обойти на уровне БД
alter table public.users
  add constraint verified_requires_fields
  check (
    role <> 'player'
    or (
      telegram_nick is not null
      and standoff_id  is not null
      and nickname     is not null
      and hours        is not null
      and hours        >= 100
    )
  );

comment on table  public.users                    is 'Профили пользователей. role=guest — только просмотр, role=player — полный доступ.';
comment on column public.users.standoff_id        is 'Реальный ID игрока в Standoff 2.';
comment on column public.users.hours              is 'Количество часов в Standoff 2. Минимум 100 для верификации.';


-- ─── Auto-update updated_at ─────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();


-- ============================================================
-- ТАБЛИЦА: seasons
-- ============================================================
create table public.seasons (
  id          serial primary key,
  name        text not null,               -- "Сезон 3"
  starts_at   date not null,
  ends_at     date not null,
  prize_pool  int  not null default 0,     -- в рублях
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),

  constraint season_dates_valid check (ends_at > starts_at)
);

-- Только один активный сезон одновременно
create unique index seasons_one_active on public.seasons(is_active)
  where is_active = true;

comment on table public.seasons is 'Сезоны лиги. Только один может быть активным.';


-- ============================================================
-- ТАБЛИЦА: teams
-- ============================================================
create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  season_id   int not null references public.seasons(id) on delete restrict,
  tag         text not null,               -- 2–5 символов, уникально в сезоне
  name        text not null,
  captain_id  uuid references public.users(id) on delete set null,
  wins        int  not null default 0 check (wins >= 0),
  losses      int  not null default 0 check (losses >= 0),
  pts         int  not null default 0,
  streak      int  not null default 0,     -- текущая серия побед
  created_at  timestamptz not null default now(),

  constraint teams_tag_upper  check (tag = upper(tag)),
  constraint teams_tag_length check (char_length(tag) between 2 and 5),
  constraint teams_unique_tag unique (season_id, tag)
);

comment on column public.teams.pts    is 'Очки: +3 за победу, +0 за поражение.';
comment on column public.teams.streak is 'Положительное = серия побед, отрицательное = серия поражений.';


-- ============================================================
-- ТАБЛИЦА: team_members
-- Один игрок — одна команда в сезоне
-- ============================================================
create table public.team_members (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id)  on delete cascade,
  user_id     uuid not null references public.users(id)  on delete cascade,
  role        player_role not null default 'entry',
  joined_at   timestamptz not null default now(),

  constraint team_members_unique_user unique (user_id, team_id),

  -- Один игрок не может быть в двух командах одного сезона
  -- (реализуется через RLS + функцию ниже)
  constraint team_members_one_per_player unique (user_id, team_id)
);

-- Запрет на участие в двух командах в рамках одного сезона
create or replace function public.check_one_team_per_season()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1
    from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where tm.user_id = new.user_id
      and t.season_id = (select season_id from public.teams where id = new.team_id)
      and tm.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) then
    raise exception 'Игрок уже состоит в команде этого сезона.';
  end if;
  return new;
end;
$$;

create trigger team_members_one_season
  before insert or update on public.team_members
  for each row execute function public.check_one_team_per_season();

-- Максимум 1 капитан на команду
create unique index team_members_one_captain
  on public.team_members(team_id)
  where role = 'captain';


-- ============================================================
-- ТАБЛИЦА: matches
-- ============================================================
create table public.matches (
  id            uuid primary key default gen_random_uuid(),
  season_id     int  not null references public.seasons(id) on delete restrict,
  team_a_id     uuid not null references public.teams(id)   on delete restrict,
  team_b_id     uuid not null references public.teams(id)   on delete restrict,
  scheduled_at  timestamptz not null,
  window_start  timestamptz,                -- начало окна подтверждения
  window_end    timestamptz,                -- конец окна
  status        match_status not null default 'scheduled',
  score_a       int check (score_a >= 0),   -- счёт команды A
  score_b       int check (score_b >= 0),   -- счёт команды B
  map           text,                       -- карта (Sandstone, Province…)
  result_note   text,                       -- комментарий судьи
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint matches_different_teams check (team_a_id <> team_b_id),
  constraint matches_score_both_set  check (
    (score_a is null) = (score_b is null)   -- оба или ни одного
  ),
  constraint matches_same_season check (
    (select season_id from public.teams where id = team_a_id) = season_id
    and
    (select season_id from public.teams where id = team_b_id) = season_id
  )
);

create trigger matches_updated_at
  before update on public.matches
  for each row execute function public.set_updated_at();

comment on column public.matches.window_start is 'Начало окна, в котором команды должны подтвердить готовность.';
comment on column public.matches.window_end   is 'Если до window_end оба не подтвердили — технический проигрыш.';


-- ============================================================
-- ТАБЛИЦА: match_confirmations
-- Каждая команда подтверждает готовность отдельно
-- ============================================================
create table public.match_confirmations (
  id            uuid primary key default gen_random_uuid(),
  match_id      uuid not null references public.matches(id) on delete cascade,
  team_id       uuid not null references public.teams(id)   on delete cascade,
  confirmed     boolean not null default false,
  confirmed_by  uuid references public.users(id) on delete set null, -- капитан
  confirmed_at  timestamptz,

  constraint match_confirmations_unique unique (match_id, team_id)
);

-- При создании матча автоматически создаём 2 записи подтверждений
create or replace function public.create_match_confirmations()
returns trigger language plpgsql as $$
begin
  insert into public.match_confirmations (match_id, team_id)
  values (new.id, new.team_a_id),
         (new.id, new.team_b_id);
  return new;
end;
$$;

create trigger matches_create_confirmations
  after insert on public.matches
  for each row execute function public.create_match_confirmations();


-- ============================================================
-- ТАБЛИЦА: news
-- ============================================================
create table public.news (
  id          uuid primary key default gen_random_uuid(),
  tag         text not null,          -- "ОБНОВЛЕНИЕ", "ТУРНИР"…
  title       text not null,
  excerpt     text,
  body        text,
  emoji       text default '📢',
  author_id   uuid references public.users(id) on delete set null,
  published   boolean not null default false,
  published_at timestamptz,
  created_at  timestamptz not null default now()
);

comment on table public.news is 'Новости лиги. Видят все. Создают только admin.';


-- ============================================================
-- FUNCTION: finish_match(match_id, score_a, score_b)
-- Вызывается admin-ом. Записывает результат и обновляет статистику команд.
-- ============================================================
create or replace function public.finish_match(
  p_match_id uuid,
  p_score_a  int,
  p_score_b  int
)
returns void language plpgsql security definer as $$
declare
  v_match  public.matches%rowtype;
  v_winner uuid;
  v_loser  uuid;
  v_streak_winner int;
  v_streak_loser  int;
begin
  -- Получаем матч
  select * into v_match from public.matches where id = p_match_id;
  if not found then
    raise exception 'Матч не найден: %', p_match_id;
  end if;
  if v_match.status = 'done' then
    raise exception 'Матч уже завершён.';
  end if;

  -- Определяем победителя
  if p_score_a > p_score_b then
    v_winner := v_match.team_a_id;
    v_loser  := v_match.team_b_id;
  elsif p_score_b > p_score_a then
    v_winner := v_match.team_b_id;
    v_loser  := v_match.team_a_id;
  else
    raise exception 'Ничья не предусмотрена правилами лиги.';
  end if;

  -- Текущие серии
  select streak into v_streak_winner from public.teams where id = v_winner;
  select streak into v_streak_loser  from public.teams where id = v_loser;

  -- Обновляем победителя
  update public.teams set
    wins   = wins + 1,
    pts    = pts + 3,
    streak = case when streak >= 0 then streak + 1 else 1 end
  where id = v_winner;

  -- Обновляем проигравшего
  update public.teams set
    losses = losses + 1,
    streak = case when streak <= 0 then streak - 1 else -1 end
  where id = v_loser;

  -- Записываем результат матча
  update public.matches set
    score_a = p_score_a,
    score_b = p_score_b,
    status  = 'done'
  where id = p_match_id;

end;
$$;

comment on function public.finish_match is 'Завершает матч, обновляет W/L/PTS/streak обеих команд атомарно.';


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Включаем RLS на всех таблицах
alter table public.users               enable row level security;
alter table public.seasons             enable row level security;
alter table public.teams               enable row level security;
alter table public.team_members        enable row level security;
alter table public.matches             enable row level security;
alter table public.match_confirmations enable row level security;
alter table public.news                enable row level security;

-- Хелпер: текущий пользователь из public.users
create or replace function public.current_user_id()
returns uuid language sql stable security definer as $$
  select id from public.users where auth_id = auth.uid()
$$;

create or replace function public.current_user_role()
returns user_role language sql stable security definer as $$
  select role from public.users where auth_id = auth.uid()
$$;

-- ─── users ──────────────────────────────────────────────────
-- Читать: только себя (или admin видит всех)
create policy "users: read own"     on public.users for select
  using (auth_id = auth.uid() or public.current_user_role() = 'admin');

-- Обновлять: только себя
create policy "users: update own"   on public.users for update
  using (auth_id = auth.uid());

-- Вставка нового профиля: только через trigger (service_role)
create policy "users: insert self"  on public.users for insert
  with check (auth_id = auth.uid());

-- ─── seasons ────────────────────────────────────────────────
create policy "seasons: read all"   on public.seasons for select using (true);
create policy "seasons: admin write" on public.seasons for all
  using (public.current_user_role() = 'admin');

-- ─── teams ──────────────────────────────────────────────────
create policy "teams: read all"     on public.teams   for select using (true);
create policy "teams: player create" on public.teams  for insert
  with check (public.current_user_role() = 'player');
create policy "teams: captain update" on public.teams for update
  using (captain_id = public.current_user_id() or public.current_user_role() = 'admin');

-- ─── team_members ───────────────────────────────────────────
create policy "team_members: read all" on public.team_members for select using (true);
create policy "team_members: player join" on public.team_members for insert
  with check (
    public.current_user_role() = 'player'
    and user_id = public.current_user_id()
  );
create policy "team_members: leave or admin" on public.team_members for delete
  using (user_id = public.current_user_id() or public.current_user_role() = 'admin');

-- ─── matches ────────────────────────────────────────────────
create policy "matches: read all"   on public.matches for select using (true);
create policy "matches: admin write" on public.matches for all
  using (public.current_user_role() = 'admin');

-- ─── match_confirmations ────────────────────────────────────
create policy "confirmations: read all" on public.match_confirmations for select using (true);
create policy "confirmations: captain confirm" on public.match_confirmations for update
  using (
    public.current_user_role() = 'player'
    and team_id in (
      select team_id from public.team_members
      where user_id = public.current_user_id()
        and role    = 'captain'
    )
  );

-- ─── news ───────────────────────────────────────────────────
create policy "news: read published" on public.news for select
  using (published = true or public.current_user_role() = 'admin');
create policy "news: admin write"    on public.news for all
  using (public.current_user_role() = 'admin');


-- ============================================================
-- ФУНКЦИЯ: handle_new_auth_user()
-- Автоматически создаёт запись в public.users при регистрации
-- ============================================================
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (auth_id, role)
  values (new.id, 'guest');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();


-- ============================================================
-- SEED: начальный сезон
-- ============================================================
insert into public.seasons (name, starts_at, ends_at, prize_pool, is_active)
values ('Сезон 3', '2026-05-15', '2026-08-01', 1200000, true);


-- ============================================================
-- VIEW: standings (турнирная таблица, только активный сезон)
-- ============================================================
create or replace view public.standings as
select
  t.id,
  t.tag,
  t.name,
  t.wins   as w,
  t.losses as l,
  t.pts,
  t.streak,
  rank() over (order by t.pts desc, t.wins desc) as rank
from public.teams t
join public.seasons s on s.id = t.season_id
where s.is_active = true;

comment on view public.standings is 'Турнирная таблица активного сезона, отсортированная по очкам.';


-- ============================================================
-- VIEW: upcoming_matches (следующие матчи)
-- ============================================================
create or replace view public.upcoming_matches as
select
  m.id,
  m.scheduled_at,
  m.window_start,
  m.window_end,
  m.map,
  m.status,
  ta.tag  as team_a_tag,
  ta.name as team_a_name,
  tb.tag  as team_b_tag,
  tb.name as team_b_name,
  ca.confirmed as team_a_confirmed,
  cb.confirmed as team_b_confirmed
from public.matches m
join public.teams ta on ta.id = m.team_a_id
join public.teams tb on tb.id = m.team_b_id
left join public.match_confirmations ca on ca.match_id = m.id and ca.team_id = m.team_a_id
left join public.match_confirmations cb on cb.match_id = m.id and cb.team_id = m.team_b_id
where m.status in ('scheduled', 'live')
order by m.scheduled_at;
