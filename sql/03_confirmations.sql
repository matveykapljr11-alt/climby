-- ============================================================
-- CLIMBY — Двойные подтверждения + тех. поражение
-- Запустить в Supabase SQL Editor
-- ============================================================

-- ─── Таблица подтверждений игроков ──────────────────────────
-- Каждый игрок подтверждает ДВАЖДЫ: за 1ч и за 10мин
CREATE TABLE IF NOT EXISTS public.player_confirmations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  team_id     uuid NOT NULL REFERENCES public.teams(id)   ON DELETE CASCADE,
  stage       text NOT NULL CHECK (stage IN ('1h', '10m')), -- этап подтверждения
  confirmed   boolean NOT NULL DEFAULT false,
  confirmed_at timestamptz,

  CONSTRAINT player_confirmations_unique UNIQUE (match_id, user_id, stage)
);

CREATE INDEX IF NOT EXISTS player_conf_match_idx
  ON public.player_confirmations(match_id, stage);

-- ─── Добавляем поля в matches ────────────────────────────────
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS confirm_1h_deadline  timestamptz, -- дедлайн 1-го подтверждения
  ADD COLUMN IF NOT EXISTS confirm_10m_deadline timestamptz, -- дедлайн 2-го подтверждения
  ADD COLUMN IF NOT EXISTS tech_defeat_team_id  uuid REFERENCES public.teams(id), -- кому тех. поражение
  ADD COLUMN IF NOT EXISTS tech_defeat_reason   text;        -- причина


-- ============================================================
-- ФУНКЦИЯ: open_confirmations(match_id)
-- Вызывается когда scheduled_at зафиксировано (после банпика).
-- Создаёт записи подтверждений для всех игроков обеих команд.
-- ============================================================
CREATE OR REPLACE FUNCTION public.open_confirmations(p_match_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_match public.matches%rowtype;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Матч не найден'; END IF;

  -- Дедлайны
  UPDATE public.matches SET
    confirm_1h_deadline  = v_match.scheduled_at - interval '55 minutes', -- открывается за 1ч, дедлайн за 55мин
    confirm_10m_deadline = v_match.scheduled_at - interval '5 minutes'   -- открывается за 10мин, дедлайн за 5мин
  WHERE id = p_match_id;

  -- Создаём записи для всех игроков обеих команд
  INSERT INTO public.player_confirmations (match_id, user_id, team_id, stage)
  SELECT p_match_id, tm.user_id, tm.team_id, s.stage
  FROM public.team_members tm
  CROSS JOIN (VALUES ('1h'), ('10m')) AS s(stage)
  WHERE tm.team_id IN (v_match.team_a_id, v_match.team_b_id)
  ON CONFLICT DO NOTHING;
END;
$$;


-- ============================================================
-- ФУНКЦИЯ: confirm_ready(match_id, user_id, stage)
-- Игрок нажимает кнопку подтверждения.
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirm_ready(
  p_match_id uuid,
  p_user_id  uuid,
  p_stage    text  -- '1h' или '10m'
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_match public.matches%rowtype;
  v_now   timestamptz := now();
  v_deadline timestamptz;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;

  -- Проверяем дедлайн
  IF p_stage = '1h' THEN
    v_deadline := v_match.confirm_1h_deadline;
  ELSE
    v_deadline := v_match.confirm_10m_deadline;
  END IF;

  IF v_now > v_deadline THEN
    RAISE EXCEPTION 'Время подтверждения истекло';
  END IF;

  UPDATE public.player_confirmations SET
    confirmed    = true,
    confirmed_at = v_now
  WHERE match_id = p_match_id
    AND user_id  = p_user_id
    AND stage    = p_stage;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Запись подтверждения не найдена. Подтверждения ещё не открыты.';
  END IF;
END;
$$;


-- ============================================================
-- ФУНКЦИЯ: check_and_apply_tech_defeat(match_id, stage)
-- Вызывается Edge Function по cron после каждого дедлайна.
-- Проверяет кто не подтвердил и назначает тех. поражение.
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_and_apply_tech_defeat(
  p_match_id uuid,
  p_stage    text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_match        public.matches%rowtype;
  v_a_all_ok     boolean;
  v_b_all_ok     boolean;
  v_loser_id     uuid;
  v_winner_id    uuid;
  v_result       jsonb;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND OR v_match.status = 'done' OR v_match.status = 'cancelled' THEN
    RETURN jsonb_build_object('skipped', true);
  END IF;

  -- Проверяем все ли подтвердили в команде A
  SELECT bool_and(confirmed) INTO v_a_all_ok
  FROM public.player_confirmations
  WHERE match_id = p_match_id
    AND team_id  = v_match.team_a_id
    AND stage    = p_stage;

  -- Проверяем все ли подтвердили в команде B
  SELECT bool_and(confirmed) INTO v_b_all_ok
  FROM public.player_confirmations
  WHERE match_id = p_match_id
    AND team_id  = v_match.team_b_id
    AND stage    = p_stage;

  -- Обе команды не подтвердили — тех. поражение обоим (отменяем матч)
  IF NOT v_a_all_ok AND NOT v_b_all_ok THEN
    UPDATE public.matches SET
      status            = 'cancelled',
      tech_defeat_reason = 'Обе команды не подтвердили готовность (' || p_stage || ')'
    WHERE id = p_match_id;

    -- Штраф всем (-7)
    UPDATE public.users SET rating = GREATEST(0, rating - 7)
    WHERE id IN (
      SELECT user_id FROM public.team_members
      WHERE team_id IN (v_match.team_a_id, v_match.team_b_id)
    );

    RETURN jsonb_build_object('result', 'both_forfeited');
  END IF;

  -- Одна команда не подтвердила
  IF NOT v_a_all_ok THEN
    v_loser_id  := v_match.team_a_id;
    v_winner_id := v_match.team_b_id;
  ELSIF NOT v_b_all_ok THEN
    v_loser_id  := v_match.team_b_id;
    v_winner_id := v_match.team_a_id;
  ELSE
    -- Все подтвердили — ничего не делаем
    RETURN jsonb_build_object('result', 'all_confirmed');
  END IF;

  -- Применяем тех. поражение
  UPDATE public.matches SET
    status             = 'done',
    tech_defeat_team_id = v_loser_id,
    tech_defeat_reason  = 'Не все игроки подтвердили готовность (' || p_stage || ')',
    score_a = CASE WHEN v_match.team_a_id = v_loser_id THEN 0 ELSE 16 END,
    score_b = CASE WHEN v_match.team_b_id = v_loser_id THEN 0 ELSE 16 END
  WHERE id = p_match_id;

  -- Штраф проигравшим (-7 рейтинг)
  UPDATE public.users SET rating = GREATEST(0, rating - 7)
  WHERE id IN (
    SELECT user_id FROM public.team_members WHERE team_id = v_loser_id
  );

  -- Победителям +10
  UPDATE public.users SET rating = rating + 10
  WHERE id IN (
    SELECT user_id FROM public.team_members WHERE team_id = v_winner_id
  );

  -- W/L команд
  UPDATE public.teams SET
    wins   = wins + 1, pts = pts + 3,
    streak = CASE WHEN streak >= 0 THEN streak + 1 ELSE 1 END
  WHERE id = v_winner_id;

  UPDATE public.teams SET
    losses = losses + 1,
    streak = CASE WHEN streak <= 0 THEN streak - 1 ELSE -1 END
  WHERE id = v_loser_id;

  -- Анонс тех. поражения
  INSERT INTO public.news (tag, title, excerpt, emoji, published, published_at)
  VALUES (
    'ТЕХ. ПОРАЖЕНИЕ',
    (SELECT name FROM public.teams WHERE id = v_loser_id) || ' — технический проигрыш',
    'Команда не подтвердила готовность к матчу вовремя (' || p_stage || ')',
    '⚠️',
    true,
    now()
  );

  RETURN jsonb_build_object(
    'result',  'tech_defeat',
    'loser',   v_loser_id,
    'winner',  v_winner_id,
    'stage',   p_stage
  );
END;
$$;


-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.player_confirmations ENABLE ROW LEVEL SECURITY;

-- Видят все участники матча
CREATE POLICY "player_conf: read participants" ON public.player_confirmations FOR SELECT
  USING (
    public.current_user_role() = 'admin'
    OR user_id = public.current_user_id()
    OR match_id IN (
      SELECT m.id FROM public.matches m
      JOIN public.team_members tm ON tm.team_id IN (m.team_a_id, m.team_b_id)
      WHERE tm.user_id = public.current_user_id()
    )
  );

-- Подтверждать может только сам игрок (через функцию confirm_ready)
CREATE POLICY "player_conf: update own" ON public.player_confirmations FOR UPDATE
  USING (user_id = public.current_user_id());


-- ============================================================
-- EDGE FUNCTION (cron) — добавить в Supabase
-- Dashboard → Edge Functions → Новая функция "check-confirmations"
-- Scheduled: каждую минуту (* * * * *)
-- ============================================================
-- Код функции — в файле supabase/functions/check-confirmations/index.ts
