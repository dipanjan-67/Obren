import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Award,
  BarChart3,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  Filter,
  GitCompare,
  Lock,
  Play,
  Scale,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { estimateExamStanding } from '../lib/examMetrics';
import { exportAttemptReportPdf } from '../lib/pdfExport';
import {
  analyzeTestsAndWeakTopics,
  buildBoosterQuestionSet,
  TESTS_REQUIRED_FOR_BOOSTER,
} from '../lib/weakTopicAnalyzer';
import type {
  ActiveTestConfig,
  BookmarkItem,
  ExamType,
  MasteryStatus,
  MistakeLogItem,
  MistakeReasonTag,
  PyqQuestion,
  SubjectType,
  TestAttempt,
} from '../types/obren';
import { EXAM_LABELS } from '../types/obren';
import { ExamPercentileCard } from './ExamPercentileCard';
import { MathText } from './MathText';
import { TestComparisonTool } from './TestComparisonTool';

interface AnalyticsBookmarksViewProps {
  userId: string;
  targetExam?: ExamType;
  attempts: TestAttempt[];
  questions: PyqQuestion[];
  bookmarks: BookmarkItem[];
  mistakeLogs?: MistakeLogItem[];
  onUpdateBookmark: (
    id: string,
    updates: { note?: string; masteryStatus?: MasteryStatus }
  ) => Promise<void>;
  onDeleteBookmark: (id: string) => Promise<void>;
  onUpdateMistakeLog?: (
    id: string,
    updates: { reasonTag?: MistakeReasonTag; resolved?: boolean }
  ) => Promise<void>;
  onDeleteMistakeLog?: (id: string) => Promise<void>;
  onDeleteAttempt?: (attemptId: string) => Promise<void>;
  onLaunchBookmarkTest: (config: ActiveTestConfig) => void;
  onOpenBoosterBuilder: () => void;
}

const REASON_TAGS: Array<{ id: MistakeReasonTag; label: string }> = [
  { id: 'UNSET', label: 'Untagged' },
  { id: 'CONCEPTUAL', label: 'Conceptual Gap' },
  { id: 'FORMULA', label: 'Formula Missed' },
  { id: 'SILLY', label: 'Silly / Calc Error' },
  { id: 'TIME_PRESSURE', label: 'Time Pressure' },
];

export const AnalyticsBookmarksView: React.FC<AnalyticsBookmarksViewProps> = ({
  userId,
  targetExam = 'JEE_MAINS',
  attempts,
  questions,
  bookmarks,
  mistakeLogs = [],
  onUpdateBookmark,
  onDeleteBookmark,
  onUpdateMistakeLog,
  onDeleteMistakeLog,
  onDeleteAttempt,
  onLaunchBookmarkTest,
  onOpenBoosterBuilder,
}) => {
  const [subTab, setSubTab] = useState<'ANALYTICS' | 'COMPARE_TESTS' | 'ERROR_NOTEBOOK' | 'BOOKMARKS'>('ANALYTICS');
  const [selectedAttemptId, setSelectedAttemptId] = useState<string>('');
  const [compareAttemptA, setCompareAttemptA] = useState<string>('');
  const [compareAttemptB, setCompareAttemptB] = useState<string>('');
  const [showQuestionLog, setShowQuestionLog] = useState(false);
  const [qLogOutcomeFilter, setQLogOutcomeFilter] = useState<'ALL' | 'CORRECT' | 'WRONG' | 'SKIPPED'>('ALL');
  const [qLogSubjectFilter, setQLogSubjectFilter] = useState<string>('ALL');
  const [expandedQuestionIdx, setExpandedQuestionIdx] = useState<number | null>(null);
  const [topicSubjectFilter, setTopicSubjectFilter] = useState<string>('ALL');
  const [confirmDeleteAttemptId, setConfirmDeleteAttemptId] = useState<string | null>(null);
  const [deletingAttemptId, setDeletingAttemptId] = useState<string | null>(null);

  const [bookmarkExam, setBookmarkExam] = useState<'ALL' | ExamType>('ALL');
  const [bookmarkMastery, setBookmarkMastery] = useState<'ALL' | MasteryStatus>('ALL');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  // Error Notebook filters
  const [mistakeStatusFilter, setMistakeStatusFilter] = useState<'UNRESOLVED' | 'ALL' | 'RESOLVED'>('UNRESOLVED');
  const [mistakeSubjectFilter, setMistakeSubjectFilter] = useState<string>('ALL');
  const [mistakeTagFilter, setMistakeTagFilter] = useState<'ALL' | MistakeReasonTag>('ALL');

  const questionMap = useMemo(() => {
    const map = new Map<string, PyqQuestion>();
    questions.forEach((q) => map.set(q.id, q));
    return map;
  }, [questions]);

  const formatDurationShort = (seconds: number) => {
    const s = Math.max(0, Math.round(seconds || 0));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    if (mins > 0) return `${mins}m`;
    return `${s}s`;
  };

  const formatAttemptDate = (ts: unknown) => {
    if (!ts) return '';
    try {
      const asObj = ts as { toDate?: () => Date; seconds?: number };
      const d = asObj.toDate
        ? asObj.toDate()
        : typeof asObj.seconds === 'number'
          ? new Date(asObj.seconds * 1000)
          : new Date(ts as string | number);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const summary = useMemo(() => {
    const totalTests = attempts.length;
    const avgAccuracy =
      totalTests > 0
        ? Math.round(attempts.reduce((s, a) => s + a.accuracyPercent, 0) / totalTests)
        : 0;
    const bestScore =
      totalTests > 0 ? Math.max(...attempts.map((a) => a.score)) : 0;
    const bestAttempt = attempts.reduce<TestAttempt | null>(
      (best, cur) => (!best || cur.score > best.score ? cur : best),
      null
    );
    const avgScorePct =
      totalTests > 0
        ? Math.round(
            attempts.reduce(
              (s, a) => s + (a.maxScore > 0 ? (a.score / a.maxScore) * 100 : 0),
              0
            ) / totalTests
          )
        : 0;
    const totalAttempted = attempts.reduce((s, a) => s + (a.attemptedCount || 0), 0);
    const totalQuestionsSeen = attempts.reduce((s, a) => s + (a.totalQuestions || 0), 0);
    const totalCorrect = attempts.reduce((s, a) => s + (a.correctCount || 0), 0);
    const totalIncorrect = attempts.reduce(
      (s, a) => s + (a.incorrectCount ?? Math.max(0, (a.attemptedCount || 0) - (a.correctCount || 0))),
      0
    );
    const totalSkipped = Math.max(0, totalQuestionsSeen - totalAttempted);
    const attemptRatePct =
      totalQuestionsSeen > 0 ? Math.round((totalAttempted / totalQuestionsSeen) * 100) : 0;
    const totalTimeSeconds = attempts.reduce((s, a) => s + (a.timeSpentSeconds || 0), 0);

    // Marks efficiency (positive gained vs negative lost)
    let positiveMarks = 0;
    let negativeMarksLost = 0;
    attempts.forEach((a) => {
      if (a.questionResults && a.questionResults.length > 0) {
        a.questionResults.forEach((qr) => {
          if (qr.marksAwarded > 0) positiveMarks += qr.marksAwarded;
          else if (qr.marksAwarded < 0) negativeMarksLost += Math.abs(qr.marksAwarded);
        });
      } else {
        const estPos = (a.correctCount || 0) * 4;
        const estNeg = Math.max(0, estPos - (a.score || 0));
        positiveMarks += estPos;
        negativeMarksLost += estNeg;
      }
    });

    // Chronological delta for accuracy
    const sortedAsc = [...attempts].sort((a, b) => {
      const ta = (a.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
      const tb = (b.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
      return ta - tb;
    });
    const accuracyDelta =
      sortedAsc.length >= 2
        ? sortedAsc[sortedAsc.length - 1].accuracyPercent - sortedAsc[0].accuracyPercent
        : 0;

    return {
      totalTests,
      avgAccuracy,
      bestScore,
      bestMaxScore: bestAttempt?.maxScore || 0,
      avgScorePct,
      totalAttempted,
      totalQuestionsSeen,
      totalCorrect,
      totalIncorrect,
      totalSkipped,
      attemptRatePct,
      totalTimeSeconds,
      positiveMarks,
      negativeMarksLost,
      accuracyDelta,
    };
  }, [attempts]);

  const analysisReport = useMemo(
    () => analyzeTestsAndWeakTopics(attempts, questions, 'ALL'),
    [attempts, questions]
  );

  const subjectMasteryData = useMemo(() => {
    const stats: Record<
      SubjectType,
      { totalCorrect: number; totalQuestionsSolved: number; totalSeen: number }
    > = {
      Physics: { totalCorrect: 0, totalQuestionsSolved: 0, totalSeen: 0 },
      Chemistry: { totalCorrect: 0, totalQuestionsSolved: 0, totalSeen: 0 },
      Mathematics: { totalCorrect: 0, totalQuestionsSolved: 0, totalSeen: 0 },
      Biology: { totalCorrect: 0, totalQuestionsSolved: 0, totalSeen: 0 },
    };

    attempts.forEach((a) => {
      if (a.questionResults && a.questionResults.length > 0) {
        a.questionResults.forEach((qr) => {
          const sub = qr.subject;
          if (!stats[sub]) return;
          stats[sub].totalSeen += 1;
          if (qr.isAttempted) {
            stats[sub].totalQuestionsSolved += 1;
          }
          if (qr.isCorrect) {
            stats[sub].totalCorrect += 1;
          }
        });
      } else if (a.subjectStats) {
        Object.entries(a.subjectStats).forEach(([subKey, val]) => {
          const sub = subKey as SubjectType;
          if (!stats[sub]) return;
          const correct = val.correct || 0;
          const incorrect = val.incorrect || 0;
          stats[sub].totalCorrect += correct;
          stats[sub].totalQuestionsSolved += correct + incorrect;
          stats[sub].totalSeen += val.total || correct + incorrect;
        });
      }
    });

    const subjectsToDisplay: SubjectType[] = ['Physics', 'Chemistry'];
    if (stats.Mathematics.totalSeen > 0 && stats.Biology.totalSeen > 0) {
      subjectsToDisplay.push('Mathematics', 'Biology');
    } else if (stats.Biology.totalSeen > 0 || targetExam === 'NEET') {
      subjectsToDisplay.push('Biology');
    } else {
      subjectsToDisplay.push('Mathematics');
    }

    return subjectsToDisplay.map((subject) => {
      const s = stats[subject];
      const accuracyPercent =
        s.totalQuestionsSolved > 0
          ? Math.round((s.totalCorrect / s.totalQuestionsSolved) * 100)
          : 0;
      const status: 'WEAK' | 'NEEDS_WORK' | 'STRONG' | 'NO_DATA' =
        s.totalQuestionsSolved === 0
          ? 'NO_DATA'
          : accuracyPercent < 55
            ? 'WEAK'
            : accuracyPercent < 75
              ? 'NEEDS_WORK'
              : 'STRONG';
      return {
        subject,
        totalCorrect: s.totalCorrect,
        totalQuestionsSolved: s.totalQuestionsSolved,
        accuracyPercent,
        status,
      };
    });
  }, [attempts, targetExam]);

  const weakestSubject = useMemo(() => {
    const withData = subjectMasteryData.filter((d) => d.totalQuestionsSolved > 0);
    if (withData.length === 0) return null;
    return [...withData].sort(
      (a, b) => a.accuracyPercent - b.accuracyPercent || b.totalQuestionsSolved - a.totalQuestionsSolved
    )[0];
  }, [subjectMasteryData]);

  const activeAttemptDiagnostic = useMemo(() => {
    if (analysisReport.perTestDiagnostics.length === 0) return null;
    return (
      analysisReport.perTestDiagnostics.find((d) => d.attemptId === selectedAttemptId) ||
      analysisReport.perTestDiagnostics[0]
    );
  }, [analysisReport.perTestDiagnostics, selectedAttemptId]);

  const activeRawAttempt = useMemo(
    () =>
      attempts.find((a) => a.id === activeAttemptDiagnostic?.attemptId) ||
      attempts[0] ||
      null,
    [attempts, activeAttemptDiagnostic]
  );

  const activeAttemptStanding = useMemo(() => {
    if (!activeAttemptDiagnostic) return null;
    return estimateExamStanding(
      activeAttemptDiagnostic.exam,
      activeAttemptDiagnostic.score,
      activeAttemptDiagnostic.maxScore,
      activeAttemptDiagnostic.accuracyPercent
    );
  }, [activeAttemptDiagnostic]);

  const timeVsAccuracyQuadrants = useMemo(() => {
    if (!activeRawAttempt?.questionResults?.length) return null;
    let fastCorrect = 0;
    let slowCorrect = 0;
    let fastGuessWrong = 0;
    let timeSinkWrong = 0;
    let positiveMarks = 0;
    let negativeMarksLost = 0;
    let recoverableGuessMarks = 0;

    activeRawAttempt.questionResults.forEach((qr) => {
      if (qr.marksAwarded > 0) positiveMarks += qr.marksAwarded;
      else if (qr.marksAwarded < 0) negativeMarksLost += Math.abs(qr.marksAwarded);

      if (!qr.isAttempted) return;
      const t = qr.timeSpentSeconds || 0;
      if (qr.isCorrect) {
        if (t <= 90) fastCorrect += 1;
        else slowCorrect += 1;
      } else {
        if (t <= 45) {
          fastGuessWrong += 1;
          recoverableGuessMarks += Math.abs(qr.marksAwarded || 1);
        } else {
          timeSinkWrong += 1;
        }
      }
    });

    return {
      fastCorrect,
      slowCorrect,
      fastGuessWrong,
      timeSinkWrong,
      positiveMarks,
      negativeMarksLost,
      recoverableGuessMarks,
    };
  }, [activeRawAttempt]);

  const activeTestSubjectBreakdown = useMemo(() => {
    if (!activeRawAttempt) return [];
    const map = new Map<
      string,
      {
        subject: string;
        total: number;
        attempted: number;
        correct: number;
        wrong: number;
        skipped: number;
        netScore: number;
        negativeLost: number;
        timeSum: number;
      }
    >();

    if (activeRawAttempt.questionResults && activeRawAttempt.questionResults.length > 0) {
      activeRawAttempt.questionResults.forEach((qr) => {
        const cur = map.get(qr.subject) || {
          subject: qr.subject,
          total: 0,
          attempted: 0,
          correct: 0,
          wrong: 0,
          skipped: 0,
          netScore: 0,
          negativeLost: 0,
          timeSum: 0,
        };
        cur.total += 1;
        cur.timeSum += qr.timeSpentSeconds || 0;
        cur.netScore += qr.marksAwarded || 0;
        if (qr.marksAwarded < 0) cur.negativeLost += Math.abs(qr.marksAwarded);
        if (qr.isAttempted) {
          cur.attempted += 1;
          if (qr.isCorrect) cur.correct += 1;
          else cur.wrong += 1;
        } else {
          cur.skipped += 1;
        }
        map.set(qr.subject, cur);
      });
    } else if (activeRawAttempt.subjectStats) {
      Object.entries(activeRawAttempt.subjectStats).forEach(([subject, s]) => {
        const correct = s.correct || 0;
        const wrong = s.incorrect || 0;
        const total = s.total || correct + wrong;
        const attempted = correct + wrong;
        map.set(subject, {
          subject,
          total,
          attempted,
          correct,
          wrong,
          skipped: Math.max(0, total - attempted),
          netScore: s.score || 0,
          negativeLost: Math.max(0, correct * 4 - (s.score || 0)),
          timeSum: 0,
        });
      });
    }

    return Array.from(map.values()).map((row) => ({
      ...row,
      accuracyPercent: row.attempted > 0 ? Math.round((row.correct / row.attempted) * 100) : 0,
      avgTimeSec: row.attempted > 0 && row.timeSum > 0 ? Math.round(row.timeSum / row.attempted) : 0,
    }));
  }, [activeRawAttempt]);

  const scoreTrajectoryData = useMemo(() => {
    const sorted = [...attempts].sort((a, b) => {
      const ta = (a.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
      const tb = (b.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
      return ta - tb;
    });
    const recent = sorted.slice(-12);
    const items = recent.map((a, idx) => {
      const scorePct = a.maxScore > 0 ? Math.max(0, Math.round((a.score / a.maxScore) * 100)) : 0;
      return {
        label: `T${idx + 1}`,
        testTitle: a.title || `Test ${idx + 1}`,
        score: a.score,
        maxScore: a.maxScore,
        scorePct,
        accuracyPercent: a.accuracyPercent,
      };
    });
    const scoreDelta =
      items.length >= 2 ? items[items.length - 1].scorePct - items[0].scorePct : 0;
    return { items, scoreDelta };
  }, [attempts]);

  const filteredTopicDiagnostics = useMemo(() => {
    if (topicSubjectFilter === 'ALL') return analysisReport.topicDiagnostics;
    return analysisReport.topicDiagnostics.filter((td) => td.subject === topicSubjectFilter);
  }, [analysisReport.topicDiagnostics, topicSubjectFilter]);

  const filteredActiveQuestionLog = useMemo(() => {
    if (!activeRawAttempt?.questionResults) return [];
    return activeRawAttempt.questionResults
      .map((qr, index) => ({ qr, originalIndex: index }))
      .filter(({ qr }) => {
        if (qLogSubjectFilter !== 'ALL' && qr.subject !== qLogSubjectFilter) return false;
        if (qLogOutcomeFilter === 'CORRECT' && !qr.isCorrect) return false;
        if (qLogOutcomeFilter === 'WRONG' && (!qr.isAttempted || qr.isCorrect)) return false;
        if (qLogOutcomeFilter === 'SKIPPED' && qr.isAttempted) return false;
        return true;
      });
  }, [activeRawAttempt, qLogOutcomeFilter, qLogSubjectFilter]);

  const filteredBookmarks = useMemo(() => {
    return bookmarks.filter((b) => {
      if (bookmarkExam !== 'ALL' && b.exam !== bookmarkExam) return false;
      if (bookmarkMastery !== 'ALL' && b.masteryStatus !== bookmarkMastery) return false;
      return true;
    });
  }, [bookmarks, bookmarkExam, bookmarkMastery]);

  const filteredMistakes = useMemo(() => {
    return mistakeLogs.filter((m) => {
      if (mistakeStatusFilter === 'UNRESOLVED' && m.resolved) return false;
      if (mistakeStatusFilter === 'RESOLVED' && !m.resolved) return false;
      if (mistakeSubjectFilter !== 'ALL' && m.subject !== mistakeSubjectFilter) return false;
      if (mistakeTagFilter !== 'ALL' && m.reasonTag !== mistakeTagFilter) return false;
      return true;
    });
  }, [mistakeLogs, mistakeStatusFilter, mistakeSubjectFilter, mistakeTagFilter]);

  const unresolvedMistakeCount = useMemo(
    () => mistakeLogs.filter((m) => !m.resolved).length,
    [mistakeLogs]
  );

  // Trend: Reduction in Time-per-Question over the last 10 tests, categorized by subject
  const timePerQuestionTrend = useMemo(() => {
    const sorted = [...attempts].sort((a, b) => {
      const ta = (a.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
      const tb = (b.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
      return ta - tb;
    });

    const last10 = sorted.slice(-10);
    if (last10.length === 0) {
      return {
        data: [] as Array<{
          name: string;
          testTitle: string;
          overallAvg: number;
          Physics?: number;
          Chemistry?: number;
          Mathematics?: number;
          Biology?: number;
        }>,
        speedupSummary: null,
        subjectsPresent: [] as SubjectType[],
      };
    }

    const subjectsPresentSet = new Set<SubjectType>();

    const data = last10.map((att, idx) => {
      const label = `T${idx + 1}`;
      const entry: {
        name: string;
        testTitle: string;
        overallAvg: number;
        Physics?: number;
        Chemistry?: number;
        Mathematics?: number;
        Biology?: number;
      } = {
        name: label,
        testTitle: att.title || `Test ${idx + 1}`,
        overallAvg: 0,
      };

      const subTotals: Record<SubjectType, { time: number; count: number }> = {
        Physics: { time: 0, count: 0 },
        Chemistry: { time: 0, count: 0 },
        Mathematics: { time: 0, count: 0 },
        Biology: { time: 0, count: 0 },
      };

      let totalAttemptedTime = 0;
      let totalAttemptedCount = 0;

      if (att.questionResults && att.questionResults.length > 0) {
        att.questionResults.forEach((qr) => {
          if (qr.isAttempted && qr.timeSpentSeconds > 0) {
            totalAttemptedTime += qr.timeSpentSeconds;
            totalAttemptedCount += 1;
            if (subTotals[qr.subject]) {
              subTotals[qr.subject].time += qr.timeSpentSeconds;
              subTotals[qr.subject].count += 1;
              subjectsPresentSet.add(qr.subject);
            }
          }
        });
      }

      if (totalAttemptedCount > 0) {
        entry.overallAvg = Math.round(totalAttemptedTime / totalAttemptedCount);
        (Object.keys(subTotals) as SubjectType[]).forEach((sub) => {
          if (subTotals[sub].count > 0) {
            entry[sub] = Math.round(subTotals[sub].time / subTotals[sub].count);
          }
        });
      } else if (att.timeSpentSeconds > 0) {
        const fallbackCount = Math.max(1, att.attemptedCount || att.totalQuestions);
        const fallbackAvg = Math.round(att.timeSpentSeconds / fallbackCount);
        entry.overallAvg = fallbackAvg;
        entry.Physics = fallbackAvg;
        entry.Chemistry = fallbackAvg;
        subjectsPresentSet.add('Physics');
        subjectsPresentSet.add('Chemistry');
        if (targetExam === 'NEET') {
          entry.Biology = fallbackAvg;
          subjectsPresentSet.add('Biology');
        } else {
          entry.Mathematics = fallbackAvg;
          subjectsPresentSet.add('Mathematics');
        }
      }

      return entry;
    });

    let speedupSummary: {
      firstAvg: number;
      latestAvg: number;
      diffSeconds: number;
      percentReduction: number;
    } | null = null;

    if (data.length >= 2) {
      const firstValid = data.find((d) => d.overallAvg > 0);
      const latestValid = [...data].reverse().find((d) => d.overallAvg > 0);
      if (firstValid && latestValid && firstValid !== latestValid) {
        const diffSeconds = firstValid.overallAvg - latestValid.overallAvg;
        const percentReduction = Math.round((diffSeconds / firstValid.overallAvg) * 100);
        speedupSummary = {
          firstAvg: firstValid.overallAvg,
          latestAvg: latestValid.overallAvg,
          diffSeconds,
          percentReduction,
        };
      }
    }

    // Default subject lines if none detected yet
    if (subjectsPresentSet.size === 0) {
      subjectsPresentSet.add('Physics');
      subjectsPresentSet.add('Chemistry');
      if (targetExam === 'NEET') subjectsPresentSet.add('Biology');
      else subjectsPresentSet.add('Mathematics');
    }

    return {
      data,
      speedupSummary,
      subjectsPresent: Array.from(subjectsPresentSet),
    };
  }, [attempts, targetExam]);

  // Distribution: Ratio of Easy, Medium, and Hard questions attempted across all mock tests
  const difficultyDistributionData = useMemo(() => {
    const qMap = new Map<string, PyqQuestion>();
    questions.forEach((q) => qMap.set(q.id, q));

    const tierStats: Record<'EASY' | 'MEDIUM' | 'HARD', { count: number; correct: number }> = {
      EASY: { count: 0, correct: 0 },
      MEDIUM: { count: 0, correct: 0 },
      HARD: { count: 0, correct: 0 },
    };

    let totalAttempted = 0;

    attempts.forEach((att) => {
      if (att.questionResults && att.questionResults.length > 0) {
        att.questionResults.forEach((qr) => {
          if (!qr.isAttempted) return;
          totalAttempted += 1;
          const q = qMap.get(qr.questionId);
          const diff: 'EASY' | 'MEDIUM' | 'HARD' = q?.difficulty || 'MEDIUM';
          tierStats[diff].count += 1;
          if (qr.isCorrect) {
            tierStats[diff].correct += 1;
          }
        });
      }
    });

    // Standard NTA competitive exam blueprint target benchmark
    const benchmarks: Record<'EASY' | 'MEDIUM' | 'HARD', number> = {
      EASY: 30,
      MEDIUM: 50,
      HARD: 20,
    };

    const labels: Record<'EASY' | 'MEDIUM' | 'HARD', string> = {
      EASY: 'Easy',
      MEDIUM: 'Medium',
      HARD: 'Hard',
    };

    const chartData = (['EASY', 'MEDIUM', 'HARD'] as const).map((tier) => {
      const stats = tierStats[tier];
      const userRatio = totalAttempted > 0 ? Math.round((stats.count / totalAttempted) * 100) : 0;
      const accuracy = stats.count > 0 ? Math.round((stats.correct / stats.count) * 100) : 0;
      const targetRatio = benchmarks[tier];

      let status: 'UNDER' | 'OPTIMAL' | 'OVER' = 'OPTIMAL';
      if (tier === 'HARD') {
        if (userRatio < 12) status = 'UNDER';
        else if (userRatio > 35) status = 'OVER';
      } else if (tier === 'EASY') {
        if (userRatio > 45) status = 'OVER';
        else if (userRatio < 15) status = 'UNDER';
      } else {
        if (userRatio < 35) status = 'UNDER';
        else if (userRatio > 65) status = 'OVER';
      }

      return {
        tierKey: tier,
        name: labels[tier],
        count: stats.count,
        correct: stats.correct,
        userRatio,
        targetRatio,
        accuracy,
        status,
      };
    });

    let diagnosisText = 'Balanced difficulty distribution across all tiers.';
    let diagnosisType: 'OPTIMAL' | 'OVER_EASY' | 'UNDER_HARD' | 'INSUFFICIENT' = 'OPTIMAL';

    if (totalAttempted < 5) {
      diagnosisText =
        'Attempt more questions in mock tests to unlock deep difficulty tier balance diagnostics.';
      diagnosisType = 'INSUFFICIENT';
    } else {
      const hardTier = chartData.find((d) => d.tierKey === 'HARD');
      const easyTier = chartData.find((d) => d.tierKey === 'EASY');

      if (hardTier && hardTier.userRatio < 12) {
        diagnosisText = `Under-preparing on Hard questions (${hardTier.userRatio}% vs ${hardTier.targetRatio}% recommended target). Increase Advanced PYQ practice to build high-rank problem-solving resilience.`;
        diagnosisType = 'UNDER_HARD';
      } else if (easyTier && easyTier.userRatio > 48) {
        diagnosisText = `Over-indexed on Easy questions (${easyTier.userRatio}% vs ${easyTier.targetRatio}% blueprint). Shift focus toward Medium multi-step and Hard conceptual questions.`;
        diagnosisType = 'OVER_EASY';
      } else {
        diagnosisText = `Healthy preparation ratio aligned with actual NTA ${targetExam === 'NEET' ? 'NEET' : 'JEE'} blueprint (~30% Easy, ~50% Medium, ~20% Hard).`;
        diagnosisType = 'OPTIMAL';
      }
    }

    return {
      chartData,
      totalAttempted,
      diagnosisText,
      diagnosisType,
    };
  }, [attempts, questions, targetExam]);

  const handleStartBookmarkDrill = () => {
    if (filteredBookmarks.length === 0) return;
    const drillQs: PyqQuestion[] = filteredBookmarks.map((b) => ({
      id: b.questionId,
      ownerId: userId,
      bankId: 'bookmark-review',
      visibility: 'PRIVATE',
      exam: b.exam,
      classLevel: b.classLevel || '12',
      subject: (b.subject as SubjectType) || 'Physics',
      topic: b.topic || 'Bookmarked Revision',
      questionType: b.options && b.options.length > 0 ? 'MCQ' : 'NUMERICAL',
      prompt: b.prompt,
      options: b.options || [],
      correctAnswer: b.correctAnswer,
      solution: b.solution || '',
      ...(b.imageUrl ? { imageUrl: b.imageUrl } : {}),
      difficulty: 'HARD',
    }));

    onLaunchBookmarkTest({
      title: `Bookmarked Questions Revision (${drillQs.length} Qs)`,
      exam: drillQs[0].exam,
      testMode: 'BOOKMARK_REVIEW',
      classLevel: 'ALL',
      subjectFilter: 'Bookmarked',
      topicFilter: 'Mixed',
      durationSeconds: Math.max(10, drillQs.length * 2) * 60,
      questions: drillQs,
    });
  };

  const handleLaunchMistakeRetest = () => {
    const pool = filteredMistakes.length > 0 ? filteredMistakes : mistakeLogs.filter((m) => !m.resolved);
    if (pool.length === 0) return;
    const drillQs: PyqQuestion[] = pool.slice(0, 30).map((m) => ({
      id: m.questionId,
      ownerId: userId,
      bankId: 'mistake-notebook',
      visibility: 'PRIVATE',
      exam: m.exam,
      classLevel: m.classLevel || '12',
      subject: m.subject,
      topic: m.topic,
      questionType: m.questionType || (m.options && m.options.length > 0 ? 'MCQ' : 'NUMERICAL'),
      prompt: m.prompt,
      options: m.options || [],
      correctAnswer: m.correctAnswer,
      solution: m.solution || '',
      ...(m.imageUrl ? { imageUrl: m.imageUrl } : {}),
      difficulty: 'MEDIUM',
    }));

    onLaunchBookmarkTest({
      title: `Error Notebook Re-Test (${drillQs.length} Qs)`,
      exam: drillQs[0].exam,
      testMode: 'MISTAKE_REVIEW',
      classLevel: 'ALL',
      subjectFilter: 'Error Notebook',
      topicFilter: 'Past Mistakes',
      durationSeconds: Math.max(10, drillQs.length * 2) * 60,
      questions: drillQs,
      markingCorrect: 4,
      markingIncorrect: -1,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight">
            Analytics, Error Notebook & Bookmarks
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Deep per-test diagnostics, rank projection, automatic mistake notebook, and bookmarked PYQs.
          </p>
        </div>

        <div className="inline-flex flex-wrap p-1 bg-slate-200/70 dark:bg-slate-800 rounded-xl self-start">
          <button
            type="button"
            onClick={() => setSubTab('ANALYTICS')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'ANALYTICS'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Analytics ({attempts.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('COMPARE_TESTS')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'COMPARE_TESTS'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <GitCompare className="w-4 h-4 text-indigo-500" />
            <span>Compare Tests</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('ERROR_NOTEBOOK')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'ERROR_NOTEBOOK'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <AlertCircle className="w-4 h-4 text-rose-500" />
            <span>Error Notebook ({unresolvedMistakeCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('BOOKMARKS')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'BOOKMARKS'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Bookmark className="w-4 h-4" />
            <span>Bookmarks ({bookmarks.length})</span>
          </button>
        </div>
      </div>

      {subTab === 'ANALYTICS' && (
        <div className="space-y-6">
          {/* Primary Performance KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Tests Completed</span>
                <BarChart3 className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-50">
                {summary.totalTests}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {summary.totalTimeSeconds > 0
                  ? `${formatDurationShort(summary.totalTimeSeconds)} exam time invested`
                  : 'Complete a mock to log exam time'}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Average Accuracy</span>
                <Target className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="flex items-baseline gap-2.5">
                <span className="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  {summary.avgAccuracy}%
                </span>
                {summary.totalTests >= 2 && summary.accuracyDelta !== 0 && (
                  <span
                    className={`text-[11px] font-mono tabular-nums font-semibold ${
                      summary.accuracyDelta > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {summary.accuracyDelta > 0 ? `+${summary.accuracyDelta}%` : `${summary.accuracyDelta}%`} trend
                  </span>
                )}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {summary.attemptRatePct}% attempt rate across {summary.totalQuestionsSeen} Qs
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Highest Score</span>
                <Award className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                  {summary.bestScore}
                </span>
                {summary.bestMaxScore > 0 && (
                  <span className="text-xs font-mono tabular-nums text-slate-400">
                    / {summary.bestMaxScore}
                  </span>
                )}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {summary.avgScorePct}% mean score yield across tests
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Marks Efficiency</span>
                <Zap className="w-4 h-4 text-amber-500" />
              </div>
              <div className="flex items-baseline gap-2 font-mono tabular-nums">
                <span className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                  +{summary.positiveMarks}
                </span>
                <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  -{summary.negativeMarksLost} lost
                </span>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {summary.totalCorrect} right · {summary.totalIncorrect} wrong · {summary.totalSkipped} skipped
              </div>
            </div>
          </div>

          {attempts.length > 0 && (
            <ExamPercentileCard
              exam={targetExam}
              score={attempts[0]?.score || summary.bestScore}
              maxScore={attempts[0]?.maxScore || (targetExam === 'NEET' ? 720 : targetExam === 'JEE_ADV' ? 360 : 300)}
              accuracyPercent={summary.avgAccuracy}
              title="Overall Projected Exam Standing & Rank Band"
            />
          )}

          {/* Score & Accuracy Trajectory + Outcome Composition */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                    <TrendingUp className="w-4 h-4" />
                    <span>Score & Accuracy Trajectory</span>
                  </div>
                  <h2 className="text-lg font-bold font-display mt-0.5">
                    Test Performance Progression (Last {Math.max(1, scoreTrajectoryData.items.length)} Tests)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Tracks normalized Score % against Accuracy % over chronological attempts to show consistency under exam conditions.
                  </p>
                </div>

                {scoreTrajectoryData.items.length >= 2 && (
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono tabular-nums font-bold self-start ${
                      scoreTrajectoryData.scoreDelta >= 0
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300'
                        : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {scoreTrajectoryData.scoreDelta >= 0 ? (
                      <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>
                      {scoreTrajectoryData.scoreDelta >= 0
                        ? `+${scoreTrajectoryData.scoreDelta}%`
                        : `${scoreTrajectoryData.scoreDelta}%`}{' '}
                      Score Shift
                    </span>
                  </div>
                )}
              </div>

              {scoreTrajectoryData.items.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400 text-center px-4">
                  Complete mock tests to plot your chronological Score % and Accuracy % progression curve.
                </div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={scoreTrajectoryData.items} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
                      <defs>
                        <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366F1" stopOpacity={0.32} />
                          <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="accGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.28} />
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.15} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0F172A',
                          borderColor: '#334155',
                          borderRadius: '12px',
                          fontSize: '12px',
                          color: '#F8FAFC',
                        }}
                        formatter={(value: any, name: any) => [`${value}%`, name]}
                        labelFormatter={(label: any, payload: any) => {
                          const item = payload?.[0]?.payload;
                          return item?.testTitle
                            ? `${label}: ${item.testTitle} (${item.score}/${item.maxScore})`
                            : label;
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                      <Area
                        type="monotone"
                        dataKey="scorePct"
                        name="Score (%)"
                        stroke="#6366F1"
                        strokeWidth={2.5}
                        fill="url(#scoreGrad)"
                        dot={{ r: 3.5 }}
                        activeDot={{ r: 5.5 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="accuracyPercent"
                        name="Accuracy (%)"
                        stroke="#10B981"
                        strokeWidth={2.5}
                        fill="url(#accGrad)"
                        dot={{ r: 3.5 }}
                        activeDot={{ r: 5.5 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Attempt Outcome & Negative Marking Leakage Panel */}
            <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-between gap-5">
              <div>
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  Cumulative Question Audit
                </div>
                <h2 className="text-lg font-bold font-display mt-0.5">
                  Outcome & Negative Impact
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Breakdown of all {summary.totalQuestionsSeen} questions encountered across tests.
                </p>
              </div>

              {summary.totalQuestionsSeen === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                  No question history recorded yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Segmented Bar */}
                  <div className="space-y-2">
                    <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex">
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{
                          width: `${Math.round((summary.totalCorrect / summary.totalQuestionsSeen) * 100)}%`,
                        }}
                        title={`Correct: ${summary.totalCorrect}`}
                      />
                      <div
                        className="h-full bg-rose-500 transition-all"
                        style={{
                          width: `${Math.round((summary.totalIncorrect / summary.totalQuestionsSeen) * 100)}%`,
                        }}
                        title={`Incorrect: ${summary.totalIncorrect}`}
                      />
                      <div
                        className="h-full bg-slate-400/60 dark:bg-slate-600 transition-all"
                        style={{
                          width: `${Math.round((summary.totalSkipped / summary.totalQuestionsSeen) * 100)}%`,
                        }}
                        title={`Skipped: ${summary.totalSkipped}`}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1 text-xs font-mono tabular-nums">
                      <div className="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200/70 dark:border-emerald-900/50">
                        <div className="text-[10px] font-sans font-semibold text-emerald-700 dark:text-emerald-400">
                          Correct
                        </div>
                        <div className="text-base font-bold mt-0.5">{summary.totalCorrect}</div>
                        <div className="text-[10px] text-slate-500">
                          {Math.round((summary.totalCorrect / summary.totalQuestionsSeen) * 100)}%
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/25 border border-rose-200/70 dark:border-rose-900/50">
                        <div className="text-[10px] font-sans font-semibold text-rose-700 dark:text-rose-400">
                          Wrong
                        </div>
                        <div className="text-base font-bold mt-0.5">{summary.totalIncorrect}</div>
                        <div className="text-[10px] text-slate-500">
                          {Math.round((summary.totalIncorrect / summary.totalQuestionsSeen) * 100)}%
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
                        <div className="text-[10px] font-sans font-semibold text-slate-600 dark:text-slate-400">
                          Skipped
                        </div>
                        <div className="text-base font-bold mt-0.5">{summary.totalSkipped}</div>
                        <div className="text-[10px] text-slate-500">
                          {Math.round((summary.totalSkipped / summary.totalQuestionsSeen) * 100)}%
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Negative Marks Impact Box */}
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-300 font-semibold">
                        Gross Positive Marks
                      </span>
                      <span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                        +{summary.positiveMarks}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-300 font-semibold">
                        Negative Marks Leakage
                      </span>
                      <span className="font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400">
                        -{summary.negativeMarksLost}
                      </span>
                    </div>
                    <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Retention Ratio</span>
                      <span className="font-mono tabular-nums font-bold text-indigo-600 dark:text-indigo-400">
                        {summary.positiveMarks > 0
                          ? `${Math.max(0, Math.round(((summary.positiveMarks - summary.negativeMarksLost) / summary.positiveMarks) * 100))}%`
                          : '0%'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Time-per-Question Reduction Trend (Last 10 Tests by Subject) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                  <Clock className="w-4 h-4" />
                  <span>Velocity Diagnostics</span>
                </div>
                <h2 className="text-lg font-bold font-display mt-0.5">
                  Time-per-Question Trend (Last 10 Tests)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Visualizes pacing and time reduction per question across subjects. Lower seconds indicate faster, more automatic problem solving.
                </p>
              </div>

              {timePerQuestionTrend.speedupSummary && (
                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold self-start font-mono tabular-nums">
                  {timePerQuestionTrend.speedupSummary.diffSeconds > 0 ? (
                    <>
                      <TrendingDown className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>
                        Pace improved by {timePerQuestionTrend.speedupSummary.diffSeconds}s/Q (-{timePerQuestionTrend.speedupSummary.percentReduction}%)
                      </span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>
                        Current Pace: {timePerQuestionTrend.speedupSummary.latestAvg}s/Q
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            {timePerQuestionTrend.data.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400 text-center px-4">
                Complete mock tests to generate your speed-per-question velocity trendline.
              </div>
            ) : (
              <>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timePerQuestionTrend.data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.15} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis
                        unit="s"
                        tick={{ fontSize: 11 }}
                        domain={[0, 'auto']}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0F172A',
                          borderColor: '#334155',
                          borderRadius: '12px',
                          fontSize: '12px',
                          color: '#F8FAFC',
                        }}
                        formatter={(value: any, name: any) => [`${value}s / question`, name]}
                        labelFormatter={(label: any, payload: any) => {
                          const item = payload?.[0]?.payload;
                          return item?.testTitle ? `${label}: ${item.testTitle}` : label;
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                      <ReferenceLine
                        y={targetExam === 'NEET' ? 60 : 120}
                        stroke="#94A3B8"
                        strokeDasharray="4 4"
                        label={{
                          value: targetExam === 'NEET' ? 'NEET Benchmark (60s)' : 'JEE Target (120s)',
                          fill: '#94A3B8',
                          fontSize: 10,
                          position: 'top',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="Physics"
                        name="Physics"
                        stroke="#3B82F6"
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="Chemistry"
                        name="Chemistry"
                        stroke="#10B981"
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                        connectNulls
                      />
                      {timePerQuestionTrend.subjectsPresent.includes('Mathematics') && (
                        <Line
                          type="monotone"
                          dataKey="Mathematics"
                          name="Mathematics"
                          stroke="#8B5CF6"
                          strokeWidth={2.5}
                          dot={{ r: 4 }}
                          activeDot={{ r: 6 }}
                          connectNulls
                        />
                      )}
                      {timePerQuestionTrend.subjectsPresent.includes('Biology') && (
                        <Line
                          type="monotone"
                          dataKey="Biology"
                          name="Biology"
                          stroke="#EC4899"
                          strokeWidth={2.5}
                          dot={{ r: 4 }}
                          activeDot={{ r: 6 }}
                          connectNulls
                        />
                      )}
                      <Line
                        type="monotone"
                        dataKey="overallAvg"
                        name="Overall Pace"
                        stroke="#F59E0B"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs">
                    <div className="text-slate-500 dark:text-slate-400">Tests Analyzed</div>
                    <div className="font-bold text-sm font-mono tabular-nums mt-0.5">
                      {timePerQuestionTrend.data.length} Recent Tests
                    </div>
                  </div>
                  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs">
                    <div className="text-slate-500 dark:text-slate-400">Latest Test Avg</div>
                    <div className="font-bold text-sm font-mono tabular-nums mt-0.5 text-indigo-600 dark:text-indigo-400">
                      {timePerQuestionTrend.data[timePerQuestionTrend.data.length - 1]?.overallAvg || 0}s / Q
                    </div>
                  </div>
                  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs">
                    <div className="text-slate-500 dark:text-slate-400">Recommended Pace</div>
                    <div className="font-bold text-sm font-mono tabular-nums mt-0.5 text-slate-700 dark:text-slate-300">
                      {targetExam === 'NEET' ? '≤ 60s' : '≤ 120s'} / Q
                    </div>
                  </div>
                  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs">
                    <div className="text-slate-500 dark:text-slate-400">Velocity Status</div>
                    <div className="font-bold text-sm font-mono mt-0.5 text-emerald-600 dark:text-emerald-400">
                      {timePerQuestionTrend.speedupSummary && timePerQuestionTrend.speedupSummary.diffSeconds > 0
                        ? 'Accelerating'
                        : 'Calibrating'}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Question Difficulty Distribution & Subject Mastery (2-column on large screens) */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Difficulty Balance Bar Chart */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                      <Scale className="w-4 h-4" />
                      <span>Difficulty Balance Analysis</span>
                    </div>
                    <h2 className="text-lg font-bold font-display mt-0.5">
                      Difficulty Distribution (Easy · Medium · Hard)
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Compares your attempted difficulty mix against NTA blueprint targets.
                    </p>
                  </div>

                  <div className="text-xs font-mono tabular-nums font-semibold px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 self-start shrink-0">
                    {difficultyDistributionData.totalAttempted} Qs
                  </div>
                </div>

                {/* Diagnostic Alert Box */}
                <div
                  className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs ${
                    difficultyDistributionData.diagnosisType === 'UNDER_HARD' ||
                    difficultyDistributionData.diagnosisType === 'OVER_EASY'
                      ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
                      : difficultyDistributionData.diagnosisType === 'OPTIMAL'
                        ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Scale className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" />
                  <div>
                    <span className="font-bold">Diagnostic: </span>
                    <span>{difficultyDistributionData.diagnosisText}</span>
                  </div>
                </div>

                {difficultyDistributionData.totalAttempted === 0 ? (
                  <div className="h-56 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400 text-center px-4">
                    Solve questions in any test or drill to view your difficulty tier distribution.
                  </div>
                ) : (
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={difficultyDistributionData.chartData} barGap={12}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.15} />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
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
                          dataKey="userRatio"
                          name="Your Ratio (%)"
                          radius={[6, 6, 0, 0]}
                        >
                          {difficultyDistributionData.chartData.map((entry) => (
                            <Cell
                              key={`cell-${entry.tierKey}`}
                              fill={
                                entry.tierKey === 'EASY'
                                  ? '#10B981'
                                  : entry.tierKey === 'MEDIUM'
                                    ? '#6366F1'
                                    : '#EF4444'
                              }
                            />
                          ))}
                        </Bar>
                        <Bar
                          dataKey="targetRatio"
                          name="Blueprint (%)"
                          fill="#94A3B8"
                          radius={[6, 6, 0, 0]}
                          opacity={0.65}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {difficultyDistributionData.totalAttempted > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {difficultyDistributionData.chartData.map((item) => (
                    <div
                      key={item.tierKey}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              item.tierKey === 'EASY'
                                ? 'bg-emerald-500'
                                : item.tierKey === 'MEDIUM'
                                  ? 'bg-indigo-500'
                                  : 'bg-rose-500'
                            }`}
                          />
                          {item.name}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                            item.status === 'UNDER'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                              : item.status === 'OVER'
                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                          }`}
                        >
                          {item.status === 'UNDER'
                            ? 'Low'
                            : item.status === 'OVER'
                              ? 'High'
                              : 'Optimal'}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between text-[11px] font-mono tabular-nums">
                        <span className="text-slate-500 dark:text-slate-400 font-sans">Share</span>
                        <span className="font-bold">
                          {item.count} Qs ({item.userRatio}%)
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between text-[11px] font-mono tabular-nums pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                        <span className="text-slate-500 dark:text-slate-400 font-sans">Accuracy</span>
                        <span
                          className={`font-bold ${
                            item.accuracy >= 75
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : item.accuracy >= 50
                                ? 'text-indigo-600 dark:text-indigo-400'
                                : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {item.count > 0 ? `${item.accuracy}%` : 'N/A'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Subject Mastery Grouped Bar Chart */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      <BarChart3 className="w-4 h-4" />
                      <span>Subject Efficiency</span>
                    </div>
                    <h2 className="text-lg font-bold font-display mt-0.5">Subject Mastery</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Solved vs correct answers across Physics, Chemistry, and {targetExam === 'NEET' ? 'Biology' : 'Mathematics'}.
                    </p>
                  </div>
                  {weakestSubject && weakestSubject.accuracyPercent < 75 && (
                    <div className="text-xs font-mono tabular-nums font-semibold text-rose-600 dark:text-rose-400 shrink-0">
                      Focus: {weakestSubject.subject} ({weakestSubject.accuracyPercent}%)
                    </div>
                  )}
                </div>

                {attempts.length === 0 ? (
                  <div className="h-56 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400 text-center px-4">
                    Complete a test to see solved vs correct categorized across your exam subjects.
                  </div>
                ) : (
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={subjectMasteryData} barGap={8}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.15} />
                        <XAxis dataKey="subject" tick={{ fontSize: 12 }} />
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
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Bar
                          dataKey="totalQuestionsSolved"
                          name="Total Questions Solved"
                          fill="#4F46E5"
                          radius={[6, 6, 0, 0]}
                        />
                        <Bar
                          dataKey="totalCorrect"
                          name="Total Correct"
                          fill="#10B981"
                          radius={[6, 6, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {attempts.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {subjectMasteryData.map((item) => (
                    <div
                      key={item.subject}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs">{item.subject}</span>
                        <span
                          className={`text-[11px] font-mono font-bold ${
                            item.status === 'WEAK'
                              ? 'text-rose-600 dark:text-rose-400'
                              : item.status === 'NEEDS_WORK'
                                ? 'text-amber-600 dark:text-amber-400'
                                : item.status === 'STRONG'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-slate-400'
                          }`}
                        >
                          {item.status === 'WEAK'
                            ? 'Weak'
                            : item.status === 'NEEDS_WORK'
                              ? 'Practice'
                              : item.status === 'STRONG'
                                ? 'Strong'
                                : 'No Data'}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            item.status === 'WEAK'
                              ? 'bg-rose-500'
                              : item.status === 'NEEDS_WORK'
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                          }`}
                          style={{ width: `${item.accuracyPercent}%` }}
                        />
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {item.totalCorrect}/{item.totalQuestionsSolved} ({item.accuracyPercent}%)
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Weak-Topic Diagnostic & Booster Readiness */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold font-display flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  <span>Weak-Topic Diagnostic & Booster Readiness</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {analysisReport.unlocked
                    ? `${analysisReport.weakTopics.length} weak topic(s) detected across ${analysisReport.testsCompleted} completed tests.`
                    : `Complete ${TESTS_REQUIRED_FOR_BOOSTER - analysisReport.testsCompleted} more test(s) (${analysisReport.testsCompleted}/${TESTS_REQUIRED_FOR_BOOSTER}) to unlock your personalized Weak-Topic Booster Exam.`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                {analysisReport.topicDiagnostics.length > 0 && (
                  <select
                    value={topicSubjectFilter}
                    onChange={(e) => setTopicSubjectFilter(e.target.value)}
                    aria-label="Filter topic diagnostics by subject"
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium"
                  >
                    <option value="ALL">All Subjects</option>
                    <option value="Physics">Physics</option>
                    <option value="Chemistry">Chemistry</option>
                    <option value="Mathematics">Mathematics</option>
                    <option value="Biology">Biology</option>
                  </select>
                )}
                {analysisReport.unlocked ? (
                  <button
                    type="button"
                    onClick={onOpenBoosterBuilder}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Configure Booster Exam</span>
                  </button>
                ) : (
                  <div className="inline-flex items-center gap-2 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    <Lock className="w-4 h-4 text-amber-500" />
                    <span>
                      {analysisReport.testsCompleted} / {TESTS_REQUIRED_FOR_BOOSTER} Tests Completed
                    </span>
                  </div>
                )}
              </div>
            </div>

            {filteredTopicDiagnostics.length > 0 && (
              <>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={filteredTopicDiagnostics.slice(0, 10)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.15} />
                      <XAxis dataKey="topic" tick={{ fontSize: 11 }} />
                      <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0F172A',
                          borderColor: '#334155',
                          borderRadius: '12px',
                          fontSize: '12px',
                          color: '#F8FAFC',
                        }}
                        formatter={(val: any) => [`${val}%`, 'Accuracy']}
                      />
                      <Bar dataKey="accuracyPercent" name="Accuracy %" radius={[8, 8, 0, 0]}>
                        {filteredTopicDiagnostics.slice(0, 10).map((entry) => (
                          <Cell
                            key={entry.key}
                            fill={
                              entry.severity === 'CRITICAL'
                                ? '#EF4444'
                                : entry.severity === 'NEEDS_WORK'
                                  ? '#F59E0B'
                                  : '#10B981'
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                        <th className="py-2.5 pr-4">Topic</th>
                        <th className="py-2.5 px-3">Subject</th>
                        <th className="py-2.5 px-3 text-right">Accuracy</th>
                        <th className="py-2.5 px-3 text-right">Wrong</th>
                        <th className="py-2.5 px-3 text-right">Skipped</th>
                        <th className="py-2.5 px-3 text-right">Avg Time</th>
                        <th className="py-2.5 px-3 text-right">Vault Ready</th>
                        <th className="py-2.5 pl-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredTopicDiagnostics.map((td) => (
                        <tr key={td.key} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="py-2.5 pr-4 font-semibold text-sm">{td.topic}</td>
                          <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">{td.subject}</td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="inline-flex items-center gap-2 justify-end">
                              <div className="w-12 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden hidden sm:block">
                                <div
                                  className={`h-full rounded-full ${
                                    td.severity === 'CRITICAL'
                                      ? 'bg-rose-500'
                                      : td.severity === 'NEEDS_WORK'
                                        ? 'bg-amber-500'
                                        : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${td.accuracyPercent}%` }}
                                />
                              </div>
                              <span className="font-mono tabular-nums font-bold">{td.accuracyPercent}%</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-rose-600 dark:text-rose-400">
                            {td.incorrect}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            {td.unattempted}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            {td.avgTimeSeconds}s
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            {td.availableVaultCount} Qs
                          </td>
                          <td
                            className={`py-2.5 pl-3 text-right font-mono font-bold ${
                              td.severity === 'CRITICAL'
                                ? 'text-rose-600 dark:text-rose-400'
                                : td.severity === 'NEEDS_WORK'
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {td.severity === 'CRITICAL'
                              ? 'Critical'
                              : td.severity === 'NEEDS_WORK'
                                ? 'Needs Work'
                                : 'Solid'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Test Attempt History + Deep Diagnostic + Subject Scorecard + Filterable Question Inspector */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold font-display">Test Attempt History & Deep Diagnostics</h2>
                {attempts.length > 0 && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Select any test row below to inspect its subject scorecard, negative-mark audit, pacing quadrants & full question log
                  </span>
                )}
              </div>
              {attempts.length >= 2 && (
                <button
                  type="button"
                  onClick={() => setSubTab('COMPARE_TESTS')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900/60 cursor-pointer whitespace-nowrap self-start sm:self-auto shrink-0"
                >
                  <GitCompare className="w-3.5 h-3.5" />
                  <span>Compare Tests Side-by-Side</span>
                </button>
              )}
            </div>

            {attempts.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                No test attempts recorded yet. Launch a Daily, Weekly, or Monthly test to generate real-time analytics.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                        <th className="py-3 pr-4">Test Title</th>
                        <th className="py-3 px-3">Exam · Mode</th>
                        <th className="py-3 px-3 text-right hidden md:table-cell">R / W / S</th>
                        <th className="py-3 px-3 text-right">Score</th>
                        <th className="py-3 px-3 text-right">Accuracy</th>
                        <th className="py-3 px-3 text-right hidden sm:table-cell">Duration</th>
                        <th className="py-3 pl-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {attempts.map((a) => {
                        const isSelected = activeAttemptDiagnostic?.attemptId === a.id;
                        const wrongCount =
                          a.incorrectCount ??
                          Math.max(0, (a.attemptedCount || 0) - (a.correctCount || 0));
                        const skippedCount = Math.max(
                          0,
                          (a.totalQuestions || 0) - (a.attemptedCount || 0)
                        );
                        const dateStr = formatAttemptDate(a.createdAt);
                        const scorePct =
                          a.maxScore > 0 ? Math.max(0, Math.round((a.score / a.maxScore) * 100)) : 0;
                        return (
                          <tr
                            key={a.id}
                            onClick={() => {
                              setSelectedAttemptId(a.id);
                              setShowQuestionLog(false);
                              setExpandedQuestionIdx(null);
                              setQLogOutcomeFilter('ALL');
                              setQLogSubjectFilter('ALL');
                            }}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-indigo-50/80 dark:bg-indigo-950/35'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <td className="py-3 pr-4">
                              <div className="font-medium text-slate-900 dark:text-slate-100">{a.title}</div>
                              {dateStr && (
                                <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                                  {dateStr}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3 text-xs text-slate-600 dark:text-slate-300">
                              <span className="font-semibold">{EXAM_LABELS[a.exam]}</span>
                              <span className="text-slate-400 mx-1">·</span>
                              <span className="text-slate-500 dark:text-slate-400">{a.testMode}</span>
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums text-xs hidden md:table-cell">
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                {a.correctCount}
                              </span>
                              <span className="text-slate-400 mx-0.5">/</span>
                              <span className="text-rose-600 dark:text-rose-400 font-semibold">
                                {wrongCount}
                              </span>
                              <span className="text-slate-400 mx-0.5">/</span>
                              <span className="text-slate-500 dark:text-slate-400">{skippedCount}</span>
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums">
                              <span className="font-bold">{a.score}</span>
                              <span className="text-slate-400 text-xs">/{a.maxScore}</span>
                              <span className="text-[11px] text-indigo-600 dark:text-indigo-400 ml-1.5">
                                ({scorePct}%)
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                              {a.accuracyPercent}%
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400 hidden sm:table-cell">
                              {formatDurationShort(a.timeSpentSeconds)}
                            </td>
                            <td className="py-3 pl-3 text-right whitespace-nowrap">
                              <button
                                type="button"
                                title="Compare this test with another"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCompareAttemptB(a.id);
                                  setSubTab('COMPARE_TESTS');
                                }}
                                className="p-1 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-950/60 text-slate-400 hover:text-indigo-600 transition-colors mr-1 cursor-pointer"
                              >
                                <GitCompare className="w-3.5 h-3.5 inline-block" />
                              </button>
                              <ChevronRight
                                className={`w-4 h-4 inline-block transition-transform ${
                                  isSelected ? 'text-indigo-600 rotate-90' : 'text-slate-400'
                                }`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {activeAttemptDiagnostic && activeRawAttempt && (
                  <div className="p-5 sm:p-6 rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-slate-50/70 dark:bg-slate-950/40 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                      <div>
                        <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                          Per-Test Analysis · {EXAM_LABELS[activeAttemptDiagnostic.exam]} · {activeAttemptDiagnostic.testMode}
                          {formatAttemptDate(activeRawAttempt.createdAt)
                            ? ` · ${formatAttemptDate(activeRawAttempt.createdAt)}`
                            : ''}
                        </div>
                        <h3 className="text-lg font-bold font-display mt-0.5">
                          {activeAttemptDiagnostic.title}
                        </h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono tabular-nums">
                        <span>
                          Score: <strong>{activeAttemptDiagnostic.score}/{activeAttemptDiagnostic.maxScore}</strong>
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {activeAttemptDiagnostic.correctCount} right
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="text-rose-600 dark:text-rose-400">
                          {activeAttemptDiagnostic.incorrectCount} wrong
                        </span>
                        <span className="text-slate-400">·</span>
                        <span>{activeAttemptDiagnostic.unattemptedCount} skipped</span>
                        <span className="text-slate-400">·</span>
                        <span>{activeAttemptDiagnostic.avgTimePerQuestion}s/Q</span>
                        <button
                          type="button"
                          onClick={() => exportAttemptReportPdf(activeRawAttempt)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-sans font-semibold cursor-pointer ml-1 whitespace-nowrap"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Scorecard PDF</span>
                        </button>
                        {onDeleteAttempt && (
                          confirmDeleteAttemptId === activeAttemptDiagnostic.attemptId ? (
                            <span className="inline-flex items-center gap-1.5 ml-1">
                              <button
                                type="button"
                                disabled={deletingAttemptId === activeAttemptDiagnostic.attemptId}
                                onClick={async () => {
                                  const targetId = activeAttemptDiagnostic.attemptId;
                                  setDeletingAttemptId(targetId);
                                  try {
                                    await onDeleteAttempt(targetId);
                                    setConfirmDeleteAttemptId(null);
                                    setSelectedAttemptId('');
                                  } finally {
                                    setDeletingAttemptId(null);
                                  }
                                }}
                                className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-sans font-semibold cursor-pointer"
                              >
                                Confirm Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteAttemptId(null)}
                                className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 font-sans cursor-pointer"
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              aria-label="Delete attempt"
                              onClick={() => setConfirmDeleteAttemptId(activeAttemptDiagnostic.attemptId)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    {/* Percentile / Rank Band + Time-vs-Accuracy 4-Quadrant Diagnostic */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                      {activeAttemptStanding && (
                        <div className="lg:col-span-5 p-4 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 flex flex-col justify-between gap-3">
                          <div>
                            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                              {activeAttemptStanding.primaryMetricLabel}
                            </div>
                            <div className="text-2xl font-extrabold font-mono tabular-nums text-indigo-600 dark:text-indigo-400 mt-1">
                              {activeAttemptStanding.primaryMetricValue}
                            </div>
                            <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mt-1">
                              Benchmark Tier: {activeAttemptStanding.bandLabel}
                            </div>
                          </div>

                          {timeVsAccuracyQuadrants && (
                            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-xs font-mono tabular-nums">
                              <div className="flex items-center justify-between">
                                <span className="font-sans text-slate-500 dark:text-slate-400">Positive Marks Earned</span>
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                  +{timeVsAccuracyQuadrants.positiveMarks}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="font-sans text-slate-500 dark:text-slate-400">Negative Marks Lost</span>
                                <span className="font-bold text-rose-600 dark:text-rose-400">
                                  -{timeVsAccuracyQuadrants.negativeMarksLost}
                                </span>
                              </div>
                              {timeVsAccuracyQuadrants.recoverableGuessMarks > 0 && (
                                <div className="text-[11px] font-sans text-amber-700 dark:text-amber-300 pt-1">
                                  Skipping fast wrong guesses (≤45s) would have saved{' '}
                                  <strong className="font-mono">+{timeVsAccuracyQuadrants.recoverableGuessMarks}</strong>{' '}
                                  marks.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {timeVsAccuracyQuadrants && (
                        <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                          <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 flex flex-col justify-between">
                            <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                              Fast & Correct
                            </div>
                            <div className="text-2xl font-bold font-mono tabular-nums mt-1.5">
                              {timeVsAccuracyQuadrants.fastCorrect}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono mt-1">
                              ≤ 90s/Q · Ideal pace
                            </div>
                          </div>
                          <div className="p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/20 flex flex-col justify-between">
                            <div className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-400">
                              Slow & Correct
                            </div>
                            <div className="text-2xl font-bold font-mono tabular-nums mt-1.5">
                              {timeVsAccuracyQuadrants.slowCorrect}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono mt-1">
                              &gt; 90s/Q · Speed up
                            </div>
                          </div>
                          <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/20 flex flex-col justify-between">
                            <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                              Fast Guess (Wrong)
                            </div>
                            <div className="text-2xl font-bold font-mono tabular-nums mt-1.5">
                              {timeVsAccuracyQuadrants.fastGuessWrong}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono mt-1">
                              ≤ 45s/Q · Impulsive
                            </div>
                          </div>
                          <div className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50/60 dark:bg-rose-950/20 flex flex-col justify-between">
                            <div className="text-[11px] font-semibold text-rose-700 dark:text-rose-400">
                              Time Sink (Wrong)
                            </div>
                            <div className="text-2xl font-bold font-mono tabular-nums mt-1.5">
                              {timeVsAccuracyQuadrants.timeSinkWrong}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono mt-1">
                              &gt; 90s/Q · Skip earlier
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Per-Test Subject Scorecard */}
                    {activeTestSubjectBreakdown.length > 0 && (
                      <div className="space-y-2.5">
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          Subject-Wise Scorecard (This Test)
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-800/40">
                                <th className="py-2.5 px-3.5">Subject</th>
                                <th className="py-2.5 px-3 text-right">Attempted</th>
                                <th className="py-2.5 px-3 text-right">Correct</th>
                                <th className="py-2.5 px-3 text-right">Wrong</th>
                                <th className="py-2.5 px-3 text-right">Skipped</th>
                                <th className="py-2.5 px-3 text-right">Net Score</th>
                                <th className="py-2.5 px-3 text-right">Neg. Lost</th>
                                <th className="py-2.5 px-3 text-right">Accuracy</th>
                                <th className="py-2.5 px-3.5 text-right">Avg Time/Q</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                              {activeTestSubjectBreakdown.map((sub) => (
                                <tr key={sub.subject} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                                  <td className="py-2.5 px-3.5 font-sans font-bold text-slate-800 dark:text-slate-200">
                                    {sub.subject}
                                  </td>
                                  <td className="py-2.5 px-3 text-right">
                                    {sub.attempted}/{sub.total}
                                  </td>
                                  <td className="py-2.5 px-3 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                                    {sub.correct}
                                  </td>
                                  <td className="py-2.5 px-3 text-right text-rose-600 dark:text-rose-400 font-semibold">
                                    {sub.wrong}
                                  </td>
                                  <td className="py-2.5 px-3 text-right text-slate-500">{sub.skipped}</td>
                                  <td className="py-2.5 px-3 text-right font-bold text-indigo-600 dark:text-indigo-400">
                                    {sub.netScore}
                                  </td>
                                  <td className="py-2.5 px-3 text-right text-rose-500">
                                    {sub.negativeLost > 0 ? `-${sub.negativeLost}` : '0'}
                                  </td>
                                  <td className="py-2.5 px-3 text-right">
                                    <div className="inline-flex items-center gap-2 justify-end">
                                      <div className="w-10 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden hidden sm:block">
                                        <div
                                          className={`h-full rounded-full ${
                                            sub.accuracyPercent < 50
                                              ? 'bg-rose-500'
                                              : sub.accuracyPercent < 75
                                                ? 'bg-amber-500'
                                                : 'bg-emerald-500'
                                          }`}
                                          style={{ width: `${sub.accuracyPercent}%` }}
                                        />
                                      </div>
                                      <span className="font-bold">{sub.accuracyPercent}%</span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3.5 text-right text-slate-500 dark:text-slate-400">
                                    {sub.avgTimeSec > 0 ? `${sub.avgTimeSec}s` : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {activeAttemptDiagnostic.allTopics.length > 0 && (
                      <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                            Topic Breakdown Inside This Test ({activeAttemptDiagnostic.allTopics.length} topics)
                          </div>
                          {activeAttemptDiagnostic.weakestTopics.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const quotas = activeAttemptDiagnostic.weakestTopics.map((wt) => ({
                                  subject: wt.subject,
                                  topic: wt.topic,
                                  count: 5,
                                }));
                                const drillQs = buildBoosterQuestionSet(
                                  questions,
                                  attempts,
                                  quotas,
                                  activeAttemptDiagnostic.exam
                                );
                                if (drillQs.length === 0) {
                                  onOpenBoosterBuilder();
                                  return;
                                }
                                onLaunchBookmarkTest({
                                  title: `Topic Recovery (${activeAttemptDiagnostic.weakestTopics.map((w) => w.topic).slice(0, 2).join(', ')})`,
                                  exam: activeAttemptDiagnostic.exam,
                                  testMode: analysisReport.unlocked ? 'BOOSTER' : 'CUSTOM',
                                  classLevel: 'ALL',
                                  subjectFilter: activeAttemptDiagnostic.weakestTopics[0].subject,
                                  topicFilter: activeAttemptDiagnostic.weakestTopics.map((w) => w.topic).join(', ').slice(0, 115),
                                  durationSeconds: Math.max(10, drillQs.length * 2) * 60,
                                  questions: drillQs,
                                  markingCorrect: 4,
                                  markingIncorrect: -1,
                                });
                              }}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Practice Weak Topics from This Test</span>
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                          {activeAttemptDiagnostic.allTopics.map((t) => (
                            <div
                              key={`${t.subject}-${t.topic}`}
                              className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2"
                            >
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="font-bold truncate">{t.topic}</span>
                                <span
                                  className={`font-mono tabular-nums font-bold ${
                                    t.accuracyPercent < 50
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : t.accuracyPercent < 75
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : 'text-emerald-600 dark:text-emerald-400'
                                  }`}
                                >
                                  {t.accuracyPercent}%
                                </span>
                              </div>
                              <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    t.accuracyPercent < 50
                                      ? 'bg-rose-500'
                                      : t.accuracyPercent < 75
                                        ? 'bg-amber-500'
                                        : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${t.accuracyPercent}%` }}
                                />
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                                {t.subject} · {t.correct}/{t.total} right · {t.incorrect} wrong · {t.avgTimeSeconds}s/Q
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Filterable & Expandable Question-by-Question Inspector */}
                    {activeRawAttempt.questionResults && activeRawAttempt.questionResults.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setShowQuestionLog((v) => !v)}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                          >
                            <ChevronDown
                              className={`w-4 h-4 transition-transform ${
                                showQuestionLog ? 'rotate-180' : ''
                              }`}
                            />
                            <span>
                              {showQuestionLog
                                ? 'Hide Question-by-Question Review'
                                : `Inspect Question-by-Question Review (${activeRawAttempt.questionResults.length} Qs)`}
                            </span>
                          </button>

                          {showQuestionLog && (
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <Filter className="w-3.5 h-3.5 text-slate-400" />
                              {(
                                [
                                  { id: 'ALL', label: `All (${activeRawAttempt.questionResults.length})` },
                                  {
                                    id: 'CORRECT',
                                    label: `Correct (${activeRawAttempt.questionResults.filter((q) => q.isCorrect).length})`,
                                  },
                                  {
                                    id: 'WRONG',
                                    label: `Wrong (${activeRawAttempt.questionResults.filter((q) => q.isAttempted && !q.isCorrect).length})`,
                                  },
                                  {
                                    id: 'SKIPPED',
                                    label: `Skipped (${activeRawAttempt.questionResults.filter((q) => !q.isAttempted).length})`,
                                  },
                                ] as const
                              ).map((f) => (
                                <button
                                  key={f.id}
                                  type="button"
                                  onClick={() => {
                                    setQLogOutcomeFilter(f.id);
                                    setExpandedQuestionIdx(null);
                                  }}
                                  className={`px-2.5 py-1 rounded-lg font-mono font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                                    qLogOutcomeFilter === f.id
                                      ? 'bg-indigo-600 border-indigo-600 text-white'
                                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                  }`}
                                >
                                  {f.label}
                                </button>
                              ))}

                              <select
                                value={qLogSubjectFilter}
                                onChange={(e) => {
                                  setQLogSubjectFilter(e.target.value);
                                  setExpandedQuestionIdx(null);
                                }}
                                aria-label="Filter question log by subject"
                                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
                              >
                                <option value="ALL">All Subjects</option>
                                {activeTestSubjectBreakdown.map((s) => (
                                  <option key={s.subject} value={s.subject}>
                                    {s.subject}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>

                        {showQuestionLog && (
                          <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 max-h-[32rem] overflow-y-auto">
                            {filteredActiveQuestionLog.length === 0 ? (
                              <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                                No questions match the selected filters.
                              </div>
                            ) : (
                              filteredActiveQuestionLog.map(({ qr, originalIndex }) => {
                                const isExpanded = expandedQuestionIdx === originalIndex;
                                const sourceQ = questionMap.get(qr.questionId);
                                const paceLabel =
                                  !qr.isAttempted
                                    ? 'Unattempted'
                                    : qr.timeSpentSeconds <= 45
                                      ? 'Fast'
                                      : qr.timeSpentSeconds <= 90
                                        ? 'Optimal'
                                        : 'Slow';

                                return (
                                  <div key={`${qr.questionId}-${originalIndex}`}>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedQuestionIdx(isExpanded ? null : originalIndex)
                                      }
                                      className="w-full text-left px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                                    >
                                      <div className="min-w-0 flex items-center gap-2 flex-wrap">
                                        <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                                          Q{originalIndex + 1}
                                        </span>
                                        {qr.isCorrect ? (
                                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                        ) : qr.isAttempted ? (
                                          <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                                        ) : (
                                          <span className="w-3.5 h-3.5 inline-flex items-center justify-center text-slate-400 font-mono">
                                            —
                                          </span>
                                        )}
                                        <span className="font-semibold">{qr.topic}</span>
                                        <span className="text-slate-400">·</span>
                                        <span className="text-slate-500 dark:text-slate-400">{qr.subject}</span>
                                        {sourceQ?.difficulty && (
                                          <>
                                            <span className="text-slate-400">·</span>
                                            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                              {sourceQ.difficulty}
                                            </span>
                                          </>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-3 font-mono tabular-nums">
                                        <span className="text-slate-500 dark:text-slate-400">
                                          Ans: {qr.isAttempted ? qr.userAnswer : 'Skipped'} / Key:{' '}
                                          <strong className="text-slate-700 dark:text-slate-200">
                                            {qr.correctAnswer}
                                          </strong>
                                        </span>
                                        <span
                                          className={`font-bold ${
                                            qr.isCorrect
                                              ? 'text-emerald-600 dark:text-emerald-400'
                                              : qr.isAttempted
                                                ? 'text-rose-600 dark:text-rose-400'
                                                : 'text-slate-400'
                                          }`}
                                        >
                                          {qr.marksAwarded > 0 ? `+${qr.marksAwarded}` : qr.marksAwarded}
                                        </span>
                                        <span className="text-slate-400">
                                          {qr.timeSpentSeconds}s ({paceLabel})
                                        </span>
                                        <ChevronDown
                                          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                                            isExpanded ? 'rotate-180' : ''
                                          }`}
                                        />
                                      </div>
                                    </button>

                                    {isExpanded && (
                                      <div className="px-4 pb-4 pt-2 bg-slate-50/70 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 space-y-2.5 text-xs">
                                        {sourceQ ? (
                                          <>
                                            <div className="text-slate-800 dark:text-slate-100 leading-relaxed font-medium">
                                              <MathText text={sourceQ.prompt} />
                                            </div>
                                            {sourceQ.imageUrl && (
                                              <img
                                                src={sourceQ.imageUrl}
                                                alt={`Question ${originalIndex + 1} figure`}
                                                className="max-h-44 rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-1 object-contain"
                                              />
                                            )}
                                            <div className="flex flex-wrap items-center gap-4 font-mono pt-1">
                                              <span
                                                className={
                                                  qr.isCorrect
                                                    ? 'text-emerald-600 dark:text-emerald-400'
                                                    : qr.isAttempted
                                                      ? 'text-rose-600 dark:text-rose-400'
                                                      : 'text-slate-500'
                                                }
                                              >
                                                Your Answer:{' '}
                                                {qr.isAttempted ? <MathText text={qr.userAnswer} /> : 'Unattempted'}
                                              </span>
                                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                                Correct Key: <MathText text={qr.correctAnswer} />
                                              </span>
                                            </div>
                                            {sourceQ.solution && (
                                              <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 leading-relaxed">
                                                <span className="font-bold text-slate-800 dark:text-slate-100">
                                                  Solution:{' '}
                                                </span>
                                                <MathText text={sourceQ.solution} />
                                              </div>
                                            )}
                                          </>
                                        ) : (
                                          <div className="text-slate-500 dark:text-slate-400">
                                            Topic: <strong>{qr.topic}</strong> ({qr.subject}) · Your Answer:{' '}
                                            <span className="font-mono">
                                              {qr.isAttempted ? qr.userAnswer : 'Skipped'}
                                            </span>{' '}
                                            · Correct Key:{' '}
                                            <span className="font-mono font-bold">{qr.correctAnswer}</span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {subTab === 'COMPARE_TESTS' && (
        <TestComparisonTool
          attempts={attempts}
          defaultAttemptIdA={compareAttemptA}
          defaultAttemptIdB={compareAttemptB}
        />
      )}

      {subTab === 'ERROR_NOTEBOOK' && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={mistakeStatusFilter}
                onChange={(e) => setMistakeStatusFilter(e.target.value as 'UNRESOLVED' | 'ALL' | 'RESOLVED')}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium"
              >
                <option value="UNRESOLVED">Unresolved Mistakes ({unresolvedMistakeCount})</option>
                <option value="ALL">All Logged Questions ({mistakeLogs.length})</option>
                <option value="RESOLVED">Resolved ({mistakeLogs.length - unresolvedMistakeCount})</option>
              </select>
              <select
                value={mistakeSubjectFilter}
                onChange={(e) => setMistakeSubjectFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium"
              >
                <option value="ALL">All Subjects</option>
                <option value="Physics">Physics</option>
                <option value="Chemistry">Chemistry</option>
                <option value="Mathematics">Mathematics</option>
                <option value="Biology">Biology</option>
              </select>
              <select
                value={mistakeTagFilter}
                onChange={(e) => setMistakeTagFilter(e.target.value as 'ALL' | MistakeReasonTag)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium"
              >
                <option value="ALL">All Error Tags</option>
                {REASON_TAGS.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              disabled={filteredMistakes.length === 0}
              onClick={handleLaunchMistakeRetest}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Play className="w-4 h-4" />
              <span>Re-Test My Mistakes ({Math.min(30, filteredMistakes.length)})</span>
            </button>
          </div>

          {filteredMistakes.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              No logged mistakes match this filter. Wrong answers and slow questions (&gt;120s) from completed tests are automatically captured here for targeted re-testing.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredMistakes.map((m) => (
                <div
                  key={m.id}
                  className={`bg-white dark:bg-slate-900 border rounded-2xl p-5 sm:p-6 space-y-3 ${
                    m.resolved
                      ? 'border-emerald-200 dark:border-emerald-900/60 opacity-75'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                        {EXAM_LABELS[m.exam]}
                      </span>
                      <span>·</span>
                      <span>{m.subject}</span>
                      <span>·</span>
                      <span>{m.topic}</span>
                      {m.difficulty && (
                        <>
                          <span>·</span>
                          <span
                            className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${
                              m.difficulty === 'HARD'
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                                : m.difficulty === 'MEDIUM'
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                            }`}
                          >
                            {m.difficulty}
                          </span>
                        </>
                      )}
                      {(m.timeSpentSeconds || 0) > 120 && (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-mono font-semibold">
                          <Clock className="w-3 h-3" />
                          Slow ({m.timeSpentSeconds}s)
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {onUpdateMistakeLog && (
                        <>
                          <select
                            value={m.reasonTag}
                            onChange={(e) =>
                              void onUpdateMistakeLog(m.id, {
                                reasonTag: e.target.value as MistakeReasonTag,
                              })
                            }
                            className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                          >
                            {REASON_TAGS.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              void onUpdateMistakeLog(m.id, { resolved: !m.resolved })
                            }
                            className={`px-3 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                              m.resolved
                                ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            {m.resolved ? 'Resolved' : 'Mark Resolved'}
                          </button>
                        </>
                      )}
                      {onDeleteMistakeLog && (
                        <button
                          type="button"
                          aria-label="Delete mistake log"
                          onClick={() => void onDeleteMistakeLog(m.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="text-sm font-medium leading-relaxed">
                    <MathText text={m.prompt} />
                  </div>

                  {m.imageUrl && (
                    <img
                      src={m.imageUrl}
                      alt="Mistake question figure"
                      className="max-h-48 rounded-xl border border-slate-200 dark:border-slate-700 bg-white p-1 object-contain"
                    />
                  )}

                  <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                    <span className="text-rose-600 dark:text-rose-400">
                      Your Answer: {m.userAnswer ? <MathText text={m.userAnswer} /> : 'Unattempted'}
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      Correct Key: <MathText text={m.correctAnswer} />
                    </span>
                  </div>

                  {m.solution && (
                    <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                      <span className="font-semibold">Solution:</span> <MathText text={m.solution} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {subTab === 'BOOKMARKS' && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={bookmarkExam}
                onChange={(e) => setBookmarkExam(e.target.value as 'ALL' | ExamType)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium"
              >
                <option value="ALL">All Exams</option>
                <option value="JEE_MAINS">JEE Main</option>
                <option value="JEE_ADV">JEE Advanced</option>
                <option value="NEET">NEET UG</option>
              </select>
              <select
                value={bookmarkMastery}
                onChange={(e) => setBookmarkMastery(e.target.value as 'ALL' | MasteryStatus)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium"
              >
                <option value="ALL">All Revision States</option>
                <option value="REVISIT">Needs Revisit</option>
                <option value="PRACTICED">Practiced</option>
                <option value="MASTERED">Mastered</option>
              </select>
            </div>

            <button
              type="button"
              disabled={filteredBookmarks.length === 0}
              onClick={handleStartBookmarkDrill}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Play className="w-4 h-4" />
              <span>Practice Bookmarked ({filteredBookmarks.length})</span>
            </button>
          </div>

          {filteredBookmarks.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              No bookmarked questions yet. Tap Bookmark inside any CBT exam or review screen to save difficult questions here.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredBookmarks.map((b) => (
                <div
                  key={b.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                        {EXAM_LABELS[b.exam]}
                      </span>
                      <span>·</span>
                      <span>{b.subject}</span>
                      {b.topic && (
                        <>
                          <span>·</span>
                          <span>{b.topic}</span>
                        </>
                      )}
                      {b.difficulty && (
                        <>
                          <span>·</span>
                          <span
                            className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${
                              b.difficulty === 'HARD'
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                                : b.difficulty === 'MEDIUM'
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                            }`}
                          >
                            {b.difficulty}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={b.masteryStatus}
                        onChange={(e) =>
                          void onUpdateBookmark(b.id, {
                            masteryStatus: e.target.value as MasteryStatus,
                          })
                        }
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                      >
                        <option value="REVISIT">Needs Revisit</option>
                        <option value="PRACTICED">Practiced</option>
                        <option value="MASTERED">Mastered</option>
                      </select>
                      <button
                        type="button"
                        aria-label="Remove bookmark"
                        onClick={() => void onDeleteBookmark(b.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="text-sm font-medium leading-relaxed">
                    <MathText text={b.prompt} />
                  </div>

                  {b.imageUrl && (
                    <img
                      src={b.imageUrl}
                      alt="Bookmarked figure"
                      className="max-h-48 rounded-xl border border-slate-200 dark:border-slate-700 bg-white p-1 object-contain"
                    />
                  )}

                  <div className="text-xs text-emerald-600 dark:text-emerald-400 font-mono flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Answer: <MathText text={b.correctAnswer} />
                    </span>
                  </div>

                  {b.solution && (
                    <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                      <span className="font-semibold">Solution:</span> <MathText text={b.solution} />
                    </div>
                  )}

                  {editingNoteId === b.id ? (
                    <div className="space-y-2 pt-1">
                      <textarea
                        rows={2}
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                        placeholder="Add your mistake analysis or key formula..."
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingNoteId(null)}
                          className="px-3 py-1 rounded-lg text-xs border border-slate-200 dark:border-slate-700 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await onUpdateBookmark(b.id, { note: noteDraft });
                            setEditingNoteId(null);
                          }}
                          className="px-3 py-1 rounded-lg text-xs bg-indigo-600 text-white font-semibold cursor-pointer"
                        >
                          Save Note
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-4 pt-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>{b.note ? `Note: ${b.note}` : 'No revision note added yet.'}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNoteId(b.id);
                          setNoteDraft(b.note || '');
                        }}
                        className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer shrink-0"
                      >
                        {b.note ? 'Edit Note' : 'Add Note'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
