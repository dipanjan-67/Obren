import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Pause,
  Play,
  RotateCcw,
  Timer,
} from 'lucide-react';
import { getKolkataDateKey, getKolkataTimeParts } from '../lib/studytrackStore';
import type {
  StopwatchSessionRecord,
  StudyTask,
  SubjectType,
  TuitionSession,
} from '../types/studytrack';

interface StopwatchViewProps {
  tasks: StudyTask[];
  activeTuitionSession?: TuitionSession | null;
  preselectedTaskId?: string;
  onClearPreselectedTaskId?: () => void;
  onAddStopwatchRecord: (
    record: Omit<StopwatchSessionRecord, 'id'>,
    options?: { markTaskComplete?: boolean }
  ) => Promise<void>;
}

const SUBJECT_LIST: SubjectType[] = [
  'Physics',
  'Chemistry',
  'Mathematics',
  'Biology',
  'Computer Science',
  'English',
  'Other',
];

export const StopwatchView: React.FC<StopwatchViewProps> = ({
  tasks,
  activeTuitionSession = null,
  preselectedTaskId = '',
  onClearPreselectedTaskId,
  onAddStopwatchRecord,
}) => {
  const [selectedSubject, setSelectedSubject] = useState<SubjectType>('Physics');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [markTaskComplete, setMarkTaskComplete] = useState<boolean>(true);
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!preselectedTaskId) return;
    const matched = tasks.find((t) => t.id === preselectedTaskId);
    if (matched && !isActive) {
      setSelectedTaskId(matched.id);
      setSelectedSubject(matched.subject);
    }
    onClearPreselectedTaskId?.();
  }, [preselectedTaskId, tasks, isActive, onClearPreselectedTaskId]);

  useEffect(() => {
    if (isActive && !isPaused) {
      timerRef.current = window.setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isActive, isPaused]);

  const handleStart = () => {
    if (activeTuitionSession) {
      setNotice({
        type: 'error',
        text: `Cannot start self-study stopwatch while "${activeTuitionSession.subject} with ${activeTuitionSession.teacherName}" attendance timer is active. Mark "Teacher Gone" first.`,
      });
      return;
    }
    setIsActive(true);
    setIsPaused(false);
    setConfirmReset(false);
    setNotice(null);
  };

  const handleStopAndSave = async () => {
    if (seconds < 10) {
      setNotice({
        type: 'error',
        text: 'Session must be at least 10 seconds before saving to study logs.',
      });
      return;
    }

    setSaving(true);
    try {
      const nowParts = getKolkataTimeParts();
      const todayStr = getKolkataDateKey();
      const matchedTask = tasks.find((t) => t.id === selectedTaskId);

      await onAddStopwatchRecord(
        {
          subject: selectedSubject,
          taskId: selectedTaskId || undefined,
          taskTitle: matchedTask?.title || `Self Study (${selectedSubject})`,
          startTime: nowParts.formatted12h,
          durationSeconds: seconds,
          type: 'SELF_STUDY',
          date: todayStr,
        },
        { markTaskComplete: Boolean(selectedTaskId && markTaskComplete) }
      );

      const savedMins = Math.max(1, Math.round(seconds / 60));
      setNotice({
        type: 'success',
        text: `Logged ${savedMins} min(s) for ${selectedSubject}${matchedTask ? ` · Updated "${matchedTask.title}"` : ''}.`,
      });
      setIsActive(false);
      setIsPaused(false);
      setSeconds(0);
      setSelectedTaskId('');
      setConfirmReset(false);
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  const pendingTasks = tasks.filter((t) => !t.completed);
  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-extrabold font-display text-slate-900 dark:text-white tracking-tight">
          Study Stopwatch
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Time self-study sessions and sync actual minutes directly to Study Tasks, OBREN XP, and Analytics.
        </p>
      </div>

      {activeTuitionSession && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            Live tuition timer active for{' '}
            <strong>
              {activeTuitionSession.subject} with {activeTuitionSession.teacherName}
            </strong>
            . Finish that session before starting the self-study stopwatch to avoid double-counting study hours.
          </span>
        </div>
      )}

      {notice && (
        <div
          className={`p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 ${
            notice.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {notice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{notice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-xs underline cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 space-y-8 text-center">
        {!isActive && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Subject *
              </label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value as SubjectType)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium"
              >
                {SUBJECT_LIST.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Link Study Task (Optional)
              </label>
              <select
                value={selectedTaskId}
                onChange={(e) => {
                  setSelectedTaskId(e.target.value);
                  const t = tasks.find((item) => item.id === e.target.value);
                  if (t) setSelectedSubject(t.subject);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium truncate"
              >
                <option value="">-- General Self-Study --</option>
                {pendingTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({t.subject} · {t.targetDurationMinutes}m)
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="py-6 space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400">
            <Timer className="w-3.5 h-3.5" />
            <span>
              {selectedSubject}
              {selectedTask ? ` · ${selectedTask.title} (Target ${selectedTask.targetDurationMinutes}m)` : ''}
            </span>
          </div>

          <div className="text-6xl sm:text-7xl font-bold font-mono tracking-tight text-slate-900 dark:text-white tabular-nums">
            {formatTime(seconds)}
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
            {isActive ? (isPaused ? 'Paused' : 'Recording Study Session') : 'Ready'}
          </div>
        </div>

        {selectedTaskId && (
          <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={markTaskComplete}
              onChange={(e) => setMarkTaskComplete(e.target.checked)}
              className="w-4 h-4 accent-emerald-600"
            />
            <span>Mark linked task complete when saved</span>
          </label>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          {!isActive ? (
            <button
              type="button"
              disabled={Boolean(activeTuitionSession)}
              onClick={handleStart}
              className="px-8 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-sm cursor-pointer flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Start Stopwatch</span>
            </button>
          ) : (
            <>
              {isPaused ? (
                <button
                  type="button"
                  onClick={() => setIsPaused(false)}
                  className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs cursor-pointer flex items-center gap-2"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Resume</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsPaused(true)}
                  className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs cursor-pointer flex items-center gap-2"
                >
                  <Pause className="w-4 h-4" />
                  <span>Pause</span>
                </button>
              )}

              <button
                type="button"
                disabled={saving}
                onClick={() => void handleStopAndSave()}
                className="px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs cursor-pointer flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{saving ? 'Saving...' : 'Stop & Save'}</span>
              </button>

              {confirmReset ? (
                <div className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsActive(false);
                      setIsPaused(false);
                      setSeconds(0);
                      setConfirmReset(false);
                    }}
                    className="px-3.5 py-3 rounded-2xl bg-rose-600 text-white font-semibold text-xs cursor-pointer"
                  >
                    Confirm Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="px-3 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    Keep
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold text-xs cursor-pointer flex items-center gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Reset</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
