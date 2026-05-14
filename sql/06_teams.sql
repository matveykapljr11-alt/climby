-- ============================================================
-- CLIMBY — Команды: логотип, invite-код, лимит игроков
-- Добавить в Supabase SQL Editor
-- ============================================================

-- Добавляем поля в teams
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS logo_url    text,
  ADD COLUMN IF NOT EXISTS invite_code text UNIQUE;

-- Уникальный индекс для invite_code
CREATE UNIQUE INDEX IF NOT EXISTS teams_invite_code_idx
  ON public.teams(invite_code)
  WHERE invite_code IS NOT NULL;

-- ─── Лимит игроков: максимум 7 ──────────────────────────────
CREATE OR REPLACE FUNCTION public.check_team_size()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.team_members
  WHERE team_id = NEW.team_id;

  IF v_count >= 7 THEN
    RAISE EXCEPTION 'В команде уже максимальное количество игроков (7)';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER team_members_size_check
  BEFORE INSERT ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.check_team_size();

-- ─── Storage bucket для логотипов ───────────────────────────
-- Выполни в Supabase Dashboard → Storage → New bucket:
-- Название: team-logos
-- Public: YES
--
-- Или через SQL:
INSERT INTO storage.buckets (id, name, public)
VALUES ('team-logos', 'team-logos', true)
ON CONFLICT DO NOTHING;

-- Политики Storage
CREATE POLICY "logos: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'team-logos');

CREATE POLICY "logos: verified upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'team-logos'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "logos: own delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'team-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── Обновляем useCreateTeam — добавляем logo_url ───────────
-- (изменение только в коде, не в SQL)

-- ─── RLS update: капитан может обновить логотип и invite ────
DROP POLICY IF EXISTS "teams: captain update" ON public.teams;

CREATE POLICY "teams: captain update" ON public.teams FOR UPDATE
  USING (
    captain_id = public.current_user_id()
    OR public.current_user_role() = 'admin'
  );
