import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Crown, Crosshair, Zap, Heart, Calendar, Clock,
  Trophy, Users, ChevronRight, Shield, TrendingUp, Loader2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useMyTeam, useUpcomingMatches, useResults } from "@/lib/queries";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

export const Route = createFileRoute("/my-team")({
  head: () => ({
    meta: [
      { title: "My Team — Climby" },
      { name: "description", content: "Ростер вашей команды, расписание матчей и позиции в лигах." },
    ],
  }),
  component: MyTeam,
});

const ROLE_ICONS: Record<string, any> = {
  captain: Crown,
  sniper:  Crosshair,
  entry:   Zap,
  support: Heart,
};

const ROLE_LABELS: Record<string, string> = {
  captain: "Captain",
  sniper:  "Sniper",
  entry:   "Entry",
  support: "Support",
};

function MyTeam() {
  const { role, profile } = useAuth();
  const { data: myTeamData, isLoading } = useMyTeam();
  const { data: upcoming } = useUpcomingMatches();
  const { data: results }  = useResults(5);

  if (role === "guest") {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Shield className="w-12 h-12 mx-auto text-primary mb-3" />
          <h1 className="text-xl font-extrabold mb-1">Только для Verified</h1>
          <p className="text-sm text-muted-foreground mb-4">
            Подтвердите аккаунт чтобы создать или вступить в команду.
          </p>
          <Link to="/verify" className="inline-block px-6 py-2 rounded-full bg-primary text-primary-foreground font-bold text-sm">
            Верифицироваться
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Загрузка...
      </div>
    );
  }

  if (!myTeamData) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Users className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <h1 className="text-xl font-extrabold mb-1">Ты не в команде</h1>
          <p className="text-sm text-muted-foreground mb-4">
            Создай команду или попроси капитана добавить тебя.
          </p>
          <Link to="/play" className="inline-block px-6 py-2 rounded-full bg-primary text-primary-foreground font-bold text-sm">
            Найти команду
          </Link>
        </div>
      </div>
    );
  }

  const { team, myRole } = myTeamData;
  const members = (team as any).members ?? [];
  const teamMatches = upcoming?.filter(
    (m) => m.team_a_tag === team.tag || m.team_b_tag === team.tag
  ) ?? [];

  return (
    <div className="p-3 sm:p-4 lg:p-5 space-y-3 max-w-[1400px] mx-auto">

      {/* Team header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border bg-card p-4 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-primary/10 blur-3xl" />
        <div className="flex items-center gap-4 relative">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-lg font-extrabold font-mono text-primary-foreground pop-shadow">
            {team.tag}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono text-muted-foreground tracking-wider">МОЯ КОМАНДА</div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tighter leading-none">{team.name}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px] text-muted-foreground font-mono">
              <span className="text-primary">{team.wins}В</span>
              <span className="text-[oklch(0.7_0.18_25)]">{team.losses}П</span>
              <span>·</span>
              <span>{team.pts} очков</span>
              {team.streak !== 0 && (
                <span className={team.streak > 0 ? "text-primary" : "text-[oklch(0.7_0.18_25)]"}>
                  {team.streak > 0 ? `▲ ${team.streak} серия` : `▼ ${Math.abs(team.streak)} серия`}
                </span>
              )}
            </div>
          </div>
          {myRole === "captain" && (
            <button className="hidden sm:block px-4 py-2 rounded-full bg-secondary border border-border text-xs font-bold hover:bg-secondary/70">
              Управление
            </button>
          )}
        </div>
      </motion.div>

      <div className="grid lg:grid-cols-3 gap-3">

        {/* Roster */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="lg:col-span-2 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-mono text-muted-foreground tracking-wider">
              РОСТЕР · {members.length} ИГРОКОВ
            </div>
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            {members.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-4">В команде пока никого нет.</div>
            )}
            {members.map((m: any) => {
              const Icon = ROLE_ICONS[m.role] ?? Heart;
              const isMe = m.user?.id === profile?.id;
              return (
                <div key={m.user?.id}
                  className={`flex items-center gap-3 p-2 rounded-xl transition-colors ${
                    isMe ? "bg-primary/5 border border-primary/20" : "hover:bg-secondary/40"
                  }`}>
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-secondary to-card border border-border flex items-center justify-center text-[10px] font-extrabold font-mono shrink-0">
                    {m.user?.nickname?.slice(0, 2).toUpperCase() ?? "??"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm flex items-center gap-1.5">
                      {m.user?.nickname ?? "—"}
                      {isMe && (
                        <span className="text-[9px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">ТЫ</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                      <Icon className="w-3 h-3 text-primary" />
                      <span>{ROLE_LABELS[m.role]}</span>
                      {m.user?.hours && <span>· {m.user.hours}ч</span>}
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-3 text-[10px] font-mono">
                    <div className="text-center">
                      <div className="text-muted-foreground text-[9px]">РЕЙТИНГ</div>
                      <div className="font-bold text-primary text-[12px]">{m.user?.rating ?? 1000}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-muted-foreground text-[9px]">ID</div>
                      <div className="font-bold text-[11px]">{m.user?.standoff_id ?? "—"}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* My rating */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-2xl border border-primary/30 bg-gradient-to-br from-card via-card to-primary/10 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-mono text-muted-foreground tracking-wider">МОЙ РЕЙТИНГ</div>
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
          </div>
          {profile && (
            <>
              <div className="text-center mb-4">
                <div className="text-5xl font-extrabold font-mono text-primary leading-none">
                  {profile.rating ?? 1000}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground mt-1">очков рейтинга</div>
              </div>

              {/* Rating table */}
              <div className="rounded-xl bg-background/40 border border-border p-3 space-y-1.5">
                <div className="text-[9px] font-mono text-muted-foreground tracking-wider mb-2">ИЗМЕНЕНИЕ ЗА МАТЧ</div>
                <RatingRow label="Победа"              value="+10" positive />
                <RatingRow label="Поражение (11+ рд)"  value="-5"  />
                <RatingRow label="Поражение (8–10 рд)" value="-6"  />
                <RatingRow label="Поражение (0–7 рд)"  value="-7"  />
              </div>

              <div className="mt-3 space-y-1 text-xs">
                <StatRow label="Роль"        value={ROLE_LABELS[myRole] ?? "—"} />
                <StatRow label="Часов в игре" value={`${profile.hours ?? 0}ч`} />
                <StatRow label="Standoff ID"  value={profile.standoff_id ?? "—"} />
              </div>
            </>
          )}
        </motion.div>
      </div>

      {/* Schedule + Results */}
      <div className="grid lg:grid-cols-2 gap-3">

        <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-mono text-muted-foreground tracking-wider">РАСПИСАНИЕ</div>
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            {teamMatches.length > 0 ? teamMatches.map((m) => (
              <div key={m.id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
                <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold">
                    {m.team_a_tag} <span className="text-muted-foreground font-mono">vs</span> {m.team_b_tag}
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground">
                    {new Date(m.scheduled_at).toLocaleString("ru", {
                      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                    })}
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            )) : (
              <p className="text-xs text-muted-foreground text-center py-3">Матчей не запланировано.</p>
            )}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-mono text-muted-foreground tracking-wider">ПОСЛЕДНИЕ МАТЧИ</div>
            <Link to="/league" className="text-[10px] text-primary hover:underline font-mono">все →</Link>
          </div>
          <div className="space-y-1">
            {results?.map((r) => {
              const a = r.team_a as any;
              const b = r.team_b as any;
              const iAmA = a?.tag === team.tag;
              const myScore    = iAmA ? (r.score_a ?? 0) : (r.score_b ?? 0);
              const theirScore = iAmA ? (r.score_b ?? 0) : (r.score_a ?? 0);
              const win = myScore > theirScore;
              const loserScore = Math.min(myScore, theirScore);
              const delta = win
                ? "+10"
                : loserScore >= 11 ? "-5" : loserScore >= 8 ? "-6" : "-7";

              return (
                <div key={r.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-secondary/40 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center text-[9px] font-mono font-bold">{a?.tag}</div>
                    <div className="font-mono font-bold text-xs">{r.score_a}:{r.score_b}</div>
                    <div className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center text-[9px] font-mono font-bold">{b?.tag}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-mono font-bold ${win ? "text-primary" : "text-[oklch(0.7_0.18_25)]"}`}>
                      {delta}
                    </span>
                    <span className="text-[9px] text-muted-foreground font-mono">
                      {formatDistanceToNow(new Date(r.scheduled_at), { addSuffix: true, locale: ru })}
                    </span>
                  </div>
                </div>
              );
            }) ?? (
              <p className="text-xs text-muted-foreground text-center py-3">Матчей пока нет.</p>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function RatingRow({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5 border-b border-border/30 last:border-0 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono font-bold ${positive ? "text-primary" : "text-[oklch(0.7_0.18_25)]"}`}>
        {value}
      </span>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      <span className="font-mono font-bold text-[11px]">{value}</span>
    </div>
  );
}
