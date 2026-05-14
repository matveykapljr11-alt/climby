import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  useStandings,
  useUpcomingMatches,
  useLiveMatches,
  useResults,
} from "@/lib/queries";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

export const Route = createFileRoute("/league")({
  head: () => ({
    meta: [
      { title: "League — Climby" },
      { name: "description", content: "Таблица, расписание, live-матчи и результаты лиги Climby." },
    ],
  }),
  component: LeaguePage,
});

const TABS = ["Таблица", "Расписание", "Live", "Результаты"] as const;
type Tab = (typeof TABS)[number];

function LeaguePage() {
  const [tab, setTab] = useState<Tab>("Таблица");

  return (
    <div className="min-h-screen">
      <main className="max-w-6xl mx-auto px-5 sm:px-6 pt-12 sm:pt-16 pb-24">
        <div className="mb-8">
          <div className="text-xs font-mono text-primary mb-2">// LEAGUE</div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tighter">Сезон 3</h1>
          <p className="text-muted-foreground mt-2">Регулярка → плей-офф · ₽1.2M призовой</p>
        </div>

        <div className="flex gap-1.5 p-1.5 rounded-2xl bg-card border border-border w-fit mb-8 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "Live" && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse mr-1.5" />}
              {t}
            </button>
          ))}
        </div>

        <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          {tab === "Таблица"    && <Standings />}
          {tab === "Расписание" && <Schedule />}
          {tab === "Live"       && <LiveMatches />}
          {tab === "Результаты" && <Results />}
        </motion.div>
      </main>
    </div>
  );
}

// ─── Standings ───────────────────────────────────────────────

function Standings() {
  const { data, isLoading, error } = useStandings();

  if (isLoading) return <LoadingSpinner />;
  if (error)     return <ErrorBox msg={error.message} />;
  if (!data?.length) return <Empty text="Команды ещё не зарегистрированы." />;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="grid grid-cols-[40px_1fr_60px_60px_60px_60px] sm:grid-cols-[60px_1fr_80px_80px_80px_80px] px-4 sm:px-6 py-3 text-[10px] sm:text-xs font-mono text-muted-foreground uppercase border-b border-border">
        <div>#</div><div>Команда</div>
        <div className="text-right">W</div>
        <div className="text-right">L</div>
        <div className="text-right">PTS</div>
        <div className="text-right">Серия</div>
      </div>
      {data.map((t, i) => (
        <motion.div
          key={t.tag}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.04 }}
          className="grid grid-cols-[40px_1fr_60px_60px_60px_60px] sm:grid-cols-[60px_1fr_80px_80px_80px_80px] px-4 sm:px-6 py-3.5 text-sm border-b border-border/40 last:border-0 hover:bg-secondary/40 transition-colors items-center"
        >
          <div className={`font-bold ${t.rank <= 3 ? "text-primary" : "text-muted-foreground"}`}>{t.rank}</div>
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="px-1.5 py-0.5 rounded-md bg-secondary text-[10px] font-mono">{t.tag}</span>
            <span className="font-medium truncate">{t.name}</span>
          </div>
          <div className="text-right font-mono">{t.w}</div>
          <div className="text-right font-mono text-muted-foreground">{t.l}</div>
          <div className="text-right font-mono font-bold">{t.pts}</div>
          <div className="text-right font-mono text-primary">
            {t.streak > 0 ? `+${t.streak}` : t.streak < 0 ? `${t.streak}` : "—"}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Schedule ────────────────────────────────────────────────

function Schedule() {
  const { data, isLoading, error } = useUpcomingMatches();

  if (isLoading) return <LoadingSpinner />;
  if (error)     return <ErrorBox msg={error.message} />;
  if (!data?.length) return <Empty text="Нет запланированных матчей." />;

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {data.map((m, i) => (
        <motion.div
          key={m.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="rounded-2xl border border-border bg-card p-5"
        >
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs font-mono text-muted-foreground">
              {new Date(m.scheduled_at).toLocaleString("ru", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="flex gap-1.5">
              <ConfirmBadge confirmed={m.team_a_confirmed} label={m.team_a_tag} />
              <ConfirmBadge confirmed={m.team_b_confirmed} label={m.team_b_tag} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 mt-2">
            <span className="font-bold text-lg">{m.team_a_tag}</span>
            <span className="text-xs text-muted-foreground font-mono">vs</span>
            <span className="font-bold text-lg">{m.team_b_tag}</span>
          </div>
          {m.map && <div className="text-[10px] font-mono text-muted-foreground mt-1">{m.map}</div>}
        </motion.div>
      ))}
    </div>
  );
}

// ─── Live ────────────────────────────────────────────────────

function LiveMatches() {
  const { data, isLoading, error } = useLiveMatches();

  if (isLoading) return <LoadingSpinner />;
  if (error)     return <ErrorBox msg={error.message} />;
  if (!data?.length) return <Empty text="Сейчас нет матчей в эфире." />;

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {data.map((m, i) => {
        const a = m.team_a as any;
        const b = m.team_b as any;
        return (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-2xl border border-primary/40 bg-card p-6 relative overflow-hidden"
          >
            <div className="absolute top-4 right-4 flex items-center gap-1.5 text-xs font-mono text-red-500">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              LIVE
            </div>
            {m.map && <div className="text-xs font-mono text-muted-foreground mb-4">{m.map}</div>}
            <div className="flex items-center justify-between">
              <div className="text-center flex-1">
                <div className="font-bold text-2xl">{a?.tag}</div>
                <div className="text-4xl font-extrabold font-mono mt-1">{m.score_a ?? 0}</div>
              </div>
              <div className="text-muted-foreground px-3">:</div>
              <div className="text-center flex-1">
                <div className="font-bold text-2xl">{b?.tag}</div>
                <div className="text-4xl font-extrabold font-mono mt-1">{m.score_b ?? 0}</div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Results ─────────────────────────────────────────────────

function Results() {
  const { data, isLoading, error } = useResults(20);

  if (isLoading) return <LoadingSpinner />;
  if (error)     return <ErrorBox msg={error.message} />;
  if (!data?.length) return <Empty text="Результатов ещё нет." />;

  return (
    <div className="space-y-2.5">
      {data.map((r, i) => {
        const a = r.team_a as any;
        const b = r.team_b as any;
        return (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="rounded-xl border border-border bg-card px-5 py-4 flex items-center justify-between gap-4"
          >
            <span className="text-xs font-mono text-muted-foreground w-28 shrink-0">
              {formatDistanceToNow(new Date(r.scheduled_at), { addSuffix: true, locale: ru })}
            </span>
            <div className="flex-1 flex items-center justify-center gap-4">
              <span className={`font-bold ${(r.score_a ?? 0) > (r.score_b ?? 0) ? "text-primary" : "text-muted-foreground"}`}>
                {a?.tag}
              </span>
              <span className="font-mono text-lg">{r.score_a} : {r.score_b}</span>
              <span className={`font-bold ${(r.score_b ?? 0) > (r.score_a ?? 0) ? "text-primary" : "text-muted-foreground"}`}>
                {b?.tag}
              </span>
            </div>
            {r.map && <span className="text-[10px] font-mono text-muted-foreground">{r.map}</span>}
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Shared UI ───────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20 text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin mr-2" />
      <span className="text-sm">Загрузка...</span>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center text-sm text-red-500">
      Ошибка: {msg}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground text-sm">
      {text}
    </div>
  );
}

function ConfirmBadge({ confirmed, label }: { confirmed: boolean; label: string }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${
      confirmed
        ? "bg-primary/15 text-primary border-primary/30"
        : "bg-secondary text-muted-foreground border-border"
    }`}>
      {label} {confirmed ? "✓" : "?"}
    </span>
  );
}
