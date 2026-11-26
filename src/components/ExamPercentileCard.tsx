import React from 'react';
import { Award, TrendingUp } from 'lucide-react';
import { estimateExamStanding } from '../lib/examMetrics';
import type { ExamType } from '../types/obren';

interface ExamPercentileCardProps {
  exam: ExamType;
  score: number;
  maxScore: number;
  accuracyPercent: number;
  title?: string;
}

export const ExamPercentileCard: React.FC<ExamPercentileCardProps> = ({
  exam,
  score,
  maxScore,
  accuracyPercent,
  title = 'Projected Exam Standing & Rank Band',
}) => {
  const standing = estimateExamStanding(exam, score, maxScore, accuracyPercent);

  const borderColors = {
    emerald: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-100',
    indigo: 'border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-100',
    amber: 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-100',
    rose: 'border-rose-200 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/20 text-rose-900 dark:text-rose-100',
  };

  return (
    <div className={`p-5 rounded-2xl border ${borderColors[standing.tierColor]} space-y-3 shadow-sm`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold font-display uppercase tracking-wider">
          <TrendingUp className="w-4 h-4 text-indigo-500" />
          <span>{title}</span>
        </div>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/80 dark:bg-slate-900/80 text-[11px] font-mono font-bold shadow-xs">
          <Award className="w-3 h-3 text-amber-500" />
          <span>{standing.primaryMetricLabel}</span>
        </span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
        <div className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums tracking-tight">
          {standing.primaryMetricValue}
        </div>
        <div className="text-xs font-semibold px-3 py-1 rounded-xl bg-white/70 dark:bg-slate-900/70 border border-black/5 dark:border-white/10 self-start sm:self-auto">
          {standing.bandLabel}
        </div>
      </div>
    </div>
  );
};
