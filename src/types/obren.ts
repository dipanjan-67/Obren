export type ExamType = 'JEE_MAINS' | 'JEE_ADV' | 'NEET';
export type AiExamTarget = 'JEE_MAINS' | 'JEE_ADV' | 'NEET' | 'CBSE_BOARDS' | 'CUSTOM';
export type ClassLevel = '11' | '12';
export type AiClassChoice = '11' | '12' | 'OTHER';
export type TargetClass = '11' | '12' | 'DROPPER';
export type SubjectType = 'Physics' | 'Chemistry' | 'Mathematics' | 'Biology';
export type TestMode =
  | 'DAILY'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'CUSTOM'
  | 'AI_GENERATOR'
  | 'BOOSTER'
  | 'DUEL'
  | 'BOOKMARK_REVIEW'
  | 'DAILY_CHALLENGE'
  | 'MISTAKE_REVIEW';
export type QuestionType = 'MCQ' | 'NUMERICAL' | 'MULTI_MCQ';
export type AiQuestionFormat =
  | 'MCQ'
  | 'MULTI_MCQ'
  | 'NUMERICAL'
  | 'ASSERTION_REASON'
  | 'MATCH_FOLLOWING'
  | 'STATEMENT_BASED'
  | 'DIAGRAM_BASED'
  | 'CASE_BASED'
  | 'INTEGER'
  | 'PYQ_INSPIRED';
export type DifficultyLevel = 'EASY' | 'MEDIUM' | 'HARD';
export type MasteryStatus = 'REVISIT' | 'PRACTICED' | 'MASTERED';
export type MistakeReasonTag = 'UNSET' | 'CONCEPTUAL' | 'FORMULA' | 'SILLY' | 'TIME_PRESSURE';

export type ExamFontFamily =
  | 'Inter'
  | 'Roboto'
  | 'Poppins'
  | 'Open Sans'
  | 'Lato'
  | 'Arial'
  | 'Georgia';
export type ExamFontSize = 'SMALL' | 'MEDIUM' | 'LARGE' | 'XL';
export type ExamThemeId =
  | 'DARK'
  | 'LIGHT'
  | 'MIDNIGHT_BLUE'
  | 'AMOLED_BLACK'
  | 'SOFT_GREY'
  | 'EYE_COMFORT';
export type ExamAccentColor = 'INDIGO' | 'EMERALD' | 'AMBER' | 'CYAN' | 'ROSE';
export type ExamLineSpacing = 'NORMAL' | 'RELAXED' | 'SPACIOUS';
export type ExamLayoutDensity = 'COMFORTABLE' | 'COMPACT';

export interface ExamCustomization {
  fontFamily: ExamFontFamily;
  fontSize: ExamFontSize;
  theme: ExamThemeId;
  questionTextSize: ExamFontSize;
  optionTextSize: ExamFontSize;
  lineSpacing: ExamLineSpacing;
  accentColor: ExamAccentColor;
  layoutDensity: ExamLayoutDensity;
}

export const DEFAULT_EXAM_CUSTOMIZATION: ExamCustomization = {
  fontFamily: 'Inter',
  fontSize: 'MEDIUM',
  theme: 'DARK',
  questionTextSize: 'MEDIUM',
  optionTextSize: 'MEDIUM',
  lineSpacing: 'RELAXED',
  accentColor: 'INDIGO',
  layoutDensity: 'COMFORTABLE',
};

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role?: 'STUDENT' | 'ADMIN';
  targetExam: ExamType;
  targetClass: TargetClass;
  targetYear?: number;
  dailyStudyGoalMins?: number;
  weeklyTestsGoal?: number;
  weeklyQuestionsGoal?: number;
  emailNotificationsEnabled?: boolean;
  pomodoroFocusMins?: number;
  pomodoroShortBreakMins?: number;
  pomodoroLongBreakMins?: number;
  xp: number;
  streakDays: number;
  longestStreak?: number;
  lastActiveDate?: string;
  totalStudyMinutes?: number;
  totalQuestionsSolved?: number;
  totalCorrect?: number;
  totalTestsCompleted?: number;
  completedChapters?: string[];
  lastDailyChallengeDate?: string;
  dailyChallengeStreak?: number;
  examCustomization?: ExamCustomization;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PublicProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
  targetExam: ExamType;
  targetClass: TargetClass;
  xp: number;
  streakDays: number;
  totalQuestionsSolved?: number;
  totalCorrect?: number;
  totalTestsCompleted?: number;
  updatedAt?: unknown;
}

export interface PyqBank {
  id: string;
  ownerId: string;
  title: string;
  fileName?: string;
  fileSizeBytes?: number;
  exam: ExamType;
  classLevel: '11' | '12' | 'ALL';
  questionCount: number;
  visibility: 'PRIVATE' | 'PUBLIC';
  createdAt?: unknown;
}

export interface PyqQuestion {
  id: string;
  ownerId: string;
  bankId: string;
  visibility: 'PRIVATE' | 'PUBLIC';
  exam: ExamType;
  classLevel: ClassLevel;
  subject: SubjectType;
  topic: string;
  year?: string;
  questionType: QuestionType;
  prompt: string;
  options?: string[];
  correctAnswer: string;
  solution?: string;
  imageUrl?: string;
  difficulty?: DifficultyLevel;
  // Enhanced AI Question Generator & Diagram fields
  aiFormat?: AiQuestionFormat;
  hint?: string;
  passage?: string;
  assertionText?: string;
  reasonText?: string;
  matchLeft?: string[];
  matchRight?: string[];
  statements?: string[];
  requiresDiagram?: boolean;
  diagramCategory?: string;
  diagramTitle?: string;
  diagramCaption?: string;
  diagramPlacement?: 'above' | 'below';
  diagramSvg?: string;
  sourceLabel?: string;
  createdAt?: unknown;
}

export interface QuestionResultItem {
  questionId: string;
  subject: SubjectType;
  topic: string;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  isAttempted: boolean;
  marksAwarded: number;
  timeSpentSeconds: number;
}

export type ExamSubmissionReason =
  | 'MANUAL'
  | 'TIMER_EXPIRED'
  | 'LOOKING_AWAY_LIMIT'
  | 'FACE_MISSING_LIMIT';

export interface TestAttempt {
  id: string;
  ownerId: string;
  title: string;
  exam: ExamType;
  testMode: TestMode;
  classLevel?: '11' | '12' | 'ALL';
  subjectFilter?: string;
  topicFilter?: string;
  totalQuestions: number;
  attemptedCount?: number;
  correctCount: number;
  incorrectCount?: number;
  score: number;
  maxScore: number;
  accuracyPercent: number;
  timeSpentSeconds: number;
  subjectStats?: Record<string, { total: number; correct: number; incorrect: number; score: number }>;
  questionResults?: QuestionResultItem[];
  submissionReason?: ExamSubmissionReason;
  proctoringSessionId?: string;
  proctoringSummary?: {
    lookingAwayWarnings: number;
    faceMissingWarnings: number;
    fullscreenExitCount: number;
    cameraStatus: string;
  };
  createdAt?: unknown;
}

export interface DailyGoalLog {
  id: string;
  ownerId: string;
  dateKey: string;
  questionsCompleted: number;
  targetQuestions: number;
  goalReached: boolean;
  updatedAt?: unknown;
}

export interface ProctoringSettings {
  id?: string;
  proctoringEnabled: boolean;
  lookingAwayEnabled: boolean;
  faceMissingEnabled: boolean;
  lookingAwayThresholdSeconds: number;
  faceMissingThresholdSeconds: number;
  maxLookingAwayWarnings: number;
  maxFaceMissingWarnings: number;
  fullscreenMonitoringEnabled: boolean;
  autoSubmitOnLimit: boolean;
  dailyQuestionGoal: number;
  updatedBy?: string;
  updatedAt?: unknown;
}

export const DEFAULT_PROCTORING_SETTINGS: ProctoringSettings = {
  id: 'global',
  proctoringEnabled: true,
  lookingAwayEnabled: true,
  faceMissingEnabled: true,
  lookingAwayThresholdSeconds: 60,
  faceMissingThresholdSeconds: 30,
  maxLookingAwayWarnings: 3,
  maxFaceMissingWarnings: 5,
  fullscreenMonitoringEnabled: true,
  autoSubmitOnLimit: true,
  dailyQuestionGoal: 30,
};

export type ProctoringEventType =
  | 'CAMERA_GRANTED'
  | 'CAMERA_DENIED'
  | 'CAMERA_DISCONNECTED'
  | 'CAMERA_RECONNECTED'
  | 'EXAM_STARTED'
  | 'FULLSCREEN_ENTERED'
  | 'FULLSCREEN_EXITED'
  | 'LOOKING_AWAY_WARNING'
  | 'FACE_MISSING_WARNING'
  | 'AUTO_SUBMITTED'
  | 'MANUAL_SUBMITTED'
  | 'TIME_UP_SUBMITTED';

export interface ProctoringEvent {
  type: ProctoringEventType;
  timestamp: string;
  message: string;
  warningNumber?: number;
}

export interface ExamProctoringSession {
  id: string;
  ownerId: string;
  studentName: string;
  examTitle: string;
  exam: ExamType;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED';
  cameraStatus: 'PENDING' | 'GRANTED' | 'DENIED' | 'DISCONNECTED';
  fullscreenActive: boolean;
  lookingAwayWarnings: number;
  maxLookingAwayWarnings: number;
  faceMissingWarnings: number;
  maxFaceMissingWarnings: number;
  fullscreenExitCount: number;
  submissionReason?: ExamSubmissionReason;
  submissionMessage?: string;
  score?: number;
  maxScore?: number;
  accuracyPercent?: number;
  events: ProctoringEvent[];
  startedAt?: unknown;
  submittedAt?: unknown;
  updatedAt?: unknown;
}

export interface BookmarkItem {
  id: string;
  ownerId: string;
  questionId: string;
  exam: ExamType;
  classLevel?: ClassLevel;
  subject: string;
  topic?: string;
  prompt: string;
  options?: string[];
  correctAnswer: string;
  solution?: string;
  imageUrl?: string;
  difficulty?: DifficultyLevel;
  note?: string;
  masteryStatus: MasteryStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MistakeLogItem {
  id: string;
  ownerId: string;
  questionId: string;
  attemptId?: string;
  exam: ExamType;
  classLevel?: ClassLevel;
  subject: SubjectType;
  topic: string;
  questionType?: QuestionType;
  prompt: string;
  options?: string[];
  correctAnswer: string;
  solution?: string;
  imageUrl?: string;
  difficulty?: DifficultyLevel;
  userAnswer?: string;
  timeSpentSeconds?: number;
  reasonTag: MistakeReasonTag;
  resolved: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PlannerTask {
  id: string;
  ownerId: string;
  title: string;
  category: 'DAILY_TASK' | 'TEST_PLAN' | 'TIMETABLE';
  exam?: ExamType;
  subject?: string;
  topic?: string;
  testMode?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  dayOfWeek?: number;
  durationMins?: number;
  actualDurationMins?: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  completed: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StudySession {
  id: string;
  ownerId: string;
  subject: string;
  topic?: string;
  mode: 'POMODORO' | 'DEEP_WORK';
  durationMins: number;
  xpEarned: number;
  dateKey: string;
  createdAt?: unknown;
}

export interface StudyFolder {
  id: string;
  ownerId: string;
  name: string;
  subject: string;
  exam: ExamType;
  isShared: boolean;
  inviteCode: string;
  memberIds: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StudyNote {
  id: string;
  ownerId: string;
  authorName: string;
  folderId: string;
  memberIds: string[];
  title: string;
  subject: string;
  topic?: string;
  content: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StudyGroup {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  targetExam: ExamType;
  inviteCode: string;
  memberIds: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  senderName: string;
  senderPhoto?: string;
  text: string;
  attachmentTitle?: string;
  attachmentType: 'NONE' | 'NOTE' | 'PYQ' | 'DUEL';
  memberIds: string[];
  createdAt?: unknown;
}

export interface TestDuel {
  id: string;
  hostId: string;
  hostName: string;
  guestId?: string;
  guestName?: string;
  duelCode: string;
  exam: ExamType;
  subject: string;
  questionCount: number;
  questionIds: string[];
  inlineQuestions?: PyqQuestion[];
  status: 'WAITING' | 'ACTIVE' | 'FINISHED';
  hostProgress: number;
  hostScore: number;
  hostFinished: boolean;
  guestProgress: number;
  guestScore: number;
  guestFinished: boolean;
  winnerId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type NtaQuestionStatus =
  | 'NOT_VISITED'
  | 'NOT_ANSWERED'
  | 'ANSWERED'
  | 'MARKED_REVIEW'
  | 'ANSWERED_MARKED_REVIEW';

export interface ActiveTestConfig {
  title: string;
  exam: ExamType;
  testMode: TestMode;
  classLevel: '11' | '12' | 'ALL';
  subjectFilter: string;
  topicFilter: string;
  durationSeconds: number;
  questions: PyqQuestion[];
  duelId?: string;
  markingCorrect?: number;
  markingIncorrect?: number;
  // Enhanced AI Question Paper options
  paperId?: string;
  examTarget?: AiExamTarget;
  customExamName?: string;
  includeSolutions?: boolean;
  includeHints?: boolean;
  negativeMarkingEnabled?: boolean;
  untimed?: boolean;
  generationMeta?: {
    modelUsed?: string;
    providerUsed?: string;
    chapters?: string[];
    specificTopic?: string;
    difficulty?: string;
    questionFormats?: AiQuestionFormat[];
  };
}

export interface RequestedCustomPractice {
  exam: ExamType;
  subject: SubjectType;
  classLevel: ClassLevel;
  chapter: string;
}

export type AiLearningMode =
  | 'DOUBT_SOLVER'
  | 'CONCEPT_TEACHER'
  | 'JEE_ADVANCED'
  | 'QUICK_REVISION'
  | 'PRACTICE_MODE'
  | 'TEST_ANALYSIS';

export type AiExplanationStyle =
  | 'BEGINNER'
  | 'DETAILED'
  | 'SHORT'
  | 'EXAM_ORIENTED';

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  imageUrl?: string;
  pdfUrl?: string;
  mode?: AiLearningMode;
  style?: AiExplanationStyle;
  modelUsed?: string;
  providerUsed?: string;
  failoverFrom?: string;
  failoverReason?: string;
  createdAt: any;
}

export interface AiChatSession {
  id: string;
  ownerId: string;
  title: string;
  mode: AiLearningMode;
  style: AiExplanationStyle;
  createdAt: any;
  updatedAt: any;
}

export interface AiSavedSnippet {
  id: string;
  ownerId: string;
  questionPrompt: string;
  answerContent: string;
  chapter: string;
  createdAt: any;
}

export type AiDiagramMode = 'SVG_AND_RASTER' | 'SVG_ONLY';

export interface AiSettings {
  enabled: boolean;
  model: string;
  maxDailyMessages: number;
  allowImages: boolean;
  allowPdfs: boolean;
  backupModel?: string;
  diagramMode?: AiDiagramMode;
  maxDailyAiQuestions?: number;
  maxQuestionsPerPaper?: number;
  enableGemini?: boolean;
  enableOpenAi?: boolean;
  enableAnthropic?: boolean;
  enableDeepSeek?: boolean;
  enableGroq?: boolean;
  updatedBy?: string;
  updatedAt: any;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: true,
  model: 'gemini-4-hydrogen',
  backupModel: 'claude-3-5-sonnet-latest',
  diagramMode: 'SVG_ONLY',
  maxDailyMessages: 200,
  maxDailyAiQuestions: 300,
  maxQuestionsPerPaper: 90,
  allowImages: true,
  allowPdfs: true,
  enableGemini: true,
  enableOpenAi: true,
  enableAnthropic: true,
  enableDeepSeek: true,
  enableGroq: true,
  updatedAt: null,
};

export interface GeneratedPaper {
  id: string;
  ownerId: string;
  title: string;
  examTarget: AiExamTarget;
  customExamName?: string;
  classChoice: AiClassChoice;
  subject: SubjectType;
  chapters: string[];
  specificTopic?: string;
  difficulty: 'MIXED' | DifficultyLevel;
  questionFormats: AiQuestionFormat[];
  negativeMarkingEnabled: boolean;
  markingCorrect: number;
  markingIncorrect: number;
  durationMins: number;
  untimed?: boolean;
  includeSolutions: boolean;
  includeHints: boolean;
  modelUsed: string;
  providerUsed: string;
  diagramCount: number;
  questions: PyqQuestion[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SavedAiQuestion {
  id: string;
  ownerId: string;
  paperId?: string;
  examTarget: AiExamTarget;
  customExamName?: string;
  classLevel: ClassLevel;
  subject: SubjectType;
  topic: string;
  questionType: QuestionType;
  aiFormat: AiQuestionFormat;
  difficulty: DifficultyLevel;
  prompt: string;
  options?: string[];
  correctAnswer: string;
  solution?: string;
  hint?: string;
  passage?: string;
  assertionText?: string;
  reasonText?: string;
  matchLeft?: string[];
  matchRight?: string[];
  statements?: string[];
  requiresDiagram?: boolean;
  diagramCategory?: string;
  diagramTitle?: string;
  diagramCaption?: string;
  diagramPlacement?: 'above' | 'below';
  diagramSvg?: string;
  imageUrl?: string;
  createdAt?: unknown;
}

export interface AiGenerationLog {
  id: string;
  ownerId: string;
  userEmail?: string;
  status: 'SUCCESS' | 'ERROR';
  action: 'GENERATE_PAPER' | 'REGENERATE_QUESTION' | 'WEAK_TOPIC_DRILL';
  examTarget: AiExamTarget;
  subject: SubjectType;
  chaptersSummary: string;
  requestedCount: number;
  generatedCount: number;
  diagramCount: number;
  modelUsed: string;
  providerUsed: string;
  durationMs: number;
  errorMessage?: string;
  createdAt?: unknown;
}

export interface AiProviderModelOption {
  id: string;
  label: string;
  provider: 'gemini' | 'openai' | 'anthropic' | 'deepseek' | 'groq';
  supportsStructuredJson: boolean;
  supportsSvgDiagrams: boolean;
  supportsRasterImage: boolean;
  recommended?: boolean;
  note?: string;
}

export interface AiProviderStatus {
  provider: 'gemini' | 'openai' | 'anthropic' | 'deepseek' | 'groq';
  label: string;
  configured: boolean;
  envVarName: string;
  models: AiProviderModelOption[];
}

export const EXAM_LABELS: Record<ExamType, string> = {
  JEE_MAINS: 'JEE Main',
  JEE_ADV: 'JEE Advanced',
  NEET: 'NEET UG',
};

export const AI_EXAM_TARGET_LABELS: Record<AiExamTarget, string> = {
  JEE_MAINS: 'JEE Main',
  JEE_ADV: 'JEE Advanced',
  NEET: 'NEET UG',
  CBSE_BOARDS: 'CBSE Boards',
  CUSTOM: 'Custom Exam',
};

export const AI_QUESTION_FORMAT_LABELS: Record<AiQuestionFormat, string> = {
  MCQ: 'MCQ (Single Correct)',
  MULTI_MCQ: 'Multiple Correct',
  NUMERICAL: 'Numerical Value Based',
  ASSERTION_REASON: 'Assertion & Reason',
  MATCH_FOLLOWING: 'Match the Following',
  STATEMENT_BASED: 'Statement Based',
  DIAGRAM_BASED: 'Diagram Based',
  CASE_BASED: 'Case Based Questions',
  INTEGER: 'Integer Type',
  PYQ_INSPIRED: 'PYQ Inspired (Original)',
};

export function getSubjectsForExam(exam: ExamType | AiExamTarget): SubjectType[] {
  if (exam === 'NEET') return ['Physics', 'Chemistry', 'Biology'];
  if (exam === 'CBSE_BOARDS' || exam === 'CUSTOM') {
    return ['Physics', 'Chemistry', 'Mathematics', 'Biology'];
  }
  return ['Physics', 'Chemistry', 'Mathematics'];
}

export function mapAiExamTargetToExamType(target: AiExamTarget): ExamType {
  if (target === 'JEE_ADV') return 'JEE_ADV';
  if (target === 'NEET') return 'NEET';
  return 'JEE_MAINS';
}
