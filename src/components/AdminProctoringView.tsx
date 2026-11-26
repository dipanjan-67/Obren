import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  Maximize2,
  Save,
  Search,
  Shield,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  DEFAULT_PROCTORING_SETTINGS,
  EXAM_LABELS,
  type ExamProctoringSession,
  type ProctoringSettings,
} from '../types/obren';

interface AdminProctoringViewProps {
  adminUid: string;
  proctoringSettings: ProctoringSettings;
}

export const AdminProctoringView: React.FC<AdminProctoringViewProps> = ({
  adminUid,
  proctoringSettings,
}) => {
  const [draft, setDraft] = useState<ProctoringSettings>(proctoringSettings);
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [sessions, setSessions] = useState<ExamProctoringSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | ExamProctoringSession['status']>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  useEffect(() => {
    setDraft(proctoringSettings);
  }, [proctoringSettings]);

  useEffect(() => {
    setLoadingSessions(true);
    const q = query(
      collection(db, 'examProctoringSessions'),
      orderBy('updatedAt', 'desc'),
      limit(100)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ExamProctoringSession, 'id'>),
        }));
        setSessions(list);
        setLoadingSessions(false);
      },
      (err) => {
        setLoadingSessions(false);
        handleFirestoreError(err, OperationType.LIST, 'examProctoringSessions');
      }
    );
    return () => unsub();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveNotice(null);
    setSaveError(null);
    try {
      const payload = {
        proctoringEnabled: Boolean(draft.proctoringEnabled),
        lookingAwayEnabled: Boolean(draft.lookingAwayEnabled),
        faceMissingEnabled: Boolean(draft.faceMissingEnabled),
        lookingAwayThresholdSeconds: Math.max(
          10,
          Math.min(300, Math.round(draft.lookingAwayThresholdSeconds || 60))
        ),
        faceMissingThresholdSeconds: Math.max(
          10,
          Math.min(300, Math.round(draft.faceMissingThresholdSeconds || 30))
        ),
        maxLookingAwayWarnings: Math.max(
          1,
          Math.min(15, Math.round(draft.maxLookingAwayWarnings || 3))
        ),
        maxFaceMissingWarnings: Math.max(
          1,
          Math.min(15, Math.round(draft.maxFaceMissingWarnings || 5))
        ),
        fullscreenMonitoringEnabled: Boolean(draft.fullscreenMonitoringEnabled),
        autoSubmitOnLimit: Boolean(draft.autoSubmitOnLimit),
        dailyQuestionGoal: Math.max(5, Math.min(200, Math.round(draft.dailyQuestionGoal || 30))),
        updatedBy: adminUid,
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'proctoringSettings', 'global'), payload);
      setSaveNotice('Global proctoring & daily goal settings saved and synced live.');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update proctoring settings.');
    } finally {
      setSaving(false);
    }
  };

  const filteredSessions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return sessions.filter((s) => {
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.studentName.toLowerCase().includes(q) ||
        s.examTitle.toLowerCase().includes(q) ||
        s.exam.toLowerCase().includes(q)
      );
    });
  }, [sessions, statusFilter, searchTerm]);

  const summaryStats = useMemo(() => {
    let activeCount = 0;
    let autoSubmittedCount = 0;
    let totalWarnings = 0;
    sessions.forEach((s) => {
      if (s.status === 'IN_PROGRESS') activeCount += 1;
      if (s.status === 'AUTO_SUBMITTED') autoSubmittedCount += 1;
      totalWarnings += (s.lookingAwayWarnings || 0) + (s.faceMissingWarnings || 0);
    });
    return { total: sessions.length, activeCount, autoSubmittedCount, totalWarnings };
  }, [sessions]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
            <Shield className="w-3.5 h-3.5" />
            <span>Admin RBAC Protected Console</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight mt-0.5">
            Proctoring Controls &amp; Live Monitor
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Configure camera detection thresholds, full-screen rules, auto-submission limits, daily question targets, and inspect student exam logs.
          </p>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Monitored Sessions</div>
          <div className="text-2xl font-bold font-mono tabular-nums mt-1">{summaryStats.total}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Live In Progress</div>
          <div className="text-2xl font-bold font-mono tabular-nums mt-1 text-emerald-600 dark:text-emerald-400">
            {summaryStats.activeCount}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Auto-Submitted</div>
          <div className="text-2xl font-bold font-mono tabular-nums mt-1 text-rose-600 dark:text-rose-400">
            {summaryStats.autoSubmittedCount}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Total Warnings Issued</div>
          <div className="text-2xl font-bold font-mono tabular-nums mt-1 text-amber-600 dark:text-amber-400">
            {summaryStats.totalWarnings}
          </div>
        </div>
      </div>

      {/* Admin Settings Panel */}
      <form
        onSubmit={(e) => void handleSaveSettings(e)}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-bold font-display">
              Global Proctoring &amp; Daily Goal Configuration
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Changes apply immediately to all new exam sessions across OBREN.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDraft(DEFAULT_PROCTORING_SETTINGS)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Load Defaults
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </div>

        {(saveNotice || saveError) && (
          <div
            className={`p-3 rounded-xl border text-xs font-semibold ${
              saveError
                ? 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
                : 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {saveError || saveNotice}
          </div>
        )}

        {/* Feature Toggles */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {([
            [
              'proctoringEnabled',
              'AI Camera Proctoring',
              'Require webcam monitoring and local face landmark tracking.',
              Camera,
            ],
            [
              'lookingAwayEnabled',
              'Looking-Away Detection',
              'Warn students when facing/looking away continuously.',
              Eye,
            ],
            [
              'faceMissingEnabled',
              'Face-Not-Detected Monitoring',
              'Start timer when no face is visible in camera.',
              UserCheck,
            ],
            [
              'fullscreenMonitoringEnabled',
              'Full-Screen Examination Mode',
              'Request browser fullscreen and log exits.',
              Maximize2,
            ],
            [
              'autoSubmitOnLimit',
              'Auto-Submit on Warning Limit',
              'Automatically save and submit when limits are reached.',
              ShieldAlert,
            ],
          ] as const).map(([key, title, desc, Icon]) => {
            const checked = Boolean(draft[key]);
            return (
              <label
                key={key}
                className="flex items-start justify-between gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 cursor-pointer"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-bold">{title}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {desc}
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, [key]: e.target.checked }))
                  }
                  className="mt-1 w-4 h-4 rounded accent-indigo-600 cursor-pointer shrink-0"
                />
              </label>
            );
          })}
        </div>

        {/* Numeric Thresholds */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-1">
          <div>
            <label className="block text-xs font-semibold mb-1">Looking-Away Duration (s)</label>
            <input
              type="number"
              min={10}
              max={300}
              value={draft.lookingAwayThresholdSeconds}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  lookingAwayThresholdSeconds: Number(e.target.value),
                }))
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Max Looking-Away Warnings</label>
            <input
              type="number"
              min={1}
              max={15}
              value={draft.maxLookingAwayWarnings}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  maxLookingAwayWarnings: Number(e.target.value),
                }))
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Face-Missing Duration (s)</label>
            <input
              type="number"
              min={10}
              max={300}
              value={draft.faceMissingThresholdSeconds}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  faceMissingThresholdSeconds: Number(e.target.value),
                }))
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Max Face-Missing Warnings</label>
            <input
              type="number"
              min={1}
              max={15}
              value={draft.maxFaceMissingWarnings}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  maxFaceMissingWarnings: Number(e.target.value),
                }))
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Daily Goal Target (Qs)</label>
            <input
              type="number"
              min={5}
              max={200}
              value={draft.dailyQuestionGoal}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  dailyQuestionGoal: Number(e.target.value),
                }))
              }
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
            />
          </div>
        </div>
      </form>

      {/* Live & Historical Sessions Viewer */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold font-display">Student Proctoring Sessions &amp; Logs</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Inspect camera status, independent warning tallies, auto-submission reasons, and event timestamps.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search student or exam..."
                className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'ALL' | ExamProctoringSession['status'])
              }
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
            >
              <option value="ALL">All Statuses</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="AUTO_SUBMITTED">Auto-Submitted</option>
              <option value="SUBMITTED">Submitted</option>
            </select>
          </div>
        </div>

        {loadingSessions ? (
          <div className="py-10 text-center text-xs text-slate-500 font-mono">
            Loading proctoring sessions...
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500">
            No proctoring sessions recorded matching the current filter yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {filteredSessions.map((session) => {
              const expanded = expandedSessionId === session.id;
              return (
                <div key={session.id} className="bg-white dark:bg-slate-900">
                  <div className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm">{session.studentName}</span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                            session.status === 'IN_PROGRESS'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                              : session.status === 'AUTO_SUBMITTED'
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {session.status}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          Cam: {session.cameraStatus}
                        </span>
                        {session.submissionReason && (
                          <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                            Reason: {session.submissionReason}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {EXAM_LABELS[session.exam]} · {session.examTitle}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums shrink-0">
                      <span
                        className={`px-2.5 py-1 rounded-lg border ${
                          session.lookingAwayWarnings > 0
                            ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
                            : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        Look-Away: {session.lookingAwayWarnings}/{session.maxLookingAwayWarnings}
                      </span>
                      <span
                        className={`px-2.5 py-1 rounded-lg border ${
                          session.faceMissingWarnings > 0
                            ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
                            : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        Face Missing: {session.faceMissingWarnings}/{session.maxFaceMissingWarnings}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        FS Exits: {session.fullscreenExitCount}
                      </span>
                      {typeof session.score === 'number' && typeof session.maxScore === 'number' && (
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          Score: {session.score}/{session.maxScore} ({session.accuracyPercent ?? 0}%)
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedSessionId(expanded ? null : session.id)
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-sans font-semibold cursor-pointer"
                      >
                        <span>Events ({session.events?.length || 0})</span>
                        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 space-y-2">
                      {session.submissionMessage && (
                        <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>{session.submissionMessage}</span>
                        </div>
                      )}
                      {(!session.events || session.events.length === 0) ? (
                        <div className="text-xs text-slate-500">No events logged yet.</div>
                      ) : (
                        <div className="space-y-1.5 max-h-56 overflow-y-auto">
                          {session.events.map((ev, idx) => (
                            <div
                              key={`${ev.timestamp}-${idx}`}
                              className="flex items-start justify-between gap-3 text-xs p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800"
                            >
                              <div className="flex items-start gap-2 min-w-0">
                                {ev.type.includes('WARNING') || ev.type === 'AUTO_SUBMITTED' ? (
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                                ) : (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                                )}
                                <div className="min-w-0">
                                  <span className="font-mono font-bold text-[10px] text-indigo-600 dark:text-indigo-400 mr-2">
                                    [{ev.type}]
                                  </span>
                                  <span>{ev.message}</span>
                                </div>
                              </div>
                              <span className="text-[10px] font-mono text-slate-400 shrink-0 inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(ev.timestamp).toLocaleTimeString('en-IN')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
