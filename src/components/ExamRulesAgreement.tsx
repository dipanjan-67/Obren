import React, { useEffect, useRef } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Clock,
  Eye,
  FileCheck2,
  Maximize2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { ActiveTestConfig, ProctoringSettings } from '../types/obren';
import { AI_EXAM_TARGET_LABELS, EXAM_LABELS } from '../types/obren';

export const MANDATORY_EXAM_RULES: Array<{ id: string; text: string }> = [
  {
    id: 'webcam_enabled',
    text: 'I agree to keep my webcam enabled throughout the examination.',
  },
  {
    id: 'clear_face',
    text: 'I will maintain a clear, well-lit view of my face facing the screen.',
  },
  {
    id: 'looking_away_warnings',
    text: 'I understand that looking away continuously may generate AI proctoring warnings.',
  },
  {
    id: 'repeated_violations',
    text: 'I understand that repeated violations may result in automatic examination submission.',
  },
  {
    id: 'no_unauthorized_help',
    text: 'I will not use unauthorized materials, devices, or external assistance during the examination.',
  },
  {
    id: 'fullscreen_warning',
    text: 'I understand that exiting full-screen mode during the exam may generate a warning.',
  },
  {
    id: 'auto_submit_limit',
    text: 'I understand that the examination will be automatically submitted after reaching the warning limit.',
  },
  {
    id: 'read_understood',
    text: 'I have read and understood all examination instructions and proctoring rules.',
  },
];

interface ExamRulesAgreementProps {
  config: ActiveTestConfig;
  proctoringSettings: ProctoringSettings;
  maxMarks: number;
  markCorrect: number;
  markIncorrect: number;
  cameraStatus: 'PENDING' | 'GRANTED' | 'DENIED' | 'DISCONNECTED';
  cameraError: string | null;
  cameraStream: MediaStream | null;
  checkedRules: Record<string, boolean>;
  onToggleRule: (ruleId: string) => void;
  onRequestCamera: () => Promise<boolean>;
  onStartExam: () => void;
  onCancel: () => void;
  onOpenAppearanceSettings?: () => void;
}

export const ExamRulesAgreement: React.FC<ExamRulesAgreementProps> = ({
  config,
  proctoringSettings,
  maxMarks,
  markCorrect,
  markIncorrect,
  cameraStatus,
  cameraError,
  cameraStream,
  checkedRules,
  onToggleRule,
  onRequestCamera,
  onStartExam,
  onCancel,
}) => {
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const vid = previewVideoRef.current;
    if (!vid) return;
    if (cameraStream) {
      vid.srcObject = cameraStream;
      void vid.play().catch(() => {});
    } else {
      vid.srcObject = null;
    }
  }, [cameraStream]);

  const allChecked = MANDATORY_EXAM_RULES.every((r) => Boolean(checkedRules[r.id]));
  const cameraReady = !proctoringSettings.proctoringEnabled || cameraStatus === 'GRANTED';
  const canStart = allChecked && cameraReady;
  const isUntimed = Boolean(config.untimed || config.durationSeconds === 0);
  const durationMins = isUntimed ? 0 : Math.max(1, Math.round(config.durationSeconds / 60));
  const examLabel =
    config.customExamName ||
    (config.examTarget ? AI_EXAM_TARGET_LABELS[config.examTarget] : EXAM_LABELS[config.exam]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-6 px-4 sm:px-6 flex items-center justify-center">
      <div className="max-w-4xl w-full space-y-6">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-300 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Test Center</span>
          </button>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-xs font-mono font-semibold text-indigo-300">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>AI Proctored NTA CBT Environment</span>
          </span>
        </div>

        {/* Exam Metadata Banner */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6 space-y-5">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-indigo-400 font-bold">
              {examLabel} · Examination Instructions &amp; Agreement
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold font-display text-white mt-1">
              {config.title}
            </h1>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>Duration</span>
              </div>
              <div className="text-base font-bold font-mono tabular-nums mt-1 text-white">
                {isUntimed ? 'Untimed' : `${durationMins} Mins`}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <FileCheck2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Questions &amp; Marks</span>
              </div>
              <div className="text-base font-bold font-mono tabular-nums mt-1 text-white">
                {config.questions.length} Qs · {maxMarks} Mks
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Marking Scheme</span>
              </div>
              <div className="text-sm font-bold font-mono tabular-nums mt-1 text-white">
                +{markCorrect} / {markIncorrect} MCQ
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-rose-400" />
                <span>Warning Limits</span>
              </div>
              <div className="text-xs font-bold font-mono tabular-nums mt-1.5 text-slate-200">
                Look: {proctoringSettings.maxLookingAwayWarnings} · Face: {proctoringSettings.maxFaceMissingWarnings}
              </div>
            </div>
          </div>

          {/* Step 1: Camera Permission Setup First */}
          {proctoringSettings.proctoringEnabled ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Camera className="w-4 h-4 text-indigo-400" />
                  <span className="font-bold text-sm text-white">
                    Step 1: Camera Permission &amp; Live Framing Check
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      cameraStatus === 'GRANTED'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : cameraStatus === 'DENIED'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {cameraStatus === 'GRANTED'
                      ? 'CAMERA READY'
                      : cameraStatus === 'DENIED'
                        ? 'PERMISSION BLOCKED'
                        : 'PERMISSION REQUIRED'}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Webcam access is required before starting so local browser AI can verify your face is present and looking at the screen.
                  <strong className="text-slate-100"> No video is recorded, stored, or uploaded.</strong>
                </p>
                <div className="text-[11px] text-slate-400 space-y-0.5">
                  <div>
                    • Looking away continuously for{' '}
                    <span className="font-mono text-slate-200">
                      {proctoringSettings.lookingAwayThresholdSeconds}s
                    </span>{' '}
                    issues a warning (auto-submit after{' '}
                    <span className="font-mono text-slate-200">
                      {proctoringSettings.maxLookingAwayWarnings}
                    </span>
                    ).
                  </div>
                  <div>
                    • Face missing continuously for{' '}
                    <span className="font-mono text-slate-200">
                      {proctoringSettings.faceMissingThresholdSeconds}s
                    </span>{' '}
                    issues a warning (auto-submit after{' '}
                    <span className="font-mono text-slate-200">
                      {proctoringSettings.maxFaceMissingWarnings}
                    </span>
                    ). Questions are never hidden or blurred during warnings.
                  </div>
                </div>
                {cameraError && (
                  <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{cameraError}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => void onRequestCamera()}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    cameraStatus === 'GRANTED'
                      ? 'bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>
                    {cameraStatus === 'GRANTED'
                      ? 'Camera Enabled (Recheck)'
                      : 'Enable Camera & Test Preview'}
                  </span>
                </button>
              </div>

              <div className="w-full md:w-48 h-36 rounded-xl border border-slate-800 bg-black overflow-hidden flex items-center justify-center shrink-0 relative">
                {cameraStatus === 'GRANTED' && cameraStream ? (
                  <>
                    <video
                      ref={previewVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                    <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded bg-black/70 text-[10px] font-mono text-emerald-300 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Preview Live
                    </span>
                  </>
                ) : (
                  <div className="text-center px-3 space-y-1.5">
                    <Camera className="w-6 h-6 text-slate-600 mx-auto" />
                    <div className="text-[11px] text-slate-500">Camera Preview</div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-300 flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Camera proctoring is currently disabled by administrator settings. Standard full-screen exam mode applies.</span>
            </div>
          )}

          {/* Step 2: Mandatory Rules Agreement Checkboxes */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold font-display text-white">
                Step 2: Mandatory Rules &amp; Regulations Agreement
              </h2>
              <span className="text-xs font-mono text-slate-400 tabular-nums">
                {MANDATORY_EXAM_RULES.filter((r) => checkedRules[r.id]).length}/{MANDATORY_EXAM_RULES.length} accepted
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {MANDATORY_EXAM_RULES.map((rule, idx) => {
                const checked = Boolean(checkedRules[rule.id]);
                return (
                  <label
                    key={rule.id}
                    className={`flex items-start gap-3 p-3 rounded-xl border text-xs transition-colors cursor-pointer ${
                      checked
                        ? 'border-indigo-500/60 bg-indigo-950/30 text-slate-100'
                        : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleRule(rule.id)}
                      className="mt-0.5 w-4 h-4 rounded accent-indigo-500 cursor-pointer shrink-0"
                    />
                    <span className="leading-snug">
                      <span className="font-mono text-slate-500 mr-1">{idx + 1}.</span>
                      {rule.text}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Full-screen Transparency & Start CTA */}
          <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-[11px] text-slate-400 flex items-start gap-2 max-w-xl">
              <Maximize2 className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <span>
                Clicking Start requests browser full-screen mode to minimize distractions. Exiting full-screen logs a warning; answers are always auto-saved and never penalized for warnings.
              </span>
            </div>

            <button
              type="button"
              disabled={!canStart}
              onClick={onStartExam}
              className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            >
              I Agree &amp; Start Examination
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
