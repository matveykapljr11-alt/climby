-- ============================================================
-- CLIMBY — Матчмейкинг, банпик, ЛС, анонсы
-- Добавить в Supabase SQL Editor
-- ============================================================

-- ─── Карты пула ─────────────────────────────────────────────
-- Стандартные карты Standoff 2
CREATE TABLE IF NOT EXISTS public.maps (
  id      serial PRIMARY KEY,
  name    text NOT NULL UNIQUE,   -- "Sandstone", "Province"...
  active  boolean NOT NULL DEFAULT true
);

INSERT INTO public.maps (name) VALUES
  ('Sandstone'),
  ('Province'),
  ('Crater'),
  ('Library'),
  ('Agency'),
  ('Crossroads')
ON CONFLICT DO NOTHING;


-- ─── Обновляем matches: добавляем поля матчмейкинга ─────────
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS window_open_at   timestamptz,   -- когда admin открыл окно
  ADD COLUMN IF NOT EXISTS window_close_at  timestamptz,   -- дедлайн договориться
  ADD COLUMN IF NOT EXISTS agreed_at        timestamptz,   -- когда договорились
  ADD COLUMN IF NOT EXISTS host_team_id     uuid REFERENCES public.teams(id),  -- хостер
  ADD COLUMN IF NOT EXISTS map_id           int  REFERENCES public.maps(id),   -- финальная карта
  ADD COLUMN IF NOT EXISTS announced        boolean NOT NULL DEFAULT false;     -- анонс сделан


-- ─── Банпик ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.banpick_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    uuid NOT NULL UNIQUE REFERENCES public.matches(id) ON DELETE CASCADE,
  map_pool    int[] NOT NULL,           -- массив из 3 id карт
  ban_a       int REFERENCES public.maps(id),   -- бан команды A
  ban_b       int REFERENCES public.maps(id),   -- бан команды B
  final_map   int REFERENCES public.maps(id),   -- итоговая карта
  turn        text NOT NULL DEFAULT 'a',  -- чья очередь банить: 'a' | 'b' | 'done'
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER banpick_updated_at
  BEFORE UPDATE ON public.banpick_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── ЛС (личные сообщения между капитанами матча) ───────────
CREATE TABLE IF NOT EXISTS public.match_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  sender_id   uuid NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  body        text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS match_messages_match_idx ON public.match_messages(match_id, created_at);


-- ─── Анонсы (авто-генерируются после банпика) ───────────────
-- Используем уже существующую таблицу news.
-- Анонс создаётся функцией announce_match() автоматически.


-- ============================================================
-- ФУНКЦИЯ: generate_match(season_id, team_id)
-- Admin вызывает для конкретной команды — система находит
-- рандомного соперника в диапазоне позиций ±4/+7
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_match(
  p_season_id    int,
  p_team_id      uuid,
  p_window_open  timestamptz,
  p_window_close timestamptz
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_team_rank    int;
  v_min_rank     int;
  v_max_rank     int;
  v_opponent_id  uuid;
  v_match_id     uuid;
  v_pool         int[];
BEGIN
  -- Находим текущую позицию команды
  SELECT rank INTO v_team_rank
  FROM public.standings
  WHERE id = p_team_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Команда не найдена в таблице или не в активном сезоне';
  END IF;

  -- Диапазон: -4 вверх (лучше), +7 вниз (хуже)
  v_min_rank := GREATEST(1, v_team_rank - 7);
  v_max_rank := v_team_rank + 4;

  -- Выбираем рандомного соперника из диапазона
  -- Исключаем: саму команду + тех с кем уже играли последние 2 матча
  SELECT t.id INTO v_opponent_id
  FROM public.standings s
  JOIN public.teams t ON t.id = s.id
  WHERE s.rank BETWEEN v_min_rank AND v_max_rank
    AND t.id <> p_team_id
    AND t.id NOT IN (
      -- Последние 2 соперника
      SELECT CASE WHEN team_a_id = p_team_id THEN team_b_id ELSE team_a_id END
      FROM public.matches
      WHERE (team_a_id = p_team_id OR team_b_id = p_team_id)
        AND season_id = p_season_id
        AND status = 'done'
      ORDER BY created_at DESC
      LIMIT 2
    )
    AND t.id NOT IN (
      -- Уже есть незавершённый матч с этой командой
      SELECT CASE WHEN team_a_id = p_team_id THEN team_b_id ELSE team_a_id END
      FROM public.matches
      WHERE (team_a_id = p_team_id OR team_b_id = p_team_id)
        AND status IN ('scheduled', 'live')
    )
  ORDER BY random()
  LIMIT 1;

  IF v_opponent_id IS NULL THEN
    RAISE EXCEPTION 'Нет доступных соперников в диапазоне рейтинга';
  END IF;

  -- Создаём матч (scheduled_at = window_open, уточнится через ЛС)
  INSERT INTO public.matches (
    season_id, team_a_id, team_b_id,
    scheduled_at, window_start, window_end,
    window_open_at, window_close_at,
    status
  ) VALUES (
    p_season_id, p_team_id, v_opponent_id,
    p_window_open, p_window_open, p_window_close,
    p_window_open, p_window_close,
    'scheduled'
  )
  RETURNING id INTO v_match_id;

  -- Рандомный пул из 3 карт
  SELECT array_agg(id ORDER BY random()) INTO v_pool
  FROM (SELECT id FROM public.maps WHERE active = true ORDER BY random() LIMIT 3) sub;

  -- Создаём сессию банпика
  INSERT INTO public.banpick_sessions (match_id, map_pool)
  VALUES (v_match_id, v_pool);

  RETURN v_match_id;
END;
$$;


-- ============================================================
-- ФУНКЦИЯ: do_ban(match_id, team_id, map_id)
-- Капитан банит карту. Когда оба забанили — финальная карта
-- определяется автоматически.
-- ============================================================
CREATE OR REPLACE FUNCTION public.do_ban(
  p_match_id  uuid,
  p_team_id   uuid,
  p_map_id    int
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_bp       public.banpick_sessions%rowtype;
  v_match    public.matches%rowtype;
  v_final    int;
  v_is_team_a boolean;
BEGIN
  SELECT * INTO v_bp FROM public.banpick_sessions WHERE match_id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Банпик не найден'; END IF;
  IF v_bp.turn = 'done' THEN RAISE EXCEPTION 'Банпик уже завершён'; END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  v_is_team_a := (v_match.team_a_id = p_team_id);

  -- Проверяем очерёдность
  IF v_bp.turn = 'a' AND NOT v_is_team_a THEN
    RAISE EXCEPTION 'Сейчас очередь команды A';
  END IF;
  IF v_bp.turn = 'b' AND v_is_team_a THEN
    RAISE EXCEPTION 'Сейчас очередь команды B';
  END IF;

  -- Карта должна быть в пуле
  IF NOT (p_map_id = ANY(v_bp.map_pool)) THEN
    RAISE EXCEPTION 'Карта не в пуле';
  END IF;

  -- Применяем бан
  IF v_bp.turn = 'a' THEN
    UPDATE public.banpick_sessions
    SET ban_a = p_map_id, turn = 'b'
    WHERE match_id = p_match_id;
  ELSE
    -- Бан B — находим финальную карту (единственная оставшаяся)
    SELECT m INTO v_final
    FROM unnest(v_bp.map_pool) AS m
    WHERE m <> v_bp.ban_a AND m <> p_map_id
    LIMIT 1;

    UPDATE public.banpick_sessions
    SET ban_b = p_map_id, final_map = v_final, turn = 'done'
    WHERE match_id = p_match_id;

    -- Записываем карту в матч
    UPDATE public.matches
    SET map_id = v_final,
        map    = (SELECT name FROM public.maps WHERE id = v_final)
    WHERE id = p_match_id;
  END IF;
END;
$$;


-- ============================================================
-- ФУНКЦИЯ: set_host(match_id, host_team_id, agreed_at)
-- Капитан A устанавливает хостера и согласованное время.
-- После этого создаётся автоанонс.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_host_and_announce(
  p_match_id      uuid,
  p_host_team_id  uuid,
  p_agreed_at     timestamptz
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_match   public.matches%rowtype;
  v_map     text;
  v_team_a  text;
  v_team_b  text;
  v_host    text;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Матч не найден'; END IF;

  -- Обновляем матч
  UPDATE public.matches SET
    host_team_id  = p_host_team_id,
    scheduled_at  = p_agreed_at,
    announced     = true
  WHERE id = p_match_id;

  -- Данные для анонса
  SELECT name INTO v_map   FROM public.maps  WHERE id = v_match.map_id;
  SELECT name INTO v_team_a FROM public.teams WHERE id = v_match.team_a_id;
  SELECT name INTO v_team_b FROM public.teams WHERE id = v_match.team_b_id;
  SELECT name INTO v_host   FROM public.teams WHERE id = p_host_team_id;

  -- Создаём новость-анонс
  INSERT INTO public.news (tag, title, excerpt, emoji, published, published_at)
  VALUES (
    'МАТЧ',
    v_team_a || ' vs ' || v_team_b,
    'Карта: ' || COALESCE(v_map, '?') ||
    ' · Хостер: ' || COALESCE(v_host, '?') ||
    ' · ' || to_char(p_agreed_at AT TIME ZONE 'Europe/Moscow', 'DD Mon HH24:MI') || ' (МСК)',
    '⚔️',
    true,
    now()
  );
END;
$$;


-- ============================================================
-- RLS для новых таблиц
-- ============================================================

ALTER TABLE public.banpick_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maps             ENABLE ROW LEVEL SECURITY;

-- Карты: читают все
CREATE POLICY "maps: read all" ON public.maps FOR SELECT USING (true);
CREATE POLICY "maps: admin write" ON public.maps FOR ALL
  USING (public.current_user_role() = 'admin');

-- Банпик: видят только участники матча + admin
CREATE POLICY "banpick: read participants" ON public.banpick_sessions FOR SELECT
  USING (
    public.current_user_role() = 'admin'
    OR match_id IN (
      SELECT m.id FROM public.matches m
      JOIN public.team_members tm ON tm.team_id IN (m.team_a_id, m.team_b_id)
      WHERE tm.user_id = public.current_user_id()
    )
  );

CREATE POLICY "banpick: admin write" ON public.banpick_sessions FOR ALL
  USING (public.current_user_role() = 'admin');

-- ЛС матча: только капитаны участвующих команд
CREATE POLICY "messages: read participants" ON public.match_messages FOR SELECT
  USING (
    public.current_user_role() = 'admin'
    OR match_id IN (
      SELECT m.id FROM public.matches m
      JOIN public.team_members tm ON tm.team_id IN (m.team_a_id, m.team_b_id)
      WHERE tm.user_id = public.current_user_id()
    )
  );

CREATE POLICY "messages: send if captain" ON public.match_messages FOR INSERT
  WITH CHECK (
    sender_id = public.current_user_id()
    AND public.current_user_role() = 'player'
    AND match_id IN (
      SELECT m.id FROM public.matches m
      JOIN public.team_members tm ON tm.team_id IN (m.team_a_id, m.team_b_id)
      WHERE tm.user_id = public.current_user_id()
        AND tm.role = 'captain'
    )
  );

-- ============================================================
-- Realtime для ЛС (подписка на новые сообщения)
-- ============================================================
-- В Supabase Dashboard → Database → Replication → включить match_messages
