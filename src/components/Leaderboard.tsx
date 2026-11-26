import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Award, Crown, Flame, Medal, Trophy } from 'lucide-react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { computeBadges } from '../lib/gamification';
import type { ExamType, PublicProfile } from '../types/obren';
import { EXAM_LABELS } from '../types/obren';
import { Achievements } from './Achievements';

interface LeaderboardProps {
  currentUserId: string;
  defaultExamFilter?: 'ALL' | ExamType;
  compact?: boolean;
  onViewFullLeaderboard?: () => void;
}

function getAccuracyPercent(p: PublicProfile): number {
  const solved = p.totalQuestionsSolved || 0;
  const correct = p.totalCorrect || 0;
  if (solved <= 0) return 0;
  return Math.min(100, Math.round((correct / solved) * 100));
}

export const Leaderboard: React.FC<LeaderboardProps> = ({
  currentUserId,
  defaultExamFilter = 'ALL',
  compact = false,
  onViewFullLeaderboard,
}) => {
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [examFilter, setExamFilter] = useState<'ALL' | ExamType>(defaultExamFilter);

  useEffect(() => {
    const lbQuery = query(
      collection(db, 'publicProfiles'),
      orderBy('xp', 'desc'),
      limit(50)
    );
    const unsub = onSnapshot(
      lbQuery,
      (snap) => {
        setProfiles(snap.docs.map((d) => d.data() as PublicProfile));
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, 'publicProfiles');
      }
    );
    return () => unsub();
  }, []);

  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => examFilter === 'ALL' || p.targetExam === examFilter);
  }, [profiles, examFilter]);

  const currentUserEntry = useMemo(() => {
    const index = filteredProfiles.findIndex((p) => p.uid === currentUserId);
    if (index === -1) return null;
    return { rank: index + 1, profile: filteredProfiles[index] };
  }, [filteredProfiles, currentUserId]);

  const currentUserBadgesCount = useMemo(() => {
    if (!currentUserEntry) return 0;
    return computeBadges(currentUserEntry.profile).filter((b) => b.unlocked).length;
  }, [currentUserEntry]);

  const [inspectedScholar, setInspectedScholar] = useState<PublicProfile | null>(null);

  const visibleRows = useMemo(() => {
    return compact ? filteredProfiles.slice(0, 8) : filteredProfiles;
  }, [filteredProfiles, compact]);

  const renderRankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <span className="inline-flex items-center gap-1 font-mono tabular-nums font-extrabold text-amber-500">
          <Crown className="w-4 h-4" />
          <span>#1</span>
        </span>
      );
    }
    if (rank === 2) {
      return (
        <span className="inline-flex items-center gap-1 font-mono tabular-nums font-bold text-slate-500 dark:text-slate-300">
          <Medal className="w-4 h-4" />
          <span>#2</span>
        </span>
      );
    }
    if (rank === 3) {
      return (
        <span className="inline-flex items-center gap-1 font-mono tabular-nums font-bold text-amber-700 dark:text-amber-500">
          <Medal className="w-4 h-4" />
          <span>#3</span>
        </span>
      );
    }
    return <span className="font-mono tabular-nums font-semibold text-slate-600 dark:text-slate-300">#{rank}</span>;
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold font-display">
              {compact ? 'Top Performers Leaderboard' : 'Global OBREN Leaderboard'}
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Live rankings ordered by total earned XP across practice tests, study streaks, and badges.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            aria-label="Filter leaderboard by exam track"
            value={examFilter}
            onChange={(e) => setExamFilter(e.target.value as 'ALL' | ExamType)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium"
          >
            <option value="ALL">All Exam Tracks</option>
            <option value="JEE_MAINS">JEE Main</option>
            <option value="JEE_ADV">JEE Advanced</option>
            <option value="NEET">NEET UG</option>
          </select>

          {compact && onViewFullLeaderboard && (
            <button
              type="button"
              onClick={onViewFullLeaderboard}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-indigo-600 dark:text-indigo-400 cursor-pointer whitespace-nowrap"
            >
              <span>Full Rankings</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {currentUserEntry && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900/60 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="font-mono tabular-nums font-extrabold text-indigo-600 dark:text-indigo-400">
              Your Rank: #{currentUserEntry.rank}
            </span>
            <span className="text-slate-600 dark:text-slate-300">
              out of {filteredProfiles.length} ranked scholar{filteredProfiles.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="flex items-center gap-4 font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-200">
            <button
              type="button"
              onClick={() => setInspectedScholar(currentUserEntry.profile)}
              className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
            >
              <Award className="w-3.5 h-3.5" />
              <span>{currentUserBadgesCount} Badges</span>
            </button>
            <span>{currentUserEntry.profile.xp} XP</span>
            <span>{currentUserEntry.profile.totalTestsCompleted || 0} tests</span>
            <span>{getAccuracyPercent(currentUserEntry.profile)}% acc</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
          Loading live rankings...
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
          No ranked profiles in this track yet. Complete a test or focus session to claim #1.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                <th className="py-3 pr-4">Rank</th>
                <th className="py-3 px-4">Scholar</th>
                <th className="py-3 px-4">Track</th>
                <th className="py-3 px-4">Achievements</th>
                <th className="py-3 px-4 text-right">Streak</th>
                <th className="py-3 px-4 text-right">Accuracy</th>
                <th className="py-3 px-4 text-right">Tests</th>
                <th className="py-3 pl-4 text-right">Total XP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {visibleRows.map((p, idx) => {
                const isMe = p.uid === currentUserId;
                const accuracy = getAccuracyPercent(p);
                return (
                  <tr
                    key={p.uid}
                    className={
                      isMe
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/30 font-semibold'
                        : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors'
                    }
                  >
                    <td className="py-3 pr-4 whitespace-nowrap">{renderRankBadge(idx + 1)}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={p.photoURL || '/src/assets/images/avatar_scholar_default_1795432797912.jpg'}
                          alt={p.displayName}
                          referrerPolicy="no-referrer"
                          className="w-7 h-7 rounded-full object-cover shrink-0"
                        />
                        <button
                          type="button"
                          onClick={() => setInspectedScholar(p)}
                          className="truncate max-w-[180px] text-left hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer font-medium"
                        >
                          {p.displayName}
                        </button>
                        {isMe && (
                          <span className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 shrink-0">
                            (You)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {EXAM_LABELS[p.targetExam] || p.targetExam} · Class {p.targetClass}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <Achievements variant="badge-row" profile={p} onBadgeClick={() => setInspectedScholar(p)} />
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 justify-end">
                        <Flame className="w-3.5 h-3.5 text-amber-500" />
                        <span>{p.streakDays || 0}d</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-300">
                      {p.totalQuestionsSolved ? `${accuracy}%` : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      {p.totalTestsCompleted || 0}
                    </td>
                    <td className="py-3 pl-4 text-right font-mono tabular-nums font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                      {p.xp.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Inspected Scholar Achievements Modal */}
      {inspectedScholar && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full max-h-[85vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <img
                  src={inspectedScholar.photoURL || '/src/assets/images/avatar_scholar_default_1795432797912.jpg'}
                  alt={inspectedScholar.displayName}
                  className="w-10 h-10 rounded-full object-cover"
                />
                <div>
                  <h3 className="text-base font-bold font-display">{inspectedScholar.displayName}</h3>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    {inspectedScholar.xp} XP · {inspectedScholar.streakDays || 0}d Streak · {inspectedScholar.targetExam}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setInspectedScholar(null)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="overflow-y-auto flex-1 pr-1">
              <Achievements profile={inspectedScholar} variant="full" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
