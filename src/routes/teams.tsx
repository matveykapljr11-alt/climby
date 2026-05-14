import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Upload, Copy, Check, Crown, User,
  UserPlus, Trash2, Shield, Loader2, X,
  ChevronRight, Users, Link2, AtSign
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useMyTeam, useActiveSeason, useCreateTeam } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

export const Route = createFileRoute("/teams")({
  head: () => ({ meta: [{ title: "Команды — Climby" }] }),
  component: TeamsPage,
});

const MAX_PLAYERS = 7;
const MIN_PLAYERS = 1;

const createSchema = z.object({
  name: z.string().min(3, "Минимум 3 символа").max(32, "Максимум 32 символа"),
  tag:  z.string()
    .min(2, "Минимум 2 символа").max(5, "Максимум 5 символов")
    .regex(/^[A-Z0-9]+$/, "Только заглавные латинские буквы и цифры"),
});
type CreateForm = z.infer<typeof createSchema>;

// ─── Page ────────────────────────────────────────────────────

function TeamsPage() {
  const { role, profile } = useAuth();
  const { data: myTeamData, isLoading } = useMyTeam();
  const { data: season } = useActiveSeason();

  if (role === "guest") return <NeedVerify />;
  if (isLoading) return <Loader />;

  // Нет команды — экран создания/поиска
  if (!myTeamData) {
    return <NoTeamScreen seasonId={season?.id} />;
  }

  // Есть команда — управление
  return <TeamManagement teamData={myTeamData} profile={profile} />;
}

// ─── No Team Screen ──────────────────────────────────────────

function NoTeamScreen({ seasonId }: { seasonId?: number }) {
  const [view, setView] = useState<"choice" | "create" | "join">("choice");

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <AnimatePresence mode="wait">

        {view === "choice" && (
          <motion.div key="choice"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
            className="w-full max-w-sm space-y-3">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center mx-auto mb-3">
                <Users className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-2xl font-extrabold tracking-tighter">Ты не в команде</h1>
              <p className="text-sm text-muted-foreground mt-1">Создай свою или вступи по ссылке</p>
            </div>

            <button onClick={() => setView("create")}
              className="w-full flex items-center gap-3 p-4 rounded-2xl border border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors group">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <Plus className="w-5 h-5 text-primary" />
              </div>
              <div className="text-left">
                <div className="font-bold">Создать команду</div>
                <div className="text-xs text-muted-foreground">Ты станешь капитаном</div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
            </button>

            <button onClick={() => setView("join")}
              className="w-full flex items-center gap-3 p-4 rounded-2xl border border-border bg-card hover:border-primary/30 transition-colors group">
              <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <Link2 className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="text-left">
                <div className="font-bold">Вступить по ссылке</div>
                <div className="text-xs text-muted-foreground">Введи invite-код от капитана</div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
            </button>
          </motion.div>
        )}

        {view === "create" && (
          <CreateTeamForm key="create" seasonId={seasonId} onBack={() => setView("choice")} />
        )}

        {view === "join" && (
          <JoinByInvite key="join" onBack={() => setView("choice")} />
        )}

      </AnimatePresence>
    </div>
  );
}

// ─── Create Team Form ────────────────────────────────────────

function CreateTeamForm({ seasonId, onBack }: { seasonId?: number; onBack: () => void }) {
  const createTeam  = useCreateTeam();
  const navigate    = useNavigate();
  const [logo, setLogo]   = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { profile } = useAuth();

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
  });

  const tagValue = watch("tag") ?? "";

  // Загрузка логотипа в Supabase Storage
  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Максимум 2MB"); return; }

    setUploading(true);
    const ext  = file.name.split(".").pop();
    const path = `logos/${profile.id}-${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from("team-logos").upload(path, file, { upsert: true });
    if (error) { toast.error("Ошибка загрузки"); setUploading(false); return; }

    const { data: { publicUrl } } = supabase.storage.from("team-logos").getPublicUrl(path);
    setLogo(publicUrl);
    setUploading(false);
    toast.success("Логотип загружен!");
  }

  async function onSubmit(data: CreateForm) {
    if (!seasonId) { toast.error("Нет активного сезона"); return; }
    try {
      await createTeam.mutateAsync({ tag: data.tag, name: data.name, seasonId, logo });
      toast.success("Команда создана! Ты капитан 🎉");
      navigate({ to: "/teams" });
    } catch (err: any) {
      toast.error(err.message ?? "Ошибка создания команды");
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
      className="w-full max-w-md">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
        ← Назад
      </button>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-xl font-extrabold tracking-tighter mb-5">Создать команду</h2>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

          {/* Logo upload */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Логотип команды</label>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => fileRef.current?.click()}
                className="w-16 h-16 rounded-2xl border-2 border-dashed border-border bg-secondary/40 hover:border-primary/40 hover:bg-primary/5 transition-colors flex items-center justify-center overflow-hidden shrink-0">
                {uploading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                ) : logo ? (
                  <img src={logo} className="w-full h-full object-cover" alt="logo" />
                ) : (
                  <Upload className="w-5 h-5 text-muted-foreground" />
                )}
              </button>
              <div>
                <div className="text-sm font-medium">
                  {logo ? "Логотип загружен" : "Загрузить логотип"}
                </div>
                <div className="text-[10px] text-muted-foreground">PNG, JPG · макс. 2MB</div>
                {logo && (
                  <button type="button" onClick={() => setLogo(null)}
                    className="text-[10px] text-red-500 hover:underline mt-0.5">
                    Удалить
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            </div>
          </div>

          {/* Team name */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Название команды</label>
            <input {...register("name")}
              placeholder="Например: Night Wolves"
              className="w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 transition-colors" />
            {errors.name && <p className="text-[11px] text-red-500 mt-1">{errors.name.message}</p>}
          </div>

          {/* Tag */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Тег команды</label>
            <div className="relative">
              <input
                {...register("tag")}
                onChange={e => setValue("tag", e.target.value.toUpperCase())}
                placeholder="NW"
                maxLength={5}
                className="w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 transition-colors pr-12"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-extrabold font-mono border ${
                  tagValue.length >= 2 ? "bg-primary/10 border-primary/30 text-primary" : "bg-secondary border-border text-muted-foreground"
                }`}>
                  {tagValue || "??"}
                </div>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">2–5 символов, только заглавные буквы и цифры</p>
            {errors.tag && <p className="text-[11px] text-red-500 mt-1">{errors.tag.message}</p>}
          </div>

          {/* Preview */}
          {(watch("name") || tagValue) && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
              className="rounded-xl bg-secondary/40 border border-border p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-[10px] font-extrabold font-mono text-primary-foreground overflow-hidden shrink-0">
                {logo ? <img src={logo} className="w-full h-full object-cover" alt="" /> : (tagValue || "??")}
              </div>
              <div>
                <div className="font-bold text-sm">{watch("name") || "Название команды"}</div>
                <div className="text-[10px] font-mono text-muted-foreground">[{tagValue || "TAG"}] · Капитан: {profile?.nickname}</div>
              </div>
            </motion.div>
          )}

          <button type="submit" disabled={isSubmitting || createTeam.isPending}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2">
            {(isSubmitting || createTeam.isPending)
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Создаём...</>
              : <><Crown className="w-4 h-4" /> Создать команду</>}
          </button>
        </form>
      </div>
    </motion.div>
  );
}

// ─── Join by Invite ──────────────────────────────────────────

function JoinByInvite({ onBack }: { onBack: () => void }) {
  const [code, setCode]     = useState("");
  const [loading, setLoading] = useState(false);
  const { profile }         = useAuth();
  const navigate            = useNavigate();

  async function handleJoin() {
    if (!code.trim() || !profile) return;
    setLoading(true);
    try {
      // Находим команду по invite_code
      const { data: team, error } = await supabase
        .from("teams")
        .select("id, name, tag, season_id")
        .eq("invite_code", code.trim())
        .single();

      if (error || !team) { toast.error("Команда не найдена. Проверь код."); setLoading(false); return; }

      // Проверяем количество игроков
      const { count } = await supabase
        .from("team_members")
        .select("*", { count: "exact", head: true })
        .eq("team_id", team.id);

      if ((count ?? 0) >= MAX_PLAYERS) {
        toast.error(`В команде уже ${MAX_PLAYERS} игроков — максимум`);
        setLoading(false);
        return;
      }

      // Вступаем
      const { error: joinErr } = await supabase.from("team_members").insert({
        team_id: team.id,
        user_id: profile.id,
        role:    "entry",
      });

      if (joinErr) { toast.error(joinErr.message); setLoading(false); return; }

      toast.success(`Добро пожаловать в ${team.name}! 🎉`);
      navigate({ to: "/teams" });
    } catch {
      toast.error("Что-то пошло не так");
    }
    setLoading(false);
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
      className="w-full max-w-sm">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
        ← Назад
      </button>
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-xl font-extrabold tracking-tighter mb-1">Вступить в команду</h2>
        <p className="text-sm text-muted-foreground mb-5">Попроси капитана прислать invite-ссылку или код</p>

        <div className="space-y-3">
          <input
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="Вставь invite-код..."
            className="w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
          />
          <button onClick={handleJoin} disabled={!code.trim() || loading}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Вступить
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Team Management ─────────────────────────────────────────

function TeamManagement({ teamData, profile }: { teamData: any; profile: any }) {
  const { team, myRole } = teamData;
  const isCaptain = myRole === "captain";
  const members   = (team as any).members ?? [];
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(team.invite_code ?? null);
  const [inviteMode, setInviteMode] = useState<"link" | "username">("link");
  const [usernameInput, setUsernameInput] = useState("");
  const [inviting, setInviting] = useState(false);

  // Генерация/получение invite кода
  async function getInviteCode() {
    setInviteLoading(true);
    let code = inviteCode;
    if (!code) {
      // Генерируем новый
      code = Math.random().toString(36).slice(2, 10).toUpperCase();
      await supabase.from("teams").update({ invite_code: code }).eq("id", team.id);
      setInviteCode(code);
    }
    const link = `${window.location.origin}/teams?invite=${code}`;
    await navigator.clipboard.writeText(link);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
    setInviteLoading(false);
    toast.success("Ссылка скопирована!");
  }

  // Пригласить по username
  async function inviteByUsername() {
    if (!usernameInput.trim()) return;
    setInviting(true);

    const nick = usernameInput.replace(/^@/, "").trim();
    const { data: user, error } = await supabase
      .from("users")
      .select("id, nickname, role")
      .eq("nickname", nick)
      .single();

    if (error || !user) { toast.error("Игрок не найден"); setInviting(false); return; }
    if (user.role !== "player") { toast.error("Игрок не верифицирован"); setInviting(false); return; }
    if (members.length >= MAX_PLAYERS) { toast.error(`Максимум ${MAX_PLAYERS} игроков`); setInviting(false); return; }

    const { error: joinErr } = await supabase.from("team_members").insert({
      team_id: team.id, user_id: user.id, role: "entry",
    });

    if (joinErr) toast.error(joinErr.message);
    else { toast.success(`${user.nickname} добавлен в команду!`); setUsernameInput(""); }
    setInviting(false);
  }

  // Кик игрока
  async function kickPlayer(userId: string, nickname: string) {
    if (!confirm(`Исключить ${nickname} из команды?`)) return;
    const { error } = await supabase.from("team_members")
      .delete().eq("team_id", team.id).eq("user_id", userId);
    if (error) toast.error(error.message);
    else toast.success(`${nickname} исключён`);
  }

  // Передать капитанство
  async function makeCaption(userId: string, nickname: string) {
    if (!confirm(`Передать капитанство ${nickname}?`)) return;
    await supabase.from("team_members").update({ role: "captain" }).eq("team_id", team.id).eq("user_id", userId);
    await supabase.from("team_members").update({ role: "entry" }).eq("team_id", team.id).eq("user_id", profile.id);
    await supabase.from("teams").update({ captain_id: userId }).eq("id", team.id);
    toast.success(`${nickname} теперь капитан`);
  }

  return (
    <div className="p-3 sm:p-4 lg:p-5 space-y-3 max-w-3xl mx-auto">

      {/* Team header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border bg-card p-5 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-primary/8 blur-3xl" />
        <div className="flex items-center gap-4 relative">
          {/* Logo */}
          <div className="w-16 h-16 rounded-2xl border border-border overflow-hidden shrink-0 bg-gradient-to-br from-secondary to-card flex items-center justify-center">
            {team.logo_url
              ? <img src={team.logo_url} className="w-full h-full object-cover" alt={team.tag} />
              : <span className="text-lg font-extrabold font-mono">{team.tag}</span>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono text-muted-foreground tracking-wider">МОЯ КОМАНДА</div>
            <h1 className="text-2xl font-extrabold tracking-tighter">{team.name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="px-2 py-0.5 rounded-md bg-secondary border border-border text-[10px] font-mono">[{team.tag}]</span>
              <span className="text-[10px] font-mono text-muted-foreground">{members.length}/{MAX_PLAYERS} игроков</span>
              <span className="text-[10px] font-mono text-primary">{team.pts} PTS</span>
              <span className="text-[10px] font-mono text-muted-foreground">{team.wins}W {team.losses}L</span>
            </div>
          </div>
          {isCaptain && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/30 text-[10px] font-mono text-primary">
              <Crown className="w-3 h-3" /> Капитан
            </div>
          )}
        </div>
      </motion.div>

      {/* Roster */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-mono text-muted-foreground tracking-wider">
            РОСТЕР · {members.length}/{MAX_PLAYERS}
          </div>
          {/* Слоты */}
          <div className="flex gap-1">
            {Array.from({ length: MAX_PLAYERS }).map((_, i) => (
              <div key={i} className={`w-2 h-2 rounded-full ${i < members.length ? "bg-primary" : "bg-secondary border border-border"}`} />
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          {members.map((m: any, i: number) => {
            const isMe = m.user?.id === profile?.id;
            const isMemberCaptain = m.role === "captain";
            return (
              <motion.div key={m.user?.id}
                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                className={`flex items-center gap-3 p-2.5 rounded-xl transition-colors ${
                  isMe ? "bg-primary/5 border border-primary/20" : "hover:bg-secondary/40"
                }`}>
                {/* Avatar */}
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-secondary to-card border border-border flex items-center justify-center text-[10px] font-extrabold font-mono shrink-0 overflow-hidden">
                  {m.user?.avatar_url
                    ? <img src={m.user.avatar_url} className="w-full h-full object-cover" alt="" />
                    : m.user?.nickname?.slice(0, 2).toUpperCase() ?? "??"}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 font-bold text-sm">
                    {isMemberCaptain && <Crown className="w-3 h-3 text-primary shrink-0" />}
                    <span className="truncate">{m.user?.nickname ?? "—"}</span>
                    {isMe && <span className="text-[9px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0">ТЫ</span>}
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground">
                    {m.role} · {m.user?.rating ?? 1000} рейтинг
                  </div>
                </div>

                {/* Captain actions */}
                {isCaptain && !isMe && (
                  <div className="flex items-center gap-1">
                    {!isMemberCaptain && (
                      <button onClick={() => makeCaption(m.user.id, m.user.nickname)}
                        title="Передать капитанство"
                        className="w-7 h-7 rounded-lg hover:bg-primary/10 flex items-center justify-center transition-colors">
                        <Crown className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                      </button>
                    )}
                    <button onClick={() => kickPlayer(m.user.id, m.user.nickname)}
                      title="Исключить"
                      className="w-7 h-7 rounded-lg hover:bg-red-500/10 flex items-center justify-center transition-colors">
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-500" />
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Invite (только капитан) */}
      {isCaptain && members.length < MAX_PLAYERS && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-2xl border border-border bg-card p-4">
          <div className="text-[10px] font-mono text-muted-foreground tracking-wider mb-3">ПРИГЛАСИТЬ ИГРОКА</div>

          {/* Mode toggle */}
          <div className="flex gap-1.5 p-1 rounded-xl bg-secondary/60 w-fit mb-3">
            <button onClick={() => setInviteMode("link")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                inviteMode === "link" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
              }`}>
              <Link2 className="w-3 h-3" /> Ссылка
            </button>
            <button onClick={() => setInviteMode("username")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                inviteMode === "username" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
              }`}>
              <AtSign className="w-3 h-3" /> Username
            </button>
          </div>

          {inviteMode === "link" ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Скопируй ссылку и отправь игроку — он перейдёт и вступит в команду.
              </p>
              <button onClick={getInviteCode} disabled={inviteLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border bg-secondary/40 hover:bg-secondary/70 transition-colors text-sm font-medium disabled:opacity-50">
                {inviteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> :
                 inviteCopied ? <><Check className="w-4 h-4 text-primary" /> Скопировано!</> :
                 <><Copy className="w-4 h-4" /> Скопировать invite-ссылку</>}
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={usernameInput}
                  onChange={e => setUsernameInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && inviteByUsername()}
                  placeholder="nickname игрока"
                  className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-secondary border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
                />
              </div>
              <button onClick={inviteByUsername} disabled={!usernameInput.trim() || inviting}
                className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1.5">
                {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Добавить
              </button>
            </div>
          )}
        </motion.div>
      )}

      {/* Leave team (не капитан) */}
      {!isCaptain && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 flex items-center justify-between">
          <div>
            <div className="font-medium text-sm">Покинуть команду</div>
            <div className="text-xs text-muted-foreground">Ты потеряешь место в ростере</div>
          </div>
          <button onClick={async () => {
            if (!confirm("Покинуть команду?")) return;
            await supabase.from("team_members").delete()
              .eq("team_id", team.id).eq("user_id", profile.id);
            toast.success("Ты покинул команду");
          }}
            className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-500 text-xs font-bold hover:bg-red-500/10 transition-colors">
            Выйти
          </button>
        </motion.div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────

function NeedVerify() {
  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="rounded-2xl border border-border bg-card p-8 text-center max-w-sm w-full">
        <Shield className="w-12 h-12 mx-auto text-primary mb-3" />
        <h1 className="text-xl font-extrabold mb-1">Нужна верификация</h1>
        <p className="text-sm text-muted-foreground mb-4">Только верифицированные игроки могут создавать команды.</p>
        <Link to="/verify" className="inline-block px-6 py-2 rounded-full bg-primary text-primary-foreground font-bold text-sm">
          Верифицироваться
        </Link>
      </div>
    </div>
  );
}

function Loader() {
  return (
    <div className="flex items-center justify-center min-h-screen text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Загрузка...
    </div>
  );
}
