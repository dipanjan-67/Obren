import React, { useMemo } from 'react';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Flame,
  Play,
  Square,
  Timer,
  TrendingUp,
} from 'lucide-react';
import {
  getKolkataDateKey,
  getKolkataTimeParts,
  isSessionScheduledForDate,
} from '../lib/studytrackStore';
import type {
  StopwatchSessionRecord,
  StudyTask,
  TuitionSession,
} from '../types/studytrack';

interface DashboardViewProps {
  sessions: TuitionSession[];
  tasks: StudyTask[];
  stopwatchRecords: StopwatchSessionRecord[];
  onNavigateTab: (tab: 'tuition' | 'tasks' | 'stopwatch' | 'study_analytics') => void;
  onLaunchStopwatchForTask: (taskId: string) => void;
  onStartTeacherCame: (sessionId: string) => Promise<{ ok: boolean; error?: string }>;
  onStartTeacherGone: (sessionId: string) => Promise<void>;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  sessions,
  tasks,
  stopwatchRecords,
  onNavigateTab,
  onLaunchStopwatchForTask,
  onStartTeacherCame,
  onStartTeacherGone,
}) => {
  const todayStr = getKolkataDateKey();
  const todayDow = getKolkataTimeParts().dayOfWeek;

  const todayStats = useMemo(() => {
    const todayRecs = stopwatchRecords.filter((r) => r.date === todayStr);
    const selfStudySecs = todayRecs
      .filter((r) => r.type === 'SELF_STUDY')
      .reduce((acc, r) => acc + r.durationSeconds, 0);
    const tuitionSecs = todayRecs
      .filter((r) => r.type === 'TUITION')
      .reduce((acc, r) => acc + r.durationSeconds, 0);

    const totalSecs = selfStudySecs + tuitionSecs;
    return {
      totalHours: (totalSecs / 3600).toFixed(1),
      selfHours: (selfStudySecs / 3600).toFixed(1),
      tuitionHours: (tuitionSecs / 3600).toFixed(1),
    };
  }, [stopwatchRecords, todayStr]);

  const weeklyHours = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 86400000;
    const totalSecs = stopwatchRecords
      .filter((r) => {
        const d = new Date(`${r.date}T12:00:00+05:30`).getTime();
        return d >= weekAgo && d <= now + 86400000;
      })
      .reduce((acc, r) => acc + r.durationSeconds, 0);
    return (totalSecs / 3600).toFixed(1);
  }, [stopwatchRecords]);

  const monthlyHours = useMemo(() => {
    const monthPrefix = todayStr.slice(0, 7);
    const totalSecs = stopwatchRecords
      .filter((r) => r.date.startsWith(monthPrefix))
      .reduce((acc, r) => acc + r.durationSeconds, 0);
    return (totalSecs / 3600).toFixed(1);
  }, [stopwatchRecords, todayStr]);

  const todaysSessions = useMemo(() => {
    return sessions.filter(
      (s) =>
        s.date === todayStr ||
        s.status === 'IN_PROGRESS' ||
        isSessionScheduledForDate(s, todayStr, todayDow)
    );
  }, [sessions, todayStr, todayDow]);

  const pendingTasks = useMemo(() => {
    return tasks.filter((t) => !t.completed && t.scheduledDate === todayStr);
  }, [tasks, todayStr]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold font-display text-slate-900 dark:text-white tracking-tight">
            StudyTrack Tuition & Focus Hub
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Daily tuition attendance timers, study stopwatch hours, and task targets for {todayStr}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigateTab('stopwatch')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
          >
            <Timer className="w-4 h-4" />
            <span>Start Stopwatch</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('tuition')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <Calendar className="w-4 h-4" />
            <span>Plan Tuition</span>
          </button>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Today Study Time</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {todayStats.totalHours} <span className="text-xs font-normal text-slate-400">hrs</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Self {todayStats.selfHours}h · Tuition {todayStats.tuitionHours}h
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Last 7 Days</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            {weeklyHours} <span className="text-xs font-normal text-slate-400">hrs</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Self-study + tuition
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>This Month</span>
            <Calendar className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
            {monthlyHours} <span className="text-xs font-normal text-slate-400">hrs</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Current calendar month
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Today&apos;s Tasks</span>
            <CheckCircle2 className="w-4 h-4 text-violet-500" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {pendingTasks.length} <span className="text-xs font-normal text-slate-400">pending</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {tasks.filter((t) => t.completed).length} completed overall
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-500" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-white font-display">
                Today&apos;s Tuition Sessions ({todaysSessions.length})
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('tuition')}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Manage All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {todaysSessions.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400 space-y-2">
              <p>No tuition sessions scheduled for today.</p>
              <button
                type="button"
                onClick={() => onNavigateTab('tuition')}
                className="px-3.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-semibold cursor-pointer"
              >
                Schedule Tuition Session
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {todaysSessions.map((s) => (
                <div
                  key={s.id}
                  className={`p-4 rounded-xl border ${
                    s.status === 'IN_PROGRESS'
                      ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
                        <span
                          className={`font-bold ${
                            s.status === 'IN_PROGRESS'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : s.status === 'COMPLETED'
                                ? 'text-slate-500'
                                : 'text-indigo-600 dark:text-indigo-400'
                          }`}
                        >
                          {s.status === 'IN_PROGRESS'
                            ? 'In Progress'
                            : s.status === 'COMPLETED'
                              ? `Completed (${s.actualDurationMinutes}m)`
                              : 'Scheduled'}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-600 dark:text-slate-400">
                          {s.startTime}–{s.endTime}
                        </span>
                      </div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white mt-1">
                        {s.subject} with {s.teacherName}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {s.locationOrLink || 'Online / Study Room'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {s.status === 'SCHEDULED' && (
                        <button
                          type="button"
                          onClick={() => void onStartTeacherCame(s.id)}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap flex items-center gap-1.5"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Teacher Came</span>
                        </button>
                      )}
                      {s.status === 'IN_PROGRESS' && (
                        <button
                          type="button"
                          onClick={() => void onStartTeacherGone(s.id)}
                          className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap flex items-center gap-1.5"
                        >
                          <Square className="w-3.5 h-3.5" />
                          <span>Teacher Gone</span>
                        </button>
                      )}
                      {s.status === 'COMPLETED' && (
                        <span className="text-xs font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                          {s.teacherCameAt} → {s.teacherGoneAt}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-violet-500" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-white font-display">
                Today&apos;s Tasks ({pendingTasks.length})
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('tasks')}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>View Tasks</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {pendingTasks.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400 space-y-2">
              <p>No pending study tasks for today.</p>
              <button
                type="button"
                onClick={() => onNavigateTab('tasks')}
                className="px-3.5 py-2 rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 font-semibold cursor-pointer"
              >
                Add New Task
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {pendingTasks.map((t) => (
                <div
                  key={t.id}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
                      {t.subject} · Target {t.targetDurationMinutes}m
                    </div>
                    <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate mt-0.5">
                      {t.title}
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => onLaunchStopwatchForTask(t.id)}
                    title="Start stopwatch for this task"
                    className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer shrink-0"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
