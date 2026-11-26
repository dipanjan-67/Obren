import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  BookmarkCheck,
  Camera,
  CameraOff,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Download,
  Eye,
  FileText,
  FolderPlus,
  HelpCircle,
  LayoutGrid,
  Lightbulb,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Swords,
  Trash2,
  Trophy,
  X,
  XCircle,
} from 'lucide-react';
import {
  collection,
  doc,
  getDocFromServer,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { postApiJson } from '../lib/apiClient';
import { estimateExamStanding, gradeQuestionResponse, parseAnswerTokens } from '../lib/examMetrics';
import {
  EXAM_ACCENTS,
  getDensityPadding,
  getFontCss,
  getFontSizePx,
  getLineHeightValue,
  resolveExamCustomization,
  EXAM_THEMES,
} from '../lib/examThemes';
import { LocalFaceProctor, type ProctoringFrameAnalysis } from '../lib/faceProctoring';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { exportAttemptReportPdf } from '../lib/pdfExport';
import {
  AI_EXAM_TARGET_LABELS,
  AI_QUESTION_FORMAT_LABELS,
  DEFAULT_EXAM_CUSTOMIZATION,
  DEFAULT_PROCTORING_SETTINGS,
  EXAM_LABELS,
  type ActiveTestConfig,
  type ExamCustomization,
  type ExamSubmissionReason,
  type NtaQuestionStatus,
  type ProctoringEvent,
  type ProctoringSettings,
  type PyqQuestion,
  type QuestionResultItem,
  type RequestedCustomPractice,
  type TestAttempt,
  type TestDuel,
} from '../types/obren';
import { ExamRulesAgreement } from './ExamRulesAgreement';
import { MathText } from './MathText';
import { QuestionDiagramViewer } from './QuestionDiagramViewer';
import { QuestionStructuredBlocks } from './QuestionStructuredBlocks';

interface NtaExamInterfaceProps {
  config: ActiveTestConfig;
  userId: string;
  userName: string;
  userPhoto?: string;
  bookmarkedIds: Set<string>;
  proctoringSettings?: ProctoringSettings;
  examCustomization?: ExamCustomization;
  onToggleBookmark: (question: PyqQuestion, note?: string) => Promise<void>;
  onCompleteTest: (
    attempt: Omit<TestAttempt, 'id' | 'createdAt'>,
    xpEarned: number
  ) => Promise<void>;
  onSaveAiQuestionsToVault?: (questions: PyqQuestion[]) => Promise<{ bankId: string; count: number }>;
  onPracticeWeakTopics?: (req: RequestedCustomPractice) => void;
  onExit: () => void;
}

interface SavedCbtSnapshot {
  savedAt: number;
  examStarted: boolean;
  proctoringSessionId: string;
  currentIdx: number;
  answers: Record<string, string>;
  statuses: Record<string, NtaQuestionStatus>;
  questionTimeSpent: Record<string, number>;
  remainingSeconds: number;
  questionIdsSignature: string;
  lookingAwayWarnings: number;
  faceMissingWarnings: number;
  fullscreenExitCount: number;
  events: ProctoringEvent[];
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function createSessionId(uid: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `proc_${uid.slice(0, 12)}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function describeSubmissionReason(
  reason: ExamSubmissionReason,
  lookAwayCount: number,
  maxLookAway: number,
  faceMissingCount: number,
  maxFaceMissing: number
): string {
  if (reason === 'LOOKING_AWAY_LIMIT') {
    return `Automatically submitted: Looking-away warning limit reached (${lookAwayCount}/${maxLookAway}). All attempted answers were saved before submission.`;
  }
  if (reason === 'FACE_MISSING_LIMIT') {
    return `Automatically submitted: Face-not-detected warning limit reached (${faceMissingCount}/${maxFaceMissing}). All attempted answers were saved before submission.`;
  }
  if (reason === 'TIMER_EXPIRED') {
    return 'Automatically submitted: Examination timer reached 00:00:00. All attempted answers were saved.';
  }
  return 'Submitted manually by student.';
}

export const NtaExamInterface: React.FC<NtaExamInterfaceProps> = ({
  config,
  userId,
  userName,
  userPhoto,
  bookmarkedIds,
  proctoringSettings = DEFAULT_PROCTORING_SETTINGS,
  examCustomization = DEFAULT_EXAM_CUSTOMIZATION,
  onToggleBookmark,
  onCompleteTest,
  onSaveAiQuestionsToVault,
  onPracticeWeakTopics,
  onExit,
}) => {
  const [questions, setQuestions] = useState<PyqQuestion[]>(config.questions);
  const isUntimed = Boolean(config.untimed || config.durationSeconds === 0);
  const markCorrect = Math.max(1, Math.min(20, Math.round(config.markingCorrect ?? 4)));
  const markIncorrect = Math.max(-10, Math.min(0, Math.round(config.markingIncorrect ?? -1)));
  const examDisplayLabel =
    config.customExamName ||
    (config.examTarget ? AI_EXAM_TARGET_LABELS[config.examTarget] : EXAM_LABELS[config.exam]);

  const resolvedCustom = useMemo(
    () => resolveExamCustomization(examCustomization),
    [examCustomization]
  );
  const themeTokens = EXAM_THEMES[resolvedCustom.theme];
  const accentTokens = EXAM_ACCENTS[resolvedCustom.accentColor];
  const densityTokens = getDensityPadding(resolvedCustom.layoutDensity);
  const fontCss = getFontCss(resolvedCustom.fontFamily);
  const lineHeight = getLineHeightValue(resolvedCustom.lineSpacing);

  const storageKey = useMemo(() => {
    const cleanTitle = config.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    return `obren_cbt_autosave_v2_${userId}_${cleanTitle}`;
  }, [userId, config.title]);

  const signature = useMemo(
    () => `${config.questions.length}:${config.questions.slice(0, 5).map((q) => q.id).join(',')}`,
    [config.questions]
  );

  const initialRestored = useMemo<SavedCbtSnapshot | null>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SavedCbtSnapshot;
      if (
        parsed &&
        parsed.questionIdsSignature === signature &&
        Date.now() - parsed.savedAt < 12 * 60 * 60 * 1000 &&
        (isUntimed || parsed.remainingSeconds > 0)
      ) {
        return parsed;
      }
    } catch {
      // Ignore corrupt local state
    }
    return null;
  }, [storageKey, signature, isUntimed]);

  const [examStarted, setExamStarted] = useState<boolean>(
    Boolean(initialRestored?.examStarted)
  );
  const [proctoringSessionId, setProctoringSessionId] = useState<string>(
    () => initialRestored?.proctoringSessionId || createSessionId(userId)
  );
  const [checkedRules, setCheckedRules] = useState<Record<string, boolean>>({});
  const [resumedBanner, setResumedBanner] = useState(
    Boolean(initialRestored?.examStarted)
  );

  const [currentIdx, setCurrentIdx] = useState(initialRestored?.currentIdx ?? 0);
  const [answers, setAnswers] = useState<Record<string, string>>(initialRestored?.answers ?? {});
  const [statuses, setStatuses] = useState<Record<string, NtaQuestionStatus>>(() => {
    if (initialRestored?.statuses) return initialRestored.statuses;
    const init: Record<string, NtaQuestionStatus> = {};
    config.questions.forEach((q, idx) => {
      init[q.id] = idx === 0 ? 'NOT_ANSWERED' : 'NOT_VISITED';
    });
    return init;
  });
  const [questionTimeSpent, setQuestionTimeSpent] = useState<Record<string, number>>(
    initialRestored?.questionTimeSpent ?? {}
  );
  const [remainingSeconds, setRemainingSeconds] = useState(
    initialRestored?.remainingSeconds ?? config.durationSeconds
  );
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Proctoring & Fullscreen States
  const [cameraStatus, setCameraStatus] = useState<
    'PENDING' | 'GRANTED' | 'DENIED' | 'DISCONNECTED'
  >('PENDING');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [trackingAnalysis, setTrackingAnalysis] = useState<ProctoringFrameAnalysis>({
    state: 'INITIALIZING',
    faceDetected: true,
    lookingAtScreen: true,
    yawDeg: 0,
    pitchDeg: 0,
    confidenceLabel: 'Initializing camera...',
  });
  const [lookingAwayWarnings, setLookingAwayWarnings] = useState<number>(
    initialRestored?.lookingAwayWarnings ?? 0
  );
  const [faceMissingWarnings, setFaceMissingWarnings] = useState<number>(
    initialRestored?.faceMissingWarnings ?? 0
  );
  const [fullscreenExitCount, setFullscreenExitCount] = useState<number>(
    initialRestored?.fullscreenExitCount ?? 0
  );
  const [proctoringEvents, setProctoringEvents] = useState<ProctoringEvent[]>(
    initialRestored?.events ?? []
  );
  const [lookAwayElapsedSec, setLookAwayElapsedSec] = useState(0);
  const [faceMissingElapsedSec, setFaceMissingElapsedSec] = useState(0);
  const [activeToast, setActiveToast] = useState<{
    id: number;
    tone: 'amber' | 'rose' | 'indigo';
    title: string;
    message: string;
  } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false
  );
  const [fullscreenExitNotice, setFullscreenExitNotice] = useState(false);

  // Modals & Submission state
  const [mobilePaletteOpen, setMobilePaletteOpen] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showPaperView, setShowPaperView] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showEventLogDrawer, setShowEventLogDrawer] = useState(false);
  const [showResultEventLog, setShowResultEventLog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedResult, setSubmittedResult] = useState<{
    attempt: Omit<TestAttempt, 'id' | 'createdAt'>;
    xpEarned: number;
    submissionReason: ExamSubmissionReason;
    submissionMessage: string;
    eventsSnapshot: ProctoringEvent[];
  } | null>(null);
  const [bookmarkNoteModal, setBookmarkNoteModal] = useState<PyqQuestion | null>(null);
  const [bookmarkNote, setBookmarkNote] = useState('');
  const [duelData, setDuelData] = useState<TestDuel | null>(null);
  const [sectionCapNotice, setSectionCapNotice] = useState<string | null>(null);
  const [savingAiVault, setSavingAiVault] = useState(false);
  const [aiVaultSavedMsg, setAiVaultSavedMsg] = useState<string | null>(null);
  const [revealedHints, setRevealedHints] = useState<Record<string, boolean>>({});
  const [revealedSolutions, setRevealedSolutions] = useState<Record<string, boolean>>({});
  const [savedBankIds, setSavedBankIds] = useState<Set<string>>(() => new Set());
  const [savingBankQId, setSavingBankQId] = useState<string | null>(null);
  const [regeneratingQId, setRegeneratingQId] = useState<string | null>(null);
  const [regenStatusMsg, setRegenStatusMsg] = useState<string | null>(null);

  const examVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const proctorRef = useRef<LocalFaceProctor | null>(null);
  const submissionLockRef = useRef(false);

  // Refs for latest counters inside intervals/callbacks
  const lookingAwayWarningsRef = useRef(lookingAwayWarnings);
  lookingAwayWarningsRef.current = lookingAwayWarnings;
  const faceMissingWarningsRef = useRef(faceMissingWarnings);
  faceMissingWarningsRef.current = faceMissingWarnings;
  const fullscreenExitCountRef = useRef(fullscreenExitCount);
  fullscreenExitCountRef.current = fullscreenExitCount;
  const eventsRef = useRef(proctoringEvents);
  eventsRef.current = proctoringEvents;
  const cameraStatusRef = useRef(cameraStatus);
  cameraStatusRef.current = cameraStatus;

  const currentQuestion = questions[currentIdx];

  // Detect JEE Section B Numerical Cap
  const sectionBInfo = useMemo(() => {
    const capBySubject: Record<
      string,
      { totalNumericals: number; attemptedNumericals: number; capActive: boolean }
    > = {};
    questions.forEach((q) => {
      if (!capBySubject[q.subject]) {
        capBySubject[q.subject] = { totalNumericals: 0, attemptedNumericals: 0, capActive: false };
      }
      if (q.questionType === 'NUMERICAL') {
        capBySubject[q.subject].totalNumericals += 1;
        if ((answers[q.id] || '').trim()) {
          capBySubject[q.subject].attemptedNumericals += 1;
        }
      }
    });
    Object.values(capBySubject).forEach((entry) => {
      entry.capActive = config.exam !== 'NEET' && entry.totalNumericals > 5;
    });
    return capBySubject;
  }, [questions, answers, config.exam]);

  const currentSubjectSectionB = currentQuestion ? sectionBInfo[currentQuestion.subject] : undefined;

  const effectiveMaxMarks = useMemo(() => {
    let eff = questions.length;
    Object.values(sectionBInfo).forEach((entry) => {
      if (entry.capActive) {
        eff -= Math.max(0, entry.totalNumericals - 5);
      }
    });
    return Math.min(1000, Math.max(1, eff * markCorrect));
  }, [questions.length, sectionBInfo, markCorrect]);

  const showNonBlockingToast = useCallback(
    (tone: 'amber' | 'rose' | 'indigo', title: string, message: string) => {
      const id = Date.now();
      setActiveToast({ id, tone, title, message });
      window.setTimeout(() => {
        setActiveToast((curr) => (curr?.id === id ? null : curr));
      }, 7500);
    },
    []
  );

  const appendProctoringEvent = useCallback(
    (event: ProctoringEvent) => {
      setProctoringEvents((prev) => {
        const next = [...prev, event].slice(-140);
        eventsRef.current = next;
        return next;
      });
    },
    []
  );

  const syncProctoringSessionToFirestore = useCallback(
    async (overrides?: {
      status?: 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED';
      cameraStatus?: 'PENDING' | 'GRANTED' | 'DENIED' | 'DISCONNECTED';
      fullscreenActive?: boolean;
      lookingAwayWarnings?: number;
      faceMissingWarnings?: number;
      fullscreenExitCount?: number;
      events?: ProctoringEvent[];
      submissionReason?: ExamSubmissionReason;
      submissionMessage?: string;
      score?: number;
      maxScore?: number;
      accuracyPercent?: number;
      isCreate?: boolean;
    }) => {
      try {
        const sessionRef = doc(db, 'examProctoringSessions', proctoringSessionId);
        const evList = (overrides?.events ?? eventsRef.current).slice(-140);
        const baseDoc = {
          ownerId: userId,
          studentName: (userName || 'Student').slice(0, 78),
          examTitle: config.title.slice(0, 158),
          exam: config.exam,
          status: overrides?.status ?? (examStarted ? 'IN_PROGRESS' : 'NOT_STARTED'),
          cameraStatus: overrides?.cameraStatus ?? cameraStatusRef.current,
          fullscreenActive:
            overrides?.fullscreenActive ??
            (typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false),
          lookingAwayWarnings: overrides?.lookingAwayWarnings ?? lookingAwayWarningsRef.current,
          maxLookingAwayWarnings: proctoringSettings.maxLookingAwayWarnings,
          faceMissingWarnings: overrides?.faceMissingWarnings ?? faceMissingWarningsRef.current,
          maxFaceMissingWarnings: proctoringSettings.maxFaceMissingWarnings,
          fullscreenExitCount: overrides?.fullscreenExitCount ?? fullscreenExitCountRef.current,
          events: evList,
          ...(overrides?.submissionReason ? { submissionReason: overrides.submissionReason } : {}),
          ...(overrides?.submissionMessage
            ? { submissionMessage: overrides.submissionMessage.slice(0, 290) }
            : {}),
          ...(typeof overrides?.score === 'number' ? { score: overrides.score } : {}),
          ...(typeof overrides?.maxScore === 'number' ? { maxScore: overrides.maxScore } : {}),
          ...(typeof overrides?.accuracyPercent === 'number'
            ? { accuracyPercent: overrides.accuracyPercent }
            : {}),
          updatedAt: serverTimestamp(),
        };

        if (overrides?.isCreate) {
          await setDoc(sessionRef, {
            ...baseDoc,
            startedAt: serverTimestamp(),
          });
        } else {
          await setDoc(sessionRef, baseDoc, { merge: true });
        }
      } catch {
        // Never disrupt exam UI on transient network error
      }
    },
    [
      proctoringSessionId,
      userId,
      userName,
      config.title,
      config.exam,
      examStarted,
      proctoringSettings.maxLookingAwayWarnings,
      proctoringSettings.maxFaceMissingWarnings,
    ]
  );

  // Stop active webcam tracks cleanly
  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        t.onended = null;
        t.stop();
      });
      streamRef.current = null;
    }
    setCameraStream(null);
  }, []);

  // Request webcam permission cleanly
  const requestCameraPermission = useCallback(async (): Promise<boolean> => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraStatus('DENIED');
      setCameraError(
        'Webcam access is not available in this browser or context. Please use Chrome, Edge, or Firefox over HTTPS.'
      );
      return false;
    }

    setCameraError(null);
    try {
      stopCameraStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 320, max: 640 },
          height: { ideal: 240, max: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;
      setCameraStream(stream);
      setCameraStatus('GRANTED');

      const [videoTrack] = stream.getVideoTracks();
      if (videoTrack) {
        videoTrack.onended = () => {
          setCameraStatus('DISCONNECTED');
          setCameraStream(null);
          const ev: ProctoringEvent = {
            type: 'CAMERA_DISCONNECTED',
            timestamp: new Date().toISOString(),
            message: 'Webcam disconnected or permission was revoked during examination.',
          };
          appendProctoringEvent(ev);
          showNonBlockingToast(
            'rose',
            'Camera Disconnected',
            'Your webcam disconnected. Please reconnect your camera to resume face monitoring.'
          );
          void syncProctoringSessionToFirestore({ cameraStatus: 'DISCONNECTED' });
        };
      }

      const ev: ProctoringEvent = {
        type: 'CAMERA_GRANTED',
        timestamp: new Date().toISOString(),
        message: 'Student granted webcam permission for local AI proctoring.',
      };
      appendProctoringEvent(ev);
      return true;
    } catch (err) {
      const msg =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Camera permission was denied. Please allow camera access in your browser site settings and click Enable Camera.'
          : err instanceof Error && err.name === 'NotFoundError'
            ? 'No webcam detected on this device. Please connect a camera and retry.'
            : 'Unable to access webcam. Check browser permissions and retry.';
      setCameraStatus('DENIED');
      setCameraError(msg);
      const ev: ProctoringEvent = {
        type: 'CAMERA_DENIED',
        timestamp: new Date().toISOString(),
        message: msg,
      };
      appendProctoringEvent(ev);
      return false;
    }
  }, [appendProctoringEvent, showNonBlockingToast, stopCameraStream, syncProctoringSessionToFirestore]);

  // Ask for camera permission first when entering pre-exam agreement screen (or when resuming an active exam)
  useEffect(() => {
    if (!proctoringSettings.proctoringEnabled || submittedResult) return;
    void requestCameraPermission();
    return () => {
      stopCameraStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proctoringSettings.proctoringEnabled]);

  // Attach live cameraStream to the active exam mini preview video element
  useEffect(() => {
    const vid = examVideoRef.current;
    if (!vid || !examStarted || submittedResult) return;
    if (cameraStream) {
      vid.srcObject = cameraStream;
      void vid.play().catch(() => {});
    } else {
      vid.srcObject = null;
    }
  }, [cameraStream, examStarted, submittedResult]);

  // Restore proctoring counters from Firestore if page refreshed mid-exam (anti-refresh safeguard)
  useEffect(() => {
    if (!initialRestored?.examStarted || !initialRestored?.proctoringSessionId) return;
    getDocFromServer(doc(db, 'examProctoringSessions', initialRestored.proctoringSessionId))
      .then((snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        setLookingAwayWarnings((prev) => Math.max(prev, Number(data.lookingAwayWarnings || 0)));
        setFaceMissingWarnings((prev) => Math.max(prev, Number(data.faceMissingWarnings || 0)));
        setFullscreenExitCount((prev) => Math.max(prev, Number(data.fullscreenExitCount || 0)));
        if (Array.isArray(data.events) && data.events.length > 0) {
          setProctoringEvents((prev) =>
            data.events.length >= prev.length ? (data.events as ProctoringEvent[]) : prev
          );
        }
      })
      .catch(() => {});
  }, [initialRestored]);

  // Auto-save mid-test state to localStorage
  useEffect(() => {
    if (submittedResult || submitting) return;
    const payload: SavedCbtSnapshot = {
      savedAt: Date.now(),
      examStarted,
      proctoringSessionId,
      currentIdx,
      answers,
      statuses,
      questionTimeSpent,
      remainingSeconds,
      questionIdsSignature: signature,
      lookingAwayWarnings,
      faceMissingWarnings,
      fullscreenExitCount,
      events: proctoringEvents.slice(-120),
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // Ignore quota errors
    }
  }, [
    storageKey,
    signature,
    examStarted,
    proctoringSessionId,
    currentIdx,
    answers,
    statuses,
    questionTimeSpent,
    remainingSeconds,
    lookingAwayWarnings,
    faceMissingWarnings,
    fullscreenExitCount,
    proctoringEvents,
    submittedResult,
    submitting,
  ]);

  // Sync live duel room if in DUEL mode
  useEffect(() => {
    if (!config.duelId) return;
    const duelRef = doc(db, 'duels', config.duelId);
    const unsub = onSnapshot(
      duelRef,
      (snap) => {
        if (snap.exists()) {
          setDuelData({ id: snap.id, ...(snap.data() as Omit<TestDuel, 'id'>) });
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `duels/${config.duelId}`)
    );
    return () => unsub();
  }, [config.duelId]);

  // Request Full-Screen Helper (must only be triggered inside user click gestures)
  const enterFullscreen = useCallback(async () => {
    if (!proctoringSettings.fullscreenMonitoringEnabled) return;
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
        setFullscreenExitNotice(false);
        appendProctoringEvent({
          type: 'FULLSCREEN_ENTERED',
          timestamp: new Date().toISOString(),
          message: 'Entered distraction-free full-screen mode.',
        });
      }
    } catch {
      // Gracefully handle browser fullscreen denials inside restricted iframes
    }
  }, [proctoringSettings.fullscreenMonitoringEnabled, appendProctoringEvent]);

  // Listen for browser full-screen exits during active exam
  useEffect(() => {
    const onFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      if (
        !active &&
        examStarted &&
        !submittedResult &&
        !submitting &&
        proctoringSettings.fullscreenMonitoringEnabled
      ) {
        const nextExits = fullscreenExitCountRef.current + 1;
        fullscreenExitCountRef.current = nextExits;
        setFullscreenExitCount(nextExits);
        setFullscreenExitNotice(true);
        const ev: ProctoringEvent = {
          type: 'FULLSCREEN_EXITED',
          timestamp: new Date().toISOString(),
          message: `Student exited full-screen mode (Exit #${nextExits}).`,
        };
        appendProctoringEvent(ev);
        showNonBlockingToast(
          'amber',
          'Full-Screen Exited',
          'Full-screen mode was exited. Please re-enter full-screen to maintain exam focus.'
        );
        void syncProctoringSessionToFirestore({ fullscreenActive: false, fullscreenExitCount: nextExits });
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [
    examStarted,
    submittedResult,
    submitting,
    proctoringSettings.fullscreenMonitoringEnabled,
    appendProctoringEvent,
    showNonBlockingToast,
    syncProctoringSessionToFirestore,
  ]);

  // Finalize & Validate Submission
  const finalizeSubmission = useCallback(
    async (reason: ExamSubmissionReason = 'MANUAL') => {
      if (submissionLockRef.current || submitting || submittedResult) return;
      submissionLockRef.current = true;
      setSubmitting(true);
      setShowSubmitModal(false);

      let attemptedCount = 0;
      let correctCount = 0;
      let incorrectCount = 0;
      let rawScore = 0;

      const subjectStats: Record<
        string,
        { total: number; correct: number; incorrect: number; score: number }
      > = {};

      const questionResults: QuestionResultItem[] = questions.map((q) => {
        const ua = (answers[q.id] || '').trim();
        const graded = gradeQuestionResponse(q, ua, markCorrect, markIncorrect);

        if (!subjectStats[q.subject]) {
          subjectStats[q.subject] = { total: 0, correct: 0, incorrect: 0, score: 0 };
        }
        subjectStats[q.subject].total += 1;

        if (graded.isAttempted) {
          attemptedCount += 1;
          if (graded.isCorrect) {
            correctCount += 1;
            subjectStats[q.subject].correct += 1;
          } else if (graded.marksAwarded <= 0) {
            incorrectCount += 1;
            subjectStats[q.subject].incorrect += 1;
          }
        }
        rawScore += graded.marksAwarded;
        subjectStats[q.subject].score += graded.marksAwarded;

        return {
          questionId: q.id,
          subject: q.subject,
          topic: q.topic,
          userAnswer: ua,
          correctAnswer: q.correctAnswer,
          isCorrect: graded.isCorrect,
          isAttempted: graded.isAttempted,
          marksAwarded: graded.marksAwarded,
          timeSpentSeconds: questionTimeSpent[q.id] || 0,
        };
      });

      const score = Math.max(-500, Math.min(1000, rawScore));
      const maxScore = effectiveMaxMarks;
      const accuracyPercent =
        attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0;
      const timeSpentSeconds = isUntimed
        ? Math.max(1, elapsedSeconds)
        : Math.max(1, config.durationSeconds - remainingSeconds);
      const xpEarned = Math.max(15, correctCount * 15 + attemptedCount * 3);

      let verifiedReason: ExamSubmissionReason = reason;
      if (navigator.onLine) {
        try {
          const token = await auth.currentUser?.getIdToken();
          if (token) {
            const serverCheck = await postApiJson<{
              valid?: boolean;
              verifiedReason?: ExamSubmissionReason;
            }>(
              '/api/exam/validate-submission',
              {
                proctoringSessionId,
                totalQuestions: questions.length,
                attemptedCount,
                timeSpentSeconds,
                lookingAwayWarnings: lookingAwayWarningsRef.current,
                faceMissingWarnings: faceMissingWarningsRef.current,
                maxLookingAwayWarnings: proctoringSettings.maxLookingAwayWarnings,
                maxFaceMissingWarnings: proctoringSettings.maxFaceMissingWarnings,
                submissionReason: reason,
              },
              token
            );
            if (serverCheck.verifiedReason) {
              verifiedReason = serverCheck.verifiedReason;
            }
          }
        } catch {
          // Proceed gracefully if offline or transient network error so student answers are never lost
        }
      }

      const submissionMessage = describeSubmissionReason(
        verifiedReason,
        lookingAwayWarningsRef.current,
        proctoringSettings.maxLookingAwayWarnings,
        faceMissingWarningsRef.current,
        proctoringSettings.maxFaceMissingWarnings
      );

      const finalEvent: ProctoringEvent = {
        type:
          verifiedReason === 'MANUAL'
            ? 'MANUAL_SUBMITTED'
            : verifiedReason === 'TIMER_EXPIRED'
              ? 'TIME_UP_SUBMITTED'
              : 'AUTO_SUBMITTED',
        timestamp: new Date().toISOString(),
        message: submissionMessage,
      };
      const updatedEvents = [...eventsRef.current, finalEvent].slice(-140);
      setProctoringEvents(updatedEvents);
      eventsRef.current = updatedEvents;

      const attemptPayload: Omit<TestAttempt, 'id' | 'createdAt'> = {
        ownerId: userId,
        title: config.title.slice(0, 160),
        exam: config.exam,
        testMode: config.testMode,
        classLevel: config.classLevel,
        subjectFilter: config.subjectFilter.slice(0, 80),
        topicFilter: config.topicFilter.slice(0, 120),
        totalQuestions: questions.length,
        attemptedCount,
        correctCount,
        incorrectCount,
        score,
        maxScore,
        accuracyPercent,
        timeSpentSeconds,
        subjectStats,
        questionResults,
        submissionReason: verifiedReason,
        proctoringSessionId,
        proctoringSummary: {
          lookingAwayWarnings: lookingAwayWarningsRef.current,
          faceMissingWarnings: faceMissingWarningsRef.current,
          fullscreenExitCount: fullscreenExitCountRef.current,
          cameraStatus: cameraStatusRef.current,
        },
      };

      try {
        await syncProctoringSessionToFirestore({
          status: verifiedReason === 'MANUAL' ? 'SUBMITTED' : 'AUTO_SUBMITTED',
          submissionReason: verifiedReason,
          submissionMessage,
          score,
          maxScore,
          accuracyPercent,
          events: updatedEvents,
          fullscreenActive: false,
        });

        if (config.duelId && duelData && duelData.status !== 'FINISHED') {
          const isHost = duelData.hostId === userId;
          const otherFinished = isHost ? duelData.guestFinished : duelData.hostFinished;
          const otherScore = isHost ? duelData.guestScore : duelData.hostScore;
          const otherId = isHost ? duelData.guestId || '' : duelData.hostId;
          let nextStatus: 'ACTIVE' | 'FINISHED' =
            duelData.status === 'WAITING' ? 'ACTIVE' : duelData.status;
          let winnerId = '';
          const duelScore = Math.max(-100, Math.min(300, score));
          const duelProgress = Math.min(30, attemptedCount);
          if (otherFinished) {
            nextStatus = 'FINISHED';
            if (duelScore > otherScore) winnerId = userId;
            else if (otherScore > duelScore) winnerId = otherId;
            else winnerId = 'DRAW';
          }
          await updateDoc(doc(db, 'duels', config.duelId), {
            ...(isHost
              ? { hostProgress: duelProgress, hostScore: duelScore, hostFinished: true }
              : { guestProgress: duelProgress, guestScore: duelScore, guestFinished: true }),
            status: nextStatus,
            winnerId,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }

        await onCompleteTest(attemptPayload, xpEarned);
        try {
          localStorage.removeItem(storageKey);
        } catch {
          // Ignore
        }
        stopCameraStream();
        if (typeof document !== 'undefined' && document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        }
        setSubmittedResult({
          attempt: attemptPayload,
          xpEarned,
          submissionReason: verifiedReason,
          submissionMessage,
          eventsSnapshot: updatedEvents,
        });
      } finally {
        setSubmitting(false);
        submissionLockRef.current = false;
      }
    },
    [
      submitting,
      submittedResult,
      questions,
      answers,
      markCorrect,
      markIncorrect,
      questionTimeSpent,
      effectiveMaxMarks,
      config,
      remainingSeconds,
      proctoringSessionId,
      proctoringSettings.maxLookingAwayWarnings,
      proctoringSettings.maxFaceMissingWarnings,
      userId,
      syncProctoringSessionToFirestore,
      duelData,
      onCompleteTest,
      storageKey,
      stopCameraStream,
    ]
  );

  // Countdown / Elapsed Clock + per-question time tracker (only active AFTER examStarted)
  useEffect(() => {
    if (!examStarted || submittedResult) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
      if (!isUntimed) {
        setRemainingSeconds((prev) => {
          if (prev <= 1) {
            window.clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }
      if (currentQuestion) {
        setQuestionTimeSpent((prev) => ({
          ...prev,
          [currentQuestion.id]: (prev[currentQuestion.id] || 0) + 1,
        }));
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [examStarted, submittedResult, currentQuestion, isUntimed]);

  // Auto-submit when clock hits 0 (only in timed exams)
  useEffect(() => {
    if (!isUntimed && examStarted && remainingSeconds === 0 && !submittedResult && !submitting) {
      void finalizeSubmission('TIMER_EXPIRED');
    }
  }, [isUntimed, examStarted, remainingSeconds, submittedResult, submitting, finalizeSubmission]);

  // Real-Time Local AI Face & Gaze Proctoring Loop
  useEffect(() => {
    if (
      !examStarted ||
      submittedResult ||
      !proctoringSettings.proctoringEnabled ||
      cameraStatus !== 'GRANTED' ||
      !cameraStream
    ) {
      return;
    }

    let cancelled = false;
    const proctor = new LocalFaceProctor();
    proctorRef.current = proctor;

    let awayMs = 0;
    let missingMs = 0;
    let goodFocusStreakMs = 0;
    let goodFaceStreakMs = 0;
    let awayGraceMs = 0;
    let missingGraceMs = 0;
    let lastTick = performance.now();

    void proctor.init();

    const intervalId = window.setInterval(async () => {
      if (cancelled || submissionLockRef.current) return;
      const vid = examVideoRef.current;
      if (!vid) return;

      const now = performance.now();
      const deltaMs = Math.min(1000, Math.max(100, now - lastTick));
      lastTick = now;

      const analysis = await proctor.analyzeVideoFrame(vid, now);
      if (cancelled) return;
      setTrackingAnalysis(analysis);

      if (analysis.state === 'INITIALIZING' || analysis.state === 'FALLBACK_ACTIVE') {
        return;
      }

      if (!analysis.faceDetected) {
        // Face Not Detected branch
        goodFaceStreakMs = 0;
        goodFocusStreakMs = 0;
        awayGraceMs = 0;

        if (proctoringSettings.faceMissingEnabled) {
          // 1.5s grace buffer avoids brief glitches/lighting dips
          missingGraceMs += deltaMs;
          if (missingGraceMs >= 1500) {
            missingMs += deltaMs;
            const elapsedSec = Math.floor(missingMs / 1000);
            setFaceMissingElapsedSec(elapsedSec);

            const thresholdMs = proctoringSettings.faceMissingThresholdSeconds * 1000;
            if (missingMs >= thresholdMs) {
              missingMs = 0;
              missingGraceMs = 1500;
              setFaceMissingElapsedSec(0);

              const nextWarn = faceMissingWarningsRef.current + 1;
              faceMissingWarningsRef.current = nextWarn;
              setFaceMissingWarnings(nextWarn);

              const maxW = proctoringSettings.maxFaceMissingWarnings;
              const warnEv: ProctoringEvent = {
                type: 'FACE_MISSING_WARNING',
                timestamp: new Date().toISOString(),
                warningNumber: nextWarn,
                message: `Face Not Detected Warning ${nextWarn}/${maxW} after ${proctoringSettings.faceMissingThresholdSeconds}s continuous absence.`,
              };
              const updatedEvents = [...eventsRef.current, warnEv].slice(-140);
              setProctoringEvents(updatedEvents);
              eventsRef.current = updatedEvents;

              showNonBlockingToast(
                'rose',
                `Face Not Detected (${nextWarn}/${maxW})`,
                `Warning ${nextWarn}/${maxW}: Your face was not visible for ${proctoringSettings.faceMissingThresholdSeconds} seconds. Please stay visible in front of the webcam.`
              );

              void syncProctoringSessionToFirestore({
                faceMissingWarnings: nextWarn,
                events: updatedEvents,
              });

              if (proctoringSettings.autoSubmitOnLimit && nextWarn >= maxW) {
                void finalizeSubmission('FACE_MISSING_LIMIT');
              }
            }
          }
        }
      } else {
        // Face IS detected -> confirm brief 600ms return before resetting face-missing timer
        missingGraceMs = 0;
        goodFaceStreakMs += deltaMs;
        if (goodFaceStreakMs >= 600 && (missingMs > 0 || faceMissingElapsedSec > 0)) {
          missingMs = 0;
          setFaceMissingElapsedSec(0);
        }

        if (!analysis.lookingAtScreen && proctoringSettings.lookingAwayEnabled) {
          goodFocusStreakMs = 0;
          awayGraceMs += deltaMs;
          if (awayGraceMs >= 1500) {
            awayMs += deltaMs;
            const elapsedSec = Math.floor(awayMs / 1000);
            setLookAwayElapsedSec(elapsedSec);

            const thresholdMs = proctoringSettings.lookingAwayThresholdSeconds * 1000;
            if (awayMs >= thresholdMs) {
              awayMs = 0;
              awayGraceMs = 1500;
              setLookAwayElapsedSec(0);

              const nextWarn = lookingAwayWarningsRef.current + 1;
              lookingAwayWarningsRef.current = nextWarn;
              setLookingAwayWarnings(nextWarn);

              const maxW = proctoringSettings.maxLookingAwayWarnings;
              const warnEv: ProctoringEvent = {
                type: 'LOOKING_AWAY_WARNING',
                timestamp: new Date().toISOString(),
                warningNumber: nextWarn,
                message: `Looking Away Warning ${nextWarn}/${maxW} after ${proctoringSettings.lookingAwayThresholdSeconds}s continuous gaze/head away.`,
              };
              const updatedEvents = [...eventsRef.current, warnEv].slice(-140);
              setProctoringEvents(updatedEvents);
              eventsRef.current = updatedEvents;

              showNonBlockingToast(
                'amber',
                `Looking Away Warning (${nextWarn}/${maxW})`,
                `Warning ${nextWarn}/${maxW}: Please look towards the examination screen.`
              );

              void syncProctoringSessionToFirestore({
                lookingAwayWarnings: nextWarn,
                events: updatedEvents,
              });

              if (proctoringSettings.autoSubmitOnLimit && nextWarn >= maxW) {
                void finalizeSubmission('LOOKING_AWAY_LIMIT');
              }
            }
          }
        } else {
          // Looking forward cleanly -> reset looking-away timer after 600ms confirmation
          awayGraceMs = 0;
          goodFocusStreakMs += deltaMs;
          if (goodFocusStreakMs >= 600 && (awayMs > 0 || lookAwayElapsedSec > 0)) {
            awayMs = 0;
            setLookAwayElapsedSec(0);
          }
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      proctor.destroy();
      proctorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    examStarted,
    submittedResult,
    cameraStatus,
    cameraStream,
    proctoringSettings.proctoringEnabled,
    proctoringSettings.lookingAwayEnabled,
    proctoringSettings.faceMissingEnabled,
    proctoringSettings.lookingAwayThresholdSeconds,
    proctoringSettings.faceMissingThresholdSeconds,
    proctoringSettings.maxLookingAwayWarnings,
    proctoringSettings.maxFaceMissingWarnings,
    proctoringSettings.autoSubmitOnLimit,
  ]);

  const handleStartExamFromAgreement = () => {
    void enterFullscreen();
    const startEv: ProctoringEvent = {
      type: 'EXAM_STARTED',
      timestamp: new Date().toISOString(),
      message: 'Student accepted all examination rules and started the examination.',
    };
    const nextEvents = [...eventsRef.current, startEv];
    setProctoringEvents(nextEvents);
    eventsRef.current = nextEvents;
    setExamStarted(true);
    void syncProctoringSessionToFirestore({
      status: 'IN_PROGRESS',
      events: nextEvents,
      isCreate: true,
    });
  };

  const subjectsInTest = useMemo(() => {
    const seen: string[] = [];
    questions.forEach((q) => {
      if (!seen.includes(q.subject)) seen.push(q.subject);
    });
    return seen;
  }, [questions]);

  const counts = useMemo(() => {
    let notVisited = 0;
    let notAnswered = 0;
    let answered = 0;
    let marked = 0;
    let answeredMarked = 0;
    questions.forEach((q) => {
      const st = statuses[q.id] || 'NOT_VISITED';
      if (st === 'NOT_VISITED') notVisited += 1;
      else if (st === 'NOT_ANSWERED') notAnswered += 1;
      else if (st === 'ANSWERED') answered += 1;
      else if (st === 'MARKED_REVIEW') marked += 1;
      else if (st === 'ANSWERED_MARKED_REVIEW') answeredMarked += 1;
    });
    return { notVisited, notAnswered, answered, marked, answeredMarked };
  }, [questions, statuses]);

  const goToQuestion = (idx: number) => {
    if (idx < 0 || idx >= questions.length) return;
    const targetQ = questions[idx];
    setStatuses((prev) => ({
      ...prev,
      [targetQ.id]: prev[targetQ.id] === 'NOT_VISITED' ? 'NOT_ANSWERED' : prev[targetQ.id],
    }));
    setCurrentIdx(idx);
    setMobilePaletteOpen(false);
    setSectionCapNotice(null);
  };

  const syncDuelProgress = async (answeredCount: number, currentScore: number) => {
    if (!config.duelId || !duelData || duelData.status === 'FINISHED') return;
    const isHost = duelData.hostId === userId;
    const duelScore = Math.max(-100, Math.min(300, currentScore));
    const duelRef = doc(db, 'duels', config.duelId);
    try {
      await updateDoc(duelRef, {
        ...(isHost
          ? { hostProgress: Math.min(30, answeredCount), hostScore: duelScore }
          : { guestProgress: Math.min(30, answeredCount), guestScore: duelScore }),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Ignore mid-test sync drops
    }
  };

  const computeLiveScore = (ansMap: Record<string, string>) => {
    let sc = 0;
    let ansCount = 0;
    questions.forEach((q) => {
      const ua = (ansMap[q.id] || '').trim();
      if (!ua) return;
      ansCount += 1;
      const graded = gradeQuestionResponse(q, ua, markCorrect, markIncorrect);
      sc += graded.marksAwarded;
    });
    return { ansCount, sc };
  };

  const handleSetNumericalAnswer = (q: PyqQuestion, nextVal: string) => {
    const currentlyEmpty = !(answers[q.id] || '').trim();
    const info = sectionBInfo[q.subject];
    if (currentlyEmpty && nextVal.trim() && info?.capActive && info.attemptedNumericals >= 5) {
      setSectionCapNotice(
        `Section B limit reached for ${q.subject}: maximum 5 of ${info.totalNumericals} numerical questions can be attempted. Clear one to switch.`
      );
      return;
    }
    setSectionCapNotice(null);
    setAnswers((prev) => ({ ...prev, [q.id]: nextVal }));
  };

  const handleToggleMultiMcqOption = (q: PyqQuestion, opt: string) => {
    const currentTokens = parseAnswerTokens(answers[q.id] || '', q.options || []);
    const exists = currentTokens.includes(opt);
    const nextTokens = exists
      ? currentTokens.filter((t) => t !== opt)
      : [...currentTokens, opt];
    setAnswers((prev) => ({ ...prev, [q.id]: nextTokens.join(', ') }));
  };

  const handleSaveAndNext = () => {
    if (!currentQuestion) return;
    const hasAns = Boolean((answers[currentQuestion.id] || '').trim());
    const nextStatus: NtaQuestionStatus = hasAns ? 'ANSWERED' : 'NOT_ANSWERED';
    setStatuses((prev) => ({ ...prev, [currentQuestion.id]: nextStatus }));
    const { ansCount, sc } = computeLiveScore(answers);
    void syncDuelProgress(ansCount, sc);
    if (currentIdx < questions.length - 1) goToQuestion(currentIdx + 1);
  };

  const handleSaveAndMarkReview = () => {
    if (!currentQuestion) return;
    const hasAns = Boolean((answers[currentQuestion.id] || '').trim());
    const nextStatus: NtaQuestionStatus = hasAns ? 'ANSWERED_MARKED_REVIEW' : 'MARKED_REVIEW';
    setStatuses((prev) => ({ ...prev, [currentQuestion.id]: nextStatus }));
    const { ansCount, sc } = computeLiveScore(answers);
    void syncDuelProgress(ansCount, sc);
    if (currentIdx < questions.length - 1) goToQuestion(currentIdx + 1);
  };

  const handleMarkForReviewAndNext = () => {
    if (!currentQuestion) return;
    const hasAns = Boolean((answers[currentQuestion.id] || '').trim());
    const nextStatus: NtaQuestionStatus = hasAns ? 'ANSWERED_MARKED_REVIEW' : 'MARKED_REVIEW';
    setStatuses((prev) => ({ ...prev, [currentQuestion.id]: nextStatus }));
    if (currentIdx < questions.length - 1) goToQuestion(currentIdx + 1);
  };

  const handleClearResponse = () => {
    if (!currentQuestion) return;
    setSectionCapNotice(null);
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[currentQuestion.id];
      return next;
    });
    setStatuses((prev) => ({ ...prev, [currentQuestion.id]: 'NOT_ANSWERED' }));
  };

  const getStatusClass = (st: NtaQuestionStatus, isCurrent: boolean) => {
    const ring = isCurrent ? 'ring-2 ring-offset-2 ring-indigo-500' : '';
    switch (st) {
      case 'ANSWERED':
        return `bg-emerald-600 text-white border-emerald-600 ${ring}`;
      case 'NOT_ANSWERED':
        return `bg-rose-600 text-white border-rose-600 ${ring}`;
      case 'MARKED_REVIEW':
        return `bg-violet-600 text-white border-violet-600 rounded-full ${ring}`;
      case 'ANSWERED_MARKED_REVIEW':
        return `bg-violet-600 text-white border-emerald-400 ring-2 ring-emerald-400 rounded-full ${ring}`;
      default:
        return `bg-slate-600/20 border-slate-500/40 ${ring}`;
    }
  };

  const aiQuestionsInTest = useMemo(
    () => questions.filter((q) => q.bankId === 'ai-generated' || q.id.startsWith('ai_')),
    [questions]
  );

  const handleSaveAiPack = async () => {
    if (!onSaveAiQuestionsToVault || aiQuestionsInTest.length === 0 || savingAiVault) return;
    setSavingAiVault(true);
    try {
      const res = await onSaveAiQuestionsToVault(aiQuestionsInTest);
      setAiVaultSavedMsg(`Saved ${res.count} AI questions into your PYQ Vault!`);
    } catch {
      setAiVaultSavedMsg('Could not save questions to Vault right now.');
    } finally {
      setSavingAiVault(false);
    }
  };

  const handleSaveQuestionToAiBank = async (q: PyqQuestion) => {
    if (savingBankQId || savedBankIds.has(q.id)) return;
    setSavingBankQId(q.id);
    try {
      const bankRef = doc(collection(db, 'savedAiQuestions'));
      await setDoc(bankRef, {
        ownerId: userId,
        ...(config.paperId ? { paperId: config.paperId } : {}),
        examTarget: config.examTarget || config.exam,
        classLevel: q.classLevel || '12',
        subject: q.subject,
        topic: (q.topic || 'General').slice(0, 120),
        questionType: q.questionType || 'MCQ',
        aiFormat:
          q.aiFormat ||
          (q.questionType === 'MULTI_MCQ'
            ? 'MULTI_MCQ'
            : q.questionType === 'NUMERICAL'
              ? 'NUMERICAL'
              : 'MCQ'),
        difficulty: q.difficulty || 'MEDIUM',
        prompt: q.prompt.slice(0, 3900),
        options: Array.isArray(q.options) ? q.options.slice(0, 6) : [],
        correctAnswer: q.correctAnswer.slice(0, 200),
        ...(q.solution ? { solution: q.solution.slice(0, 3900) } : {}),
        ...(q.hint ? { hint: q.hint.slice(0, 800) } : {}),
        ...(q.passage ? { passage: q.passage.slice(0, 1800) } : {}),
        ...(q.assertionText ? { assertionText: q.assertionText.slice(0, 800) } : {}),
        ...(q.reasonText ? { reasonText: q.reasonText.slice(0, 800) } : {}),
        ...(Array.isArray(q.matchLeft) && q.matchLeft.length > 0
          ? { matchLeft: q.matchLeft.slice(0, 6) }
          : {}),
        ...(Array.isArray(q.matchRight) && q.matchRight.length > 0
          ? { matchRight: q.matchRight.slice(0, 6) }
          : {}),
        ...(Array.isArray(q.statements) && q.statements.length > 0
          ? { statements: q.statements.slice(0, 4) }
          : {}),
        requiresDiagram: Boolean(q.requiresDiagram || q.diagramSvg),
        ...(q.diagramCategory ? { diagramCategory: q.diagramCategory.slice(0, 60) } : {}),
        ...(q.diagramTitle ? { diagramTitle: q.diagramTitle.slice(0, 120) } : {}),
        ...(q.diagramCaption ? { diagramCaption: q.diagramCaption.slice(0, 240) } : {}),
        ...(q.diagramPlacement ? { diagramPlacement: q.diagramPlacement } : {}),
        ...(q.diagramSvg ? { diagramSvg: q.diagramSvg.slice(0, 18000) } : {}),
        createdAt: serverTimestamp(),
      });
      setSavedBankIds((prev) => new Set(prev).add(q.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'savedAiQuestions');
    } finally {
      setSavingBankQId(null);
    }
  };

  const handleRegenerateResultQuestion = async (
    q: PyqQuestion,
    qIdx: number,
    mode: 'REPLACE' | 'HARDER' | 'SIMILAR'
  ) => {
    if (regeneratingQId) return;
    setRegeneratingQId(q.id);
    setRegenStatusMsg(null);
    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) throw new Error('Please sign in again to regenerate questions.');

      const res = await postApiJson<{ question: PyqQuestion }>(
        '/api/tests/regenerate-question',
        {
          mode,
          sourceQuestion: {
            subject: q.subject,
            topic: q.topic,
            classLevel: q.classLevel,
            aiFormat:
              q.aiFormat ||
              (q.questionType === 'MULTI_MCQ'
                ? 'MULTI_MCQ'
                : q.questionType === 'NUMERICAL'
                  ? 'NUMERICAL'
                  : 'MCQ'),
            difficulty: q.difficulty || 'MEDIUM',
            prompt: q.prompt,
            requiresDiagram: Boolean(q.requiresDiagram || q.diagramSvg),
          },
          examTarget: config.examTarget || config.exam,
          customExamName: config.customExamName,
          includeSolutions: true,
          includeHints: true,
          avoidPrompts: questions.map((item) => item.prompt.slice(0, 70)),
        },
        token
      );

      setQuestions((prev) => {
        const next = [...prev];
        if (mode === 'SIMILAR') {
          next.splice(qIdx + 1, 0, res.question);
        } else {
          next[qIdx] = res.question;
        }
        return next;
      });
      setRevealedSolutions((prev) => ({ ...prev, [res.question.id]: true }));
      setRegenStatusMsg(
        mode === 'SIMILAR'
          ? `Added a fresh similar practice question right below Q${qIdx + 1}.`
          : mode === 'HARDER'
            ? `Upgraded Q${qIdx + 1} with a harder conceptual problem.`
            : `Regenerated Q${qIdx + 1} with a new variation.`
      );
    } catch (err) {
      setRegenStatusMsg(err instanceof Error ? err.message : 'Unable to regenerate question.');
    } finally {
      setRegeneratingQId(null);
    }
  };

  // PHASE 3: Results View
  if (submittedResult) {
    const { attempt, xpEarned, submissionReason, submissionMessage, eventsSnapshot } = submittedResult;
    const standing = estimateExamStanding(
      attempt.exam,
      attempt.score,
      attempt.maxScore,
      attempt.accuracyPercent
    );
    const resultsList = attempt.questionResults || [];
    const attemptedTotal = attempt.attemptedCount ?? (attempt.correctCount + (attempt.incorrectCount || 0));
    const skippedCount = Math.max(0, attempt.totalQuestions - attemptedTotal);

    const topicMap = new Map<
      string,
      { topic: string; subject: string; total: number; correct: number; incorrect: number; skipped: number; timeSec: number }
    >();
    const diffMap = new Map<string, { label: string; total: number; correct: number; attempted: number }>();

    questions.forEach((q, idx) => {
      const r = resultsList[idx];
      if (!r) return;
      const tKey = `${q.subject}::${q.topic}`;
      const tCur = topicMap.get(tKey) || {
        topic: q.topic || 'General',
        subject: q.subject,
        total: 0,
        correct: 0,
        incorrect: 0,
        skipped: 0,
        timeSec: 0,
      };
      tCur.total += 1;
      if (r.isAttempted) {
        if (r.isCorrect) tCur.correct += 1;
        else tCur.incorrect += 1;
      } else {
        tCur.skipped += 1;
      }
      tCur.timeSec += r.timeSpentSeconds || 0;
      topicMap.set(tKey, tCur);

      const dKey = q.difficulty || 'MEDIUM';
      const dCur = diffMap.get(dKey) || { label: dKey, total: 0, correct: 0, attempted: 0 };
      dCur.total += 1;
      if (r.isAttempted) dCur.attempted += 1;
      if (r.isCorrect) dCur.correct += 1;
      diffMap.set(dKey, dCur);
    });

    const topicBreakdown = Array.from(topicMap.values()).sort(
      (a, b) => a.correct / Math.max(1, a.total) - b.correct / Math.max(1, b.total)
    );
    const weakTopics = topicBreakdown.filter((t) => t.incorrect > 0 || t.correct / Math.max(1, t.total) < 0.6);

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 sm:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Submission Reason Notification Banner */}
          {submissionReason !== 'MANUAL' && (
            <div
              className={`rounded-2xl border p-4 sm:p-5 flex items-start gap-3 ${
                submissionReason === 'TIMER_EXPIRED'
                  ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                  : 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200'
              }`}
            >
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs sm:text-sm">
                <div className="font-bold">Automatic Examination Submission</div>
                <p>{submissionMessage}</p>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1">
                {examDisplayLabel} ·{' '}
                {attempt.testMode === 'BOOSTER'
                  ? 'Weak-Topic Booster'
                  : attempt.testMode === 'AI_GENERATOR'
                    ? 'AI Smart Question Paper'
                    : attempt.testMode}{' '}
                Completed · +{xpEarned} XP Earned
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold font-display">{attempt.title}</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Time taken:{' '}
                <span className="font-mono tabular-nums">{formatClock(attempt.timeSpentSeconds)}</span>
                {' · '}
                Unattempted: <span className="font-mono tabular-nums">{skippedCount}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => exportAttemptReportPdf(attempt, questions)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs sm:text-sm font-semibold cursor-pointer"
              >
                <Download className="w-4 h-4 text-indigo-500" />
                <span>Scorecard PDF</span>
              </button>
              {onPracticeWeakTopics && weakTopics.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const topWeak = weakTopics[0];
                    const cls = config.classLevel === '11' || config.classLevel === '12' ? config.classLevel : '12';
                    stopCameraStream();
                    onPracticeWeakTopics({
                      exam: config.exam,
                      subject: topWeak.subject as PyqQuestion['subject'],
                      classLevel: cls,
                      chapter: topWeak.topic,
                    });
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs sm:text-sm font-bold cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Generate AI Practice on Weak Topics</span>
                </button>
              )}
              {aiQuestionsInTest.length > 0 && onSaveAiQuestionsToVault && (
                <button
                  type="button"
                  disabled={savingAiVault || Boolean(aiVaultSavedMsg)}
                  onClick={() => void handleSaveAiPack()}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs sm:text-sm font-semibold cursor-pointer disabled:opacity-60"
                >
                  <FolderPlus className="w-4 h-4" />
                  <span>
                    {savingAiVault
                      ? 'Saving...'
                      : aiVaultSavedMsg
                        ? 'Saved to Vault'
                        : `Save ${aiQuestionsInTest.length} AI Qs`}
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  stopCameraStream();
                  onExit();
                }}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                Return to Dashboard
              </button>
            </div>
          </div>

          {aiVaultSavedMsg && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 px-4 py-2.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              {aiVaultSavedMsg}
            </div>
          )}

          {regenStatusMsg && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30 px-4 py-2.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
              {regenStatusMsg}
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Final Score</div>
              <div className="text-2xl font-bold font-mono tabular-nums mt-1">
                {attempt.score}{' '}
                <span className="text-sm font-normal text-slate-400">/ {attempt.maxScore}</span>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Accuracy</div>
              <div className="text-2xl font-bold font-mono tabular-nums mt-1 text-emerald-600 dark:text-emerald-400">
                {attempt.accuracyPercent}%
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Correct Answers</div>
              <div className="text-2xl font-bold font-mono tabular-nums mt-1">
                {attempt.correctCount}{' '}
                <span className="text-sm font-normal text-slate-400">
                  / {attempt.totalQuestions}
                </span>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Incorrect ({markIncorrect} MCQ)
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums mt-1 text-rose-600 dark:text-rose-400">
                {attempt.incorrectCount || 0}
              </div>
            </div>
            <div className="col-span-2 lg:col-span-1 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/50 rounded-2xl p-5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                <Trophy className="w-3.5 h-3.5" />
                {standing.primaryMetricLabel}
              </div>
              <div className="text-base font-bold font-mono tabular-nums mt-1 text-indigo-900 dark:text-white">
                {standing.primaryMetricValue}
              </div>
              <div className="text-[11px] text-indigo-600 dark:text-indigo-400 mt-0.5">
                {standing.bandLabel}
              </div>
            </div>
          </div>

          {/* Topic-wise & Difficulty-wise Performance Breakdown */}
          {topicBreakdown.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold font-display">Chapter &amp; Topic Breakdown</h2>
                  <span className="text-[11px] font-mono text-slate-500">
                    {topicBreakdown.length} topic(s)
                  </span>
                </div>
                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {topicBreakdown.map((t) => {
                    const acc = Math.round((t.correct / Math.max(1, t.total)) * 100);
                    return (
                      <div key={`${t.subject}-${t.topic}`} className="space-y-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold truncate">
                            {t.topic} <span className="text-slate-400 font-normal">({t.subject})</span>
                          </span>
                          <span className="font-mono tabular-nums shrink-0 text-[11px]">
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">{t.correct}✓</span> ·{' '}
                            <span className="text-rose-600 dark:text-rose-400">{t.incorrect}✗</span> ·{' '}
                            <span className="text-slate-500">{t.skipped}–</span> ({acc}%)
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              acc >= 75 ? 'bg-emerald-500' : acc >= 45 ? 'bg-amber-500' : 'bg-rose-500'
                            }`}
                            style={{ width: `${acc}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
                <h2 className="text-sm font-bold font-display">Difficulty Analysis</h2>
                <div className="space-y-2.5">
                  {(['EASY', 'MEDIUM', 'HARD'] as const).map((lvl) => {
                    const entry = diffMap.get(lvl);
                    if (!entry) return null;
                    const acc = entry.attempted > 0 ? Math.round((entry.correct / entry.attempted) * 100) : 0;
                    return (
                      <div
                        key={lvl}
                        className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 text-xs flex items-center justify-between"
                      >
                        <div>
                          <div className="font-bold">{lvl}</div>
                          <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                            {entry.correct}/{entry.total} correct
                          </div>
                        </div>
                        <span className="font-mono tabular-nums font-bold text-indigo-600 dark:text-indigo-400">
                          {acc}% acc
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Proctoring Summary & Event Log Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-bold font-display">
                <ShieldCheck className="w-4 h-4 text-indigo-500" />
                <span>Proctoring Integrity &amp; Event Log</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
                <span>
                  Look-Away Warnings: {lookingAwayWarnings}/{proctoringSettings.maxLookingAwayWarnings}
                </span>
                <span>
                  Face-Missing Warnings: {faceMissingWarnings}/{proctoringSettings.maxFaceMissingWarnings}
                </span>
                <span>Full-Screen Exits: {fullscreenExitCount}</span>
                <button
                  type="button"
                  onClick={() => setShowResultEventLog((prev) => !prev)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 font-sans font-semibold cursor-pointer"
                >
                  <span>{showResultEventLog ? 'Hide Log' : `View Events (${eventsSnapshot.length})`}</span>
                  {showResultEventLog ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {showResultEventLog && (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pt-2 border-t border-slate-100 dark:border-slate-800">
                {eventsSnapshot.map((ev, idx) => (
                  <div
                    key={`${ev.timestamp}-${idx}`}
                    className="flex items-center justify-between gap-3 text-xs p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50"
                  >
                    <div className="min-w-0">
                      <span className="font-mono font-bold text-[10px] text-indigo-600 dark:text-indigo-400 mr-2">
                        [{ev.type}]
                      </span>
                      <span>{ev.message}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">
                      {new Date(ev.timestamp).toLocaleTimeString('en-IN')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {duelData && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
              <div className="flex items-center gap-2 font-bold text-base mb-4">
                <Swords className="w-5 h-5 text-amber-500" />
                <span>Live Duel Standings ({duelData.duelCode})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Host</div>
                  <div className="font-semibold">{duelData.hostName}</div>
                  <div className="font-mono tabular-nums text-lg font-bold mt-1">
                    {duelData.hostScore} pts ·{' '}
                    {duelData.hostFinished
                      ? 'Finished'
                      : `${duelData.hostProgress}/${duelData.questionCount} answered`}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Challenger</div>
                  <div className="font-semibold">
                    {duelData.guestName || 'Waiting for challenger...'}
                  </div>
                  <div className="font-mono tabular-nums text-lg font-bold mt-1">
                    {duelData.guestScore} pts ·{' '}
                    {duelData.guestFinished
                      ? 'Finished'
                      : `${duelData.guestProgress}/${duelData.questionCount} answered`}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold font-display">Detailed Question &amp; Solution Review</h2>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {questions.map((q, idx) => {
                const res = attempt.questionResults?.find((item) => item.questionId === q.id);
                const isSaved = bookmarkedIds.has(q.id);
                const isSavedToBank = savedBankIds.has(q.id);
                const isAiQ = q.bankId === 'ai-generated' || q.id.startsWith('ai_');
                const showSol =
                  config.includeSolutions !== false || Boolean(revealedSolutions[q.id]);

                return (
                  <div key={q.id} className="py-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                          Q{idx + 1}
                        </span>
                        <span>·</span>
                        <span>{q.subject}</span>
                        <span>·</span>
                        <span>{q.topic}</span>
                        <span>·</span>
                        <span>
                          {q.aiFormat
                            ? AI_QUESTION_FORMAT_LABELS[q.aiFormat]
                            : q.questionType === 'MULTI_MCQ'
                              ? 'Multiple Correct'
                              : q.questionType}
                        </span>
                        {res && (
                          <>
                            <span>·</span>
                            <span className="font-mono tabular-nums">{res.timeSpentSeconds ?? 0}s</span>
                            <span>·</span>
                            <span
                              className={
                                res.isCorrect
                                  ? 'text-emerald-600 font-semibold'
                                  : res.isAttempted
                                    ? 'text-rose-600 font-semibold'
                                    : ''
                              }
                            >
                              {res.isAttempted
                                ? res.isCorrect
                                  ? `Correct (+${res.marksAwarded})`
                                  : res.marksAwarded > 0
                                    ? `Partial (+${res.marksAwarded})`
                                    : `Incorrect (${res.marksAwarded})`
                                : 'Unattempted (0)'}
                            </span>
                          </>
                        )}
                        {!res && isAiQ && (
                          <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                            · Fresh AI Practice Variation
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isAiQ && (
                          <>
                            <button
                              type="button"
                              disabled={Boolean(regeneratingQId)}
                              onClick={() => void handleRegenerateResultQuestion(q, idx, 'REPLACE')}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                            >
                              {regeneratingQId === q.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <RefreshCw className="w-3 h-3 text-indigo-500" />
                              )}
                              <span>Regenerate</span>
                            </button>
                            <button
                              type="button"
                              disabled={Boolean(regeneratingQId)}
                              onClick={() => void handleRegenerateResultQuestion(q, idx, 'HARDER')}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                            >
                              <span>Harder</span>
                            </button>
                            <button
                              type="button"
                              disabled={Boolean(regeneratingQId)}
                              onClick={() => void handleRegenerateResultQuestion(q, idx, 'SIMILAR')}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                            >
                              <span>Similar</span>
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          disabled={savingBankQId === q.id || isSavedToBank}
                          onClick={() => void handleSaveQuestionToAiBank(q)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                            isSavedToBank
                              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                              : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <FolderPlus className="w-3 h-3" />
                          <span>{isSavedToBank ? 'In Bank' : 'Save to Bank'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleBookmark(q)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                            isSaved
                              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300'
                              : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {isSaved ? (
                            <BookmarkCheck className="w-3.5 h-3.5" />
                          ) : (
                            <Bookmark className="w-3.5 h-3.5" />
                          )}
                          <span>{isSaved ? 'Bookmarked' : 'Bookmark'}</span>
                        </button>
                      </div>
                    </div>

                    {q.diagramPlacement === 'above' && (q.diagramSvg || q.imageUrl) && (
                      <QuestionDiagramViewer
                        diagramSvg={q.diagramSvg}
                        imageUrl={q.imageUrl}
                        title={q.diagramTitle}
                        caption={q.diagramCaption}
                        compact
                      />
                    )}

                    <div className="text-sm font-medium leading-relaxed whitespace-pre-wrap">
                      <MathText text={q.prompt} />
                    </div>

                    <QuestionStructuredBlocks question={q} />

                    {q.diagramPlacement !== 'above' && (q.diagramSvg || q.imageUrl) && (
                      <QuestionDiagramViewer
                        diagramSvg={q.diagramSvg}
                        imageUrl={q.imageUrl}
                        title={q.diagramTitle}
                        caption={q.diagramCaption}
                        compact
                      />
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 flex items-center gap-2">
                        {res?.isCorrect ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                        )}
                        <span>
                          Your Answer:{' '}
                          <strong className="font-mono">
                            <MathText text={res?.userAnswer || 'Not Attempted'} />
                          </strong>
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>
                          Correct Answer:{' '}
                          <strong className="font-mono">
                            <MathText text={q.correctAnswer} />
                          </strong>
                        </span>
                      </div>
                    </div>

                    {q.solution && (
                      showSol ? (
                        <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl leading-relaxed whitespace-pre-wrap">
                          <strong className="text-slate-900 dark:text-slate-100">Solution: </strong>
                          <MathText text={q.solution} />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setRevealedSolutions((prev) => ({ ...prev, [q.id]: true }))
                          }
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Reveal Step-by-Step Solution</span>
                        </button>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // PHASE 1: Pre-Exam Rules Agreement & Camera Permission Screen
  if (!examStarted) {
    return (
      <ExamRulesAgreement
        config={config}
        proctoringSettings={proctoringSettings}
        maxMarks={effectiveMaxMarks}
        markCorrect={markCorrect}
        markIncorrect={markIncorrect}
        cameraStatus={cameraStatus}
        cameraError={cameraError}
        cameraStream={cameraStream}
        checkedRules={checkedRules}
        onToggleRule={(ruleId) =>
          setCheckedRules((prev) => ({ ...prev, [ruleId]: !prev[ruleId] }))
        }
        onRequestCamera={requestCameraPermission}
        onStartExam={handleStartExamFromAgreement}
        onCancel={() => {
          stopCameraStream();
          onExit();
        }}
      />
    );
  }

  const totalAnswered = counts.answered + counts.answeredMarked;
  const progressPct = questions.length > 0 ? Math.round((totalAnswered / questions.length) * 100) : 0;

  // PHASE 2: Distraction-Free Full-Screen Examination Interface
  return (
    <div
      className="min-h-screen flex flex-col transition-colors duration-200"
      style={{
        backgroundColor: themeTokens.pageBg,
        color: themeTokens.textPrimary,
        fontFamily: fontCss,
        fontSize: getFontSizePx(resolvedCustom.fontSize, 'BASE'),
      }}
    >
      {/* Top Examination Header Bar */}
      <header
        className="px-3 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b sticky top-0 z-30"
        style={{
          backgroundColor: themeTokens.headerBg,
          color: themeTokens.headerText,
          borderColor: themeTokens.borderColor,
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="font-display font-extrabold text-base sm:text-lg tracking-tight text-amber-400 shrink-0">
            OBREN CBT
          </div>
          <div className="hidden md:block text-xs opacity-80 truncate max-w-xs">
            {examDisplayLabel} · {config.title}
          </div>
        </div>

        {/* Status Badges: Timer, Warnings, Camera, Fullscreen */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono tabular-nums text-xs sm:text-sm font-bold ${
              isUntimed
                ? 'bg-slate-800 text-indigo-300'
                : remainingSeconds <= 120
                  ? 'bg-rose-600 text-white'
                  : remainingSeconds <= 600
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800 text-emerald-400'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{isUntimed ? `Untimed · ${formatClock(elapsedSeconds)}` : formatClock(remainingSeconds)}</span>
          </div>

          {proctoringSettings.proctoringEnabled && (
            <>
              <div
                title="Looking-away warnings"
                className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border ${
                  lookingAwayWarnings > 0
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    : 'bg-slate-800/80 border-slate-700 text-slate-300'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>
                  Look: {lookingAwayWarnings}/{proctoringSettings.maxLookingAwayWarnings}
                </span>
              </div>

              <div
                title="Face-not-detected warnings"
                className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border ${
                  faceMissingWarnings > 0
                    ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                    : 'bg-slate-800/80 border-slate-700 text-slate-300'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>
                  Face: {faceMissingWarnings}/{proctoringSettings.maxFaceMissingWarnings}
                </span>
              </div>
            </>
          )}

          {proctoringSettings.fullscreenMonitoringEnabled && (
            <button
              type="button"
              onClick={() => void enterFullscreen()}
              title={isFullscreen ? 'Full-Screen Active' : 'Re-enter Full-Screen'}
              className={`hidden md:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                isFullscreen
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-amber-500 text-slate-950 font-bold'
              }`}
            >
              {isFullscreen ? (
                <>
                  <Maximize2 className="w-3 h-3" />
                  <span>Full-Screen</span>
                </>
              ) : (
                <>
                  <Minimize2 className="w-3 h-3" />
                  <span>Enter Full-Screen</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowPaperView(true)}
            className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Paper</span>
          </button>

          <button
            type="button"
            onClick={() => setShowInstructions(true)}
            className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Rules</span>
          </button>

          <button
            type="button"
            onClick={() => setMobilePaletteOpen(true)}
            className="lg:hidden inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 text-xs font-medium cursor-pointer"
          >
            <LayoutGrid className="w-4 h-4" />
            <span>Palette</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSubmitModal(true)}
            className="px-3.5 py-1.5 rounded-lg text-white text-xs sm:text-sm font-semibold transition-opacity hover:opacity-90 cursor-pointer whitespace-nowrap"
            style={{ backgroundColor: accentTokens.primary }}
          >
            Submit Examination
          </button>
        </div>
      </header>

      {/* Non-blocking Full-Screen Exit Prompt */}
      {fullscreenExitNotice && !isFullscreen && proctoringSettings.fullscreenMonitoringEnabled && (
        <div className="bg-amber-500/15 border-b border-amber-500/40 px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 font-medium text-amber-500 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              You exited full-screen mode (logged {fullscreenExitCount}x). Questions stay accessible — please re-enter full-screen for focused testing.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void enterFullscreen()}
              className="px-3 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs cursor-pointer"
            >
              Re-enter Full-Screen
            </button>
            <button
              type="button"
              onClick={() => setFullscreenExitNotice(false)}
              className="p-1 opacity-70 hover:opacity-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Resumed Auto-Save Banner */}
      {resumedBanner && (
        <div
          className="px-4 sm:px-6 py-2 border-b flex flex-wrap items-center justify-between gap-3 text-xs"
          style={{
            backgroundColor: themeTokens.subtleSurfaceBg,
            borderColor: themeTokens.borderColor,
          }}
        >
          <span className="font-medium">
            Resumed your saved answers ({totalAnswered} answered, {formatClock(remainingSeconds)} left). Proctoring counters preserved.
          </span>
          <button
            type="button"
            onClick={() => setResumedBanner(false)}
            className="opacity-70 hover:opacity-100 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Live Duel Banner */}
      {duelData && (
        <div className="bg-indigo-950 text-indigo-100 px-4 sm:px-6 py-2 text-xs flex flex-wrap items-center justify-between gap-4 border-b border-indigo-900">
          <div className="flex items-center gap-2 font-semibold">
            <Swords className="w-4 h-4 text-amber-400" />
            <span>Duel Code: {duelData.duelCode}</span>
          </div>
          <div className="flex items-center gap-6 font-mono tabular-nums">
            <span>
              {duelData.hostName}: {duelData.hostProgress}/{duelData.questionCount} ({duelData.hostScore} pts)
            </span>
            <span>
              {duelData.guestName || 'Waiting...'}: {duelData.guestProgress}/{duelData.questionCount} ({duelData.guestScore} pts)
            </span>
          </div>
        </div>
      )}

      {/* Subject & Student Bar */}
      <div
        className="border-b px-4 sm:px-6 py-2 flex items-center justify-between gap-4 overflow-x-auto"
        style={{
          backgroundColor: themeTokens.surfaceBg,
          borderColor: themeTokens.borderColor,
        }}
      >
        <div className="flex items-center gap-2">
          {subjectsInTest.map((sub) => {
            const firstIdx = questions.findIndex((q) => q.subject === sub);
            const active = currentQuestion?.subject === sub;
            const subCount = questions.filter((q) => q.subject === sub).length;
            return (
              <button
                key={sub}
                type="button"
                onClick={() => goToQuestion(firstIdx)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
                style={{
                  backgroundColor: active ? accentTokens.primary : themeTokens.subtleSurfaceBg,
                  color: active ? accentTokens.textOnAccent : themeTokens.textPrimary,
                }}
              >
                {sub} ({subCount})
              </button>
            );
          })}
          {currentSubjectSectionB?.capActive && (
            <span className="ml-2 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[11px] font-semibold font-mono text-amber-500 whitespace-nowrap">
              Sec B Numerical: {currentSubjectSectionB.attemptedNumericals} / 5 max
            </span>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-2.5 text-xs shrink-0">
          <img
            src={userPhoto || '/src/assets/images/avatar_scholar_default_1795432797912.jpg'}
            alt={userName}
            referrerPolicy="no-referrer"
            className="w-6 h-6 rounded-full object-cover"
          />
          <span className="font-medium truncate max-w-[140px]">{userName}</span>
        </div>
      </div>

      {/* Main Split Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Question Viewport — NEVER hidden, blurred, or disabled */}
        <section
          className="flex-1 flex flex-col lg:border-r min-w-0"
          style={{
            backgroundColor: themeTokens.surfaceBg,
            borderColor: themeTokens.borderColor,
          }}
        >
          {currentQuestion && (
            <>
              <div
                className="px-4 sm:px-8 py-3.5 border-b flex flex-wrap items-center justify-between gap-3"
                style={{ borderColor: themeTokens.borderColor }}
              >
                <div
                  className="flex items-center gap-2 text-xs flex-wrap"
                  style={{ color: themeTokens.textSecondary }}
                >
                  <span
                    className="text-sm font-bold font-mono tabular-nums"
                    style={{ color: themeTokens.textPrimary }}
                  >
                    Question {currentIdx + 1} / {questions.length}
                  </span>
                  <span>·</span>
                  <span className="font-semibold" style={{ color: accentTokens.primary }}>
                    {currentQuestion.aiFormat
                      ? AI_QUESTION_FORMAT_LABELS[currentQuestion.aiFormat]
                      : currentQuestion.questionType === 'NUMERICAL'
                        ? 'Section B · Numerical'
                        : currentQuestion.questionType === 'MULTI_MCQ'
                          ? 'Multiple Correct MCQ'
                          : 'Section A · Single Choice'}
                  </span>
                  <span>·</span>
                  <span>Class {currentQuestion.classLevel}</span>
                  <span>·</span>
                  <span>{currentQuestion.topic}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono tabular-nums text-emerald-500 font-semibold">
                    {currentQuestion.questionType === 'MULTI_MCQ'
                      ? `+${markCorrect} / partial / -2`
                      : currentQuestion.questionType === 'MCQ'
                        ? `+${markCorrect} / ${markIncorrect}`
                        : `+${markCorrect} / 0`}
                  </span>
                  <button
                    type="button"
                    disabled={savingBankQId === currentQuestion.id || savedBankIds.has(currentQuestion.id)}
                    onClick={() => void handleSaveQuestionToAiBank(currentQuestion)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer disabled:opacity-65"
                    style={{
                      borderColor: savedBankIds.has(currentQuestion.id)
                        ? '#10b981'
                        : themeTokens.borderColor,
                      backgroundColor: savedBankIds.has(currentQuestion.id)
                        ? 'rgba(16, 185, 129, 0.14)'
                        : 'transparent',
                    }}
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>{savedBankIds.has(currentQuestion.id) ? 'Saved' : 'Save Question'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (bookmarkedIds.has(currentQuestion.id)) {
                        void onToggleBookmark(currentQuestion);
                      } else {
                        setBookmarkNote('');
                        setBookmarkNoteModal(currentQuestion);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer"
                    style={{
                      borderColor: bookmarkedIds.has(currentQuestion.id)
                        ? '#f59e0b'
                        : themeTokens.borderColor,
                      backgroundColor: bookmarkedIds.has(currentQuestion.id)
                        ? 'rgba(245, 158, 11, 0.14)'
                        : 'transparent',
                    }}
                  >
                    {bookmarkedIds.has(currentQuestion.id) ? (
                      <BookmarkCheck className="w-3.5 h-3.5 text-amber-500" />
                    ) : (
                      <Bookmark className="w-3.5 h-3.5" />
                    )}
                    <span>{bookmarkedIds.has(currentQuestion.id) ? 'Bookmarked' : 'Bookmark'}</span>
                  </button>
                </div>
              </div>

              <div
                className="flex-1 overflow-y-auto space-y-5"
                style={{ padding: densityTokens.questionPad }}
              >
                {currentQuestion.diagramPlacement === 'above' &&
                  (currentQuestion.diagramSvg || currentQuestion.imageUrl) && (
                    <div className="max-w-xl">
                      <QuestionDiagramViewer
                        diagramSvg={currentQuestion.diagramSvg}
                        imageUrl={currentQuestion.imageUrl}
                        title={currentQuestion.diagramTitle}
                        caption={currentQuestion.diagramCaption}
                      />
                    </div>
                  )}

                <div
                  className="font-medium whitespace-pre-wrap max-w-3xl"
                  style={{
                    fontSize: getFontSizePx(resolvedCustom.questionTextSize, 'QUESTION'),
                    lineHeight,
                  }}
                >
                  <MathText text={currentQuestion.prompt} />
                </div>

                <div className="max-w-3xl">
                  <QuestionStructuredBlocks question={currentQuestion} />
                </div>

                {currentQuestion.diagramPlacement !== 'above' &&
                  (currentQuestion.diagramSvg || currentQuestion.imageUrl) && (
                    <div className="max-w-xl">
                      <QuestionDiagramViewer
                        diagramSvg={currentQuestion.diagramSvg}
                        imageUrl={currentQuestion.imageUrl}
                        title={currentQuestion.diagramTitle}
                        caption={currentQuestion.diagramCaption}
                      />
                    </div>
                  )}

                {config.includeHints !== false && currentQuestion.hint && (
                  <div className="max-w-2xl">
                    <button
                      type="button"
                      onClick={() =>
                        setRevealedHints((prev) => ({
                          ...prev,
                          [currentQuestion.id]: !prev[currentQuestion.id],
                        }))
                      }
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border cursor-pointer"
                      style={{
                        borderColor: themeTokens.borderColor,
                        color: accentTokens.primary,
                      }}
                    >
                      <Lightbulb className="w-3.5 h-3.5" />
                      <span>{revealedHints[currentQuestion.id] ? 'Hide Hint' : 'Show Hint'}</span>
                    </button>
                    {revealedHints[currentQuestion.id] && (
                      <div
                        className="mt-2 p-3 rounded-xl border text-xs leading-relaxed"
                        style={{
                          borderColor: themeTokens.borderColor,
                          backgroundColor: themeTokens.subtleSurfaceBg,
                        }}
                      >
                        <MathText text={currentQuestion.hint} />
                      </div>
                    )}
                  </div>
                )}

                {sectionCapNotice && (
                  <div className="max-w-2xl rounded-xl border border-amber-400/50 bg-amber-500/15 px-4 py-3 text-xs font-medium text-amber-400 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{sectionCapNotice}</span>
                  </div>
                )}

                {currentQuestion.questionType === 'MULTI_MCQ' && currentQuestion.options ? (
                  <div
                    className="flex flex-col max-w-2xl"
                    style={{ gap: densityTokens.optionGap }}
                  >
                    <div className="text-xs font-semibold" style={{ color: accentTokens.primary }}>
                      Select one or more correct options (JEE Advanced Partial Marking)
                    </div>
                    {currentQuestion.options.map((opt, idx) => {
                      const selectedTokens = parseAnswerTokens(
                        answers[currentQuestion.id] || '',
                        currentQuestion.options || []
                      );
                      const selected = selectedTokens.includes(opt);
                      const letter = String.fromCharCode(65 + idx);
                      return (
                        <button
                          key={`${currentQuestion.id}-${idx}`}
                          type="button"
                          onClick={() => handleToggleMultiMcqOption(currentQuestion, opt)}
                          className="w-full text-left rounded-xl border transition-all flex items-start gap-3.5 cursor-pointer"
                          style={{
                            padding: densityTokens.optionPad,
                            backgroundColor: selected
                              ? themeTokens.isDark
                                ? accentTokens.softBgDark
                                : accentTokens.softBgLight
                              : themeTokens.optionBg,
                            borderColor: selected
                              ? accentTokens.primary
                              : themeTokens.borderColor,
                            color: themeTokens.textPrimary,
                            fontSize: getFontSizePx(resolvedCustom.optionTextSize, 'OPTION'),
                            lineHeight,
                          }}
                        >
                          <span
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-mono font-bold shrink-0"
                            style={{
                              backgroundColor: selected
                                ? accentTokens.primary
                                : themeTokens.subtleSurfaceBg,
                              color: selected
                                ? accentTokens.textOnAccent
                                : themeTokens.textSecondary,
                            }}
                          >
                            {selected ? '✓' : letter}
                          </span>
                          <span className="pt-0.5">
                            <MathText text={opt} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : currentQuestion.questionType === 'MCQ' && currentQuestion.options ? (
                  <div
                    className="flex flex-col max-w-2xl"
                    style={{ gap: densityTokens.optionGap }}
                  >
                    {currentQuestion.options.map((opt, idx) => {
                      const selected = answers[currentQuestion.id] === opt;
                      const letter = String.fromCharCode(65 + idx);
                      return (
                        <button
                          key={`${currentQuestion.id}-${idx}`}
                          type="button"
                          onClick={() =>
                            setAnswers((prev) => ({ ...prev, [currentQuestion.id]: opt }))
                          }
                          className="w-full text-left rounded-xl border transition-all flex items-start gap-3.5 cursor-pointer"
                          style={{
                            padding: densityTokens.optionPad,
                            backgroundColor: selected
                              ? themeTokens.isDark
                                ? accentTokens.softBgDark
                                : accentTokens.softBgLight
                              : themeTokens.optionBg,
                            borderColor: selected
                              ? accentTokens.primary
                              : themeTokens.borderColor,
                            color: themeTokens.textPrimary,
                            fontSize: getFontSizePx(resolvedCustom.optionTextSize, 'OPTION'),
                            lineHeight,
                          }}
                        >
                          <span
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-mono font-bold shrink-0"
                            style={{
                              backgroundColor: selected
                                ? accentTokens.primary
                                : themeTokens.subtleSurfaceBg,
                              color: selected
                                ? accentTokens.textOnAccent
                                : themeTokens.textSecondary,
                            }}
                          >
                            {letter}
                          </span>
                          <span className="pt-0.5">
                            <MathText text={opt} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="max-w-xs space-y-3">
                    <label
                      className="block text-xs font-semibold"
                      style={{ color: themeTokens.textSecondary }}
                    >
                      {currentQuestion.aiFormat === 'INTEGER'
                        ? 'Integer Value Answer (Whole Number)'
                        : 'Numerical Value Answer (±0.01 tolerance supported)'}
                    </label>
                    <input
                      type="text"
                      value={answers[currentQuestion.id] || ''}
                      onChange={(e) => handleSetNumericalAnswer(currentQuestion, e.target.value)}
                      placeholder="Enter numeric answer"
                      className="w-full px-4 py-3 rounded-xl border font-mono text-lg font-bold"
                      style={{
                        backgroundColor: themeTokens.subtleSurfaceBg,
                        borderColor: themeTokens.borderColor,
                        color: themeTokens.textPrimary,
                      }}
                    />
                    <div className="grid grid-cols-3 gap-2">
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '-'].map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() =>
                            handleSetNumericalAnswer(
                              currentQuestion,
                              `${answers[currentQuestion.id] || ''}${key}`
                            )
                          }
                          className="py-2.5 rounded-lg border font-mono font-bold cursor-pointer"
                          style={{
                            backgroundColor: themeTokens.subtleSurfaceBg,
                            borderColor: themeTokens.borderColor,
                            color: themeTokens.textPrimary,
                          }}
                        >
                          {key}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          handleSetNumericalAnswer(
                            currentQuestion,
                            (answers[currentQuestion.id] || '').slice(0, -1)
                          )
                        }
                        className="col-span-3 py-2 rounded-lg border text-xs font-semibold cursor-pointer"
                        style={{
                          borderColor: themeTokens.borderColor,
                          color: themeTokens.textSecondary,
                        }}
                      >
                        Backspace
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Controls + Progress Indicator */}
              <div
                className="px-4 sm:px-8 py-3.5 border-t space-y-3"
                style={{
                  backgroundColor: themeTokens.subtleSurfaceBg,
                  borderColor: themeTokens.borderColor,
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSaveAndNext}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Save &amp; Next
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAndMarkReview}
                      className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Save &amp; Mark Review
                    </button>
                    <button
                      type="button"
                      onClick={handleMarkForReviewAndNext}
                      className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Mark for Review
                    </button>
                    <button
                      type="button"
                      onClick={handleClearResponse}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs sm:text-sm font-medium cursor-pointer whitespace-nowrap"
                      style={{ borderColor: themeTokens.borderColor }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear Response</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={currentIdx === 0}
                      onClick={() => goToQuestion(currentIdx - 1)}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border disabled:opacity-40 text-xs font-semibold cursor-pointer"
                      style={{ borderColor: themeTokens.borderColor }}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Previous</span>
                    </button>
                    <button
                      type="button"
                      disabled={currentIdx === questions.length - 1}
                      onClick={() => goToQuestion(currentIdx + 1)}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border disabled:opacity-40 text-xs font-semibold cursor-pointer"
                      style={{ borderColor: themeTokens.borderColor }}
                    >
                      <span>Next</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Progress Bar Strip */}
                <div className="flex items-center justify-between gap-4 text-[11px] font-mono">
                  <div className="flex-1 flex items-center gap-3">
                    <span style={{ color: themeTokens.textSecondary }}>
                      Progress: {totalAnswered}/{questions.length} ({progressPct}%)
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-slate-700/30 overflow-hidden max-w-xs">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${progressPct}%`,
                          backgroundColor: accentTokens.primary,
                        }}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSubmitModal(true)}
                    className="hidden sm:inline-block font-sans font-bold underline cursor-pointer"
                    style={{ color: accentTokens.primary }}
                  >
                    Submit Examination
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Right Sidebar: Live Camera Preview + Question Palette */}
        <aside
          className={`${
            mobilePaletteOpen ? 'fixed inset-0 z-40 flex' : 'hidden'
          } lg:static lg:flex lg:w-88 xl:w-96 flex-col`}
          style={{ backgroundColor: themeTokens.subtleSurfaceBg }}
        >
          {mobilePaletteOpen && (
            <div
              className="fixed inset-0 bg-black/50 lg:hidden"
              onClick={() => setMobilePaletteOpen(false)}
            />
          )}
          <div
            className="relative ml-auto w-80 sm:w-96 lg:w-full h-full flex flex-col border-l z-10"
            style={{
              backgroundColor: themeTokens.surfaceBg,
              borderColor: themeTokens.borderColor,
            }}
          >
            {/* Compact Non-Intrusive Proctoring Camera Widget */}
            {proctoringSettings.proctoringEnabled && (
              <div
                className="p-3.5 border-b space-y-2"
                style={{ borderColor: themeTokens.borderColor }}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold flex items-center gap-1.5">
                    {cameraStatus === 'GRANTED' ? (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    ) : (
                      <CameraOff className="w-3.5 h-3.5 text-rose-500" />
                    )}
                    <span>AI Proctoring Camera</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowEventLogDrawer((p) => !p)}
                    className="text-[11px] font-mono underline cursor-pointer"
                    style={{ color: accentTokens.primary }}
                  >
                    Log ({proctoringEvents.length})
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-28 h-20 rounded-xl overflow-hidden bg-black border border-slate-700 shrink-0 relative flex items-center justify-center">
                    {cameraStatus === 'GRANTED' && cameraStream ? (
                      <video
                        ref={examVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full h-full object-cover scale-x-[-1]"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => void requestCameraPermission()}
                        className="text-[10px] font-bold text-amber-300 px-2 py-1 rounded bg-slate-900 cursor-pointer"
                      >
                        Reconnect Cam
                      </button>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1 text-[11px]">
                    <div
                      className={`font-semibold truncate ${
                        trackingAnalysis.state === 'FACE_MISSING'
                          ? 'text-rose-500'
                          : trackingAnalysis.state === 'LOOKING_AWAY'
                            ? 'text-amber-500'
                            : 'text-emerald-500'
                      }`}
                    >
                      {cameraStatus !== 'GRANTED'
                        ? 'Camera Disconnected'
                        : trackingAnalysis.state === 'FACE_MISSING'
                          ? `Face Missing${faceMissingElapsedSec > 0 ? ` (${faceMissingElapsedSec}s)` : ''}`
                          : trackingAnalysis.state === 'LOOKING_AWAY'
                            ? `Look at Screen${lookAwayElapsedSec > 0 ? ` (${lookAwayElapsedSec}s)` : ''}`
                            : 'Face Focused'}
                    </div>
                    <div
                      className="font-mono tabular-nums"
                      style={{ color: themeTokens.textSecondary }}
                    >
                      Look-Away: {lookingAwayWarnings}/{proctoringSettings.maxLookingAwayWarnings}
                    </div>
                    <div
                      className="font-mono tabular-nums"
                      style={{ color: themeTokens.textSecondary }}
                    >
                      Face Missing: {faceMissingWarnings}/{proctoringSettings.maxFaceMissingWarnings}
                    </div>
                  </div>
                </div>

                {showEventLogDrawer && (
                  <div
                    className="max-h-28 overflow-y-auto rounded-lg p-2 space-y-1 text-[10px] font-mono border"
                    style={{
                      backgroundColor: themeTokens.subtleSurfaceBg,
                      borderColor: themeTokens.borderColor,
                    }}
                  >
                    {proctoringEvents.slice(-8).reverse().map((ev, idx) => (
                      <div key={`${ev.timestamp}-${idx}`} className="truncate">
                        {new Date(ev.timestamp).toLocaleTimeString('en-IN')} · {ev.type}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div
              className="p-4 border-b flex items-center justify-between"
              style={{ borderColor: themeTokens.borderColor }}
            >
              <div className="font-bold text-sm font-display">Question Palette &amp; Review</div>
              <button
                type="button"
                onClick={() => setMobilePaletteOpen(false)}
                className="lg:hidden p-1.5 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 5-State NTA Legend */}
            <div
              className="p-3.5 border-b grid grid-cols-2 gap-2 text-xs"
              style={{ borderColor: themeTokens.borderColor }}
            >
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-emerald-600 text-white font-mono font-bold flex items-center justify-center tabular-nums shrink-0 text-[11px]">
                  {counts.answered}
                </span>
                <span>Answered</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-rose-600 text-white font-mono font-bold flex items-center justify-center tabular-nums shrink-0 text-[11px]">
                  {counts.notAnswered}
                </span>
                <span>Unanswered</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-slate-500/30 font-mono font-bold flex items-center justify-center tabular-nums shrink-0 text-[11px]">
                  {counts.notVisited}
                </span>
                <span>Not Visited</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-violet-600 text-white font-mono font-bold flex items-center justify-center tabular-nums shrink-0 text-[11px]">
                  {counts.marked}
                </span>
                <span>Marked Review</span>
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-violet-600 ring-2 ring-emerald-400 text-white font-mono font-bold flex items-center justify-center tabular-nums shrink-0 text-[11px]">
                  {counts.answeredMarked}
                </span>
                <span>Answered &amp; Marked for Review</span>
              </div>
            </div>

            {/* Palette Grid */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-5 gap-2">
                {questions.map((q, idx) => {
                  const st = statuses[q.id] || 'NOT_VISITED';
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => goToQuestion(idx)}
                      className={`h-9 rounded-lg border text-xs font-mono font-bold tabular-nums transition-transform active:scale-95 cursor-pointer ${getStatusClass(
                        st,
                        idx === currentIdx
                      )}`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              className="p-3.5 border-t space-y-1.5 text-xs"
              style={{ borderColor: themeTokens.borderColor }}
            >
              <div className="flex justify-between font-mono tabular-nums">
                <span style={{ color: themeTokens.textSecondary }}>Attempted</span>
                <span className="font-bold">
                  {totalAnswered} / {questions.length}
                </span>
              </div>
              <div className="flex justify-between font-mono tabular-nums">
                <span style={{ color: themeTokens.textSecondary }}>Bookmarked</span>
                <span className="font-bold text-amber-500">
                  {questions.filter((q) => bookmarkedIds.has(q.id)).length}
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Small Non-Blocking Proctoring Warning Toast (Never hides or blurs questions) */}
      {activeToast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-4 right-4 z-40 max-w-sm rounded-2xl border p-4 shadow-2xl flex items-start gap-3 ${
            activeToast.tone === 'rose'
              ? 'bg-rose-950/95 border-rose-500/60 text-rose-100'
              : activeToast.tone === 'amber'
                ? 'bg-amber-950/95 border-amber-500/60 text-amber-100'
                : 'bg-slate-900/95 border-indigo-500/60 text-slate-100'
          }`}
        >
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
          <div className="flex-1 text-xs space-y-1">
            <div className="font-bold">{activeToast.title}</div>
            <div className="opacity-90 leading-snug">{activeToast.message}</div>
          </div>
          <button
            type="button"
            onClick={() => setActiveToast(null)}
            className="opacity-70 hover:opacity-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Submit Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
            <h3 className="text-xl font-bold font-display">Submit Examination?</h3>
            <div className="grid grid-cols-2 gap-3 text-xs font-mono tabular-nums">
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30">
                <div className="text-slate-500 dark:text-slate-400">Answered</div>
                <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  {totalAnswered}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30">
                <div className="text-slate-500 dark:text-slate-400">Unanswered</div>
                <div className="text-lg font-bold text-rose-600 dark:text-rose-400">
                  {counts.notAnswered + counts.notVisited + counts.marked}
                </div>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Questions marked as Answered &amp; Marked for Review are included in final evaluation.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium cursor-pointer"
              >
                Resume Test
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void finalizeSubmission('MANUAL')}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer"
              >
                {submitting ? 'Evaluating...' : 'Confirm & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bookmark Note Modal */}
      {bookmarkNoteModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold font-display">Bookmark Question for Revision</h3>
            <textarea
              rows={3}
              maxLength={800}
              value={bookmarkNote}
              onChange={(e) => setBookmarkNote(e.target.value)}
              placeholder="Optional note (e.g. tricky integration step, sign convention error)..."
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBookmarkNoteModal(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = bookmarkNoteModal;
                  setBookmarkNoteModal(null);
                  await onToggleBookmark(target, bookmarkNote);
                }}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-sm font-semibold cursor-pointer"
              >
                Save Bookmark
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Question Paper Modal */}
      {showPaperView && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="max-w-3xl w-full max-h-[85vh] flex flex-col bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-2xl">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold font-display">Full Question Paper View</h3>
              <button
                type="button"
                onClick={() => setShowPaperView(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-5 text-sm">
              {questions.map((q, idx) => (
                <div key={q.id} className="pb-4 border-b border-slate-100 dark:border-slate-800 space-y-2.5">
                  <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    Q{idx + 1} · {q.subject} · {q.topic} ({q.aiFormat ? AI_QUESTION_FORMAT_LABELS[q.aiFormat] : q.questionType})
                  </div>
                  <div className="whitespace-pre-wrap">
                    <MathText text={q.prompt} />
                  </div>
                  <QuestionStructuredBlocks question={q} />
                  {(q.diagramSvg || q.imageUrl) && (
                    <QuestionDiagramViewer
                      diagramSvg={q.diagramSvg}
                      imageUrl={q.imageUrl}
                      title={q.diagramTitle}
                      caption={q.diagramCaption}
                      compact
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Instructions Modal */}
      {showInstructions && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold font-display">Exam &amp; Proctoring Rules</h3>
              <button
                type="button"
                onClick={() => setShowInstructions(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <ul className="list-disc pl-5 space-y-2 text-slate-600 dark:text-slate-300 text-xs sm:text-sm">
              <li>
                Single-choice MCQs award +{markCorrect} marks for correct answers and {markIncorrect} for incorrect answers.
              </li>
              <li>
                Numerical questions award +{markCorrect} marks with ±0.01 numeric tolerance and 0 negative marking.
              </li>
              <li>
                Multiple-Correct (JEE Adv) questions award +{markCorrect} for all correct options, +1 partial credit per correct option with zero wrong picks, and -2 if any wrong option is chosen.
              </li>
              <li>
                Looking away continuously for {proctoringSettings.lookingAwayThresholdSeconds}s issues a warning (auto-submit after {proctoringSettings.maxLookingAwayWarnings}).
              </li>
              <li>
                Face absent continuously for {proctoringSettings.faceMissingThresholdSeconds}s issues a warning (auto-submit after {proctoringSettings.maxFaceMissingWarnings}).
              </li>
              <li>
                Progress is auto-saved locally and proctoring warning counts persist in Firestore.
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
