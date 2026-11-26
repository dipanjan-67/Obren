import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  clearCalendarAccessToken,
  connectGoogleCalendar,
  createTuitionCalendarEvent,
  deleteTuitionCalendarEvent,
  getCalendarAccessToken,
  initCalendarAuthListener,
  listUpcomingCalendarEvents,
  updateTuitionCalendarEvent,
  type GoogleCalendarEventSummary,
} from './googleCalendar';
import type { PlannerTask } from '../types/obren';
import type {
  ActiveTuitionReminder,
  StopwatchSessionRecord,
  StudyTask,
  SubjectType,
  TeacherProfile,
  TuitionSession,
  UserSettings,
} from '../types/studytrack';

const DEFAULT_SETTINGS: UserSettings = {
  googleCalendarConnected: false,
  googleAccountEmail: '',
  notifications: {
    enabled15MinReminder: true,
    pushNotifications: false,
    reminderOffsetMinutes: 15,
    soundAlert: true,
    speechAlert: true,
  },
};

export function getKolkataDateKey(date = new Date()): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function getKolkataTimeParts(date = new Date()): {
  dateKey: string;
  dayOfWeek: number;
  hours: number;
  minutes: number;
  totalMinutes: number;
  formatted12h: string;
} {
  const dateKey = getKolkataDateKey(date);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hours = Number(parts.find((p) => p.type === 'hour')?.value || '0');
  const minutes = Number(parts.find((p) => p.type === 'minute')?.value || '0');
  const weekdayStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
  }).format(date);
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const formatted12h = date.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return {
    dateKey,
    dayOfWeek: weekdayMap[weekdayStr] ?? date.getDay(),
    hours,
    minutes,
    totalMinutes: hours * 60 + minutes,
    formatted12h,
  };
}

export function getWeekdayFromDateKey(dateKey: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return getKolkataTimeParts().dayOfWeek;
  }
  const d = new Date(`${dateKey}T12:00:00+05:30`);
  return getKolkataTimeParts(d).dayOfWeek;
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
    ? new Date(`${dateKey}T12:00:00+05:30`)
    : new Date();
  const shifted = new Date(base.getTime() + days * 86400000);
  return getKolkataDateKey(shifted);
}

export function isSessionScheduledForDate(
  session: Pick<TuitionSession, 'status' | 'date' | 'recurringDays'>,
  dateKey: string,
  dayOfWeek: number
): boolean {
  if (session.status !== 'SCHEDULED') return false;
  if (session.date === dateKey) return true;
  if (
    Array.isArray(session.recurringDays) &&
    session.recurringDays.length > 0 &&
    session.date <= dateKey &&
    session.recurringDays.includes(dayOfWeek)
  ) {
    return true;
  }
  return false;
}

export function getNextRecurringDateKey(
  afterDateKey: string,
  recurringDays: number[],
  includeStartDate = false
): string {
  const validDays = recurringDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const startOffset = includeStartDate ? 0 : 1;
  if (validDays.length === 0) {
    return addDaysToDateKey(afterDateKey, 7);
  }
  for (let offset = startOffset; offset <= 14; offset += 1) {
    const candidate = addDaysToDateKey(afterDateKey, offset);
    if (validDays.includes(getWeekdayFromDateKey(candidate))) {
      return candidate;
    }
  }
  return addDaysToDateKey(afterDateKey, 7);
}

export function getNextDisplayDateForSession(
  session: Pick<TuitionSession, 'status' | 'date' | 'recurringDays'>,
  todayKey = getKolkataDateKey()
): string {
  if (
    session.status === 'SCHEDULED' &&
    Array.isArray(session.recurringDays) &&
    session.recurringDays.length > 0 &&
    session.date < todayKey
  ) {
    return getNextRecurringDateKey(todayKey, session.recurringDays, true);
  }
  return session.date;
}

function playReminderChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.16);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.75);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.75);
  } catch {
    // Ignore audio context autoplay restrictions
  }
}

export function announceTuitionReminderSpeech(params: {
  subject: string;
  teacherName: string;
  startTime: string;
  minutesUntilStart: number;
}): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return false;
  }
  try {
    window.speechSynthesis.cancel();
    const minsText =
      params.minutesUntilStart <= 1
        ? 'in about 1 minute'
        : `in ${params.minutesUntilStart} minutes`;
    const message = `Tuition reminder: Your ${params.subject} session with ${params.teacherName} starts at ${params.startTime}, which is ${minsText}.`;

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.lang = 'en-US';

    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find(
      (v) =>
        v.lang.startsWith('en') &&
        (v.name.includes('Natural') ||
          v.name.includes('Google') ||
          v.name.includes('Samantha') ||
          v.default)
    );
    if (englishVoice) {
      utterance.voice = englishVoice;
    }

    window.speechSynthesis.speak(utterance);
    return true;
  } catch (err) {
    console.warn('Speech synthesis error:', err);
    return false;
  }
}

function normalizeSubject(sub?: string): SubjectType {
  if (
    sub === 'Physics' ||
    sub === 'Chemistry' ||
    sub === 'Mathematics' ||
    sub === 'Biology' ||
    sub === 'Computer Science' ||
    sub === 'English'
  ) {
    return sub;
  }
  return 'Other';
}

export function useStudyTrackStore(params: {
  uid: string | null;
  userEmail: string | null;
  isVerified: boolean;
  plannerTasks: PlannerTask[];
}) {
  const { uid, userEmail, isVerified, plannerTasks } = params;

  const [teachers, setTeachers] = useState<TeacherProfile[]>([]);
  const [sessions, setSessions] = useState<TuitionSession[]>([]);
  const [stopwatchRecords, setStopwatchRecords] = useState<StopwatchSessionRecord[]>([]);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [calendarTokenReady, setCalendarTokenReady] = useState<boolean>(
    Boolean(getCalendarAccessToken())
  );
  const [calendarEvents, setCalendarEvents] = useState<GoogleCalendarEventSummary[]>([]);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [calendarNotice, setCalendarNotice] = useState<string | null>(null);
  const [activeReminder, setActiveReminder] = useState<ActiveTuitionReminder | null>(null);
  const [dismissedReminderIds, setDismissedReminderIds] = useState<Record<string, boolean>>({});
  const notifiedBrowserRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    initCalendarAuthListener();
  }, []);

  // Firestore real-time subscriptions for StudyTrack collections
  useEffect(() => {
    if (!uid || !isVerified) {
      setTeachers([]);
      setSessions([]);
      setStopwatchRecords([]);
      setSettings(DEFAULT_SETTINGS);
      clearCalendarAccessToken();
      setCalendarTokenReady(false);
      return;
    }

    const unsubTeachers = onSnapshot(
      query(collection(db, 'teachers'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const ts = (data.createdAt as { toMillis?: () => number })?.toMillis?.() || Date.now();
          return {
            id: d.id,
            ownerId: String(data.ownerId || uid),
            name: String(data.name || ''),
            subject: normalizeSubject(String(data.subject || 'Physics')),
            email: data.email ? String(data.email) : undefined,
            phone: data.phone ? String(data.phone) : undefined,
            locationOrLink: data.locationOrLink ? String(data.locationOrLink) : undefined,
            avatarColor: String(data.avatarColor || 'bg-indigo-600'),
            createdAt: ts,
          } satisfies TeacherProfile;
        });
        list.sort((a, b) => b.createdAt - a.createdAt);
        setTeachers(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'teachers')
    );

    const unsubSessions = onSnapshot(
      query(collection(db, 'tuitionSessions'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data() as Omit<TuitionSession, 'id'>;
          return {
            id: d.id,
            ...data,
            recurringDays: Array.isArray(data.recurringDays) ? data.recurringDays : [],
          } satisfies TuitionSession;
        });
        list.sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`));
        setSessions(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'tuitionSessions')
    );

    const unsubStopwatch = onSnapshot(
      query(collection(db, 'stopwatchRecords'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<StopwatchSessionRecord, 'id'>),
        }));
        list.sort((a, b) => {
          const ta = (a.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
          const tb = (b.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
          return tb - ta;
        });
        setStopwatchRecords(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'stopwatchRecords')
    );

    const unsubSettings = onSnapshot(
      doc(db, 'studyTrackSettings', uid),
      (snap) => {
        if (!snap.exists()) {
          setSettings({
            ...DEFAULT_SETTINGS,
            googleAccountEmail: userEmail || '',
          });
          return;
        }
        const d = snap.data() as {
          googleCalendarConnected?: boolean;
          googleAccountEmail?: string;
          enabled15MinReminder?: boolean;
          pushNotifications?: boolean;
          reminderOffsetMinutes?: number;
          soundAlert?: boolean;
          speechAlert?: boolean;
        };
        setSettings({
          googleCalendarConnected: Boolean(d.googleCalendarConnected),
          googleAccountEmail: d.googleAccountEmail || userEmail || '',
          notifications: {
            enabled15MinReminder: d.enabled15MinReminder ?? true,
            pushNotifications: d.pushNotifications ?? false,
            reminderOffsetMinutes: d.reminderOffsetMinutes ?? 15,
            soundAlert: d.soundAlert ?? true,
            speechAlert: d.speechAlert ?? true,
          },
        });
      },
      (err) => handleFirestoreError(err, OperationType.GET, `studyTrackSettings/${uid}`)
    );

    return () => {
      unsubTeachers();
      unsubSessions();
      unsubStopwatch();
      unsubSettings();
    };
  }, [uid, userEmail, isVerified]);

  // Unified Study Tasks derived from OBREN /plannerTasks
  const tasks: StudyTask[] = useMemo(() => {
    return plannerTasks
      .filter((pt) => pt.category === 'DAILY_TASK')
      .map((pt) => {
        const ts = (pt.createdAt as { toMillis?: () => number })?.toMillis?.() || Date.now();
        return {
          id: pt.id,
          title: pt.title,
          subject: normalizeSubject(pt.subject),
          chapter: pt.topic || undefined,
          priority: pt.priority,
          targetDurationMinutes: pt.durationMins || 60,
          scheduledDate: pt.scheduledDate || getKolkataDateKey(),
          completed: pt.completed,
          actualDurationMinutes: pt.actualDurationMins,
          createdAt: ts,
        } satisfies StudyTask;
      });
  }, [plannerTasks]);

  // 15-Minute Tuition Reminder Engine (Asia/Kolkata)
  useEffect(() => {
    if (!uid || !settings.notifications.enabled15MinReminder) {
      setActiveReminder(null);
      return;
    }

    const evaluateReminders = () => {
      const now = getKolkataTimeParts();
      const offset = Math.max(5, Math.min(60, settings.notifications.reminderOffsetMinutes || 15));

      const matching = sessions.find((s) => {
        if (!isSessionScheduledForDate(s, now.dateKey, now.dayOfWeek)) return false;

        const [h, m] = s.startTime.split(':').map(Number);
        if (Number.isNaN(h) || Number.isNaN(m)) return false;
        const sessionMins = h * 60 + m;
        const diff = sessionMins - now.totalMinutes;
        return diff >= 0 && diff <= offset;
      });

      if (!matching) {
        setActiveReminder(null);
        return;
      }

      const [h, m] = matching.startTime.split(':').map(Number);
      const minutesUntilStart = Math.max(0, h * 60 + m - now.totalMinutes);
      const reminderKey = `${now.dateKey}_${matching.id}`;

      if (!dismissedReminderIds[reminderKey]) {
        setActiveReminder({
          sessionId: matching.id,
          teacherName: matching.teacherName,
          subject: matching.subject,
          startTime: matching.startTime,
          locationOrLink: matching.locationOrLink || 'Online / Study Room',
          minutesUntilStart,
        });
      }

      if (!notifiedBrowserRef.current.has(reminderKey)) {
        notifiedBrowserRef.current.add(reminderKey);
        if (settings.notifications.soundAlert) {
          playReminderChime();
        }
        if (settings.notifications.speechAlert !== false) {
          announceTuitionReminderSpeech({
            subject: matching.subject,
            teacherName: matching.teacherName,
            startTime: matching.startTime,
            minutesUntilStart,
          });
        }
        if (
          settings.notifications.pushNotifications &&
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted'
        ) {
          try {
            new Notification(`${matching.subject} Tuition in ${minutesUntilStart} min`, {
              body: `Teacher: ${matching.teacherName} at ${matching.startTime} (${matching.locationOrLink || 'Scheduled Room'})`,
              icon: '/pwa-192x192.png',
              tag: reminderKey,
            });
          } catch {
            // Ignore restricted notification environments
          }
        }
      }
    };

    evaluateReminders();
    const interval = window.setInterval(evaluateReminders, 20000);
    return () => window.clearInterval(interval);
  }, [uid, sessions, settings.notifications, dismissedReminderIds]);

  const dismissActiveReminder = useCallback(() => {
    if (!activeReminder) return;
    const key = `${getKolkataDateKey()}_${activeReminder.sessionId}`;
    setDismissedReminderIds((prev) => ({ ...prev, [key]: true }));
    setActiveReminder(null);
  }, [activeReminder]);

  const updateSettings = useCallback(
    async (updates: Partial<UserSettings>) => {
      if (!uid) return;
      const merged: UserSettings = {
        googleCalendarConnected:
          updates.googleCalendarConnected ?? settings.googleCalendarConnected,
        googleAccountEmail:
          updates.googleAccountEmail !== undefined
            ? updates.googleAccountEmail
            : settings.googleAccountEmail,
        notifications: {
          ...settings.notifications,
          ...(updates.notifications || {}),
        },
      };
      try {
        await setDoc(doc(db, 'studyTrackSettings', uid), {
          uid,
          googleCalendarConnected: merged.googleCalendarConnected,
          googleAccountEmail: merged.googleAccountEmail || '',
          enabled15MinReminder: merged.notifications.enabled15MinReminder,
          pushNotifications: merged.notifications.pushNotifications,
          reminderOffsetMinutes: merged.notifications.reminderOffsetMinutes,
          soundAlert: merged.notifications.soundAlert,
          speechAlert: merged.notifications.speechAlert ?? true,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `studyTrackSettings/${uid}`);
      }
    },
    [uid, settings]
  );

  const connectCalendar = useCallback(async () => {
    setCalendarBusy(true);
    setCalendarNotice(null);
    try {
      const { email } = await connectGoogleCalendar();
      setCalendarTokenReady(true);
      await updateSettings({
        googleCalendarConnected: true,
        googleAccountEmail: email || userEmail || '',
      });
      setCalendarNotice(`Connected Google Calendar (${email || 'primary'}).`);
      try {
        const upcoming = await listUpcomingCalendarEvents(12);
        setCalendarEvents(upcoming);
      } catch {
        // non-fatal preview fetch
      }
    } catch (err) {
      setCalendarNotice(
        err instanceof Error ? err.message : 'Unable to connect Google Calendar.'
      );
      throw err;
    } finally {
      setCalendarBusy(false);
    }
  }, [updateSettings, userEmail]);

  const disconnectCalendar = useCallback(async () => {
    clearCalendarAccessToken();
    setCalendarTokenReady(false);
    setCalendarEvents([]);
    await updateSettings({
      googleCalendarConnected: false,
      googleAccountEmail: '',
    });
    setCalendarNotice('Google Calendar disconnected.');
  }, [updateSettings]);

  const refreshCalendarEvents = useCallback(async () => {
    setCalendarBusy(true);
    setCalendarNotice(null);
    try {
      const events = await listUpcomingCalendarEvents(15);
      setCalendarEvents(events);
      setCalendarTokenReady(true);
    } catch (err) {
      setCalendarTokenReady(Boolean(getCalendarAccessToken()));
      setCalendarNotice(err instanceof Error ? err.message : 'Unable to fetch events.');
    } finally {
      setCalendarBusy(false);
    }
  }, []);

  // Teacher CRUD
  const addTeacher = useCallback(
    async (teacher: Omit<TeacherProfile, 'id' | 'createdAt'>) => {
      if (!uid) return;
      try {
        const ref = doc(collection(db, 'teachers'));
        await setDoc(ref, {
          ownerId: uid,
          name: teacher.name.trim().slice(0, 75),
          subject: teacher.subject,
          email: (teacher.email || '').trim().slice(0, 150),
          phone: (teacher.phone || '').trim().slice(0, 30),
          locationOrLink: (teacher.locationOrLink || '').trim().slice(0, 280),
          avatarColor: teacher.avatarColor || 'bg-indigo-600',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'teachers');
      }
    },
    [uid]
  );

  const updateTeacher = useCallback(async (id: string, updates: Partial<TeacherProfile>) => {
    try {
      const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (updates.name !== undefined) clean.name = updates.name.trim().slice(0, 75);
      if (updates.subject !== undefined) clean.subject = updates.subject;
      if (updates.email !== undefined) clean.email = updates.email.trim().slice(0, 150);
      if (updates.phone !== undefined) clean.phone = updates.phone.trim().slice(0, 30);
      if (updates.locationOrLink !== undefined) {
        clean.locationOrLink = updates.locationOrLink.trim().slice(0, 280);
      }
      if (updates.avatarColor !== undefined) clean.avatarColor = updates.avatarColor;
      await updateDoc(doc(db, 'teachers', id), clean);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `teachers/${id}`);
    }
  }, []);

  const deleteTeacher = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'teachers', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `teachers/${id}`);
    }
  }, []);

  // Tuition Session CRUD + Google Calendar Sync
  const addSession = useCallback(
    async (
      session: Omit<TuitionSession, 'id' | 'status'>,
      options?: { syncToGoogleCalendar?: boolean }
    ) => {
      if (!uid) return;
      const sesRef = doc(collection(db, 'tuitionSessions'));
      let googleEventId = '';

      if (options?.syncToGoogleCalendar && getCalendarAccessToken()) {
        try {
          googleEventId = await createTuitionCalendarEvent(
            {
              ...session,
              id: sesRef.id,
              status: 'SCHEDULED',
            },
            settings.notifications.reminderOffsetMinutes || 15
          );
          setCalendarNotice(
            `Synced "${session.subject} with ${session.teacherName}" to Google Calendar.`
          );
        } catch (err) {
          setCalendarNotice(
            err instanceof Error
              ? `Saved session in StudyTrack, but Calendar sync failed: ${err.message}`
              : 'Saved session, but Google Calendar sync failed.'
          );
        }
      }

      try {
        await setDoc(sesRef, {
          ownerId: uid,
          teacherId: session.teacherId,
          teacherName: session.teacherName.trim().slice(0, 75),
          subject: session.subject,
          date: session.date,
          startTime: session.startTime,
          endTime: session.endTime,
          recurringDays: Array.isArray(session.recurringDays)
            ? session.recurringDays.slice(0, 7)
            : [],
          locationOrLink: (session.locationOrLink || '').trim().slice(0, 280),
          status: 'SCHEDULED',
          ...(googleEventId ? { googleEventId } : {}),
          ...(session.notes?.trim() ? { notes: session.notes.trim().slice(0, 480) } : {}),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'tuitionSessions');
      }
    },
    [uid, settings.notifications.reminderOffsetMinutes]
  );

  const updateSession = useCallback(
    async (
      id: string,
      updates: Partial<TuitionSession>,
      options?: { syncGoogleEvent?: boolean }
    ) => {
      const existing = sessions.find((s) => s.id === id);
      let nextGoogleEventId = updates.googleEventId ?? existing?.googleEventId;

      if (options?.syncGoogleEvent && existing && getCalendarAccessToken()) {
        const merged: TuitionSession = { ...existing, ...updates };
        try {
          if (merged.googleEventId) {
            await updateTuitionCalendarEvent(
              merged.googleEventId,
              merged,
              settings.notifications.reminderOffsetMinutes || 15
            );
          } else {
            nextGoogleEventId = await createTuitionCalendarEvent(
              merged,
              settings.notifications.reminderOffsetMinutes || 15
            );
          }
          setCalendarNotice(`Updated "${merged.subject}" on Google Calendar.`);
        } catch (err) {
          setCalendarNotice(
            err instanceof Error
              ? `Session saved, Calendar update failed: ${err.message}`
              : 'Session saved, Calendar update failed.'
          );
        }
      }

      try {
        const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
        if (updates.teacherId !== undefined) clean.teacherId = updates.teacherId;
        if (updates.teacherName !== undefined) clean.teacherName = updates.teacherName.slice(0, 75);
        if (updates.subject !== undefined) clean.subject = updates.subject;
        if (updates.date !== undefined) clean.date = updates.date;
        if (updates.startTime !== undefined) clean.startTime = updates.startTime;
        if (updates.endTime !== undefined) clean.endTime = updates.endTime;
        if (updates.recurringDays !== undefined) clean.recurringDays = updates.recurringDays.slice(0, 7);
        if (updates.locationOrLink !== undefined) clean.locationOrLink = updates.locationOrLink.slice(0, 280);
        if (updates.status !== undefined) clean.status = updates.status;
        if (updates.notes !== undefined) clean.notes = updates.notes.slice(0, 480);
        if (nextGoogleEventId) clean.googleEventId = nextGoogleEventId;
        await updateDoc(doc(db, 'tuitionSessions', id), clean);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `tuitionSessions/${id}`);
      }
    },
    [sessions, settings.notifications.reminderOffsetMinutes]
  );

  const deleteSession = useCallback(
    async (id: string, options?: { deleteGoogleEvent?: boolean }) => {
      const existing = sessions.find((s) => s.id === id);
      if (options?.deleteGoogleEvent && existing?.googleEventId && getCalendarAccessToken()) {
        try {
          await deleteTuitionCalendarEvent(existing.googleEventId);
          setCalendarNotice('Deleted session from StudyTrack and Google Calendar.');
        } catch (err) {
          setCalendarNotice(
            err instanceof Error
              ? `Deleted locally, but Calendar delete failed: ${err.message}`
              : 'Deleted locally, Calendar delete failed.'
          );
        }
      }
      try {
        await deleteDoc(doc(db, 'tuitionSessions', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `tuitionSessions/${id}`);
      }
    },
    [sessions]
  );

  const syncAllScheduledToCalendar = useCallback(async (): Promise<number> => {
    if (!getCalendarAccessToken()) {
      throw new Error('Connect Google Calendar first to sync sessions.');
    }
    setCalendarBusy(true);
    let syncedCount = 0;
    try {
      const pending = sessions.filter((s) => s.status === 'SCHEDULED' && !s.googleEventId);
      for (const s of pending) {
        const eventId = await createTuitionCalendarEvent(
          s,
          settings.notifications.reminderOffsetMinutes || 15
        );
        await updateDoc(doc(db, 'tuitionSessions', s.id), {
          googleEventId: eventId,
          updatedAt: serverTimestamp(),
        });
        syncedCount += 1;
      }
      const upcoming = await listUpcomingCalendarEvents(15);
      setCalendarEvents(upcoming);
      setCalendarNotice(
        syncedCount > 0
          ? `Synced ${syncedCount} scheduled tuition session(s) to Google Calendar.`
          : 'All scheduled tuition sessions are already synced to Google Calendar.'
      );
      return syncedCount;
    } finally {
      setCalendarBusy(false);
    }
  }, [sessions, settings.notifications.reminderOffsetMinutes]);

  // Attendance Timer: Teacher Came / Teacher Gone (guards against overlapping IN_PROGRESS sessions)
  const startTeacherCame = useCallback(
    async (sessionId: string): Promise<{ ok: boolean; error?: string }> => {
      const alreadyActive = sessions.find(
        (s) => s.status === 'IN_PROGRESS' && s.id !== sessionId
      );
      if (alreadyActive) {
        return {
          ok: false,
          error: `Finish "${alreadyActive.subject} with ${alreadyActive.teacherName}" before starting another tuition timer.`,
        };
      }
      const now = new Date();
      const timeParts = getKolkataTimeParts(now);
      try {
        await updateDoc(doc(db, 'tuitionSessions', sessionId), {
          status: 'IN_PROGRESS',
          teacherCameAt: timeParts.formatted12h.slice(0, 20),
          teacherCameTimestamp: now.getTime(),
          updatedAt: serverTimestamp(),
        });
        return { ok: true };
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `tuitionSessions/${sessionId}`);
      }
    },
    [sessions]
  );

  const startTeacherGone = useCallback(
    async (sessionId: string) => {
      if (!uid) return;
      const ses = sessions.find((s) => s.id === sessionId);
      if (!ses) return;

      const now = new Date();
      const timeParts = getKolkataTimeParts(now);
      const todayKey = getKolkataDateKey(now);
      const timestamp = now.getTime();
      const cameTs = ses.teacherCameTimestamp || timestamp - 3600000;
      const diffMs = Math.max(60000, timestamp - cameTs);
      const durationMinutes = Math.max(1, Math.min(1440, Math.round(diffMs / 60000)));
      const durationSeconds = Math.max(60, Math.min(86400, Math.round(diffMs / 1000)));
      const isRecurring = Array.isArray(ses.recurringDays) && ses.recurringDays.length > 0;

      try {
        await updateDoc(doc(db, 'tuitionSessions', sessionId), {
          status: 'COMPLETED',
          date: todayKey,
          teacherGoneAt: timeParts.formatted12h.slice(0, 20),
          teacherGoneTimestamp: timestamp,
          actualDurationMinutes: durationMinutes,
          ...(isRecurring ? { recurringDays: [], googleEventId: deleteField() } : {}),
          updatedAt: serverTimestamp(),
        });

        // Automatically schedule the next weekly occurrence at the exact same day & time
        if (isRecurring) {
          const nextDate = getNextRecurringDateKey(todayKey, ses.recurringDays, false);
          const nextRef = doc(collection(db, 'tuitionSessions'));
          await setDoc(nextRef, {
            ownerId: uid,
            teacherId: ses.teacherId,
            teacherName: ses.teacherName.trim().slice(0, 75),
            subject: ses.subject,
            date: nextDate,
            startTime: ses.startTime,
            endTime: ses.endTime,
            recurringDays: ses.recurringDays.slice(0, 7),
            locationOrLink: (ses.locationOrLink || '').trim().slice(0, 280),
            status: 'SCHEDULED',
            ...(ses.googleEventId ? { googleEventId: ses.googleEventId } : {}),
            ...(ses.notes?.trim() ? { notes: ses.notes.trim().slice(0, 480) } : {}),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        const swRef = doc(collection(db, 'stopwatchRecords'));
        await setDoc(swRef, {
          ownerId: uid,
          subject: ses.subject,
          taskTitle: `Tuition with ${ses.teacherName}`.slice(0, 175),
          startTime: (ses.teacherCameAt || timeParts.formatted12h).slice(0, 20),
          durationSeconds,
          type: 'TUITION',
          date: todayKey,
          createdAt: serverTimestamp(),
        });

        await updateDoc(doc(db, 'users', uid), {
          totalStudyMinutes: increment(durationMinutes),
          xp: increment(Math.min(200, Math.max(10, Math.round(durationMinutes / 2)))),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `tuitionSessions/${sessionId}`);
      }
    },
    [uid, sessions]
  );

  // Unified Study Tasks CRUD -> writes to /plannerTasks/{taskId}
  const addTask = useCallback(
    async (task: Omit<StudyTask, 'id' | 'createdAt' | 'completed'>) => {
      if (!uid) return;
      try {
        const ref = doc(collection(db, 'plannerTasks'));
        await setDoc(ref, {
          ownerId: uid,
          title: task.title.trim().slice(0, 175),
          category: 'DAILY_TASK',
          subject: task.subject,
          ...(task.chapter?.trim() ? { topic: task.chapter.trim().slice(0, 115) } : {}),
          scheduledDate: task.scheduledDate || getKolkataDateKey(),
          durationMins: Math.max(5, Math.min(720, Math.round(task.targetDurationMinutes || 60))),
          priority: task.priority,
          completed: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'plannerTasks');
      }
    },
    [uid]
  );

  const updateTask = useCallback(async (id: string, updates: Partial<StudyTask>) => {
    try {
      const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (updates.title !== undefined) clean.title = updates.title.trim().slice(0, 175);
      if (updates.subject !== undefined) clean.subject = updates.subject;
      if (updates.chapter !== undefined) clean.topic = updates.chapter.trim().slice(0, 115);
      if (updates.scheduledDate !== undefined) clean.scheduledDate = updates.scheduledDate;
      if (updates.targetDurationMinutes !== undefined) {
        clean.durationMins = Math.max(5, Math.min(720, Math.round(updates.targetDurationMinutes)));
      }
      if (updates.actualDurationMinutes !== undefined) {
        clean.actualDurationMins = Math.max(0, Math.min(1440, Math.round(updates.actualDurationMinutes)));
      }
      if (updates.priority !== undefined) clean.priority = updates.priority;
      if (updates.completed !== undefined) clean.completed = updates.completed;
      await updateDoc(doc(db, 'plannerTasks', id), clean);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `plannerTasks/${id}`);
    }
  }, []);

  const deleteTask = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'plannerTasks', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `plannerTasks/${id}`);
    }
  }, []);

  // Stopwatch Session Record CRUD + linked task & user totalStudyMinutes update
  const addStopwatchRecord = useCallback(
    async (
      record: Omit<StopwatchSessionRecord, 'id'>,
      options?: { markTaskComplete?: boolean }
    ) => {
      if (!uid) return;
      const safeSecs = Math.max(1, Math.min(86400, Math.round(record.durationSeconds)));
      const durationMins = Math.max(1, Math.round(safeSecs / 60));
      try {
        const swRef = doc(collection(db, 'stopwatchRecords'));
        await setDoc(swRef, {
          ownerId: uid,
          subject: record.subject,
          ...(record.taskId ? { taskId: record.taskId } : {}),
          ...(record.taskTitle ? { taskTitle: record.taskTitle.slice(0, 175) } : {}),
          startTime: record.startTime.slice(0, 20),
          durationSeconds: safeSecs,
          type: record.type,
          date: record.date || getKolkataDateKey(),
          createdAt: serverTimestamp(),
        });

        if (record.taskId) {
          const existingTask = tasks.find((t) => t.id === record.taskId);
          const prevActual = existingTask?.actualDurationMinutes || 0;
          await updateDoc(doc(db, 'plannerTasks', record.taskId), {
            actualDurationMins: Math.min(1440, prevActual + durationMins),
            ...(options?.markTaskComplete ? { completed: true } : {}),
            updatedAt: serverTimestamp(),
          });
        }

        const xpEarned = Math.min(200, Math.max(5, durationMins * 2));
        await updateDoc(doc(db, 'users', uid), {
          totalStudyMinutes: increment(durationMins),
          xp: increment(xpEarned),
          updatedAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'publicProfiles', uid), {
          xp: increment(xpEarned),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'stopwatchRecords');
      }
    },
    [uid, tasks]
  );

  const activeTuitionSession = useMemo(
    () => sessions.find((s) => s.status === 'IN_PROGRESS') || null,
    [sessions]
  );

  return {
    teachers,
    sessions,
    tasks,
    stopwatchRecords,
    settings,
    calendarTokenReady,
    calendarEvents,
    calendarBusy,
    calendarNotice,
    setCalendarNotice,
    activeReminder,
    activeTuitionSession,
    dismissActiveReminder,
    connectCalendar,
    disconnectCalendar,
    refreshCalendarEvents,
    syncAllScheduledToCalendar,
    addTeacher,
    updateTeacher,
    deleteTeacher,
    addSession,
    updateSession,
    deleteSession,
    startTeacherCame,
    startTeacherGone,
    addTask,
    updateTask,
    deleteTask,
    addStopwatchRecord,
    updateSettings,
  };
}
