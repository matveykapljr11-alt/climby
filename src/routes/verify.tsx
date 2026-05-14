import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { ShieldCheck, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useVerifyPlayer } from "@/lib/queries";
import { toast } from "sonner";

export const Route = createFileRoute("/verify")({
  head: () => ({
    meta: [{ title: "Верификация — Climby" }],
  }),
  component: VerifyPage,
});

// ─── Zod schema ──────────────────────────────────────────────

const schema = z.object({
  telegram_nick: z
    .string()
    .min(3, "Минимум 3 символа")
    .regex(/^@?[a-zA-Z0-9_]{3,32}$/, "Невалидный Telegram ник (только латиница, цифры, _)"),
  standoff_id: z
    .string()
    .min(4, "Минимум 4 символа")
    .regex(/^[a-zA-Z0-9#-]+$/, "Невалидный Standoff ID"),
  nickname: z
    .string()
    .min(2, "Минимум 2 символа")
    .max(32, "Максимум 32 символа"),
  hours: z
    .number({ invalid_type_error: "Введите число" })
    .int("Только целые числа")
    .min(100, "Нужно минимум 100 часов для верификации")
    .max(99999, "Слишком большое число"),
});

type FormData = z.infer<typeof schema>;

// ─── Page ────────────────────────────────────────────────────

function VerifyPage() {
  const { role, profile, session, signInWithGoogle, signInWithTelegram } = useAuth();
  const navigate = useNavigate();
  const verify = useVerifyPlayer();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      telegram_nick: "",
      standoff_id: "",
      nickname: "",
      hours: undefined,
    },
  });

  const hoursValue = watch("hours");

  // Уже верифицирован — редирект
  if (role === "player" || role === "admin") {
    navigate({ to: "/my-team" });
    return null;
  }

  // Не залогинен — экран входа
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-xl font-extrabold tracking-tighter mb-1">Войди для верификации</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Нужен аккаунт чтобы стать игроком лиги
            </p>
            <div className="space-y-2">
              <button
                onClick={signInWithGoogle}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-secondary border border-border hover:bg-secondary/70 transition-colors text-sm font-medium"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Войти через Google
              </button>
              <button
                onClick={signInWithTelegram}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#229ED9]/15 border border-[#229ED9]/30 hover:bg-[#229ED9]/25 transition-colors text-sm font-medium"
              >
                <svg className="w-4 h-4 text-[#229ED9]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.19 13.913l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.958.646z"/>
                </svg>
                Войти через Telegram
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // Залогинен как guest — форма верификации
  async function onSubmit(data: FormData) {
    try {
      await verify.mutateAsync(data);
      toast.success("Верификация пройдена! Добро пожаловать в лигу.");
      navigate({ to: "/my-team" });
    } catch (err: any) {
      toast.error(err.message ?? "Ошибка верификации. Попробуй ещё раз.");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tighter leading-none">Верификация игрока</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Аккаунт: <span className="text-primary font-mono">{profile?.telegram_nick ?? session.user.email}</span>
              </p>
            </div>
          </div>

          {/* Requirements */}
          <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 mb-6 space-y-1.5 text-xs">
            <div className="font-mono text-[10px] text-muted-foreground tracking-wider mb-1">ТРЕБОВАНИЯ</div>
            <Req text="Реальный Telegram ник" />
            <Req text="Настоящий Standoff 2 ID" />
            <Req text="Ник в игре" />
            <Req text="Минимум 100 часов в Standoff 2" warn={hoursValue > 0 && hoursValue < 100} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Telegram nick */}
            <Field label="Telegram ник" error={errors.telegram_nick?.message}>
              <input
                {...register("telegram_nick")}
                placeholder="@username"
                className="w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
              />
            </Field>

            {/* Standoff ID */}
            <Field label="Standoff 2 ID" error={errors.standoff_id?.message}>
              <input
                {...register("standoff_id")}
                placeholder="Пример: 123456789"
                className="w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Найди в игре: Профиль → троеточие → Скопировать ID
              </p>
            </Field>

            {/* Nickname */}
            <Field label="Ник в игре" error={errors.nickname?.message}>
              <input
                {...register("nickname")}
                placeholder="Твой ник в Standoff 2"
                className="w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
              />
            </Field>

            {/* Hours */}
            <Field label="Часов в Standoff 2" error={errors.hours?.message}>
              <input
                {...register("hours", { valueAsNumber: true })}
                type="number"
                min={0}
                placeholder="Например: 350"
                className="w-full px-3 py-2.5 rounded-xl bg-secondary border border-border text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Найди в игре: Профиль → Статистика → Время в игре
              </p>
            </Field>

            {/* Hours warning */}
            {hoursValue > 0 && hoursValue < 100 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs"
              >
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span className="text-red-500">
                  Нужно минимум 100 часов. У тебя {hoursValue}ч — недостаточно для лиги.
                </span>
              </motion.div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting || verify.isPending}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
            >
              {(isSubmitting || verify.isPending) ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Проверяем...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Пройти верификацию
                </>
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
      {children}
      {error && (
        <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  );
}

function Req({ text, warn }: { text: string; warn?: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 ${warn ? "text-red-500" : "text-muted-foreground"}`}>
      <CheckCircle2 className={`w-3.5 h-3.5 ${warn ? "text-red-500" : "text-primary"}`} />
      <span>{text}</span>
    </div>
  );
}
