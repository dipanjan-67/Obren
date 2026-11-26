import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Calendar,
  Clock,
  Flame,
  GraduationCap,
  Loader2,
  LogOut,
  Moon,
  Palette,
  Play,
  Search,
  Sparkles,
  Sun,
  Timer,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { AuthScreen } from './components/AuthScreen';
import { AIChatWidget } from './components/AIChatWidget';
import { DailyChallengeCard } from './components/DailyChallengeCard';
import { DailyGoalTracker } from './components/DailyGoalTracker';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Navigation, type ActiveTab } from './components/Navigation';
import { OfflineIndicator, PWAInstallButton } from './components/PwaControls';
import { TeacherDashboard } from './components/TeacherDashboard';
import { InWebsiteClassroom } from './components/InWebsiteClassroom';
import { TeacherOnlineExamRunner } from './components/TeacherOnlineExamRunner';
import { StudentClassroomView } from './components/StudentClassroomView';
import { StudentAssignedTestsView } from './components/StudentAssignedTestsView';
import { NotificationBell } from './components/NotificationBell';
import { getCurrentTeacher, clearTeacherSession, endLiveClass, type TeacherUser } from './lib/teacherClient';
import type { LiveClassRecord, TeacherTest } from '../server/teacherRoutes';

const Achievements = lazy(() =>
  import('./components/Achievements').then((m) => ({ default: m.Achievements }))
);
const AdminAiView = lazy(() =>
  import('./components/AdminAiView').then((m) => ({ default: m.AdminAiView }))
);
const AdminProctoringView = lazy(() =>
  import('./components/AdminProctoringView').then((m) => ({ default: m.AdminProctoringView }))
);
const AnalyticsBookmarksView = lazy(() =>
  import('./components/AnalyticsBookmarksView').then((m) => ({ default: m.AnalyticsBookmarksView }))
);
const AnalyticsView = lazy(() =>
  import('./components/AnalyticsView').then((m) => ({ default: m.AnalyticsView }))
);
const CurriculumRoadmap = lazy(() =>
  import('./components/CurriculumRoadmap').then((m) => ({ default: m.CurriculumRoadmap }))
);
const DashboardView = lazy(() =>
  import('./components/DashboardView').then((m) => ({ default: m.DashboardView }))
);
const ExamCustomizationPanel = lazy(() =>
  import('./components/ExamCustomizationPanel').then((m) => ({ default: m.ExamCustomizationPanel }))
);
const FormulaBankView = lazy(() =>
  import('./components/FormulaBankView').then((m) => ({ default: m.FormulaBankView }))
);
const GlobalSearchModal = lazy(() =>
  import('./components/GlobalSearchModal').then((m) => ({ default: m.GlobalSearchModal }))
);
const NotesView = lazy(() =>
  import('./components/NotesView').then((m) => ({ default: m.NotesView }))
);
const NtaExamInterface = lazy(() =>
  import('./components/NtaExamInterface').then((m) => ({ default: m.NtaExamInterface }))
);
const PlannerTimerView = lazy(() =>
  import('./components/PlannerTimerView').then((m) => ({ default: m.PlannerTimerView }))
);
const PyqVaultView = lazy(() =>
  import('./components/PyqVaultView').then((m) => ({ default: m.PyqVaultView }))
);
const SettingsCalendarView = lazy(() =>
  import('./components/SettingsCalendarView').then((m) => ({ default: m.SettingsCalendarView }))
);
const SocialArenaView = lazy(() =>
  import('./components/SocialArenaView').then((m) => ({ default: m.SocialArenaView }))
);
const StopwatchView = lazy(() =>
  import('./components/StopwatchView').then((m) => ({ default: m.StopwatchView }))
);
const StudyTasksView = lazy(() =>
  import('./components/StudyTasksView').then((m) => ({ default: m.StudyTasksView }))
);
const TeacherAttendanceView = lazy(() =>
  import('./components/TeacherAttendanceView').then((m) => ({ default: m.TeacherAttendanceView }))
);
const TestLauncherView = lazy(() =>
  import('./components/TestLauncherView').then((m) => ({ default: m.TestLauncherView }))
);
const TuitionPlannerView = lazy(() =>
  import('./components/TuitionPlannerView').then((m) => ({ default: m.TuitionPlannerView }))
);
const VirtualCalendarView = lazy(() =>
  import('./components/VirtualCalendarView').then((m) => ({ default: m.VirtualCalendarView }))
);
const FlashcardCentreView = lazy(() =>
  import('./components/FlashcardCentreView').then((m) => ({ default: m.FlashcardCentreView }))
);
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './lib/firebase';
import { getApiJson } from './lib/apiClient';
import {
  computeNextStreak,
  getLevelInfo,
  getTodayDateKey,
} from './lib/gamification';
import {
  cacheBookmarksOffline,
  cacheNotesOffline,
  enqueueOfflineAttempt,
  readOfflineAttemptQueue,
  removeQueuedOfflineAttempt,
} from './lib/offlineQueue';
import { seedStarterPyqPack } from './lib/starterPyqBank';
import {
  announceTuitionReminderSpeech,
  getKolkataDateKey,
  getKolkataTimeParts,
  isSessionScheduledForDate,
  useStudyTrackStore,
} from './lib/studytrackStore';
import { resolveExamCustomization } from './lib/examThemes';
import { analyzeTestsAndWeakTopics } from './lib/weakTopicAnalyzer';
import { calculateSm2 } from './lib/flashcardStore';
import type { FlashcardProgress, FlashcardRating, RevisionTestAttempt } from './types/flashcards';
import {
  DEFAULT_AI_SETTINGS,
  DEFAULT_PROCTORING_SETTINGS,
  EXAM_LABELS,
  type ActiveTestConfig,
  type AiGenerationLog,
  type AiProviderStatus,
  type AiSettings,
  type BookmarkItem,
  type DailyGoalLog,
  type ExamCustomization,
  type ExamType,
  type GeneratedPaper,
  type MasteryStatus,
  type MistakeLogItem,
  type MistakeReasonTag,
  type PlannerTask,
  type ProctoringSettings,
  type PyqBank,
  type PyqQuestion,
  type RequestedCustomPractice,
  type SavedAiQuestion,
  type StudyFolder,
  type StudyNote,
  type StudySession,
  type TargetClass,
  type TestAttempt,
  type TestMode,
  type UserProfile,
} from './types/obren';

const ADMIN_EMAILS = ['dipanjanoriginal69@gmail.com', 'dipanjannath890@gmail.com'];

function getMillis(val: unknown): number {
  return (val as { toMillis?: () => number })?.toMillis?.() || 0;
}

const ViewLoadingFallback: React.FC<{ label?: string }> = ({ label = 'Loading module...' }) => (
  <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
    <Loader2 className="w-6 h-6 animate-spin text-indigo-600 dark:text-indigo-400" />
    <span className="text-xs font-mono">{label}</span>
  </div>
);

function MainApp() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('obren_dark_mode');
    if (saved !== null) return saved === 'true';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('obren_dark_mode', String(darkMode));
  }, [darkMode]);

  // Auth & Profile State
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Navigation & UI State
  const [activeTab, setActiveTab] = useState<ActiveTab>('OBREN_DASHBOARD');
  const [requestedTestMode, setRequestedTestMode] = useState<TestMode | undefined>(undefined);
  const [requestedCustomPractice, setRequestedCustomPractice] =
    useState<RequestedCustomPractice | null>(null);
  const [arenaInitialSubTab, setArenaInitialSubTab] = useState<
    'GROUPS' | 'DUELS' | 'LEADERBOARD' | undefined
  >(undefined);
  const [activeTest, setActiveTest] = useState<ActiveTestConfig | null>(null);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [preselectedTaskId, setPreselectedTaskId] = useState<string>('');
  const [preselectedTuitionDate, setPreselectedTuitionDate] = useState<string | null>(null);

  // Teacher & Classroom State
  const [currentTeacher, setCurrentTeacher] = useState<TeacherUser | null>(() => getCurrentTeacher());
  const [activeClassroom, setActiveClassroom] = useState<LiveClassRecord | null>(null);
  const [activeAssignedExam, setActiveAssignedExam] = useState<{
    test: TeacherTest;
    attemptId: string;
    serverExpiresAt: number;
    initialAnswers?: Record<string, any>;
  } | null>(null);

  // Profile modal draft settings
  const [editExam, setEditExam] = useState<ExamType>('JEE_MAINS');
  const [editClass, setEditClass] = useState<TargetClass>('12');
  const [editDailyGoal, setEditDailyGoal] = useState<number>(180);
  const [savingProfile, setSavingProfile] = useState(false);

  // OBREN Firestore Data Collections
  const [banks, setBanks] = useState<PyqBank[]>([]);
  const [questions, setQuestions] = useState<PyqQuestion[]>([]);
  const [attempts, setAttempts] = useState<TestAttempt[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [plannerTasks, setPlannerTasks] = useState<PlannerTask[]>([]);
  const [studySessions, setStudySessions] = useState<StudySession[]>([]);
  const [studyFolders, setStudyFolders] = useState<StudyFolder[]>([]);
  const [studyNotes, setStudyNotes] = useState<StudyNote[]>([]);
  const [mistakeLogs, setMistakeLogs] = useState<MistakeLogItem[]>([]);
  const [dailyGoalLogs, setDailyGoalLogs] = useState<DailyGoalLog[]>([]);
  const [proctoringSettings, setProctoringSettings] = useState<ProctoringSettings>(
    DEFAULT_PROCTORING_SETTINGS
  );
  const [aiSettings, setAiSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [aiProviders, setAiProviders] = useState<AiProviderStatus[]>([]);
  const [generatedPapers, setGeneratedPapers] = useState<GeneratedPaper[]>([]);
  const [savedAiQuestions, setSavedAiQuestions] = useState<SavedAiQuestion[]>([]);
  const [aiGenerationLogs, setAiGenerationLogs] = useState<AiGenerationLog[]>([]);
  const [hasAdminDoc, setHasAdminDoc] = useState<boolean>(false);

  // Offline queue state
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [queuedAttemptsCount, setQueuedAttemptsCount] = useState<number>(0);
  const [syncingQueue, setSyncingQueue] = useState<boolean>(false);

  // Keyboard shortcut Cmd/Ctrl + K for Global Search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchModalOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Online / Offline listeners
  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthInitialized(true);
      if (!user) {
        setProfile(null);
        setProfileLoaded(false);
      }
    });
    return () => unsub();
  }, []);

  const uid = firebaseUser?.uid || null;
  const isVerified = Boolean(firebaseUser?.emailVerified);
  const isAdmin = Boolean(
    isVerified &&
      ((firebaseUser?.email && ADMIN_EMAILS.includes(firebaseUser.email.toLowerCase())) ||
        hasAdminDoc ||
        profile?.role === 'ADMIN')
  );

  // Check optional admins/{uid} lookup doc for RBAC
  useEffect(() => {
    if (!uid || !isVerified) {
      setHasAdminDoc(false);
      return;
    }
    let cancelled = false;
    getDoc(doc(db, 'admins', uid))
      .then((snap) => {
        if (!cancelled) setHasAdminDoc(snap.exists());
      })
      .catch(() => {
        if (!cancelled) setHasAdminDoc(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid, isVerified]);

  // User Profile & Public Profile sync listener
  useEffect(() => {
    if (!uid || !isVerified) {
      setProfile(null);
      setProfileLoaded(true);
      return;
    }

    setProfileLoaded(false);
    const unsub = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) {
          const p = snap.data() as UserProfile;
          setProfile(p);
          setEditExam(p.targetExam);
          setEditClass(p.targetClass);
          setEditDailyGoal(p.dailyStudyGoalMins || 180);
        } else {
          setProfile(null);
        }
        setProfileLoaded(true);
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}`)
    );

    return () => unsub();
  }, [uid, isVerified]);

  const isLoadingGate = !authInitialized || (Boolean(firebaseUser) && isVerified && !profileLoaded);
  useEffect(() => {
    if (!isLoadingGate) {
      setLoadingTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setLoadingTimedOut(true), 7000);
    return () => clearTimeout(timer);
  }, [isLoadingGate]);

  // All OBREN Firestore real-time listeners
  useEffect(() => {
    if (!uid || !isVerified || !profile) {
      setBanks([]);
      setQuestions([]);
      setAttempts([]);
      setBookmarks([]);
      setPlannerTasks([]);
      setStudySessions([]);
      setStudyFolders([]);
      setStudyNotes([]);
      setMistakeLogs([]);
      setDailyGoalLogs([]);
      setProctoringSettings(DEFAULT_PROCTORING_SETTINGS);
      setAiSettings(DEFAULT_AI_SETTINGS);
      setGeneratedPapers([]);
      setSavedAiQuestions([]);
      setAiGenerationLogs([]);
      return;
    }

    // 1. PYQ Banks (Own + Public)
    const ownBanksMap = new Map<string, PyqBank>();
    const pubBanksMap = new Map<string, PyqBank>();
    const syncBanks = () => {
      const merged = new Map<string, PyqBank>([...pubBanksMap, ...ownBanksMap]);
      const list = Array.from(merged.values()).sort(
        (a, b) => getMillis(b.createdAt) - getMillis(a.createdAt)
      );
      setBanks(list);
    };

    const unsubOwnBanks = onSnapshot(
      query(collection(db, 'pyqBanks'), where('ownerId', '==', uid)),
      (snap) => {
        ownBanksMap.clear();
        snap.docs.forEach((d) =>
          ownBanksMap.set(d.id, { id: d.id, ...(d.data() as Omit<PyqBank, 'id'>) })
        );
        syncBanks();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'pyqBanks')
    );

    const unsubPubBanks = onSnapshot(
      query(collection(db, 'pyqBanks'), where('visibility', '==', 'PUBLIC')),
      (snap) => {
        pubBanksMap.clear();
        snap.docs.forEach((d) =>
          pubBanksMap.set(d.id, { id: d.id, ...(d.data() as Omit<PyqBank, 'id'>) })
        );
        syncBanks();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'pyqBanks')
    );

    // 2. PYQ Questions (Own + Public)
    const ownQMap = new Map<string, PyqQuestion>();
    const pubQMap = new Map<string, PyqQuestion>();
    const syncQuestions = () => {
      const merged = new Map<string, PyqQuestion>([...pubQMap, ...ownQMap]);
      const list = Array.from(merged.values()).sort(
        (a, b) => getMillis(b.createdAt) - getMillis(a.createdAt)
      );
      setQuestions(list);
    };

    const unsubOwnQs = onSnapshot(
      query(collection(db, 'pyqQuestions'), where('ownerId', '==', uid)),
      (snap) => {
        ownQMap.clear();
        snap.docs.forEach((d) =>
          ownQMap.set(d.id, { id: d.id, ...(d.data() as Omit<PyqQuestion, 'id'>) })
        );
        syncQuestions();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'pyqQuestions')
    );

    const unsubPubQs = onSnapshot(
      query(collection(db, 'pyqQuestions'), where('visibility', '==', 'PUBLIC')),
      (snap) => {
        pubQMap.clear();
        snap.docs.forEach((d) =>
          pubQMap.set(d.id, { id: d.id, ...(d.data() as Omit<PyqQuestion, 'id'>) })
        );
        syncQuestions();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'pyqQuestions')
    );

    // 3. Test Attempts
    const unsubAttempts = onSnapshot(
      query(collection(db, 'testAttempts'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<TestAttempt, 'id'>) }))
          .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
        setAttempts(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'testAttempts')
    );

    // 4. Bookmarks
    const unsubBookmarks = onSnapshot(
      query(collection(db, 'bookmarks'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<BookmarkItem, 'id'>) }))
          .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
        setBookmarks(list);
        cacheBookmarksOffline(uid, list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'bookmarks')
    );

    // 5. Planner Tasks
    const unsubTasks = onSnapshot(
      query(collection(db, 'plannerTasks'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<PlannerTask, 'id'>) }))
          .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
        setPlannerTasks(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'plannerTasks')
    );

    // 6. Focus / Study Sessions
    const unsubSessions = onSnapshot(
      query(collection(db, 'studySessions'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<StudySession, 'id'>) }))
          .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
        setStudySessions(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'studySessions')
    );

    // 7. Study Folders
    const unsubFolders = onSnapshot(
      query(collection(db, 'studyFolders'), where('memberIds', 'array-contains', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<StudyFolder, 'id'>) }))
          .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
        setStudyFolders(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'studyFolders')
    );

    // 8. Study Notes
    const unsubNotes = onSnapshot(
      query(collection(db, 'studyNotes'), where('memberIds', 'array-contains', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<StudyNote, 'id'>) }))
          .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
        setStudyNotes(list);
        cacheNotesOffline(uid, list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'studyNotes')
    );

    // 9. Error Notebook / Mistake Logs
    const unsubMistakes = onSnapshot(
      query(collection(db, 'mistakeLogs'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<MistakeLogItem, 'id'>) }))
          .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
        setMistakeLogs(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'mistakeLogs')
    );

    // 10. Daily Question Goal Logs
    const unsubDailyGoals = onSnapshot(
      query(collection(db, 'dailyGoalLogs'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<DailyGoalLog, 'id'>) }))
          .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
        setDailyGoalLogs(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'dailyGoalLogs')
    );

    // 11. Global Proctoring & Daily Goal Settings
    const unsubProctoringSettings = onSnapshot(
      doc(db, 'proctoringSettings', 'global'),
      (snap) => {
        if (snap.exists()) {
          setProctoringSettings({
            ...DEFAULT_PROCTORING_SETTINGS,
            ...(snap.data() as Partial<ProctoringSettings>),
          });
        } else {
          setProctoringSettings(DEFAULT_PROCTORING_SETTINGS);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'proctoringSettings/global')
    );

    // 12. Global AI Settings
    const unsubAiSettings = onSnapshot(
      doc(db, 'aiSettings', 'global'),
      (snap) => {
        if (snap.exists()) {
          setAiSettings({
            ...DEFAULT_AI_SETTINGS,
            ...(snap.data() as Partial<AiSettings>),
          });
        } else {
          setAiSettings(DEFAULT_AI_SETTINGS);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'aiSettings/global')
    );

    // 13. AI Generated Question Papers
    const unsubGeneratedPapers = onSnapshot(
      query(collection(db, 'generatedPapers'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<GeneratedPaper, 'id'>) }))
          .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
        setGeneratedPapers(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'generatedPapers')
    );

    // 14. Personal Saved AI Question Bank
    const unsubSavedAiQs = onSnapshot(
      query(collection(db, 'savedAiQuestions'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<SavedAiQuestion, 'id'>) }))
          .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
        setSavedAiQuestions(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'savedAiQuestions')
    );

    // 15. User AI Generation Logs (daily quota tracking)
    const unsubAiGenLogs = onSnapshot(
      query(collection(db, 'aiGenerationLogs'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<AiGenerationLog, 'id'>) }))
          .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
        setAiGenerationLogs(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'aiGenerationLogs')
    );

    return () => {
      unsubOwnBanks();
      unsubPubBanks();
      unsubOwnQs();
      unsubPubQs();
      unsubAttempts();
      unsubBookmarks();
      unsubTasks();
      unsubSessions();
      unsubFolders();
      unsubNotes();
      unsubMistakes();
      unsubDailyGoals();
      unsubProctoringSettings();
      unsubAiSettings();
      unsubGeneratedPapers();
      unsubSavedAiQs();
      unsubAiGenLogs();
    };
  }, [uid, isVerified, profile?.uid]);

  // Fetch connected AI providers from server
  useEffect(() => {
    if (!firebaseUser || !isVerified) {
      setAiProviders([]);
      return;
    }
    let cancelled = false;
    firebaseUser
      .getIdToken()
      .then((token) =>
        getApiJson<{ providers?: AiProviderStatus[] }>('/api/ai/providers', token)
      )
      .then((res) => {
        if (!cancelled && Array.isArray(res?.providers)) {
          setAiProviders(res.providers);
        }
      })
      .catch(() => {
        // Non-fatal fallback
      });
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, isVerified]);

  // StudyTrack Store (Firestore + Google Calendar + 15-min Alerts)
  const studyTrack = useStudyTrackStore({
    uid,
    userEmail: firebaseUser?.email || profile?.email || null,
    isVerified,
    plannerTasks,
  });

  // Increment daily question goal log (persisted across refresh/logout, auto-resets by dateKey)
  const incrementDailyGoalLog = useCallback(
    async (questionsCount: number) => {
      if (!uid || questionsCount <= 0) return;
      const todayKey = getTodayDateKey();
      const logId = `${uid}_${todayKey}`;
      const targetQuestions = Math.max(
        5,
        Math.min(200, Math.round(proctoringSettings.dailyQuestionGoal || 30))
      );
      try {
        const logRef = doc(db, 'dailyGoalLogs', logId);
        let currentCompleted = 0;
        try {
          const existingSnap = await getDoc(logRef);
          if (existingSnap.exists()) {
            const data = existingSnap.data() as Partial<DailyGoalLog>;
            currentCompleted = Math.max(0, Number(data.questionsCompleted || 0));
          }
        } catch {
          currentCompleted =
            dailyGoalLogs.find((d) => d.dateKey === todayKey)?.questionsCompleted || 0;
        }
        const nextCompleted = Math.min(2000, currentCompleted + Math.round(questionsCount));
        await setDoc(logRef, {
          ownerId: uid,
          dateKey: todayKey,
          questionsCompleted: nextCompleted,
          targetQuestions,
          goalReached: nextCompleted >= targetQuestions,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `dailyGoalLogs/${logId}`);
      }
    },
    [uid, proctoringSettings.dailyQuestionGoal, dailyGoalLogs]
  );

  const handleRateFlashcard = async (cardId: string, rating: FlashcardRating) => {
    if (!uid) return;
    const progressId = `${uid}_${cardId}`;
    const sm2Result = calculateSm2(rating);
    const progressDoc: FlashcardProgress = {
      id: progressId,
      userId: uid,
      cardId,
      ...sm2Result,
      lastRating: rating,
      difficulty: 'MEDIUM',
      updatedAt: Date.now(),
    };
    try {
      await setDoc(doc(db, 'flashcardProgress', progressId), progressDoc, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'flashcardProgress');
    }
  };

  const handleSubmitRevisionTest = async (attemptData: Omit<RevisionTestAttempt, 'id' | 'userId'>) => {
    if (!uid) return;
    const testId = `flashcard-test-${uid}-${Date.now()}`;
    const fullAttempt: RevisionTestAttempt = {
      ...attemptData,
      id: testId,
      userId: uid,
    };
    try {
      await setDoc(doc(db, 'flashcardTests', testId), fullAttempt);
      await incrementDailyGoalLog(15);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'flashcardTests');
    }
  };

  // Sync queued offline attempts
  const flushOfflineAttemptQueue = useCallback(async () => {
    if (!uid || !profile || !navigator.onLine) return;
    const queued = readOfflineAttemptQueue(uid);
    setQueuedAttemptsCount(queued.length);
    if (queued.length === 0) return;

    setSyncingQueue(true);
    try {
      for (const item of queued) {
        try {
          const attRef = doc(collection(db, 'testAttempts'));
          await setDoc(attRef, {
            ...item.payload,
            ownerId: uid,
            createdAt: serverTimestamp(),
          });
          const streakUpdate = computeNextStreak(profile);
          await updateDoc(doc(db, 'users', uid), {
            xp: increment(item.summary.xpDelta),
            totalQuestionsSolved: increment(item.summary.questionsSolved),
            totalCorrect: increment(item.summary.correctCount),
            totalTestsCompleted: increment(item.summary.testsCompleted),
            totalStudyMinutes: increment(item.summary.studyMinutes),
            streakDays: streakUpdate.streakDays,
            longestStreak: streakUpdate.longestStreak,
            lastActiveDate: streakUpdate.lastActiveDate,
            updatedAt: serverTimestamp(),
          });
          await updateDoc(doc(db, 'publicProfiles', uid), {
            xp: increment(item.summary.xpDelta),
            totalQuestionsSolved: increment(item.summary.questionsSolved),
            totalCorrect: increment(item.summary.correctCount),
            totalTestsCompleted: increment(item.summary.testsCompleted),
            streakDays: streakUpdate.streakDays,
            updatedAt: serverTimestamp(),
          });
          await incrementDailyGoalLog(item.summary.questionsSolved);
          removeQueuedOfflineAttempt(item.localId);
        } catch {
          break;
        }
      }
      setQueuedAttemptsCount(readOfflineAttemptQueue(uid).length);
    } finally {
      setSyncingQueue(false);
    }
  }, [uid, profile, incrementDailyGoalLog]);

  useEffect(() => {
    if (!uid) {
      setQueuedAttemptsCount(0);
      return;
    }
    setQueuedAttemptsCount(readOfflineAttemptQueue(uid).length);
    if (!isOffline && profile) {
      void flushOfflineAttemptQueue();
    }
  }, [uid, isOffline, profile, flushOfflineAttemptQueue]);

  // Google Sign-In
  const handleGoogleAuth = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = await signInWithPopup(auth, googleProvider);
      if (!res.user.emailVerified) {
        setAuthError('Please verify your Google email address before continuing.');
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to sign in with Google.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Onboarding Profile Creation
  const handleCompleteOnboarding = async (data: {
    displayName: string;
    targetExam: ExamType;
    targetClass: TargetClass;
    targetYear: number;
    dailyStudyGoalMins: number;
  }) => {
    if (!firebaseUser) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      const todayKey = getTodayDateKey();
      const userDoc: Omit<UserProfile, 'createdAt' | 'updatedAt'> = {
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        displayName: data.displayName,
        ...(firebaseUser.photoURL ? { photoURL: firebaseUser.photoURL } : {}),
        targetExam: data.targetExam,
        targetClass: data.targetClass,
        targetYear: data.targetYear,
        dailyStudyGoalMins: data.dailyStudyGoalMins,
        weeklyTestsGoal: 3,
        weeklyQuestionsGoal: 120,
        emailNotificationsEnabled: true,
        pomodoroFocusMins: 25,
        pomodoroShortBreakMins: 5,
        pomodoroLongBreakMins: 15,
        xp: 50,
        streakDays: 1,
        longestStreak: 1,
        lastActiveDate: todayKey,
        totalStudyMinutes: 0,
        totalQuestionsSolved: 0,
        totalCorrect: 0,
        totalTestsCompleted: 0,
        completedChapters: [],
        dailyChallengeStreak: 0,
      };

      await setDoc(doc(db, 'users', firebaseUser.uid), {
        ...userDoc,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'publicProfiles', firebaseUser.uid), {
        uid: firebaseUser.uid,
        displayName: data.displayName,
        ...(firebaseUser.photoURL ? { photoURL: firebaseUser.photoURL } : {}),
        targetExam: data.targetExam,
        targetClass: data.targetClass,
        xp: 50,
        streakDays: 1,
        totalQuestionsSolved: 0,
        totalCorrect: 0,
        totalTestsCompleted: 0,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to save profile.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Save test attempt + mistake logs + XP
  const handleCompleteTest = async (
    attempt: Omit<TestAttempt, 'id' | 'createdAt'>,
    xpEarned: number,
    overrideQuestions?: PyqQuestion[]
  ) => {
    if (!uid || !profile) return;

    const solvedCount = attempt.attemptedCount ?? attempt.totalQuestions;
    const studyMins = Math.max(1, Math.round((attempt.timeSpentSeconds || 60) / 60));

    if (!navigator.onLine) {
      const updatedQueue = enqueueOfflineAttempt({
        localId: `offline_${Date.now()}`,
        uid,
        queuedAt: Date.now(),
        payload: attempt,
        summary: {
          xpDelta: xpEarned,
          questionsSolved: solvedCount,
          correctCount: attempt.correctCount,
          testsCompleted: 1,
          studyMinutes: studyMins,
        },
        questionResults: attempt.questionResults || [],
      });
      setQueuedAttemptsCount(updatedQueue.length);
      return;
    }

    try {
      const attRef = doc(collection(db, 'testAttempts'));
      await setDoc(attRef, {
        ...attempt,
        ownerId: uid,
        createdAt: serverTimestamp(),
      });

      // Automatically log wrong attempted answers into Mistake Notebook
      const qPool = overrideQuestions || activeTest?.questions || questions;
      const qLookup = new Map(qPool.map((q) => [q.id, q]));
      const wrongItems = (attempt.questionResults || []).filter(
        (qr) => qr.isAttempted && !qr.isCorrect
      );
      if (wrongItems.length > 0) {
        const batch = writeBatch(db);
        wrongItems.slice(0, 40).forEach((wr) => {
          const fullQ = qLookup.get(wr.questionId);
          if (!fullQ) return;
          const logRef = doc(db, 'mistakeLogs', `${uid}_${fullQ.id}`);
          batch.set(logRef, {
            ownerId: uid,
            questionId: fullQ.id,
            attemptId: attRef.id,
            exam: fullQ.exam,
            classLevel: fullQ.classLevel || '12',
            subject: fullQ.subject,
            topic: fullQ.topic || 'General',
            questionType: fullQ.questionType,
            prompt: fullQ.prompt.slice(0, 3900),
            options: Array.isArray(fullQ.options) ? fullQ.options.slice(0, 6) : [],
            correctAnswer: fullQ.correctAnswer.slice(0, 190),
            ...(fullQ.solution ? { solution: fullQ.solution.slice(0, 3900) } : {}),
            ...(fullQ.imageUrl ? { imageUrl: fullQ.imageUrl.slice(0, 240000) } : {}),
            userAnswer: (wr.userAnswer || '').slice(0, 190),
            timeSpentSeconds: Math.max(0, Math.min(43200, Math.round(wr.timeSpentSeconds || 0))),
            reasonTag: 'UNSET',
            resolved: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }

      const streakUpdate = computeNextStreak(profile);
      await updateDoc(doc(db, 'users', uid), {
        xp: increment(xpEarned),
        totalQuestionsSolved: increment(solvedCount),
        totalCorrect: increment(attempt.correctCount),
        totalTestsCompleted: increment(1),
        totalStudyMinutes: increment(studyMins),
        streakDays: streakUpdate.streakDays,
        longestStreak: streakUpdate.longestStreak,
        lastActiveDate: streakUpdate.lastActiveDate,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'publicProfiles', uid), {
        xp: increment(xpEarned),
        totalQuestionsSolved: increment(solvedCount),
        totalCorrect: increment(attempt.correctCount),
        totalTestsCompleted: increment(1),
        streakDays: streakUpdate.streakDays,
        updatedAt: serverTimestamp(),
      });
      if (solvedCount > 0) {
        await incrementDailyGoalLog(solvedCount);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'testAttempts');
    }
  };

  const handleCompleteDailyChallenge = async (
    attempt: Omit<TestAttempt, 'id' | 'createdAt'>,
    xpEarned: number,
    dateKey: string,
    challengeQuestions?: PyqQuestion[]
  ) => {
    if (!uid || !profile) return;
    await handleCompleteTest(attempt, xpEarned, challengeQuestions);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const nextDailyStreak =
      profile.lastDailyChallengeDate === dateKey
        ? profile.dailyChallengeStreak || 1
        : profile.lastDailyChallengeDate === yesterday
          ? (profile.dailyChallengeStreak || 0) + 1
          : 1;
    try {
      await updateDoc(doc(db, 'users', uid), {
        lastDailyChallengeDate: dateKey,
        dailyChallengeStreak: nextDailyStreak,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const handleToggleBookmark = async (question: PyqQuestion, note?: string) => {
    if (!uid) return;
    const existing = bookmarks.find((b) => b.questionId === question.id);
    if (existing) {
      try {
        await deleteDoc(doc(db, 'bookmarks', existing.id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `bookmarks/${existing.id}`);
      }
      return;
    }

    try {
      await setDoc(doc(db, 'bookmarks', `${uid}_${question.id}`), {
        ownerId: uid,
        questionId: question.id,
        exam: question.exam,
        classLevel: question.classLevel || '12',
        subject: question.subject,
        topic: question.topic || 'General',
        prompt: question.prompt.slice(0, 3900),
        options: Array.isArray(question.options) ? question.options.slice(0, 6) : [],
        correctAnswer: question.correctAnswer.slice(0, 190),
        ...(question.solution ? { solution: question.solution.slice(0, 3900) } : {}),
        ...(question.imageUrl ? { imageUrl: question.imageUrl.slice(0, 240000) } : {}),
        note: (note || '').slice(0, 950),
        masteryStatus: 'REVISIT',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'bookmarks');
    }
  };

  const handleUpdateBookmark = async (
    id: string,
    updates: { note?: string; masteryStatus?: MasteryStatus }
  ) => {
    try {
      await updateDoc(doc(db, 'bookmarks', id), {
        ...(updates.note !== undefined ? { note: updates.note.slice(0, 950) } : {}),
        ...(updates.masteryStatus !== undefined ? { masteryStatus: updates.masteryStatus } : {}),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `bookmarks/${id}`);
    }
  };

  const handleDeleteBookmark = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'bookmarks', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `bookmarks/${id}`);
    }
  };

  const handleUpdateMistakeLog = async (
    id: string,
    updates: { reasonTag?: MistakeReasonTag; resolved?: boolean }
  ) => {
    try {
      await updateDoc(doc(db, 'mistakeLogs', id), {
        ...(updates.reasonTag !== undefined ? { reasonTag: updates.reasonTag } : {}),
        ...(updates.resolved !== undefined ? { resolved: updates.resolved } : {}),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `mistakeLogs/${id}`);
    }
  };

  const handleDeleteMistakeLog = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'mistakeLogs', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `mistakeLogs/${id}`);
    }
  };

  const handleDeleteAttempt = async (attemptId: string) => {
    try {
      await deleteDoc(doc(db, 'testAttempts', attemptId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `testAttempts/${attemptId}`);
    }
  };

  const handleDeleteBank = async (bankId: string) => {
    if (!uid) return;
    try {
      const bankQs = questions.filter((q) => q.bankId === bankId && q.ownerId === uid);
      for (let i = 0; i < bankQs.length; i += 400) {
        const batch = writeBatch(db);
        bankQs.slice(i, i + 400).forEach((q) => batch.delete(doc(db, 'pyqQuestions', q.id)));
        await batch.commit();
      }
      await deleteDoc(doc(db, 'pyqBanks', bankId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `pyqBanks/${bankId}`);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    try {
      await deleteDoc(doc(db, 'pyqQuestions', questionId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `pyqQuestions/${questionId}`);
    }
  };

  const handleSaveAiQuestionsToVault = async (
    qs: PyqQuestion[]
  ): Promise<{ bankId: string; count: number }> => {
    if (!uid) throw new Error('Not signed in');
    const list = qs.slice(0, 100);
    if (list.length === 0) throw new Error('No questions to save');
    const first = list[0];
    const bankRef = doc(collection(db, 'pyqBanks'));
    const normalizedExam: ExamType =
      first?.exam === 'JEE_ADV' || first?.exam === 'NEET' ? first.exam : profile?.targetExam || 'JEE_MAINS';

    // Commit parent pyqBanks doc first so subsequent pyqQuestions batches pass exists() within Firestore's 20-lookup limit
    await setDoc(bankRef, {
      ownerId: uid,
      title: `AI Practice Set (${first?.subject || 'Mixed'} · ${list.length} Qs)`.slice(0, 150),
      fileName: 'ai-practice-set.json',
      fileSizeBytes: 0,
      exam: normalizedExam,
      classLevel: 'ALL',
      questionCount: list.length,
      visibility: 'PRIVATE',
      createdAt: serverTimestamp(),
    });

    const batchSize = 12;
    for (let offset = 0; offset < list.length; offset += batchSize) {
      const batch = writeBatch(db);
      list.slice(offset, offset + batchSize).forEach((q) => {
        const qRef = doc(collection(db, 'pyqQuestions'));
        const safeOpts = Array.isArray(q.options)
          ? q.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 6)
          : [];
        const rawSubj = String(q.subject || '').toLowerCase();
        const safeSubject = rawSubj.includes('chem')
          ? 'Chemistry'
          : rawSubj.includes('math')
            ? 'Mathematics'
            : rawSubj.includes('bio')
              ? 'Biology'
              : 'Physics';
        const safeExam: ExamType =
          q.exam === 'JEE_ADV' || q.exam === 'NEET' || q.exam === 'JEE_MAINS'
            ? q.exam
            : normalizedExam;
        batch.set(qRef, {
          ownerId: uid,
          bankId: bankRef.id,
          visibility: 'PRIVATE',
          exam: safeExam,
          classLevel: q.classLevel === '11' ? '11' : '12',
          subject: safeSubject,
          topic: (q.topic || 'General').trim().slice(0, 120) || 'General',
          year: (q.year || 'AI Practice').trim().slice(0, 32),
          questionType: q.questionType || 'MCQ',
          prompt: q.prompt.trim().slice(0, 4000),
          options: safeOpts,
          correctAnswer: (q.correctAnswer || safeOpts[0] || '0').trim().slice(0, 200),
          solution: (q.solution || '').trim().slice(0, 4000),
          difficulty: q.difficulty || 'MEDIUM',
          createdAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }
    return { bankId: bankRef.id, count: list.length };
  };

  const handleSeedStarterPack = async (examFilter?: ExamType): Promise<number> => {
    if (!uid) return 0;
    const res = await seedStarterPyqPack(uid, examFilter);
    return res.insertedCount;
  };

  const handleToggleChapter = async (chapterKey: string) => {
    if (!uid || !profile) return;
    const current = profile.completedChapters || [];
    const next = current.includes(chapterKey)
      ? current.filter((c) => c !== chapterKey)
      : [...current, chapterKey];
    try {
      await updateDoc(doc(db, 'users', uid), {
        completedChapters: next.slice(0, 150),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const handleBulkSetChapters = async (
    updates: Array<{ key: string; completed: boolean }>
  ) => {
    if (!uid || !profile) return;
    const set = new Set(profile.completedChapters || []);
    updates.forEach((u) => {
      if (u.completed) set.add(u.key);
      else set.delete(u.key);
    });
    try {
      await updateDoc(doc(db, 'users', uid), {
        completedChapters: Array.from(set).slice(0, 150),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const handleCreateTask = async (
    task: Omit<PlannerTask, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
  ) => {
    if (!uid) return;
    try {
      const clean: Record<string, unknown> = {
        ownerId: uid,
        title: task.title.trim().slice(0, 175),
        category: task.category,
        priority: task.priority,
        completed: task.completed,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (task.exam) clean.exam = task.exam;
      if (task.subject) clean.subject = task.subject.slice(0, 38);
      if (task.topic) clean.topic = task.topic.slice(0, 115);
      if (task.testMode) clean.testMode = task.testMode.slice(0, 38);
      if (task.scheduledDate) clean.scheduledDate = task.scheduledDate;
      if (task.scheduledTime) clean.scheduledTime = task.scheduledTime;
      if (typeof task.dayOfWeek === 'number') clean.dayOfWeek = task.dayOfWeek;
      if (typeof task.durationMins === 'number') {
        clean.durationMins = Math.max(5, Math.min(720, task.durationMins));
      }
      await setDoc(doc(collection(db, 'plannerTasks')), clean);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'plannerTasks');
    }
  };

  const handleToggleTask = async (task: PlannerTask) => {
    try {
      await updateDoc(doc(db, 'plannerTasks', task.id), {
        completed: !task.completed,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `plannerTasks/${task.id}`);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteDoc(doc(db, 'plannerTasks', taskId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `plannerTasks/${taskId}`);
    }
  };

  const handleLogStudySession = async (
    session: Omit<StudySession, 'id' | 'ownerId' | 'createdAt'>
  ) => {
    if (!uid || !profile) return;
    try {
      await setDoc(doc(collection(db, 'studySessions')), {
        ownerId: uid,
        subject: session.subject.slice(0, 38),
        ...(session.topic ? { topic: session.topic.slice(0, 115) } : {}),
        mode: session.mode,
        durationMins: Math.max(1, Math.min(600, session.durationMins)),
        xpEarned: Math.max(0, Math.min(5000, session.xpEarned)),
        dateKey: session.dateKey,
        createdAt: serverTimestamp(),
      });

      const streakUpdate = computeNextStreak(profile);
      await updateDoc(doc(db, 'users', uid), {
        xp: increment(session.xpEarned),
        totalStudyMinutes: increment(session.durationMins),
        streakDays: streakUpdate.streakDays,
        longestStreak: streakUpdate.longestStreak,
        lastActiveDate: streakUpdate.lastActiveDate,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'publicProfiles', uid), {
        xp: increment(session.xpEarned),
        streakDays: streakUpdate.streakDays,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'studySessions');
    }
  };

  const handleSavePomodoroPrefs = async (prefs: {
    pomodoroFocusMins: number;
    pomodoroShortBreakMins: number;
    pomodoroLongBreakMins: number;
  }) => {
    if (!uid) return;
    try {
      await updateDoc(doc(db, 'users', uid), {
        pomodoroFocusMins: prefs.pomodoroFocusMins,
        pomodoroShortBreakMins: prefs.pomodoroShortBreakMins,
        pomodoroLongBreakMins: prefs.pomodoroLongBreakMins,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const handleSaveProfileSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid) return;
    setSavingProfile(true);
    try {
      await updateDoc(doc(db, 'users', uid), {
        targetExam: editExam,
        targetClass: editClass,
        dailyStudyGoalMins: Math.max(15, Math.min(960, editDailyGoal)),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'publicProfiles', uid), {
        targetExam: editExam,
        targetClass: editClass,
        updatedAt: serverTimestamp(),
      });
      setProfileModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveExamCustomization = async (customization: ExamCustomization) => {
    if (!uid) return;
    try {
      await updateDoc(doc(db, 'users', uid), {
        examCustomization: customization,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const bookmarkedIds = useMemo(
    () => new Set(bookmarks.map((b) => b.questionId)),
    [bookmarks]
  );

  const weakReport = useMemo(
    () => (profile ? analyzeTestsAndWeakTopics(attempts, questions, profile.targetExam) : null),
    [attempts, questions, profile]
  );

  const upcomingRemindersCount = useMemo(() => {
    const now = getKolkataTimeParts();
    return studyTrack.sessions.filter((s) =>
      isSessionScheduledForDate(s, now.dateKey, now.dayOfWeek)
    ).length;
  }, [studyTrack.sessions]);

  const todaysStudyTrackMins = useMemo(() => {
    const today = getKolkataDateKey();
    const totalSecs = studyTrack.stopwatchRecords
      .filter((r) => r.date === today)
      .reduce((sum, r) => sum + r.durationSeconds, 0);
    return Math.round(totalSecs / 60);
  }, [studyTrack.stopwatchRecords]);

  // Loading & Auth Guards
  if (isLoadingGate) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mx-auto">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div className="text-sm font-bold font-display text-slate-900 dark:text-white">
            {loadingTimedOut ? 'Connection is taking longer than expected' : 'Loading OBREN & StudyTrack...'}
          </div>
          {loadingTimedOut && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Firestore or authentication is taking a bit long to respond. You can retry the connection or sign out.
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (uid) {
                      try {
                        const snap = await getDocFromServer(doc(db, 'users', uid));
                        if (snap.exists()) {
                          const p = snap.data() as UserProfile;
                          setProfile(p);
                          setEditExam(p.targetExam);
                          setEditClass(p.targetClass);
                          setEditDailyGoal(p.dailyStudyGoalMins || 180);
                        } else {
                          setProfile(null);
                        }
                        setProfileLoaded(true);
                        return;
                      } catch {
                        // Fall through to full reload
                      }
                    }
                    window.location.reload();
                  }}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Retry Connection
                </button>
                {firebaseUser && (
                  <button
                    type="button"
                    onClick={() => void signOut(auth)}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    Sign Out
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Teacher Mode: Render dedicated Teacher Dashboard or In-Website Live Classroom
  if (currentTeacher) {
    if (activeClassroom) {
      return (
        <InWebsiteClassroom
          classId={activeClassroom.id}
          groupId={activeClassroom.groupId}
          title={activeClassroom.title}
          subject={activeClassroom.subject}
          teacherId={currentTeacher.id}
          teacherName={currentTeacher.name}
          groupName={activeClassroom.groupName || 'My Group'}
          meetUri={activeClassroom.meetUrl}
          isTeacher={true}
          onEndClass={() => {
            endLiveClass(activeClassroom.id).catch(() => {});
            setActiveClassroom(null);
          }}
          onLeaveClass={() => setActiveClassroom(null)}
        />
      );
    }

    return (
      <TeacherDashboard
        teacher={currentTeacher}
        onLogout={() => {
          clearTeacherSession();
          setCurrentTeacher(null);
        }}
        onLaunchClassroom={(liveClass) => setActiveClassroom(liveClass)}
      />
    );
  }

  if (!firebaseUser || !isVerified) {
    return (
      <AuthScreen
        mode="LOGIN"
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((p) => !p)}
        onGoogleAuth={handleGoogleAuth}
        onTeacherLoginSuccess={(t) => setCurrentTeacher(t)}
        onCompleteOnboarding={handleCompleteOnboarding}
        authError={authError}
        authLoading={authLoading}
      />
    );
  }

  if (!profile) {
    return (
      <AuthScreen
        mode="ONBOARDING"
        pendingDisplayName={firebaseUser.displayName || ''}
        pendingEmail={firebaseUser.email || ''}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((p) => !p)}
        onGoogleAuth={handleGoogleAuth}
        onTeacherLoginSuccess={(t) => setCurrentTeacher(t)}
        onCompleteOnboarding={handleCompleteOnboarding}
        authError={authError}
        authLoading={authLoading}
      />
    );
  }

  // Student Active In-Website Classroom Mode
  if (activeClassroom) {
    return (
      <InWebsiteClassroom
        classId={activeClassroom.id}
        groupId={activeClassroom.groupId}
        title={activeClassroom.title}
        subject={activeClassroom.subject}
        teacherName={activeClassroom.teacherName || 'Teacher'}
        groupName={activeClassroom.groupName || 'My Classroom'}
        meetUri={activeClassroom.meetUrl}
        isTeacher={false}
        studentId={firebaseUser.uid}
        studentName={profile.displayName}
        studentEmail={firebaseUser.email || undefined}
        onLeaveClass={() => setActiveClassroom(null)}
      />
    );
  }

  // Student Active Assigned Online Exam Mode
  if (activeAssignedExam) {
    return (
      <TeacherOnlineExamRunner
        test={activeAssignedExam.test}
        attemptId={activeAssignedExam.attemptId}
        serverExpiresAt={activeAssignedExam.serverExpiresAt}
        initialAnswers={activeAssignedExam.initialAnswers}
        onExit={() => setActiveAssignedExam(null)}
      />
    );
  }

  // Full-Screen Active NTA CBT Exam Mode
  if (activeTest) {
    return (
      <Suspense fallback={<ViewLoadingFallback label="Preparing NTA Exam Interface..." />}>
        <NtaExamInterface
          config={activeTest}
          userId={profile.uid}
          userName={profile.displayName}
          userPhoto={profile.photoURL}
          bookmarkedIds={bookmarkedIds}
          proctoringSettings={proctoringSettings}
          examCustomization={resolveExamCustomization(profile.examCustomization)}
          onToggleBookmark={handleToggleBookmark}
          onCompleteTest={(attempt, xp) => handleCompleteTest(attempt, xp, activeTest.questions)}
          onSaveAiQuestionsToVault={handleSaveAiQuestionsToVault}
          onPracticeWeakTopics={(req) => {
            setActiveTest(null);
            setRequestedCustomPractice(req);
            setActiveTab('TESTS');
          }}
          onExit={() => setActiveTest(null)}
        />
      </Suspense>
    );
  }

  const levelInfo = getLevelInfo(profile.xp);

  const handleGlobalSearchNavigate = (
    tab: 'dashboard' | 'tests' | 'vault' | 'analytics' | 'planner' | 'notes' | 'arena'
  ) => {
    const map: Record<typeof tab, ActiveTab> = {
      dashboard: 'OBREN_DASHBOARD',
      tests: 'TESTS',
      vault: 'PYQ_VAULT',
      analytics: 'ANALYTICS_OBREN',
      planner: 'PLANNER',
      notes: 'NOTES',
      arena: 'ARENA',
    };
    setActiveTab(map[tab]);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      <Navigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        settings={studyTrack.settings}
        calendarTokenReady={studyTrack.calendarTokenReady}
        upcomingRemindersCount={upcomingRemindersCount}
        activeTuitionRunning={Boolean(studyTrack.activeTuitionSession)}
        isAdmin={isAdmin}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Unified Top Header Bar */}
        <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="lg:hidden flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                <GraduationCap className="w-4 h-4" />
              </div>
              <span className="font-extrabold font-display text-sm">OBREN</span>
            </div>

            <button
              type="button"
              onClick={() => setSearchModalOpen(true)}
              className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:border-indigo-400 text-xs text-slate-500 dark:text-slate-400 cursor-pointer min-w-0 sm:w-64 justify-between"
            >
              <span className="flex items-center gap-2 truncate">
                <Search className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Search chapters, PYQs, notes...</span>
              </span>
              <span className="hidden sm:inline font-mono text-[10px] text-slate-400">
                ⌘K
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <OfflineIndicator
              isOffline={isOffline}
              queuedCount={queuedAttemptsCount}
              syncing={syncingQueue}
              onSyncNow={() => void flushOfflineAttemptQueue()}
            />
            <PWAInstallButton />

            <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-mono tabular-nums">
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold">
                <Flame className="w-3.5 h-3.5" />
                {profile.streakDays}d
              </span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">
                {profile.xp} XP
              </span>
            </div>

            <button
              type="button"
              onClick={() => setDarkMode((p) => !p)}
              aria-label="Toggle theme"
              className="lg:hidden p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Notification Bell */}
            <NotificationBell
              userId={firebaseUser.uid}
              onJoinLiveClass={(groupId) => {
                setActiveTab('CLASSROOMS');
                if (groupId && groupId.startsWith('http')) {
                  setActiveClassroom({
                    id: `live_${Date.now()}`,
                    groupId: '',
                    groupName: 'Live Classroom',
                    teacherId: '',
                    teacherName: 'Teacher',
                    title: 'Live Interactive Session',
                    subject: 'Live Class',
                    meetUrl: groupId,
                    meetCode: '',
                    status: 'LIVE',
                    startedAt: new Date().toISOString(),
                    attendanceCount: 0,
                  });
                }
              }}
              onOpenTest={() => {
                setActiveTab('MY_ASSIGNED_TESTS');
              }}
            />

            <button
              type="button"
              onClick={() => setProfileModalOpen(true)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-400 bg-white dark:bg-slate-900 text-xs font-semibold cursor-pointer"
            >
              {profile.photoURL ? (
                <img
                  src={profile.photoURL}
                  alt={profile.displayName}
                  className="w-6 h-6 rounded-lg object-cover"
                />
              ) : (
                <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-[11px] font-bold">
                  {profile.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="hidden md:inline max-w-[110px] truncate">
                {profile.displayName}
              </span>
            </button>
          </div>
        </header>

        {/* Global 15-Minute Tuition Reminder Banner */}
        {studyTrack.activeReminder && (
          <div className="mx-4 sm:mx-6 mt-4 p-4 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] font-mono font-bold uppercase text-amber-700 dark:text-amber-300">
                  Tuition Reminder · Starts in {studyTrack.activeReminder.minutesUntilStart} min
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  {studyTrack.activeReminder.subject} with {studyTrack.activeReminder.teacherName} at{' '}
                  {studyTrack.activeReminder.startTime}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  {studyTrack.activeReminder.locationOrLink}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() =>
                  announceTuitionReminderSpeech({
                    subject: studyTrack.activeReminder!.subject,
                    teacherName: studyTrack.activeReminder!.teacherName,
                    startTime: studyTrack.activeReminder!.startTime,
                    minutesUntilStart: studyTrack.activeReminder!.minutesUntilStart,
                  })
                }
                title="Announce Reminder via Voice"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 hover:bg-amber-100 dark:hover:bg-amber-950/50 text-slate-800 dark:text-slate-200 text-xs font-semibold cursor-pointer"
              >
                <Volume2 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>Speak</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('TUITION_PLANNER')}
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold cursor-pointer"
              >
                Open Tuition Timer
              </button>
              <button
                type="button"
                onClick={studyTrack.dismissActiveReminder}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Main Workspace Content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-10 max-w-7xl w-full mx-auto">
          {activeTab === 'OBREN_DASHBOARD' && (
            <div className="space-y-6">
              {/* Hero Welcome + Exam Status */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                    {EXAM_LABELS[profile.targetExam]} · Class {profile.targetClass} · Level{' '}
                    {levelInfo.level} ({levelInfo.title})
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight mt-0.5">
                    Welcome back, {profile.displayName.split(' ')[0]}
                  </h1>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setActiveTab('TESTS')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    <Play className="w-4 h-4" />
                    <span>Start PYQ Mock</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('PYQ_VAULT')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    <Upload className="w-4 h-4 text-indigo-500" />
                    <span>PYQ Vault ({questions.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('TUITION_PLANNER')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    <Calendar className="w-4 h-4 text-emerald-500" />
                    <span>Tuition ({upcomingRemindersCount} today)</span>
                  </button>
                </div>
              </div>

              {/* Daily Question Goal Progress Tracker */}
              <DailyGoalTracker
                dailyLogs={dailyGoalLogs}
                targetQuestions={proctoringSettings.dailyQuestionGoal}
                onStartPractice={() => setActiveTab('TESTS')}
              />

              {/* Quick KPI Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-1">
                  <div className="text-xs text-slate-500 dark:text-slate-400">PYQs in Vault</div>
                  <div className="text-2xl font-bold font-mono tabular-nums">
                    {questions.length}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    {banks.length} bank(s) active
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-1">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Mock Tests Completed</div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                    {attempts.length}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    {profile.totalQuestionsSolved || 0} Qs solved
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-1">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Today Study &amp; Tuition
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    {todaysStudyTrackMins}m
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    Goal {profile.dailyStudyGoalMins || 180}m · Total {profile.totalStudyMinutes || 0}m
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-1">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    XP &amp; Error Notebook
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
                    {profile.xp} XP
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    {mistakeLogs.filter((m) => !m.resolved).length} unresolved mistakes
                  </div>
                </div>
              </div>

              {/* Starter Pack Prompt if Vault is Empty */}
              {questions.length === 0 && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-sm font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span>Load Verified Starter PYQ Pack in 1 Click</span>
                    </div>
                    <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
                      Add 20+ verified JEE Main, JEE Advanced, and NEET PYQs or upload your own 100 MB PYQ PDF.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleSeedStarterPack()}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold cursor-pointer"
                    >
                      Load Starter PYQs
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('PYQ_VAULT')}
                      className="px-4 py-2 rounded-xl border border-amber-300 dark:border-amber-700 text-xs font-semibold cursor-pointer"
                    >
                      Open PYQ Vault
                    </button>
                  </div>
                </div>
              )}

              {/* Daily 5-Minute Sprint Challenge */}
              <DailyChallengeCard
                profile={profile}
                onLaunchDailyChallenge={(cfg) => setActiveTest(cfg)}
                onCompleteDailyChallenge={handleCompleteDailyChallenge}
              />

              {/* Weak-Topic Diagnostic Callout + Quick StudyTrack Switcher */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        Weak-Topic Booster
                      </div>
                      <h3 className="font-bold font-display text-base mt-0.5">
                        {weakReport?.unlocked
                          ? `${weakReport.weakTopics.length} Weak Topic(s) Identified`
                          : `Complete ${Math.max(0, 2 - attempts.length)} More Mock Test(s) to Unlock Booster`}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {weakReport?.unlocked && weakReport.weakTopics.length > 0
                          ? `Top focus: ${weakReport.weakTopics
                              .slice(0, 3)
                              .map((w) => `${w.topic} (${w.accuracyPercent}%)`)
                              .join(' · ')}`
                          : 'OBREN automatically analyzes every test attempt and builds targeted weak-topic drills.'}
                      </p>
                    </div>
                    <BarChart3 className="w-5 h-5 text-indigo-500 shrink-0" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRequestedTestMode('BOOSTER');
                        setActiveTab('TESTS');
                      }}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      Open Booster Builder
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('ANALYTICS_OBREN')}
                      className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                    >
                      View Full Analytics
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        StudyTrack Tuition &amp; Stopwatch
                      </div>
                      <h3 className="font-bold font-display text-base mt-0.5">
                        {studyTrack.activeTuitionSession
                          ? `Live: ${studyTrack.activeTuitionSession.subject} with ${studyTrack.activeTuitionSession.teacherName}`
                          : `${upcomingRemindersCount} Tuition Session(s) Today`}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Track teacher arrival/departure times, sync Google Calendar events, and time self-study tasks.
                      </p>
                    </div>
                    <Timer className="w-5 h-5 text-emerald-500 shrink-0" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('TUITION_PLANNER')}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      Tuition Planner
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('STOPWATCH')}
                      className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                    >
                      Study Stopwatch
                    </button>
                  </div>
                </div>
              </div>

              {/* Curriculum Roadmap */}
              <Suspense fallback={<ViewLoadingFallback label="Loading Curriculum Roadmap..." />}>
                <CurriculumRoadmap
                  targetExam={profile.targetExam}
                  completedChapters={profile.completedChapters || []}
                  attempts={attempts}
                  sessions={studySessions}
                  questions={questions}
                  onToggleChapter={handleToggleChapter}
                  onBulkSetChapters={handleBulkSetChapters}
                  onPracticeChapter={(req) => {
                    setRequestedCustomPractice(req);
                    setActiveTab('TESTS');
                  }}
                />
              </Suspense>
            </div>
          )}

          {activeTab !== 'OBREN_DASHBOARD' && (
            <Suspense fallback={<ViewLoadingFallback />}>
              {activeTab === 'CLASSROOMS' && (
                <StudentClassroomView
                  studentId={firebaseUser.uid}
                  studentName={profile.displayName}
                  studentEmail={firebaseUser.email || undefined}
                  onJoinLiveClass={(liveClass) => setActiveClassroom(liveClass)}
                />
              )}

              {activeTab === 'MY_ASSIGNED_TESTS' && (
                <StudentAssignedTestsView
                  studentId={firebaseUser.uid}
                  studentName={profile.displayName}
                  studentEmail={firebaseUser.email || undefined}
                  onStartExam={(test, attemptId, serverExpiresAt, initialAnswers) =>
                    setActiveAssignedExam({ test, attemptId, serverExpiresAt, initialAnswers })
                  }
                />
              )}

              {activeTab === 'TESTS' && (
                <TestLauncherView
                  questions={questions}
                  banks={banks}
                  attempts={attempts}
                  defaultExam={profile.targetExam}
                  requestedMode={requestedTestMode}
                  onClearRequestedMode={() => setRequestedTestMode(undefined)}
                  requestedCustomPractice={requestedCustomPractice}
                  onClearRequestedCustomPractice={() => setRequestedCustomPractice(null)}
                  aiSettings={aiSettings}
                  providers={aiProviders}
                  generatedPapers={generatedPapers}
                  savedAiQuestions={savedAiQuestions}
                  aiGenerationLogs={aiGenerationLogs}
                  onStartTest={(cfg) => setActiveTest(cfg)}
                  onGoToVault={() => setActiveTab('PYQ_VAULT')}
                  onSeedStarterPack={handleSeedStarterPack}
                />
              )}

              {activeTab === 'PYQ_VAULT' && (
                <PyqVaultView
                  userId={profile.uid}
                  defaultExam={profile.targetExam}
                  banks={banks}
                  questions={questions}
                  onDeleteBank={handleDeleteBank}
                  onDeleteQuestion={handleDeleteQuestion}
                  onSeedStarterPack={handleSeedStarterPack}
                />
              )}

              {activeTab === 'FORMULA_BANK' && (
                <FormulaBankView
                  profile={profile}
                  questions={questions}
                  onStartCustomTest={(cfg) => setActiveTest(cfg)}
                  onPracticeRoadmapChapter={(req) => {
                    setRequestedCustomPractice(req);
                    setActiveTab('TESTS');
                  }}
                />
              )}

              {activeTab === 'ANALYTICS_OBREN' && (
                <AnalyticsBookmarksView
                  userId={profile.uid}
                  targetExam={profile.targetExam}
                  attempts={attempts}
                  questions={questions}
                  bookmarks={bookmarks}
                  mistakeLogs={mistakeLogs}
                  onUpdateBookmark={handleUpdateBookmark}
                  onDeleteBookmark={handleDeleteBookmark}
                  onUpdateMistakeLog={handleUpdateMistakeLog}
                  onDeleteMistakeLog={handleDeleteMistakeLog}
                  onDeleteAttempt={handleDeleteAttempt}
                  onLaunchBookmarkTest={(cfg) => setActiveTest(cfg)}
                  onOpenBoosterBuilder={() => {
                    setRequestedTestMode('BOOSTER');
                    setActiveTab('TESTS');
                  }}
                />
              )}

              {activeTab === 'PLANNER' && (
                <PlannerTimerView
                  profile={profile}
                  tasks={plannerTasks}
                  sessions={studySessions}
                  bookmarks={bookmarks}
                  mistakeLogs={mistakeLogs}
                  attempts={attempts}
                  onCreateTask={handleCreateTask}
                  onToggleTask={handleToggleTask}
                  onDeleteTask={handleDeleteTask}
                  onLogStudySession={handleLogStudySession}
                  onUpdateBookmark={(id, updates) => handleUpdateBookmark(id, updates)}
                  onUpdateMistakeLog={(id, updates) => handleUpdateMistakeLog(id, updates)}
                  onLaunchRevisionTest={(cfg) => setActiveTest(cfg)}
                  onSavePomodoroPrefs={handleSavePomodoroPrefs}
                />
              )}

              {activeTab === 'FLASHCARDS' && (
                <FlashcardCentreView
                  isAdmin={isAdmin}
                  onRateCard={handleRateFlashcard}
                  onSubmitTestAttempt={handleSubmitRevisionTest}
                />
              )}

              {activeTab === 'NOTES' && (
                <NotesView profile={profile} folders={studyFolders} notes={studyNotes} />
              )}

              {activeTab === 'ARENA' && (
                <SocialArenaView
                  profile={profile}
                  questions={questions}
                  notes={studyNotes}
                  initialSubTab={arenaInitialSubTab}
                  onClearInitialSubTab={() => setArenaInitialSubTab(undefined)}
                  onStartDuelExam={(cfg) => setActiveTest(cfg)}
                />
              )}

              {activeTab === 'EXAM_SETTINGS' && (
                <ExamCustomizationPanel
                  value={profile.examCustomization}
                  onSave={handleSaveExamCustomization}
                />
              )}

              {activeTab === 'ADMIN_PROCTORING' && isAdmin && (
                <AdminProctoringView
                  adminUid={profile.uid}
                  proctoringSettings={proctoringSettings}
                />
              )}

              {activeTab === 'AI_MANAGEMENT' && isAdmin && (
                <AdminAiView adminUid={profile.uid} />
              )}

              {/* StudyTrack Views */}
              {activeTab === 'DASHBOARD' && (
                <DashboardView
                  sessions={studyTrack.sessions}
                  tasks={studyTrack.tasks}
                  stopwatchRecords={studyTrack.stopwatchRecords}
                  onNavigateTab={(tab) => {
                    const map = {
                      tuition: 'TUITION_PLANNER',
                      tasks: 'TASKS',
                      stopwatch: 'STOPWATCH',
                      study_analytics: 'ANALYTICS',
                    } as const;
                    setActiveTab(map[tab]);
                  }}
                  onLaunchStopwatchForTask={(taskId) => {
                    setPreselectedTaskId(taskId);
                    setActiveTab('STOPWATCH');
                  }}
                  onStartTeacherCame={studyTrack.startTeacherCame}
                  onStartTeacherGone={studyTrack.startTeacherGone}
                />
              )}

              {activeTab === 'TUITION_PLANNER' && (
                <TuitionPlannerView
                  teachers={studyTrack.teachers}
                  sessions={studyTrack.sessions}
                  plannerTasks={plannerTasks}
                  googleCalendarConnected={studyTrack.settings.googleCalendarConnected}
                  calendarTokenReady={studyTrack.calendarTokenReady}
                  preselectedDate={preselectedTuitionDate}
                  onClearPreselectedDate={() => setPreselectedTuitionDate(null)}
                  onConnectCalendar={studyTrack.connectCalendar}
                  onAddTeacher={studyTrack.addTeacher}
                  onDeleteTeacher={studyTrack.deleteTeacher}
                  onAddSession={studyTrack.addSession}
                  onUpdateSession={studyTrack.updateSession}
                  onDeleteSession={studyTrack.deleteSession}
                  onStartTeacherCame={studyTrack.startTeacherCame}
                  onStartTeacherGone={studyTrack.startTeacherGone}
                  onToggleTask={handleToggleTask}
                  onOpenSettings={() => setActiveTab('SETTINGS')}
                />
              )}

              {activeTab === 'VIRTUAL_CALENDAR' && (
                <VirtualCalendarView
                  sessions={studyTrack.sessions}
                  plannerTasks={plannerTasks}
                  calendarTokenReady={studyTrack.calendarTokenReady}
                  onStartTeacherCame={studyTrack.startTeacherCame}
                  onStartTeacherGone={studyTrack.startTeacherGone}
                  onToggleTask={handleToggleTask}
                  onScheduleOnDate={(dateKey) => {
                    setPreselectedTuitionDate(dateKey);
                    setActiveTab('TUITION_PLANNER');
                  }}
                  onOpenGoogleSettings={() => setActiveTab('SETTINGS')}
                />
              )}

              {activeTab === 'ATTENDANCE' && (
                <TeacherAttendanceView
                  teachers={studyTrack.teachers}
                  sessions={studyTrack.sessions}
                />
              )}

              {activeTab === 'TASKS' && (
                <StudyTasksView
                  tasks={studyTrack.tasks}
                  onAddTask={studyTrack.addTask}
                  onUpdateTask={studyTrack.updateTask}
                  onDeleteTask={studyTrack.deleteTask}
                  onLaunchStopwatchForTask={(taskId) => {
                    setPreselectedTaskId(taskId);
                    setActiveTab('STOPWATCH');
                  }}
                />
              )}

              {activeTab === 'STOPWATCH' && (
                <StopwatchView
                  tasks={studyTrack.tasks}
                  activeTuitionSession={studyTrack.activeTuitionSession}
                  preselectedTaskId={preselectedTaskId}
                  onClearPreselectedTaskId={() => setPreselectedTaskId('')}
                  onAddStopwatchRecord={studyTrack.addStopwatchRecord}
                />
              )}

              {activeTab === 'ANALYTICS' && (
                <AnalyticsView stopwatchRecords={studyTrack.stopwatchRecords} />
              )}

              {activeTab === 'SETTINGS' && (
                <SettingsCalendarView
                  settings={studyTrack.settings}
                  sessions={studyTrack.sessions}
                  calendarTokenReady={studyTrack.calendarTokenReady}
                  calendarEvents={studyTrack.calendarEvents}
                  calendarBusy={studyTrack.calendarBusy}
                  calendarNotice={studyTrack.calendarNotice}
                  onConnectCalendar={studyTrack.connectCalendar}
                  onDisconnectCalendar={studyTrack.disconnectCalendar}
                  onRefreshCalendarEvents={studyTrack.refreshCalendarEvents}
                  onSyncAllScheduled={studyTrack.syncAllScheduledToCalendar}
                  onUpdateSettings={studyTrack.updateSettings}
                  onOpenVirtualCalendar={() => setActiveTab('VIRTUAL_CALENDAR')}
                />
              )}
            </Suspense>
          )}
        </main>
      </div>

      {/* Global AI Assistant Floating Widget */}
      <AIChatWidget profile={profile} attempts={attempts} weakReport={weakReport} />

      {/* Global Search Modal (Cmd/Ctrl + K) */}
      {searchModalOpen && (
        <Suspense fallback={null}>
          <GlobalSearchModal
            open={searchModalOpen}
            targetExam={profile.targetExam}
            questions={questions}
            notes={studyNotes}
            bookmarks={bookmarks}
            onClose={() => setSearchModalOpen(false)}
            onNavigate={handleGlobalSearchNavigate}
            onPracticeChapter={(req) => {
              setRequestedCustomPractice(req);
              setActiveTab('TESTS');
            }}
          />
        </Suspense>
      )}

      {/* Profile, Goal Settings & Achievements Modal */}
      {profileModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                {profile.photoURL ? (
                  <img
                    src={profile.photoURL}
                    alt={profile.displayName}
                    className="w-12 h-12 rounded-xl object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-lg">
                    {profile.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-bold font-display">{profile.displayName}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    {profile.email} · Level {levelInfo.level} ({levelInfo.title})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProfileModalOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProfileSettings} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Target Exam</label>
                <select
                  value={editExam}
                  onChange={(e) => setEditExam(e.target.value as ExamType)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                >
                  <option value="JEE_MAINS">JEE Main</option>
                  <option value="JEE_ADV">JEE Advanced</option>
                  <option value="NEET">NEET UG</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Target Class</label>
                <select
                  value={editClass}
                  onChange={(e) => setEditClass(e.target.value as TargetClass)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                >
                  <option value="11">Class 11</option>
                  <option value="12">Class 12</option>
                  <option value="DROPPER">Dropper</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Daily Study Goal (Mins)</label>
                <input
                  type="number"
                  min={15}
                  max={960}
                  value={editDailyGoal}
                  onChange={(e) => setEditDailyGoal(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                />
              </div>
              <div className="sm:col-span-3 flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void signOut(auth)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-xs font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileModalOpen(false);
                      setActiveTab('EXAM_SETTINGS');
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Palette className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Customize Exam Fonts &amp; Theme</span>
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
                >
                  {savingProfile ? 'Saving...' : 'Save Exam Preferences'}
                </button>
              </div>
            </form>

            <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
              <Suspense fallback={<ViewLoadingFallback label="Loading Achievements..." />}>
                <Achievements
                  profile={profile}
                  attempts={attempts}
                  sessions={studySessions}
                  variant="full"
                />
              </Suspense>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

export default App;
