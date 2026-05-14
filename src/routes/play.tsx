import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Swords, MessageCircle, Send, Shield, CheckCircle2,
  Clock, MapPin, Users, Loader2, Crown, ChevronRight
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useMyTeam, useUpcomingMatches } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { ConfirmationPanel } from "@/components/ConfirmationPanel";
import { ResultPanel } from "@/components/ResultPanel";

export const Route = createFileRoute("/play")({
  head: () => ({
    meta: [{ title: "Play — Climby" }],
  }),
  component: PlayPage,
});

// Карты Standoff 2
const MAP_IMAGES: Record<string, string> = {
  Sandstone:  "🏜️",
  Province:   "🏘️",
  Crater:     "🌋",
  Library:    "📚",
  Agency:     "🏢",
  Crossroads: "🛣️",
};

function PlayPage() {
  const { role, profile } = useAuth();
  const { data: myTeamData, isLoading: teamLoading } = useMyTeam();
  const { data: upcoming } = useUpcomingMatches();

  if (role === "guest") {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="rounded-2xl border border-border bg-card p-8 text-center max-w-sm w-full">
          <Shield className="w-12 h-12 mx-auto text-primary mb-3" />
          <h1 className="text-xl font-extrabold mb-1">Нужна верификация</h1>
          <p className="text-sm text-muted-foreground mb-4">Только верифицированные игроки могут участвовать в матчах.</p>
          <a href="/verify" className="inline-block px-6 py-2 rounded-full bg-primary text-primary-foreground font-bold text-sm">
            Верифицироваться
          </a>
        </div>
      </div>
    );
  }

  if (teamLoading) return <Loader />;
  if (!myTeamData) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="rounded-2xl border border-border bg-card p-8 text-center max-w-sm w-full">
          <Users className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <h1 className="text-xl font-extrabold mb-1">Ты не в команде</h1>
          <p className="text-sm text-muted-foreground">Сначала вступи или создай команду.</p>
        </div>
      </div>
    );
  }

  const { team, myRole } = myTeamData;

  // Текущий матч команды
  const activeMatch = upcoming?.find(
    (m) => m.team_a_tag === team.tag || m.team_b_tag === team.tag
  );

  return (
    <div className="p-3 sm:p-4 lg:p-5 space-y-3 max-w-5xl mx-auto">
      <div className="mb-4">
        <div className="text-[10px] font-mono text-primary mb-1">// PLAY</div>
        <h1 className="text-3xl font-extrabold tracking-tighter">Матчи</h1>
      </div>

      {activeMatch ? (
        <MatchRoom
          match={activeMatch}
          team={team}
          myRole={myRole}
          userId={profile?.id ?? ""}
        />
      ) : (
        <NoMatch teamTag={team.tag} />
      )}
    </div>
  );
}

// ─── Нет матча ───────────────────────────────────────────────

function NoMatch({ teamTag }: { teamTag: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card p-10 text-center">
      <Swords className="w-12 h-12 mx-auto text-muted-foreground mb-3 opacity-40" />
      <h2 className="text-lg font-extrabold mb-1">Матчей пока нет</h2>
      <p className="text-sm text-muted-foreground">
        Администратор назначит тебе соперника и откроет окно для игры.<br />
        Следи за уведомлениями.
      </p>
      <div className="mt-4 inline-block px-3 py-1 rounded-full bg-secondary font-mono text-[10px] text-muted-foreground border border-border">
        {teamTag}
      </div>
    </motion.div>
  );
}

// ─── Комната матча ───────────────────────────────────────────

function MatchRoom({ match, team, myRole, userId }: {
  match: any;
  team: any;
  myRole: string;
  userId: string;
}) {
  const [tab, setTab] = useState<"info" | "ready" | "banpick" | "chat" | "result">("info");
  const [banpick, setBanpick] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [maps, setMaps] = useState<any[]>([]);
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  const isCaptain  = myRole === "captain";
  const isTeamA    = match.team_a_tag === team.tag;
  const myTurn     = banpick?.turn === (isTeamA ? "a" : "b");

  // Загружаем банпик
  useEffect(() => {
    supabase.from("banpick_sessions")
      .select("*, ban_a_map:maps!ban_a(name), ban_b_map:maps!ban_b(name), final:maps!final_map(name)")
      .eq("match_id", match.id)
      .single()
      .then(({ data }) => { if (data) setBanpick(data); });

    // Загружаем все карты для отображения пула
    supabase.from("maps").select("*").eq("active", true)
      .then(({ data }) => { if (data) setMaps(data); });
  }, [match.id]);

  // Загружаем сообщения
  useEffect(() => {
    supabase.from("match_messages")
      .select("*, sender:users(nickname)")
      .eq("match_id", match.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => { if (data) setMessages(data); });

    // Realtime подписка
    const channel = supabase.channel(`match-chat-${match.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "match_messages",
        filter: `match_id=eq.${match.id}`,
      }, (payload) => {
        setMessages((prev) => [...prev, payload.new]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [match.id]);

  // Скролл вниз при новом сообщении
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Бан карты
  async function handleBan(mapId: number) {
    if (!isCaptain || !myTurn) return;
    const { error } = await supabase.rpc("do_ban", {
      p_match_id: match.id,
      p_team_id:  team.id,
      p_map_id:   mapId,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Карта забанена!");
      // Обновляем банпик
      const { data } = await supabase.from("banpick_sessions")
        .select("*").eq("match_id", match.id).single();
      if (data) setBanpick(data);
    }
  }

  // Отправка сообщения
  async function sendMessage() {
    if (!msgText.trim() || !isCaptain) return;
    setSending(true);
    const { error } = await supabase.from("match_messages").insert({
      match_id:  match.id,
      sender_id: userId,
      body:      msgText.trim(),
    });
    if (error) toast.error(error.message);
    else setMsgText("");
    setSending(false);
  }

  const poolMaps = maps.filter((m) => banpick?.map_pool?.includes(m.id));

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">

      {/* Match header */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-mono text-muted-foreground tracking-wider">ТЕКУЩИЙ МАТЧ</span>
          <StatusBadge status={match.status} />
        </div>
        <div className="flex items-center justify-center gap-6 py-3">
          <TeamChip tag={match.team_a_tag} name={match.team_a_name} confirmed={match.team_a_confirmed} />
          <span className="text-2xl font-extrabold font-mono text-muted-foreground">VS</span>
          <TeamChip tag={match.team_b_tag} name={match.team_b_name} confirmed={match.team_b_confirmed} />
        </div>
        {match.window_start && (
          <div className="flex items-center justify-center gap-1.5 text-[11px] font-mono text-muted-foreground mt-1">
            <Clock className="w-3 h-3" />
            Сыграть до: {new Date(match.window_end ?? match.window_start).toLocaleString("ru", {
              day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
            })}
          </div>
        )}
        {banpick?.turn === "done" && banpick.final_map && (
          <div className="flex items-center justify-center gap-1.5 text-[11px] font-mono text-primary mt-2">
            <MapPin className="w-3 h-3" />
            Карта: {maps.find((m) => m.id === banpick.final_map)?.name ?? "—"}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 p-1.5 rounded-2xl bg-card border border-border w-fit overflow-x-auto">
        {(["info", "ready", "banpick", "chat", "result"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}>
            {t === "info"    ? "Инфо" :
             t === "ready"   ? <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />Готовность</span> :
             t === "banpick" ? "Банпик" :
             t === "result"  ? "🏆 Результат" : (
              <span className="flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5" />
                Чат
                {messages.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-primary/20 text-primary text-[9px] font-bold flex items-center justify-center">
                    {messages.length > 9 ? "9+" : messages.length}
                  </span>
                )}
              </span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

          {/* RESULT TAB */}
          {tab === "result" && (
            <ResultPanel
              matchId={match.id}
              teamAId={match.team_a_id ?? ""}
              teamBId={match.team_b_id ?? ""}
              teamATag={match.team_a_tag}
              teamBTag={match.team_b_tag}
              myTeamId={team.id}
              userId={userId}
              isCaptain={isCaptain}
              onDone={() => setTab("info")}
            />
          )}

          {/* READY TAB */}
          {tab === "ready" && (
            <ConfirmationPanel
              matchId={match.id}
              teamAId={match.team_a_id ?? ""}
              teamBId={match.team_b_id ?? ""}
              teamATag={match.team_a_tag}
              teamBTag={match.team_b_tag}
              myTeamId={team.id}
              userId={userId}
              scheduledAt={match.scheduled_at}
            />
          )}

          {/* INFO TAB */}
          {tab === "info" && (
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="text-[10px] font-mono text-muted-foreground tracking-wider">КАК ИГРАТЬ</div>
              <Step n={1} done={true}         label="Матч назначен администратором" />
              <Step n={2} done={banpick?.turn !== undefined} label="Пройти банпик карты (в вкладке Банпик)" />
              <Step n={3} done={banpick?.turn === "done"}    label="Договориться о времени в чате" />
              <Step n={4} done={match.status === "done"}     label="Сыграть и сообщить результат" />

              {!isCaptain && (
                <div className="rounded-xl bg-secondary/50 border border-border p-3 text-[11px] text-muted-foreground text-center">
                  Только капитан может банить карты и писать в чат матча.
                </div>
              )}
            </div>
          )}

          {/* BANPICK TAB */}
          {tab === "banpick" && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="text-[10px] font-mono text-muted-foreground tracking-wider mb-4">БАНПИК КАРТЫ</div>

              {banpick?.turn === "done" ? (
                <div className="text-center py-6">
                  <div className="text-4xl mb-2">{MAP_IMAGES[maps.find((m) => m.id === banpick.final_map)?.name ?? ""] ?? "🗺️"}</div>
                  <div className="text-xl font-extrabold">
                    {maps.find((m) => m.id === banpick.final_map)?.name ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Финальная карта</div>
                  <div className="flex items-center justify-center gap-4 mt-4 text-[11px] font-mono text-muted-foreground">
                    <span className="text-[oklch(0.7_0.18_25)]">
                      {match.team_a_tag} забанил: {maps.find((m) => m.id === banpick.ban_a)?.name ?? "—"}
                    </span>
                    <span className="text-[oklch(0.7_0.18_25)]">
                      {match.team_b_tag} забанил: {maps.find((m) => m.id === banpick.ban_b)?.name ?? "—"}
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  {/* Turn indicator */}
                  <div className={`rounded-xl p-3 text-center text-sm font-bold mb-4 ${
                    myTurn && isCaptain
                      ? "bg-primary/15 border border-primary/30 text-primary"
                      : "bg-secondary border border-border text-muted-foreground"
                  }`}>
                    {myTurn && isCaptain
                      ? "🎯 Твоя очередь банить"
                      : banpick?.turn === "a"
                        ? `Ждём бан от ${match.team_a_tag}...`
                        : `Ждём бан от ${match.team_b_tag}...`}
                  </div>

                  {/* Map pool */}
                  <div className="grid grid-cols-3 gap-3">
                    {poolMaps.map((m) => {
                      const banned = m.id === banpick?.ban_a || m.id === banpick?.ban_b;
                      const canBan  = isCaptain && myTurn && !banned && banpick?.turn !== "done";
                      return (
                        <button key={m.id}
                          onClick={() => canBan && handleBan(m.id)}
                          disabled={!canBan}
                          className={`rounded-xl border p-4 text-center transition-all ${
                            banned
                              ? "opacity-30 border-border bg-secondary cursor-not-allowed line-through"
                              : canBan
                                ? "border-primary/40 bg-primary/5 hover:bg-primary/15 hover:scale-105 cursor-pointer"
                                : "border-border bg-secondary/40 cursor-default"
                          }`}>
                          <div className="text-3xl mb-1">{MAP_IMAGES[m.name] ?? "🗺️"}</div>
                          <div className="text-xs font-bold">{m.name}</div>
                          {banned && <div className="text-[9px] text-[oklch(0.7_0.18_25)] font-mono mt-0.5">БАН</div>}
                          {canBan  && <div className="text-[9px] text-primary font-mono mt-0.5">БАНИТЬ</div>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* CHAT TAB */}
          {tab === "chat" && (
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="p-4 border-b border-border">
                <div className="text-[10px] font-mono text-muted-foreground tracking-wider">
                  ЧАТ МАТЧА · {match.team_a_tag} vs {match.team_b_tag}
                </div>
                {!isCaptain && (
                  <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                    <Crown className="w-3 h-3" />
                    Писать могут только капитаны
                  </div>
                )}
              </div>

              {/* Messages */}
              <div ref={chatRef} className="h-72 overflow-y-auto p-4 space-y-2 scroll-smooth">
                {messages.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    Сообщений пока нет. Напиши сопернику, договоритесь о времени!
                  </div>
                )}
                {messages.map((msg) => {
                  const isMe = msg.sender_id === userId;
                  return (
                    <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${
                        isMe
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-secondary border border-border rounded-bl-sm"
                      }`}>
                        {!isMe && (
                          <div className="text-[9px] font-mono opacity-60 mb-0.5">
                            {msg.sender?.nickname ?? "—"}
                          </div>
                        )}
                        <div className="text-sm">{msg.body}</div>
                        <div className={`text-[9px] mt-0.5 ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                          {new Date(msg.created_at).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Input */}
              {isCaptain && (
                <div className="p-3 border-t border-border flex gap-2">
                  <input
                    value={msgText}
                    onChange={(e) => setMsgText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                    placeholder="Напиши сопернику..."
                    maxLength={1000}
                    className="flex-1 px-3 py-2 rounded-xl bg-secondary border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!msgText.trim() || sending}
                    className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-40 transition-opacity shrink-0"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────

function TeamChip({ tag, name, confirmed }: { tag: string; name: string; confirmed: boolean }) {
  return (
    <div className="text-center">
      <div className="w-12 h-12 rounded-xl bg-secondary border border-border flex items-center justify-center text-xs font-extrabold font-mono mx-auto mb-1">
        {tag}
      </div>
      <div className="text-xs font-bold">{name}</div>
      <div className={`text-[9px] font-mono ${confirmed ? "text-primary" : "text-muted-foreground"}`}>
        {confirmed ? "✓ готов" : "? ожидает"}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    scheduled: { label: "Запланирован", cls: "bg-secondary text-muted-foreground border-border" },
    live:      { label: "🔴 LIVE",       cls: "bg-red-500/15 text-red-500 border-red-500/30" },
    done:      { label: "Завершён",      cls: "bg-primary/15 text-primary border-primary/30" },
  };
  const s = map[status] ?? map.scheduled;
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${s.cls}`}>
      {s.label}
    </span>
  );
}

function Step({ n, done, label }: { n: number; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
        done ? "bg-primary text-primary-foreground" : "bg-secondary border border-border text-muted-foreground"
      }`}>
        {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : n}
      </div>
      <span className={`text-sm ${done ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
    </div>
  );
}

function Loader() {
  return (
    <div className="flex items-center justify-center min-h-screen text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin mr-2" />
      Загрузка...
    </div>
  );
}
