import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  Flame,
  Sparkles,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';
import { getTodayDateKey } from '../lib/gamification';
import type { DailyGoalLog } from '../types/obren';

interface DailyGoalTrackerProps {
  dailyLogs: DailyGoalLog[];
  targetQuestions: number;
  onStartPractice?: () => void;
}

function buildLast7DateKeys(todayKey: string): Array<{ dateKey: string; shortDay: string }> {
  const [y, m, d] = todayKey.split('-').map(Number);
  const base = new Date(y, (m || 1) - 1, d || 1);
  const result: Array<{ dateKey: string; shortDay: string }> = [];
  for (let i = 6; i >= 0; i -= 1) {
    const dt = new Date(base);
    dt.setDate(base.getDate() - i);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
      dt.getDate()
    ).padStart(2, '0')}`;
    const shortDay = dt.toLocaleDateString('en-US', { weekday: 'short' });
    result.push({ dateKey: key, shortDay });
  }
  return result;
}

const MILESTONE_ICONS = [Target, Zap, Compass, Flame, Trophy] as const;
const MILESTONE_FRACTIONS = [0.2, 0.4, 0.6, 0.8, 1.0] as const;

export const DailyGoalTracker: React.FC<DailyGoalTrackerProps> = ({
  dailyLogs,
  targetQuestions,
  onStartPractice,
}) => {
  const safeTarget = Math.max(5, Math.min(200, Math.round(targetQuestions || 30)));
  const [todayKey, setTodayKey] = useState<string>(() => getTodayDateKey());
  const [showHistory, setShowHistory] = useState(false);

  // Automatically reset at midnight even if the dashboard stays open
  useEffect(() => {
    const syncDay = () => {
      const latest = getTodayDateKey();
      setTodayKey((prev) => (prev !== latest ? latest : prev));
    };
    const timer = window.setInterval(syncDay, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') syncDay();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const logsByDate = useMemo(() => {
    const map = new Map<string, DailyGoalLog>();
    dailyLogs.forEach((log) => {
      map.set(log.dateKey, log);
    });
    return map;
  }, [dailyLogs]);

  const todayCount = logsByDate.get(todayKey)?.questionsCompleted ?? 0;
  const progressPercent = Math.min(100, Math.round((todayCount / safeTarget) * 100));
  const goalCompleted = todayCount >= safeTarget;
  const remaining = Math.max(0, safeTarget - todayCount);

  const last7Days = useMemo(() => buildLast7DateKeys(todayKey), [todayKey]);

  const weeklyStats = useMemo(() => {
    let totalQuestions = 0;
    let goalsMetDays = 0;
    const days = last7Days.map(({ dateKey, shortDay }) => {
      const entry = logsByDate.get(dateKey);
      const count = entry?.questionsCompleted ?? 0;
      const target = entry?.targetQuestions ?? safeTarget;
      const met = count >= target;
      totalQuestions += count;
      if (met) goalsMetDays += 1;
      return {
        dateKey,
        shortDay,
        count,
        target,
        met,
        pct: Math.min(100, Math.round((count / Math.max(1, target)) * 100)),
      };
    });
    return { totalQuestions, goalsMetDays, days };
  }, [last7Days, logsByDate, safeTarget]);

  return (
    <section
      aria-label="Daily Question Goal Tracker"
      className="relative overflow-hidden rounded-2xl bg-[#0B101B] text-slate-100 border border-slate-800/90 p-5 sm:p-6 shadow-lg"
    >
      {/* Subtle completion celebration glow when goal reached */}
      {goalCompleted && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 w-64 h-64 rounded-full bg-emerald-500/15 blur-3xl animate-pulse"
        />
      )}

      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-500 ${
              goalCompleted
                ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40 scale-105'
                : 'bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/30'
            }`}
          >
            {goalCompleted ? <Award className="w-5 h-5" /> : <Target className="w-5 h-5" />}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-base sm:text-lg font-bold font-display tracking-tight text-white">
                Your Daily Goal ({todayCount}/{safeTarget} Qs)
              </h2>
              {goalCompleted ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-semibold text-emerald-300 animate-bounce">
                  <Sparkles className="w-3 h-3" />
                  Daily Goal Completed!
                </span>
              ) : (
                <span className="text-xs font-mono text-slate-400 tabular-nums">
                  {remaining} Qs remaining today
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Updates automatically as you solve mocks &amp; daily sprints · Resets at midnight ({todayKey})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!goalCompleted && onStartPractice && (
            <button
              type="button"
              onClick={onStartPractice}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Solve Questions
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowHistory((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700/80 bg-slate-900/80 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
          >
            <CalendarDays className="w-3.5 h-3.5 text-indigo-400" />
            <span>History</span>
            {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Horizontal Progress Track with 5 Milestones */}
      <div className="relative mt-6 mb-2 px-2">
        {/* Track Background & Fill */}
        <div className="relative h-2 rounded-full bg-slate-800/95 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              goalCompleted
                ? 'bg-gradient-to-r from-indigo-500 via-emerald-400 to-emerald-500'
                : 'bg-gradient-to-r from-indigo-500 to-cyan-400'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* 5 Milestone Nodes */}
        <div className="mt-3 grid grid-cols-5 gap-2">
          {MILESTONE_FRACTIONS.map((fraction, idx) => {
            const Icon = MILESTONE_ICONS[idx];
            const milestoneTarget = Math.max(1, Math.round(safeTarget * fraction));
            const reached = todayCount >= milestoneTarget;
            const isFinal = idx === MILESTONE_FRACTIONS.length - 1;

            return (
              <div key={fraction} className="flex flex-col items-center text-center gap-1.5">
                <div
                  className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center border transition-all duration-500 ${
                    reached
                      ? isFinal
                        ? 'bg-emerald-500 border-emerald-400 text-slate-950 shadow-[0_0_16px_rgba(16,185,129,0.55)] scale-110'
                        : 'bg-indigo-600 border-indigo-400 text-white shadow-[0_0_12px_rgba(99,102,241,0.45)]'
                      : 'bg-slate-900 border-slate-700 text-slate-500'
                  }`}
                >
                  {reached && isFinal ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  )}
                </div>
                <div className="space-y-0.5">
                  <div
                    className={`text-[11px] font-mono tabular-nums font-bold ${
                      reached ? (isFinal ? 'text-emerald-400' : 'text-indigo-300') : 'text-slate-500'
                    }`}
                  >
                    {milestoneTarget} Qs
                  </div>
                  <div className="hidden sm:block text-[10px] text-slate-500">
                    {Math.round(fraction * 100)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Expandable Daily & Weekly Question History */}
      {showHistory && (
        <div className="mt-5 pt-4 border-t border-slate-800/80 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-200">
              7-Day Question Completion History
            </span>
            <div className="flex items-center gap-4 font-mono tabular-nums text-slate-400">
              <span>
                Weekly Total:{' '}
                <strong className="text-white">{weeklyStats.totalQuestions} Qs</strong>
              </span>
              <span>
                Goals Met:{' '}
                <strong className="text-emerald-400">{weeklyStats.goalsMetDays}/7 days</strong>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {weeklyStats.days.map((day) => {
              const isToday = day.dateKey === todayKey;
              return (
                <div
                  key={day.dateKey}
                  className={`rounded-xl border p-2.5 flex flex-col items-center gap-2 ${
                    isToday
                      ? 'border-indigo-500/60 bg-indigo-950/30'
                      : 'border-slate-800 bg-slate-900/50'
                  }`}
                >
                  <span className="text-[10px] font-mono uppercase text-slate-400">
                    {isToday ? 'Today' : day.shortDay}
                  </span>
                  <div className="w-full h-14 rounded-lg bg-slate-800/80 flex items-end overflow-hidden p-0.5">
                    <div
                      className={`w-full rounded-md transition-all duration-500 ${
                        day.met ? 'bg-emerald-500' : 'bg-indigo-500'
                      }`}
                      style={{ height: `${Math.max(day.count > 0 ? 12 : 4, day.pct)}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono tabular-nums font-bold text-slate-200">
                    {day.count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
