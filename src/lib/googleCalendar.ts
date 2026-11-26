import {
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
} from 'firebase/auth';
import { auth } from './firebase';
import type { TuitionSession } from '../types/studytrack';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const CALENDAR_TIMEZONE = 'Asia/Kolkata';

const calendarProvider = new GoogleAuthProvider();
calendarProvider.addScope('https://www.googleapis.com/auth/calendar.events');
calendarProvider.setCustomParameters({ prompt: 'consent select_account' });

// Strictly in-memory OAuth access token cache (never persisted to localStorage/sessionStorage)
let cachedCalendarToken: string | null = null;
let cachedCalendarEmail: string | null = null;
let authListenerInitialized = false;

export interface GoogleCalendarEventSummary {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  htmlLink?: string;
  studytrackSessionId?: string;
}

export function initCalendarAuthListener(): void {
  if (authListenerInitialized) return;
  authListenerInitialized = true;
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      cachedCalendarToken = null;
      cachedCalendarEmail = null;
    }
  });
}

export function getCalendarAccessToken(): string | null {
  return cachedCalendarToken;
}

export function getCalendarAccountEmail(): string | null {
  return cachedCalendarEmail;
}

export function clearCalendarAccessToken(): void {
  cachedCalendarToken = null;
  cachedCalendarEmail = null;
}

export async function connectGoogleCalendar(): Promise<{
  accessToken: string;
  email: string;
}> {
  initCalendarAuthListener();
  const result = auth.currentUser
    ? await reauthenticateWithPopup(auth.currentUser, calendarProvider)
    : await signInWithPopup(auth, calendarProvider);

  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken;
  if (!accessToken) {
    throw new Error(
      'Google did not return a Calendar access token. Please allow Calendar access in the Google popup.'
    );
  }
  const email = result.user.email || auth.currentUser?.email || '';
  cachedCalendarToken = accessToken;
  cachedCalendarEmail = email;
  return { accessToken, email };
}

function buildIsoOffsetDateTime(dateStr: string, timeStr: string): string {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? dateStr
    : new Date().toLocaleDateString('en-CA', { timeZone: CALENDAR_TIMEZONE });
  const safeTime = /^\d{2}:\d{2}$/.test(timeStr) ? timeStr : '17:00';
  return `${safeDate}T${safeTime}:00+05:30`;
}

function toGoogleRRuleDays(days: number[]): string[] {
  const codeMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  return days
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .map((d) => codeMap[d]);
}

function buildGoogleEventPayload(
  session: TuitionSession,
  reminderMinutes = 15,
  isUpdate = false
) {
  const startDateTime = buildIsoOffsetDateTime(session.date, session.startTime);
  let endTime = session.endTime;
  if (session.endTime <= session.startTime) {
    const [sh, sm] = session.startTime.split(':').map(Number);
    const totalEndMins = Math.min(23 * 60 + 55, sh * 60 + sm + 60);
    endTime = `${String(Math.floor(totalEndMins / 60)).padStart(2, '0')}:${String(
      totalEndMins % 60
    ).padStart(2, '0')}`;
  }
  const endDateTime = buildIsoOffsetDateTime(session.date, endTime);

  const rruleDays = toGoogleRRuleDays(session.recurringDays || []);

  const body: Record<string, unknown> = {
    summary: `${session.subject} Tuition · ${session.teacherName}`,
    location: session.locationOrLink || 'Online / Study Room',
    description: [
      `Teacher: ${session.teacherName}`,
      `Subject: ${session.subject}`,
      session.notes ? `Topics: ${session.notes}` : '',
      'Synced from OBREN & StudyTrack',
    ]
      .filter(Boolean)
      .join('\n'),
    start: {
      dateTime: startDateTime,
      timeZone: CALENDAR_TIMEZONE,
    },
    end: {
      dateTime: endDateTime,
      timeZone: CALENDAR_TIMEZONE,
    },
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: Math.max(5, Math.min(60, reminderMinutes)) }],
    },
    extendedProperties: {
      private: {
        studytrackSessionId: session.id,
      },
    },
  };

  if (rruleDays.length > 0) {
    body.recurrence = [`RRULE:FREQ=WEEKLY;BYDAY=${rruleDays.join(',')}`];
  } else if (isUpdate) {
    body.recurrence = [];
  }

  return body;
}

async function calendarFetch<T>(
  url: string,
  options: RequestInit,
  token: string
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    cachedCalendarToken = null;
    throw new Error('Google Calendar session expired. Please reconnect Google Calendar.');
  }

  if (!res.ok) {
    let message = `Google Calendar API error (${res.status})`;
    try {
      const payload = (await res.json()) as { error?: { message?: string } };
      if (payload?.error?.message) message = payload.error.message;
    } catch {
      // ignore json parse error
    }
    throw new Error(message);
  }

  if (res.status === 204) {
    return {} as T;
  }

  return (await res.json()) as T;
}

export async function listUpcomingCalendarEvents(
  maxResults = 15
): Promise<GoogleCalendarEventSummary[]> {
  const token = getCalendarAccessToken();
  if (!token) {
    throw new Error('Google Calendar is not connected in this browser session yet.');
  }

  const timeMin = new Date().toISOString();
  const params = new URLSearchParams({
    timeMin,
    maxResults: String(maxResults),
    singleEvents: 'true',
    orderBy: 'startTime',
  });

  const data = await calendarFetch<{
    items?: Array<{
      id: string;
      summary?: string;
      location?: string;
      htmlLink?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      extendedProperties?: { private?: { studytrackSessionId?: string } };
    }>;
  }>(`${CALENDAR_API_BASE}?${params.toString()}`, { method: 'GET' }, token);

  return (data.items || []).map((item) => ({
    id: item.id,
    summary: item.summary || '(Untitled Event)',
    start: item.start?.dateTime || item.start?.date || '',
    end: item.end?.dateTime || item.end?.date || '',
    location: item.location,
    htmlLink: item.htmlLink,
    studytrackSessionId: item.extendedProperties?.private?.studytrackSessionId,
  }));
}

export async function createTuitionCalendarEvent(
  session: TuitionSession,
  reminderMinutes = 15
): Promise<string> {
  const token = getCalendarAccessToken();
  if (!token) {
    throw new Error('Google Calendar token unavailable. Connect Google Calendar first.');
  }

  // Duplicate check via private extendedProperty
  const dupParams = new URLSearchParams({
    privateExtendedProperty: `studytrackSessionId=${session.id}`,
    maxResults: '1',
  });
  const existing = await calendarFetch<{ items?: Array<{ id: string }> }>(
    `${CALENDAR_API_BASE}?${dupParams.toString()}`,
    { method: 'GET' },
    token
  );
  if (existing.items && existing.items.length > 0) {
    return existing.items[0].id;
  }

  const created = await calendarFetch<{ id: string }>(
    CALENDAR_API_BASE,
    {
      method: 'POST',
      body: JSON.stringify(buildGoogleEventPayload(session, reminderMinutes)),
    },
    token
  );
  return created.id;
}

export async function updateTuitionCalendarEvent(
  googleEventId: string,
  session: TuitionSession,
  reminderMinutes = 15
): Promise<void> {
  const token = getCalendarAccessToken();
  if (!token) {
    throw new Error('Google Calendar token unavailable. Connect Google Calendar first.');
  }

  await calendarFetch(
    `${CALENDAR_API_BASE}/${encodeURIComponent(googleEventId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(buildGoogleEventPayload(session, reminderMinutes, true)),
    },
    token
  );
}

export async function deleteTuitionCalendarEvent(googleEventId: string): Promise<void> {
  const token = getCalendarAccessToken();
  if (!token) {
    throw new Error('Google Calendar token unavailable. Connect Google Calendar first.');
  }

  const res = await fetch(`${CALENDAR_API_BASE}/${encodeURIComponent(googleEventId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 401) {
    cachedCalendarToken = null;
    throw new Error('Google Calendar session expired. Please reconnect Google Calendar.');
  }

  // 404 or 410 means already deleted in Google Calendar — safe to proceed
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Failed to delete Google Calendar event (${res.status}).`);
  }
}
