import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  FileText,
  FolderOpen,
  Lightbulb,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
  XCircle,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { ApiRequestError, getApiJson, postApiJson } from '../lib/apiClient';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { getChaptersForSelection } from '../lib/syllabusCatalog';
import {
  AI_EXAM_TARGET_LABELS,
  AI_QUESTION_FORMAT_LABELS,
  DEFAULT_AI_SETTINGS,
  getSubjectsForExam,
  mapAiExamTargetToExamType,
  type ActiveTestConfig,
  type AiClassChoice,
  type AiExamTarget,
  type AiGenerationLog,
  type AiProviderStatus,
  type AiQuestionFormat,
  type AiSettings,
  type ClassLevel,
  type DifficultyLevel,
  type ExamType,
  type GeneratedPaper,
  type PyqQuestion,
  type RequestedCustomPractice,
  type SavedAiQuestion,
  type SubjectType,
} from '../types/obren';
import { MathText } from './MathText';
import { QuestionDiagramViewer } from './QuestionDiagramViewer';
import { QuestionStructuredBlocks } from './QuestionStructuredBlocks';

interface AiQuestionGeneratorPanelProps {
  defaultExam: ExamType;
  aiSettings: AiSettings;
  providers: AiProviderStatus[];
  generatedPapers: GeneratedPaper[];
  savedAiQuestions: SavedAiQuestion[];
  aiGenerationLogs: AiGenerationLog[];
  requestedPractice?: RequestedCustomPractice | null;
  onClearRequestedPractice?: () => void;
  onStartTest: (config: ActiveTestConfig) => void;
}

type GeneratorSubTab = 'CREATE' | 'SAVED_PAPERS' | 'PERSONAL_BANK';

function omitUndefinedDeep<T>(val: T): T {
  if (Array.isArray(val)) {
    return val.map((item) => omitUndefinedDeep(item)) as unknown as T;
  }
  if (val && typeof val === 'object' && Object.getPrototypeOf(val) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = omitUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return val;
}

const ALL_FORMATS: AiQuestionFormat[] = [
  'MCQ',
  'MULTI_MCQ',
  'NUMERICAL',
  'ASSERTION_REASON',
  'MATCH_FOLLOWING',
  'STATEMENT_BASED',
  'DIAGRAM_BASED',
  'CASE_BASED',
  'INTEGER',
  'PYQ_INSPIRED',
];

const COUNT_PRESETS = [5, 10, 15, 20, 30, 45, 90] as const;

export const AiQuestionGeneratorPanel: React.FC<AiQuestionGeneratorPanelProps> = ({
  defaultExam,
  aiSettings,
  providers,
  generatedPapers,
  savedAiQuestions,
  aiGenerationLogs,
  requestedPractice,
  onClearRequestedPractice,
  onStartTest,
}) => {
  const [subTab, setSubTab] = useState<GeneratorSubTab>('CREATE');

  // Academic Information
  const [classChoice, setClassChoice] = useState<AiClassChoice>('12');
  const [examTarget, setExamTarget] = useState<AiExamTarget>(defaultExam);
  const [customExamName, setCustomExamName] = useState<string>('');
  const [subject, setSubject] = useState<SubjectType>('Physics');
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [customChapters, setCustomChapters] = useState<string[]>([]);
  const [customChapterInput, setCustomChapterInput] = useState<string>('');
  const [chapterSearch, setChapterSearch] = useState<string>('');
  const [specificTopic, setSpecificTopic] = useState<string>('');
  const [entireChapter, setEntireChapter] = useState<boolean>(true);

  // Paper Configuration
  const [paperTitle, setPaperTitle] = useState<string>('');
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [customCountMode, setCustomCountMode] = useState<boolean>(false);
  const [difficulty, setDifficulty] = useState<'MIXED' | DifficultyLevel>('MIXED');
  const [selectedFormats, setSelectedFormats] = useState<AiQuestionFormat[]>(['MCQ', 'NUMERICAL']);
  const [negativeMarking, setNegativeMarking] = useState<boolean>(true);
  const [markCorrect, setMarkCorrect] = useState<number>(4);
  const [markIncorrect, setMarkIncorrect] = useState<number>(-1);
  const [untimed, setUntimed] = useState<boolean>(false);
  const [durationMins, setDurationMins] = useState<number>(20);
  const [includeSolutions, setIncludeSolutions] = useState<boolean>(true);
  const [includeHints, setIncludeHints] = useState<boolean>(true);

  // Generation & Preview State
  const [generating, setGenerating] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [needsReload, setNeedsReload] = useState<boolean>(false);
  const [previewPaper, setPreviewPaper] = useState<GeneratedPaper | null>(null);
  const [expandedSolutions, setExpandedSolutions] = useState<Record<string, boolean>>({});
  const [regeneratingQId, setRegeneratingQId] = useState<string | null>(null);
  const [savingBankQId, setSavingBankQId] = useState<string | null>(null);

  // Model & Groq Verification State
  const [selectedModel, setSelectedModel] = useState<string>('AUTO');
  const [groqStatus, setGroqStatus] = useState<{
    checked: boolean;
    checking: boolean;
    configured: boolean;
    verified: boolean;
    availableModels: string[];
    error?: string;
  }>({
    checked: false,
    checking: false,
    configured: false,
    verified: false,
    availableModels: [],
  });

  // Personal Question Bank Filters
  const [bankSearch, setBankSearch] = useState<string>('');
  const [bankSubjectFilter, setBankSubjectFilter] = useState<string>('ALL');
  const [bankFormatFilter, setBankFormatFilter] = useState<string>('ALL');
  const [bankDifficultyFilter, setBankDifficultyFilter] = useState<string>('ALL');

  const verifyGroqConnection = async () => {
    setGroqStatus((prev) => ({ ...prev, checking: true, error: undefined }));
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setGroqStatus({
          checked: true,
          checking: false,
          configured: false,
          verified: false,
          availableModels: [],
        });
        return;
      }
      const res = await getApiJson<{
        configured?: boolean;
        verified?: boolean;
        availableModels?: string[];
        error?: string;
      }>('/api/ai/groq/verify', token);
      setGroqStatus({
        checked: true,
        checking: false,
        configured: Boolean(res.configured),
        verified: Boolean(res.verified),
        availableModels: Array.isArray(res.availableModels) ? res.availableModels : [],
        error: res.error,
      });
    } catch (err) {
      setGroqStatus({
        checked: true,
        checking: false,
        configured: false,
        verified: false,
        availableModels: [],
        error: err instanceof Error ? err.message : 'Unable to verify Groq connection.',
      });
    }
  };

  useEffect(() => {
    void verifyGroqConnection();
  }, []);

  const availableSubjects = useMemo(() => getSubjectsForExam(examTarget), [examTarget]);
  const maxPaperCap = Math.max(5, Math.min(90, aiSettings.maxQuestionsPerPaper || 90));
  const dailyQuestionLimit = aiSettings.maxDailyAiQuestions || DEFAULT_AI_SETTINGS.maxDailyAiQuestions || 300;

  const todayQuestionsGenerated = useMemo(() => {
    const todayPrefix = new Date().toISOString().slice(0, 10);
    return aiGenerationLogs
      .filter((log) => {
        if (log.status !== 'SUCCESS') return false;
        const ms = (log.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
        if (!ms) return false;
        return new Date(ms).toISOString().slice(0, 10) === todayPrefix;
      })
      .reduce((sum, log) => sum + (log.generatedCount || 0), 0);
  }, [aiGenerationLogs]);

  useEffect(() => {
    if (!availableSubjects.includes(subject)) {
      setSubject(availableSubjects[0]);
      setSelectedChapters([]);
    }
  }, [availableSubjects, subject]);

  useEffect(() => {
    if (!requestedPractice) return;
    setSubTab('CREATE');
    setExamTarget(requestedPractice.exam);
    setSubject(requestedPractice.subject);
    setClassChoice(requestedPractice.classLevel);
    setSelectedChapters([requestedPractice.chapter]);
    setPreviewPaper(null);
    setErrorMsg(null);
    onClearRequestedPractice?.();
  }, [requestedPractice, onClearRequestedPractice]);

  const chapterCatalog = useMemo(() => {
    const catalogExam = mapAiExamTargetToExamType(examTarget);
    const classesForLookup: ClassLevel[] =
      classChoice === '11' ? ['11'] : classChoice === '12' ? ['12'] : ['11', '12'];
    const base = getChaptersForSelection(catalogExam, subject, classesForLookup);
    const customEntries = customChapters.map((name) => ({
      name,
      classLevel: (classChoice === '11' ? '11' : '12') as ClassLevel,
      subject,
    }));
    const merged = [...customEntries, ...base];
    const search = chapterSearch.trim().toLowerCase();
    if (!search) return merged;
    return merged.filter((ch) => ch.name.toLowerCase().includes(search));
  }, [examTarget, subject, classChoice, customChapters, chapterSearch]);

  const savedPromptSet = useMemo(
    () => new Set(savedAiQuestions.map((sq) => `${sq.subject}::${sq.prompt.slice(0, 90)}`)),
    [savedAiQuestions]
  );

  const groqRoutingEnabled = aiSettings.enableGroq ?? true;

  const effectivePreferredModel = useMemo(() => {
    if (selectedModel !== 'AUTO') return selectedModel;
    if (groqRoutingEnabled && (groqStatus.verified || groqStatus.configured)) {
      return 'llama-3.3-70b-versatile';
    }
    return aiSettings.model || 'gemini-4-hydrogen';
  }, [selectedModel, groqRoutingEnabled, groqStatus.verified, groqStatus.configured, aiSettings.model]);

  const effectiveBackupModel = useMemo(() => {
    if (selectedModel === 'AUTO' && effectivePreferredModel.startsWith('llama-')) {
      return aiSettings.model || aiSettings.backupModel || 'gemini-4-hydrogen';
    }
    return aiSettings.backupModel || 'gemini-3.1-flash-lite';
  }, [selectedModel, effectivePreferredModel, aiSettings.model, aiSettings.backupModel]);

  const connectedModelBadge = useMemo(() => {
    const configured = providers.filter((p) => p.configured);
    if (configured.length === 0 && groqStatus.verified) {
      return `${effectivePreferredModel} (Groq Verified)`;
    }
    if (configured.length === 0) return effectivePreferredModel;
    return `${effectivePreferredModel} (${configured.map((c) => c.label.split(' ')[0]).join(' + ')})`;
  }, [providers, effectivePreferredModel, groqStatus.verified]);

  const toggleChapter = (name: string) => {
    setSelectedChapters((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );
  };

  const handleAddCustomChapter = () => {
    const cleaned = customChapterInput.trim().slice(0, 90);
    if (!cleaned) return;
    if (!customChapters.includes(cleaned)) setCustomChapters((p) => [cleaned, ...p]);
    if (!selectedChapters.includes(cleaned)) setSelectedChapters((p) => [...p, cleaned]);
    setCustomChapterInput('');
  };

  const toggleFormat = (fmt: AiQuestionFormat) => {
    setSelectedFormats((prev) => {
      if (prev.includes(fmt)) {
        return prev.length === 1 ? prev : prev.filter((f) => f !== fmt);
      }
      return [...prev, fmt];
    });
  };

  const writeGenerationLog = async (entry: Omit<AiGenerationLog, 'id' | 'createdAt'>) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      const ref = doc(collection(db, 'aiGenerationLogs'));
      await setDoc(ref, {
        ...omitUndefinedDeep(entry),
        ownerId: uid,
        createdAt: serverTimestamp(),
      });
    } catch {
      // Logging should never crash user flow
    }
  };

  const buildPaperTitle = (countVal: number) => {
    if (paperTitle.trim()) return paperTitle.trim().slice(0, 150);
    const examLabel =
      examTarget === 'CUSTOM'
        ? customExamName.trim() || 'Custom Exam'
        : AI_EXAM_TARGET_LABELS[examTarget];
    const clsText = classChoice === 'OTHER' ? 'Bridge' : `Class ${classChoice}`;
    return `${examLabel} · ${clsText} ${subject} (${countVal} Qs)`.slice(0, 150);
  };

  const handleGeneratePaper = async (autoLaunch: boolean) => {
    if (selectedChapters.length === 0 || generating) return;

    if (todayQuestionsGenerated >= dailyQuestionLimit) {
      setErrorMsg(
        `Daily AI question limit (${dailyQuestionLimit} Qs/day) reached. You can still take any of your Saved AI Papers or Personal Question Bank drills.`
      );
      return;
    }

    const uid = auth.currentUser?.uid;
    const token = await auth.currentUser?.getIdToken(true);
    if (!uid || !token) {
      setErrorMsg('Please sign in again to generate AI question papers.');
      return;
    }

    setGenerating(true);
    setErrorMsg(null);
    setNeedsReload(false);
    const effectiveCount = Math.max(1, Math.min(maxPaperCap, questionCount));
    setProgressText(
      `Generating ${effectiveCount} ${subject} questions & educational diagrams...`
    );

    const effectiveNegative = negativeMarking ? Math.min(0, markIncorrect) : 0;
    const startedAt = Date.now();

    try {
      const payload = await postApiJson<{
        questions: PyqQuestion[];
        modelUsed: string;
        providerUsed: string;
        diagramCount: number;
        durationMs: number;
        error?: string;
      }>(
        '/api/tests/generate-paper',
        {
          classChoice,
          examTarget,
          customExamName: examTarget === 'CUSTOM' ? customExamName.trim() : undefined,
          subject,
          chapters: selectedChapters,
          specificTopic: entireChapter ? undefined : specificTopic.trim() || undefined,
          count: effectiveCount,
          difficulty,
          questionFormats: selectedFormats,
          negativeMarkingEnabled: negativeMarking,
          markingCorrect: markCorrect,
          markingIncorrect: effectiveNegative,
          durationMins: untimed ? 0 : durationMins,
          includeSolutions,
          includeHints,
          preferredModel: effectivePreferredModel,
          backupModel: effectiveBackupModel,
          enabledProviders: {
            gemini: aiSettings.enableGemini ?? true,
            openai: aiSettings.enableOpenAi ?? true,
            anthropic: aiSettings.enableAnthropic ?? true,
            deepseek: aiSettings.enableDeepSeek ?? true,
            groq: aiSettings.enableGroq ?? true,
          },
        },
        token
      );

      if (!Array.isArray(payload.questions) || payload.questions.length === 0) {
        throw new Error(payload.error || 'AI returned an empty question paper.');
      }

      const paperRef = doc(collection(db, 'generatedPapers'));
      const title = buildPaperTitle(payload.questions.length);

      const cleanQuestions: PyqQuestion[] = payload.questions.map((q) => {
        const { diagramSvg, ...rest } = q;
        const trimmedSvg = diagramSvg ? String(diagramSvg).slice(0, 18000) : '';
        return omitUndefinedDeep({
          ...rest,
          prompt: String(q.prompt || '').slice(0, 3900),
          solution: q.solution ? String(q.solution).slice(0, 3900) : '',
          hint: q.hint ? String(q.hint).slice(0, 800) : '',
          ...(trimmedSvg ? { diagramSvg: trimmedSvg } : {}),
        });
      });

      const newPaper: GeneratedPaper = omitUndefinedDeep({
        id: paperRef.id,
        ownerId: uid,
        title,
        examTarget,
        ...(examTarget === 'CUSTOM' && customExamName.trim()
          ? { customExamName: customExamName.trim().slice(0, 80) }
          : {}),
        classChoice,
        subject,
        chapters: selectedChapters.slice(0, 25),
        ...(!entireChapter && specificTopic.trim()
          ? { specificTopic: specificTopic.trim().slice(0, 140) }
          : {}),
        difficulty,
        questionFormats: selectedFormats,
        negativeMarkingEnabled: negativeMarking,
        markingCorrect: markCorrect,
        markingIncorrect: effectiveNegative,
        durationMins: untimed ? 0 : durationMins,
        untimed,
        includeSolutions,
        includeHints,
        modelUsed: payload.modelUsed || effectivePreferredModel,
        providerUsed:
          payload.providerUsed ||
          (effectivePreferredModel.startsWith('llama-') || effectivePreferredModel.startsWith('meta-llama/')
            ? 'groq'
            : 'gemini'),
        diagramCount: payload.diagramCount || 0,
        questions: cleanQuestions,
      });

      // Persist in Firestore so generated papers survive refreshes
      try {
        await setDoc(paperRef, {
          ...omitUndefinedDeep(newPaper),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (fsErr) {
        handleFirestoreError(fsErr, OperationType.CREATE, `generatedPapers/${paperRef.id}`);
      }

      await writeGenerationLog({
        ownerId: uid,
        userEmail: auth.currentUser?.email || '',
        status: 'SUCCESS',
        action: 'GENERATE_PAPER',
        examTarget,
        subject,
        chaptersSummary: selectedChapters.slice(0, 3).join(', ').slice(0, 120),
        requestedCount: effectiveCount,
        generatedCount: cleanQuestions.length,
        diagramCount: payload.diagramCount || 0,
        modelUsed: payload.modelUsed || effectivePreferredModel,
        providerUsed:
          payload.providerUsed ||
          (effectivePreferredModel.startsWith('llama-') || effectivePreferredModel.startsWith('meta-llama/')
            ? 'groq'
            : 'gemini'),
        durationMs: payload.durationMs || Date.now() - startedAt,
      });

      if (autoLaunch) {
        launchPaperAsExam(newPaper);
      } else {
        setPreviewPaper(newPaper);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to generate AI question paper.';
      if (err instanceof ApiRequestError && err.needsSessionReload) {
        setNeedsReload(true);
      }
      setErrorMsg(msg);
      await writeGenerationLog({
        ownerId: uid,
        userEmail: auth.currentUser?.email || '',
        status: 'ERROR',
        action: 'GENERATE_PAPER',
        examTarget,
        subject,
        chaptersSummary: selectedChapters.slice(0, 3).join(', ').slice(0, 120),
        requestedCount: effectiveCount,
        generatedCount: 0,
        diagramCount: 0,
        modelUsed: effectivePreferredModel,
        providerUsed:
          effectivePreferredModel.startsWith('llama-') || effectivePreferredModel.startsWith('meta-llama/')
            ? 'groq'
            : 'gemini',
        durationMs: Date.now() - startedAt,
        errorMessage: msg.slice(0, 300),
      });
    } finally {
      setGenerating(false);
      setProgressText('');
    }
  };

  const launchPaperAsExam = (paper: GeneratedPaper) => {
    const mappedExam = mapAiExamTargetToExamType(paper.examTarget);
    const topicSummary =
      paper.chapters.length <= 2
        ? paper.chapters.join(', ').slice(0, 115)
        : `${paper.chapters[0].slice(0, 65)} + ${paper.chapters.length - 1} chapters`;

    onStartTest({
      paperId: paper.id,
      title: paper.title,
      exam: mappedExam,
      examTarget: paper.examTarget,
      customExamName: paper.customExamName,
      testMode: 'AI_GENERATOR',
      classLevel: paper.classChoice === '11' || paper.classChoice === '12' ? paper.classChoice : 'ALL',
      subjectFilter: paper.subject,
      topicFilter: paper.specificTopic || topicSummary,
      durationSeconds: paper.untimed || paper.durationMins === 0 ? 0 : Math.max(1, paper.durationMins) * 60,
      questions: paper.questions,
      markingCorrect: paper.markingCorrect,
      markingIncorrect: paper.negativeMarkingEnabled ? paper.markingIncorrect : 0,
      includeSolutions: paper.includeSolutions,
      includeHints: paper.includeHints,
      negativeMarkingEnabled: paper.negativeMarkingEnabled,
      untimed: Boolean(paper.untimed || paper.durationMins === 0),
      generationMeta: {
        modelUsed: paper.modelUsed,
        providerUsed: paper.providerUsed,
        chapters: paper.chapters,
        specificTopic: paper.specificTopic,
        difficulty: paper.difficulty,
        questionFormats: paper.questionFormats,
      },
    });
  };

  const handleRegenerateInPreview = async (
    q: PyqQuestion,
    qIdx: number,
    mode: 'REPLACE' | 'HARDER' | 'SIMILAR'
  ) => {
    if (!previewPaper || regeneratingQId) return;
    setRegeneratingQId(q.id);
    setErrorMsg(null);
    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) throw new Error('Please sign in again.');

      const res = await postApiJson<{
        question: PyqQuestion;
        modelUsed: string;
        providerUsed: string;
      }>(
        '/api/tests/regenerate-question',
        {
          mode,
          sourceQuestion: {
            subject: q.subject,
            topic: q.topic,
            classLevel: q.classLevel,
            aiFormat: q.aiFormat || (q.questionType === 'MULTI_MCQ' ? 'MULTI_MCQ' : q.questionType === 'NUMERICAL' ? 'NUMERICAL' : 'MCQ'),
            difficulty: q.difficulty || 'MEDIUM',
            prompt: q.prompt,
            requiresDiagram: Boolean(q.requiresDiagram || q.diagramSvg),
          },
          examTarget: previewPaper.examTarget,
          customExamName: previewPaper.customExamName,
          includeSolutions: previewPaper.includeSolutions,
          includeHints: previewPaper.includeHints,
          avoidPrompts: previewPaper.questions.map((item) => item.prompt.slice(0, 75)),
          preferredModel: effectivePreferredModel,
          backupModel: effectiveBackupModel,
          enabledProviders: {
            gemini: aiSettings.enableGemini ?? true,
            openai: aiSettings.enableOpenAi ?? true,
            anthropic: aiSettings.enableAnthropic ?? true,
            deepseek: aiSettings.enableDeepSeek ?? true,
            groq: aiSettings.enableGroq ?? true,
          },
        },
        token
      );

      const nextQuestions = [...previewPaper.questions];
      if (mode === 'SIMILAR') {
        // Insert similar practice question right after the current one
        nextQuestions.splice(qIdx + 1, 0, res.question);
      } else {
        // Replace without changing the rest of the paper
        nextQuestions[qIdx] = res.question;
      }

      const diagramCount = nextQuestions.filter((item) => item.requiresDiagram && item.diagramSvg).length;
      const updatedPaper: GeneratedPaper = {
        ...previewPaper,
        questions: nextQuestions,
        diagramCount,
        modelUsed: res.modelUsed,
        providerUsed: res.providerUsed,
      };
      setPreviewPaper(updatedPaper);

      try {
        await updateDoc(doc(db, 'generatedPapers', previewPaper.id), {
          questions: omitUndefinedDeep(nextQuestions),
          diagramCount,
          updatedAt: serverTimestamp(),
        });
      } catch (fsErr) {
        handleFirestoreError(fsErr, OperationType.UPDATE, `generatedPapers/${previewPaper.id}`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to regenerate question.');
    } finally {
      setRegeneratingQId(null);
    }
  };

  const handleSaveQuestionToBank = async (q: PyqQuestion, sourceExamTarget: AiExamTarget, paperId?: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid || savingBankQId) return;
    setSavingBankQId(q.id);
    try {
      const bankRef = doc(collection(db, 'savedAiQuestions'));
      await setDoc(bankRef, {
        ...omitUndefinedDeep({
          ownerId: uid,
          ...(paperId ? { paperId } : {}),
          examTarget: sourceExamTarget,
          classLevel: q.classLevel || '12',
          subject: q.subject,
          topic: (q.topic || 'General').slice(0, 120),
          questionType: q.questionType || 'MCQ',
          aiFormat: q.aiFormat || (q.questionType === 'MULTI_MCQ' ? 'MULTI_MCQ' : q.questionType === 'NUMERICAL' ? 'NUMERICAL' : 'MCQ'),
          difficulty: q.difficulty || 'MEDIUM',
          prompt: q.prompt.slice(0, 3900),
          options: Array.isArray(q.options) ? q.options.slice(0, 6) : [],
          correctAnswer: q.correctAnswer.slice(0, 200),
          ...(q.solution ? { solution: q.solution.slice(0, 3900) } : {}),
          ...(q.hint ? { hint: q.hint.slice(0, 800) } : {}),
          ...(q.passage ? { passage: q.passage.slice(0, 1800) } : {}),
          ...(q.assertionText ? { assertionText: q.assertionText.slice(0, 800) } : {}),
          ...(q.reasonText ? { reasonText: q.reasonText.slice(0, 800) } : {}),
          ...(Array.isArray(q.matchLeft) && q.matchLeft.length > 0 ? { matchLeft: q.matchLeft.slice(0, 6) } : {}),
          ...(Array.isArray(q.matchRight) && q.matchRight.length > 0 ? { matchRight: q.matchRight.slice(0, 6) } : {}),
          ...(Array.isArray(q.statements) && q.statements.length > 0 ? { statements: q.statements.slice(0, 4) } : {}),
          requiresDiagram: Boolean(q.requiresDiagram || q.diagramSvg),
          ...(q.diagramCategory ? { diagramCategory: q.diagramCategory.slice(0, 60) } : {}),
          ...(q.diagramTitle ? { diagramTitle: q.diagramTitle.slice(0, 120) } : {}),
          ...(q.diagramCaption ? { diagramCaption: q.diagramCaption.slice(0, 240) } : {}),
          ...(q.diagramPlacement ? { diagramPlacement: q.diagramPlacement } : {}),
          ...(q.diagramSvg ? { diagramSvg: q.diagramSvg.slice(0, 18000) } : {}),
        }),
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'savedAiQuestions');
    } finally {
      setSavingBankQId(null);
    }
  };

  const handleDeleteSavedPaper = async (paperId: string) => {
    try {
      await deleteDoc(doc(db, 'generatedPapers', paperId));
      if (previewPaper?.id === paperId) setPreviewPaper(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `generatedPapers/${paperId}`);
    }
  };

  const handleDeleteSavedQuestion = async (qId: string) => {
    try {
      await deleteDoc(doc(db, 'savedAiQuestions', qId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `savedAiQuestions/${qId}`);
    }
  };

  const filteredSavedQuestions = useMemo(() => {
    const qLower = bankSearch.trim().toLowerCase();
    return savedAiQuestions.filter((item) => {
      if (bankSubjectFilter !== 'ALL' && item.subject !== bankSubjectFilter) return false;
      if (bankFormatFilter !== 'ALL' && item.aiFormat !== bankFormatFilter) return false;
      if (bankDifficultyFilter !== 'ALL' && item.difficulty !== bankDifficultyFilter) return false;
      if (qLower) {
        const hay = `${item.prompt} ${item.topic} ${item.subject}`.toLowerCase();
        if (!hay.includes(qLower)) return false;
      }
      return true;
    });
  }, [savedAiQuestions, bankSearch, bankSubjectFilter, bankFormatFilter, bankDifficultyFilter]);

  const handleLaunchBankQuiz = () => {
    if (filteredSavedQuestions.length === 0) return;
    const qs: PyqQuestion[] = filteredSavedQuestions.slice(0, 45).map((sq) => ({
      id: sq.id,
      ownerId: sq.ownerId,
      bankId: 'ai-saved-bank',
      visibility: 'PRIVATE',
      exam: mapAiExamTargetToExamType(sq.examTarget),
      classLevel: sq.classLevel,
      subject: sq.subject,
      topic: sq.topic,
      year: 'Personal AI Bank',
      questionType: sq.questionType,
      aiFormat: sq.aiFormat,
      prompt: sq.prompt,
      options: sq.options || [],
      correctAnswer: sq.correctAnswer,
      solution: sq.solution,
      hint: sq.hint,
      passage: sq.passage,
      assertionText: sq.assertionText,
      reasonText: sq.reasonText,
      matchLeft: sq.matchLeft,
      matchRight: sq.matchRight,
      statements: sq.statements,
      difficulty: sq.difficulty,
      requiresDiagram: sq.requiresDiagram,
      diagramCategory: sq.diagramCategory,
      diagramTitle: sq.diagramTitle,
      diagramCaption: sq.diagramCaption,
      diagramPlacement: sq.diagramPlacement,
      diagramSvg: sq.diagramSvg,
      imageUrl: sq.imageUrl,
    }));

    onStartTest({
      title: `Personal AI Bank Practice (${qs.length} Qs)`,
      exam: qs[0]?.exam || defaultExam,
      examTarget: filteredSavedQuestions[0]?.examTarget || defaultExam,
      testMode: 'AI_GENERATOR',
      classLevel: 'ALL',
      subjectFilter: bankSubjectFilter === 'ALL' ? 'Mixed' : bankSubjectFilter,
      topicFilter: 'Saved AI Bank',
      durationSeconds: Math.max(10, qs.length * 2) * 60,
      questions: qs,
      markingCorrect: 4,
      markingIncorrect: -1,
      includeSolutions: true,
      includeHints: true,
    });
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-6">
      {/* Header + Sub-Navigation */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
            <Brain className="w-4 h-4" />
            <span>AI Smart Question Generator &amp; Paper Creator</span>
          </div>
          <h2 className="text-xl font-extrabold font-display tracking-tight">
            Custom Question Papers &amp; Diagram-Based Practice
          </h2>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            <span className="inline-flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-indigo-500" />
              Engine: {connectedModelBadge}
            </span>
            <span>·</span>
            <span>
              Today: {todayQuestionsGenerated}/{dailyQuestionLimit} AI Qs
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ['CREATE', 'Paper Creator', Wand2],
              ['SAVED_PAPERS', `Saved Papers (${generatedPapers.length})`, FolderOpen],
              ['PERSONAL_BANK', `Saved Bank (${savedAiQuestions.length})`, Bookmark],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                subTab === id
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-indigo-400'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: CREATE QUESTION PAPER */}
      {subTab === 'CREATE' && !previewPaper && (
        <div className="space-y-6">
          {/* Groq & Multi-AI Engine Status & Model Switcher */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/40 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <span className="inline-flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-200">
                <ShieldCheck className="w-4 h-4 text-indigo-500" />
                <span>Groq Backend Connection:</span>
              </span>
              {groqStatus.checking ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Verifying...
                </span>
              ) : groqStatus.verified ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Connected &amp; Verified ({groqStatus.availableModels.length || 3} models)
                </span>
              ) : groqStatus.configured ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {groqStatus.error || 'Configured (verification pending)'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-600 dark:text-amber-400">
                  <XCircle className="w-3.5 h-3.5" />
                  GROQ_API_KEY not set in Secrets (using auto-failover pool)
                </span>
              )}
              <button
                type="button"
                onClick={() => void verifyGroqConnection()}
                disabled={groqStatus.checking}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-indigo-400 text-[11px] font-semibold cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${groqStatus.checking ? 'animate-spin' : ''}`} />
                <span>Verify</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <label
                htmlFor="ai-generator-model-select"
                className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 shrink-0"
              >
                AI Model:
              </label>
              <select
                id="ai-generator-model-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-semibold max-w-[260px]"
              >
                <option value="AUTO">
                  Auto ({groqRoutingEnabled && groqStatus.verified ? 'Groq Llama 3.3 70B' : aiSettings.model})
                </option>
                {providers.length > 0 ? (
                  providers.map((p) =>
                    p.models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id} · {p.configured ? p.label : `${p.label} (Key Unset)`}
                      </option>
                    ))
                  )
                ) : (
                  <>
                    <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile · Groq</option>
                    <option value="llama-3.1-8b-instant">llama-3.1-8b-instant · Groq</option>
                    <option value="meta-llama/llama-4-scout-17b-16e-instruct">
                      llama-4-scout-17b-16e · Groq
                    </option>
                    <option value="gemini-4-hydrogen">gemini-4-hydrogen · Gemini</option>
                    <option value="claude-3-5-sonnet-latest">claude-3-5-sonnet-latest · Claude</option>
                    <option value="deepseek-chat">deepseek-chat · DeepSeek</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Section A: Academic Information */}
          <div className="space-y-4">
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              1. Academic Information
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  Class
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      ['11', 'Class 11'],
                      ['12', 'Class 12'],
                      ['OTHER', 'Other'],
                    ] as const
                  ).map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => {
                        setClassChoice(val);
                        setSelectedChapters([]);
                      }}
                      className={`py-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                        classChoice === val
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  Exam Target
                </label>
                <select
                  value={examTarget}
                  onChange={(e) => {
                    const next = e.target.value as AiExamTarget;
                    setExamTarget(next);
                    setSelectedChapters([]);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm font-medium"
                >
                  <option value="JEE_MAINS">JEE Main</option>
                  <option value="JEE_ADV">JEE Advanced</option>
                  <option value="NEET">NEET UG</option>
                  <option value="CBSE_BOARDS">CBSE Boards</option>
                  <option value="CUSTOM">Custom Exam</option>
                </select>
              </div>

              {examTarget === 'CUSTOM' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                    Custom Exam Name
                  </label>
                  <input
                    type="text"
                    maxLength={80}
                    value={customExamName}
                    onChange={(e) => setCustomExamName(e.target.value)}
                    placeholder="e.g., BITSAT / Olympiads / WBJEE"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                    Question Paper Title (Optional)
                  </label>
                  <input
                    type="text"
                    maxLength={140}
                    value={paperTitle}
                    onChange={(e) => setPaperTitle(e.target.value)}
                    placeholder="Auto-named from subject & chapters"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  Subject
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {availableSubjects.map((sub) => (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => {
                        setSubject(sub);
                        setSelectedChapters([]);
                        setCustomChapters([]);
                      }}
                      className={`px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                        subject === sub
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
                      }`}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Chapter Multi-Selector & Specific Topic */}
            <div className="space-y-3 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Chapters — {subject} ({selectedChapters.length} selected)
                </label>
                <div className="flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedChapters(chapterCatalog.map((c) => c.name))}
                    className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
                  >
                    Select All Visible
                  </button>
                  {selectedChapters.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedChapters([])}
                      className="text-slate-500 hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={chapterSearch}
                    onChange={(e) => setChapterSearch(e.target.value)}
                    placeholder="Search chapters..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={90}
                    value={customChapterInput}
                    onChange={(e) => setCustomChapterInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomChapter();
                      }
                    }}
                    placeholder="Add custom chapter name..."
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomChapter}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-52 overflow-y-auto p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
                {chapterCatalog.map((item) => {
                  const checked = selectedChapters.includes(item.name);
                  return (
                    <label
                      key={`${item.classLevel}_${item.name}`}
                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                        checked
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleChapter(item.name)}
                          className="rounded border-slate-300 accent-indigo-600 shrink-0"
                        />
                        <span className="truncate">{item.name}</span>
                      </span>
                      <span className="font-mono tabular-nums text-[10px] text-slate-400 shrink-0">
                        Cl {item.classLevel}
                      </span>
                    </label>
                  );
                })}
              </div>

              {/* Specific Topic or Entire Chapter */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={entireChapter}
                    onChange={(e) => setEntireChapter(e.target.checked)}
                    className="rounded accent-indigo-600"
                  />
                  <span>Cover Entire Selected Chapter(s)</span>
                </label>
                {!entireChapter && (
                  <input
                    type="text"
                    maxLength={140}
                    value={specificTopic}
                    onChange={(e) => setSpecificTopic(e.target.value)}
                    placeholder="Specific topic focus (e.g., Rolling without slipping, Aldol condensation, Gauss Law)..."
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Section B: Question Paper Configuration */}
          <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              2. Question Paper Configuration
            </div>

            {/* Number of questions & Difficulty */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <span>Number of Questions (Max {maxPaperCap})</span>
                  <span className="font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                    {questionCount} Questions
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {COUNT_PRESETS.filter((n) => n <= maxPaperCap).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setCustomCountMode(false);
                        setQuestionCount(n);
                        setDurationMins(Math.max(10, Math.min(240, n * 2)));
                      }}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-bold cursor-pointer ${
                        !customCountMode && questionCount === n
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCustomCountMode(true)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                      customCountMode
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
                    }`}
                  >
                    Custom
                  </button>
                </div>
                {customCountMode && (
                  <input
                    type="number"
                    min={1}
                    max={maxPaperCap}
                    value={questionCount}
                    onChange={(e) => {
                      const val = Math.max(1, Math.min(maxPaperCap, Number(e.target.value) || 5));
                      setQuestionCount(val);
                      setDurationMins(Math.max(5, Math.min(240, val * 2)));
                    }}
                    className="w-36 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold"
                  />
                )}
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Difficulty Level
                </label>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  {(
                    [
                      ['EASY', 'Easy'],
                      ['MEDIUM', 'Medium'],
                      ['HARD', 'Hard'],
                      ['MIXED', 'Mixed'],
                    ] as const
                  ).map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setDifficulty(val)}
                      className={`py-2 rounded-xl border font-semibold cursor-pointer ${
                        difficulty === val
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 10 Question Formats */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Question Types ({selectedFormats.length} selected)
                </label>
                <div className="flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedFormats(['MCQ', 'NUMERICAL', 'DIAGRAM_BASED'])}
                    className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
                  >
                    Standard + Diagrams
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFormats(ALL_FORMATS)}
                    className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
                  >
                    Select All 10 Formats
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {ALL_FORMATS.map((fmt) => {
                  const active = selectedFormats.includes(fmt);
                  return (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => toggleFormat(fmt)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left text-xs font-medium cursor-pointer transition-colors ${
                        active
                          ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:border-indigo-400'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                          active
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {active && <Check className="w-3 h-3" />}
                      </span>
                      <span className="truncate">{AI_QUESTION_FORMAT_LABELS[fmt]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Marking, Time Limit, Solutions, Hints */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>Negative Marking</span>
                  <button
                    type="button"
                    onClick={() => setNegativeMarking((p) => !p)}
                    className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                      negativeMarking
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {negativeMarking ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="block text-[10px] text-slate-500">Correct (+)</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={markCorrect}
                      onChange={(e) => setMarkCorrect(Math.max(1, Math.min(20, Number(e.target.value) || 4)))}
                      className="w-full px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500">Wrong (-)</label>
                    <input
                      type="number"
                      min={-10}
                      max={0}
                      disabled={!negativeMarking}
                      value={negativeMarking ? markIncorrect : 0}
                      onChange={(e) => setMarkIncorrect(Math.max(-10, Math.min(0, Number(e.target.value) || 0)))}
                      className="w-full px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-indigo-500" />
                    Time Limit
                  </span>
                  <button
                    type="button"
                    onClick={() => setUntimed((p) => !p)}
                    className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                      untimed
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {untimed ? 'Untimed' : 'Timed'}
                  </button>
                </div>
                {!untimed ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={5}
                      max={240}
                      value={durationMins}
                      onChange={(e) => setDurationMins(Math.max(5, Math.min(240, Number(e.target.value) || 15)))}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold"
                    />
                    <span className="text-xs text-slate-500 shrink-0">mins</span>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500 pt-1">
                    Open-ended practice timer (no countdown expiry).
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 space-y-2">
                <div className="text-xs font-semibold">Include Step-by-Step Solutions</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {([true, false] as const).map((flag) => (
                    <button
                      key={String(flag)}
                      type="button"
                      onClick={() => setIncludeSolutions(flag)}
                      className={`py-1.5 rounded-lg border font-semibold cursor-pointer ${
                        includeSolutions === flag
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                      }`}
                    >
                      {flag ? 'Yes' : 'No'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 space-y-2">
                <div className="text-xs font-semibold">Include Conceptual Hints</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {([true, false] as const).map((flag) => (
                    <button
                      key={String(flag)}
                      type="button"
                      onClick={() => setIncludeHints(flag)}
                      className={`py-1.5 rounded-lg border font-semibold cursor-pointer ${
                        includeHints === flag
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                      }`}
                    >
                      {flag ? 'Yes' : 'No'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span>{errorMsg}</span>
              {needsReload && (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="px-3.5 py-1.5 rounded-lg bg-rose-600 text-white font-semibold shrink-0 cursor-pointer"
                >
                  Reload Session
                </button>
              )}
            </div>
          )}

          {/* Action Footer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              AI auto-generates zoomable scientific diagrams whenever questions require figures, circuits, structures, or graphs.
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                disabled={selectedChapters.length === 0 || generating}
                onClick={() => void handleGeneratePaper(false)}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-indigo-600 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 disabled:opacity-45 font-semibold text-xs sm:text-sm cursor-pointer whitespace-nowrap"
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                <span>{generating ? progressText || 'Generating...' : 'Generate & Preview Paper'}</span>
              </button>

              <button
                type="button"
                disabled={selectedChapters.length === 0 || generating}
                onClick={() => void handleGeneratePaper(true)}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-45 text-white font-semibold text-xs sm:text-sm cursor-pointer whitespace-nowrap"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{progressText || 'Generating Paper...'}</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>Generate &amp; Start Exam ({questionCount} Qs)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1B: PAPER PREVIEW & SMART REGENERATION DECK */}
      {subTab === 'CREATE' && previewPaper && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/30 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                {previewPaper.examTarget === 'CUSTOM'
                  ? previewPaper.customExamName || 'Custom Exam'
                  : AI_EXAM_TARGET_LABELS[previewPaper.examTarget]}{' '}
                · {previewPaper.subject} · {previewPaper.questions.length} Questions · {previewPaper.diagramCount} Diagram(s) · Model: {previewPaper.modelUsed}
              </div>
              <h3 className="text-lg font-extrabold font-display">{previewPaper.title}</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Saved to your AI Papers history. You can replace, upgrade difficulty, or duplicate any question before starting.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setPreviewPaper(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold cursor-pointer"
              >
                Create Another Paper
              </button>
              <button
                type="button"
                onClick={() => launchPaperAsExam(previewPaper)}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold cursor-pointer"
              >
                <Play className="w-4 h-4" />
                <span>Start Test Now</span>
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              {errorMsg}
            </div>
          )}

          <div className="space-y-4">
            {previewPaper.questions.map((q, idx) => {
              const isBusy = regeneratingQId === q.id;
              const isSaved = savedPromptSet.has(`${q.subject}::${q.prompt.slice(0, 90)}`);
              const solOpen = Boolean(expandedSolutions[q.id]);

              return (
                <div
                  key={q.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/30 p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                      <span className="font-bold text-slate-900 dark:text-white">Q{idx + 1}</span>
                      <span className="px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold">
                        {AI_QUESTION_FORMAT_LABELS[q.aiFormat || 'MCQ']}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {q.difficulty || 'MEDIUM'}
                      </span>
                      <span className="text-slate-500">{q.topic}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleRegenerateInPreview(q, idx, 'REPLACE')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-indigo-400 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${isBusy ? 'animate-spin' : ''}`} />
                        <span>Regenerate</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleRegenerateInPreview(q, idx, 'HARDER')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-amber-400 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                      >
                        <ArrowUpRight className="w-3 h-3 text-amber-500" />
                        <span>Harder</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleRegenerateInPreview(q, idx, 'SIMILAR')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-emerald-400 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                      >
                        <Sparkles className="w-3 h-3 text-emerald-500" />
                        <span>Similar</span>
                      </button>
                      <button
                        type="button"
                        disabled={isSaved || savingBankQId === q.id}
                        onClick={() =>
                          void handleSaveQuestionToBank(q, previewPaper.examTarget, previewPaper.id)
                        }
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                          isSaved
                            ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                        }`}
                      >
                        {isSaved ? (
                          <BookmarkCheck className="w-3 h-3" />
                        ) : (
                          <Bookmark className="w-3 h-3" />
                        )}
                        <span>{isSaved ? 'Saved' : 'Save to Bank'}</span>
                      </button>
                    </div>
                  </div>

                  {(q.diagramPlacement === 'above' || !q.diagramPlacement) &&
                    (q.diagramSvg || q.imageUrl) && (
                      <QuestionDiagramViewer
                        diagramSvg={q.diagramSvg}
                        imageUrl={q.imageUrl}
                        title={q.diagramTitle}
                        caption={q.diagramCaption}
                        compact
                      />
                    )}

                  <QuestionStructuredBlocks question={q} />

                  <div className="text-sm font-medium leading-relaxed whitespace-pre-wrap">
                    <MathText text={q.prompt} />
                  </div>

                  {q.diagramPlacement === 'below' && (q.diagramSvg || q.imageUrl) && (
                    <QuestionDiagramViewer
                      diagramSvg={q.diagramSvg}
                      imageUrl={q.imageUrl}
                      title={q.diagramTitle}
                      caption={q.diagramCaption}
                      compact
                    />
                  )}

                  {Array.isArray(q.options) && q.options.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {q.options.map((opt, oIdx) => (
                        <div
                          key={oIdx}
                          className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-start gap-2"
                        >
                          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                            ({String.fromCharCode(65 + oIdx)})
                          </span>
                          <MathText text={opt} />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedSolutions((prev) => ({ ...prev, [q.id]: !prev[q.id] }))
                      }
                      className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      {solOpen ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                      <span>{solOpen ? 'Hide Answer & Solution' : 'Show Answer, Hint & Solution'}</span>
                    </button>
                  </div>

                  {solOpen && (
                    <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5 text-xs space-y-2">
                      <div>
                        <strong className="text-emerald-700 dark:text-emerald-300">
                          Correct Answer:{' '}
                        </strong>
                        <span className="font-mono font-bold">
                          <MathText text={q.correctAnswer} />
                        </span>
                      </div>
                      {q.hint && (
                        <div className="flex items-start gap-1.5 text-amber-800 dark:text-amber-200">
                          <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>
                            <strong>Hint:</strong> <MathText text={q.hint} />
                          </span>
                        </div>
                      )}
                      {q.solution && (
                        <div className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                          <strong>Solution: </strong>
                          <MathText text={q.solution} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: SAVED AI PAPERS */}
      {subTab === 'SAVED_PAPERS' && (
        <div className="space-y-4">
          {generatedPapers.length === 0 ? (
            <div className="py-12 text-center space-y-2 text-sm text-slate-500">
              <FolderOpen className="w-8 h-8 mx-auto text-slate-400" />
              <div className="font-semibold">No saved AI question papers yet</div>
              <p className="text-xs">
                Generate your first custom paper in the Paper Creator tab — it is saved automatically here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {generatedPapers.map((paper) => (
                <div
                  key={paper.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                      <span>
                        {paper.examTarget === 'CUSTOM'
                          ? paper.customExamName || 'Custom'
                          : AI_EXAM_TARGET_LABELS[paper.examTarget]}{' '}
                        · {paper.subject}
                      </span>
                      <span>
                        {paper.questions.length} Qs · {paper.diagramCount} Figs
                      </span>
                    </div>
                    <h3 className="font-bold font-display text-base leading-snug">
                      {paper.title}
                    </h3>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Chapters: {paper.chapters.slice(0, 3).join(', ')}
                      {paper.chapters.length > 3 ? ` +${paper.chapters.length - 3} more` : ''}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500">
                      Difficulty: {paper.difficulty} · Model: {paper.modelUsed}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewPaper(paper);
                          setSubTab('CREATE');
                        }}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold cursor-pointer"
                      >
                        Preview &amp; Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteSavedPaper(paper.id)}
                        className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                        title="Delete paper"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => launchPaperAsExam(paper)}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Start Test</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PERSONAL SAVED AI QUESTION BANK */}
      {subTab === 'PERSONAL_BANK' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative lg:col-span-2">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={bankSearch}
                onChange={(e) => setBankSearch(e.target.value)}
                placeholder="Search saved AI questions..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>
            <select
              value={bankSubjectFilter}
              onChange={(e) => setBankSubjectFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            >
              <option value="ALL">All Subjects</option>
              <option value="Physics">Physics</option>
              <option value="Chemistry">Chemistry</option>
              <option value="Mathematics">Mathematics</option>
              <option value="Biology">Biology</option>
            </select>
            <select
              value={bankFormatFilter}
              onChange={(e) => setBankFormatFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            >
              <option value="ALL">All Formats</option>
              {ALL_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {AI_QUESTION_FORMAT_LABELS[f]}
                </option>
              ))}
            </select>
            <select
              value={bankDifficultyFilter}
              onChange={(e) => setBankDifficultyFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            >
              <option value="ALL">All Difficulties</option>
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </div>

          {filteredSavedQuestions.length > 0 && (
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-500 font-mono">
                Showing {filteredSavedQuestions.length} saved AI question(s)
              </div>
              <button
                type="button"
                onClick={handleLaunchBankQuiz}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Practice Filtered Questions ({Math.min(45, filteredSavedQuestions.length)})</span>
              </button>
            </div>
          )}

          {filteredSavedQuestions.length === 0 ? (
            <div className="py-12 text-center space-y-2 text-sm text-slate-500">
              <Bookmark className="w-8 h-8 mx-auto text-slate-400" />
              <div className="font-semibold">Your Personal AI Question Bank is empty</div>
              <p className="text-xs">
                Click &quot;Save to Bank&quot; on any AI-generated question during preview, live exam, or post-test review.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSavedQuestions.map((sq, idx) => (
                <div
                  key={sq.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2 font-mono">
                      <span className="font-bold">#{idx + 1}</span>
                      <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                        {sq.subject}
                      </span>
                      <span>·</span>
                      <span>{sq.topic}</span>
                      <span>·</span>
                      <span>{AI_QUESTION_FORMAT_LABELS[sq.aiFormat]}</span>
                      <span>·</span>
                      <span>{sq.difficulty}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeleteSavedQuestion(sq.id)}
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                      title="Remove from bank"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {(sq.diagramSvg || sq.imageUrl) && (
                    <QuestionDiagramViewer
                      diagramSvg={sq.diagramSvg}
                      imageUrl={sq.imageUrl}
                      title={sq.diagramTitle}
                      caption={sq.diagramCaption}
                      compact
                    />
                  )}

                  <div className="text-sm font-medium whitespace-pre-wrap">
                    <MathText text={sq.prompt} />
                  </div>

                  <div className="text-xs text-emerald-700 dark:text-emerald-300 font-mono">
                    Answer: <MathText text={sq.correctAnswer} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
