-- ============================================================
-- CLIMBY — Result System
-- Ввод результата, подтверждение, конфликт → модерация
-- Запустить в Supabase SQL Editor
-- ============================================================

-- ─── Статусы результата ─────────────────────────────────────
CREATE TYPE result_status AS ENUM (
  'pending',    -- никто не ввёл
  'submitted',  -- одна команда ввела
  'confirmed',  -- вторая команда подтвердила → финал
  'disputed',   -- вторая команда оспорила → модерация
  'resolved'    -- admin разрешил конфликт
);

-- ─── Таблица результатов ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.match_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        uuid NOT NULL UNIQUE REFERENCES public.matches(id) ON DELETE CASCADE,

  -- Кто подал результат первым
  submitted_by    uuid REFERENCES public.users(id),
  submitted_team  uuid REFERENCES public.teams(id),
  submitted_at    timestamptz,

  -- Счёт от первой команды
  score_a         int CHECK (score_a >= 0),
  score_b         int CHECK (score_b >= 0),

  -- Подтверждение второй команды
  confirmed_by    uuid REFERENCES public.users(id),
  confirmed_team  uuid REFERENCES public.teams(id),
  confirmed_at    timestamptz,

  -- Если оспорили
  disputed_by     uuid REFERENCES public.users(id),
  disputed_team   uuid REFERENCES public.teams(id),
  disputed_at     timestamptz,
  dispute_reason  text,

  -- Счёт который предлагает оспаривающая команда
  dispute_score_a int CHECK (dispute_score_a >= 0),
  dispute_score_b int CHECK (dispute_score_b >= 0),

  -- Решение admin
  resolved_by     uuid REFERENCES public.users(id),
  resolved_at     timestamptz,
  resolve_note    text,
  final_score_a   int,
  final_score_b   int,

  status          result_status NOT NULL DEFAULT 'pending',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER match_results_updated_at
  BEFORE UPDATE ON public.match_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Авто-создание записи результата при создании матча
CREATE OR REPLACE FUNCTION public.create_match_result()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.match_results (match_id)
  VALUES (NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER matches_create_result
  AFTER INSERT ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.create_match_result();


-- ============================================================
-- ФУНКЦИЯ: submit_result(match_id, user_id, team_id, score_a, score_b)
-- Капитан вводит счёт после матча
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_result(
  p_match_id uuid,
  p_user_id  uuid,
  p_team_id  uuid,
  p_score_a  int,
  p_score_b  int
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result public.match_results%rowtype;
  v_match  public.matches%rowtype;
BEGIN
  SELECT * INTO v_result FROM public.match_results WHERE match_id = p_match_id;
  SELECT * INTO v_match  FROM public.matches         WHERE id = p_match_id;

  IF v_match.status = 'done' THEN
    RAISE EXCEPTION 'Матч уже завершён';
  END IF;
  IF v_result.status NOT IN ('pending') THEN
    RAISE EXCEPTION 'Результат уже был подан. Статус: %', v_result.status;
  END IF;
  IF p_score_a = p_score_b THEN
    RAISE EXCEPTION 'Ничья невозможна';
  END IF;
  IF p_score_a < 0 OR p_score_b < 0 THEN
    RAISE EXCEPTION 'Счёт не может быть отрицательным';
  END IF;

  UPDATE public.match_results SET
    submitted_by   = p_user_id,
    submitted_team = p_team_id,
    submitted_at   = now(),
    score_a        = p_score_a,
    score_b        = p_score_b,
    status         = 'submitted'
  WHERE match_id = p_match_id;
END;
$$;


-- ============================================================
-- ФУНКЦИЯ: confirm_result(match_id, user_id, team_id)
-- Вторая команда подтверждает результат → матч завершается
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirm_result(
  p_match_id uuid,
  p_user_id  uuid,
  p_team_id  uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result public.match_results%rowtype;
BEGIN
  SELECT * INTO v_result FROM public.match_results WHERE match_id = p_match_id;

  IF v_result.status <> 'submitted' THEN
    RAISE EXCEPTION 'Нет результата для подтверждения';
  END IF;
  IF v_result.submitted_team = p_team_id THEN
    RAISE EXCEPTION 'Нельзя подтвердить свой же результат';
  END IF;

  -- Подтверждаем
  UPDATE public.match_results SET
    confirmed_by   = p_user_id,
    confirmed_team = p_team_id,
    confirmed_at   = now(),
    final_score_a  = score_a,
    final_score_b  = score_b,
    status         = 'confirmed'
  WHERE match_id = p_match_id;

  -- Завершаем матч
  PERFORM public.finish_match(p_match_id, v_result.score_a, v_result.score_b);
END;
$$;


-- ============================================================
-- ФУНКЦИЯ: dispute_result(match_id, user_id, team_id, reason, alt_score_a, alt_score_b)
-- Вторая команда оспаривает результат → идёт на модерацию
-- ============================================================
CREATE OR REPLACE FUNCTION public.dispute_result(
  p_match_id    uuid,
  p_user_id     uuid,
  p_team_id     uuid,
  p_reason      text,
  p_alt_score_a int DEFAULT NULL,
  p_alt_score_b int DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result public.match_results%rowtype;
BEGIN
  SELECT * INTO v_result FROM public.match_results WHERE match_id = p_match_id;

  IF v_result.status <> 'submitted' THEN
    RAISE EXCEPTION 'Нет результата для оспаривания';
  END IF;
  IF v_result.submitted_team = p_team_id THEN
    RAISE EXCEPTION 'Нельзя оспорить свой же результат';
  END IF;
  IF char_length(p_reason) < 10 THEN
    RAISE EXCEPTION 'Опиши причину подробнее (минимум 10 символов)';
  END IF;

  UPDATE public.match_results SET
    disputed_by     = p_user_id,
    disputed_team   = p_team_id,
    disputed_at     = now(),
    dispute_reason  = p_reason,
    dispute_score_a = p_alt_score_a,
    dispute_score_b = p_alt_score_b,
    status          = 'disputed'
  WHERE match_id = p_match_id;

  -- Уведомление в ленту для admin
  INSERT INTO public.news (tag, title, excerpt, emoji, published, published_at)
  VALUES (
    'КОНФЛИКТ',
    'Оспаривание результата матча',
    'Требуется решение администратора. Match ID: ' || p_match_id::text,
    '⚠️',
    false, -- не публичная, только для admin
    now()
  );
END;
$$;


-- ============================================================
-- ФУНКЦИЯ: resolve_dispute(match_id, admin_id, final_a, final_b, note)
-- Admin выбирает финальный счёт
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_dispute(
  p_match_id uuid,
  p_admin_id uuid,
  p_final_a  int,
  p_final_b  int,
  p_note     text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.match_results SET
    resolved_by   = p_admin_id,
    resolved_at   = now(),
    resolve_note  = p_note,
    final_score_a = p_final_a,
    final_score_b = p_final_b,
    status        = 'resolved'
  WHERE match_id = p_match_id;

  -- Завершаем матч с финальным счётом
  PERFORM public.finish_match(p_match_id, p_final_a, p_final_b);
END;
$$;


-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.match_results ENABLE ROW LEVEL SECURITY;

-- Участники матча + admin видят результат
CREATE POLICY "results: read participants" ON public.match_results FOR SELECT
  USING (
    public.current_user_role() = 'admin'
    OR match_id IN (
      SELECT m.id FROM public.matches m
      JOIN public.team_members tm ON tm.team_id IN (m.team_a_id, m.team_b_id)
      WHERE tm.user_id = public.current_user_id()
    )
  );

-- Обновление только через функции (security definer)
CREATE POLICY "results: functions only" ON public.match_results FOR UPDATE
  USING (public.current_user_role() = 'admin');
