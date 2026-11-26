import React, { useState } from 'react';
import { CheckSquare, Play, Plus, Trash2, X } from 'lucide-react';
import { getKolkataDateKey } from '../lib/studytrackStore';
import type { StudyTask, SubjectType } from '../types/studytrack';

interface StudyTasksViewProps {
  tasks: StudyTask[];
  onAddTask: (task: Omit<StudyTask, 'id' | 'createdAt' | 'completed'>) => Promise<void>;
  onUpdateTask: (id: string, updates: Partial<StudyTask>) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  onLaunchStopwatchForTask: (taskId: string) => void;
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

export const StudyTasksView: React.FC<StudyTasksViewProps> = ({
  tasks,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onLaunchStopwatchForTask,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState<SubjectType>('Physics');
  const [chapter, setChapter] = useState('');
  const [priority, setPriority] = useState<'HIGH' | 'MEDIUM' | 'LOW'>('MEDIUM');
  const [targetDurationMinutes, setTargetDurationMinutes] = useState(60);
  const [scheduledDate, setScheduledDate] = useState(() => getKolkataDateKey());
  const [saving, setSaving] = useState(false);

  const [filterSubject, setFilterSubject] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'COMPLETED'>('PENDING');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onAddTask({
        title: title.trim(),
        subject,
        chapter: chapter.trim() || undefined,
        priority,
        targetDurationMinutes: Number(targetDurationMinutes) || 60,
        scheduledDate,
      });
      setTitle('');
      setChapter('');
      setShowModal(false);
    } finally {
      setSaving(false);
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (filterSubject !== 'ALL' && t.subject !== filterSubject) return false;
    if (filterStatus === 'PENDING' && t.completed) return false;
    if (filterStatus === 'COMPLETED' && !t.completed) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold font-display text-slate-900 dark:text-white tracking-tight">
            Study Tasks & Target Tracker
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Synced with OBREN Planner. Compare target study minutes against actual stopwatch logs.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Study Task</span>
        </button>
      </div>

      {/* Filters bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'ALL' | 'PENDING' | 'COMPLETED')}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium"
          >
            <option value="PENDING">Pending Tasks</option>
            <option value="ALL">All Tasks</option>
            <option value="COMPLETED">Completed Tasks</option>
          </select>

          <select
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium"
          >
            <option value="ALL">All Subjects</option>
            {SUBJECT_LIST.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
          {filteredTasks.length} task(s)
        </div>
      </div>

      {/* Tasks List */}
      <div className="space-y-3">
        {filteredTasks.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center text-xs text-slate-500 dark:text-slate-400 space-y-3">
            <CheckSquare className="w-8 h-8 text-indigo-400 mx-auto" />
            <p>No study tasks match this filter.</p>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="px-3.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-semibold cursor-pointer"
            >
              Create Study Task
            </button>
          </div>
        ) : (
          filteredTasks.map((t) => {
            const diffMins =
              typeof t.actualDurationMinutes === 'number'
                ? t.actualDurationMinutes - t.targetDurationMinutes
                : null;

            return (
              <div
                key={t.id}
                className={`p-4 rounded-2xl border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  t.completed
                    ? 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50 opacity-80'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                }`}
              >
                <div className="flex items-start gap-3.5">
                  <input
                    type="checkbox"
                    checked={t.completed}
                    onChange={(e) => void onUpdateTask(t.id, { completed: e.target.checked })}
                    className="mt-1 w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                  />
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">
                        {t.subject}
                      </span>
                      {t.chapter && (
                        <>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-500 dark:text-slate-400">{t.chapter}</span>
                        </>
                      )}
                      <span className="text-slate-400">·</span>
                      <span
                        className={`font-bold ${
                          t.priority === 'HIGH'
                            ? 'text-rose-600 dark:text-rose-400'
                            : t.priority === 'MEDIUM'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {t.priority}
                      </span>
                    </div>

                    <h4
                      className={`font-bold text-sm ${
                        t.completed
                          ? 'line-through text-slate-400'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {t.title}
                    </h4>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      <span>{t.scheduledDate}</span>
                      <span>·</span>
                      <span>Target {t.targetDurationMinutes}m</span>
                      {typeof t.actualDurationMinutes === 'number' && (
                        <>
                          <span>·</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                            Actual {t.actualDurationMinutes}m
                          </span>
                          {diffMins !== null && (
                            <span
                              className={
                                diffMins >= 0
                                  ? 'text-indigo-600 dark:text-indigo-400'
                                  : 'text-amber-600 dark:text-amber-400'
                              }
                            >
                              ({diffMins >= 0 ? `+${diffMins}m` : `${diffMins}m`})
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  {!t.completed && (
                    <button
                      type="button"
                      onClick={() => onLaunchStopwatchForTask(t.id)}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Stopwatch</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void onDeleteTask(t.id)}
                    aria-label="Delete study task"
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Task Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold font-display text-slate-900 dark:text-white">
                Create Study Task
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  maxLength={170}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Solve 30 Calculus Problems"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Subject *
                  </label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value as SubjectType)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  >
                    {SUBJECT_LIST.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as 'HIGH' | 'MEDIUM' | 'LOW')}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  >
                    <option value="HIGH">High Priority</option>
                    <option value="MEDIUM">Medium Priority</option>
                    <option value="LOW">Low Priority</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Chapter / Topic Name
                </label>
                <input
                  type="text"
                  maxLength={110}
                  value={chapter}
                  onChange={(e) => setChapter(e.target.value)}
                  placeholder="e.g. Integral Calculus"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Target Duration (Mins) *
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={720}
                    value={targetDurationMinutes}
                    onChange={(e) => setTargetDurationMinutes(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Scheduled Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
