import React, { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Flame,
  GitCompare,
  Layers,
  Minus,
  RotateCcw,
  Scale,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { estimateExamStanding } from '../lib/examMetrics';
import type { SubjectType, TestAttempt } from '../types/obren';
import { EXAM_LABELS } from '../types/obren';

interface TestComparisonToolProps {
  attempts: TestAttempt[];
  defaultAttemptIdA?: string;
  defaultAttemptIdB?: string;
  className?: string;
}

interface SubjectStatComparison {
  subject: string;
  attemptedA: number;
  correctA: number;
  accuracyA: number;
  avgTimeA: number;
  attemptedB: number;
  correctB: number;
  accuracyB: number;
  avgTimeB: number;
  accuracyDelta: number;
  timeDelta: number;
}

interface TimeBracketComparison {
  bracket: string;
  countA: number;
  countB: number;
}

export const TestComparisonTool: React.FC<TestComparisonToolProps> = ({
  attempts,
  defaultAttemptIdA,
  defaultAttemptIdB,
  className = '',
}) => {
  // Sort attempts chronologically
  const sortedAttempts = useMemo(() => {
    return [...attempts].sort((a, b) => {
      const ta = (a.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
      const tb = (b.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
      return tb - ta; // newest first
    });
  }, [attempts]);

  // Initial attempt selection:
  // Default: attempt A = 2nd newest (or oldest), attempt B = newest
  const [attemptIdA, setAttemptIdA] = useState<string>(() => {
    if (defaultAttemptIdA && attempts.some((a) => a.id === defaultAttemptIdA)) {
      return defaultAttemptIdA;
    }
    return sortedAttempts[1]?.id || sortedAttempts[0]?.id || '';
  });

  const [attemptIdB, setAttemptIdB] = useState<string>(() => {
    if (defaultAttemptIdB && attempts.some((a) => a.id === defaultAttemptIdB)) {
      return defaultAttemptIdB;
    }
    return sortedAttempts[0]?.id || '';
  });

  React.useEffect(() => {
    if (defaultAttemptIdA && attempts.some((a) => a.id === defaultAttemptIdA)) {
      setAttemptIdA(defaultAttemptIdA);
    }
  }, [defaultAttemptIdA, attempts]);

  React.useEffect(() => {
    if (defaultAttemptIdB && attempts.some((a) => a.id === defaultAttemptIdB)) {
      setAttemptIdB(defaultAttemptIdB);
    }
  }, [defaultAttemptIdB, attempts]);

  const testA = useMemo(() => attempts.find((a) => a.id === attemptIdA) || null, [attempts, attemptIdA]);
  const testB = useMemo(() => attempts.find((a) => a.id === attemptIdB) || null, [attempts, attemptIdB]);

  // Standing estimates
  const standingA = useMemo(() => {
    if (!testA) return null;
    return estimateExamStanding(testA.exam, testA.score, testA.maxScore, testA.accuracyPercent);
  }, [testA]);

  const standingB = useMemo(() => {
    if (!testB) return null;
    return estimateExamStanding(testB.exam, testB.score, testB.maxScore, testB.accuracyPercent);
  }, [testB]);

  // Swap Test A and B
  const handleSwap = () => {
    const temp = attemptIdA;
    setAttemptIdA(attemptIdB);
    setAttemptIdB(temp);
  };

  // Preset: Compare Last 2
  const handleCompareLastTwo = () => {
    if (sortedAttempts.length >= 2) {
      setAttemptIdA(sortedAttempts[1].id);
      setAttemptIdB(sortedAttempts[0].id);
    }
  };

  // Preset: Compare Best vs Latest
  const handleCompareBestVsLatest = () => {
    if (sortedAttempts.length >= 2) {
      const best = [...sortedAttempts].sort((a, b) => b.score - a.score)[0];
      const latest = sortedAttempts[0];
      setAttemptIdA(best.id);
      setAttemptIdB(latest.id);
    }
  };

  // Helper to extract subject metrics
  const getSubjectMetrics = (attempt: TestAttempt | null): Record<string, { attempted: number; correct: number; timeSpent: number }> => {
    const res: Record<string, { attempted: number; correct: number; timeSpent: number }> = {};
    if (!attempt) return res;

    if (attempt.questionResults && attempt.questionResults.length > 0) {
      attempt.questionResults.forEach((qr) => {
        if (!res[qr.subject]) {
          res[qr.subject] = { attempted: 0, correct: 0, timeSpent: 0 };
        }
        if (qr.isAttempted) {
          res[qr.subject].attempted += 1;
          res[qr.subject].timeSpent += qr.timeSpentSeconds || 0;
          if (qr.isCorrect) {
            res[qr.subject].correct += 1;
          }
        }
      });
    } else if (attempt.subjectStats) {
      Object.entries(attempt.subjectStats).forEach(([sub, stats]) => {
        const attempted = (stats.correct || 0) + (stats.incorrect || 0);
        res[sub] = {
          attempted,
          correct: stats.correct || 0,
          timeSpent: Math.round(
            (attempt.timeSpentSeconds || 0) * (attempt.totalQuestions > 0 ? (stats.total || attempted) / attempt.totalQuestions : 0.33)
          ),
        };
      });
    }

    return res;
  };

  // Subject Comparison Data
  const subjectComparison = useMemo(() => {
    if (!testA || !testB) return [];
    const statsA = getSubjectMetrics(testA);
    const statsB = getSubjectMetrics(testB);

    const allSubjects = Array.from(new Set([...Object.keys(statsA), ...Object.keys(statsB)]));

    return allSubjects.map((subject): SubjectStatComparison => {
      const a = statsA[subject] || { attempted: 0, correct: 0, timeSpent: 0 };
      const b = statsB[subject] || { attempted: 0, correct: 0, timeSpent: 0 };

      const accuracyA = a.attempted > 0 ? Math.round((a.correct / a.attempted) * 100) : 0;
      const accuracyB = b.attempted > 0 ? Math.round((b.correct / b.attempted) * 100) : 0;
      const avgTimeA = a.attempted > 0 ? Math.round(a.timeSpent / a.attempted) : 0;
      const avgTimeB = b.attempted > 0 ? Math.round(b.timeSpent / b.attempted) : 0;

      return {
        subject,
        attemptedA: a.attempted,
        correctA: a.correct,
        accuracyA,
        avgTimeA,
        attemptedB: b.attempted,
        correctB: b.correct,
        accuracyB,
        avgTimeB,
        accuracyDelta: accuracyB - accuracyA,
        timeDelta: avgTimeB - avgTimeA,
      };
    });
  }, [testA, testB]);

  // Time-per-question distribution comparison
  const timeDistributions = useMemo(() => {
    if (!testA || !testB) return { brackets: [], quadrantsA: null, quadrantsB: null };

    const computeBrackets = (att: TestAttempt) => {
      let fast = 0; // <45s
      let optimal = 0; // 45-90s
      let extended = 0; // 90-150s
      let timeSink = 0; // >150s

      if (att.questionResults && att.questionResults.length > 0) {
        att.questionResults.forEach((qr) => {
          if (!qr.isAttempted) return;
          const t = qr.timeSpentSeconds || 0;
          if (t < 45) fast += 1;
          else if (t <= 90) optimal += 1;
          else if (t <= 150) extended += 1;
          else timeSink += 1;
        });
      } else {
        const avg = Math.round(att.timeSpentSeconds / Math.max(1, att.attemptedCount || att.totalQuestions));
        const count = att.attemptedCount || att.totalQuestions;
        if (avg < 45) fast = count;
        else if (avg <= 90) optimal = count;
        else if (avg <= 150) extended = count;
        else timeSink = count;
      }

      return { fast, optimal, extended, timeSink };
    };

    const computeQuadrants = (att: TestAttempt) => {
      let fastCorrect = 0;
      let slowCorrect = 0;
      let fastGuessWrong = 0;
      let timeSinkWrong = 0;

      if (att.questionResults && att.questionResults.length > 0) {
        att.questionResults.forEach((qr) => {
          if (!qr.isAttempted) return;
          const t = qr.timeSpentSeconds || 0;
          if (qr.isCorrect) {
            if (t <= 90) fastCorrect += 1;
            else slowCorrect += 1;
          } else {
            if (t <= 45) fastGuessWrong += 1;
            else timeSinkWrong += 1;
          }
        });
      }

      return { fastCorrect, slowCorrect, fastGuessWrong, timeSinkWrong };
    };

    const bA = computeBrackets(testA);
    const bB = computeBrackets(testB);

    const brackets: TimeBracketComparison[] = [
      { bracket: 'Rapid (<45s)', countA: bA.fast, countB: bB.fast },
      { bracket: 'Optimal (45-90s)', countA: bA.optimal, countB: bB.optimal },
      { bracket: 'Extended (90-150s)', countA: bA.extended, countB: bB.extended },
      { bracket: 'Time Sink (>150s)', countA: bA.timeSink, countB: bB.timeSink },
    ];

    return {
      brackets,
      quadrantsA: computeQuadrants(testA),
      quadrantsB: computeQuadrants(testB),
    };
  }, [testA, testB]);

  // Overall metrics & deltas
  const metricsDelta = useMemo(() => {
    if (!testA || !testB) return null;

    const scoreDelta = testB.score - testA.score;
    const accuracyDelta = testB.accuracyPercent - testA.accuracyPercent;
    const avgTimeA = Math.round(testA.timeSpentSeconds / Math.max(1, testA.attemptedCount || testA.totalQuestions));
    const avgTimeB = Math.round(testB.timeSpentSeconds / Math.max(1, testB.attemptedCount || testB.totalQuestions));
    const timeDelta = avgTimeB - avgTimeA; // negative is faster!
    const correctDelta = testB.correctCount - testA.correctCount;
    const incorrectDelta = (testB.incorrectCount || 0) - (testA.incorrectCount || 0);

    return {
      scoreDelta,
      accuracyDelta,
      avgTimeA,
      avgTimeB,
      timeDelta,
      correctDelta,
      incorrectDelta,
    };
  }, [testA, testB]);

  if (attempts.length < 2) {
    return (
      <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center space-y-3 ${className}`}>
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
          <GitCompare className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold font-display">Side-by-Side Test Comparison</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          You need at least 2 completed test attempts to run side-by-side performance comparisons. Complete another test to unlock multi-test velocity and subject accuracy deltas.
        </p>
      </div>
    );
  }

  const formatDelta = (val: number, unit = '', invertColor = false) => {
    if (val === 0) return <span className="text-slate-400 font-mono">0{unit}</span>;
    const isPositive = val > 0;
    const isGood = invertColor ? !isPositive : isPositive;
    return (
      <span
        className={`inline-flex items-center gap-0.5 font-mono font-bold ${
          isGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
        }`}
      >
        {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
        {isPositive ? `+${val}` : `${val}`}
        {unit}
      </span>
    );
  };

  return (
    <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6 ${className}`}>
      {/* Header and Test Selectors */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400">
            <GitCompare className="w-4 h-4" />
            <span>Dual Test Diagnostics</span>
          </div>
          <h2 className="text-lg font-bold font-display mt-0.5">Side-by-Side Test Comparison</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Compare performance metrics, accuracy per subject, and pacing distributions between any two tests.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCompareLastTwo}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
          >
            Compare Last 2
          </button>
          <button
            type="button"
            onClick={handleCompareBestVsLatest}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
          >
            Best vs Latest
          </button>
        </div>
      </div>

      {/* Selectors Bar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        {/* Test A Selector */}
        <div className="md:col-span-5 p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 shrink-0" />
              Baseline Test (A)
            </span>
            {testA && (
              <span className="font-mono text-slate-500 dark:text-slate-400 text-[11px]">
                {testA.score}/{testA.maxScore} · {testA.accuracyPercent}% acc
              </span>
            )}
          </div>
          <select
            value={attemptIdA}
            onChange={(e) => setAttemptIdA(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
          >
            {sortedAttempts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} ({EXAM_LABELS[a.exam]} · {a.score}/{a.maxScore} pts · {a.accuracyPercent}%)
              </option>
            ))}
          </select>
        </div>

        {/* Swap Button */}
        <div className="md:col-span-2 flex justify-center">
          <button
            type="button"
            onClick={handleSwap}
            title="Swap Test A and Test B"
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors shadow-xs cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Test B Selector */}
        <div className="md:col-span-5 p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 shrink-0" />
              Comparison Test (B)
            </span>
            {testB && (
              <span className="font-mono text-slate-500 dark:text-slate-400 text-[11px]">
                {testB.score}/{testB.maxScore} · {testB.accuracyPercent}% acc
              </span>
            )}
          </div>
          <select
            value={attemptIdB}
            onChange={(e) => setAttemptIdB(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
          >
            {sortedAttempts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} ({EXAM_LABELS[a.exam]} · {a.score}/{a.maxScore} pts · {a.accuracyPercent}%)
              </option>
            ))}
          </select>
        </div>
      </div>

      {testA && testB && metricsDelta && (
        <>
          {/* Key Metric Comparison Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Score */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1">
              <div className="text-xs text-slate-500 dark:text-slate-400">Total Score</div>
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-lg font-bold font-mono">
                  {testA.score} <span className="text-xs text-slate-400">→</span> {testB.score}
                </span>
                <span className="text-xs font-semibold">
                  {formatDelta(metricsDelta.scoreDelta, ' pts')}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                Out of {testB.maxScore} max pts
              </div>
            </div>

            {/* Accuracy */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1">
              <div className="text-xs text-slate-500 dark:text-slate-400">Overall Accuracy</div>
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-lg font-bold font-mono">
                  {testA.accuracyPercent}% <span className="text-xs text-slate-400">→</span> {testB.accuracyPercent}%
                </span>
                <span className="text-xs font-semibold">
                  {formatDelta(metricsDelta.accuracyDelta, '%')}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                {testA.correctCount} vs {testB.correctCount} correct Qs
              </div>
            </div>

            {/* Pacing */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1">
              <div className="text-xs text-slate-500 dark:text-slate-400">Time-per-Question</div>
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-lg font-bold font-mono">
                  {metricsDelta.avgTimeA}s <span className="text-xs text-slate-400">→</span> {metricsDelta.avgTimeB}s
                </span>
                <span className="text-xs font-semibold">
                  {formatDelta(metricsDelta.timeDelta, 's', true)}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                {metricsDelta.timeDelta < 0 ? 'Pace accelerated' : metricsDelta.timeDelta > 0 ? 'Pace slowed' : 'Identical pace'}
              </div>
            </div>

            {/* Projected Score / Standing */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1">
              <div className="text-xs text-slate-500 dark:text-slate-400">Estimated Projected Score</div>
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-lg font-bold font-mono text-indigo-600 dark:text-indigo-400">
                  {standingA?.projectedScore} <span className="text-xs text-slate-400">→</span> {standingB?.projectedScore}
                </span>
                {standingA && standingB && (
                  <span className="text-xs font-semibold">
                    {formatDelta(
                      standingB.projectedScore - standingA.projectedScore,
                      ' pts'
                    )}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                {standingB?.bandLabel || 'Standing Band'}
              </div>
            </div>
          </div>

          {/* Section 1: Subject Accuracy Comparison */}
          <div className="space-y-4 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-500" />
                <h3 className="font-bold text-sm font-display">Subject Accuracy Comparison (A vs B)</h3>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Compares mastery percentages per subject between selected tests
              </span>
            </div>

            {/* Side-by-side grouped Bar Chart for subjects */}
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subjectComparison} barGap={8}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.15} />
                  <XAxis dataKey="subject" tick={{ fontSize: 11 }} />
                  <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: '#F8FAFC',
                    }}
                    formatter={(val: any, name: any) => [`${val}%`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }} />
                  <Bar
                    dataKey="accuracyA"
                    name={`Test A: ${testA.title.slice(0, 15)}`}
                    fill="#6366F1"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="accuracyB"
                    name={`Test B: ${testB.title.slice(0, 15)}`}
                    fill="#10B981"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Subject Breakdown Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 pr-4">Subject</th>
                    <th className="py-2.5 px-3 text-right">Attempted (A vs B)</th>
                    <th className="py-2.5 px-3 text-right">Accuracy (A)</th>
                    <th className="py-2.5 px-3 text-right">Accuracy (B)</th>
                    <th className="py-2.5 px-3 text-right">Accuracy Delta</th>
                    <th className="py-2.5 pl-3 text-right">Avg Time Delta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {subjectComparison.map((sub) => (
                    <tr key={sub.subject}>
                      <td className="py-2.5 pr-4 font-sans font-semibold text-slate-800 dark:text-slate-200">
                        {sub.subject}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-400">
                        {sub.attemptedA} Qs → {sub.attemptedB} Qs
                      </td>
                      <td className="py-2.5 px-3 text-right text-indigo-600 dark:text-indigo-400 font-bold">
                        {sub.accuracyA}%
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-600 dark:text-emerald-400 font-bold">
                        {sub.accuracyB}%
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {formatDelta(sub.accuracyDelta, '%')}
                      </td>
                      <td className="py-2.5 pl-3 text-right">
                        {formatDelta(sub.timeDelta, 's', true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Time-per-Question Distribution Comparison */}
          <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-500" />
                <h3 className="font-bold text-sm font-display">Time-per-Question Distribution Comparison</h3>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                Pacing shift: {metricsDelta.avgTimeA}s/Q → {metricsDelta.avgTimeB}s/Q
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              {/* Bracket Bar Chart */}
              <div className="lg:col-span-7 h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeDistributions.brackets} barGap={6}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.15} />
                    <XAxis dataKey="bracket" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0F172A',
                        borderColor: '#334155',
                        borderRadius: '12px',
                        fontSize: '12px',
                        color: '#F8FAFC',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }} />
                    <Bar
                      dataKey="countA"
                      name="Test A Qs"
                      fill="#6366F1"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="countB"
                      name="Test B Qs"
                      fill="#10B981"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Pacing Quadrants Comparison */}
              <div className="lg:col-span-5 space-y-2.5">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Quadrant Shift (Test A → Test B)
                </div>

                {timeDistributions.quadrantsA && timeDistributions.quadrantsB && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {/* Fast Correct */}
                    <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20">
                      <div className="font-semibold text-emerald-800 dark:text-emerald-300 text-[11px]">
                        Fast Correct (≤90s)
                      </div>
                      <div className="text-base font-bold font-mono mt-1 text-emerald-700 dark:text-emerald-400">
                        {timeDistributions.quadrantsA.fastCorrect} → {timeDistributions.quadrantsB.fastCorrect}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {formatDelta(
                          timeDistributions.quadrantsB.fastCorrect - timeDistributions.quadrantsA.fastCorrect,
                          ' Qs'
                        )}
                      </div>
                    </div>

                    {/* Slow Correct */}
                    <div className="p-3 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20">
                      <div className="font-semibold text-blue-800 dark:text-blue-300 text-[11px]">
                        Slow Correct (&gt;90s)
                      </div>
                      <div className="text-base font-bold font-mono mt-1 text-blue-700 dark:text-blue-400">
                        {timeDistributions.quadrantsA.slowCorrect} → {timeDistributions.quadrantsB.slowCorrect}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {formatDelta(
                          timeDistributions.quadrantsB.slowCorrect - timeDistributions.quadrantsA.slowCorrect,
                          ' Qs'
                        )}
                      </div>
                    </div>

                    {/* Fast Guess Wrong */}
                    <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20">
                      <div className="font-semibold text-amber-800 dark:text-amber-300 text-[11px]">
                        Rushed Guess (≤45s)
                      </div>
                      <div className="text-base font-bold font-mono mt-1 text-amber-700 dark:text-amber-400">
                        {timeDistributions.quadrantsA.fastGuessWrong} → {timeDistributions.quadrantsB.fastGuessWrong}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {formatDelta(
                          timeDistributions.quadrantsB.fastGuessWrong - timeDistributions.quadrantsA.fastGuessWrong,
                          ' Qs',
                          true
                        )}
                      </div>
                    </div>

                    {/* Time Sink Wrong */}
                    <div className="p-3 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20">
                      <div className="font-semibold text-rose-800 dark:text-rose-300 text-[11px]">
                        Time Sink Wrong (&gt;45s)
                      </div>
                      <div className="text-base font-bold font-mono mt-1 text-rose-700 dark:text-rose-400">
                        {timeDistributions.quadrantsA.timeSinkWrong} → {timeDistributions.quadrantsB.timeSinkWrong}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {formatDelta(
                          timeDistributions.quadrantsB.timeSinkWrong - timeDistributions.quadrantsA.timeSinkWrong,
                          ' Qs',
                          true
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
