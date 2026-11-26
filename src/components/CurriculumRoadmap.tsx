import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  BookOpenCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Compass,
  Download,
  Flame,
  Layers,
  Search,
  Sparkles,
} from 'lucide-react';
import { ChapterFlashcardsModal } from './ChapterFlashcardsModal';
import { exportCurriculumMasteryAsPdf } from '../lib/pdfExport';
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
import {
  getStructuredCurriculum,
  matchesSyllabusChapter,
  type SyllabusChapter,
} from '../lib/syllabusCatalog';
import { getFlashcardsForChapter } from '../lib/chapterFlashcards';
import {
  EXAM_LABELS,
  type ExamType,
  type PyqQuestion,
  type RequestedCustomPractice,
  type StudySession,
  type SubjectType,
  type TestAttempt,
} from '../types/obren';

interface CurriculumRoadmapProps {
  targetExam: ExamType;
  completedChapters: string[];
  attempts: TestAttempt[];
  sessions: StudySession[];
  questions: PyqQuestion[];
  onToggleChapter: (chapterKey: string) => Promise<void> | void;
  onBulkSetChapters: (updates: Array<{ key: string; completed: boolean }>) => Promise<void> | void;
  onPracticeChapter: (req: RequestedCustomPractice) => void;
}

type ClassFilter = 'ALL' | '11' | '12';
type StatusFilter = 'ALL' | 'REMAINING' | 'IN_PROGRESS' | 'COMPLETED' | 'HIGH_YIELD';

interface ChapterProgress extends SyllabusChapter {
  isManuallyCompleted: boolean;
  attempted: number;
  correct: number;
  accuracyPct: number | null;
  studyMins: number;
  vaultQuestionsCount: number;
  completionPct: number;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
}

interface UnitProgress {
  unit: string;
  unitOrder: number;
  chapters: ChapterProgress[];
  completedCount: number;
  completionPct: number;
}

interface SubjectProgress {
  subject: SubjectType;
  units: UnitProgress[];
  chapters: ChapterProgress[];
  completedCount: number;
  inProgressCount: number;
  totalChapters: number;
  completionPct: number;
  class11Pct: number;
  class12Pct: number;
  totalAttempted: number;
  totalCorrect: number;
  accuracyPct: number;
}

const SUBJECT_ACCENTS: Record<SubjectType, { bar: string; ring: string; text: string }> = {
  Physics: {
    bar: 'bg-indigo-600',
    ring: 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/30',
    text: 'text-indigo-600 dark:text-indigo-400',
  },
  Chemistry: {
    bar: 'bg-emerald-600',
    ring: 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  Mathematics: {
    bar: 'bg-amber-500',
    ring: 'border-amber-500 bg-amber-50/60 dark:bg-amber-950/30',
    text: 'text-amber-600 dark:text-amber-400',
  },
  Biology: {
    bar: 'bg-teal-600',
    ring: 'border-teal-500 bg-teal-50/60 dark:bg-teal-950/30',
    text: 'text-teal-600 dark:text-teal-400',
  },
};

export const CurriculumRoadmap: React.FC<CurriculumRoadmapProps> = ({
  targetExam,
  completedChapters,
  attempts,
  sessions,
  questions,
  onToggleChapter,
  onBulkSetChapters,
  onPracticeChapter,
}) => {
  const [selectedExam, setSelectedExam] = useState<ExamType>(targetExam);
  const [activeSubject, setActiveSubject] = useState<SubjectType>('Physics');
  const [classFilter, setClassFilter] = useState<ClassFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [collapsedUnits, setCollapsedUnits] = useState<Record<string, boolean>>({});
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [flashcardChapter, setFlashcardChapter] = useState<SyllabusChapter | null>(null);

  useEffect(() => {
    setSelectedExam(targetExam);
  }, [targetExam]);

  const completedSet = useMemo(() => new Set(completedChapters), [completedChapters]);

  const roadmapData = useMemo(() => {
    const curriculum = getStructuredCurriculum(selectedExam);
    const examAttempts = attempts.filter((a) => a.exam === selectedExam);
    const examQuestions = questions.filter((q) => q.exam === selectedExam);

    const subjectReports: SubjectProgress[] = curriculum.map((subCur) => {
      const subAttempts = examAttempts;
      const subSessions = sessions.filter((s) => s.subject === subCur.subject);
      const subVaultQs = examQuestions.filter((q) => q.subject === subCur.subject);

      const units: UnitProgress[] = subCur.units.map((u) => {
        const chapters: ChapterProgress[] = u.chapters.map((ch) => {
          let attempted = 0;
          let correct = 0;

          for (const att of subAttempts) {
            if (Array.isArray(att.questionResults) && att.questionResults.length > 0) {
              for (const qr of att.questionResults) {
                if (qr.subject !== ch.subject) continue;
                if (matchesSyllabusChapter(qr.topic, ch)) {
                  if (qr.isAttempted) {
                    attempted += 1;
                    if (qr.isCorrect) correct += 1;
                  }
                }
              }
            } else if (
              att.topicFilter &&
              matchesSyllabusChapter(att.topicFilter, ch) &&
              (att.subjectFilter === 'ALL' ||
                att.subjectFilter?.includes(ch.subject))
            ) {
              attempted += att.attemptedCount || 0;
              correct += att.correctCount || 0;
            }
          }

          let studyMins = 0;
          for (const sess of subSessions) {
            if (matchesSyllabusChapter(sess.topic, ch)) {
              studyMins += sess.durationMins || 0;
            }
          }

          let vaultQuestionsCount = 0;
          for (const vq of subVaultQs) {
            if (matchesSyllabusChapter(vq.topic, ch)) {
              vaultQuestionsCount += 1;
            }
          }

          const accuracyPct = attempted > 0 ? Math.round((correct / attempted) * 100) : null;
          const isManuallyCompleted = completedSet.has(ch.key);
          const autoMastered = attempted >= 10 && accuracyPct !== null && accuracyPct >= 75;

          let completionPct = 0;
          if (isManuallyCompleted || autoMastered) {
            completionPct = 100;
          } else {
            const solvedScore = Math.min(55, attempted * 6);
            const accuracyBonus =
              attempted >= 3 && accuracyPct !== null
                ? Math.round((accuracyPct / 100) * 30)
                : 0;
            const studyBonus = Math.min(25, Math.round(studyMins / 2));
            completionPct = Math.min(95, solvedScore + accuracyBonus + studyBonus);
          }

          const status: ChapterProgress['status'] =
            completionPct >= 100
              ? 'COMPLETED'
              : completionPct > 0
                ? 'IN_PROGRESS'
                : 'NOT_STARTED';

          return {
            ...ch,
            isManuallyCompleted,
            attempted,
            correct,
            accuracyPct,
            studyMins,
            vaultQuestionsCount,
            completionPct,
            status,
          };
        });

        const completedCount = chapters.filter((c) => c.status === 'COMPLETED').length;
        const unitCompletionPct =
          chapters.length > 0
            ? Math.round(
                chapters.reduce((sum, c) => sum + c.completionPct, 0) / chapters.length
              )
            : 0;

        return {
          unit: u.unit,
          unitOrder: u.unitOrder,
          chapters,
          completedCount,
          completionPct: unitCompletionPct,
        };
      });

      const allChapters = units.flatMap((u) => u.chapters);
      const completedCount = allChapters.filter((c) => c.status === 'COMPLETED').length;
      const inProgressCount = allChapters.filter((c) => c.status === 'IN_PROGRESS').length;
      const completionPct =
        allChapters.length > 0
          ? Math.round(
              allChapters.reduce((sum, c) => sum + c.completionPct, 0) / allChapters.length
            )
          : 0;

      const cl11 = allChapters.filter((c) => c.classLevel === '11');
      const cl12 = allChapters.filter((c) => c.classLevel === '12');
      const class11Pct =
        cl11.length > 0
          ? Math.round(cl11.reduce((sum, c) => sum + c.completionPct, 0) / cl11.length)
          : 0;
      const class12Pct =
        cl12.length > 0
          ? Math.round(cl12.reduce((sum, c) => sum + c.completionPct, 0) / cl12.length)
          : 0;

      const totalAttempted = allChapters.reduce((sum, c) => sum + c.attempted, 0);
      const totalCorrect = allChapters.reduce((sum, c) => sum + c.correct, 0);
      const accuracyPct =
        totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0;

      return {
        subject: subCur.subject,
        units,
        chapters: allChapters,
        completedCount,
        inProgressCount,
        totalChapters: allChapters.length,
        completionPct,
        class11Pct,
        class12Pct,
        totalAttempted,
        totalCorrect,
        accuracyPct,
      };
    });

    const allChapters = subjectReports.flatMap((s) => s.chapters);
    const totalChaptersCount = allChapters.length;
    const completedChaptersCount = allChapters.filter((c) => c.status === 'COMPLETED').length;
    const inProgressChaptersCount = allChapters.filter((c) => c.status === 'IN_PROGRESS').length;
    const overallPct =
      totalChaptersCount > 0
        ? Math.round(
            allChapters.reduce((sum, c) => sum + c.completionPct, 0) / totalChaptersCount
          )
        : 0;

    const cl11All = allChapters.filter((c) => c.classLevel === '11');
    const cl12All = allChapters.filter((c) => c.classLevel === '12');
    const class11OverallPct =
      cl11All.length > 0
        ? Math.round(cl11All.reduce((sum, c) => sum + c.completionPct, 0) / cl11All.length)
        : 0;
    const class12OverallPct =
      cl12All.length > 0
        ? Math.round(cl12All.reduce((sum, c) => sum + c.completionPct, 0) / cl12All.length)
        : 0;

    const highYieldAll = allChapters.filter((c) => c.weightage === 'HIGH');
    const highYieldDone = highYieldAll.filter((c) => c.status === 'COMPLETED').length;

    const chartData = subjectReports.map((sr) => ({
      subject: sr.subject === 'Mathematics' ? 'Maths' : sr.subject,
      completion: sr.completionPct,
      accuracy: sr.accuracyPct,
    }));

    return {
      subjectReports,
      overallPct,
      totalChaptersCount,
      completedChaptersCount,
      inProgressChaptersCount,
      class11OverallPct,
      class12OverallPct,
      highYieldDone,
      highYieldTotal: highYieldAll.length,
      chartData,
    };
  }, [selectedExam, attempts, sessions, questions, completedSet]);

  useEffect(() => {
    const valid = roadmapData.subjectReports.some((s) => s.subject === activeSubject);
    if (!valid && roadmapData.subjectReports.length > 0) {
      setActiveSubject(roadmapData.subjectReports[0].subject);
    }
  }, [roadmapData.subjectReports, activeSubject]);

  const currentSubjectReport = useMemo(
    () =>
      roadmapData.subjectReports.find((s) => s.subject === activeSubject) ||
      roadmapData.subjectReports[0],
    [roadmapData.subjectReports, activeSubject]
  );

  const filteredUnits = useMemo(() => {
    if (!currentSubjectReport) return [];
    const q = searchQuery.trim().toLowerCase();

    return currentSubjectReport.units
      .map((unit) => {
        const chapters = unit.chapters.filter((ch) => {
          if (classFilter !== 'ALL' && ch.classLevel !== classFilter) return false;
          if (statusFilter === 'COMPLETED' && ch.status !== 'COMPLETED') return false;
          if (statusFilter === 'IN_PROGRESS' && ch.status !== 'IN_PROGRESS') return false;
          if (statusFilter === 'REMAINING' && ch.status === 'COMPLETED') return false;
          if (statusFilter === 'HIGH_YIELD' && ch.weightage !== 'HIGH') return false;
          if (
            q &&
            !ch.name.toLowerCase().includes(q) &&
            !unit.unit.toLowerCase().includes(q)
          ) {
            return false;
          }
          return true;
        });
        return { ...unit, chapters };
      })
      .filter((u) => u.chapters.length > 0);
  }, [currentSubjectReport, classFilter, statusFilter, searchQuery]);

  const handleToggleSingle = async (key: string) => {
    setUpdatingKey(key);
    try {
      await onToggleChapter(key);
    } finally {
      setUpdatingKey(null);
    }
  };

  const handleToggleUnit = async (unit: UnitProgress) => {
    const allCompleted = unit.chapters.every((c) => completedSet.has(c.key));
    const updates = unit.chapters.map((c) => ({
      key: c.key,
      completed: !allCompleted,
    }));
    setUpdatingKey(unit.unit);
    try {
      await onBulkSetChapters(updates);
    } finally {
      setUpdatingKey(null);
    }
  };

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-7 space-y-6">
      {/* Header & Exam Stream Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400">
            <Compass className="w-4 h-4" />
            <span>Structured Curriculum Tracker</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold font-display tracking-tight">
            {EXAM_LABELS[selectedExam]} Syllabus Roadmap
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
            Unit-by-unit mastery across Physics, Chemistry, and{' '}
            {selectedExam === 'NEET' ? 'Biology' : 'Mathematics'}. Completion syncs automatically from test accuracy, focus sessions, and chapter checkpoints.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start">
          <button
            type="button"
            onClick={() => exportCurriculumMasteryAsPdf(selectedExam, roadmapData.subjectReports)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Mastery PDF</span>
          </button>

          <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            {([
              ['JEE_MAINS', 'JEE Main'],
              ['JEE_ADV', 'JEE Advanced'],
              ['NEET', 'NEET UG'],
            ] as const).map(([examId, label]) => (
              <button
                key={examId}
                type="button"
                onClick={() => setSelectedExam(examId)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  selectedExam === examId
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Top Readiness Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Overall Readiness</span>
            <BookOpenCheck className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-extrabold font-mono tabular-nums">
            {roadmapData.overallPct}%
          </div>
          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-500"
              style={{ width: `${roadmapData.overallPct}%` }}
            />
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Chapters Completed</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-extrabold font-mono tabular-nums">
            {roadmapData.completedChaptersCount}{' '}
            <span className="text-sm font-normal text-slate-400">
              / {roadmapData.totalChaptersCount}
            </span>
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {roadmapData.inProgressChaptersCount} active in progress
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Class Split Progress</span>
            <Layers className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-3 text-xl font-extrabold font-mono tabular-nums">
            <span>Cl 11: {roadmapData.class11OverallPct}%</span>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span>Cl 12: {roadmapData.class12OverallPct}%</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Balanced 11th & 12th coverage
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>High-Yield Mastery</span>
            <Flame className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-extrabold font-mono tabular-nums">
            {roadmapData.highYieldDone}{' '}
            <span className="text-sm font-normal text-slate-400">
              / {roadmapData.highYieldTotal}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Priority exam-weightage chapters
          </div>
        </div>
      </div>

      {/* Subject Completion Cards + Subject Completion vs Accuracy Bar Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {roadmapData.subjectReports.map((sr) => {
            const isActive = sr.subject === currentSubjectReport?.subject;
            const accent = SUBJECT_ACCENTS[sr.subject];
            return (
              <button
                key={sr.subject}
                type="button"
                onClick={() => setActiveSubject(sr.subject)}
                className={`text-left p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                  isActive
                    ? accent.ring
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-bold ${accent.text}`}>
                      {sr.subject}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {sr.completedCount}/{sr.totalChapters} ch
                    </span>
                  </div>
                  <div className="text-3xl font-extrabold font-mono tabular-nums">
                    {sr.completionPct}%
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full ${accent.bar} rounded-full transition-all duration-500`}
                      style={{ width: `${sr.completionPct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    <span>11th: {sr.class11Pct}%</span>
                    <span>12th: {sr.class12Pct}%</span>
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {sr.totalAttempted > 0
                      ? `Accuracy: ${sr.accuracyPct}% (${sr.totalAttempted} Qs)`
                      : 'No chapter attempts yet'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="lg:col-span-5 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold font-display">
              Subject Completion vs. Test Accuracy (%)
            </span>
          </div>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={roadmapData.chartData} barGap={6}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.14} />
                <XAxis dataKey="subject" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  dataKey="completion"
                  name="Completion %"
                  fill="#4F46E5"
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="accuracy"
                  name="Accuracy %"
                  fill="#10B981"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Filter Controls for Active Subject Roadmap */}
      {currentSubjectReport && (
        <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold font-display mr-2">
                {currentSubjectReport.subject} Unit Roadmap
              </span>
              {(['ALL', '11', '12'] as const).map((cls) => (
                <button
                  key={cls}
                  type="button"
                  onClick={() => setClassFilter(cls)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    classFilter === cls
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {cls === 'ALL' ? 'All Classes' : `Class ${cls}`}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
              >
                <option value="ALL">All Chapters</option>
                <option value="HIGH_YIELD">High-Yield Priority</option>
                <option value="REMAINING">Remaining (&lt;100%)</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed Only</option>
              </select>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Find chapter or unit..."
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs w-48 sm:w-56"
                />
              </div>
            </div>
          </div>

          {/* Unit-by-Unit Vertical Roadmap Timeline */}
          {filteredUnits.length === 0 ? (
            <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-sm text-slate-500 dark:text-slate-400">
              No chapters match the current filter criteria.
            </div>
          ) : (
            <div className="relative pl-5 sm:pl-6 space-y-5 before:content-[''] before:absolute before:left-[11px] sm:before:left-[13px] before:top-4 before:bottom-4 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
              {filteredUnits.map((unit) => {
                const isCollapsed = Boolean(collapsedUnits[unit.unit]);
                const allDone = unit.chapters.every((c) => c.status === 'COMPLETED');
                const anyProgress = unit.completionPct > 0;
                const unitManuallyComplete = unit.chapters.every((c) => completedSet.has(c.key));

                return (
                  <div key={unit.unit} className="relative">
                    {/* Timeline Node Dot */}
                    <div
                      className={`absolute -left-5 sm:-left-6 top-3.5 w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-mono font-bold z-10 ${
                        allDone
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : anyProgress
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-500'
                      }`}
                    >
                      {allDone ? <Check className="w-3.5 h-3.5" /> : `U${unit.unitOrder}`}
                    </div>

                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 overflow-hidden">
                      {/* Unit Header */}
                      <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/70 dark:bg-slate-900/60">
                        <button
                          type="button"
                          onClick={() =>
                            setCollapsedUnits((prev) => ({
                              ...prev,
                              [unit.unit]: !prev[unit.unit],
                            }))
                          }
                          className="flex items-center gap-2.5 text-left min-w-0 cursor-pointer"
                        >
                          {isCollapsed ? (
                            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="font-bold font-display text-sm sm:text-base truncate">
                              {unit.unit}
                            </div>
                            <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                              {unit.completedCount}/{unit.chapters.length} chapters done ·{' '}
                              <span
                                className={
                                  unit.completionPct === 100
                                    ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                                    : 'text-indigo-600 dark:text-indigo-400 font-semibold'
                                }
                              >
                                {unit.completionPct}% complete
                              </span>
                            </div>
                          </div>
                        </button>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="w-24 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden hidden sm:block">
                            <div
                              className={`h-full rounded-full transition-all ${
                                unit.completionPct === 100 ? 'bg-emerald-600' : 'bg-indigo-600'
                              }`}
                              style={{ width: `${unit.completionPct}%` }}
                            />
                          </div>
                          <button
                            type="button"
                            disabled={updatingKey === unit.unit}
                            onClick={() => void handleToggleUnit(unit)}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                          >
                            {unitManuallyComplete ? 'Unmark Unit' : 'Mark Unit Done'}
                          </button>
                        </div>
                      </div>

                      {/* Chapter Milestone Cards */}
                      {!isCollapsed && (
                        <div className="p-3.5 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-slate-200 dark:border-slate-800">
                          {unit.chapters.map((ch) => (
                            <div
                              key={ch.key}
                              className={`p-3.5 rounded-xl border transition-colors flex flex-col justify-between gap-2.5 ${
                                ch.status === 'COMPLETED'
                                  ? 'border-emerald-200 dark:border-emerald-900/70 bg-emerald-50/40 dark:bg-emerald-950/15'
                                  : ch.status === 'IN_PROGRESS'
                                    ? 'border-indigo-200 dark:border-indigo-900/70 bg-white dark:bg-slate-900'
                                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2.5">
                                <button
                                  type="button"
                                  disabled={updatingKey === ch.key}
                                  onClick={() => void handleToggleSingle(ch.key)}
                                  title={
                                    ch.isManuallyCompleted
                                      ? 'Mark chapter as incomplete'
                                      : 'Mark chapter as completed'
                                  }
                                  className="flex items-start gap-2.5 text-left min-w-0 cursor-pointer group"
                                >
                                  {ch.status === 'COMPLETED' ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                                  ) : (
                                    <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 mt-0.5 shrink-0" />
                                  )}
                                  <div className="min-w-0">
                                    <div
                                      className={`text-sm font-semibold leading-snug ${
                                        ch.status === 'COMPLETED'
                                          ? 'text-slate-900 dark:text-slate-100'
                                          : 'text-slate-800 dark:text-slate-200'
                                      }`}
                                    >
                                      {ch.name}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono mt-0.5">
                                      <span className="text-slate-500 dark:text-slate-400">
                                        Class {ch.classLevel}
                                      </span>
                                      <span className="text-slate-300 dark:text-slate-700">·</span>
                                      <span
                                        className={
                                          ch.weightage === 'HIGH'
                                            ? 'text-amber-600 dark:text-amber-400 font-bold'
                                            : ch.weightage === 'MEDIUM'
                                              ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                                              : 'text-slate-500 dark:text-slate-400'
                                        }
                                      >
                                        {ch.weightage === 'HIGH'
                                          ? 'High-Yield'
                                          : ch.weightage === 'MEDIUM'
                                            ? 'Medium Weight'
                                            : 'Core'}
                                      </span>
                                    </div>
                                  </div>
                                </button>

                                <span
                                  className={`text-xs font-mono tabular-nums font-bold shrink-0 ${
                                    ch.completionPct === 100
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : ch.completionPct > 0
                                        ? 'text-indigo-600 dark:text-indigo-400'
                                        : 'text-slate-400'
                                  }`}
                                >
                                  {ch.completionPct}%
                                </span>
                              </div>

                              <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    ch.completionPct === 100
                                      ? 'bg-emerald-500'
                                      : 'bg-indigo-500'
                                  }`}
                                  style={{ width: `${ch.completionPct}%` }}
                                />
                              </div>

                              {/* Chapter Flashcard Mastery Bar (Mastered vs Remaining) */}
                              {(() => {
                                const chapterCards = getFlashcardsForChapter(ch.subject, ch.name);
                                const totalCards = Math.max(1, chapterCards.length);
                                const masteredCards = ch.status === 'COMPLETED'
                                  ? totalCards
                                  : Math.round((ch.completionPct / 100) * totalCards);
                                const remainingCards = totalCards - masteredCards;
                                const masteryPct = Math.round((masteredCards / totalCards) * 100);

                                return (
                                  <div
                                    tabIndex={0}
                                    aria-label={`Flashcards: ${masteredCards} mastered, ${remainingCards} remaining out of ${totalCards} (${masteryPct}%)`}
                                    className="relative group/flashcard space-y-1 pt-1 border-t border-slate-200/60 dark:border-slate-800/60 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md"
                                  >
                                    {/* Hover / Focus Tooltip */}
                                    <div
                                      role="tooltip"
                                      className="pointer-events-none opacity-0 translate-y-1 group-hover/flashcard:opacity-100 group-hover/flashcard:translate-y-0 group-focus-within/flashcard:opacity-100 group-focus-within/flashcard:translate-y-0 transition-all duration-150 absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 w-56 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-900 dark:bg-slate-950 text-slate-50 shadow-lg p-2.5 text-[11px]"
                                    >
                                      <div className="flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-slate-700/80">
                                        <span className="font-semibold text-slate-200 truncate">
                                          Flashcard Mastery
                                        </span>
                                        <span className="font-mono tabular-nums font-bold text-emerald-400">
                                          {masteryPct}%
                                        </span>
                                      </div>
                                      <div className="space-y-1 font-mono tabular-nums">
                                        <div className="flex items-center justify-between">
                                          <span className="flex items-center gap-1.5 text-slate-300">
                                            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                                            Mastered
                                          </span>
                                          <span className="font-bold text-emerald-300">
                                            {masteredCards} cards
                                          </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                          <span className="flex items-center gap-1.5 text-slate-300">
                                            <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                                            Remaining
                                          </span>
                                          <span className="font-bold text-indigo-300">
                                            {remainingCards} cards
                                          </span>
                                        </div>
                                      </div>
                                      <div className="mt-1.5 pt-1 border-t border-slate-800 flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-400">
                                        <span>Chapter Deck Total</span>
                                        <span>{totalCards} cards</span>
                                      </div>
                                      <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-slate-900 dark:bg-slate-950 border-r border-b border-slate-200/20 dark:border-slate-700" />
                                    </div>

                                    <div className="flex items-center justify-between text-[11px] font-mono tabular-nums cursor-help">
                                      <span className="text-slate-600 dark:text-slate-300 font-semibold flex items-center gap-1">
                                        <BookOpen className="w-3 h-3 text-indigo-500" />
                                        <span>Flashcards Mastered: {masteredCards}/{totalCards}</span>
                                      </span>
                                      <span className="text-slate-500 dark:text-slate-400">
                                        {remainingCards > 0 ? `${remainingCards} remaining` : 'Fully Mastered'}
                                      </span>
                                    </div>
                                    <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex cursor-help">
                                      <div
                                        className="h-full bg-emerald-500 transition-all duration-300"
                                        style={{ width: `${masteryPct}%` }}
                                      />
                                      <div
                                        className="h-full bg-indigo-500/40 dark:bg-indigo-500/30 transition-all duration-300"
                                        style={{ width: `${100 - masteryPct}%` }}
                                      />
                                    </div>
                                  </div>
                                );
                              })()}

                              <div className="flex items-center justify-between gap-2 pt-0.5 text-[11px]">
                                <div className="font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
                                  {ch.attempted > 0
                                    ? `${ch.attempted} Qs · ${ch.accuracyPct}% acc`
                                    : `${ch.vaultQuestionsCount} vault PYQs`}
                                  {ch.studyMins > 0 ? ` · ${ch.studyMins}m focus` : ''}
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => setFlashcardChapter(ch)}
                                    className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 font-semibold cursor-pointer"
                                  >
                                    <BookOpen className="w-3 h-3" />
                                    <span>Formulas</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onPracticeChapter({
                                        exam: selectedExam,
                                        subject: ch.subject,
                                        classLevel: ch.classLevel,
                                        chapter: ch.name,
                                      })
                                    }
                                    className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
                                  >
                                    <Sparkles className="w-3 h-3" />
                                    <span>Practice</span>
                                    <ArrowRight className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {flashcardChapter && (
        <ChapterFlashcardsModal
          chapter={flashcardChapter}
          onClose={() => setFlashcardChapter(null)}
          onPracticeChapter={(ch) =>
            onPracticeChapter({
              exam: selectedExam,
              subject: ch.subject,
              classLevel: ch.classLevel,
              chapter: ch.name,
            })
          }
        />
      )}
    </section>
  );
};
