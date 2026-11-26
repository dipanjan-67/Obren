import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Check,
  Layers,
  Loader2,
  Lock,
  Play,
  Search,
  Sliders,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react';
import { postApiJson } from '../lib/apiClient';
import { auth } from '../lib/firebase';
import { seedStarterPyqPack } from '../lib/starterPyqBank';
import {
  analyzeTestsAndWeakTopics,
  buildBoosterQuestionSet,
  TESTS_REQUIRED_FOR_BOOSTER,
} from '../lib/weakTopicAnalyzer';
import {
  DEFAULT_AI_SETTINGS,
  EXAM_LABELS,
  getSubjectsForExam,
  type ActiveTestConfig,
  type AiGenerationLog,
  type AiProviderStatus,
  type AiSettings,
  type ClassLevel,
  type DifficultyLevel,
  type ExamType,
  type GeneratedPaper,
  type PyqBank,
  type PyqQuestion,
  type QuestionType,
  type RequestedCustomPractice,
  type SavedAiQuestion,
  type SubjectType,
  type TestAttempt,
  type TestMode,
} from '../types/obren';
import { AiQuestionGeneratorPanel } from './AiQuestionGeneratorPanel';

interface TestLauncherViewProps {
  questions: PyqQuestion[];
  banks: PyqBank[];
  attempts: TestAttempt[];
  defaultExam: ExamType;
  requestedMode?: TestMode;
  onClearRequestedMode?: () => void;
  requestedCustomPractice?: RequestedCustomPractice | null;
  onClearRequestedCustomPractice?: () => void;
  aiSettings?: AiSettings;
  providers?: AiProviderStatus[];
  generatedPapers?: GeneratedPaper[];
  savedAiQuestions?: SavedAiQuestion[];
  aiGenerationLogs?: AiGenerationLog[];
  onStartTest: (config: ActiveTestConfig) => void;
  onGoToVault: () => void;
  onSeedStarterPack?: (exam?: ExamType) => Promise<number>;
}

type OrderingMode = 'SHUFFLE' | 'UNATTEMPTED_FIRST' | 'TOPIC_GROUPED';
type MarkingPreset = 'STANDARD' | 'ZERO_NEG' | 'CUSTOM';
type CustomSourceMode = 'AI' | 'PYQ';

export const TestLauncherView: React.FC<TestLauncherViewProps> = ({
  questions,
  banks,
  attempts,
  defaultExam,
  requestedMode,
  onClearRequestedMode,
  requestedCustomPractice,
  onClearRequestedCustomPractice,
  aiSettings = DEFAULT_AI_SETTINGS,
  providers = [],
  generatedPapers = [],
  savedAiQuestions = [],
  aiGenerationLogs = [],
  onStartTest,
  onGoToVault,
  onSeedStarterPack,
}) => {
  const [exam, setExam] = useState<ExamType>(defaultExam);
  const [testMode, setTestMode] = useState<TestMode>(requestedMode || 'DAILY');
  const [seedingStarter, setSeedingStarter] = useState(false);
  const [starterMsg, setStarterMsg] = useState<string | null>(null);

  // Preset mode (DAILY / WEEKLY / MONTHLY) simple filters
  const [classLevel, setClassLevel] = useState<'11' | '12' | 'ALL'>('ALL');
  const [subjectFilter, setSubjectFilter] = useState<string>('ALL');
  const [topicFilter, setTopicFilter] = useState<string>('ALL');
  const [questionCount, setQuestionCount] = useState<number>(15);
  const [durationMins, setDurationMins] = useState<number>(30);

  // Full Custom Test Builder states (PYQ Vault)
  const [customSource, setCustomSource] = useState<CustomSourceMode>('PYQ');
  const [customTitle, setCustomTitle] = useState<string>('');
  const [selectedClasses, setSelectedClasses] = useState<ClassLevel[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<SubjectType[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [topicSearch, setTopicSearch] = useState<string>('');
  const [selectedBankId, setSelectedBankId] = useState<string>('ALL');
  const [selectedQType, setSelectedQType] = useState<'ALL' | QuestionType>('ALL');
  const [selectedDifficulty, setSelectedDifficulty] = useState<'ALL' | DifficultyLevel>('ALL');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');
  const [orderingMode, setOrderingMode] = useState<OrderingMode>('SHUFFLE');
  const [markingPreset, setMarkingPreset] = useState<MarkingPreset>('STANDARD');
  const [customMarkCorrect, setCustomMarkCorrect] = useState<number>(4);
  const [customMarkIncorrect, setCustomMarkIncorrect] = useState<number>(-1);

  // Booster Test Builder states
  const [boosterExamScope, setBoosterExamScope] = useState<'ALL' | ExamType>('ALL');
  const [boosterIncludeSolid, setBoosterIncludeSolid] = useState<boolean>(false);
  const [boosterUseAiFallback, setBoosterUseAiFallback] = useState<boolean>(true);
  const [boosterGenerating, setBoosterGenerating] = useState<boolean>(false);
  const [boosterError, setBoosterError] = useState<string | null>(null);
  const [boosterEnabledTopics, setBoosterEnabledTopics] = useState<Record<string, boolean>>({});
  const [boosterQuotas, setBoosterQuotas] = useState<Record<string, number>>({});
  const [boosterDurationMins, setBoosterDurationMins] = useState<number>(30);
  const [boosterTitle, setBoosterTitle] = useState<string>('');

  const subjects = getSubjectsForExam(exam);

  useEffect(() => {
    if (requestedMode) {
      applyPreset(requestedMode);
      onClearRequestedMode?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedMode]);

  useEffect(() => {
    if (!requestedCustomPractice) return;
    setTestMode('AI_GENERATOR');
    setExam(requestedCustomPractice.exam);
  }, [requestedCustomPractice]);

  const seenQuestionIds = useMemo(() => {
    const set = new Set<string>();
    attempts.forEach((a) => {
      a.questionResults?.forEach((qr) => set.add(qr.questionId));
    });
    return set;
  }, [attempts]);

  // Preset mode matching
  const availableTopics = useMemo(() => {
    const set = new Set<string>();
    questions
      .filter(
        (q) =>
          q.exam === exam &&
          (classLevel === 'ALL' || q.classLevel === classLevel) &&
          (subjectFilter === 'ALL' || q.subject === subjectFilter)
      )
      .forEach((q) => set.add(q.topic));
    return Array.from(set).sort();
  }, [questions, exam, classLevel, subjectFilter]);

  const matchingQuestions = useMemo(() => {
    return questions.filter(
      (q) =>
        q.exam === exam &&
        (classLevel === 'ALL' || q.classLevel === classLevel) &&
        (subjectFilter === 'ALL' || q.subject === subjectFilter) &&
        (topicFilter === 'ALL' || q.topic === topicFilter)
    );
  }, [questions, exam, classLevel, subjectFilter, topicFilter]);

  // Custom Test Builder computed pools
  const examBanks = useMemo(
    () => banks.filter((b) => b.exam === exam),
    [banks, exam]
  );

  const subjectCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    subjects.forEach((s) => {
      counts[s] = 0;
    });
    questions
      .filter(
        (q) =>
          q.exam === exam &&
          (selectedClasses.length === 0 || selectedClasses.includes(q.classLevel)) &&
          (selectedBankId === 'ALL' || q.bankId === selectedBankId)
      )
      .forEach((q) => {
        counts[q.subject] = (counts[q.subject] || 0) + 1;
      });
    return counts;
  }, [questions, exam, subjects, selectedClasses, selectedBankId]);

  const customTopicOptions = useMemo(() => {
    const map = new Map<string, { topic: string; subject: SubjectType; count: number }>();
    questions
      .filter(
        (q) =>
          q.exam === exam &&
          (selectedClasses.length === 0 || selectedClasses.includes(q.classLevel)) &&
          (selectedSubjects.length === 0 || selectedSubjects.includes(q.subject)) &&
          (selectedBankId === 'ALL' || q.bankId === selectedBankId)
      )
      .forEach((q) => {
        const key = q.topic;
        const cur = map.get(key) || { topic: q.topic, subject: q.subject, count: 0 };
        cur.count += 1;
        map.set(key, cur);
      });

    return Array.from(map.values())
      .filter((item) =>
        topicSearch.trim()
          ? item.topic.toLowerCase().includes(topicSearch.trim().toLowerCase()) ||
            item.subject.toLowerCase().includes(topicSearch.trim().toLowerCase())
          : true
      )
      .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
  }, [questions, exam, selectedClasses, selectedSubjects, selectedBankId, topicSearch]);

  const availableYears = useMemo(() => {
    const set = new Set<string>();
    questions
      .filter((q) => q.exam === exam && q.year)
      .forEach((q) => {
        if (q.year) set.add(q.year);
      });
    return Array.from(set).sort().reverse();
  }, [questions, exam]);

  const customMatchingQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (q.exam !== exam) return false;
      if (selectedClasses.length > 0 && !selectedClasses.includes(q.classLevel)) return false;
      if (selectedSubjects.length > 0 && !selectedSubjects.includes(q.subject)) return false;
      if (selectedTopics.length > 0 && !selectedTopics.includes(q.topic)) return false;
      if (selectedBankId !== 'ALL' && q.bankId !== selectedBankId) return false;
      if (selectedQType !== 'ALL' && q.questionType !== selectedQType) return false;
      if (selectedDifficulty !== 'ALL' && (q.difficulty || 'MEDIUM') !== selectedDifficulty) {
        return false;
      }
      if (selectedYear !== 'ALL' && (q.year || 'PYQ') !== selectedYear) return false;
      return true;
    });
  }, [
    questions,
    exam,
    selectedClasses,
    selectedSubjects,
    selectedTopics,
    selectedBankId,
    selectedQType,
    selectedDifficulty,
    selectedYear,
  ]);

  // Booster Analytics Report
  const boosterReport = useMemo(
    () => analyzeTestsAndWeakTopics(attempts, questions, boosterExamScope),
    [attempts, questions, boosterExamScope]
  );

  const displayedBoosterTopics = useMemo(() => {
    if (boosterIncludeSolid || boosterReport.weakTopics.length === 0) {
      return boosterReport.topicDiagnostics;
    }
    return boosterReport.weakTopics;
  }, [boosterReport, boosterIncludeSolid]);

  // Initialize booster selection & quotas cleanly when analysis updates
  useEffect(() => {
    if (!boosterReport.unlocked) return;
    setBoosterEnabledTopics((prev) => {
      const next = { ...prev };
      boosterReport.topicDiagnostics.forEach((td) => {
        if (next[td.key] === undefined) {
          next[td.key] = td.severity !== 'SOLID' && (td.availableVaultCount > 0 || boosterUseAiFallback);
        }
      });
      return next;
    });
    setBoosterQuotas((prev) => {
      const next = { ...prev };
      boosterReport.topicDiagnostics.forEach((td) => {
        if (next[td.key] === undefined) {
          next[td.key] = td.recommendedQuestionCount;
        }
      });
      return next;
    });
  }, [boosterReport, boosterUseAiFallback]);

  const boosterTotalSelected = useMemo(() => {
    return displayedBoosterTopics.reduce((sum, td) => {
      if (!boosterEnabledTopics[td.key]) return sum;
      if (td.availableVaultCount === 0 && !boosterUseAiFallback) return sum;
      const cap = boosterUseAiFallback ? Math.max(td.availableVaultCount, 10) : td.availableVaultCount;
      const q = Math.min(cap, Math.max(1, boosterQuotas[td.key] ?? td.recommendedQuestionCount));
      return sum + q;
    }, 0);
  }, [displayedBoosterTopics, boosterEnabledTopics, boosterQuotas, boosterUseAiFallback]);

  const handleLoadStarterClick = async () => {
    setSeedingStarter(true);
    setStarterMsg(null);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const count = onSeedStarterPack
        ? await onSeedStarterPack()
        : (await seedStarterPyqPack(uid)).insertedCount;
      setStarterMsg(`Loaded ${count} verified Starter PYQs across JEE Main, JEE Adv & NEET!`);
    } finally {
      setSeedingStarter(false);
    }
  };

  const applyPreset = (mode: TestMode) => {
    setTestMode(mode);
    if (mode === 'DAILY') {
      setQuestionCount(15);
      setDurationMins(30);
    } else if (mode === 'WEEKLY') {
      setQuestionCount(30);
      setDurationMins(60);
    } else if (mode === 'MONTHLY') {
      setQuestionCount(90);
      setDurationMins(180);
    } else if (mode === 'CUSTOM') {
      setQuestionCount(25);
      setDurationMins(50);
    }
  };

  const toggleClassChip = (cls: ClassLevel) => {
    setSelectedClasses((prev) =>
      prev.includes(cls) ? prev.filter((c) => c !== cls) : [...prev, cls]
    );
  };

  const toggleSubjectChip = (sub: SubjectType) => {
    setSelectedSubjects((prev) =>
      prev.includes(sub) ? prev.filter((s) => s !== sub) : [...prev, sub]
    );
    setSelectedTopics([]);
  };

  const toggleTopicChip = (topic: string) => {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  };

  const handleLaunchPreset = () => {
    if (matchingQuestions.length === 0) return;
    const shuffled = [...matchingQuestions].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(questionCount, shuffled.length));
    const modeLabel =
      testMode === 'DAILY'
        ? 'Daily Practice Test'
        : testMode === 'WEEKLY'
          ? 'Weekly Test'
          : 'Monthly Full Test';

    onStartTest({
      title: `${EXAM_LABELS[exam]} · ${modeLabel}${subjectFilter !== 'ALL' ? ` (${subjectFilter})` : ''}`,
      exam,
      testMode,
      classLevel,
      subjectFilter,
      topicFilter,
      durationSeconds: durationMins * 60,
      questions: selected,
    });
  };

  const handleLaunchCustom = () => {
    if (customMatchingQuestions.length === 0) return;

    let ordered = [...customMatchingQuestions];
    if (orderingMode === 'UNATTEMPTED_FIRST') {
      const unattempted = ordered.filter((q) => !seenQuestionIds.has(q.id)).sort(() => Math.random() - 0.5);
      const seen = ordered.filter((q) => seenQuestionIds.has(q.id)).sort(() => Math.random() - 0.5);
      ordered = [...unattempted, ...seen];
    } else if (orderingMode === 'TOPIC_GROUPED') {
      ordered.sort((a, b) => a.subject.localeCompare(b.subject) || a.topic.localeCompare(b.topic));
    } else {
      ordered.sort(() => Math.random() - 0.5);
    }

    const limit = Math.max(1, Math.min(200, Math.min(questionCount, ordered.length)));
    const selected = ordered.slice(0, limit);

    const markCorrect =
      markingPreset === 'CUSTOM' ? Math.max(1, Math.min(20, customMarkCorrect)) : 4;
    const markIncorrect =
      markingPreset === 'ZERO_NEG'
        ? 0
        : markingPreset === 'CUSTOM'
          ? Math.max(-10, Math.min(0, customMarkIncorrect))
          : -1;

    const classLabel: '11' | '12' | 'ALL' =
      selectedClasses.length === 1 ? selectedClasses[0] : 'ALL';
    const subSummary =
      selectedSubjects.length === 0
        ? 'All Subjects'
        : selectedSubjects.join(', ');
    const topicSummary =
      selectedTopics.length === 0
        ? 'All Topics'
        : selectedTopics.length <= 2
          ? selectedTopics.join(', ')
          : `${selectedTopics.length} Topics`;

    onStartTest({
      title:
        customTitle.trim() ||
        `${EXAM_LABELS[exam]} · Custom (${selectedSubjects.length === 1 ? selectedSubjects[0] : `${selected.length} Qs`})`,
      exam,
      testMode: 'CUSTOM',
      classLevel: classLabel,
      subjectFilter: subSummary,
      topicFilter: topicSummary,
      durationSeconds: Math.max(1, durationMins) * 60,
      questions: selected,
      markingCorrect: markCorrect,
      markingIncorrect: markIncorrect,
    });
  };

  const handleLaunchBooster = async () => {
    if (!boosterReport.unlocked || boosterTotalSelected === 0 || boosterGenerating) return;
    setBoosterError(null);

    const activeTopics = displayedBoosterTopics.filter(
      (td) => boosterEnabledTopics[td.key] && (td.availableVaultCount > 0 || boosterUseAiFallback)
    );
    if (activeTopics.length === 0) return;

    const desiredTargets = activeTopics.map((td) => {
      const cap = boosterUseAiFallback ? Math.max(td.availableVaultCount, 10) : td.availableVaultCount;
      return {
        subject: td.subject,
        topic: td.topic,
        count: Math.min(cap, Math.max(1, boosterQuotas[td.key] ?? td.recommendedQuestionCount)),
      };
    });

    const vaultQuotas = desiredTargets
      .map((t, idx) => ({
        subject: t.subject,
        topic: t.topic,
        count: Math.min(activeTopics[idx].availableVaultCount, t.count),
      }))
      .filter((q) => q.count > 0);

    const vaultSelected =
      vaultQuotas.length > 0
        ? buildBoosterQuestionSet(questions, attempts, vaultQuotas, boosterExamScope)
        : [];

    const shortfallTopics: Array<{ subject: SubjectType; topic: string; needed: number }> = [];
    desiredTargets.forEach((target) => {
      const gotForTopic = vaultSelected.filter(
        (q) =>
          q.subject === target.subject &&
          q.topic.trim().toLowerCase() === target.topic.trim().toLowerCase()
      ).length;
      if (gotForTopic < target.count) {
        shortfallTopics.push({
          subject: target.subject,
          topic: target.topic,
          needed: target.count - gotForTopic,
        });
      }
    });

    const targetExam: ExamType =
      boosterExamScope !== 'ALL'
        ? boosterExamScope
        : vaultSelected[0]?.exam || defaultExam;

    let combinedQuestions: PyqQuestion[] = [...vaultSelected];

    if (shortfallTopics.length > 0 && boosterUseAiFallback) {
      setBoosterGenerating(true);
      try {
        const token = await auth.currentUser?.getIdToken(true);
        if (!token) {
          throw new Error('Please sign in again to generate AI booster drills.');
        }

        const bySubject = new Map<SubjectType, { chapters: string[]; needed: number }>();
        shortfallTopics.forEach((st) => {
          const cur = bySubject.get(st.subject) || { chapters: [], needed: 0 };
          cur.chapters.push(st.topic);
          cur.needed += st.needed;
          bySubject.set(st.subject, cur);
        });

        for (const [sub, group] of bySubject.entries()) {
          const batchCount = Math.min(12, Math.max(1, group.needed));
          const res = await postApiJson<{ questions?: PyqQuestion[]; error?: string }>(
            '/api/tests/generate-ai',
            {
              exam: targetExam,
              classes: ['11', '12'],
              subject: sub,
              chapters: group.chapters.slice(0, 6),
              difficulty: 'MEDIUM',
              questionType: targetExam === 'NEET' ? 'MCQ' : 'MIXED',
              count: batchCount,
              avoidPrompts: combinedQuestions.slice(-8).map((q) => q.prompt.slice(0, 60)),
              preferredModel: aiSettings.model,
              backupModel: aiSettings.backupModel,
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
          if (Array.isArray(res.questions)) {
            combinedQuestions.push(...res.questions);
          }
        }
      } catch (err) {
        if (combinedQuestions.length === 0) {
          setBoosterError(
            err instanceof Error ? err.message : 'Unable to generate AI fallback drills right now.'
          );
          setBoosterGenerating(false);
          return;
        }
      } finally {
        setBoosterGenerating(false);
      }
    }

    if (combinedQuestions.length === 0) return;

    const topicNames = desiredTargets.map((q) => q.topic);

    onStartTest({
      title:
        boosterTitle.trim() ||
        `${EXAM_LABELS[targetExam]} · Weak-Topic Booster (${combinedQuestions.length} Qs)`,
      exam: targetExam,
      testMode: 'BOOSTER',
      classLevel: 'ALL',
      subjectFilter:
        Array.from(new Set(desiredTargets.map((q) => q.subject))).join(', ').slice(0, 75) || 'Mixed',
      topicFilter:
        topicNames.length <= 2
          ? topicNames.join(', ')
          : `${topicNames[0]} + ${topicNames.length - 1} weak topics`,
      durationSeconds: Math.max(5, boosterDurationMins) * 60,
      questions: combinedQuestions,
      markingCorrect: 4,
      markingIncorrect: -1,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight">
            PYQ Test Center
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Launch Daily, Weekly, Monthly, full Custom tests, or a Weak-Topic Booster built from your test diagnostics.
          </p>
        </div>
        <button
          type="button"
          onClick={onGoToVault}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
        >
          <Upload className="w-4 h-4 text-indigo-500" />
          <span>Upload PYQ PDF (100 MB)</span>
        </button>
      </div>

      {questions.length === 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Your PYQ Vault is empty — Start Instantly with Verified Starter PYQs</span>
            </div>
            <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
              Load 20+ curated JEE Main, JEE Advanced (Multi-Correct & Numerical), and NEET PYQs in 1 click so Daily, Weekly, Booster, and Duels work right away.
            </p>
          </div>
          <button
            type="button"
            disabled={seedingStarter}
            onClick={() => void handleLoadStarterClick()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold cursor-pointer shrink-0 whitespace-nowrap"
          >
            {seedingStarter ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>{seedingStarter ? 'Loading...' : 'Load Starter PYQ Pack'}</span>
          </button>
        </div>
      )}

      {starterMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
          {starterMsg}
        </div>
      )}

      {/* 6 Mode Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {([
          ['AI_GENERATOR', 'Generate Test with AI', 'Groq & Multi-AI · Diagrams', Wand2],
          ['DAILY', 'Daily Practice', '15 PYQs · 30 mins', Calendar],
          ['WEEKLY', 'Weekly Checkpoint', '30 PYQs · 60 mins', Layers],
          ['MONTHLY', 'Monthly Grand', '90 PYQs · 180 mins', Sliders],
          ['CUSTOM', 'Custom Builder', 'PYQ Vault & Filters', Play],
          [
            'BOOSTER',
            'Weak-Topic Booster',
            attempts.length >= TESTS_REQUIRED_FOR_BOOSTER
              ? `${boosterReport.weakTopics.length} weak topics ready`
              : `${attempts.length}/${TESTS_REQUIRED_FOR_BOOSTER} tests to unlock`,
            Sparkles,
          ],
        ] as const).map(([mode, label, desc, Icon]) => {
          const active = testMode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => applyPreset(mode)}
              className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                active
                  ? mode === 'BOOSTER'
                    ? 'bg-amber-500 border-amber-500 text-slate-950'
                    : 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-400'
              }`}
            >
              <Icon
                className={`w-5 h-5 mb-2.5 ${
                  active
                    ? mode === 'BOOSTER'
                      ? 'text-slate-950'
                      : 'text-amber-300'
                    : mode === 'BOOSTER'
                      ? 'text-amber-500'
                      : 'text-indigo-500'
                }`}
              />
              <div className="font-bold font-display text-sm">{label}</div>
              <div
                className={`text-xs mt-1 font-mono tabular-nums ${
                  active
                    ? mode === 'BOOSTER'
                      ? 'text-slate-900/80'
                      : 'text-indigo-100'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {desc}
              </div>
            </button>
          );
        })}
      </div>

      {/* MODE: AI QUESTION GENERATOR & QUESTION PAPER CREATOR */}
      {testMode === 'AI_GENERATOR' && (
        <AiQuestionGeneratorPanel
          defaultExam={defaultExam}
          aiSettings={aiSettings}
          providers={providers}
          generatedPapers={generatedPapers}
          savedAiQuestions={savedAiQuestions}
          aiGenerationLogs={aiGenerationLogs}
          requestedPractice={requestedCustomPractice}
          onClearRequestedPractice={onClearRequestedCustomPractice}
          onStartTest={onStartTest}
        />
      )}

      {/* MODE: BOOSTER EXAM */}
      {testMode === 'BOOSTER' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold font-display flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <span>Weak-Topic Diagnostic & Booster Exam</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Analyzes each completed test, weights recent mistakes, and builds a targeted PYQ exam from your weak topics.
              </p>
            </div>
            <select
              value={boosterExamScope}
              onChange={(e) => setBoosterExamScope(e.target.value as 'ALL' | ExamType)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
            >
              <option value="ALL">All Completed Tests ({attempts.length})</option>
              <option value="JEE_MAINS">JEE Main ({attempts.filter((a) => a.exam === 'JEE_MAINS').length})</option>
              <option value="JEE_ADV">JEE Advanced ({attempts.filter((a) => a.exam === 'JEE_ADV').length})</option>
              <option value="NEET">NEET UG ({attempts.filter((a) => a.exam === 'NEET').length})</option>
            </select>
          </div>

          {!boosterReport.unlocked ? (
            <div className="py-8 max-w-xl mx-auto text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-bold font-display">
                  Complete {TESTS_REQUIRED_FOR_BOOSTER} Tests to Unlock Weak-Topic Booster
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Progress:{' '}
                  <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                    {boosterReport.testsCompleted} / {TESTS_REQUIRED_FOR_BOOSTER}
                  </span>{' '}
                  tests completed in this scope. After 2 tests, OBREN inspects every test and generates targeted drills for weak chapters.
                </p>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden max-w-sm mx-auto">
                <div
                  className="h-full bg-amber-500 transition-all"
                  style={{
                    width: `${Math.min(100, Math.round((boosterReport.testsCompleted / TESTS_REQUIRED_FOR_BOOSTER) * 100))}%`,
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => applyPreset('DAILY')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold cursor-pointer"
              >
                <Play className="w-4 h-4" />
                <span>Take a Daily Practice Test Now</span>
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Recent Per-Test Snapshot */}
              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Per-Test Diagnostic Snapshot (Latest {Math.min(4, boosterReport.perTestDiagnostics.length)} Tests)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {boosterReport.perTestDiagnostics.slice(0, 4).map((td) => (
                    <div
                      key={td.attemptId}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-bold truncate">{td.title}</span>
                        <span className="font-mono tabular-nums font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
                          {td.score}/{td.maxScore} · {td.accuracyPercent}%
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        {td.correctCount} right · {td.incorrectCount} wrong · {td.unattemptedCount} skipped · {td.avgTimePerQuestion}s/Q
                      </div>
                      {td.weakestTopics.length > 0 && (
                        <div className="text-[11px] text-rose-600 dark:text-rose-400 truncate">
                          Weak in this test: {td.weakestTopics.map((w) => `${w.topic} (${w.accuracyPercent}%)`).join(' · ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Topic Selection & Question Quota */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-bold font-display">
                    Select Weak Topics & Required Questions
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={boosterUseAiFallback}
                        onChange={(e) => setBoosterUseAiFallback(e.target.checked)}
                        className="rounded border-slate-300 accent-amber-500"
                      />
                      <span>Auto-fill empty weak topics with AI questions</span>
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={boosterIncludeSolid}
                        onChange={(e) => setBoosterIncludeSolid(e.target.checked)}
                        className="rounded border-slate-300 accent-indigo-600"
                      />
                      <span>Show all tested topics</span>
                    </label>
                  </div>
                </div>

                {displayedBoosterTopics.length === 0 ? (
                  <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 text-center text-sm text-slate-500 dark:text-slate-400">
                    All your tested topics currently have strong accuracy! Toggle "Show all tested topics" above to customize a revision booster anyway.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    {displayedBoosterTopics.map((td) => {
                      const canPractice = td.availableVaultCount > 0 || boosterUseAiFallback;
                      const enabled = Boolean(boosterEnabledTopics[td.key]) && canPractice;
                      const maxQuota = boosterUseAiFallback ? Math.max(td.availableVaultCount, 10) : td.availableVaultCount;
                      const quota = boosterQuotas[td.key] ?? td.recommendedQuestionCount;
                      const clampedQuota = Math.min(maxQuota, Math.max(1, quota));
                      return (
                        <div
                          key={td.key}
                          className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900"
                        >
                          <label className="flex items-start gap-3 cursor-pointer min-w-0">
                            <input
                              type="checkbox"
                              disabled={!canPractice}
                              checked={enabled}
                              onChange={(e) =>
                                setBoosterEnabledTopics((prev) => ({
                                  ...prev,
                                  [td.key]: e.target.checked,
                                }))
                              }
                              className="mt-1 rounded border-slate-300 accent-amber-500"
                            />
                            <div className="min-w-0">
                              <div className="font-semibold text-sm flex flex-wrap items-center gap-2">
                                <span>{td.topic}</span>
                                <span
                                  className={`text-[11px] font-mono font-bold ${
                                    td.severity === 'CRITICAL'
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : td.severity === 'NEEDS_WORK'
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : 'text-emerald-600 dark:text-emerald-400'
                                  }`}
                                >
                                  {td.severity === 'CRITICAL'
                                    ? 'Critical'
                                    : td.severity === 'NEEDS_WORK'
                                      ? 'Needs Work'
                                      : 'Solid'}
                                </span>
                                {td.availableVaultCount === 0 && boosterUseAiFallback && (
                                  <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                                    · AI Drill Ready
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                                {td.subject} · Accuracy {td.accuracyPercent}% · {td.incorrect} wrong · {td.unattempted} skipped · {td.avgTimeSeconds}s/Q · {td.availableVaultCount} Vault PYQs
                              </div>
                            </div>
                          </label>

                          {canPractice ? (
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-slate-500 dark:text-slate-400">Questions:</span>
                              <input
                                type="number"
                                min={1}
                                max={maxQuota}
                                disabled={!enabled}
                                value={clampedQuota}
                                onChange={(e) => {
                                  const val = Math.max(
                                    1,
                                    Math.min(maxQuota, Number(e.target.value) || 1)
                                  );
                                  setBoosterQuotas((prev) => ({ ...prev, [td.key]: val }));
                                }}
                                className="w-16 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono tabular-nums text-center"
                              />
                              <span className="text-xs text-slate-400 font-mono tabular-nums">
                                {td.availableVaultCount > 0 ? `/ ${td.availableVaultCount} PYQ` : '/ 10 AI'}
                              </span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={onGoToVault}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0 cursor-pointer"
                            >
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                              <span>Upload {td.topic} PYQs</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                    Booster Exam Title (Optional)
                  </label>
                  <input
                    type="text"
                    maxLength={140}
                    value={boosterTitle}
                    onChange={(e) => setBoosterTitle(e.target.value)}
                    placeholder="e.g., Rotational + Electrostatics Recovery Drill"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                    <span>Duration (minutes)</span>
                    <button
                      type="button"
                      onClick={() => setBoosterDurationMins(Math.max(10, Math.round(boosterTotalSelected * 2.5)))}
                      className="text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      Auto-Time (2.5m/Q)
                    </button>
                  </div>
                  <input
                    type="number"
                    min={5}
                    max={240}
                    value={boosterDurationMins}
                    onChange={(e) => setBoosterDurationMins(Math.max(5, Math.min(240, Number(e.target.value) || 10)))}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono tabular-nums"
                  />
                </div>
              </div>

              {boosterError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                  {boosterError}
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="text-sm font-mono tabular-nums">
                  Booster Exam Size:{' '}
                  <span className="font-bold text-amber-600 dark:text-amber-400">
                    {boosterTotalSelected} Qs
                  </span>{' '}
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    (combines missed/unseen Vault PYQs + AI drills for empty chapters)
                  </span>
                </div>
                <button
                  type="button"
                  disabled={boosterTotalSelected === 0 || boosterGenerating}
                  onClick={() => void handleLaunchBooster()}
                  className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-45 text-slate-950 font-bold text-sm transition-colors cursor-pointer whitespace-nowrap"
                >
                  {boosterGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Generating AI Drills...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Start Weak-Topic Booster ({boosterTotalSelected} Qs)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODE: FULL CUSTOM TEST BUILDER */}
      {testMode === 'CUSTOM' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6">
          {/* Question Source Switcher: AI Original vs PYQ Vault */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setCustomSource('AI')}
              className={`text-left p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                customSource === 'AI'
                  ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/30'
                  : 'border-slate-200 dark:border-slate-800 hover:border-indigo-400'
              }`}
            >
              <Wand2 className={`w-5 h-5 mt-0.5 shrink-0 ${customSource === 'AI' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
              <div>
                <div className="font-bold font-display text-sm">
                  AI Smart Question &amp; Paper Generator
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Configure JEE / NEET / CBSE Boards / Custom papers up to 90 Qs with auto-diagrams, 10 question formats &amp; saved papers.
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setCustomSource('PYQ')}
              className={`text-left p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                customSource === 'PYQ'
                  ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/30'
                  : 'border-slate-200 dark:border-slate-800 hover:border-indigo-400'
              }`}
            >
              <Layers className={`w-5 h-5 mt-0.5 shrink-0 ${customSource === 'PYQ' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
              <div>
                <div className="font-bold font-display text-sm">
                  PYQ Vault Custom Test (Synced PDFs)
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Filter uploaded Previous Year Questions across PDF banks, years, difficulty levels, and unseen-first ordering.
                </div>
              </div>
            </button>
          </div>

          {customSource === 'AI' ? (
            <AiQuestionGeneratorPanel
              defaultExam={defaultExam}
              aiSettings={aiSettings}
              providers={providers}
              generatedPapers={generatedPapers}
              savedAiQuestions={savedAiQuestions}
              aiGenerationLogs={aiGenerationLogs}
              requestedPractice={requestedCustomPractice}
              onClearRequestedPractice={onClearRequestedCustomPractice}
              onStartTest={onStartTest}
            />
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                    Exam Stream
                  </label>
                  <select
                    value={exam}
                    onChange={(e) => {
                      setExam(e.target.value as ExamType);
                      setSelectedSubjects([]);
                      setSelectedTopics([]);
                      setSelectedBankId('ALL');
                      setSelectedYear('ALL');
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium"
                  >
                    <option value="JEE_MAINS">JEE Main</option>
                    <option value="JEE_ADV">JEE Advanced</option>
                    <option value="NEET">NEET UG</option>
                  </select>
                </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                Class Levels (Multi-Select)
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedClasses([])}
                  className={`py-2.5 rounded-xl border text-xs font-semibold cursor-pointer ${
                    selectedClasses.length === 0
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
                  }`}
                >
                  All
                </button>
                {(['11', '12'] as const).map((cls) => {
                  const active = selectedClasses.includes(cls);
                  return (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => toggleClassChip(cls)}
                      className={`py-2.5 rounded-xl border text-xs font-semibold cursor-pointer ${
                        active
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
                      }`}
                    >
                      Class {cls}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                Custom Test Title (Optional)
              </label>
              <input
                type="text"
                maxLength={140}
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="e.g., Sunday Mechanics + Organic Sprint"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>
          </div>

          {/* Multi-Select Subjects */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Subjects (Select one or multiple; leave empty for all)
              </label>
              {selectedSubjects.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSubjects([]);
                    setSelectedTopics([]);
                  }}
                  className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
                >
                  Reset Subjects
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {subjects.map((sub) => {
                const active = selectedSubjects.includes(sub);
                return (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => toggleSubjectChip(sub)}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                      active
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-indigo-400'
                    }`}
                  >
                    {active && <Check className="w-3.5 h-3.5" />}
                    <span>{sub}</span>
                    <span className={`font-mono tabular-nums ${active ? 'text-indigo-100' : 'text-slate-400'}`}>
                      ({subjectCounts[sub] || 0})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Searchable Multi-Select Topics */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Topics / Chapters ({selectedTopics.length > 0 ? `${selectedTopics.length} selected` : `All ${customTopicOptions.length} topics`})
              </label>
              <div className="flex items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedTopics(customTopicOptions.map((t) => t.topic))}
                  className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
                >
                  Select All Visible
                </button>
                {selectedTopics.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedTopics([])}
                    className="text-slate-500 hover:underline cursor-pointer"
                  >
                    Clear Selection
                  </button>
                )}
              </div>
            </div>

            <div className="relative max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={topicSearch}
                onChange={(e) => setTopicSearch(e.target.value)}
                placeholder="Search chapter or topic..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>

            {customTopicOptions.length === 0 ? (
              <div className="text-xs text-slate-500 dark:text-slate-400 py-2">
                No topics available under this exam/subject filter yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-52 overflow-y-auto p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
                {customTopicOptions.map((item) => {
                  const checked = selectedTopics.includes(item.topic);
                  return (
                    <label
                      key={item.topic}
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
                          onChange={() => toggleTopicChip(item.topic)}
                          className="rounded border-slate-300 accent-indigo-600 shrink-0"
                        />
                        <span className="truncate">{item.topic}</span>
                      </span>
                      <span className="font-mono tabular-nums text-[11px] text-slate-400 shrink-0">
                        {item.count}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bank, Question Type, Difficulty, Year, Ordering */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
            <div>
              <label className="block font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                PYQ PDF Bank
              </label>
              <select
                value={selectedBankId}
                onChange={(e) => setSelectedBankId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                <option value="ALL">All Banks ({examBanks.length})</option>
                {examBanks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title} ({b.questionCount})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                Question Type
              </label>
              <select
                value={selectedQType}
                onChange={(e) => setSelectedQType(e.target.value as 'ALL' | QuestionType)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                <option value="ALL">All Types (MCQ + Multi + Numerical)</option>
                <option value="MCQ">MCQ Only</option>
                <option value="MULTI_MCQ">Multi-Correct Only</option>
                <option value="NUMERICAL">Numerical Only</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                Difficulty Level
              </label>
              <select
                value={selectedDifficulty}
                onChange={(e) => setSelectedDifficulty(e.target.value as 'ALL' | DifficultyLevel)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                <option value="ALL">All Difficulties</option>
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                Exam Year / Shift
              </label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                <option value="ALL">All Years</option>
                {availableYears.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                Question Ordering
              </label>
              <select
                value={orderingMode}
                onChange={(e) => setOrderingMode(e.target.value as OrderingMode)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                <option value="SHUFFLE">Randomized Shuffle</option>
                <option value="UNATTEMPTED_FIRST">Unseen Questions First</option>
                <option value="TOPIC_GROUPED">Grouped by Subject & Topic</option>
              </select>
            </div>
          </div>

          {/* Marking Scheme, Question Count, Duration */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                Marking Scheme
              </label>
              <div className="grid grid-cols-3 gap-1.5 text-xs">
                {([
                  ['STANDARD', '+4 / -1 NTA'],
                  ['ZERO_NEG', '+4 / 0 Practice'],
                  ['CUSTOM', 'Custom'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMarkingPreset(key)}
                    className={`py-2 rounded-xl border font-semibold cursor-pointer ${
                      markingPreset === key
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {markingPreset === 'CUSTOM' && (
                <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-0.5">Correct (+)</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={customMarkCorrect}
                      onChange={(e) => setCustomMarkCorrect(Math.max(1, Math.min(20, Number(e.target.value) || 4)))}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-0.5">Incorrect MCQ</label>
                    <input
                      type="number"
                      min={-10}
                      max={0}
                      value={customMarkIncorrect}
                      onChange={(e) => setCustomMarkIncorrect(Math.max(-10, Math.min(0, Number(e.target.value) || 0)))}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                <span>Question Count</span>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                  className="w-16 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono tabular-nums text-right text-slate-900 dark:text-white"
                />
              </div>
              <input
                type="range"
                min={1}
                max={Math.max(10, Math.min(200, customMatchingQuestions.length || 180))}
                value={Math.min(questionCount, Math.max(10, customMatchingQuestions.length || 180))}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                <span>Duration (mins)</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDurationMins(
                        Math.max(5, Math.min(240, Math.min(questionCount, customMatchingQuestions.length || questionCount) * 2))
                      )
                    }
                    className="text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    Auto (2m/Q)
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={240}
                    value={durationMins}
                    onChange={(e) => setDurationMins(Math.max(1, Math.min(240, Number(e.target.value) || 10)))}
                    className="w-16 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono tabular-nums text-right text-slate-900 dark:text-white"
                  />
                </div>
              </div>
              <input
                type="range"
                min={5}
                max={240}
                step={5}
                value={durationMins}
                onChange={(e) => setDurationMins(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="text-sm">
              Matching PYQs in your synced bank:{' '}
              <span className="font-mono tabular-nums font-bold text-indigo-600 dark:text-indigo-400">
                {customMatchingQuestions.length}
              </span>
            </div>

            {customMatchingQuestions.length > 0 ? (
              <button
                type="button"
                onClick={handleLaunchCustom}
                className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                <Play className="w-4 h-4" />
                <span>
                  Start Custom CBT ({Math.min(questionCount, customMatchingQuestions.length)} Qs · {durationMins}m)
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onGoToVault}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                <Upload className="w-4 h-4" />
                <span>Upload PYQ PDF to Populate This Filter</span>
              </button>
            )}
          </div>
            </div>
          )}
        </div>
      )}

      {/* MODE: DAILY / WEEKLY / MONTHLY PRESET FILTER DECK */}
      {(testMode === 'DAILY' || testMode === 'WEEKLY' || testMode === 'MONTHLY') && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                Exam Stream
              </label>
              <select
                value={exam}
                onChange={(e) => {
                  setExam(e.target.value as ExamType);
                  setSubjectFilter('ALL');
                  setTopicFilter('ALL');
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium"
              >
                <option value="JEE_MAINS">JEE Main</option>
                <option value="JEE_ADV">JEE Advanced</option>
                <option value="NEET">NEET UG</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                Class Filter
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                {(['ALL', '11', '12'] as const).map((cls) => (
                  <button
                    key={cls}
                    type="button"
                    onClick={() => setClassLevel(cls)}
                    className={`py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      classLevel === cls
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {cls === 'ALL' ? 'All' : `Class ${cls}`}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                Subject Filter
              </label>
              <select
                value={subjectFilter}
                onChange={(e) => {
                  setSubjectFilter(e.target.value);
                  setTopicFilter('ALL');
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium"
              >
                <option value="ALL">All Subjects</option>
                {subjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                Topic Filter
              </label>
              <select
                value={topicFilter}
                onChange={(e) => setTopicFilter(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium"
              >
                <option value="ALL">All Topics ({availableTopics.length})</option>
                {availableTopics.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                Question Limit: <span className="font-mono tabular-nums text-slate-900 dark:text-white">{questionCount}</span>
              </label>
              <input
                type="range"
                min={5}
                max={180}
                step={5}
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                Timer Duration: <span className="font-mono tabular-nums text-slate-900 dark:text-white">{durationMins} mins</span>
              </label>
              <input
                type="range"
                min={10}
                max={200}
                step={5}
                value={durationMins}
                onChange={(e) => setDurationMins(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="text-sm">
              Matching PYQs in your synced bank:{' '}
              <span className="font-mono tabular-nums font-bold text-indigo-600 dark:text-indigo-400">
                {matchingQuestions.length}
              </span>
            </div>

            {matchingQuestions.length > 0 ? (
              <button
                type="button"
                onClick={handleLaunchPreset}
                className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                <Play className="w-4 h-4" />
                <span>Start NTA CBT Exam ({Math.min(questionCount, matchingQuestions.length)} Qs)</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onGoToVault}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                <Upload className="w-4 h-4" />
                <span>Upload PYQ PDF to Populate This Filter</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
