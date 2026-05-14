import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Calendar, Clock, MoreHorizontal, ChevronRight, Trophy, Flame, BookOpen, LifeBuoy, Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useStandings, useUpcomingMatches, useResults, useNews } from "@/lib/queries";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Climby — Лиги Standoff 2" },
      { name: "description", content: "Дашборд игрока Climby: матчи, рейтинг, новости, таблица." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { role, profile } = useAuth();
  const { data: standings } = useStandings();
  const { data: upcoming }  = useUpcomingMatches();
  const { data: results }   = useResults(5);
  const { data: news }      = useNews(3);

  const nextMatch = upcoming?.[0];
  const myStanding = standings?.find((s) => profile && s.name === profile.nickname) ?? standings?.[3];

  return (
    <div className="p-3 sm:p-4 lg:p-5 space-y-3 max-w-[1400px] mx-auto">
      {/* Greeting */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tighter leading-none">Главная</h1>
        <p className="text-muted-foreground text-xs mt-0.5">
          {role === "player" || role === "admin"
            ? <>Добро пожаловать, <span className="text-primary font-mono">{profile?.nickname}</span>!</>
            : "Подтвердите аккаунт чтобы играть."}
        </p>
      </motion.div>

      {/* Top row: Next match + Rating */}
      <div className="grid lg:grid-cols-3 gap-3">
        {/* Next match card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="lg:col-span-2 rounded-2xl border border-border bg-card p-4 relative overflow-hidden"
        >
          <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-primary/5 blur-3xl" />
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-mono text-muted-foreground tracking-wider">СЛЕДУЮЩИЙ МАТЧ</div>
            <button className="p-1 rounded-md hover:bg-secondary"><MoreHorizontal className="w-4 h-4 text-muted-foreground" /></button>
          </div>

          {nextMatch ? (
            <>
              <div className="flex items-center justify-center mb-2">
                <span className="px-2.5 py-0.5 rounded-full bg-primary/15 text-primary text-[9px] font-mono font-bold tracking-wider border border-primary/30">RANKED MATCH</span>
              </div>
              <div className="grid grid-cols-3 gap-3 items-center">
                <TeamBlock tag={nextMatch.team_a_tag} name={nextMatch.team_a_name} side="left" />
                <div className="text-center">
                  <div className="text-2xl sm:text-3xl font-extrabold tracking-tighter mb-1.5 text-gradient">VS</div>
                  <div className="space-y-0.5 text-[10px]">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      {new Date(nextMatch.scheduled_at).toLocaleDateString("ru", { day: "numeric", month: "short" })}
                    </div>
                    <div className="flex items-center justify-center gap-1 text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {new Date(nextMatch.scheduled_at).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })} (МСК)
                    </div>
                  </div>
                </div>
                <TeamBlock tag={nextMatch.team_b_tag} name={nextMatch.team_b_name} side="right" />
              </div>
              <div className="mt-3 text-center">
                {(role === "player" || role === "admin") ? (
                  <button className="w-full sm:w-auto sm:mx-auto sm:flex sm:px-8 py-2 rounded-full bg-primary text-primary-foreground font-bold hover:opacity-90 transition-opacity text-xs justify-center">
                    Подтвердить готовность
                  </button>
                ) : (
                  <Link to="/verify" className="block text-center w-full sm:w-auto sm:mx-auto sm:inline-block sm:px-8 py-2 rounded-full bg-primary text-primary-foreground font-bold hover:opacity-90 transition-opacity text-xs">
                    Готов к бою
                  </Link>
                )}
                <div className="text-center text-[10px] text-muted-foreground mt-1.5">
                  {formatDistanceToNow(new Date(nextMatch.scheduled_at), { addSuffix: true, locale: ru })}
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Загрузка...
            </div>
          )}
        </motion.div>

        {/* Rating card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-2xl border border-primary/30 bg-gradient-to-br from-card via-card to-primary/10 p-4 relative overflow-hidden"
        >
          <div className="text-[10px] font-mono text-muted-foreground tracking-wider mb-2">ВАШ РЕЙТИНГ</div>
          {(role === "player" || role === "admin") && profile ? (
            <Link to="/profile" className="flex flex-col items-center gap-1.5 mb-3 group">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-lg font-extrabold font-mono text-primary-foreground pop-shadow group-hover:scale-105 transition-transform">
                {profile.nickname?.slice(0, 2).toUpperCase() ?? "??"}
              </div>
              <div className="text-[9px] font-mono text-muted-foreground tracking-wider">ID · {profile.standoff_id}</div>
              <div className="text-base font-extrabold tracking-tight leading-none group-hover:text-primary transition-colors">{profile.nickname}</div>
            </Link>
          ) : (
            <div className="flex flex-col items-center gap-1.5 mb-3">
              <div className="w-14 h-14 rounded-2xl bg-secondary/60 border border-border flex items-center justify-center text-lg font-extrabold font-mono text-muted-foreground">??</div>
              <div className="text-[10px] text-muted-foreground">Гость</div>
            </div>
          )}
          {myStanding ? (
            <div className="space-y-1 text-xs">
              <Stat label="Рейтинг"      value={profile?.rating ?? 1000}  color="text-primary" icon={<Trophy className="w-3 h-3 text-primary" />} />
              <Stat label="Ранг"         value={`#${myStanding.rank}`}    color="text-primary" />
              <Stat label="Победы"       value={myStanding.w}             color="text-primary" />
              <Stat label="Поражения"    value={myStanding.l}             color="text-[oklch(0.7_0.18_25)]" />
              <Stat label="Винстрик"     value={myStanding.streak}        icon={<Flame className="w-3 h-3 text-primary" />} />
            </div>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-2">Нет данных</div>
          )}
          <Link to="/league" className="mt-3 flex items-center justify-center gap-1 w-full py-1.5 rounded-lg bg-secondary/60 hover:bg-secondary text-[11px] font-medium border border-border">
            Таблица рейтинга <ChevronRight className="w-3 h-3" />
          </Link>
        </motion.div>
      </div>

      {/* Quick actions */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="grid grid-cols-2 gap-2">
        <QuickAction icon={BookOpen} label="Правила лиги" to="/news" />
        <QuickAction icon={LifeBuoy} label="Поддержка"    to="/support" />
      </motion.div>

      {/* News + Recent matches */}
      <div className="grid lg:grid-cols-2 gap-3">
        {/* News */}
        <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-mono text-muted-foreground tracking-wider">ПОСЛЕДНИЕ НОВОСТИ</div>
            <Link to="/news" className="text-[10px] text-primary hover:underline font-mono">все →</Link>
          </div>
          <div className="space-y-2">
            {news?.map((n) => (
              <div key={n.id} className="flex gap-2 group cursor-pointer">
                <div className="w-9 h-9 rounded-lg bg-secondary/60 flex items-center justify-center text-base shrink-0 group-hover:scale-105 transition-transform">{n.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[9px] font-mono text-primary leading-none">{n.tag}</div>
                  <div className="text-xs font-bold truncate">{n.title}</div>
                  <div className="text-[10px] text-muted-foreground line-clamp-1">{n.excerpt}</div>
                </div>
              </div>
            )) ?? <p className="text-xs text-muted-foreground">Новостей пока нет.</p>}
          </div>
        </motion.div>

        {/* Recent matches */}
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
              const win = (r.score_a ?? 0) > (r.score_b ?? 0);
              return (
                <div key={r.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-secondary/40 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center text-[9px] font-mono font-bold">{a?.tag}</div>
                    <div className={`font-mono font-bold text-xs ${win ? "text-primary" : "text-[oklch(0.7_0.18_25)]"}`}>{r.score_a}:{r.score_b}</div>
                    <div className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center text-[9px] font-mono font-bold">{b?.tag}</div>
                  </div>
                  <div className="text-[9px] text-muted-foreground font-mono">
                    {formatDistanceToNow(new Date(r.scheduled_at), { addSuffix: true, locale: ru })}
                  </div>
                </div>
              );
            }) ?? <p className="text-xs text-muted-foreground">Матчей пока нет.</p>}
          </div>
        </motion.div>
      </div>

      {/* Standings table */}
      <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
        className="rounded-2xl border border-border bg-card p-4 overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-mono text-muted-foreground tracking-wider">ТУРНИРНАЯ ТАБЛИЦА</div>
          <Link to="/league" className="text-[10px] text-primary hover:underline font-mono">полная →</Link>
        </div>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-xs min-w-[520px]">
            <thead>
              <tr className="text-[9px] font-mono text-muted-foreground tracking-wider border-b border-border">
                <th className="text-left py-1.5 font-medium w-8">#</th>
                <th className="text-left py-1.5 font-medium">КОМАНДА</th>
                <th className="text-center py-1.5 font-medium">М</th>
                <th className="text-center py-1.5 font-medium">В</th>
                <th className="text-center py-1.5 font-medium">П</th>
                <th className="text-right py-1.5 font-medium">ОЧКИ</th>
              </tr>
            </thead>
            <tbody>
              {standings?.slice(0, 5).map((t) => (
                <tr key={t.tag} className="border-b border-border/40 last:border-0 hover:bg-secondary/30 transition-colors">
                  <td className="py-1.5">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold font-mono ${
                      t.rank === 1 ? "bg-primary text-primary-foreground" :
                      t.rank === 2 ? "bg-accent text-background" :
                      t.rank === 3 ? "bg-[oklch(0.7_0.15_55)] text-background" :
                      "bg-secondary text-muted-foreground"
                    }`}>{t.rank}</div>
                  </td>
                  <td className="py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center text-[9px] font-mono font-bold">{t.tag}</div>
                      <span className="font-medium text-xs">{t.name}</span>
                    </div>
                  </td>
                  <td className="text-center font-mono text-muted-foreground">{t.w + t.l}</td>
                  <td className="text-center font-mono">{t.w}</td>
                  <td className="text-center font-mono">{t.l}</td>
                  <td className="text-right font-mono font-bold text-primary">{t.pts}</td>
                </tr>
              )) ?? (
                <tr><td colSpan={6} className="text-center py-4 text-muted-foreground">Загрузка...</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      <footer className="text-center text-[10px] text-muted-foreground py-2">
        © 2026 Climby · made for gamers · не аффилирован с Axlebolt
      </footer>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────

function TeamBlock({ tag, name, side }: { tag: string; name: string; side: "left" | "right" }) {
  return (
    <div className={`flex flex-col items-center gap-1 ${side === "right" ? "items-center" : ""}`}>
      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-secondary to-card border border-border flex items-center justify-center text-xs font-extrabold font-mono pop-shadow">
        {tag}
      </div>
      <div className="text-center">
        <div className="font-bold text-xs">{name}</div>
      </div>
    </div>
  );
}

function Stat({ label, value, color, icon }: { label: string; value: number | string; color?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground text-[11px] flex items-center gap-1.5">{icon}{label}</span>
      <span className={`font-mono font-bold ${color ?? "text-foreground"}`}>{value}</span>
    </div>
  );
}

function QuickAction({ icon: Icon, label, to }: { icon: any; label: string; to: any }) {
  return (
    <Link to={to} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-card/80 transition-colors group">
      <div className="w-7 h-7 rounded-lg bg-secondary group-hover:bg-primary/15 flex items-center justify-center transition-colors">
        <Icon className="w-3.5 h-3.5 text-primary" />
      </div>
      <span className="font-medium text-xs flex-1">{label}</span>
      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
    </Link>
  );
}
