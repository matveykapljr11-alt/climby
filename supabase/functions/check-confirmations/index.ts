// supabase/functions/check-confirmations/index.ts
// Запускается каждую минуту через Supabase Cron.
// Проверяет все матчи у которых истёк дедлайн подтверждения.
//
// Настройка в Supabase Dashboard:
// → Edge Functions → Deploy this function
// → Cron Jobs → New job → "* * * * *" → вызывает эту функцию

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async () => {
  const now = new Date().toISOString();

  // Находим матчи где истёк дедлайн 1h-подтверждения
  const { data: matches1h } = await supabase
    .from("matches")
    .select("id")
    .eq("status", "scheduled")
    .not("confirm_1h_deadline", "is", null)
    .lt("confirm_1h_deadline", now);

  for (const match of matches1h ?? []) {
    await supabase.rpc("check_and_apply_tech_defeat", {
      p_match_id: match.id,
      p_stage:    "1h",
    });
  }

  // Находим матчи где истёк дедлайн 10m-подтверждения
  const { data: matches10m } = await supabase
    .from("matches")
    .select("id")
    .eq("status", "scheduled")
    .not("confirm_10m_deadline", "is", null)
    .lt("confirm_10m_deadline", now);

  for (const match of matches10m ?? []) {
    await supabase.rpc("check_and_apply_tech_defeat", {
      p_match_id: match.id,
      p_stage:    "10m",
    });
  }

  return new Response(JSON.stringify({ ok: true, checked_at: now }), {
    headers: { "Content-Type": "application/json" },
  });
});
