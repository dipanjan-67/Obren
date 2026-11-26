import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Download,
  MapPin,
  Play,
  Plus,
  Repeat,
  Square,
} from 'lucide-react';
import {
  addDaysToDateKey,
  getKolkataDateKey,
  getWeekdayFromDateKey,
  isSessionScheduledForDate,
} from '../lib/studytrackStore';
import type { PlannerTask } from '../types/obren';
import type { TuitionSession } from '../types/studytrack';

interface VirtualCalendarViewProps {
  sessions: TuitionSession[];
  plannerTasks?: PlannerTask[];
  calendarTokenReady?: boolean;
  onStartTeacherCame?: (sessionId: string) => Promise<{ ok: boolean; error?: string }>;
  onStartTeacherGone?: (sessionId: string) => Promise<void>;
  onToggleTask?: (task: PlannerTask) => Promise<void>;
  onScheduleOnDate?: (dateKey: string) => void;
  onOpenGoogleSettings?: () => void;
  compactHeader?: boolean;
}

type CalendarEventItem =
  | {
      kind: 'TUITION';
      id: string;
      sortTime: string;
      session: TuitionSession;
      isRecurringOccurrence: boolean;
    }
  | {
      kind: 'TASK';
      id: string;
      sortTime: string;
      task: PlannerTask;
    };

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function formatReadableDate(dateKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey;
  const d = new Date(`${dateKey}T12:00:00+05:30`);
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getMonthDaysGrid(year: number, monthIndexZeroBased: number): Array<{
  dateKey: string;
  dayNumber: number;
  inCurrentMonth: boolean;
  dayOfWeek: number;
}> {
  const firstDayKey = `${year}-${String(monthIndexZeroBased + 1).padStart(2, '0')}-01`;
  const firstDow = getWeekdayFromDateKey(firstDayKey);
  const gridStartKey = addDaysToDateKey(firstDayKey, -firstDow);

  const cells: Array<{
    dateKey: string;
    dayNumber: number;
    inCurrentMonth: boolean;
    dayOfWeek: number;
  }> = [];

  for (let i = 0; i < 42; i += 1) {
    const key = addDaysToDateKey(gridStartKey, i);
    const [cy, cm, cd] = key.split('-').map(Number);
    cells.push({
      dateKey: key,
      dayNumber: cd,
      inCurrentMonth: cy === year && cm === monthIndexZeroBased + 1,
      dayOfWeek: i % 7,
    });
  }
  return cells;
}

function downloadVirtualScheduleIcs(sessions: TuitionSession[], tasks: PlannerTask[]) {
  const codeMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OBREN StudyTrack//Virtual Calendar//EN',
    'CALSCALE:GREGORIAN',
  ];

  sessions
    .filter((s) => s.status === 'SCHEDULED' || s.status === 'IN_PROGRESS')
    .forEach((s) => {
      const datePart = s.date.replace(/-/g, '');
      const startPart = `${s.startTime.replace(':', '')}00`;
      const endPart = `${(s.endTime > s.startTime ? s.endTime : s.startTime).replace(':', '')}00`;
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:tuition-${s.id}@obren.study`);
      lines.push(`DTSTART;TZID=Asia/Kolkata:${datePart}T${startPart}`);
      lines.push(`DTEND;TZID=Asia/Kolkata:${datePart}T${endPart}`);
      lines.push(`SUMMARY:${s.subject} Tuition - ${s.teacherName}`);
      if (s.locationOrLink) lines.push(`LOCATION:${s.locationOrLink}`);
      if (s.notes) lines.push(`DESCRIPTION:${s.notes.replace(/\n/g, ' ')}`);
      if (Array.isArray(s.recurringDays) && s.recurringDays.length > 0) {
        const byday = s.recurringDays
          .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
          .map((d) => codeMap[d])
          .join(',');
        if (byday) lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${byday}`);
      }
      lines.push('BEGIN:VALARM');
      lines.push('TRIGGER:-PT15M');
      lines.push('ACTION:DISPLAY');
      lines.push(`DESCRIPTION:${s.subject} tuition starts in 15 minutes`);
      lines.push('END:VALARM');
      lines.push('END:VEVENT');
    });

  tasks
    .filter((t) => !t.completed && t.scheduledDate)
    .forEach((t) => {
      const datePart = (t.scheduledDate || '').replace(/-/g, '');
      if (!datePart) return;
      const startTime = (t.scheduledTime || '09:00').replace(':', '') + '00';
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:task-${t.id}@obren.study`);
      lines.push(`DTSTART;TZID=Asia/Kolkata:${datePart}T${startTime}`);
      lines.push(`SUMMARY:${t.title}`);
      lines.push(`DESCRIPTION:${t.subject || 'Study'} (${t.category})`);
      lines.push('END:VEVENT');
    });

  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'obren-studytrack-schedule.ics';
  a.click();
  URL.revokeObjectURL(url);
}

export const VirtualCalendarView: React.FC<VirtualCalendarViewProps> = ({
  sessions,
  plannerTasks = [],
  calendarTokenReady = false,
  onStartTeacherCame,
  onStartTeacherGone,
  onToggleTask,
  onScheduleOnDate,
  onOpenGoogleSettings,
  compactHeader = false,
}) => {
  const todayKey = getKolkataDateKey();
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [viewMode, setViewMode] = useState<'MONTH' | 'WEEK'>('MONTH');
  const [filterKind, setFilterKind] = useState<'ALL' | 'TUITION' | 'TASKS'>('ALL');
  const [timerError, setTimerError] = useState<string | null>(null);

  const [cursorYear, setCursorYear] = useState<number>(() => Number(todayKey.slice(0, 4)));
  const [cursorMonth, setCursorMonth] = useState<number>(() => Number(todayKey.slice(5, 7)) - 1);

  const goPrevMonth = () => {
    if (cursorMonth === 0) {
      setCursorYear((y) => y - 1);
      setCursorMonth(11);
    } else {
      setCursorMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (cursorMonth === 11) {
      setCursorYear((y) => y + 1);
      setCursorMonth(0);
    } else {
      setCursorMonth((m) => m + 1);
    }
  };

  const goToday = () => {
    const tk = getKolkataDateKey();
    setSelectedDate(tk);
    setCursorYear(Number(tk.slice(0, 4)));
    setCursorMonth(Number(tk.slice(5, 7)) - 1);
  };

  const getEventsForDate = useMemo(() => {
    return (dateKey: string, dayOfWeek: number): CalendarEventItem[] => {
      const items: CalendarEventItem[] = [];

      if (filterKind === 'ALL' || filterKind === 'TUITION') {
        sessions.forEach((ses) => {
          const exactDateMatch = ses.date === dateKey;
          const recurringMatch =
            !exactDateMatch &&
            dateKey >= todayKey &&
            isSessionScheduledForDate(ses, dateKey, dayOfWeek);

          if (exactDateMatch || recurringMatch) {
            items.push({
              kind: 'TUITION',
              id: `tuition_${ses.id}_${dateKey}`,
              sortTime: ses.startTime || '00:00',
              session: ses,
              isRecurringOccurrence:
                Array.isArray(ses.recurringDays) && ses.recurringDays.length > 0,
            });
          }
        });
      }

      if (filterKind === 'ALL' || filterKind === 'TASKS') {
        plannerTasks.forEach((task) => {
          const matchesExact = task.scheduledDate === dateKey;
          const matchesWeekly =
            !task.scheduledDate &&
            typeof task.dayOfWeek === 'number' &&
            task.dayOfWeek === dayOfWeek;
          if (matchesExact || matchesWeekly) {
            items.push({
              kind: 'TASK',
              id: `task_${task.id}_${dateKey}`,
              sortTime: task.scheduledTime || '23:59',
              task,
            });
          }
        });
      }

      items.sort((a, b) => a.sortTime.localeCompare(b.sortTime));
      return items;
    };
  }, [sessions, plannerTasks, filterKind, todayKey]);

  const monthCells = useMemo(
    () => getMonthDaysGrid(cursorYear, cursorMonth),
    [cursorYear, cursorMonth]
  );

  const weekCells = useMemo(() => {
    const selectedDow = getWeekdayFromDateKey(selectedDate);
    const weekStart = addDaysToDateKey(selectedDate, -selectedDow);
    return Array.from({ length: 7 }, (_, i) => {
      const dateKey = addDaysToDateKey(weekStart, i);
      return {
        dateKey,
        dayNumber: Number(dateKey.slice(8, 10)),
        dayOfWeek: i,
      };
    });
  }, [selectedDate]);

  const selectedDow = getWeekdayFromDateKey(selectedDate);
  const selectedEvents = useMemo(
    () => getEventsForDate(selectedDate, selectedDow),
    [getEventsForDate, selectedDate, selectedDow]
  );

  const handleTeacherCame = async (sessionId: string) => {
    if (!onStartTeacherCame) return;
    setTimerError(null);
    const res = await onStartTeacherCame(sessionId);
    if (!res.ok && res.error) {
      setTimerError(res.error);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      {!compactHeader && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-extrabold font-display text-slate-900 dark:text-white tracking-tight">
                Virtual Calendar
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-[11px] font-mono font-semibold text-indigo-700 dark:text-indigo-300">
                No Google Sign-In Required
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Interactive monthly &amp; weekly schedule for all your repeating tuition classes, study tasks, and mock test plans.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => downloadVirtualScheduleIcs(sessions, plannerTasks)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-indigo-500" />
              <span>Export .ICS</span>
            </button>
            {!calendarTokenReady && onOpenGoogleSettings && (
              <button
                type="button"
                onClick={onOpenGoogleSettings}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer flex items-center gap-1.5"
              >
                <CalendarIcon className="w-3.5 h-3.5 text-emerald-500" />
                <span>Optional Google Sync</span>
              </button>
            )}
          </div>
        </div>
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

      {/* Calendar Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (viewMode === 'MONTH') goPrevMonth();
              else setSelectedDate((d) => addDaysToDateKey(d, -7));
            }}
            aria-label="Previous"
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => {
              if (viewMode === 'MONTH') goNextMonth();
              else setSelectedDate((d) => addDaysToDateKey(d, 7));
            }}
            aria-label="Next"
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <h3 className="font-bold font-display text-sm sm:text-base text-slate-900 dark:text-white ml-2">
            {viewMode === 'MONTH'
              ? `${MONTH_NAMES[cursorMonth]} ${cursorYear}`
              : `Week of ${weekCells[0].dateKey}`}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold">
            {(['ALL', 'TUITION', 'TASKS'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilterKind(f)}
                className={`px-2.5 py-1 rounded-lg cursor-pointer transition-colors ${
                  filterKind === f
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {f === 'ALL' ? 'All' : f === 'TUITION' ? 'Tuitions' : 'Tasks'}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold">
            {(['MONTH', 'WEEK'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1 rounded-lg cursor-pointer transition-colors ${
                  viewMode === mode
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {mode === 'MONTH' ? 'Month' : 'Week'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Calendar + Day Agenda Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Calendar Surface */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          {viewMode === 'MONTH' ? (
            <>
              <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                {DAY_HEADERS.map((d) => (
                  <div
                    key={d}
                    className="py-2.5 text-center text-[11px] font-mono font-bold uppercase text-slate-500 dark:text-slate-400"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 dark:divide-slate-800/80">
                {monthCells.map((cell) => {
                  const dayEvents = getEventsForDate(cell.dateKey, cell.dayOfWeek);
                  const isToday = cell.dateKey === todayKey;
                  const isSelected = cell.dateKey === selectedDate;
                  return (
                    <button
                      key={cell.dateKey}
                      type="button"
                      onClick={() => setSelectedDate(cell.dateKey)}
                      className={`min-h-[86px] sm:min-h-[104px] p-1.5 sm:p-2 text-left flex flex-col gap-1 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50/70 dark:bg-indigo-950/30 ring-2 ring-inset ring-indigo-500'
                          : cell.inCurrentMonth
                            ? 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                            : 'bg-slate-50/50 dark:bg-slate-950/40 text-slate-400 hover:bg-slate-100/60 dark:hover:bg-slate-900/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold ${
                            isToday
                              ? 'bg-indigo-600 text-white'
                              : cell.inCurrentMonth
                                ? 'text-slate-800 dark:text-slate-200'
                                : 'text-slate-400 dark:text-slate-600'
                          }`}
                        >
                          {cell.dayNumber}
                        </span>
                        {dayEvents.length > 0 && (
                          <span className="text-[10px] font-mono text-slate-400">
                            {dayEvents.length}
                          </span>
                        )}
                      </div>

                      <div className="space-y-1 w-full overflow-hidden">
                        {dayEvents.slice(0, 3).map((ev) => {
                          if (ev.kind === 'TUITION') {
                            const s = ev.session;
                            const completed = s.status === 'COMPLETED';
                            const live = s.status === 'IN_PROGRESS';
                            return (
                              <div
                                key={ev.id}
                                className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium truncate flex items-center gap-1 ${
                                  live
                                    ? 'bg-emerald-500 text-white'
                                    : completed
                                      ? 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                      : 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300'
                                }`}
                              >
                                {ev.isRecurringOccurrence && !completed && (
                                  <Repeat className="w-2.5 h-2.5 shrink-0" />
                                )}
                                <span className="truncate">
                                  {s.startTime} {s.subject}
                                </span>
                              </div>
                            );
                          }
                          return (
                            <div
                              key={ev.id}
                              className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium truncate ${
                                ev.task.completed
                                  ? 'bg-slate-100 dark:bg-slate-800/60 text-slate-400 line-through'
                                  : 'bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300'
                              }`}
                            >
                              {ev.task.title}
                            </div>
                          );
                        })}
                        {dayEvents.length > 3 && (
                          <div className="text-[10px] font-mono text-slate-400 px-1">
                            +{dayEvents.length - 3} more
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {weekCells.map((cell) => {
                const dayEvents = getEventsForDate(cell.dateKey, cell.dayOfWeek);
                const isToday = cell.dateKey === todayKey;
                const isSelected = cell.dateKey === selectedDate;
                return (
                  <div
                    key={cell.dateKey}
                    onClick={() => setSelectedDate(cell.dateKey)}
                    className={`p-4 flex flex-col sm:flex-row sm:items-start gap-3 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-indigo-50/50 dark:bg-indigo-950/20'
                        : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30'
                    }`}
                  >
                    <div className="sm:w-36 shrink-0 flex items-center sm:block gap-2">
                      <div className="text-xs font-mono font-bold uppercase text-indigo-600 dark:text-indigo-400">
                        {FULL_WEEKDAYS[cell.dayOfWeek]}
                        {isToday ? ' · Today' : ''}
                      </div>
                      <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                        {cell.dateKey}
                      </div>
                    </div>

                    <div className="flex-1 flex flex-wrap gap-2">
                      {dayEvents.length === 0 ? (
                        <span className="text-xs text-slate-400">No classes or tasks</span>
                      ) : (
                        dayEvents.map((ev) =>
                          ev.kind === 'TUITION' ? (
                            <div
                              key={ev.id}
                              className={`px-3 py-1.5 rounded-xl border text-xs flex items-center gap-2 ${
                                ev.session.status === 'COMPLETED'
                                  ? 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-500'
                                  : 'border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200'
                              }`}
                            >
                              {ev.isRecurringOccurrence && (
                                <Repeat className="w-3 h-3 shrink-0" />
                              )}
                              <span className="font-mono font-bold">
                                {ev.session.startTime}–{ev.session.endTime}
                              </span>
                              <span className="font-semibold">
                                {ev.session.subject} ({ev.session.teacherName})
                              </span>
                            </div>
                          ) : (
                            <div
                              key={ev.id}
                              className="px-3 py-1.5 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-violet-200 text-xs font-medium"
                            >
                              {ev.task.scheduledTime ? `${ev.task.scheduledTime} · ` : ''}
                              {ev.task.title}
                            </div>
                          )
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Day Agenda Inspector */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <div className="text-[11px] font-mono font-bold uppercase text-indigo-600 dark:text-indigo-400">
                {selectedDate === todayKey ? 'Today · Asia/Kolkata' : FULL_WEEKDAYS[selectedDow]}
              </div>
              <h3 className="font-bold font-display text-base text-slate-900 dark:text-white mt-0.5">
                {formatReadableDate(selectedDate)}
              </h3>
            </div>
            {onScheduleOnDate && (
              <button
                type="button"
                onClick={() => onScheduleOnDate(selectedDate)}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Tuition</span>
              </button>
            )}
          </div>

          {selectedEvents.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <Clock className="w-7 h-7 text-slate-300 dark:text-slate-700 mx-auto" />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Nothing scheduled on {selectedDate}.
              </p>
              {onScheduleOnDate && (
                <button
                  type="button"
                  onClick={() => onScheduleOnDate(selectedDate)}
                  className="px-3.5 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-semibold cursor-pointer"
                >
                  Schedule Weekly Class on {FULL_WEEKDAYS[selectedDow]}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {selectedEvents.map((ev) => {
                if (ev.kind === 'TUITION') {
                  const s = ev.session;
                  const canRunAttendance =
                    selectedDate === todayKey || s.status === 'IN_PROGRESS';
                  return (
                    <div
                      key={ev.id}
                      className={`p-3.5 rounded-xl border space-y-2 ${
                        s.status === 'IN_PROGRESS'
                          ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20'
                          : s.status === 'COMPLETED'
                            ? 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30'
                            : 'border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/20'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">
                          {s.startTime}–{s.endTime} IST
                        </span>
                        {ev.isRecurringOccurrence && (
                          <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-300 font-semibold">
                            <Repeat className="w-3 h-3" />
                            Weekly
                          </span>
                        )}
                      </div>

                      <div className="font-bold text-sm text-slate-900 dark:text-white">
                        {s.subject} with {s.teacherName}
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{s.locationOrLink || 'Online / Study Room'}</span>
                      </div>

                      {s.status === 'COMPLETED' && s.teacherCameAt && (
                        <div className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                          Came {s.teacherCameAt} → Gone {s.teacherGoneAt} ({s.actualDurationMinutes}m)
                        </div>
                      )}

                      {canRunAttendance && s.status === 'SCHEDULED' && onStartTeacherCame && (
                        <button
                          type="button"
                          onClick={() => void handleTeacherCame(s.id)}
                          className="w-full mt-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Teacher Came</span>
                        </button>
                      )}

                      {canRunAttendance && s.status === 'IN_PROGRESS' && onStartTeacherGone && (
                        <button
                          type="button"
                          onClick={() => void onStartTeacherGone(s.id)}
                          className="w-full mt-1 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Square className="w-3.5 h-3.5" />
                          <span>Teacher Gone</span>
                        </button>
                      )}
                    </div>
                  );
                }

                const task = ev.task;
                return (
                  <div
                    key={ev.id}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 flex items-start gap-2.5"
                  >
                    {onToggleTask ? (
                      <button
                        type="button"
                        onClick={() => void onToggleTask(task)}
                        className="mt-0.5 text-indigo-600 dark:text-indigo-400 cursor-pointer shrink-0"
                      >
                        {task.completed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Circle className="w-4 h-4" />
                        )}
                      </button>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-mono font-bold uppercase text-violet-600 dark:text-violet-400">
                        {task.category.replace('_', ' ')}
                        {task.scheduledTime ? ` · ${task.scheduledTime}` : ''}
                        {task.subject ? ` · ${task.subject}` : ''}
                      </div>
                      <div
                        className={`text-xs font-semibold mt-0.5 ${
                          task.completed
                            ? 'line-through text-slate-400'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {task.title}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
