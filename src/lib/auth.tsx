import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "./supabase";
import type { User as SupabaseUser, Session } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// ─── Types ───────────────────────────────────────────────────

export type UserRole = Database["public"]["Enums"]["user_role"];

export type ClimbyUser = Database["public"]["Tables"]["users"]["Row"];

type AuthState = {
  /** Supabase auth session (null = не залогинен) */
  session: Session | null;
  /** Профиль из public.users */
  profile: ClimbyUser | null;
  /** Роль: guest | player | admin */
  role: UserRole;
  /** Загрузка начального состояния */
  loading: boolean;
  /** Войти через Google */
  signInWithGoogle: () => Promise<void>;
  /** Войти через Telegram (Magic Link / OAuth) */
  signInWithTelegram: () => Promise<void>;
  /** Выйти */
  signOut: () => Promise<void>;
  /** Обновить профиль (после верификации) */
  refreshProfile: () => Promise<void>;
};

// ─── Context ─────────────────────────────────────────────────

const AuthCtx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession]   = useState<Session | null>(null);
  const [profile, setProfile]   = useState<ClimbyUser | null>(null);
  const [loading, setLoading]   = useState(true);

  // Загрузить профиль из public.users по auth_id
  async function fetchProfile(authUser: SupabaseUser) {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("auth_id", authUser.id)
      .single();

    if (error) {
      console.error("fetchProfile error:", error.message);
      setProfile(null);
    } else {
      setProfile(data);
    }
  }

  // Инициализация: слушаем изменения сессии
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) fetchProfile(session.user).finally(() => setLoading(false));
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session?.user) fetchProfile(session.user);
        else setProfile(null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // ─── Auth actions ───────────────────────────────────────────

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
  }

  async function signInWithTelegram() {
    // Telegram OAuth через Supabase (нужно включить в Supabase Dashboard → Auth → Providers → Telegram)
    await supabase.auth.signInWithOAuth({
      provider: "telegram" as any,
      options: { redirectTo: `${window.location.origin}/` },
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }

  async function refreshProfile() {
    if (session?.user) await fetchProfile(session.user);
  }

  // ─── Derived role ───────────────────────────────────────────
  const role: UserRole = profile?.role ?? "guest";

  return (
    <AuthCtx.Provider value={{
      session,
      profile,
      role,
      loading,
      signInWithGoogle,
      signInWithTelegram,
      signOut,
      refreshProfile,
    }}>
      {children}
    </AuthCtx.Provider>
  );
}
