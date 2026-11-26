import React, { useEffect, useMemo, useState } from 'react';
import {
  Brain,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { getTodayDateKey } from '../lib/gamification';
import { exportTestDeadlinesIcs } from '../lib/pdfExport';
import type {
  ActiveTestConfig,
  BookmarkItem,
  ExamType,
  MasteryStatus,
  MistakeLogItem,
  PlannerTask,
  PyqQuestion,
  StudySession,
  TestAttempt,
  UserProfile,
} from '../types/obren';
import { getSubjectsForExam } from '../types/obren';
import { MathText } from './MathText';

interface PlannerTimerViewProps {
  profile: UserProfile;
  tasks: PlannerTask[];
  sessions: StudySession[];
  bookmarks?: BookmarkItem[];
  mistakeLogs?: MistakeLogItem[];
  attempts?: TestAttempt[];
  onCreateTask: (task: Omit<PlannerTask, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onToggleTask: (task: PlannerTask) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onLogStudySession: (session: Omit<StudySession, 'id' | 'ownerId' | 'createdAt'>) => Promise<void>;
  onUpdateBookmark?: (id: string, updates: { masteryStatus?: MasteryStatus }) => Promise<void>;
  onUpdateMistakeLog?: (id: string, updates: { resolved?: boolean }) => Promise<void>;
  onLaunchRevisionTest?: (cfg: ActiveTestConfig) => void;
  onSavePomodoroPrefs?: (prefs: {
    pomodoroFocusMins: number;
    pomodoroShortBreakMins: number;
    pomodoroLongBreakMins: number;
  }) => Promise<void>;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function playGentleBell() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.9);
  } catch {
    // Ignore audio context restrictions
  }
}

export const PlannerTimerView: React.FC<PlannerTimerViewProps> = ({
  profile,
  tasks,
  sessions,
  bookmarks = [],
  mistakeLogs = [],
  attempts = [],
  onCreateTask,
  onToggleTask,
  onDeleteTask,
  onLogStudySession,
  onUpdateBookmark,
  onUpdateMistakeLog,
  onLaunchRevisionTest,
  onSavePomodoroPrefs,
}) => {
  const [subTab, setSubTab] = useState<'DAILY' | 'TIMETABLE' | 'TEST_PLAN' | 'TIMER'>('DAILY');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState<string>(getSubjectsForExam(profile.targetExam)[0]);
  const [topic, setTopic] = useState('');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [scheduledDate, setScheduledDate] = useState(getTodayDateKey());
  const [scheduledTime, setScheduledTime] = useState('18:00');
  const [dayOfWeek, setDayOfWeek] = useState<number>(1);
  const [durationMins, setDurationMins] = useState<number>(60);
  const [testMode, setTestMode] = useState('Daily Practice Test');

  // Pomodoro & Deep Work Timer State
  const [focusMins, setFocusMins] = useState<number>(profile.pomodoroFocusMins || 25);
  const [shortBreakMins, setShortBreakMins] = useState<number>(profile.pomodoroShortBreakMins || 5);
  const [longBreakMins, setLongBreakMins] = useState<number>(profile.pomodoroLongBreakMins || 15);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsSavedMsg, setPrefsSavedMsg] = useState<string | null>(null);
  const [timerMode, setTimerMode] = useState<'FOCUS' | 'SHORT_BREAK' | 'LONG_BREAK' | 'STOPWATCH'>('FOCUS');
  const [timerSubject, setTimerSubject] = useState<string>(getSubjectsForExam(profile.targetExam)[0]);
  const [timerTopic, setTimerTopic] = useState('');
  const [secondsLeft, setSecondsLeft] = useState<number>((profile.pomodoroFocusMins || 25) * 60);
  const [stopwatchSeconds, setStopwatchSeconds] = useState<number>(0);
  const [running, setRunning] = useState(false);
  const [completedCycles, setCompletedCycles] = useState(0);
  const [sessionToast, setSessionToast] = useState<string | null>(null);

  useEffect(() => {
    if (running) return;
    const f = profile.pomodoroFocusMins || 25;
    const sb = profile.pomodoroShortBreakMins || 5;
    const lb = profile.pomodoroLongBreakMins || 15;
    setFocusMins(f);
    setShortBreakMins(sb);
    setLongBreakMins(lb);
    if (timerMode === 'FOCUS') setSecondsLeft(f * 60);
    else if (timerMode === 'SHORT_BREAK') setSecondsLeft(sb * 60);
    else if (timerMode === 'LONG_BREAK') setSecondsLeft(lb * 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.pomodoroFocusMins, profile.pomodoroShortBreakMins, profile.pomodoroLongBreakMins]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      if (timerMode === 'STOPWATCH') {
        setStopwatchSeconds((s) => s + 1);
      } else {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            window.clearInterval(id);
            setRunning(false);
            playGentleBell();
            if (timerMode === 'FOCUS') {
              const nextCycles = completedCycles + 1;
              setCompletedCycles(nextCycles);
              const xp = focusMins * 2;
              void onLogStudySession({
                subject: timerSubject,
                topic: timerTopic.trim() || 'Pomodoro Focus',
                mode: 'POMODORO',
                durationMins: focusMins,
                xpEarned: xp,
                dateKey: getTodayDateKey(),
              });
              setSessionToast(`Logged ${focusMins}m focus session (+${xp} XP)!`);
              const isLong = nextCycles % 4 === 0;
              setTimerMode(isLong ? 'LONG_BREAK' : 'SHORT_BREAK');
              return (isLong ? longBreakMins : shortBreakMins) * 60;
            } else {
              setTimerMode('FOCUS');
              return focusMins * 60;
            }
          }
          return prev - 1;
        });
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, timerMode, focusMins, shortBreakMins, longBreakMins, completedCycles, timerSubject, timerTopic, onLogStudySession]);

  const switchTimerPreset = (mode: 'FOCUS' | 'SHORT_BREAK' | 'LONG_BREAK' | 'STOPWATCH') => {
    setRunning(false);
    setTimerMode(mode);
    if (mode === 'FOCUS') setSecondsLeft(focusMins * 60);
    else if (mode === 'SHORT_BREAK') setSecondsLeft(shortBreakMins * 60);
    else if (mode === 'LONG_BREAK') setSecondsLeft(longBreakMins * 60);
    else setStopwatchSeconds(0);
  };

  const handleSaveStopwatch = async () => {
    const mins = Math.max(1, Math.round(stopwatchSeconds / 60));
    const xp = mins * 2;
    setRunning(false);
    await onLogStudySession({
      subject: timerSubject,
      topic: timerTopic.trim() || 'Deep Work',
      mode: 'DEEP_WORK',
      durationMins: mins,
      xpEarned: xp,
      dateKey: getTodayDateKey(),
    });
    setStopwatchSeconds(0);
    setSessionToast(`Logged ${mins}m Deep Work session (+${xp} XP)!`);
  };

  const handleAddPlannerItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const category =
      subTab === 'TIMETABLE'
        ? 'TIMETABLE'
        : subTab === 'TEST_PLAN'
          ? 'TEST_PLAN'
          : 'DAILY_TASK';

    await onCreateTask({
      title: title.trim(),
      category,
      exam: profile.targetExam as ExamType,
      subject,
      topic: topic.trim(),
      testMode: category === 'TEST_PLAN' ? testMode : '',
      scheduledDate,
      scheduledTime,
      dayOfWeek: category === 'TIMETABLE' ? dayOfWeek : 0,
      durationMins,
      priority,
      completed: false,
    });
    setTitle('');
    setTopic('');
  };

  const dailyTasks = useMemo(() => tasks.filter((t) => t.category === 'DAILY_TASK'), [tasks]);
  const timetableSlots = useMemo(() => tasks.filter((t) => t.category === 'TIMETABLE'), [tasks]);
  const testPlans = useMemo(() => tasks.filter((t) => t.category === 'TEST_PLAN'), [tasks]);

  // 3d / 7d / 21d Spaced-Repetition Due Queue
  const spacedRepetitionQueue = useMemo(() => {
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    const bookmarkDue = bookmarks
      .filter((b) => b.masteryStatus !== 'MASTERED')
      .map((b) => {
        const ts =
          (b.updatedAt as { toMillis?: () => number })?.toMillis?.() ||
          (b.createdAt as { toMillis?: () => number })?.toMillis?.() ||
          now - 4 * DAY_MS;
        const ageDays = Math.max(0, Math.floor((now - ts) / DAY_MS));
        let cycleLabel = 'Active Recall';
        let due = false;
        if (b.masteryStatus === 'REVISIT') {
          if (ageDays >= 21) {
            cycleLabel = 'Due (21d Final Cycle)';
            due = true;
          } else if (ageDays >= 7) {
            cycleLabel = 'Due (7d Cycle)';
            due = true;
          } else if (ageDays >= 3 || ageDays === 0) {
            cycleLabel = ageDays >= 3 ? 'Due (3d Cycle)' : 'Fresh Revisit';
            due = true;
          }
        } else if (b.masteryStatus === 'PRACTICED') {
          if (ageDays >= 21) {
            cycleLabel = 'Due (21d Retention)';
            due = true;
          } else if (ageDays >= 7) {
            cycleLabel = 'Due (7d Reinforcement)';
            due = true;
          }
        }
        return { bookmark: b, ageDays, cycleLabel, due };
      })
      .filter((item) => item.due)
      .slice(0, 12);

    const mistakeDue = mistakeLogs
      .filter((m) => !m.resolved)
      .map((m) => {
        const ts =
          (m.updatedAt as { toMillis?: () => number })?.toMillis?.() ||
          (m.createdAt as { toMillis?: () => number })?.toMillis?.() ||
          now - 3 * DAY_MS;
        const ageDays = Math.max(0, Math.floor((now - ts) / DAY_MS));
        let cycleLabel = 'Mistake Recall';
        let due = false;
        if (ageDays >= 21) {
          cycleLabel = 'Due (21d Mistake Final)';
          due = true;
        } else if (ageDays >= 7) {
          cycleLabel = 'Due (7d Mistake Review)';
          due = true;
        } else if (ageDays >= 3) {
          cycleLabel = 'Due (3d Mistake Check)';
          due = true;
        }
        return { mistake: m, ageDays, cycleLabel, due };
      })
      .filter((item) => item.due)
      .slice(0, 10);

    // Also inspect older weak chapters (>3d since last attempt with <65% accuracy)
    const topicMap: Record<
      string,
      { subject: string; topic: string; lastAttemptAt: number; total: number; correct: number }
    > = {};
    attempts.forEach((a) => {
      const ts = (a.createdAt as { toMillis?: () => number })?.toMillis?.() || now;
      (a.questionResults || []).forEach((qr) => {
        const key = `${qr.subject}::${qr.topic}`;
        if (!topicMap[key]) {
          topicMap[key] = {
            subject: qr.subject,
            topic: qr.topic,
            lastAttemptAt: ts,
            total: 0,
            correct: 0,
          };
        }
        topicMap[key].lastAttemptAt = Math.max(topicMap[key].lastAttemptAt, ts);
        if (qr.isAttempted) {
          topicMap[key].total += 1;
          if (qr.isCorrect) topicMap[key].correct += 1;
        }
      });
    });

    const staleWeakTopics = Object.values(topicMap)
      .map((t) => ({
        ...t,
        daysAgo: Math.floor((now - t.lastAttemptAt) / DAY_MS),
        accuracy: t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0,
      }))
      .filter((t) => t.total >= 2 && t.accuracy < 65 && t.daysAgo >= 3)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 6);

    return { bookmarkDue, mistakeDue, staleWeakTopics };
  }, [bookmarks, mistakeLogs, attempts]);

  const handleLaunchSpacedRevision = () => {
    if (!onLaunchRevisionTest) return;
    const bQs: PyqQuestion[] = spacedRepetitionQueue.bookmarkDue.map(({ bookmark: b }) => ({
      id: b.questionId,
      ownerId: b.ownerId,
      bankId: 'spaced-revision-bm',
      visibility: 'PRIVATE',
      exam: b.exam,
      classLevel: b.classLevel || '12',
      subject: (b.subject as PyqQuestion['subject']) || 'Physics',
      topic: b.topic || 'Revision',
      questionType: b.options && b.options.length > 0 ? 'MCQ' : 'NUMERICAL',
      prompt: b.prompt,
      options: b.options || [],
      correctAnswer: b.correctAnswer,
      solution: b.solution || '',
      imageUrl: b.imageUrl,
    }));
    const mQs: PyqQuestion[] = spacedRepetitionQueue.mistakeDue.map(({ mistake: m }) => ({
      id: m.questionId,
      ownerId: m.ownerId,
      bankId: 'spaced-revision-mistake',
      visibility: 'PRIVATE',
      exam: m.exam,
      classLevel: m.classLevel || '12',
      subject: m.subject || 'Physics',
      topic: m.topic || 'Mistake Review',
      questionType: m.questionType || 'MCQ',
      prompt: m.prompt,
      options: m.options || [],
      correctAnswer: m.correctAnswer,
      solution: m.solution || '',
      imageUrl: m.imageUrl,
    }));
    const qs = [...bQs, ...mQs];
    if (qs.length === 0) return;

    onLaunchRevisionTest({
      title: `Spaced-Repetition Due Queue (${qs.length} Qs)`,
      exam: profile.targetExam,
      testMode: 'BOOKMARK_REVIEW',
      classLevel: 'ALL',
      subjectFilter: 'ALL',
      topicFilter: '3d/7d/21d Revision',
      durationSeconds: Math.max(10, qs.length * 2) * 60,
      questions: qs,
    });
  };

  const totalTimerSec =
    timerMode === 'FOCUS'
      ? focusMins * 60
      : timerMode === 'SHORT_BREAK'
        ? shortBreakMins * 60
        : longBreakMins * 60;
  const displaySeconds = timerMode === 'STOPWATCH' ? stopwatchSeconds : secondsLeft;
  const minsStr = String(Math.floor(displaySeconds / 60)).padStart(2, '0');
  const secsStr = String(displaySeconds % 60).padStart(2, '0');
  const progressRatio =
    timerMode === 'STOPWATCH' ? 1 : Math.max(0, Math.min(1, secondsLeft / Math.max(1, totalTimerSec)));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight">
            Planner, Timetable & Focus Timer
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Organize daily prep tasks, weekly timetable blocks, scheduled mocks, and customizable Pomodoro sessions.
          </p>
        </div>

        <div className="inline-flex flex-wrap p-1 bg-slate-200/70 dark:bg-slate-800 rounded-xl self-start">
          {([
            ['DAILY', 'Daily Tasks'],
            ['TIMETABLE', 'Timetable'],
            ['TEST_PLAN', 'Test Planner'],
            ['TIMER', 'Focus Timer'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSubTab(key)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                subTab === key
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {subTab !== 'TIMER' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleAddPlannerItem}
            className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 self-start"
          >
            <h2 className="text-lg font-bold font-display">
              {subTab === 'DAILY'
                ? 'New Daily Task'
                : subTab === 'TIMETABLE'
                  ? 'Add Timetable Slot'
                  : 'Schedule Upcoming Test'}
            </h2>

            <div>
              <label className="block text-xs font-semibold mb-1">Title</label>
              <input
                type="text"
                required
                maxLength={160}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  subTab === 'TEST_PLAN'
                    ? 'e.g., Sunday Full Syllabus Mock'
                    : 'e.g., Solve 30 Electrostatics PYQs'
                }
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Subject</label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                >
                  {getSubjectsForExam(profile.targetExam).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                  <option value="Full Syllabus">Full Syllabus</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH')}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                >
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>
            </div>

            {subTab === 'TIMETABLE' ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Day</label>
                  <select
                    value={dayOfWeek}
                    onChange={(e) => setDayOfWeek(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  >
                    {DAYS.map((d, i) => (
                      <option key={d} value={i}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Start Time</label>
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Date</label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Time</label>
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                </div>
              </div>
            )}

            {subTab === 'TEST_PLAN' && (
              <div>
                <label className="block text-xs font-semibold mb-1">Test Cadence</label>
                <select
                  value={testMode}
                  onChange={(e) => setTestMode(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                >
                  <option value="Daily Practice Test">Daily Practice Test</option>
                  <option value="Weekly Test">Weekly Test</option>
                  <option value="Monthly Grand Test">Monthly Grand Test</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold mb-1">Duration (mins)</label>
              <input
                type="number"
                min={10}
                max={360}
                value={durationMins}
                onChange={(e) => setDurationMins(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
              />
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Save to Planner</span>
            </button>
          </form>

          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold font-display">
                {subTab === 'DAILY'
                  ? `Daily Study Checklist (${dailyTasks.length})`
                  : subTab === 'TIMETABLE'
                    ? `Weekly Timetable (${timetableSlots.length} blocks)`
                    : `Scheduled Test Deadlines (${testPlans.length})`}
              </h2>
              {subTab === 'TEST_PLAN' && testPlans.length > 0 && (
                <button
                  type="button"
                  onClick={() => exportTestDeadlinesIcs(tasks)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Export .ICS</span>
                </button>
              )}
            </div>

            {((subTab === 'DAILY' && dailyTasks.length === 0) ||
              (subTab === 'TIMETABLE' && timetableSlots.length === 0) ||
              (subTab === 'TEST_PLAN' && testPlans.length === 0)) ? (
              <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                Nothing scheduled here yet. Add your first item on the left to sync across your devices.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {(subTab === 'DAILY'
                  ? dailyTasks
                  : subTab === 'TIMETABLE'
                    ? timetableSlots
                    : testPlans
                ).map((task) => (
                  <div key={task.id} className="py-3.5 flex items-center justify-between gap-4">
                    <button
                      type="button"
                      onClick={() => void onToggleTask(task)}
                      className="flex items-start gap-3 text-left min-w-0 cursor-pointer"
                    >
                      {task.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                      ) : (
                        <Circle className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className={`font-medium text-sm ${task.completed ? 'line-through text-slate-400' : ''}`}>
                          {task.title}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
                          {task.subject} · {task.priority} ·{' '}
                          {task.category === 'TIMETABLE'
                            ? `${DAYS[task.dayOfWeek || 0]} ${task.scheduledTime}`
                            : `${task.scheduledDate || ''} ${task.scheduledTime || ''}`}{' '}
                          ({task.durationMins || 45}m)
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      aria-label="Delete task"
                      onClick={() => void onDeleteTask(task.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Pomodoro & Deep Work Timer Studio */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 flex flex-col items-center space-y-6">
            <div className="inline-flex flex-wrap p-1 bg-slate-100 dark:bg-slate-800 rounded-xl gap-1">
              {([
                ['FOCUS', `Focus (${focusMins}m)`],
                ['SHORT_BREAK', `Short Break (${shortBreakMins}m)`],
                ['LONG_BREAK', `Long Break (${longBreakMins}m)`],
                ['STOPWATCH', 'Deep Work Stopwatch'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => switchTimerPreset(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    timerMode === key
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="relative w-56 h-56 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-800"
                  strokeWidth="8"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="currentColor"
                  className={timerMode === 'FOCUS' || timerMode === 'STOPWATCH' ? 'text-indigo-600' : 'text-emerald-500'}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 52}
                  strokeDashoffset={2 * Math.PI * 52 * (1 - progressRatio)}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-4xl font-extrabold font-mono tabular-nums">
                  {minsStr}:{secsStr}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {timerMode === 'STOPWATCH' ? 'Elapsed' : `Cycle #${completedCycles + 1}`}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setRunning((r) => !r)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold cursor-pointer"
              >
                {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{running ? 'Pause' : 'Start Session'}</span>
              </button>

              <button
                type="button"
                onClick={() => switchTimerPreset(timerMode)}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset</span>
              </button>

              {timerMode === 'STOPWATCH' && stopwatchSeconds >= 60 && (
                <button
                  type="button"
                  onClick={() => void handleSaveStopwatch()}
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Log Session</span>
                </button>
              )}
            </div>

            {sessionToast && (
              <div className="px-4 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                {sessionToast}
              </div>
            )}
          </div>

          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
              <h2 className="text-lg font-bold font-display">Customize Pomodoro Intervals</h2>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-semibold mb-1">Focus (min)</label>
                  <input
                    type="number"
                    min={5}
                    max={120}
                    value={focusMins}
                    onChange={(e) => {
                      const v = Math.max(5, Math.min(120, Number(e.target.value)));
                      setFocusMins(v);
                      if (timerMode === 'FOCUS' && !running) setSecondsLeft(v * 60);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Short Break</label>
                  <input
                    type="number"
                    min={1}
                    max={45}
                    value={shortBreakMins}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(45, Number(e.target.value)));
                      setShortBreakMins(v);
                      if (timerMode === 'SHORT_BREAK' && !running) setSecondsLeft(v * 60);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Long Break</label>
                  <input
                    type="number"
                    min={5}
                    max={90}
                    value={longBreakMins}
                    onChange={(e) => {
                      const v = Math.max(5, Math.min(90, Number(e.target.value)));
                      setLongBreakMins(v);
                      if (timerMode === 'LONG_BREAK' && !running) setSecondsLeft(v * 60);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs pt-2">
                <div>
                  <label className="block font-semibold mb-1">Study Subject</label>
                  <select
                    value={timerSubject}
                    onChange={(e) => setTimerSubject(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    {getSubjectsForExam(profile.targetExam).map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Chapter / Focus</label>
                  <input
                    type="text"
                    value={timerTopic}
                    onChange={(e) => setTimerTopic(e.target.value)}
                    placeholder="e.g., Thermodynamics"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              </div>

              {onSavePomodoroPrefs && (
                <div className="flex items-center justify-between gap-3 pt-1">
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    {prefsSavedMsg || ''}
                  </span>
                  <button
                    type="button"
                    disabled={savingPrefs}
                    onClick={async () => {
                      setSavingPrefs(true);
                      setPrefsSavedMsg(null);
                      try {
                        await onSavePomodoroPrefs({
                          pomodoroFocusMins: Math.max(5, Math.min(120, Math.round(focusMins))),
                          pomodoroShortBreakMins: Math.max(1, Math.min(45, Math.round(shortBreakMins))),
                          pomodoroLongBreakMins: Math.max(5, Math.min(90, Math.round(longBreakMins))),
                        });
                        setPrefsSavedMsg('Intervals saved to profile');
                      } finally {
                        setSavingPrefs(false);
                      }
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                  >
                    {savingPrefs ? 'Saving...' : 'Save Intervals'}
                  </button>
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-3">
              <div className="flex items-center gap-2 font-bold font-display text-base">
                <Clock className="w-4 h-4 text-indigo-500" />
                <span>Recent Focus Logs ({sessions.length})</span>
              </div>
              {sessions.length === 0 ? (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Complete a Pomodoro or Deep Work session to track your study hours and earn XP.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
                  {sessions.slice(0, 10).map((s) => (
                    <div key={s.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold">{s.subject}</span>
                        {s.topic ? ` · ${s.topic}` : ''}
                      </div>
                      <div className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">
                        {s.durationMins}m (+{s.xpEarned} XP)
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Spaced-Repetition Due Queue (3d / 7d / 21d Revision Cycle) */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400">
              <Brain className="w-4 h-4" />
              <span>Spaced-Repetition Revision Queue (3d · 7d · 21d)</span>
            </div>
            <h2 className="text-lg font-bold font-display mt-0.5">
              Due for Active Recall ({spacedRepetitionQueue.bookmarkDue.length} Bookmarks
              {spacedRepetitionQueue.mistakeDue.length > 0
                ? ` · ${spacedRepetitionQueue.mistakeDue.length} Mistakes`
                : ''}
              {spacedRepetitionQueue.staleWeakTopics.length > 0
                ? ` · ${spacedRepetitionQueue.staleWeakTopics.length} Older Weak Chapters`
                : ''}
              )
            </h2>
          </div>

          {onLaunchRevisionTest &&
            (spacedRepetitionQueue.bookmarkDue.length > 0 ||
              spacedRepetitionQueue.mistakeDue.length > 0) && (
              <button
                type="button"
                onClick={handleLaunchSpacedRevision}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>
                  Practice Due Queue ({spacedRepetitionQueue.bookmarkDue.length + spacedRepetitionQueue.mistakeDue.length} Qs)
                </span>
              </button>
            )}
        </div>

        {spacedRepetitionQueue.bookmarkDue.length === 0 &&
        spacedRepetitionQueue.mistakeDue.length === 0 &&
        spacedRepetitionQueue.staleWeakTopics.length === 0 ? (
          <div className="text-xs text-slate-500 dark:text-slate-400 py-4">
            No due spaced-repetition items right now. Bookmark tricky PYQs during tests as REVISIT or review your Mistake Log to surface them on a 3-day, 7-day, and 21-day revision schedule.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {spacedRepetitionQueue.bookmarkDue.map(({ bookmark: b, cycleLabel }) => (
              <div
                key={b.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 flex flex-col justify-between gap-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                      {b.subject} {b.topic ? `· ${b.topic}` : ''}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-semibold text-[11px]">
                      {cycleLabel}
                    </span>
                  </div>
                  <div className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2">
                    <MathText text={b.prompt} />
                  </div>
                </div>

                {onUpdateBookmark && (
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => void onUpdateBookmark(b.id, { masteryStatus: 'PRACTICED' })}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Mark Practiced
                    </button>
                    <button
                      type="button"
                      onClick={() => void onUpdateBookmark(b.id, { masteryStatus: 'MASTERED' })}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold cursor-pointer"
                    >
                      Mark Mastered
                    </button>
                  </div>
                )}
              </div>
            ))}

            {spacedRepetitionQueue.mistakeDue.map(({ mistake: m, cycleLabel }) => (
              <div
                key={m.id}
                className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/20 flex flex-col justify-between gap-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-rose-700 dark:text-rose-400">
                      {m.subject} · {m.topic} ({m.reasonTag})
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-300 font-semibold text-[11px]">
                      {cycleLabel}
                    </span>
                  </div>
                  <div className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2">
                    <MathText text={m.prompt} />
                  </div>
                </div>

                {onUpdateMistakeLog && (
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => void onUpdateMistakeLog(m.id, { resolved: true })}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold cursor-pointer"
                    >
                      Mark Resolved
                    </button>
                  </div>
                )}
              </div>
            ))}

            {spacedRepetitionQueue.staleWeakTopics.map((wt) => (
              <div
                key={`${wt.subject}::${wt.topic}`}
                className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="text-xs font-bold text-amber-700 dark:text-amber-400">
                    {wt.subject} · {wt.topic}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 font-mono">
                    {wt.accuracy}% accuracy · Tested {wt.daysAgo}d ago
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 text-[11px] font-semibold text-amber-700 dark:text-amber-300 shrink-0">
                  Needs Revision
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
