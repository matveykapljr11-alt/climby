# Climby — League Platform

Платформа для лиги Standoff 2. Матчмейкинг, командный менеджмент, рейтинг, плей-офф.

## Стек
- **Frontend:** React + TanStack Router + TanStack Query
- **Backend:** Supabase (PostgreSQL + Auth + Storage + Realtime)
- **UI:** Tailwind CSS + Framer Motion

---

## Установка

### 1. Установить зависимости
```bash
npm install @supabase/supabase-js date-fns
```

### 2. Настроить .env
```bash
cp .env.example .env
```
Вставить ключи из Supabase Dashboard → Settings → API.

### 3. Залить SQL в Supabase
Запускать строго по порядку в Supabase → SQL Editor:
```
sql/01_schema.sql
sql/02_matchmaking.sql
sql/03_confirmations.sql
sql/04_playoff.sql
sql/05_results.sql
sql/06_teams.sql
sql/07_profile.sql
```

### 4. Настроить OAuth
Supabase Dashboard → Authentication → Providers:
- ✅ Google (добавить Client ID + Secret)
- ✅ Telegram (опционально)

### 5. Включить Realtime
Supabase Dashboard → Database → Replication → включить `match_messages`

### 6. Задеплоить Edge Function (cron)
```bash
npx supabase functions deploy check-confirmations
```
Затем в Supabase → Edge Functions → Cron Jobs → каждую минуту.

### 7. Скопировать файлы в проект
```
src/lib/      → supabase.ts, auth.tsx, queries.ts, database.types.ts
src/routes/   → все .tsx файлы
src/components/ → ConfirmationPanel.tsx, ResultPanel.tsx
```

### 8. Запустить
```bash
npm run dev
```

---

## Стать Admin (разово)
```sql
UPDATE public.users SET role = 'admin'
WHERE auth_id = 'твой-uuid-из-auth.users';
```

---

## Структура файлов
```
src/
├── lib/
│   ├── supabase.ts          # Клиент Supabase
│   ├── auth.tsx             # Авторизация (Google/Telegram OAuth)
│   ├── queries.ts           # React Query хуки
│   └── database.types.ts   # TypeScript типы
├── routes/
│   ├── index.tsx            # Главная / Дашборд
│   ├── league.tsx           # Таблица, расписание, live, результаты
│   ├── teams.tsx            # Создание команды, ростер, инвайты
│   ├── play.tsx             # Матч: банпик, чат, готовность, результат
│   ├── playoff.tsx          # Плей-офф: Double Elimination сетка
│   ├── profile.tsx          # Профиль игрока
│   ├── verify.tsx           # Верификация (TG + Standoff ID + 100ч)
│   ├── my-team.tsx          # Моя команда + рейтинг
│   └── admin.tsx            # Админ панель
├── components/
│   ├── ConfirmationPanel.tsx # Двойное подтверждение с таймером
│   └── ResultPanel.tsx       # Ввод/подтверждение/спор результата
sql/
├── 01_schema.sql            # Основные таблицы
├── 02_matchmaking.sql       # Матчмейкинг + банпик + чат
├── 03_confirmations.sql     # Двойные подтверждения
├── 04_playoff.sql           # Плей-офф Double Elimination
├── 05_results.sql           # Result System
├── 06_teams.sql             # Логотипы + инвайты + лимит игроков
└── 07_profile.sql           # Аватары + уникальные ники
supabase/
└── functions/
    └── check-confirmations/ # Edge Function (cron каждую минуту)
        └── index.ts
```

---

## Роли
| Роль | Как получить | Возможности |
|------|-------------|-------------|
| `guest` | Авто при регистрации | Только просмотр |
| `player` | Верификация (TG + SO ID + 100ч) | Команды, матчи, банпик |
| `admin` | Вручную через SQL | Всё |
