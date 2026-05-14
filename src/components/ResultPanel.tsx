// src/components/ResultPanel.tsx
// Панель ввода результата матча.
// Капитан 1 вводит счёт → Капитан 2 подтверждает или оспаривает.

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, XCircle, AlertTriangle, Trophy,
  Loader2, Send, Scale, ChevronDown, ChevronUp
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

type Props = {
  matchId:   string;
  teamAId:   string;
  teamBId:   string;
  teamATag:  string;
  teamBTag:  string;
  myTeamId:  string;
  userId:    string;
  isCaptain: boolean;
  onDone?:   () => void;
};

type ResultRecord = {
  id: string;
  status: "pending" | "submitted" | "confirmed" | "disputed" | "resolved";
  score_a: number | null;
  score_b: number | null;
  submitted_team: string | null;
  dispute_reason: string | null;
  dispute_score_a: number | null;
  dispute_score_b: number | null;
  final_score_a: number | null;
  final_score_b: number | null;
  resolve_note: string | null;
};

export function ResultPanel({
  matchId, teamAId, teamBId, teamATag, teamBTag,
  myTeamId, userId, isCaptain, onDone
}: Props) {
  const [result, setResult]         = useState<ResultRecord | null>(null);
  const [loading, setLoading]       = useState(true);
  const [scoreA, setScoreA]         = useState<string>("");
  const [scoreB, setScoreB]         = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [showDispute, setShowDispute] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [altA, setAltA]             = useState<string>("");
  const [altB, setAltB]             = useState<string>("");

  const isTeamA     = myTeamId === teamAId;
  const didSubmit   = result?.submitted_team === myTeamId;
  const canAct      = isCaptain && result?.status === "submitted" && !didSubmit;

  useEffect(() => {
    fetchResult();
    const ch = supabase.channel(`result-${matchId}`)
      .on("postgres_changes", {
        event: "*", schema: "public",
        table: "match_results",
        filter: `match_id=eq.${matchId}`,
      }, () => fetchResult())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [matchId]);

  async function fetchResult() {
    const { data } = await supabase
      .from("match_results")
      .select("*")
      .eq("match_id", matchId)
      .single();
    setResult(data ?? null);
    setLoading(false);
  }

  async function handleSubmit() {
    const a = parseInt(scoreA), b = parseInt(scoreB);
    if (isNaN(a) || isNaN(b)) { toast.error("Введи корректный счёт"); return; }
    if (a === b) { toast.error("Ничья невозможна"); return; }
    if (a < 0 || b < 0) { toast.error("Счёт не может быть отрицательным"); return; }

    setSubmitting(true);
    const { error } = await supabase.rpc("submit_result", {
      p_match_id: matchId,
      p_user_id:  userId,
      p_team_id:  myTeamId,
      p_score_a:  isTeamA ? a : b,
      p_score_b:  isTeamA ? b : a,
    });
    if (error) toast.error(error.message);
    else { toast.success("Результат отправлен! Ждём подтверждения соперника."); fetchResult(); }
    setSubmitting(false);
  }

  async function handleConfirm() {
    setSubmitting(true);
    const { error } = await supabase.rpc("confirm_result", {
      p_match_id: matchId,
      p_user_id:  userId,
      p_team_id:  myTeamId,
    });
    if (error) toast.error(error.message);
    else { toast.success("Результат подтверждён! Рейтинг обновлён."); onDone?.(); }
    setSubmitting(false);
  }

  async function handleDispute() {
    if (disputeReason.length < 10) { toast.error("Опиши причину подробнее"); return; }
    setSubmitting(true);
    const { error } = await supabase.rpc("dispute_result", {
      p_match_id:    matchId,
      p_user_id:     userId,
      p_team_id:     myTeamId,
      p_reason:      disputeReason,
      p_alt_score_a: altA ? parseInt(altA) : null,
      p_alt_score_b: altB ? parseInt(altB) : null,
    });
    if (error) toast.error(error.message);
    else { toast.success("Конфликт отправлен на модерацию."); setShowDispute(false); fetchResult(); }
    setSubmitting(false);
  }

  if (loading) return (
    <div className="flex items-center justify-center py-8 text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin mr-2" />
    </div>
  );

  // ── CONFIRMED ─────────────────────────────────────────────
  if (result?.status === "confirmed" || result?.status === "resolved") {
    const fa = result.final_score_a ?? result.score_a ?? 0;
    const fb = result.final_score_b ?? result.score_b ?? 0;
    const myWin = isTeamA ? fa > fb : fb > fa;
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className={`rounded-2xl border p-6 text-center ${
          myWin ? "border-primary/40 bg-primary/5" : "border-border bg-secondary/30"
        }`}>
        <Trophy className={`w-10 h-10 mx-auto mb-2 ${myWin ? "text-primary" : "text-muted-foreground"}`} />
        <div className="text-3xl font-extrabold font-mono mb-1">
          {fa} : {fb}
        </div>
        <div className="font-bold text-sm mb-1">
          {teamATag} vs {teamBTag}
        </div>
        <div className={`text-xs font-mono ${myWin ? "text-primary" : "text-muted-foreground"}`}>
          {myWin ? "🏆 Победа" : "Поражение"}
          {result.status === "resolved" && " · Решено модератором"}
        </div>
        {result.resolve_note && (
          <div className="mt-2 text-[10px] text-muted-foreground bg-secondary/60 rounded-lg px-3 py-1.5">
            Примечание: {result.resolve_note}
          </div>
        )}
      </motion.div>
    );
  }

  // ── DISPUTED ──────────────────────────────────────────────
  if (result?.status === "disputed") {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3">
        <div className="flex items-center gap-2 font-bold text-amber-500">
          <Scale className="w-4 h-4" />
          Конфликт на модерации
        </div>
        <div className="text-sm text-muted-foreground">
          Администратор рассматривает спор и вынесет решение в ближайшее время.
          Результат будет засчитан после решения.
        </div>
        <div className="rounded-xl bg-background/40 border border-border p-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Поданный счёт:</span>
            <span className="font-mono font-bold">{result.score_a} : {result.score_b}</span>
          </div>
          {result.dispute_score_a !== null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Альтернативный:</span>
              <span className="font-mono font-bold">{result.dispute_score_a} : {result.dispute_score_b}</span>
            </div>
          )}
          <div className="pt-1 text-muted-foreground italic">
            "{result.dispute_reason}"
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3">

      {/* ── PENDING — ввод результата ── */}
      {result?.status === "pending" && isCaptain && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="text-[10px] font-mono text-muted-foreground tracking-wider">ВВЕСТИ РЕЗУЛЬТАТ</div>

          <div className="flex items-center gap-3">
            {/* Team A score */}
            <div className="flex-1">
              <div className="text-[10px] font-mono text-muted-foreground mb-1 text-center">{teamATag}</div>
              <input
                type="number" min={0} max={30}
                value={isTeamA ? scoreA : scoreB}
                onChange={e => isTeamA ? setScoreA(e.target.value) : setScoreB(e.target.value)}
                placeholder="0"
                className="w-full text-center text-2xl font-extrabold font-mono py-3 rounded-xl bg-secondary border border-border focus:outline-none focus:border-primary/60 transition-colors"
              />
            </div>
            <div className="text-2xl font-extrabold text-muted-foreground pb-4">:</div>
            {/* Team B score */}
            <div className="flex-1">
              <div className="text-[10px] font-mono text-muted-foreground mb-1 text-center">{teamBTag}</div>
              <input
                type="number" min={0} max={30}
                value={isTeamA ? scoreB : scoreA}
                onChange={e => isTeamA ? setScoreB(e.target.value) : setScoreA(e.target.value)}
                placeholder="0"
                className="w-full text-center text-2xl font-extrabold font-mono py-3 rounded-xl bg-secondary border border-border focus:outline-none focus:border-primary/60 transition-colors"
              />
            </div>
          </div>

          <button onClick={handleSubmit} disabled={submitting || !scoreA || !scoreB}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 transition-opacity">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Отправить результат
          </button>

          <p className="text-[10px] text-muted-foreground text-center">
            Соперник должен подтвердить. При несогласии — отправится на модерацию.
          </p>
        </motion.div>
      )}

      {result?.status === "pending" && !isCaptain && (
        <div className="rounded-2xl border border-border bg-card p-5 text-center text-sm text-muted-foreground">
          Ожидаем ввода результата от капитана...
        </div>
      )}

      {/* ── SUBMITTED — ожидание подтверждения ── */}
      {result?.status === "submitted" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">

          {/* Показываем поданный счёт */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="text-[10px] font-mono text-muted-foreground tracking-wider mb-3">
              ПОДАННЫЙ РЕЗУЛЬТАТ
            </div>
            <div className="flex items-center justify-center gap-4 mb-2">
              <span className="text-xl font-bold">{teamATag}</span>
              <span className="text-4xl font-extrabold font-mono">
                {result.score_a} : {result.score_b}
              </span>
              <span className="text-xl font-bold">{teamBTag}</span>
            </div>
            {didSubmit ? (
              <p className="text-center text-xs text-muted-foreground">
                Ждём подтверждения от <span className="font-bold">
                  {result.submitted_team === teamAId ? teamBTag : teamATag}
                </span>...
              </p>
            ) : (
              <p className="text-center text-xs text-primary font-medium">
                Твоя команда должна подтвердить или оспорить
              </p>
            )}
          </div>

          {/* Кнопки для второй команды */}
          {canAct && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={handleConfirm} disabled={submitting}
                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Подтвердить
              </button>
              <button onClick={() => setShowDispute(!showDispute)}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border font-bold text-sm transition-colors ${
                  showDispute
                    ? "bg-amber-500/15 border-amber-500/40 text-amber-500"
                    : "border-border bg-secondary text-muted-foreground hover:border-amber-500/40 hover:text-amber-500"
                }`}>
                <XCircle className="w-4 h-4" />
                Оспорить
                {showDispute ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
          )}

          {/* Форма оспаривания */}
          <AnimatePresence>
            {showDispute && canAct && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3 overflow-hidden"
              >
                <div className="flex items-center gap-2 text-amber-500 font-bold text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  Оспорить результат
                </div>

                <div>
                  <label className="text-[10px] font-mono text-muted-foreground mb-1.5 block">
                    ПРИЧИНА СПОРА *
                  </label>
                  <textarea
                    value={disputeReason}
                    onChange={e => setDisputeReason(e.target.value)}
                    placeholder="Опиши что произошло. Приложи СС в TG администратору."
                    rows={3}
                    className="w-full px-3 py-2 rounded-xl bg-secondary border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/60 transition-colors resize-none"
                  />
                  <div className="text-[9px] text-muted-foreground mt-0.5 text-right">
                    {disputeReason.length}/500
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-muted-foreground mb-1.5 block">
                    ВАШ СЧЁТ (необязательно)
                  </label>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} value={altA} onChange={e => setAltA(e.target.value)}
                      placeholder={teamATag}
                      className="flex-1 text-center font-mono py-2 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:border-amber-500/60 transition-colors" />
                    <span className="font-mono text-muted-foreground">:</span>
                    <input type="number" min={0} value={altB} onChange={e => setAltB(e.target.value)}
                      placeholder={teamBTag}
                      className="flex-1 text-center font-mono py-2 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:border-amber-500/60 transition-colors" />
                  </div>
                </div>

                <button onClick={handleDispute} disabled={submitting || disputeReason.length < 10}
                  className="w-full py-2.5 rounded-xl bg-amber-500 text-white font-bold text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 transition-opacity">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />}
                  Отправить на модерацию
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
