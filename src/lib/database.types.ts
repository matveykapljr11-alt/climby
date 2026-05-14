// Авто-генерируется из схемы Supabase.
// Чтобы обновить: npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          auth_id: string;
          telegram_nick: string | null;
          standoff_id: string | null;
          nickname: string | null;
          hours: number | null;
          rating: number;
          role: "guest" | "player" | "admin";
          verified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_id: string;
          telegram_nick?: string | null;
          standoff_id?: string | null;
          nickname?: string | null;
          hours?: number | null;
          rating?: number;
          role?: "guest" | "player" | "admin";
        };
        Update: {
          telegram_nick?: string | null;
          standoff_id?: string | null;
          nickname?: string | null;
          hours?: number | null;
          rating?: number;
          role?: "guest" | "player" | "admin";
          verified_at?: string | null;
          updated_at?: string;
        };
      };
      teams: {
        Row: {
          id: string;
          season_id: number;
          tag: string;
          name: string;
          captain_id: string | null;
          wins: number;
          losses: number;
          pts: number;
          streak: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          season_id: number;
          tag: string;
          name: string;
          captain_id?: string | null;
          wins?: number;
          losses?: number;
          pts?: number;
          streak?: number;
        };
        Update: {
          tag?: string;
          name?: string;
          captain_id?: string | null;
          wins?: number;
          losses?: number;
          pts?: number;
          streak?: number;
        };
      };
      team_members: {
        Row: {
          id: string;
          team_id: string;
          user_id: string;
          role: "captain" | "sniper" | "entry" | "support";
          joined_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          user_id: string;
          role?: "captain" | "sniper" | "entry" | "support";
        };
        Update: {
          role?: "captain" | "sniper" | "entry" | "support";
        };
      };
      matches: {
        Row: {
          id: string;
          season_id: number;
          team_a_id: string;
          team_b_id: string;
          scheduled_at: string;
          window_start: string | null;
          window_end: string | null;
          status: "scheduled" | "live" | "done" | "cancelled";
          score_a: number | null;
          score_b: number | null;
          map: string | null;
          result_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          season_id: number;
          team_a_id: string;
          team_b_id: string;
          scheduled_at: string;
          window_start?: string | null;
          window_end?: string | null;
          status?: "scheduled" | "live" | "done" | "cancelled";
          score_a?: number | null;
          score_b?: number | null;
          map?: string | null;
        };
        Update: {
          scheduled_at?: string;
          window_start?: string | null;
          window_end?: string | null;
          status?: "scheduled" | "live" | "done" | "cancelled";
          score_a?: number | null;
          score_b?: number | null;
          map?: string | null;
          result_note?: string | null;
        };
      };
      match_confirmations: {
        Row: {
          id: string;
          match_id: string;
          team_id: string;
          confirmed: boolean;
          confirmed_by: string | null;
          confirmed_at: string | null;
        };
        Update: {
          confirmed?: boolean;
          confirmed_by?: string | null;
          confirmed_at?: string | null;
        };
      };
      seasons: {
        Row: {
          id: number;
          name: string;
          starts_at: string;
          ends_at: string;
          prize_pool: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          name: string;
          starts_at: string;
          ends_at: string;
          prize_pool?: number;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          starts_at?: string;
          ends_at?: string;
          prize_pool?: number;
          is_active?: boolean;
        };
      };
      news: {
        Row: {
          id: string;
          tag: string;
          title: string;
          excerpt: string | null;
          body: string | null;
          emoji: string | null;
          author_id: string | null;
          published: boolean;
          published_at: string | null;
          created_at: string;
        };
        Insert: {
          tag: string;
          title: string;
          excerpt?: string | null;
          body?: string | null;
          emoji?: string | null;
          author_id?: string | null;
          published?: boolean;
        };
        Update: {
          tag?: string;
          title?: string;
          excerpt?: string | null;
          body?: string | null;
          emoji?: string | null;
          published?: boolean;
          published_at?: string | null;
        };
      };
    };
    Views: {
      standings: {
        Row: {
          id: string;
          tag: string;
          name: string;
          w: number;
          l: number;
          pts: number;
          streak: number;
          rank: number;
        };
      };
      upcoming_matches: {
        Row: {
          id: string;
          scheduled_at: string;
          window_start: string | null;
          window_end: string | null;
          map: string | null;
          status: string;
          team_a_tag: string;
          team_a_name: string;
          team_b_tag: string;
          team_b_name: string;
          team_a_confirmed: boolean;
          team_b_confirmed: boolean;
        };
      };
    };
    Functions: {
      finish_match: {
        Args: { p_match_id: string; p_score_a: number; p_score_b: number };
        Returns: void;
      };
      current_user_id: { Args: Record<never, never>; Returns: string };
      current_user_role: { Args: Record<never, never>; Returns: "guest" | "player" | "admin" };
    };
    Enums: {
      user_role: "guest" | "player" | "admin";
      player_role: "captain" | "sniper" | "entry" | "support";
      match_status: "scheduled" | "live" | "done" | "cancelled";
    };
  };
};
