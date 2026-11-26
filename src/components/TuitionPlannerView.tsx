import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Clock,
  Edit2,
  List,
  MapPin,
  Play,
  Plus,
  Repeat,
  Square,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import type { PlannerTask } from '../types/obren';
import type { SubjectType, TeacherProfile, TuitionSession } from '../types/studytrack';
import {
  getKolkataDateKey,
  getNextDisplayDateForSession,
  getWeekdayFromDateKey,
} from '../lib/studytrackStore';
import { VirtualCalendarView } from './VirtualCalendarView';

interface TuitionPlannerViewProps {
  teachers: TeacherProfile[];
  sessions: TuitionSession[];
  plannerTasks?: PlannerTask[];
  googleCalendarConnected: boolean;
  calendarTokenReady: boolean;
  preselectedDate?: string | null;
  onClearPreselectedDate?: () => void;
  onConnectCalendar: () => Promise<void>;
  onAddTeacher: (teacher: Omit<TeacherProfile, 'id' | 'createdAt'>) => Promise<void>;
  onDeleteTeacher: (id: string) => Promise<void>;
  onAddSession: (
    session: Omit<TuitionSession, 'id' | 'status'>,
    options?: { syncToGoogleCalendar?: boolean }
  ) => Promise<void>;
  onUpdateSession: (
    id: string,
    updates: Partial<TuitionSession>,
    options?: { syncGoogleEvent?: boolean }
  ) => Promise<void>;
  onDeleteSession: (id: string, options?: { deleteGoogleEvent?: boolean }) => Promise<void>;
  onStartTeacherCame: (sessionId: string) => Promise<{ ok: boolean; error?: string }>;
  onStartTeacherGone: (sessionId: string) => Promise<void>;
  onToggleTask?: (task: PlannerTask) => Promise<void>;
  onOpenSettings?: () => void;
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

const WEEKDAYS = [
  { value: 0, label: 'Sun', full: 'Sunday' },
  { value: 1, label: 'Mon', full: 'Monday' },
  { value: 2, label: 'Tue', full: 'Tuesday' },
  { value: 3, label: 'Wed', full: 'Wednesday' },
  { value: 4, label: 'Thu', full: 'Thursday' },
  { value: 5, label: 'Fri', full: 'Friday' },
  { value: 6, label: 'Sat', full: 'Saturday' },
];

const AVATAR_COLORS = [
  'bg-indigo-600',
  'bg-emerald-600',
  'bg-amber-600',
  'bg-violet-600',
  'bg-rose-600',
];

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const TuitionPlannerView: React.FC<TuitionPlannerViewProps> = ({
  teachers,
  sessions,
  plannerTasks = [],
  googleCalendarConnected,
  calendarTokenReady,
  preselectedDate,
  onClearPreselectedDate,
  onConnectCalendar,
  onAddTeacher,
  onDeleteTeacher,
  onAddSession,
  onUpdateSession,
  onDeleteSession,
  onStartTeacherCame,
  onStartTeacherGone,
  onToggleTask,
  onOpenSettings,
}) => {
  const [layoutMode, setLayoutMode] = useState<'LIST' | 'CALENDAR'>('LIST');
  const [showAddTeacherModal, setShowAddTeacherModal] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [editingSession, setEditingSession] = useState<TuitionSession | null>(null);

  // Explicit confirmation dialog for Google Calendar mutations/deletions
  const [pendingCalendarConfirm, setPendingCalendarConfirm] = useState<{
    actionType: 'CREATE' | 'UPDATE' | 'DELETE';
    title: string;
    description: string;
    onConfirm: (syncWithCalendar: boolean) => Promise<void>;
  } | null>(null);

  const [timerError, setTimerError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Teacher form
  const [teacherName, setTeacherName] = useState('');
  const [teacherSubject, setTeacherSubject] = useState<SubjectType>('Physics');
  const [teacherEmail, setTeacherEmail] = useState('');
  const [teacherPhone, setTeacherPhone] = useState('');
  const [teacherLocation, setTeacherLocation] = useState('');

  // Session form
  const [sessionTeacherId, setSessionTeacherId] = useState('');
  const [sessionDate, setSessionDate] = useState(() => getKolkataDateKey());
  const [sessionStartTime, setSessionStartTime] = useState('17:00');
  const [sessionEndTime, setSessionEndTime] = useState('19:00');
  const [sessionLocation, setSessionLocation] = useState('');
  const [sessionNotes, setSessionNotes] = useState('');
  const [sessionRecurringDays, setSessionRecurringDays] = useState<number[]>(() => [
    getWeekdayFromDateKey(getKolkataDateKey()),
  ]);
  const [repeatWeekly, setRepeatWeekly] = useState(true);
  const [syncToCalendarChecked, setSyncToCalendarChecked] = useState(true);

  const hasInProgress = sessions.some((s) => s.status === 'IN_PROGRESS');

  useEffect(() => {
    if (!hasInProgress) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasInProgress]);

  const openCreateSessionModal = (targetDate?: string) => {
    const chosenDate =
      targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate) ? targetDate : getKolkataDateKey();
    const chosenDow = getWeekdayFromDateKey(chosenDate);
    setEditingSession(null);
    setSessionTeacherId(teachers[0]?.id || '');
    setSessionDate(chosenDate);
    setSessionStartTime('17:00');
    setSessionEndTime('19:00');
    setSessionLocation(teachers[0]?.locationOrLink || '');
    setSessionNotes('');
    setRepeatWeekly(true);
    setSessionRecurringDays([chosenDow]);
    setSyncToCalendarChecked(googleCalendarConnected && calendarTokenReady);
    setShowSessionModal(true);
  };

  useEffect(() => {
    if (!preselectedDate) return;
    if (teachers.length === 0) {
      setShowAddTeacherModal(true);
    } else {
      openCreateSessionModal(preselectedDate);
    }
    onClearPreselectedDate?.();
  }, [preselectedDate]);

  const openEditSessionModal = (ses: TuitionSession) => {
    const existingDays = Array.isArray(ses.recurringDays) ? ses.recurringDays : [];
    setEditingSession(ses);
    setSessionTeacherId(ses.teacherId);
    setSessionDate(ses.date);
    setSessionStartTime(ses.startTime);
    setSessionEndTime(ses.endTime);
    setSessionLocation(ses.locationOrLink || '');
    setSessionNotes(ses.notes || '');
    setRepeatWeekly(existingDays.length > 0);
    setSessionRecurringDays(existingDays);
    setSyncToCalendarChecked(Boolean(ses.googleEventId));
    setShowSessionModal(true);
  };

  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherName.trim()) return;
    setBusyAction(true);
    try {
      await onAddTeacher({
        name: teacherName.trim(),
        subject: teacherSubject,
        email: teacherEmail.trim(),
        phone: teacherPhone.trim(),
        locationOrLink: teacherLocation.trim(),
        avatarColor: AVATAR_COLORS[teachers.length % AVATAR_COLORS.length],
      });
      setTeacherName('');
      setTeacherEmail('');
      setTeacherPhone('');
      setTeacherLocation('');
      setShowAddTeacherModal(false);
    } finally {
      setBusyAction(false);
    }
  };

  const handleSessionFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const teacher = teachers.find((t) => t.id === sessionTeacherId);
    if (!teacher) return;

    const payload: Omit<TuitionSession, 'id' | 'status'> = {
      teacherId: teacher.id,
      teacherName: teacher.name,
      subject: teacher.subject,
      date: sessionDate,
      startTime: sessionStartTime,
      endTime: sessionEndTime,
      recurringDays: sessionRecurringDays,
      locationOrLink: sessionLocation.trim() || teacher.locationOrLink || 'Online',
      notes: sessionNotes.trim(),
    };

    if (editingSession) {
      if (editingSession.googleEventId && calendarTokenReady) {
        setShowSessionModal(false);
        setPendingCalendarConfirm({
          actionType: 'UPDATE',
          title: 'Confirm Google Calendar Update',
          description: `Updating "${payload.subject} with ${payload.teacherName}" (${payload.date} ${payload.startTime}–${payload.endTime}) will also modify the linked Google Calendar event.`,
          onConfirm: async (syncWithCalendar) => {
            await onUpdateSession(editingSession.id, payload, {
              syncGoogleEvent: syncWithCalendar,
            });
          },
        });
        return;
      }
      setBusyAction(true);
      try {
        await onUpdateSession(editingSession.id, payload, { syncGoogleEvent: false });
        setShowSessionModal(false);
      } finally {
        setBusyAction(false);
      }
      return;
    }

    if (syncToCalendarChecked && calendarTokenReady) {
      setShowSessionModal(false);
      setPendingCalendarConfirm({
        actionType: 'CREATE',
        title: 'Confirm Google Calendar Event Creation',
        description: `Create "${payload.subject} Tuition · ${payload.teacherName}" on ${payload.date} (${payload.startTime}–${payload.endTime} IST) with a 15-minute Google Calendar reminder?`,
        onConfirm: async (syncWithCalendar) => {
          await onAddSession(payload, { syncToGoogleCalendar: syncWithCalendar });
        },
      });
      return;
    }

    setBusyAction(true);
    try {
      await onAddSession(payload, { syncToGoogleCalendar: false });
      setShowSessionModal(false);
    } finally {
      setBusyAction(false);
    }
  };

  const handleRequestDeleteSession = (ses: TuitionSession) => {
    if (ses.googleEventId && calendarTokenReady) {
      setPendingCalendarConfirm({
        actionType: 'DELETE',
        title: 'Confirm Google Calendar Event Deletion',
        description: `Delete "${ses.subject} with ${ses.teacherName}" (${ses.date} ${ses.startTime}) from StudyTrack and remove its linked Google Calendar event?`,
        onConfirm: async (deleteFromCalendar) => {
          await onDeleteSession(ses.id, { deleteGoogleEvent: deleteFromCalendar });
        },
      });
      return;
    }
    setPendingCalendarConfirm({
      actionType: 'DELETE',
      title: 'Delete Tuition Session',
      description: `Remove "${ses.subject} with ${ses.teacherName}" (${ses.date} ${ses.startTime}) from your tuition schedule?`,
      onConfirm: async () => {
        await onDeleteSession(ses.id, { deleteGoogleEvent: false });
      },
    });
  };

  const handleTeacherCameClick = async (sessionId: string) => {
    setTimerError(null);
    const res = await onStartTeacherCame(sessionId);
    if (!res.ok && res.error) {
      setTimerError(res.error);
    }
  };

  const toggleRecurringDay = (day: number) => {
    setSessionRecurringDays((prev) => {
      const next = prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort((a, b) => a - b);
      setRepeatWeekly(next.length > 0);
      return next;
    });
  };

  const handleSessionDateChange = (newDate: string) => {
    const prevDow = getWeekdayFromDateKey(sessionDate);
    const nextDow = getWeekdayFromDateKey(newDate);
    setSessionDate(newDate);
    if (repeatWeekly) {
      setSessionRecurringDays((prev) => {
        const withoutPrev = prev.filter((d) => d !== prevDow);
        return Array.from(new Set([...withoutPrev, nextDow])).sort((a, b) => a - b);
      });
    }
  };

  const handleToggleRepeatWeekly = (enabled: boolean) => {
    setRepeatWeekly(enabled);
    if (enabled) {
      const dateDow = getWeekdayFromDateKey(sessionDate);
      setSessionRecurringDays((prev) => (prev.length > 0 ? prev : [dateDow]));
    } else {
      setSessionRecurringDays([]);
    }
  };

  const handleEnableWeeklyRepeatForSession = async (ses: TuitionSession) => {
    const dow = getWeekdayFromDateKey(ses.date);
    const updatedDays = [dow];
    if (ses.googleEventId && calendarTokenReady) {
      setPendingCalendarConfirm({
        actionType: 'UPDATE',
        title: 'Repeat Weekly on Google Calendar',
        description: `Repeat "${ses.subject} with ${ses.teacherName}" every ${WEEKDAYS.find((w) => w.value === dow)?.full || 'week'} at ${ses.startTime}–${ses.endTime} and update the linked Google Calendar event?`,
        onConfirm: async (syncWithCalendar) => {
          await onUpdateSession(ses.id, { recurringDays: updatedDays }, { syncGoogleEvent: syncWithCalendar });
        },
      });
      return;
    }
    setBusyAction(true);
    try {
      await onUpdateSession(ses.id, { recurringDays: updatedDays }, { syncGoogleEvent: false });
    } finally {
      setBusyAction(false);
    }
  };

  const todayKey = getKolkataDateKey();
  const activeSessions = sessions
    .filter((s) => s.status === 'IN_PROGRESS' || s.status === 'SCHEDULED')
    .sort((a, b) => {
      if (a.status === 'IN_PROGRESS' && b.status !== 'IN_PROGRESS') return -1;
      if (b.status === 'IN_PROGRESS' && a.status !== 'IN_PROGRESS') return 1;
      const dateA = getNextDisplayDateForSession(a, todayKey);
      const dateB = getNextDisplayDateForSession(b, todayKey);
      return `${dateA} ${a.startTime}`.localeCompare(`${dateB} ${b.startTime}`);
    });
  const completedSessions = sessions.filter((s) => s.status === 'COMPLETED');

  return (
    <div className="space-y-6">
      {/* Header & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold font-display text-slate-900 dark:text-white tracking-tight">
            Tuition Planner & Attendance
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage teacher profiles, schedule recurring classes, and record exact arrival/departure timestamps.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!calendarTokenReady && (
            <button
              type="button"
              onClick={() => void onConnectCalendar().catch(() => {})}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer flex items-center gap-2"
            >
              <Calendar className="w-3.5 h-3.5 text-indigo-500" />
              <span>{googleCalendarConnected ? 'Reconnect Calendar' : 'Connect Google Calendar'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowAddTeacherModal(true)}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer flex items-center gap-2"
          >
            <User className="w-4 h-4 text-indigo-500" />
            <span>Add Teacher</span>
          </button>
          <button
            type="button"
            disabled={teachers.length === 0}
            onClick={() => openCreateSessionModal()}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Schedule Tuition</span>
          </button>
        </div>
      </div>

      {/* View Switcher: Schedule List vs Virtual Calendar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setLayoutMode('LIST')}
            className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors ${
              layoutMode === 'LIST'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Schedule List</span>
          </button>
          <button
            type="button"
            onClick={() => setLayoutMode('CALENDAR')}
            className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors ${
              layoutMode === 'CALENDAR'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            <span>Virtual Calendar</span>
          </button>
        </div>

        {!calendarTokenReady && (
          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            Virtual Calendar works natively without Google Calendar sign-in
          </span>
        )}
      </div>

      {layoutMode === 'CALENDAR' && (
        <VirtualCalendarView
          sessions={sessions}
          plannerTasks={plannerTasks}
          calendarTokenReady={calendarTokenReady}
          onStartTeacherCame={onStartTeacherCame}
          onStartTeacherGone={onStartTeacherGone}
          onToggleTask={onToggleTask}
          onScheduleOnDate={(dateKey) => {
            if (teachers.length === 0) setShowAddTeacherModal(true);
            else openCreateSessionModal(dateKey);
          }}
          onOpenGoogleSettings={onOpenSettings}
          compactHeader
        />
      )}

      {timerError && (
        <div className="p-3.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{timerError}</span>
          </div>
          <button
            type="button"
            onClick={() => setTimerError(null)}
            className="text-xs font-semibold underline cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {layoutMode === 'LIST' && (
        <>
          {/* Registered Teachers */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white font-display flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-500" />
                <span>Registered Teachers ({teachers.length})</span>
              </h3>
            </div>

            {teachers.length === 0 ? (
              <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center space-y-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Add your first tutor or coaching teacher to start scheduling tuition classes and attendance logs.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddTeacherModal(true)}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Add First Teacher
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {teachers.map((t) => (
                  <div
                    key={t.id}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl ${t.avatarColor} text-white flex items-center justify-center font-bold font-display shrink-0`}
                        >
                          {t.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                            {t.name}
                          </h4>
                          <div className="text-xs font-mono text-indigo-600 dark:text-indigo-400">
                            {t.subject}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void onDeleteTeacher(t.id)}
                        title="Delete teacher"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1 font-mono">
                      {t.phone && <div>{t.phone}</div>}
                      {t.email && <div className="truncate">{t.email}</div>}
                      {t.locationOrLink && (
                        <div className="truncate flex items-center gap-1.5">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{t.locationOrLink}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

      {/* Scheduled & Repeating Tuition Sessions */}
      <div className="space-y-4 pt-1">
        <h3 className="font-bold text-sm text-slate-900 dark:text-white font-display flex items-center gap-2">
          <Calendar className="w-4 h-4 text-indigo-500" />
          <span>Tuition Schedule ({activeSessions.length})</span>
        </h3>

        {activeSessions.length === 0 ? (
          <div className="p-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-xs text-slate-500 dark:text-slate-400">
            No upcoming tuition sessions scheduled. Click &ldquo;Schedule Tuition&rdquo; to add a weekly class.
          </div>
        ) : (
          <div className="space-y-3">
            {activeSessions.map((s) => {
              const liveElapsed =
                s.status === 'IN_PROGRESS' && s.teacherCameTimestamp
                  ? formatElapsed(nowMs - s.teacherCameTimestamp)
                  : null;
              const weekdaySummary =
                s.recurringDays && s.recurringDays.length > 0
                  ? s.recurringDays
                      .map((d) => WEEKDAYS.find((w) => w.value === d)?.label || '')
                      .filter(Boolean)
                      .join(', ')
                  : null;
              const nextDate = getNextDisplayDateForSession(s, todayKey);

              return (
                <div
                  key={s.id}
                  className={`p-5 rounded-2xl border transition-colors ${
                    s.status === 'IN_PROGRESS'
                      ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums">
                        <span
                          className={`font-bold ${
                            s.status === 'IN_PROGRESS'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-indigo-600 dark:text-indigo-400'
                          }`}
                        >
                          {s.status === 'IN_PROGRESS'
                            ? `Live (${liveElapsed || '00:00:00'})`
                            : nextDate === todayKey
                              ? 'Today'
                              : 'Scheduled'}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-600 dark:text-slate-300">
                          {nextDate} · {s.startTime}–{s.endTime}
                        </span>
                        {weekdaySummary && (
                          <>
                            <span className="text-slate-400">·</span>
                            <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-semibold">
                              <Repeat className="w-3 h-3" />
                              Every {weekdaySummary} (same time)
                            </span>
                          </>
                        )}
                        {s.googleEventId && (
                          <>
                            <span className="text-slate-400">·</span>
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                              <CheckCircle2 className="w-3 h-3" />
                              Calendar Synced
                            </span>
                          </>
                        )}
                      </div>

                      <h4 className="font-bold text-base text-slate-900 dark:text-white">
                        {s.subject} with {s.teacherName}
                      </h4>

                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{s.locationOrLink || 'Online / Study Room'}</span>
                      </div>

                      {s.notes && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">{s.notes}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {s.status === 'SCHEDULED' && (!s.recurringDays || s.recurringDays.length === 0) && (
                        <button
                          type="button"
                          disabled={busyAction}
                          onClick={() => void handleEnableWeeklyRepeatForSession(s)}
                          title="Repeat this day every week at the same time"
                          className="px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-semibold cursor-pointer flex items-center gap-1.5"
                        >
                          <Repeat className="w-3.5 h-3.5" />
                          <span>Repeat Weekly</span>
                        </button>
                      )}

                      {s.status === 'SCHEDULED' && (
                        <button
                          type="button"
                          onClick={() => void handleTeacherCameClick(s.id)}
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Teacher Came</span>
                        </button>
                      )}

                      {s.status === 'IN_PROGRESS' && (
                        <button
                          type="button"
                          onClick={() => void onStartTeacherGone(s.id)}
                          className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5"
                        >
                          <Square className="w-3.5 h-3.5" />
                          <span>Teacher Gone</span>
                        </button>
                      )}

                      {s.status === 'SCHEDULED' && (
                        <button
                          type="button"
                          onClick={() => openEditSessionModal(s)}
                          title="Edit session"
                          className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRequestDeleteSession(s)}
                        title="Delete session"
                        className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {completedSessions.length > 0 && (
          <div className="space-y-3 pt-4">
            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono">
              Completed Attendance History ({completedSessions.length})
            </h4>
            <div className="space-y-2.5">
              {completedSessions.slice(0, 10).map((s) => (
                <div
                  key={s.id}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        Completed ({s.actualDurationMinutes || 0}m)
                      </span>
                      <span>·</span>
                      <span>{s.date} · {s.startTime}–{s.endTime}</span>
                      {s.teacherCameAt && s.teacherGoneAt && (
                        <>
                          <span>·</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            Came {s.teacherCameAt} → Gone {s.teacherGoneAt}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="font-bold text-sm text-slate-900 dark:text-white">
                      {s.subject} with {s.teacherName}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRequestDeleteSession(s)}
                    title="Delete log"
                    className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 cursor-pointer self-start sm:self-center shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
        </>
      )}

      {/* Add Teacher Modal */}
      {showAddTeacherModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold font-display text-slate-900 dark:text-white">
                Add Teacher Profile
              </h3>
              <button
                type="button"
                onClick={() => setShowAddTeacherModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateTeacher} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Teacher Name *
                </label>
                <input
                  type="text"
                  required
                  maxLength={75}
                  value={teacherName}
                  onChange={(e) => setTeacherName(e.target.value)}
                  placeholder="e.g. Dr. R. K. Sharma"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Subject *
                </label>
                <select
                  value={teacherSubject}
                  onChange={(e) => setTeacherSubject(e.target.value as SubjectType)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                >
                  {SUBJECT_LIST.map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Phone
                  </label>
                  <input
                    type="text"
                    maxLength={30}
                    value={teacherPhone}
                    onChange={(e) => setTeacherPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    maxLength={150}
                    value={teacherEmail}
                    onChange={(e) => setTeacherEmail(e.target.value)}
                    placeholder="teacher@edu.in"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Default Location or Meeting Link
                </label>
                <input
                  type="text"
                  maxLength={250}
                  value={teacherLocation}
                  onChange={(e) => setTeacherLocation(e.target.value)}
                  placeholder="Room 302 or Zoom/Meet link"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddTeacherModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyAction}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
                >
                  {busyAction ? 'Saving...' : 'Save Teacher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit Tuition Session Modal */}
      {showSessionModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold font-display text-slate-900 dark:text-white">
                {editingSession ? 'Edit Tuition Session' : 'Schedule Tuition Session'}
              </h3>
              <button
                type="button"
                onClick={() => setShowSessionModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSessionFormSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Teacher *
                </label>
                <select
                  value={sessionTeacherId}
                  onChange={(e) => {
                    setSessionTeacherId(e.target.value);
                    const t = teachers.find((item) => item.id === e.target.value);
                    if (t?.locationOrLink && !sessionLocation) {
                      setSessionLocation(t.locationOrLink);
                    }
                  }}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                >
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.subject})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Start Date *
                </label>
                <input
                  type="date"
                  required
                  value={sessionDate}
                  onChange={(e) => handleSessionDateChange(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Start Time (IST) *
                  </label>
                  <input
                    type="time"
                    required
                    value={sessionStartTime}
                    onChange={(e) => setSessionStartTime(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    End Time (IST) *
                  </label>
                  <input
                    type="time"
                    required
                    value={sessionEndTime}
                    onChange={(e) => setSessionEndTime(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 space-y-2.5">
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <div>
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Repeat className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Repeat every week (same day &amp; time)</span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {sessionRecurringDays.length > 0
                        ? `Repeats every ${sessionRecurringDays
                            .map((d) => WEEKDAYS.find((w) => w.value === d)?.full)
                            .filter(Boolean)
                            .join(', ')} at ${sessionStartTime}–${sessionEndTime}`
                        : 'One-time class only'}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={repeatWeekly && sessionRecurringDays.length > 0}
                    onChange={(e) => handleToggleRepeatWeekly(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 cursor-pointer shrink-0"
                  />
                </label>

                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((day) => {
                    const active = sessionRecurringDays.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleRecurringDay(day.value)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold cursor-pointer border ${
                          active
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Location / Meeting Link
                </label>
                <input
                  type="text"
                  maxLength={250}
                  value={sessionLocation}
                  onChange={(e) => setSessionLocation(e.target.value)}
                  placeholder="Room 302 or Meet/Zoom link"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Topics / Notes
                </label>
                <textarea
                  rows={2}
                  maxLength={450}
                  value={sessionNotes}
                  onChange={(e) => setSessionNotes(e.target.value)}
                  placeholder="e.g. Rotational Mechanics problem drill"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs resize-none"
                />
              </div>

              {!editingSession && (
                <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-xs cursor-pointer">
                  <div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      Sync to Google Calendar
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {calendarTokenReady
                        ? 'Adds event with 15-min reminder in Asia/Kolkata.'
                        : 'Connect Google Calendar in Settings first to enable live sync.'}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    disabled={!calendarTokenReady}
                    checked={syncToCalendarChecked && calendarTokenReady}
                    onChange={(e) => setSyncToCalendarChecked(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600"
                  />
                </label>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSessionModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyAction}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
                >
                  {busyAction ? 'Saving...' : editingSession ? 'Save Changes' : 'Save Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Explicit Confirmation Modal for Google Calendar / Deletions */}
      {pendingCalendarConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold font-display text-slate-900 dark:text-white">
                  {pendingCalendarConfirm.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  {pendingCalendarConfirm.description}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={busyAction}
                onClick={() => setPendingCalendarConfirm(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer"
              >
                Cancel
              </button>
              {pendingCalendarConfirm.actionType !== 'CREATE' && (
                <button
                  type="button"
                  disabled={busyAction}
                  onClick={async () => {
                    setBusyAction(true);
                    try {
                      await pendingCalendarConfirm.onConfirm(false);
                      setPendingCalendarConfirm(null);
                    } finally {
                      setBusyAction(false);
                    }
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  StudyTrack Only
                </button>
              )}
              <button
                type="button"
                disabled={busyAction}
                onClick={async () => {
                  setBusyAction(true);
                  try {
                    await pendingCalendarConfirm.onConfirm(true);
                    setPendingCalendarConfirm(null);
                  } finally {
                    setBusyAction(false);
                  }
                }}
                className={`px-4 py-2 rounded-xl text-white text-xs font-semibold cursor-pointer ${
                  pendingCalendarConfirm.actionType === 'DELETE'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {busyAction
                  ? 'Applying...'
                  : pendingCalendarConfirm.actionType === 'DELETE'
                    ? 'Confirm Delete'
                    : 'Confirm & Sync Calendar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
