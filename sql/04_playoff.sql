-- ============================================================
-- CLIMBY — Плей-офф: Double Elimination, БО3
-- Запустить в Supabase SQL Editor
-- ============================================================

-- ─── Enums ──────────────────────────────────────────────────
CREATE TYPE playoff_bracket AS ENUM ('upper', 'lower', 'grand_final');
CREATE TYPE playoff_round   AS ENUM (
  'ub_r1', 'ub_r2', 'ub_final',
  'lb_r1', 'lb_r2', 'lb_r3', 'lb_final',
  'grand_final'
);
CREATE TYPE bo3_banpick_step AS ENUM (
  'ban_a1', 'ban_b1', 'ban_a2', 'ban_b2',  -- 4 бана
  'pick_a',  'pick_b',                        -- 2 пика
  'done'
);


-- ============================================================
-- ТАБЛИЦА: playoffs
-- Один плей-офф на сезон (за 3-4 дня до конца месяца)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.playoffs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id   int  NOT NULL UNIQUE REFERENCES public.seasons(id) ON DELETE CASCADE,
  starts_at   date NOT NULL,
  ends_at     date NOT NULL,
  status      text NOT NULL DEFAULT 'pending'  -- pending | active | done
                   CHECK (status IN ('pending', 'active', 'done')),
  created_at  timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- ТАБЛИЦА: playoff_slots
-- 8 слотов — команды, попавшие в плей-офф
-- ============================================================
CREATE TABLE IF NOT EXISTS public.playoff_slots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playoff_id  uuid NOT NULL REFERENCES public.playoffs(id) ON DELETE CASCADE,
  team_id     uuid NOT NULL REFERENCES public.teams(id),
  seed        int  NOT NULL CHECK (seed BETWEEN 1 AND 8), -- позиция посева (1=лучший)
  eliminated  boolean NOT NULL DEFAULT false,
  bracket     playoff_bracket NOT NULL DEFAULT 'upper', -- текущий брекет

  CONSTRAINT playoff_slots_unique_team    UNIQUE (playoff_id, team_id),
  CONSTRAINT playoff_slots_unique_seed    UNIQUE (playoff_id, seed)
);


-- ============================================================
-- ТАБЛИЦА: playoff_matches
-- Матчи плей-офф (БО3 — до 2 побед)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.playoff_matches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playoff_id    uuid NOT NULL REFERENCES public.playoffs(id) ON DELETE CASCADE,
  round         playoff_round NOT NULL,
  match_number  int  NOT NULL,          -- порядковый номер матча в раунде (1,2,3,4)
  day           int  NOT NULL DEFAULT 1,-- день плей-офф (1, 2, 3...)
  team_a_id     uuid REFERENCES public.teams(id),
  team_b_id     uuid REFERENCES public.teams(id),
  scheduled_at  timestamptz,
  status        match_status NOT NULL DEFAULT 'scheduled',

  -- БО3: счёт по картам (0-2, 1-2, 2-0, 2-1)
  maps_a        int  NOT NULL DEFAULT 0 CHECK (maps_a BETWEEN 0 AND 2),
  maps_b        int  NOT NULL DEFAULT 0 CHECK (maps_b BETWEEN 0 AND 2),
  winner_id     uuid REFERENCES public.teams(id),
  loser_id      uuid REFERENCES public.teams(id),

  -- Следующие матчи (куда идёт победитель и проигравший)
  next_winner_match_id  uuid REFERENCES public.playoff_matches(id),
  next_loser_match_id   uuid REFERENCES public.playoff_matches(id),

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT playoff_match_unique UNIQUE (playoff_id, round, match_number)
);

CREATE TRIGGER playoff_matches_updated_at
  BEFORE UPDATE ON public.playoff_matches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- ТАБЛИЦА: playoff_maps
-- Карты внутри БО3 матча (до 3 карт)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.playoff_maps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playoff_match_id uuid NOT NULL REFERENCES public.playoff_matches(id) ON DELETE CASCADE,
  map_number      int  NOT NULL CHECK (map_number BETWEEN 1 AND 3),
  map_id          int  REFERENCES public.maps(id),
  score_a         int  CHECK (score_a >= 0),
  score_b         int  CHECK (score_b >= 0),
  winner_id       uuid REFERENCES public.teams(id),
  played          boolean NOT NULL DEFAULT false,

  CONSTRAINT playoff_maps_unique UNIQUE (playoff_match_id, map_number)
);


-- ============================================================
-- ТАБЛИЦА: playoff_banpick
-- Расширенный банпик для БО3: 5 карт, 4 бана, 2 пика, 1 остаётся
--
-- Порядок:
--   ban_a1 → ban_b1 → ban_a2 → ban_b2  (4 бана)
--   pick_a → pick_b                     (2 пика = карты 2 и 3)
--   Оставшаяся карта = карта 1 (если BO3)  ← нет, карта 1 = случайная из оставшихся
--
-- Итог: map1 = pick_a, map2 = pick_b, map3 = последняя оставшаяся (decider)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.playoff_banpick (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playoff_match_id uuid NOT NULL UNIQUE REFERENCES public.playoff_matches(id) ON DELETE CASCADE,
  map_pool         int[] NOT NULL,    -- 5 карт
  ban_a1           int  REFERENCES public.maps(id),
  ban_b1           int  REFERENCES public.maps(id),
  ban_a2           int  REFERENCES public.maps(id),
  ban_b2           int  REFERENCES public.maps(id),
  pick_a           int  REFERENCES public.maps(id),  -- карта команды A (map 2)
  pick_b           int  REFERENCES public.maps(id),  -- карта команды B (map 3)
  decider          int  REFERENCES public.maps(id),  -- последняя карта (map 1 / decider)
  step             bo3_banpick_step NOT NULL DEFAULT 'ban_a1',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER playoff_banpick_updated_at
  BEFORE UPDATE ON public.playoff_banpick
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- ФУНКЦИЯ: create_playoff(season_id, starts_at, ends_at)
-- Admin запускает — жеребьёвка и создание сетки
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_playoff(
  p_season_id int,
  p_starts_at date,
  p_ends_at   date
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_playoff_id uuid;
  v_teams      uuid[];
  v_team_id    uuid;
  v_i          int;
  -- Матчи UB Round 1 (4 штуки)
  v_ub1        uuid[] := ARRAY[]::uuid[];
  -- Матчи LB Round 1 (2 штуки)
  v_lb1        uuid[] := ARRAY[]::uuid[];
  -- UB Round 2
  v_ub2        uuid[] := ARRAY[]::uuid[];
  v_lb2        uuid[] := ARRAY[]::uuid[];
  v_ub_final   uuid;
  v_lb3        uuid;
  v_lb_final   uuid;
  v_gf         uuid;
  v_mid        uuid;
BEGIN
  -- Берём топ 8 по очкам активного сезона
  SELECT ARRAY(
    SELECT id FROM public.teams
    WHERE season_id = p_season_id
    ORDER BY pts DESC, wins DESC
    LIMIT 8
  ) INTO v_teams;

  IF array_length(v_teams, 1) < 8 THEN
    RAISE EXCEPTION 'Нужно минимум 8 команд для плей-офф (сейчас: %)', array_length(v_teams, 1);
  END IF;

  -- Рандомная жеребьёвка (перемешиваем)
  SELECT ARRAY(
    SELECT unnest(v_teams) ORDER BY random()
  ) INTO v_teams;

  -- Создаём плей-офф
  INSERT INTO public.playoffs (season_id, starts_at, ends_at, status)
  VALUES (p_season_id, p_starts_at, p_ends_at, 'active')
  RETURNING id INTO v_playoff_id;

  -- Сиды (1-8 после жеребьёвки)
  FOR v_i IN 1..8 LOOP
    INSERT INTO public.playoff_slots (playoff_id, team_id, seed)
    VALUES (v_playoff_id, v_teams[v_i], v_i);
  END LOOP;

  -- ── Создаём пустые матчи всей сетки ──────────────────────

  -- Grand Final (день 3+)
  INSERT INTO public.playoff_matches (playoff_id, round, match_number, day)
  VALUES (v_playoff_id, 'grand_final', 1, 3)
  RETURNING id INTO v_gf;

  -- UB Final (день 2)
  INSERT INTO public.playoff_matches (playoff_id, round, match_number, day, next_winner_match_id)
  VALUES (v_playoff_id, 'ub_final', 1, 2, v_gf)
  RETURNING id INTO v_ub_final;

  -- LB Final (день 3)
  INSERT INTO public.playoff_matches (playoff_id, round, match_number, day, next_winner_match_id)
  VALUES (v_playoff_id, 'lb_final', 1, 3, v_gf)
  RETURNING id INTO v_lb_final;

  -- LB Round 3 (Semi, день 2)
  INSERT INTO public.playoff_matches (playoff_id, round, match_number, day, next_winner_match_id)
  VALUES (v_playoff_id, 'lb_r3', 1, 2, v_lb_final)
  RETURNING id INTO v_lb3;

  -- UB Round 2 (2 матча, день 2)
  FOR v_i IN 1..2 LOOP
    INSERT INTO public.playoff_matches (playoff_id, round, match_number, day,
      next_winner_match_id, next_loser_match_id)
    VALUES (v_playoff_id, 'ub_r2', v_i, 2, v_ub_final, v_lb3)
    RETURNING id INTO v_mid;
    v_ub2 := v_ub2 || v_mid;
  END LOOP;

  -- LB Round 2 (2 матча, день 2)
  FOR v_i IN 1..2 LOOP
    INSERT INTO public.playoff_matches (playoff_id, round, match_number, day,
      next_winner_match_id)
    VALUES (v_playoff_id, 'lb_r2', v_i, 2, v_lb3)
    RETURNING id INTO v_mid;
    v_lb2 := v_lb2 || v_mid;
  END LOOP;

  -- LB Round 1 (2 матча, день 1)
  FOR v_i IN 1..2 LOOP
    INSERT INTO public.playoff_matches (playoff_id, round, match_number, day,
      next_winner_match_id)
    VALUES (v_playoff_id, 'lb_r1', v_i, 1, v_lb2[v_i])
    RETURNING id INTO v_mid;
    v_lb1 := v_lb1 || v_mid;
  END LOOP;

  -- UB Round 1 (4 матча, день 1) + привязываем команды
  FOR v_i IN 1..4 LOOP
    INSERT INTO public.playoff_matches (playoff_id, round, match_number, day,
      team_a_id, team_b_id,
      next_winner_match_id,
      next_loser_match_id)
    VALUES (
      v_playoff_id, 'ub_r1', v_i, 1,
      v_teams[(v_i - 1) * 2 + 1],
      v_teams[(v_i - 1) * 2 + 2],
      v_ub2[CEIL(v_i::float / 2)::int],
      v_lb1[CEIL(v_i::float / 2)::int]
    )
    RETURNING id INTO v_mid;
    v_ub1 := v_ub1 || v_mid;

    -- Сразу создаём банпик для UB R1
    PERFORM public.create_bo3_banpick(v_mid);
  END LOOP;

  RETURN v_playoff_id;
END;
$$;


-- ============================================================
-- ФУНКЦИЯ: create_bo3_banpick(playoff_match_id)
-- Создаёт сессию банпика БО3 с рандомным пулом 5 карт
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_bo3_banpick(p_match_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_pool int[];
BEGIN
  SELECT array_agg(id ORDER BY random()) INTO v_pool
  FROM (SELECT id FROM public.maps WHERE active = true ORDER BY random() LIMIT 5) sub;

  INSERT INTO public.playoff_banpick (playoff_match_id, map_pool)
  VALUES (p_match_id, v_pool)
  ON CONFLICT DO NOTHING;
END;
$$;


-- ============================================================
-- ФУНКЦИЯ: do_bo3_banpick(match_id, team_id, map_id)
-- Шаг банпика — бан или пик в зависимости от текущего step
-- ============================================================
CREATE OR REPLACE FUNCTION public.do_bo3_banpick(
  p_match_id uuid,
  p_team_id  uuid,
  p_map_id   int
)
RETURNS bo3_banpick_step LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_bp      public.playoff_banpick%rowtype;
  v_match   public.playoff_matches%rowtype;
  v_is_a    boolean;
  v_next    bo3_banpick_step;
  v_banned  int[];
  v_picked  int[];
  v_remaining int[];
  v_decider   int;
BEGIN
  SELECT * INTO v_bp    FROM public.playoff_banpick  WHERE playoff_match_id = p_match_id;
  SELECT * INTO v_match FROM public.playoff_matches  WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Матч не найден'; END IF;
  IF v_bp.step = 'done' THEN RAISE EXCEPTION 'Банпик завершён'; END IF;

  v_is_a := (v_match.team_a_id = p_team_id);

  -- Проверяем очерёдность
  IF v_bp.step IN ('ban_a1', 'ban_a2', 'pick_a') AND NOT v_is_a THEN
    RAISE EXCEPTION 'Сейчас ход команды A';
  END IF;
  IF v_bp.step IN ('ban_b1', 'ban_b2', 'pick_b') AND v_is_a THEN
    RAISE EXCEPTION 'Сейчас ход команды B';
  END IF;

  -- Карта должна быть в пуле и не использована
  v_banned  := ARRAY[v_bp.ban_a1, v_bp.ban_b1, v_bp.ban_a2, v_bp.ban_b2];
  v_picked  := ARRAY[v_bp.pick_a, v_bp.pick_b];
  IF NOT (p_map_id = ANY(v_bp.map_pool)) THEN RAISE EXCEPTION 'Карта не в пуле'; END IF;
  IF p_map_id = ANY(v_banned) OR p_map_id = ANY(v_picked) THEN
    RAISE EXCEPTION 'Карта уже забанена или запикана';
  END IF;

  -- Применяем шаг
  CASE v_bp.step
    WHEN 'ban_a1' THEN UPDATE public.playoff_banpick SET ban_a1 = p_map_id, step = 'ban_b1' WHERE playoff_match_id = p_match_id;
    WHEN 'ban_b1' THEN UPDATE public.playoff_banpick SET ban_b1 = p_map_id, step = 'ban_a2' WHERE playoff_match_id = p_match_id;
    WHEN 'ban_a2' THEN UPDATE public.playoff_banpick SET ban_a2 = p_map_id, step = 'ban_b2' WHERE playoff_match_id = p_match_id;
    WHEN 'ban_b2' THEN UPDATE public.playoff_banpick SET ban_b2 = p_map_id, step = 'pick_a' WHERE playoff_match_id = p_match_id;
    WHEN 'pick_a' THEN UPDATE public.playoff_banpick SET pick_a = p_map_id, step = 'pick_b' WHERE playoff_match_id = p_match_id;
    WHEN 'pick_b' THEN
      -- Последний шаг — находим оставшуюся карту (decider)
      SELECT m INTO v_decider
      FROM unnest(v_bp.map_pool) AS m
      WHERE m <> v_bp.ban_a1 AND m <> v_bp.ban_b1
        AND m <> v_bp.ban_a2 AND m <> v_bp.ban_b2
        AND m <> v_bp.pick_a AND m <> p_map_id
      LIMIT 1;

      UPDATE public.playoff_banpick
      SET pick_b = p_map_id, decider = v_decider, step = 'done'
      WHERE playoff_match_id = p_match_id;

      -- Создаём 3 слота карт матча
      -- Map 1 = pick_a (карта команды A)
      -- Map 2 = pick_b (карта команды B)
      -- Map 3 = decider (оставшаяся)
      INSERT INTO public.playoff_maps (playoff_match_id, map_number, map_id)
      VALUES
        (p_match_id, 1, v_bp.pick_a),
        (p_match_id, 2, p_map_id),
        (p_match_id, 3, v_decider)
      ON CONFLICT DO NOTHING;
  END CASE;

  SELECT step INTO v_next FROM public.playoff_banpick WHERE playoff_match_id = p_match_id;
  RETURN v_next;
END;
$$;


-- ============================================================
-- ФУНКЦИЯ: finish_playoff_map(match_id, map_number, score_a, score_b)
-- Записывает результат одной карты БО3 и проверяет победителя матча
-- ============================================================
CREATE OR REPLACE FUNCTION public.finish_playoff_map(
  p_match_id   uuid,
  p_map_number int,
  p_score_a    int,
  p_score_b    int
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_match     public.playoff_matches%rowtype;
  v_map_win_a int;
  v_map_win_b int;
  v_winner_id uuid;
  v_loser_id  uuid;
BEGIN
  SELECT * INTO v_match FROM public.playoff_matches WHERE id = p_match_id;

  -- Записываем результат карты
  UPDATE public.playoff_maps SET
    score_a   = p_score_a,
    score_b   = p_score_b,
    winner_id = CASE WHEN p_score_a > p_score_b THEN v_match.team_a_id ELSE v_match.team_b_id END,
    played    = true
  WHERE playoff_match_id = p_match_id AND map_number = p_map_number;

  -- Считаем победы по картам
  SELECT
    COUNT(*) FILTER (WHERE winner_id = v_match.team_a_id),
    COUNT(*) FILTER (WHERE winner_id = v_match.team_b_id)
  INTO v_map_win_a, v_map_win_b
  FROM public.playoff_maps
  WHERE playoff_match_id = p_match_id AND played = true;

  -- Обновляем счёт матча
  UPDATE public.playoff_matches SET maps_a = v_map_win_a, maps_b = v_map_win_b
  WHERE id = p_match_id;

  -- Проверяем победителя БО3 (нужно 2 карты)
  IF v_map_win_a >= 2 OR v_map_win_b >= 2 THEN
    v_winner_id := CASE WHEN v_map_win_a >= 2 THEN v_match.team_a_id ELSE v_match.team_b_id END;
    v_loser_id  := CASE WHEN v_map_win_a >= 2 THEN v_match.team_b_id ELSE v_match.team_a_id END;

    -- Завершаем матч
    UPDATE public.playoff_matches SET
      status    = 'done',
      winner_id = v_winner_id,
      loser_id  = v_loser_id
    WHERE id = p_match_id;

    -- Продвигаем победителя в следующий матч
    IF v_match.next_winner_match_id IS NOT NULL THEN
      UPDATE public.playoff_matches SET
        team_a_id = CASE WHEN team_a_id IS NULL THEN v_winner_id ELSE team_a_id END,
        team_b_id = CASE WHEN team_a_id IS NOT NULL AND team_b_id IS NULL THEN v_winner_id ELSE team_b_id END
      WHERE id = v_match.next_winner_match_id;

      -- Создаём банпик для следующего матча когда обе команды известны
      IF (SELECT team_a_id IS NOT NULL AND team_b_id IS NOT NULL
          FROM public.playoff_matches WHERE id = v_match.next_winner_match_id) THEN
        PERFORM public.create_bo3_banpick(v_match.next_winner_match_id);
      END IF;
    END IF;

    -- Продвигаем проигравшего в нижнюю сетку (или выбывает)
    IF v_match.next_loser_match_id IS NOT NULL THEN
      UPDATE public.playoff_matches SET
        team_a_id = CASE WHEN team_a_id IS NULL THEN v_loser_id ELSE team_a_id END,
        team_b_id = CASE WHEN team_a_id IS NOT NULL AND team_b_id IS NULL THEN v_loser_id ELSE team_b_id END
      WHERE id = v_match.next_loser_match_id;

      IF (SELECT team_a_id IS NOT NULL AND team_b_id IS NOT NULL
          FROM public.playoff_matches WHERE id = v_match.next_loser_match_id) THEN
        PERFORM public.create_bo3_banpick(v_match.next_loser_match_id);
      END IF;
    ELSE
      -- Нижняя сетка закончилась → команда выбывает
      UPDATE public.playoff_slots SET eliminated = true
      WHERE playoff_id = v_match.playoff_id AND team_id = v_loser_id;
    END IF;

    RETURN jsonb_build_object(
      'match_done', true,
      'winner', v_winner_id,
      'loser',  v_loser_id,
      'score',  v_map_win_a || ':' || v_map_win_b
    );
  END IF;

  RETURN jsonb_build_object('match_done', false, 'maps', v_map_win_a || ':' || v_map_win_b);
END;
$$;


-- ============================================================
-- VIEW: playoff_bracket_view
-- Полная сетка для отображения на фронте
-- ============================================================
CREATE OR REPLACE VIEW public.playoff_bracket_view AS
SELECT
  pm.id,
  pm.playoff_id,
  pm.round,
  pm.match_number,
  pm.day,
  pm.status,
  pm.maps_a,
  pm.maps_b,
  pm.scheduled_at,
  ta.tag  AS team_a_tag,
  ta.name AS team_a_name,
  tb.tag  AS team_b_tag,
  tb.name AS team_b_name,
  tw.tag  AS winner_tag,
  pm.next_winner_match_id,
  pm.next_loser_match_id,
  pb.step AS banpick_step
FROM public.playoff_matches pm
LEFT JOIN public.teams ta ON ta.id = pm.team_a_id
LEFT JOIN public.teams tb ON tb.id = pm.team_b_id
LEFT JOIN public.teams tw ON tw.id = pm.winner_id
LEFT JOIN public.playoff_banpick pb ON pb.playoff_match_id = pm.id
ORDER BY pm.day, pm.round, pm.match_number;


-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.playoffs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playoff_slots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playoff_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playoff_maps    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playoff_banpick ENABLE ROW LEVEL SECURITY;

-- Все читают
CREATE POLICY "playoffs: read all"        ON public.playoffs        FOR SELECT USING (true);
CREATE POLICY "playoff_slots: read all"   ON public.playoff_slots   FOR SELECT USING (true);
CREATE POLICY "playoff_matches: read all" ON public.playoff_matches FOR SELECT USING (true);
CREATE POLICY "playoff_maps: read all"    ON public.playoff_maps    FOR SELECT USING (true);
CREATE POLICY "playoff_banpick: read all" ON public.playoff_banpick FOR SELECT USING (true);

-- Только admin пишет
CREATE POLICY "playoffs: admin"        ON public.playoffs        FOR ALL USING (public.current_user_role() = 'admin');
CREATE POLICY "playoff_slots: admin"   ON public.playoff_slots   FOR ALL USING (public.current_user_role() = 'admin');
CREATE POLICY "playoff_matches: admin" ON public.playoff_matches FOR ALL USING (public.current_user_role() = 'admin');
CREATE POLICY "playoff_maps: admin"    ON public.playoff_maps    FOR ALL USING (public.current_user_role() = 'admin');
CREATE POLICY "playoff_banpick: admin" ON public.playoff_banpick FOR ALL USING (public.current_user_role() = 'admin');
