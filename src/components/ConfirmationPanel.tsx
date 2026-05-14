// src/components/ConfirmationPanel.tsx
// Панель двойного подтверждения готовности для каждого игрока.
// Показывает таймер, статус команды и кнопку подтверждения.

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Clock, AlertTriangle, Loader2, Shield, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

type Props = {
  matchId:    string;
  teamAId:    string;
  teamBId:    string;
  teamATag:   string;
  teamBTag:   string;
  myTeamId:   string;
  userId:     string;
  scheduledAt: string; // ISO
};

type ConfirmRecord = {
  user_id:     string;
  team_id:     string;
  stage:       "1h" | "10m";
  confirmed:   boolean;
  confirmed_at: string | null;
  user?: { nickname: string };
};

type Stage = "waiting" | "1h_open" | "1h_done" | "10m_open" | "10m_done" | "expired";

function getStage(scheduledAt: string, now: Date): Stage {
  const start  = new Date(scheduledAt);
  const diff   = (start.getTime() - now.getTime()) / 1000 / 60; // минуты до начала

  if (diff > 60)   return "waiting";
  if (diff > 55)   return "1h_open";  // окно: 60мин → 55мин (5 мин на подтверждение)
  if (diff > 10)   return "1h_done";  // 1h подтверждение закрыто
  if (diff > 5)    return "10m_open"; // окно: 10мин → 5мин
  if (diff > 0)    return "10m_done"; // 10m подтверждение закрыто
  return "expired";
}

function useCountdown(targetIso: string) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(targetIso).getTime() - Date.now()) / 1000));
      setSecs(diff);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h > 0 ? h + ":" : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ConfirmationPanel({
  matchId, teamAId, teamBId, teamATag, teamBTag, myTeamId, userId, scheduledAt
}: Props) {
  const [confirmations, setConfirmations] = useState<ConfirmRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [now, setNow] = useState(new Date());

  const countdown1h  = useCountdown(new Date(new Date(scheduledAt).getTime() - 55 * 60000).toISOString());
  const countdown10m = useCountdown(new Date(new Date(scheduledAt).getTime() - 5  * 60000).toISOString());
  const countdownStart = useCountdown(scheduledAt);

  const stage = getStage(scheduledAt, now);

  // Обновляем now каждые 10 сек
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(id);
  }, []);

  // Загружаем подтверждения
  useEffect(() => {
    fetchConfirmations();

    // Realtime
    const ch = supabase.channel(`confirmations-${matchId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "player_confirmations",
        filter: `match_id=eq.${matchId}`,
      }, () => fetchConfirmations())
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [matchId]);

  async function fetchConfirmations() {
    const { data } = await supabase
      .from("player_confirmations")
      .select("*, user:users(nickname)")
      .eq("match_id", matchId)
      .order("stage");
    if (data) setConfirmations(data as ConfirmRecord[]);
    setLoading(false);
  }

  async function handleConfirm(stage: "1h" | "10m") {
    setConfirming(true);
    const { error } = await supabase.rpc("confirm_ready", {
      p_match_id: matchId,
      p_user_id:  userId,
      p_stage:    stage,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Готовность подтверждена!");
      fetchConfirmations();
    }
    setConfirming(false);
  }

  const myConf1h  = confirmations.find(c => c.user_id === userId && c.stage === "1h");
  const myConf10m = confirmations.find(c => c.user_id === userId && c.stage === "10m");

  const teamAConf1h  = confirmations.filter(c => c.team_id === teamAId && c.stage === "1h");
  const teamBConf1h  = confirmations.filter(c => c.team_id === teamBId && c.stage === "1h");
  const teamAConf10m = confirmations.filter(c => c.team_id === teamAId && c.stage === "10m");
  const teamBConf10m = confirmations.filter(c => c.team_id === teamBId && c.stage === "10m");

  if (loading) return (
    <div className="flex items-center justify-center py-8 text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin mr-2" /> Загрузка...
    </div>
  );

  // Подтверждения ещё не открыты
  if (confirmations.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-2">
        <Clock className="w-8 h-8 mx-auto text-muted-foreground" />
        <div className="font-bold">Подтверждения откроются за 1 час до матча</div>
        <div className="text-sm text-muted-foreground">До начала: <span className="font-mono text-primary">{countdownStart}</span></div>
      </div>
    );
  }

  return (
    <div className="space-y-3">

      {/* Stage banner */}
      <StageBanner
        stage={stage}
        countdown1h={countdown1h}
        countdown10m={countdown10m}
        countdownStart={countdownStart}
      />

      {/* Моя кнопка подтверждения */}
      <div className="grid sm:grid-cols-2 gap-3">
        <ConfirmButton
          stage="1h"
          label="Подтверждение за 1 час"
          isOpen={stage === "1h_open"}
          isDone={stage !== "waiting" && stage !== "1h_open"}
          myConfirmed={myConf1h?.confirmed ?? false}
          onConfirm={() => handleConfirm("1h")}
          loading={confirming}
        />
        <ConfirmButton
          stage="10m"
          label="Подтверждение за 10 минут"
          isOpen={stage === "10m_open"}
          isDone={stage === "10m_done" || stage === "expired"}
          myConfirmed={myConf10m?.confirmed ?? false}
          onConfirm={() => handleConfirm("10m")}
          loading={confirming}
        />
      </div>

      {/* Статус команд */}
      <div className="grid sm:grid-cols-2 gap-3">
        <TeamConfirmStatus
          tag={teamATag}
          confs1h={teamAConf1h}
          confs10m={teamAConf10m}
          stage={stage}
        />
        <TeamConfirmStatus
          tag={teamBTag}
          confs1h={teamBConf1h}
          confs10m={teamBConf10m}
          stage={stage}
        />
      </div>

      {/* Инструкция доказательств */}
      {stage === "expired" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-primary/30 bg-primary/5 p-5 space-y-3">
          <div className="font-bold flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            После матча — отправить доказательства
          </div>
          <div className="text-sm text-muted-foreground space-y-1.5">
            <p>📸 <strong>Скриншоты (СС)</strong> — финальный счёт каждого раунда</p>
            <p>🎬 <strong>Запись экрана (МС)</strong> — 1 игрок с каждой команды обязателен</p>
            <p>📁 <strong>Демка</strong> — файл replay из игры</p>
          </div>
          <a
            href="https://t.me/YOUR_ADMIN_TG"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-[#229ED9]/15 border border-[#229ED9]/30 text-sm font-bold text-[#229ED9] hover:bg-[#229ED9]/25 transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.19 13.913l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.958.646z"/>
            </svg>
            Отправить доказательства в Telegram
          </a>
          <p className="text-[10px] text-muted-foreground text-center">
            Без доказательств результат может быть аннулирован
          </p>
        </motion.div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────

function StageBanner({ stage, countdown1h, countdown10m, countdownStart }: {
  stage: Stage;
  countdown1h: string;
  countdown10m: string;
  countdownStart: string;
}) {
  const configs: Record<Stage, { icon: any; text: string; timer?: string; cls: string }> = {
    waiting:   { icon: Clock,         text: `До начала: ${countdownStart}`,           cls: "bg-secondary border-border text-muted-foreground" },
    "1h_open": { icon: AlertTriangle, text: "⚡ Подтверди готовность!",  timer: `Осталось: ${countdown1h}`,  cls: "bg-amber-500/10 border-amber-500/30 text-amber-500" },
    "1h_done": { icon: CheckCircle2,  text: "1-е подтверждение закрыто",  timer: `До 10мин: ${countdown10m}`, cls: "bg-secondary border-border text-muted-foreground" },
    "10m_open":{ icon: AlertTriangle, text: "🔥 Финальное подтверждение!", timer: `Осталось: ${countdown10m}`, cls: "bg-red-500/10 border-red-500/30 text-red-500" },
    "10m_done":{ icon: Clock,         text: "До старта:",                 timer: countdownStart,              cls: "bg-secondary border-border text-muted-foreground" },
    expired:   { icon: Shield,        text: "Матч начался — удачи!",                                          cls: "bg-primary/10 border-primary/30 text-primary" },
  };
  const c = configs[stage];
  const Icon = c.icon;
  return (
    <div className={`rounded-xl border p-3 flex items-center justify-between ${c.cls}`}>
      <div className="flex items-center gap-2 font-bold text-sm">
        <Icon className="w-4 h-4" />
        {c.text}
      </div>
      {c.timer && <span className="font-mono text-sm font-bold">{c.timer}</span>}
    </div>
  );
}

function ConfirmButton({ stage, label, isOpen, isDone, myConfirmed, onConfirm, loading }: {
  stage: "1h" | "10m";
  label: string;
  isOpen: boolean;
  isDone: boolean;
  myConfirmed: boolean;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 transition-colors ${
      myConfirmed ? "bg-primary/5 border-primary/30" :
      isOpen      ? "bg-amber-500/5 border-amber-500/30" :
      "bg-secondary/40 border-border"
    }`}>
      <div className="text-[10px] font-mono text-muted-foreground mb-2">{label.toUpperCase()}</div>
      {myConfirmed ? (
        <div className="flex items-center gap-2 text-primary font-bold text-sm">
          <CheckCircle2 className="w-4 h-4" /> Подтверждено
        </div>
      ) : isOpen ? (
        <button
          onClick={onConfirm}
          disabled={loading}
          className="w-full py-2 rounded-lg bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          Подтвердить
        </button>
      ) : isDone ? (
        <div className="text-sm text-muted-foreground">
          {myConfirmed ? "✓" : "✗ Не подтверждено"}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">Откроется позже</div>
      )}
    </div>
  );
}

function TeamConfirmStatus({ tag, confs1h, confs10m, stage }: {
  tag: string;
  confs1h: ConfirmRecord[];
  confs10m: ConfirmRecord[];
  stage: Stage;
}) {
  const total = confs1h.length;
  const done1h  = confs1h.filter(c => c.confirmed).length;
  const done10m = confs10m.filter(c => c.confirmed).length;

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono font-bold text-sm">{tag}</span>
        <Users className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <ConfirmRow label="За 1 час"    done={done1h}  total={total} active={stage === "1h_open" || stage === "1h_done" || stage === "10m_open" || stage === "10m_done" || stage === "expired"} />
        <ConfirmRow label="За 10 минут" done={done10m} total={total} active={stage === "10m_open" || stage === "10m_done" || stage === "expired"} />
      </div>
      <div className="mt-2 space-y-0.5">
        {confs1h.map(c => (
          <div key={c.user_id} className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground font-mono">{(c as any).user?.nickname ?? "—"}</span>
            <span className={c.confirmed ? "text-primary" : "text-muted-foreground"}>
              {c.confirmed ? "✓" : "○"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfirmRow({ label, done, total, active }: {
  label: string; done: number; total: number; active: boolean;
}) {
  const pct = total > 0 ? (done / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] font-mono mb-0.5">
        <span className="text-muted-foreground">{label}</span>
        <span className={done === total && active ? "text-primary font-bold" : "text-muted-foreground"}>
          {active ? `${done}/${total}` : "—"}
        </span>
      </div>
      <div className="h-1 rounded-full bg-secondary overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${done === total && total > 0 ? "bg-primary" : "bg-amber-500"}`}
          initial={{ width: 0 }}
          animate={{ width: active ? `${pct}%` : "0%" }}
          transition={{ duration: 0.4 }}
        />
      </div>
    </div>
  );
}
