import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Crown, Crosshair, Zap, Heart, Trophy, TrendingUp,
  TrendingDown, Edit2, Check, X, Upload, Loader2,
  Calendar, Swords, ShieldCheck, Clock, ChevronRight
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

export const Route = createFileRoute("/profile/$userId")({
  head: () => ({ meta: [{ title: "Профиль — Climby" }] }),
  component: ProfilePage,
});

// Если без userId — свой профиль
export const SelfRoute = createFileRoute("/profile/")({
  head: () => ({ meta: [{ title: "Мой профиль — Climby" }] }),
  component: ProfilePage,
});

const ROLE_ICONS: Record<string, any> = {
  captain: Crown, sniper: Crosshair, entry: Zap, support: Heart,
};
const ROLE_LABELS: Record<string, string> = {
  captain: "Captain", sniper: "Sniper", entry: "Entry", support: "Support",
};

type Profile = {
  id: string;
  nickname: string | null;
  avatar_url: string | null;
  standoff_id: string | null;
  hours: number | null;
  rating: number;
  role: string;
  verified_at: string | null;
  telegram_nick: string | null;
};

type MatchHistory = {
  id: string;
  scheduled_at: string;
  score_a: number | null;
  score_b: number | null;
  status: string;
  team_a: { tag: string; name: string; id: string } | null;
  team_b: { tag: string; name: string; id: string } | null;
  my_team_id?: string;
};

// ─── Page ────────────────────────────────────────────────────

function ProfilePage() {
  const { profile: myProfile, role: myRole } = useAuth();
  const params = Route.useParams?.() ?? {};
  const targetId = (params as any).userId ?? myProfile?.id;
  const isOwnProfile = targetId === myProfile?.id;

  const [profile,  setProfile]  = useState<Profile | null>(null);
  const [team,     setTeam]     = useState<any>(null);
  const [history,  setHistory]  = useState<MatchHistory[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(false);

  useEffect(() => {
    if (targetId) loadProfile(targetId);
  }, [targetId]);

  async function loadProfile(uid: string) {
    setLoading(true);
    const [{ data: p }, { data: tm }] = await Promise.all([
      supabase.from("users").select("*").eq("id", uid).single(),
      supabase.from("team_members")
        .select("role, team:teams(id, tag, name, logo_url, wins, losses, pts)")
        .eq("user_id", uid)
        .single(),
    ]);

    setProfile(p ?? null);
    setTeam(tm?.team ?? null);

    // История матчей
    if (tm?.team) {
      const { data: matches } = await supabase
        .from("matches")
        .select(`
          id, scheduled_at, score_a, score_b, status,
          team_a:teams!matches_team_a_id_fkey(id, tag, name),
          team_b:teams!matches_team_b_id_fkey(id, tag, name)
        `)
        .or(`team_a_id.eq.${(tm.team as any).id},team_b_id.eq.${(tm.team as any).id}`)
        .eq("status", "done")
        .order("scheduled_at", { ascending: false })
        .limit(10);

      setHistory((matches ?? []).map(m => ({ ...m, my_team_id: (tm.team as any).id })) as any);
    }
    setLoading(false);
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Загрузка...
    </div>
  );

  if (!profile) return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground">Профиль не найден</p>
      </div>
    </div>
  );

  // Считаем W/L
  const wins   = history.filter(m => {
    const iAmA = m.team_a?.id === m.my_team_id;
    return iAmA ? (m.score_a ?? 0) > (m.score_b ?? 0) : (m.score_b ?? 0) > (m.score_a ?? 0);
  }).length;
  const losses = history.length - wins;
  const winrate = history.length > 0 ? Math.round((wins / history.length) * 100) : 0;

  return (
    <div className="p-3 sm:p-4 lg:p-5 space-y-3 max-w-3xl mx-auto">

      {/* ── Header карточка ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border bg-card overflow-hidden">

        {/* Banner */}
        <div className="h-24 bg-gradient-to-br from-primary/30 via-accent/20 to-background relative">
          <div className="absolute inset-0 opacity-20"
            style={{ backgroundImage: "radial-gradient(circle at 20% 50%, var(--primary) 0%, transparent 50%), radial-gradient(circle at 80% 20%, var(--accent) 0%, transparent 50%)" }} />
        </div>

        <div className="px-5 pb-5">
          <div className="flex items-end justify-between -mt-10 mb-4">
            {/* Avatar */}
            <div className="relative">
              <AvatarBlock
                profile={profile}
                isOwnProfile={isOwnProfile}
                onUpdate={() => loadProfile(targetId)}
              />
              {profile.role === "player" || profile.role === "admin" ? (
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center border-2 border-card">
                  <ShieldCheck className="w-3 h-3 text-primary-foreground" />
                </div>
              ) : null}
            </div>

            {/* Edit button */}
            {isOwnProfile && (
              <button onClick={() => setEditing(!editing)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-secondary hover:bg-secondary/70 text-xs font-medium transition-colors">
                <Edit2 className="w-3.5 h-3.5" />
                {editing ? "Отмена" : "Редактировать"}
              </button>
            )}
          </div>

          {/* Nickname + info */}
          {editing && isOwnProfile ? (
            <EditNicknameForm
              profile={profile}
              onSave={() => { setEditing(false); loadProfile(targetId); }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-extrabold tracking-tighter leading-none">
                  {profile.nickname ?? "Без ника"}
                </h1>
                {profile.role === "admin" && (
                  <span className="px-2 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-[10px] font-mono text-primary font-bold">
                    ADMIN
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap text-[11px] font-mono text-muted-foreground">
                {profile.telegram_nick && <span>@{profile.telegram_nick}</span>}
                {profile.standoff_id   && <span>ID: {profile.standoff_id}</span>}
                {profile.hours         && <span>{profile.hours}ч в игре</span>}
                {profile.verified_at   && (
                  <span className="text-primary flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Verified
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Статы ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Рейтинг",  value: profile.rating ?? 1000, color: "text-primary", big: true },
          { label: "Winrate",  value: `${winrate}%`,           color: winrate >= 50 ? "text-primary" : "text-[oklch(0.7_0.18_25)]" },
          { label: "Победы",   value: wins,                    color: "text-primary" },
          { label: "Поражения",value: losses,                  color: "text-[oklch(0.7_0.18_25)]" },
        ].map((s, i) => (
          <motion.div key={s.label}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="rounded-2xl border border-border bg-card p-4 text-center">
            <div className={`text-2xl font-extrabold font-mono leading-none ${s.color}`}>
              {s.value}
            </div>
            <div className="text-[10px] font-mono text-muted-foreground mt-1">{s.label}</div>
          </motion.div>
        ))}
      </div>

      {/* ── Команда ── */}
      {team && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Link to="/teams"
            className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-card hover:border-primary/30 transition-colors group">
            <div className="w-12 h-12 rounded-xl border border-border bg-secondary flex items-center justify-center overflow-hidden shrink-0">
              {team.logo_url
                ? <img src={team.logo_url} className="w-full h-full object-cover" alt={team.tag} />
                : <span className="text-sm font-extrabold font-mono">{team.tag}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-mono text-muted-foreground tracking-wider">КОМАНДА</div>
              <div className="font-bold truncate">{team.name}</div>
              <div className="text-[10px] font-mono text-muted-foreground">
                {team.wins}В {team.losses}П · {team.pts} PTS
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </Link>
        </motion.div>
      )}

      {/* ── История матчей ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-mono text-muted-foreground tracking-wider">
            ИСТОРИЯ МАТЧЕЙ · {history.length}
          </div>
          <Swords className="w-3.5 h-3.5 text-muted-foreground" />
        </div>

        {history.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-6">
            Матчей пока нет
          </div>
        ) : (
          <div className="space-y-1.5">
            {history.map((m, i) => {
              const iAmA  = m.team_a?.id === m.my_team_id;
              const myScore   = iAmA ? (m.score_a ?? 0) : (m.score_b ?? 0);
              const theirScore = iAmA ? (m.score_b ?? 0) : (m.score_a ?? 0);
              const won   = myScore > theirScore;
              const loserScore = Math.min(myScore, theirScore);
              const delta = won
                ? "+10"
                : loserScore >= 11 ? "-5" : loserScore >= 8 ? "-6" : "-7";
              const opp   = iAmA ? m.team_b : m.team_a;

              return (
                <motion.div key={m.id}
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                    won
                      ? "border-primary/20 bg-primary/5 hover:bg-primary/8"
                      : "border-border bg-secondary/20 hover:bg-secondary/40"
                  }`}>

                  {/* Win/Loss indicator */}
                  <div className={`w-1.5 h-8 rounded-full shrink-0 ${won ? "bg-primary" : "bg-[oklch(0.7_0.18_25)]"}`} />

                  {/* Score */}
                  <div className="text-center shrink-0">
                    <div className="font-mono font-extrabold text-sm leading-none">
                      {myScore}:{theirScore}
                    </div>
                    <div className={`text-[9px] font-mono ${won ? "text-primary" : "text-[oklch(0.7_0.18_25)]"}`}>
                      {won ? "WIN" : "LOSS"}
                    </div>
                  </div>

                  {/* Opponent */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold truncate">
                      vs {opp?.name ?? opp?.tag ?? "—"}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {formatDistanceToNow(new Date(m.scheduled_at), { addSuffix: true, locale: ru })}
                    </div>
                  </div>

                  {/* Rating delta */}
                  <div className={`font-mono font-bold text-sm shrink-0 ${won ? "text-primary" : "text-[oklch(0.7_0.18_25)]"}`}>
                    {delta}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ─── Avatar Block ─────────────────────────────────────────────

function AvatarBlock({ profile, isOwnProfile, onUpdate }: {
  profile: Profile;
  isOwnProfile: boolean;
  onUpdate: () => void;
}) {
  const fileRef   = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { toast.error("Максимум 3MB"); return; }

    setUploading(true);
    const ext  = file.name.split(".").pop();
    const path = `avatars/${profile.id}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("avatars").upload(path, file, { upsert: true });

    if (upErr) { toast.error("Ошибка загрузки"); setUploading(false); return; }

    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);

    await supabase.from("users").update({ avatar_url: publicUrl }).eq("id", profile.id);
    toast.success("Аватар обновлён!");
    onUpdate();
    setUploading(false);
  }

  return (
    <div className="relative group">
      <div className="w-20 h-20 rounded-2xl border-4 border-card bg-gradient-to-br from-primary to-accent overflow-hidden">
        {profile.avatar_url
          ? <img src={profile.avatar_url} className="w-full h-full object-cover" alt={profile.nickname ?? ""} />
          : <div className="w-full h-full flex items-center justify-center text-2xl font-extrabold font-mono text-primary-foreground">
              {profile.nickname?.slice(0, 2).toUpperCase() ?? "??"}
            </div>
        }
        {uploading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-white" />
          </div>
        )}
      </div>
      {isOwnProfile && (
        <>
          <button onClick={() => fileRef.current?.click()}
            className="absolute inset-0 rounded-2xl bg-black/0 group-hover:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
            <Upload className="w-5 h-5 text-white" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
        </>
      )}
    </div>
  );
}

// ─── Edit Nickname Form ───────────────────────────────────────

function EditNicknameForm({ profile, onSave, onCancel }: {
  profile: Profile;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [nickname, setNickname] = useState(profile.nickname ?? "");
  const [saving,   setSaving]   = useState(false);

  async function save() {
    if (nickname.trim().length < 2) { toast.error("Минимум 2 символа"); return; }
    if (nickname.trim().length > 32) { toast.error("Максимум 32 символа"); return; }
    setSaving(true);

    // Проверяем уникальность
    const { data: existing } = await supabase
      .from("users").select("id").eq("nickname", nickname.trim()).neq("id", profile.id).single();

    if (existing) { toast.error("Этот ник уже занят"); setSaving(false); return; }

    const { error } = await supabase
      .from("users").update({ nickname: nickname.trim() }).eq("id", profile.id);

    if (error) toast.error(error.message);
    else { toast.success("Ник обновлён!"); onSave(); }
    setSaving(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          onKeyDown={e => e.key === "Enter" && save()}
          maxLength={32}
          placeholder="Твой ник"
          className="flex-1 px-3 py-2 rounded-xl bg-secondary border border-border text-sm font-bold focus:outline-none focus:border-primary/60 transition-colors"
        />
        <button onClick={save} disabled={saving}
          className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        </button>
        <button onClick={onCancel}
          className="w-9 h-9 rounded-xl bg-secondary border border-border flex items-center justify-center hover:bg-secondary/70 transition-colors shrink-0">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Ник должен быть уникальным · {nickname.length}/32
      </p>
    </div>
  );
}
