-- ============================================================
-- CLIMBY — Профиль игрока: аватар, ник, Storage
-- Запустить в Supabase SQL Editor
-- ============================================================

-- Добавляем avatar_url в users (если ещё нет)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- Уникальный ник (без учёта регистра)
CREATE UNIQUE INDEX IF NOT EXISTS users_nickname_unique
  ON public.users(lower(nickname))
  WHERE nickname IS NOT NULL;

-- ─── Storage bucket для аватаров ────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT DO NOTHING;

-- Политики Storage — аватары
CREATE POLICY "avatars: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars: auth upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "avatars: own update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
  );

-- ─── RLS: пользователь видит любой профиль ──────────────────
-- (уже настроено для admin, добавляем для всех авторизованных)
DROP POLICY IF EXISTS "users: read own" ON public.users;

CREATE POLICY "users: read all authenticated" ON public.users FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "users: update own" ON public.users FOR UPDATE
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());
