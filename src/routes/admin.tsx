import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Swords, AlertTriangle, Trophy, Table2, Settings,
  Play, Check, X, Loader2, Scale, ChevronRight,
  Calendar, Plus, RefreshCw, Crown, Users, Shield
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Climby" }] }),
  component: AdminPage,
});

const TABS = [
  { id: "matchmaking", label: "Матчмейкинг", icon: Swords },
  { id: "matches",     label: "Матчи",        icon: Play },
  { id: "disputes",    label: "Конфликты",     icon: AlertTriangle },
  { id: "standings",  label: "Таблица",       icon: Table2 },
  { id: "playoff",    label: "Плей-офф",      icon: Trophy },
] as const;

type Tab = typeof TABS[number]["id"];

// ─── Page ────────────────────────────────────────────────────

function AdminPage() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("matchmaking");
  const [disputes, setDisputes] = useState<any[]>([]);

  useEffect(() => {
    if (!loading && role !== "admin") navigate({ to: "/" });
  }, [role, loading]);

  useEffect(() => {
    fetchDisputes();
  }, []);

  async function fetchDisputes() {
    const { data } = await supabase
      .from("match_results")
      .select("id, match_id, score_a, score_b, dispute_reason, dispute_score_a, dispute_score_b, disputed_at, submitted_team, disputed_team")
      .eq("status", "disputed");
    setDisputes(data ?? []);
  }

  if (loading || role !== "admin") return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="p-3 sm:p-4 lg:p-5 space-y-3 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <div>
          <div className="text-[10px] font-mono text-muted-foreground tracking-wider">// ADMIN PANEL</div>
          <h1 className="text-2xl font-extrabold tracking-tighter leading-none">Управление</h1>
        </div>
        {disputes.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-500 text-xs font-bold animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5" />
            {disputes.length} конфликт{disputes.length > 1 ? "а" : ""}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-2xl bg-card border border-border overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon;
          const isDispute = t.id === "disputes" && disputes.length > 0;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors relative ${
                tab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}>
              <Icon className="w-3.5 h-3.5" />
              {t.label}
              {isDispute && (
                <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {disputes.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div key={tab}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          {tab === "matchmaking" && <MatchmakingTab />}
          {tab === "matches"     && <MatchesTab />}
          {tab === "disputes"    && <DisputesTab disputes={disputes} onRefresh={fetchDisputes} />}
          {tab === "standings"   && <StandingsTab />}
          {tab === "playoff"     && <PlayoffTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// TAB 1 — МАТЧМЕЙКИНГ
// ══════════════════════════════════════════════════════════════

function MatchmakingTab() {
  const [teams, setTeams]     = useState<any[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [windowOpen,  setWindowOpen]  = useState("");
  const [windowClose, setWindowClose] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [activeSeason, setActiveSeason] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("standings").select("*").order("rank"),
      supabase.from("seasons").select("*").eq("is_active", true).single(),
    ]).then(([{ data: t }, { data: s }]) => {
      setTeams(t ?? []);
      setActiveSeason(s);
    });
  }, []);

  async function handleCreate() {
    if (!selectedTeam || !windowOpen || !windowClose || !activeSeason) {
      toast.error("Заполни все поля");
      return;
    }
    setCreating(true);
    const { data, error } = await supabase.rpc("generate_match", {
      p_season_id:    activeSeason.id,
      p_team_id:      selectedTeam,
      p_window_open:  new Date(windowOpen).toISOString(),
      p_window_close: new Date(windowClose).toISOString(),
    });
    if (error) toast.error(error.message);
    else toast.success("Матч создан! Соперник подобран рандомно по рейтингу.");
    setCreating(false);
  }

  const selected = teams.find(t => t.id === selectedTeam);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="text-[10px] font-mono text-muted-foreground tracking-wider">СОЗДАТЬ МАТЧ</div>

        {/* Выбор команды */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-2 block">Команда</label>
          <div className="grid sm:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto pr-1">
            {teams.map(t => (
              <button key={t.id} onClick={() => setSelectedTeam(t.id)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                  selectedTeam === t.id
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:border-primary/20"
                }`}>
                <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-extrabold font-mono shrink-0 ${
                  selectedTeam === t.id ? "bg-primary text-primary-foreground" : "bg-secondary"
                }`}>
                  #{t.rank}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-xs truncate">{t.name}</div>
                  <div className="text-[9px] font-mono text-muted-foreground">[{t.tag}] · {t.pts} PTS</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Окно для игры */}
        {selectedTeam && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            className="space-y-3">
            <div className="rounded-xl bg-secondary/40 border border-border p-3 text-xs">
              <div className="font-mono text-muted-foreground mb-1">Соперник будет выбран рандомно из диапазона:</div>
              <div className="font-bold">
                #{Math.max(1, (selected?.rank ?? 1) - 7)} — #{(selected?.rank ?? 1) + 4}
                <span className="text-muted-foreground font-normal ml-1">
                  (исключая последних 2 соперников)
                </span>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  <Calendar className="w-3 h-3 inline mr-1" />
                  Начало окна
                </label>
                <input type="datetime-local" value={windowOpen} onChange={e => setWindowOpen(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:border-primary/60 transition-colors" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  <Calendar className="w-3 h-3 inline mr-1" />
                  Дедлайн
                </label>
                <input type="datetime-local" value={windowClose} onChange={e => setWindowClose(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:border-primary/60 transition-colors" />
              </div>
            </div>

            <button onClick={handleCreate} disabled={creating}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 transition-opacity">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Swords className="w-4 h-4" />}
              Создать матч
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// TAB 2 — АКТИВНЫЕ МАТЧИ
// ══════════════════════════════════════════════════════════════

function MatchesTab() {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scoreInputs, setScoreInputs] = useState<Record<string, { a: string; b: string }>>({});

  useEffect(() => { fetchMatches(); }, []);

  async function fetchMatches() {
    const { data } = await supabase
      .from("matches")
      .select(`
        id, status, scheduled_at, score_a, score_b, map,
        team_a:teams!matches_team_a_id_fkey(id, tag, name),
        team_b:teams!matches_team_b_id_fkey(id, tag, name),
        result:match_results(status, score_a, score_b)
      `)
      .in("status", ["scheduled", "live"])
      .order("scheduled_at");
    setMatches(data ?? []);
    setLoading(false);
  }

  async function setLive(matchId: string) {
    const { error } = await supabase.from("matches").update({ status: "live" }).eq("id", matchId);
    if (error) toast.error(error.message);
    else { toast.success("Матч переведён в LIVE"); fetchMatches(); }
  }

  async function forceFinish(matchId: string, scoreA: number, scoreB: number) {
    const { error } = await supabase.rpc("finish_match", {
      p_match_id: matchId,
      p_score_a:  scoreA,
      p_score_b:  scoreB,
    });
    if (error) toast.error(error.message);
    else { toast.success("Матч завершён. Рейтинг обновлён."); fetchMatches(); }
  }

  async function cancelMatch(matchId: string) {
    if (!confirm("Отменить матч?")) return;
    const { error } = await supabase.from("matches")
      .update({ status: "cancelled" }).eq("id", matchId);
    if (error) toast.error(error.message);
    else { toast.success("Матч отменён"); fetchMatches(); }
  }

  if (loading) return <Loader />;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-mono text-muted-foreground tracking-wider">
          АКТИВНЫЕ МАТЧИ · {matches.length}
        </div>
        <button onClick={fetchMatches} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
          <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      {matches.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Нет активных матчей
        </div>
      )}

      {matches.map(m => {
        const inp = scoreInputs[m.id] ?? { a: "", b: "" };
        const result = Array.isArray(m.result) ? m.result[0] : m.result;
        return (
          <div key={m.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
            {/* Match header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusBadge status={m.status} />
                <span className="text-[10px] font-mono text-muted-foreground">
                  {m.scheduled_at
                    ? new Date(m.scheduled_at).toLocaleString("ru", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                    : "Время не задано"}
                </span>
              </div>
              {m.map && <span className="text-[10px] font-mono text-muted-foreground">{m.map}</span>}
            </div>

            {/* Teams */}
            <div className="flex items-center gap-3">
              <TeamChip team={m.team_a} />
              <span className="text-lg font-extrabold font-mono text-muted-foreground">vs</span>
              <TeamChip team={m.team_b} />
            </div>

            {/* Result status */}
            {result && (
              <div className={`rounded-xl px-3 py-2 text-[11px] font-mono ${
                result.status === "submitted"
                  ? "bg-primary/5 border border-primary/20 text-primary"
                  : result.status === "disputed"
                    ? "bg-amber-500/10 border border-amber-500/30 text-amber-500"
                    : "bg-secondary/40 border border-border text-muted-foreground"
              }`}>
                Результат: {
                  result.status === "pending"   ? "Не введён" :
                  result.status === "submitted" ? `Подан: ${result.score_a}:${result.score_b} · Ждём подтверждения` :
                  result.status === "disputed"  ? "⚠️ Оспорен — перейди во вкладку Конфликты" :
                  result.status === "confirmed" ? `✓ Подтверждён: ${result.score_a}:${result.score_b}` : result.status
                }
              </div>
            )}

            {/* Admin actions */}
            <div className="flex flex-wrap gap-2 pt-1 border-t border-border/40">
              {m.status === "scheduled" && (
                <button onClick={() => setLive(m.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold hover:bg-red-500/20 transition-colors">
                  <Play className="w-3 h-3" /> LIVE
                </button>
              )}

              {/* Принудительный ввод результата */}
              <div className="flex items-center gap-1.5 flex-1">
                <input type="number" min={0} placeholder={m.team_a?.tag}
                  value={inp.a}
                  onChange={e => setScoreInputs(prev => ({ ...prev, [m.id]: { ...inp, a: e.target.value } }))}
                  className="w-14 text-center font-mono py-1.5 rounded-lg bg-secondary border border-border text-xs focus:outline-none focus:border-primary/60" />
                <span className="font-mono text-muted-foreground text-xs">:</span>
                <input type="number" min={0} placeholder={m.team_b?.tag}
                  value={inp.b}
                  onChange={e => setScoreInputs(prev => ({ ...prev, [m.id]: { ...inp, b: e.target.value } }))}
                  className="w-14 text-center font-mono py-1.5 rounded-lg bg-secondary border border-border text-xs focus:outline-none focus:border-primary/60" />
                <button
                  onClick={() => {
                    const a = parseInt(inp.a), b = parseInt(inp.b);
                    if (isNaN(a) || isNaN(b) || a === b) { toast.error("Некорректный счёт"); return; }
                    forceFinish(m.id, a, b);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity">
                  <Check className="w-3 h-3" /> Засчитать
                </button>
                <button onClick={() => cancelMatch(m.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-secondary border border-border text-xs text-muted-foreground hover:text-red-500 hover:border-red-500/30 transition-colors">
                  <X className="w-3 h-3" /> Отменить
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// TAB 3 — КОНФЛИКТЫ
// ══════════════════════════════════════════════════════════════

function DisputesTab({ disputes, onRefresh }: { disputes: any[]; onRefresh: () => void }) {
  const [resolving, setResolving] = useState<string | null>(null);
  const [note, setNote]           = useState("");
  const [customA, setCustomA]     = useState("");
  const [customB, setCustomB]     = useState("");
  const { profile } = useAuth();

  async function resolve(matchId: string, scoreA: number, scoreB: number, resolveNote: string) {
    setResolving(matchId);
    const { error } = await supabase.rpc("resolve_dispute", {
      p_match_id: matchId,
      p_admin_id: profile!.id,
      p_final_a:  scoreA,
      p_final_b:  scoreB,
      p_note:     resolveNote || null,
    });
    if (error) toast.error(error.message);
    else { toast.success("Конфликт разрешён. Рейтинг обновлён."); onRefresh(); }
    setResolving(null);
    setNote("");
  }

  if (disputes.length === 0) return (
    <div className="rounded-2xl border border-border bg-card p-10 text-center">
      <Scale className="w-10 h-10 mx-auto text-muted-foreground opacity-40 mb-2" />
      <div className="font-bold">Конфликтов нет</div>
      <div className="text-sm text-muted-foreground mt-1">Все результаты подтверждены</div>
    </div>
  );

  return (
    <div className="space-y-3">
      {disputes.map(d => (
        <div key={d.id} className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-4">
          <div className="flex items-center gap-2 font-bold text-amber-500">
            <AlertTriangle className="w-4 h-4" />
            Конфликт результата
          </div>

          {/* Что подали vs что оспорили */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl bg-background/40 border border-border p-3">
              <div className="text-[9px] font-mono text-muted-foreground mb-1.5">ПОДАННЫЙ СЧЁТ</div>
              <div className="text-2xl font-extrabold font-mono text-center">
                {d.score_a} : {d.score_b}
              </div>
            </div>
            {d.dispute_score_a !== null && (
              <div className="rounded-xl bg-background/40 border border-amber-500/20 p-3">
                <div className="text-[9px] font-mono text-muted-foreground mb-1.5">АЛЬТЕРНАТИВНЫЙ СЧЁТ</div>
                <div className="text-2xl font-extrabold font-mono text-center text-amber-500">
                  {d.dispute_score_a} : {d.dispute_score_b}
                </div>
              </div>
            )}
          </div>

          {/* Причина */}
          <div className="rounded-xl bg-background/40 border border-border p-3">
            <div className="text-[9px] font-mono text-muted-foreground mb-1">ПРИЧИНА СПОРА</div>
            <div className="text-sm italic">"{d.dispute_reason}"</div>
          </div>

          {/* Примечание admin */}
          <input value={note} onChange={e => setNote(e.target.value)}
            placeholder="Примечание (необязательно)"
            className="w-full px-3 py-2 rounded-xl bg-secondary border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 transition-colors" />

          {/* Кнопки решения */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => resolve(d.match_id, d.score_a, d.score_b, note)}
              disabled={resolving === d.match_id}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:opacity-90 disabled:opacity-50 transition-opacity">
              <Check className="w-3.5 h-3.5" />
              Засчитать {d.score_a}:{d.score_b}
            </button>

            {d.dispute_score_a !== null && (
              <button
                onClick={() => resolve(d.match_id, d.dispute_score_a, d.dispute_score_b, note)}
                disabled={resolving === d.match_id}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-500 text-white font-bold text-xs hover:opacity-90 disabled:opacity-50 transition-opacity">
                <Check className="w-3.5 h-3.5" />
                Засчитать {d.dispute_score_a}:{d.dispute_score_b}
              </button>
            )}

            {/* Свой счёт */}
            <div className="flex items-center gap-1">
              <input type="number" min={0} placeholder="A"
                value={customA} onChange={e => setCustomA(e.target.value)}
                className="w-10 text-center font-mono py-2 rounded-lg bg-secondary border border-border text-xs focus:outline-none" />
              <span className="text-muted-foreground text-xs">:</span>
              <input type="number" min={0} placeholder="B"
                value={customB} onChange={e => setCustomB(e.target.value)}
                className="w-10 text-center font-mono py-2 rounded-lg bg-secondary border border-border text-xs focus:outline-none" />
              <button
                onClick={() => {
                  const a = parseInt(customA), b = parseInt(customB);
                  if (isNaN(a) || isNaN(b) || a === b) { toast.error("Некорректный счёт"); return; }
                  resolve(d.match_id, a, b, note);
                }}
                disabled={resolving === d.match_id}
                className="px-2 py-2 rounded-lg bg-secondary border border-border text-xs hover:border-primary/40 transition-colors">
                ✓
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// TAB 4 — ТАБЛИЦА
// ══════════════════════════════════════════════════════════════

function StandingsTab() {
  const [teams, setTeams]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editPts, setEditPts] = useState("");

  useEffect(() => { fetchStandings(); }, []);

  async function fetchStandings() {
    const { data } = await supabase.from("standings").select("*").order("rank");
    setTeams(data ?? []);
    setLoading(false);
  }

  async function savePts(teamId: string) {
    const pts = parseInt(editPts);
    if (isNaN(pts) || pts < 0) { toast.error("Некорректные очки"); return; }
    const { error } = await supabase.from("teams").update({ pts }).eq("id", teamId);
    if (error) toast.error(error.message);
    else { toast.success("Очки обновлены"); setEditing(null); fetchStandings(); }
  }

  if (loading) return <Loader />;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="grid grid-cols-[40px_1fr_60px_60px_60px_80px_60px] px-4 py-3 text-[9px] font-mono text-muted-foreground uppercase border-b border-border">
        <div>#</div><div>Команда</div>
        <div className="text-right">W</div>
        <div className="text-right">L</div>
        <div className="text-right">PTS</div>
        <div className="text-right">Серия</div>
        <div className="text-right">Правка</div>
      </div>
      {teams.map((t, i) => (
        <div key={t.id}
          className="grid grid-cols-[40px_1fr_60px_60px_60px_80px_60px] px-4 py-3 items-center border-b border-border/40 last:border-0 hover:bg-secondary/20 transition-colors text-sm">
          <div className={`font-bold ${t.rank <= 3 ? "text-primary" : "text-muted-foreground"}`}>{t.rank}</div>
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded-md bg-secondary text-[9px] font-mono">{t.tag}</span>
            <span className="font-medium text-xs truncate">{t.name}</span>
          </div>
          <div className="text-right font-mono text-xs">{t.w}</div>
          <div className="text-right font-mono text-xs text-muted-foreground">{t.l}</div>
          <div className="text-right font-mono text-xs">
            {editing === t.id ? (
              <div className="flex items-center justify-end gap-1">
                <input autoFocus value={editPts} onChange={e => setEditPts(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") savePts(t.id); if (e.key === "Escape") setEditing(null); }}
                  className="w-14 text-right font-mono py-0.5 px-1 rounded bg-secondary border border-primary/40 text-xs focus:outline-none" />
              </div>
            ) : (
              <span className="font-bold">{t.pts}</span>
            )}
          </div>
          <div className="text-right font-mono text-xs text-primary">
            {t.streak > 0 ? `+${t.streak}` : t.streak < 0 ? `${t.streak}` : "—"}
          </div>
          <div className="text-right">
            {editing === t.id ? (
              <div className="flex justify-end gap-1">
                <button onClick={() => savePts(t.id)} className="text-primary text-xs hover:opacity-70">✓</button>
                <button onClick={() => setEditing(null)} className="text-muted-foreground text-xs hover:opacity-70">✗</button>
              </div>
            ) : (
              <button onClick={() => { setEditing(t.id); setEditPts(String(t.pts)); }}
                className="text-[9px] font-mono text-muted-foreground hover:text-primary transition-colors">
                PTS
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// TAB 5 — ПЛЕЙ-ОФФ
// ══════════════════════════════════════════════════════════════

function PlayoffTab() {
  const [activeSeason, setActiveSeason] = useState<any>(null);
  const [activePlayoff, setActivePlayoff] = useState<any>(null);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt,   setEndsAt]   = useState("");
  const [creating, setCreating] = useState(false);
  const [topTeams, setTopTeams] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      supabase.from("seasons").select("*").eq("is_active", true).single(),
      supabase.from("playoffs").select("*").eq("status", "active").single(),
      supabase.from("standings").select("*").order("rank").limit(8),
    ]).then(([{ data: s }, { data: p }, { data: t }]) => {
      setActiveSeason(s);
      setActivePlayoff(p);
      setTopTeams(t ?? []);
    });
  }, []);

  async function launchPlayoff() {
    if (!activeSeason || !startsAt || !endsAt) { toast.error("Заполни даты"); return; }
    if (!confirm(`Запустить плей-офф? Топ 8 команд войдут автоматически. Это необратимо.`)) return;

    setCreating(true);
    const { error } = await supabase.rpc("create_playoff", {
      p_season_id: activeSeason.id,
      p_starts_at: startsAt,
      p_ends_at:   endsAt,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Плей-офф запущен! Жеребьёвка проведена.");
      window.location.href = "/playoff";
    }
    setCreating(false);
  }

  if (activePlayoff) return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center space-y-3">
      <Trophy className="w-10 h-10 mx-auto text-primary" />
      <div className="font-extrabold text-lg">Плей-офф активен</div>
      <p className="text-sm text-muted-foreground">Управляй сеткой на странице плей-офф</p>
      <a href="/playoff"
        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity">
        Открыть сетку <ChevronRight className="w-4 h-4" />
      </a>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Топ 8 превью */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="text-[10px] font-mono text-muted-foreground tracking-wider mb-3">
          ТОП 8 — ВОЙДУТ В ПЛЕЙ-ОФФ
        </div>
        <div className="grid sm:grid-cols-2 gap-1.5">
          {topTeams.map(t => (
            <div key={t.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary/40 text-xs">
              <span className={`font-bold font-mono w-5 ${t.rank <= 3 ? "text-primary" : "text-muted-foreground"}`}>
                #{t.rank}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">[{t.tag}]</span>
              <span className="font-medium flex-1 truncate">{t.name}</span>
              <span className="font-mono font-bold text-primary">{t.pts}</span>
            </div>
          ))}
        </div>
        {topTeams.length < 8 && (
          <div className="mt-2 text-xs text-amber-500 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Нужно минимум 8 команд ({topTeams.length} сейчас)
          </div>
        )}
      </div>

      {/* Даты плей-офф */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="text-[10px] font-mono text-muted-foreground tracking-wider">ЗАПУСТИТЬ ПЛЕЙ-ОФФ</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Начало</label>
            <input type="date" value={startsAt} onChange={e => setStartsAt(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:border-primary/60 transition-colors" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Конец</label>
            <input type="date" value={endsAt} onChange={e => setEndsAt(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:border-primary/60 transition-colors" />
          </div>
        </div>
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-500">
          ⚠️ После запуска жеребьёвка необратима. Убедись что регулярный сезон завершён.
        </div>
        <button onClick={launchPlayoff} disabled={creating || topTeams.length < 8}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 transition-opacity">
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
          Запустить плей-офф (Топ {Math.min(8, topTeams.length)})
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────

function TeamChip({ team }: { team: any }) {
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-[9px] font-extrabold font-mono shrink-0">
        {team?.tag ?? "?"}
      </div>
      <span className="font-bold text-sm truncate">{team?.name ?? "TBD"}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s: Record<string, { label: string; cls: string }> = {
    scheduled: { label: "Запланирован", cls: "bg-secondary text-muted-foreground border-border" },
    live:      { label: "🔴 LIVE",       cls: "bg-red-500/15 text-red-500 border-red-500/30" },
    done:      { label: "Завершён",      cls: "bg-primary/15 text-primary border-primary/30" },
    cancelled: { label: "Отменён",       cls: "bg-secondary text-muted-foreground border-border" },
  };
  const c = s[status] ?? s.scheduled;
  return (
    <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold border ${c.cls}`}>
      {c.label}
    </span>
  );
}

function Loader() {
  return (
    <div className="flex items-center justify-center py-12 text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Загрузка...
    </div>
  );
}
