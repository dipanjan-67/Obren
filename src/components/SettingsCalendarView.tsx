import React, { useState } from 'react';
import {
  Bell,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RefreshCw,
  Volume2,
} from 'lucide-react';
import { announceTuitionReminderSpeech } from '../lib/studytrackStore';
import type { GoogleCalendarEventSummary } from '../lib/googleCalendar';
import type { TuitionSession, UserSettings } from '../types/studytrack';

interface SettingsCalendarViewProps {
  settings: UserSettings;
  sessions: TuitionSession[];
  calendarTokenReady: boolean;
  calendarEvents: GoogleCalendarEventSummary[];
  calendarBusy: boolean;
  calendarNotice: string | null;
  onConnectCalendar: () => Promise<void>;
  onDisconnectCalendar: () => Promise<void>;
  onRefreshCalendarEvents: () => Promise<void>;
  onSyncAllScheduled: () => Promise<number>;
  onUpdateSettings: (updates: Partial<UserSettings>) => Promise<void>;
  onOpenVirtualCalendar?: () => void;
}

export const SettingsCalendarView: React.FC<SettingsCalendarViewProps> = ({
  settings,
  sessions,
  calendarTokenReady,
  calendarEvents,
  calendarBusy,
  calendarNotice,
  onConnectCalendar,
  onDisconnectCalendar,
  onRefreshCalendarEvents,
  onSyncAllScheduled,
  onUpdateSettings,
  onOpenVirtualCalendar,
}) => {
  const [confirmSyncAllOpen, setConfirmSyncAllOpen] = useState(false);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const unsyncedScheduledCount = sessions.filter(
    (s) => s.status === 'SCHEDULED' && !s.googleEventId
  ).length;

  const handleConnectClick = async () => {
    setAuthError(null);
    try {
      await onConnectCalendar();
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Unable to authorize Google Calendar.'
      );
    }
  };

  const handleToggle15Min = async () => {
    await onUpdateSettings({
      notifications: {
        ...settings.notifications,
        enabled15MinReminder: !settings.notifications.enabled15MinReminder,
      },
    });
  };

  const handleTogglePush = async () => {
    const nextVal = !settings.notifications.pushNotifications;
    if (nextVal && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      await Notification.requestPermission();
    }
    await onUpdateSettings({
      notifications: {
        ...settings.notifications,
        pushNotifications: nextVal,
      },
    });
  };

  const handleToggleSound = async () => {
    await onUpdateSettings({
      notifications: {
        ...settings.notifications,
        soundAlert: !settings.notifications.soundAlert,
      },
    });
  };

  const handleToggleSpeech = async () => {
    await onUpdateSettings({
      notifications: {
        ...settings.notifications,
        speechAlert: !(settings.notifications.speechAlert ?? true),
      },
    });
  };

  const handleTestSpeech = () => {
    announceTuitionReminderSpeech({
      subject: 'Physics',
      teacherName: 'Prof. Mukherjee',
      startTime: '05:00 PM',
      minutesUntilStart: 15,
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-extrabold font-display text-slate-900 dark:text-white tracking-tight">
          Google Calendar & Reminder Settings
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Sync tuition schedules to Google Calendar (Asia/Kolkata) and configure 15-minute reminders.
        </p>
      </div>

      {(calendarNotice || authError) && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold ${
            authError
              ? 'border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
              : 'border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300'
          }`}
        >
          {authError || calendarNotice}
        </div>
      )}

      {/* Built-in Virtual Calendar (No Google Sign-in Needed) */}
      {onOpenVirtualCalendar && (
        <div className="bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white font-display">
                Built-in Virtual Calendar
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                Didn&apos;t sign in to Google Calendar? View your monthly &amp; weekly schedule, repeating tuitions, tasks, and export .ICS directly in-app.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenVirtualCalendar}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer shrink-0"
          >
            Open Virtual Calendar
          </button>
        </div>
      )}

      {/* Google Calendar Integration */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white font-display">
              Google Calendar Sync (OAuth 2.0)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              In-memory session token only. Explicit confirmation is required before adding, updating, or deleting events.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  calendarTokenReady
                    ? 'bg-emerald-500'
                    : settings.googleCalendarConnected
                      ? 'bg-amber-500'
                      : 'bg-slate-400'
                }`}
              />
              <span className="font-bold text-xs text-slate-900 dark:text-white">
                {calendarTokenReady
                  ? 'Live Google Calendar Session Active'
                  : settings.googleCalendarConnected
                    ? 'Calendar Linked (Reconnect Session to Sync)'
                    : 'Not Connected'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              {settings.googleAccountEmail || 'Authorize Google Calendar to sync tuition sessions'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!calendarTokenReady ? (
              <button
                type="button"
                disabled={calendarBusy}
                onClick={() => void handleConnectClick()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-semibold cursor-pointer whitespace-nowrap shadow-xs"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>{calendarBusy ? 'Connecting...' : 'Sign in with Google Calendar'}</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={calendarBusy}
                  onClick={() => void onRefreshCalendarEvents()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${calendarBusy ? 'animate-spin' : ''}`} />
                  <span>Refresh Events</span>
                </button>
                <button
                  type="button"
                  disabled={calendarBusy || unsyncedScheduledCount === 0}
                  onClick={() => setConfirmSyncAllOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                >
                  Sync {unsyncedScheduledCount} Pending
                </button>
                <button
                  type="button"
                  onClick={() => void onDisconnectCalendar()}
                  className="px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-xs font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                >
                  Disconnect
                </button>
              </>
            )}
          </div>
        </div>

        {/* Upcoming Google Calendar Events Preview */}
        {calendarTokenReady && (
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
              <span>Upcoming Google Calendar Events ({calendarEvents.length})</span>
            </div>
            {calendarEvents.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No upcoming events loaded yet. Click Refresh Events above to inspect your calendar.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                {calendarEvents.slice(0, 6).map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3 flex items-center justify-between gap-3 bg-white dark:bg-slate-900 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                        {ev.studytrackSessionId && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        )}
                        <span className="truncate">{ev.summary}</span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                        {ev.start ? new Date(ev.start).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Scheduled'}
                      </div>
                    </div>
                    {ev.htmlLink && (
                      <a
                        href={ev.htmlLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 shrink-0"
                      >
                        <span>Open</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Collapsible Setup Info */}
        <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
          <button
            type="button"
            onClick={() => setShowSetupGuide((prev) => !prev)}
            className="flex items-center justify-between w-full text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer"
          >
            <span>How Google Calendar sync & duplicate prevention work</span>
            {showSetupGuide ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showSetupGuide && (
            <div className="mt-2.5 text-xs text-slate-500 dark:text-slate-400 space-y-1.5 leading-relaxed">
              <p>
                1. Clicking &quot;Sign in with Google Calendar&quot; requests the{' '}
                <code className="font-mono">calendar.events</code> scope using a popup and keeps your access token in memory only for your security.
              </p>
              <p>
                2. Each synced tuition session stores a private <code className="font-mono">studytrackSessionId</code> tag in Google Calendar so re-syncing never creates duplicate events.
              </p>
              <p>
                3. Every Calendar event is scheduled in <code className="font-mono">Asia/Kolkata</code> with a 15-minute popup reminder.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 15-Minute Tuition Reminders Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white font-display">
              15-Minute Tuition Reminders & Push Alerts
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Alerts you before scheduled tuition classes begin (evaluated in Asia/Kolkata time).
            </p>
          </div>
        </div>

        <div className="space-y-3 pt-1">
          <label className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 cursor-pointer">
            <div className="space-y-0.5 pr-4">
              <span className="font-bold text-xs text-slate-900 dark:text-white">
                In-App 15-Minute Tuition Alert Banner
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Displays a live reminder banner on the website 15 minutes before each tuition session.
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.notifications.enabled15MinReminder}
              onChange={() => void handleToggle15Min()}
              className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 cursor-pointer">
            <div className="space-y-0.5 pr-4">
              <span className="font-bold text-xs text-slate-900 dark:text-white">
                Browser / PWA Desktop & Mobile Push Notification
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Fires an OS-level notification when your browser grants permission.
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.notifications.pushNotifications}
              onChange={() => void handleTogglePush()}
              className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 cursor-pointer">
            <div className="space-y-0.5 pr-4">
              <span className="font-bold text-xs text-slate-900 dark:text-white">
                Gentle Chime Alert
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Plays a soft chime once when the 15-minute reminder triggers.
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.notifications.soundAlert}
              onChange={() => void handleToggleSound()}
              className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
            />
          </label>

          <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
            <div className="space-y-0.5 pr-4">
              <span className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-amber-500" />
                <span>Voice Announcement (Text-to-Speech)</span>
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Speaks out: &quot;Tuition reminder: Your [Subject] session with [Teacher] starts in 15 minutes.&quot;
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleTestSpeech}
                className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Test Voice
              </button>
              <input
                type="checkbox"
                checked={settings.notifications.speechAlert ?? true}
                onChange={() => void handleToggleSpeech()}
                className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal before batch syncing to Google Calendar */}
      {confirmSyncAllOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-bold font-display text-slate-900 dark:text-white">
              Confirm Google Calendar Batch Sync
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              This will create {unsyncedScheduledCount} event(s) in your primary Google Calendar ({settings.googleAccountEmail || 'Google Account'}) with 15-minute popup reminders in Asia/Kolkata time.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmSyncAllOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={calendarBusy}
                onClick={async () => {
                  try {
                    await onSyncAllScheduled();
                    setConfirmSyncAllOpen(false);
                  } catch {
                    setConfirmSyncAllOpen(false);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
              >
                {calendarBusy ? 'Syncing...' : 'Confirm & Sync'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
