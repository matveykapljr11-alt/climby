import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Swords, ChevronRight, Loader2, Crown, Shield } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/playoff")({
  head: () => ({ meta: [{ title: "Плей-офф — Climby" }] }),
  component: PlayoffPage,
});

// ─── Types ───────────────────────────────────────────────────

type BracketMatch = {
  id: string;
  round: string;
  match_number: number;
  day: number;
  status: string;
  maps_a: number;
  maps_b: number;
  scheduled_at: string | null;
  team_a_tag: string | null;
  team_a_name: string | null;
  team_b_tag: string | null;
  team_b_name: string | null;
  winner_tag: string | null;
  banpick_step: string | null;
};

type Banpick = {
  map_pool: number[];
  ban_a1: number | null; ban_b1: number | null;
  ban_a2: number | null; ban_b2: number | null;
  pick_a: number | null; pick_b: number | null;
  decider: number | null;
  step: string;
};

type MapInfo = { id: number; name: string };

const ROUND_LABELS: Record<string, string> = {
  ub_r1:      "UB Round 1",
  ub_r2:      "UB Round 2",
  ub_final:   "UB Final",
  lb_r1:      "LB Round 1",
  lb_r2:      "LB Round 2",
  lb_r3:      "LB Semi-Final",
  lb_final:   "LB Final",
  grand_final:"Grand Final",
};

const MAP_EMOJI: Record<string, string> = {
  Sandstone: "🏜️", Province: "🏘️", Crater: "🌋",
  Library: "📚", Agency: "🏢", Crossroads: "🛣️",
};

// ─── Page ────────────────────────────────────────────────────

function PlayoffPage() {
  const { role, profile } = useAuth();
  const [matches, setMatches]   = useState<BracketMatch[]>([]);
  const [maps, setMaps]         = useState<MapInfo[]>([]);
  const [playoff, setPlayoff]   = useState<any>(null);
  const [selected, setSelected] = useState<BracketMatch | null>(null);
  const [banpick, setBanpick]   = useState<Banpick | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<"bracket" | "banpick">("bracket");
  const [day, setDay]           = useState(1);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [{ data: po }, { data: br }, { data: mp }] = await Promise.all([
      supabase.from("playoffs").select("*").eq("status", "active").single(),
      supabase.from("playoff_bracket_view").select("*"),
      supabase.from("maps").select("id, name").eq("active", true),
    ]);
    setPlayoff(po);
    setMatches(br ?? []);
    setMaps(mp ?? []);
    setLoading(false);

    // Моя команда
    if (profile) {
      const { data: tm } = await supabase
        .from("team_members").select("team_id").eq("user_id", profile.id).single();
      if (tm) setMyTeamId(tm.team_id);
    }
  }

  async function loadBanpick(matchId: string) {
    const { data } = await supabase
      .from("playoff_banpick").select("*").eq("playoff_match_id", matchId).single();
    setBanpick(data ?? null);
  }

  function selectMatch(m: BracketMatch) {
    setSelected(m);
    loadBanpick(m.id);
    setTab("banpick");
  }

  async function doBanpick(mapId: number) {
    if (!selected || !myTeamId) return;
    const { error } = await supabase.rpc("do_bo3_banpick", {
      p_match_id: selected.id,
      p_team_id:  myTeamId,
      p_map_id:   mapId,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Готово!");
      await loadBanpick(selected.id);
      await loadAll();
    }
  }

  const maxDay = Math.max(...matches.map(m => m.day), 1);
  const dayMatches = matches.filter(m => m.day === day);
  const ubMatches  = dayMatches.filter(m => m.round.startsWith("ub"));
  const lbMatches  = dayMatches.filter(m => m.round.startsWith("lb"));
  const gfMatches  = dayMatches.filter(m => m.round === "grand_final");

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Загрузка...
    </div>
  );

  if (!playoff) return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="rounded-2xl border border-border bg-card p-10 text-center max-w-md">
        <Trophy className="w-12 h-12 mx-auto text-muted-foreground opacity-40 mb-3" />
        <h1 className="text-xl font-extrabold mb-1">Плей-офф не начался</h1>
        <p className="text-sm text-muted-foreground">
          Плей-офф стартует за 3–4 дня до конца месяца.<br />
          Топ 8 команд по очкам попадают автоматически.
        </p>
      </div>
    </div>
  );

  return (
    <div className="p-3 sm:p-4 lg:p-5 space-y-4 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-mono text-primary mb-1">// ПЛЕЙ-ОФФ</div>
          <h1 className="text-3xl font-extrabold tracking-tighter">Double Elimination</h1>
          <p className="text-sm text-muted-foreground">БО3 · Топ 8 команд сезона</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-xs font-mono text-primary">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          ACTIVE
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 p-1.5 rounded-2xl bg-card border border-border w-fit">
        {(["bracket", "banpick"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}>
            {t === "bracket" ? "🏆 Сетка" : "⚔️ Банпик"}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

          {/* ── BRACKET TAB ── */}
          {tab === "bracket" && (
            <div className="space-y-4">
              {/* Day selector */}
              <div className="flex gap-2">
                {Array.from({ length: maxDay }, (_, i) => i + 1).map(d => (
                  <button key={d} onClick={() => setDay(d)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      day === d
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card border-border text-muted-foreground hover:border-primary/40"
                    }`}>
                    День {d}
                  </button>
                ))}
              </div>

              {/* Upper Bracket */}
              {ubMatches.length > 0 && (
                <BracketSection
                  label="🔵 Upper Bracket"
                  matches={ubMatches}
                  onSelect={selectMatch}
                  myTeamId={myTeamId}
                />
              )}

              {/* Lower Bracket */}
              {lbMatches.length > 0 && (
                <BracketSection
                  label="🔴 Lower Bracket"
                  matches={lbMatches}
                  onSelect={selectMatch}
                  myTeamId={myTeamId}
                />
              )}

              {/* Grand Final */}
              {gfMatches.length > 0 && (
                <BracketSection
                  label="👑 Grand Final"
                  matches={gfMatches}
                  onSelect={selectMatch}
                  myTeamId={myTeamId}
                  highlight
                />
              )}
            </div>
          )}

          {/* ── BANPICK TAB ── */}
          {tab === "banpick" && (
            <div className="space-y-3">
              {/* Match selector */}
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="text-[10px] font-mono text-muted-foreground tracking-wider mb-3">ВЫБЕРИ МАТЧ</div>
                <div className="space-y-1.5">
                  {matches.filter(m => m.status !== "done" && m.team_a_tag && m.team_b_tag).map(m => (
                    <button key={m.id} onClick={() => selectMatch(m)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                        selected?.id === m.id
                          ? "border-primary/40 bg-primary/5"
                          : "border-border hover:border-primary/20 hover:bg-secondary/40"
                      }`}>
                      <span className="font-mono text-[10px] text-muted-foreground">{ROUND_LABELS[m.round]}</span>
                      <span className="font-bold">{m.team_a_tag} vs {m.team_b_tag}</span>
                      <BanpickStepBadge step={m.banpick_step} />
                    </button>
                  ))}
                  {matches.filter(m => m.status !== "done" && m.team_a_tag && m.team_b_tag).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Нет активных матчей с банпиком</p>
                  )}
                </div>
              </div>

              {/* Banpick UI */}
              {selected && banpick && (
                <Bo3BanpickPanel
                  match={selected}
                  banpick={banpick}
                  maps={maps}
                  myTeamId={myTeamId}
                  isCaptain={role === "player" || role === "admin"}
                  onAction={doBanpick}
                />
              )}
            </div>
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─── Bracket Section ─────────────────────────────────────────

function BracketSection({ label, matches, onSelect, myTeamId, highlight }: {
  label: string;
  matches: BracketMatch[];
  onSelect: (m: BracketMatch) => void;
  myTeamId: string | null;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${highlight ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
      <div className="text-[10px] font-mono text-muted-foreground tracking-wider mb-3">{label}</div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {matches.map((m, i) => (
          <MatchCard key={m.id} match={m} onSelect={onSelect} myTeamId={myTeamId} index={i} />
        ))}
      </div>
    </div>
  );
}

// ─── Match Card ──────────────────────────────────────────────

function MatchCard({ match: m, onSelect, myTeamId, index }: {
  match: BracketMatch;
  onSelect: (m: BracketMatch) => void;
  myTeamId: string | null;
  index: number;
}) {
  const isMyMatch = myTeamId && (
    m.team_a_tag !== null || m.team_b_tag !== null
  ); // упрощённо, в реальности проверяем team_id

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={() => m.team_a_tag && m.team_b_tag && onSelect(m)}
      className={`rounded-xl border p-3 cursor-pointer transition-all hover:scale-[1.02] ${
        m.status === "done"
          ? "border-border bg-secondary/30 opacity-70"
          : m.team_a_tag && m.team_b_tag
            ? "border-primary/30 bg-card hover:border-primary/60"
            : "border-border bg-secondary/20 cursor-default"
      }`}
    >
      <div className="text-[9px] font-mono text-muted-foreground mb-2">
        {ROUND_LABELS[m.round]} #{m.match_number}
      </div>

      {/* Team A */}
      <TeamRow
        tag={m.team_a_tag}
        maps={m.maps_a}
        isWinner={m.status === "done" && m.winner_tag === m.team_a_tag}
      />

      <div className="text-center text-[10px] font-mono text-muted-foreground my-1">vs</div>

      {/* Team B */}
      <TeamRow
        tag={m.team_b_tag}
        maps={m.maps_b}
        isWinner={m.status === "done" && m.winner_tag === m.team_b_tag}
      />

      {m.status !== "done" && m.team_a_tag && m.team_b_tag && (
        <div className="mt-2 flex justify-end">
          <span className="text-[9px] font-mono text-primary flex items-center gap-0.5">
            Банпик <ChevronRight className="w-3 h-3" />
          </span>
        </div>
      )}
    </motion.div>
  );
}

function TeamRow({ tag, maps, isWinner }: {
  tag: string | null; maps: number; isWinner: boolean;
}) {
  return (
    <div className={`flex items-center justify-between px-2 py-1 rounded-lg ${
      isWinner ? "bg-primary/10" : "bg-secondary/40"
    }`}>
      <div className="flex items-center gap-1.5">
        {isWinner && <Crown className="w-3 h-3 text-primary" />}
        <span className={`font-mono font-bold text-xs ${tag ? "" : "text-muted-foreground"}`}>
          {tag ?? "TBD"}
        </span>
      </div>
      {maps > 0 && (
        <span className={`font-mono font-bold text-sm ${isWinner ? "text-primary" : "text-foreground"}`}>
          {maps}
        </span>
      )}
    </div>
  );
}

// ─── Bo3 Banpick Panel ───────────────────────────────────────

function Bo3BanpickPanel({ match, banpick, maps, myTeamId, isCaptain, onAction }: {
  match: BracketMatch;
  banpick: Banpick;
  maps: MapInfo[];
  myTeamId: string | null;
  isCaptain: boolean;
  onAction: (mapId: number) => void;
}) {
  const poolMaps = maps.filter(m => banpick.map_pool.includes(m.id));
  const step = banpick.step;
  const isDone = step === "done";

  // Определяем чья очередь
  const isTeamA = false; // TODO: сравнить myTeamId с team_a_id матча (нужен team_a_id в view)
  const myTurn  =
    (step === "ban_a1" || step === "ban_a2" || step === "pick_a") ? isTeamA :
    (step === "ban_b1" || step === "ban_b2" || step === "pick_b") ? !isTeamA : false;

  const stepLabels: Record<string, string> = {
    ban_a1: `${match.team_a_tag} банит карту 1`,
    ban_b1: `${match.team_b_tag} банит карту 1`,
    ban_a2: `${match.team_a_tag} банит карту 2`,
    ban_b2: `${match.team_b_tag} банит карту 2`,
    pick_a: `${match.team_a_tag} пикает карту`,
    pick_b: `${match.team_b_tag} пикает карту`,
    done:   "Банпик завершён",
  };

  function getMapState(mapId: number): "ban_a" | "ban_b" | "pick_a" | "pick_b" | "decider" | "available" | "used" {
    if (mapId === banpick.ban_a1 || mapId === banpick.ban_a2) return "ban_a";
    if (mapId === banpick.ban_b1 || mapId === banpick.ban_b2) return "ban_b";
    if (mapId === banpick.pick_a)  return "pick_a";
    if (mapId === banpick.pick_b)  return "pick_b";
    if (mapId === banpick.decider) return "decider";
    return "available";
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-mono text-muted-foreground tracking-wider">БО3 БАНПИК</div>
          <div className="font-bold">{match.team_a_tag} vs {match.team_b_tag}</div>
        </div>
        <BanpickStepBadge step={step} />
      </div>

      {/* Step indicator */}
      <div className={`rounded-xl p-3 text-center text-sm font-bold ${
        isDone ? "bg-primary/10 border border-primary/30 text-primary"
        : myTurn && isCaptain ? "bg-amber-500/10 border border-amber-500/30 text-amber-500"
        : "bg-secondary border border-border text-muted-foreground"
      }`}>
        {stepLabels[step] ?? step}
      </div>

      {/* Progress bar */}
      <div className="flex gap-1.5">
        {["ban_a1","ban_b1","ban_a2","ban_b2","pick_a","pick_b","done"].map((s, i) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${
            i < ["ban_a1","ban_b1","ban_a2","ban_b2","pick_a","pick_b","done"].indexOf(step)
              ? "bg-primary"
              : i === ["ban_a1","ban_b1","ban_a2","ban_b2","pick_a","pick_b","done"].indexOf(step) && !isDone
                ? "bg-amber-500"
                : "bg-secondary"
          }`} />
        ))}
      </div>

      {/* Map pool — 5 карт */}
      <div className="grid grid-cols-5 gap-2">
        {poolMaps.map(m => {
          const state = getMapState(m.id);
          const canAct = !isDone && isCaptain && myTurn && state === "available";
          const isBan   = state === "ban_a" || state === "ban_b";
          const isPick  = state === "pick_a" || state === "pick_b";
          const isDecider = state === "decider";

          return (
            <motion.button
              key={m.id}
              whileHover={canAct ? { scale: 1.05 } : {}}
              onClick={() => canAct && onAction(m.id)}
              disabled={!canAct}
              className={`rounded-xl border p-3 text-center transition-all ${
                isBan     ? "opacity-30 border-red-500/30 bg-red-500/5 cursor-not-allowed" :
                isPick    ? "border-primary/40 bg-primary/10" :
                isDecider ? "border-amber-500/40 bg-amber-500/10" :
                canAct    ? "border-primary/40 bg-card hover:bg-primary/10 cursor-pointer" :
                            "border-border bg-secondary/30 cursor-default"
              }`}
            >
              <div className="text-2xl mb-1">{MAP_EMOJI[m.name] ?? "🗺️"}</div>
              <div className="text-[10px] font-bold leading-tight">{m.name}</div>
              <div className={`text-[9px] font-mono mt-1 ${
                isBan     ? "text-red-500"     :
                isPick    ? "text-primary"     :
                isDecider ? "text-amber-500"   :
                canAct    ? "text-primary"     : "text-muted-foreground"
              }`}>
                {isBan     ? (state === "ban_a" ? `БАН ${match.team_a_tag}` : `БАН ${match.team_b_tag}`) :
                 isPick    ? (state === "pick_a" ? `ПИК ${match.team_a_tag}` : `ПИК ${match.team_b_tag}`) :
                 isDecider ? "DECIDER" :
                 canAct    ? step.startsWith("ban") ? "БАНИТЬ" : "ПИКНУТЬ" :
                 "—"}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Final maps (после завершения банпика) */}
      {isDone && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-secondary/40 border border-border p-4">
          <div className="text-[10px] font-mono text-muted-foreground tracking-wider mb-3">КАРТЫ БО3</div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { n: 1, id: banpick.pick_a,  label: `Пик ${match.team_a_tag}` },
              { n: 2, id: banpick.pick_b,  label: `Пик ${match.team_b_tag}` },
              { n: 3, id: banpick.decider, label: "Decider" },
            ].map(({ n, id, label }) => {
              const map = maps.find(m => m.id === id);
              return (
                <div key={n} className={`rounded-xl border p-3 text-center ${
                  n === 3 ? "border-amber-500/40 bg-amber-500/10" : "border-primary/30 bg-primary/5"
                }`}>
                  <div className="text-[9px] font-mono text-muted-foreground mb-1">Карта {n} · {label}</div>
                  <div className="text-2xl mb-1">{MAP_EMOJI[map?.name ?? ""] ?? "🗺️"}</div>
                  <div className="text-xs font-bold">{map?.name ?? "—"}</div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────

function BanpickStepBadge({ step }: { step: string | null }) {
  if (!step) return null;
  const label = step === "done" ? "✓ Готово" : step.startsWith("ban") ? "🚫 Бан" : "⚡ Пик";
  return (
    <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold border ${
      step === "done"
        ? "bg-primary/15 text-primary border-primary/30"
        : "bg-amber-500/15 text-amber-500 border-amber-500/30"
    }`}>
      {label}
    </span>
  );
}
