// src/lib/queries.ts
// React Query хуки для всех запросов к Supabase.
// Заменяют хардкод из data.ts.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { useAuth } from "./auth";
import type { Database } from "./database.types";

type PlayerRole = Database["public"]["Enums"]["player_role"];

// ─────────────────────────────────────────────
// STANDINGS (турнирная таблица)
// ─────────────────────────────────────────────

export function useStandings() {
  return useQuery({
    queryKey: ["standings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("standings")
        .select("*")
        .order("rank", { ascending: true });
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 30_000,
  });
}

// ─────────────────────────────────────────────
// UPCOMING MATCHES (расписание)
// ─────────────────────────────────────────────

export function useUpcomingMatches() {
  return useQuery({
    queryKey: ["upcoming-matches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("upcoming_matches")
        .select("*");
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 15_000,
    refetchInterval: 30_000, // опрос каждые 30с для live
  });
}

// ─────────────────────────────────────────────
// RESULTS (результаты завершённых матчей)
// ─────────────────────────────────────────────

export function useResults(limit = 10) {
  return useQuery({
    queryKey: ["results", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matches")
        .select(`
          id, score_a, score_b, scheduled_at, map,
          team_a:teams!matches_team_a_id_fkey(tag, name),
          team_b:teams!matches_team_b_id_fkey(tag, name)
        `)
        .eq("status", "done")
        .order("scheduled_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 60_000,
  });
}

// ─────────────────────────────────────────────
// LIVE MATCHES
// ─────────────────────────────────────────────

export function useLiveMatches() {
  return useQuery({
    queryKey: ["live-matches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matches")
        .select(`
          id, score_a, score_b, map,
          team_a:teams!matches_team_a_id_fkey(tag, name),
          team_b:teams!matches_team_b_id_fkey(tag, name)
        `)
        .eq("status", "live");
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

// ─────────────────────────────────────────────
// NEWS
// ─────────────────────────────────────────────

export function useNews(limit = 10) {
  return useQuery({
    queryKey: ["news", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("news")
        .select("id, tag, title, excerpt, emoji, published_at")
        .eq("published", true)
        .order("published_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 120_000,
  });
}

// ─────────────────────────────────────────────
// MY TEAM (команда текущего игрока)
// ─────────────────────────────────────────────

export function useMyTeam() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ["my-team", profile?.id],
    enabled: !!profile?.id && profile.role === "player",
    queryFn: async () => {
      // Находим членство текущего игрока
      const { data: membership, error: mErr } = await supabase
        .from("team_members")
        .select("team_id, role")
        .eq("user_id", profile!.id)
        .single();

      if (mErr || !membership) return null;

      // Загружаем команду со всем ростером
      const { data: team, error: tErr } = await supabase
        .from("teams")
        .select(`
          *,
          members:team_members(
            role,
            user:users(id, nickname, standoff_id, hours)
          )
        `)
        .eq("id", membership.team_id)
        .single();

      if (tErr) throw new Error(tErr.message);
      return { team, myRole: membership.role };
    },
    staleTime: 30_000,
  });
}

// ─────────────────────────────────────────────
// ACTIVE SEASON
// ─────────────────────────────────────────────

export function useActiveSeason() {
  return useQuery({
    queryKey: ["active-season"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seasons")
        .select("*")
        .eq("is_active", true)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 300_000,
  });
}

// ─────────────────────────────────────────────
// VERIFY PLAYER (мутация верификации)
// ─────────────────────────────────────────────

type VerifyPayload = {
  telegram_nick: string;
  standoff_id: string;
  nickname: string;
  hours: number;
};

export function useVerifyPlayer() {
  const { profile, refreshProfile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: VerifyPayload) => {
      if (!profile) throw new Error("Не авторизован");

      // Проверка часов на клиенте (БД тоже проверит через CHECK constraint)
      if (payload.hours < 100) {
        throw new Error(`Нужно минимум 100 часов в Standoff 2. У вас: ${payload.hours}`);
      }

      const { error } = await supabase
        .from("users")
        .update({
          telegram_nick: payload.telegram_nick.replace(/^@/, ""),
          standoff_id:   payload.standoff_id.trim(),
          nickname:      payload.nickname.trim(),
          hours:         payload.hours,
          role:          "player",
          verified_at:   new Date().toISOString(),
        })
        .eq("id", profile.id);

      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await refreshProfile();
      queryClient.invalidateQueries({ queryKey: ["my-team"] });
    },
  });
}

// ─────────────────────────────────────────────
// CREATE TEAM
// ─────────────────────────────────────────────

export function useCreateTeam() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ tag, name, seasonId, logo }: { tag: string; name: string; seasonId: number; logo?: string | null }) => {
      if (!profile || profile.role !== "player") throw new Error("Только verified игроки могут создать команду");

      // Создаём команду
      const { data: team, error: tErr } = await supabase
        .from("teams")
        .insert({ tag: tag.toUpperCase(), name, season_id: seasonId, captain_id: profile.id, logo_url: logo ?? null })
        .select()
        .single();

      if (tErr) throw new Error(tErr.message);

      // Добавляем создателя как капитана
      const { error: mErr } = await supabase
        .from("team_members")
        .insert({ team_id: team.id, user_id: profile.id, role: "captain" });

      if (mErr) throw new Error(mErr.message);

      return team;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-team"] });
      queryClient.invalidateQueries({ queryKey: ["standings"] });
    },
  });
}

// ─────────────────────────────────────────────
// JOIN TEAM
// ─────────────────────────────────────────────

export function useJoinTeam() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ teamId, role }: { teamId: string; role: PlayerRole }) => {
      if (!profile || profile.role !== "player") throw new Error("Только verified игроки могут вступить в команду");

      const { error } = await supabase
        .from("team_members")
        .insert({ team_id: teamId, user_id: profile.id, role });

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-team"] });
    },
  });
}

// ─────────────────────────────────────────────
// CONFIRM MATCH READINESS (капитан подтверждает)
// ─────────────────────────────────────────────

export function useConfirmMatch() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ matchId, teamId }: { matchId: string; teamId: string }) => {
      if (!profile) throw new Error("Не авторизован");

      const { error } = await supabase
        .from("match_confirmations")
        .update({
          confirmed:    true,
          confirmed_by: profile.id,
          confirmed_at: new Date().toISOString(),
        })
        .eq("match_id", matchId)
        .eq("team_id", teamId);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upcoming-matches"] });
    },
  });
}

// ─────────────────────────────────────────────
// TOP PLAYERS (рейтинг игроков)
// ─────────────────────────────────────────────

export function useTopPlayers(limit = 20) {
  return useQuery({
    queryKey: ["top-players", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select(`
          id, nickname, standoff_id, rating, hours,
          team_members(
            role,
            team:teams(tag, name)
          )
        `)
        .eq("role", "player")
        .order("rating", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 30_000,
  });
}

// ─────────────────────────────────────────────
// RATING HISTORY (история изменений рейтинга)
// ─────────────────────────────────────────────

// Добавить позже когда будет таблица rating_log в БД
// export function useRatingHistory(userId: string) { ... }
