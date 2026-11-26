import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Cpu,
  Gauge,
  GraduationCap,
  RefreshCw,
  Save,
  Shield,
  Sliders,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { getApiJson } from '../lib/apiClient';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  fetchAdminTeacherList,
  updateAdminTeacherCredentials,
  type TeacherUser,
} from '../lib/teacherClient';
import {
  AI_EXAM_TARGET_LABELS,
  DEFAULT_AI_SETTINGS,
  type AiDiagramMode,
  type AiGenerationLog,
  type AiProviderStatus,
  type AiSettings,
} from '../types/obren';

interface AdminAiViewProps {
  adminUid: string;
}

function getLogMillis(ts: unknown): number {
  return (ts as { toMillis?: () => number })?.toMillis?.() || 0;
}

export const AdminAiView: React.FC<AdminAiViewProps> = ({ adminUid }) => {
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [providers, setProviders] = useState<AiProviderStatus[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [groqVerified, setGroqVerified] = useState<{
    checked: boolean;
    verified: boolean;
    error?: string;
  }>({ checked: false, verified: false });
  const [logs, setLogs] = useState<AiGenerationLog[]>([]);
  const [logFilter, setLogFilter] = useState<'ALL' | 'SUCCESS' | 'ERROR'>('ALL');
  const [teachersList, setTeachersList] = useState<TeacherUser[]>([]);
  const [teacherEdits, setTeacherEdits] = useState<
    Record<string, { username: string; name: string; title: string; subject: string; password: string }>
  >({});
  const [savingTeacherId, setSavingTeacherId] = useState<string | null>(null);
  const [teacherNotice, setTeacherNotice] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'aiSettings', 'global'),
      (snap) => {
        if (snap.exists()) {
          setSettings({
            ...DEFAULT_AI_SETTINGS,
            ...(snap.data() as Partial<AiSettings>),
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'aiSettings/global')
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsubLogs = onSnapshot(
      collection(db, 'aiGenerationLogs'),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<AiGenerationLog, 'id'>) }))
          .sort((a, b) => getLogMillis(b.createdAt) - getLogMillis(a.createdAt));
        setLogs(list.slice(0, 120));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'aiGenerationLogs')
    );
    return () => unsubLogs();
  }, []);

  const fetchProviders = async () => {
    setLoadingProviders(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const [res, groqRes, teacherList] = await Promise.all([
        getApiJson<{ providers?: AiProviderStatus[] }>('/api/ai/providers', token),
        getApiJson<{ verified?: boolean; error?: string }>('/api/ai/groq/verify', token).catch(() => null),
        fetchAdminTeacherList(token).catch(() => []),
      ]);
      if (Array.isArray(res.providers)) {
        setProviders(res.providers);
      }
      if (groqRes) {
        setGroqVerified({
          checked: true,
          verified: Boolean(groqRes.verified),
          error: groqRes.error,
        });
      }
      if (Array.isArray(teacherList) && teacherList.length > 0) {
        setTeachersList(teacherList);
        const map: Record<
          string,
          { username: string; name: string; title: string; subject: string; password: string }
        > = {};
        teacherList.forEach((t) => {
          map[t.id] = {
            username: t.username,
            name: t.name,
            title: t.title,
            subject: t.subject,
            password: '',
          };
        });
        setTeacherEdits(map);
      }
    } catch {
      // Non-fatal UI check
    } finally {
      setLoadingProviders(false);
    }
  };

  useEffect(() => {
    void fetchProviders();
  }, []);

  const handleSaveTeacherCredentials = async (teacherId: string) => {
    const edit = teacherEdits[teacherId];
    if (!edit) return;
    setSavingTeacherId(teacherId);
    setTeacherNotice(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Admin session expired.');
      const updated = await updateAdminTeacherCredentials(token, {
        teacherId,
        username: edit.username.trim(),
        name: edit.name.trim(),
        title: edit.title.trim(),
        subject: edit.subject.trim(),
        password: edit.password.trim() ? edit.password.trim() : undefined,
      });
      setTeachersList((prev) => prev.map((t) => (t.id === teacherId ? { ...t, ...updated } : t)));
      setTeacherEdits((prev) => ({
        ...prev,
        [teacherId]: { ...prev[teacherId], password: '' },
      }));
      setTeacherNotice({
        text: `Updated credentials for @${updated.username}.`,
        isError: false,
      });
    } catch (err) {
      setTeacherNotice({
        text: err instanceof Error ? err.message : 'Failed to update teacher credentials.',
        isError: true,
      });
    } finally {
      setSavingTeacherId(null);
    }
  };

  const allAvailableModels = useMemo(() => {
    const models: Array<{ id: string; label: string; provider: string; configured: boolean }> = [];
    if (providers.length > 0) {
      providers.forEach((p) => {
        p.models.forEach((m) => {
          models.push({
            id: m.id,
            label: `${m.label} (${p.configured ? 'Connected' : 'Server Env Not Set'})`,
            provider: p.label,
            configured: p.configured,
          });
        });
      });
    }
    if (!models.some((m) => m.id === 'gemini-4-hydrogen')) {
      models.unshift({
        id: 'gemini-4-hydrogen',
        label: 'Gemini 4 Hydrogen (Default)',
        provider: 'Google Gemini',
        configured: true,
      });
    }
    if (!models.some((m) => m.id === 'gemini-3.1-flash-lite')) {
      models.push({
        id: 'gemini-3.1-flash-lite',
        label: 'Gemini 3.1 Flash Lite',
        provider: 'Google Gemini',
        configured: true,
      });
    }
    return models;
  }, [providers]);

  const filteredLogs = useMemo(() => {
    if (logFilter === 'ALL') return logs;
    return logs.filter((l) => l.status === logFilter);
  }, [logs, logFilter]);

  const logStats = useMemo(() => {
    const successCount = logs.filter((l) => l.status === 'SUCCESS').length;
    const errorCount = logs.filter((l) => l.status === 'ERROR').length;
    const totalGeneratedQs = logs.reduce((s, l) => s + (l.generatedCount || 0), 0);
    const totalDiagrams = logs.reduce((s, l) => s + (l.diagramCount || 0), 0);
    return { successCount, errorCount, totalGeneratedQs, totalDiagrams };
  }, [logs]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      await setDoc(doc(db, 'aiSettings', 'global'), {
        enabled: settings.enabled,
        model: settings.model || 'gemini-4-hydrogen',
        backupModel: settings.backupModel || 'gemini-3.1-flash-lite',
        diagramMode: settings.diagramMode || 'SVG_ONLY',
        maxDailyMessages: Math.max(10, Math.min(5000, Number(settings.maxDailyMessages) || 100)),
        maxDailyAiQuestions: Math.max(10, Math.min(2000, Number(settings.maxDailyAiQuestions) || 300)),
        maxQuestionsPerPaper: Math.max(5, Math.min(90, Number(settings.maxQuestionsPerPaper) || 90)),
        allowImages: settings.allowImages,
        allowPdfs: settings.allowPdfs,
        enableGemini: settings.enableGemini ?? true,
        enableOpenAi: settings.enableOpenAi ?? true,
        enableAnthropic: settings.enableAnthropic ?? true,
        enableDeepSeek: settings.enableDeepSeek ?? true,
        enableGroq: settings.enableGroq ?? true,
        updatedBy: adminUid,
        updatedAt: serverTimestamp(),
      });
      setNotice('AI Assistant & Smart Question Generator settings saved cleanly.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'aiSettings/global');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
            <Shield className="w-3.5 h-3.5" />
            <span>Admin Control Panel</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight mt-0.5">
            AI Models &amp; Question Generator Admin
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Manage connected backend AI providers, primary &amp; fallback models, diagram generation mode, safety quotas, and API error logs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchProviders()}
          disabled={loadingProviders}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-indigo-500 ${loadingProviders ? 'animate-spin' : ''}`} />
          <span>Refresh Provider Status</span>
        </button>
      </div>

      {notice && (
        <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
          {notice}
        </div>
      )}

      {/* Server-Detected Connected Providers (Zero API Key UI Inputs) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold font-display">Connected Backend AI Providers</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              API credentials stay strictly in server environment variables and are auto-detected at runtime for automatic model failover.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {providers.map((p) => {
            const toggleKey =
              p.provider === 'gemini'
                ? 'enableGemini'
                : p.provider === 'anthropic'
                  ? 'enableAnthropic'
                  : p.provider === 'deepseek'
                    ? 'enableDeepSeek'
                    : p.provider === 'groq'
                      ? 'enableGroq'
                      : 'enableOpenAi';
            const isRoutingEnabled = settings[toggleKey] ?? true;

            return (
              <div
                key={p.provider}
                className={`p-4 rounded-xl border space-y-2.5 ${
                  p.configured && isRoutingEnabled
                    ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-xs">{p.label}</span>
                  {p.configured ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {p.provider === 'groq' && groqVerified.checked
                        ? groqVerified.verified
                          ? 'Verified Live'
                          : 'Key Invalid'
                        : 'Connected'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500">
                      <XCircle className="w-3.5 h-3.5" />
                      Not Set
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Models: {p.models.map((m) => m.id).join(', ')}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {p.provider === 'groq' && p.configured && groqVerified.checked && !groqVerified.verified
                    ? groqVerified.error || 'Groq live handshake failed.'
                    : p.configured
                      ? 'Auto-failover pool active on backend.'
                      : `Set ${p.envVarName} on server env to enable.`}
                </div>
                <label className="pt-1 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between text-[11px] font-semibold cursor-pointer">
                  <span>Include in Auto-Failover</span>
                  <input
                    type="checkbox"
                    checked={isRoutingEnabled}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        [toggleKey]: e.target.checked,
                      }))
                    }
                    className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer"
                  />
                </label>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Model & Quota Form */}
      <form
        onSubmit={(e) => void handleSave(e)}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold font-display">Model Routing &amp; Capability Controls</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Primary: <strong className="font-mono text-indigo-500">{settings.model}</strong> · Fallback:{' '}
                <strong className="font-mono text-emerald-500">{settings.backupModel || 'gemini-3.1-flash-lite'}</strong>
              </p>
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <label className="flex items-start justify-between gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 cursor-pointer">
              <div className="space-y-0.5">
                <div className="text-xs font-bold flex items-center gap-2">
                  <Bot className="w-4 h-4 text-indigo-500" />
                  <span>Enable AI Assistant &amp; Generator Globally</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Allow students to access the AI Tutor widget and Smart Question Paper Creator.
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => setSettings((prev) => ({ ...prev, enabled: e.target.checked }))}
                className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
              />
            </label>

            <label className="flex items-start justify-between gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 cursor-pointer">
              <div className="space-y-0.5">
                <div className="text-xs font-bold flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-500" />
                  <span>Allow Image Question Uploads</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Enable students to upload handwritten or screenshot question images.
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.allowImages}
                onChange={(e) => setSettings((prev) => ({ ...prev, allowImages: e.target.checked }))}
                className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
              />
            </label>

            <label className="flex items-start justify-between gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 cursor-pointer">
              <div className="space-y-0.5">
                <div className="text-xs font-bold flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-indigo-500" />
                  <span>Allow PDF Study Material Uploads</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Enable students to upload study notes or PYQ PDFs for AI analysis.
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.allowPdfs}
                onChange={(e) => setSettings((prev) => ({ ...prev, allowPdfs: e.target.checked }))}
                className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
              />
            </label>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold mb-1.5">Primary AI Model</label>
                <select
                  value={settings.model}
                  onChange={(e) => setSettings((prev) => ({ ...prev, model: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-semibold"
                >
                  {allAvailableModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id} · {m.configured ? 'Ready' : 'Env Unset'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5">Backup Failover Model</label>
                <select
                  value={settings.backupModel || 'gemini-3.1-flash-lite'}
                  onChange={(e) => setSettings((prev) => ({ ...prev, backupModel: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-semibold"
                >
                  {allAvailableModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id} · {m.configured ? 'Ready' : 'Env Unset'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5">Scientific Diagram Mode</label>
              <select
                value={settings.diagramMode || 'SVG_ONLY'}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, diagramMode: e.target.value as AiDiagramMode }))
                }
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
              >
                <option value="SVG_ONLY">
                  AI Vector SVG + Deterministic Scientific Fallback (Recommended · Fast &amp; Zero-Cost)
                </option>
                <option value="SVG_WITH_IMAGE_FALLBACK">
                  Vector SVG Primary + Programmatic Schematic Synthesis
                </option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5">Max Daily Chat Msgs</label>
                <input
                  type="number"
                  min={10}
                  max={5000}
                  value={settings.maxDailyMessages}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, maxDailyMessages: Number(e.target.value) || 100 }))
                  }
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5">Max Daily AI Qs / User</label>
                <input
                  type="number"
                  min={10}
                  max={2000}
                  value={settings.maxDailyAiQuestions || 300}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      maxDailyAiQuestions: Number(e.target.value) || 300,
                    }))
                  }
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5">Max Questions / Paper</label>
                <input
                  type="number"
                  min={5}
                  max={90}
                  value={settings.maxQuestionsPerPaper || 90}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      maxQuestionsPerPaper: Math.max(5, Math.min(90, Number(e.target.value) || 90)),
                    }))
                  }
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-semibold"
                />
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* Generation History & API Error Logs */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-bold font-display flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <span>AI Question Generation History &amp; Error Logs</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
              {logStats.successCount} successful papers · {logStats.errorCount} failed calls · {logStats.totalGeneratedQs} Qs &amp; {logStats.totalDiagrams} diagrams generated
            </p>
          </div>
          <div className="flex gap-1.5 text-xs">
            {(['ALL', 'SUCCESS', 'ERROR'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setLogFilter(f)}
                className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                  logFilter === f
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
            No AI paper generation events logged in this filter yet.
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className={`p-3.5 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                  log.status === 'ERROR'
                    ? 'border-rose-200 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/20'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30'
                }`}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`font-mono font-bold text-[11px] flex items-center gap-1 ${
                        log.status === 'ERROR' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {log.status === 'ERROR' ? (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      {log.status}
                    </span>
                    <span className="font-semibold">
                      {AI_EXAM_TARGET_LABELS[log.examTarget] || log.examTarget} · {log.subject}
                    </span>
                    <span className="text-slate-500 truncate max-w-xs">{log.chaptersSummary}</span>
                  </div>
                  {log.errorMessage && (
                    <div className="text-[11px] text-rose-700 dark:text-rose-300 font-mono break-words">
                      {log.errorMessage}
                    </div>
                  )}
                </div>
                <div className="text-[11px] font-mono tabular-nums text-slate-500 shrink-0 text-right space-y-0.5">
                  <div>
                    {log.generatedCount}/{log.requestedCount} Qs · {log.diagramCount} diagrams · {Math.round((log.durationMs || 0) / 100) / 10}s
                  </div>
                  <div>
                    {log.providerUsed}/{log.modelUsed}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Teacher Accounts & Credentials Administration */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
          <h2 className="text-base font-bold font-display flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-indigo-500" />
            <span>Authorized Teacher Accounts &amp; Credentials</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Update teacher usernames, display details, or reset passwords. Public teacher registration remains disabled.
          </p>
        </div>

        {teacherNotice && (
          <div
            className={`p-3 rounded-xl border text-xs font-semibold ${
              teacherNotice.isError
                ? 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
                : 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {teacherNotice.text}
          </div>
        )}

        {teachersList.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
            No teacher accounts loaded yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {teachersList.map((t) => {
              const edit = teacherEdits[t.id] || {
                username: t.username,
                name: t.name,
                title: t.title,
                subject: t.subject,
                password: '',
              };
              return (
                <div
                  key={t.id}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm">{t.name}</span>
                    <span className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                      @{t.username}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                        Username
                      </label>
                      <input
                        type="text"
                        value={edit.username}
                        onChange={(e) =>
                          setTeacherEdits((prev) => ({
                            ...prev,
                            [t.id]: { ...edit, username: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                        Subject
                      </label>
                      <input
                        type="text"
                        value={edit.subject}
                        onChange={(e) =>
                          setTeacherEdits((prev) => ({
                            ...prev,
                            [t.id]: { ...edit, subject: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={edit.name}
                        onChange={(e) =>
                          setTeacherEdits((prev) => ({
                            ...prev,
                            [t.id]: { ...edit, name: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                        Reset Password (min 6 chars)
                      </label>
                      <input
                        type="password"
                        placeholder="Leave blank to keep"
                        value={edit.password}
                        onChange={(e) =>
                          setTeacherEdits((prev) => ({
                            ...prev,
                            [t.id]: { ...edit, password: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={savingTeacherId === t.id}
                      onClick={() => void handleSaveTeacherCredentials(t.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-bold cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{savingTeacherId === t.id ? 'Updating...' : 'Save Teacher Credentials'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
