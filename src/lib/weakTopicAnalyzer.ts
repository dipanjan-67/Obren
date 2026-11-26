import type { ExamType, PyqQuestion, SubjectType, TestAttempt, TestMode } from '../types/obren';

export type WeaknessSeverity = 'CRITICAL' | 'NEEDS_WORK' | 'SOLID';

export interface TopicDiagnostic {
  key: string;
  exam: ExamType;
  subject: SubjectType;
  topic: string;
  totalSeen: number;
  attempted: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  accuracyPercent: number;
  avgTimeSeconds: number;
  weaknessScore: number;
  severity: WeaknessSeverity;
  availableVaultCount: number;
  recommendedQuestionCount: number;
}

export interface PerTestTopicSummary {
  subject: SubjectType;
  topic: string;
  total: number;
  attempted: number;
  correct: number;
  incorrect: number;
  accuracyPercent: number;
  avgTimeSeconds: number;
}

export interface PerTestDiagnostic {
  attemptId: string;
  title: string;
  exam: ExamType;
  testMode: TestMode;
  score: number;
  maxScore: number;
  accuracyPercent: number;
  totalQuestions: number;
  attemptedCount: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  timeSpentSeconds: number;
  avgTimePerQuestion: number;
  weakestTopics: PerTestTopicSummary[];
  strongestTopics: PerTestTopicSummary[];
  allTopics: PerTestTopicSummary[];
}

export interface WeakTopicAnalysisReport {
  unlocked: boolean;
  testsCompleted: number;
  testsRequiredForBooster: number;
  perTestDiagnostics: PerTestDiagnostic[];
  topicDiagnostics: TopicDiagnostic[];
  weakTopics: TopicDiagnostic[];
  totalRecommendedQuestions: number;
}

export const TESTS_REQUIRED_FOR_BOOSTER = 2;

function normalizeTopicName(topic: string): string {
  return (topic || 'Core PYQ').trim();
}

export function analyzeTestsAndWeakTopics(
  attempts: TestAttempt[],
  questions: PyqQuestion[],
  examFilter: ExamType | 'ALL' = 'ALL'
): WeakTopicAnalysisReport {
  const filteredAttempts =
    examFilter === 'ALL' ? attempts : attempts.filter((a) => a.exam === examFilter);

  const testsCompleted = filteredAttempts.length;
  const unlocked = testsCompleted >= TESTS_REQUIRED_FOR_BOOSTER;

  // Map vault questions by (subject::topicLower) for availability checks
  const vaultCountMap = new Map<string, number>();
  questions.forEach((q) => {
    if (examFilter !== 'ALL' && q.exam !== examFilter) return;
    const key = `${q.subject}::${normalizeTopicName(q.topic).toLowerCase()}`;
    vaultCountMap.set(key, (vaultCountMap.get(key) || 0) + 1);
  });

  // Sort attempts newest first if timestamps exist (App already sorts desc, safeguard here)
  const orderedAttempts = [...filteredAttempts].sort((a, b) => {
    const ta = (a.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
    const tb = (b.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
    return tb - ta;
  });

  const perTestDiagnostics: PerTestDiagnostic[] = orderedAttempts.map((attempt) => {
    const results = Array.isArray(attempt.questionResults) ? attempt.questionResults : [];
    const topicMap = new Map<
      string,
      {
        subject: SubjectType;
        topic: string;
        total: number;
        attempted: number;
        correct: number;
        incorrect: number;
        timeSum: number;
      }
    >();

    results.forEach((qr) => {
      const topicName = normalizeTopicName(qr.topic);
      const tKey = `${qr.subject}::${topicName.toLowerCase()}`;
      const existing = topicMap.get(tKey) || {
        subject: qr.subject,
        topic: topicName,
        total: 0,
        attempted: 0,
        correct: 0,
        incorrect: 0,
        timeSum: 0,
      };
      existing.total += 1;
      if (qr.isAttempted) {
        existing.attempted += 1;
        if (qr.isCorrect) existing.correct += 1;
        else existing.incorrect += 1;
      }
      existing.timeSum += qr.timeSpentSeconds || 0;
      topicMap.set(tKey, existing);
    });

    const allTopics: PerTestTopicSummary[] = Array.from(topicMap.values())
      .map((entry) => ({
        subject: entry.subject,
        topic: entry.topic,
        total: entry.total,
        attempted: entry.attempted,
        correct: entry.correct,
        incorrect: entry.incorrect,
        accuracyPercent:
          entry.total > 0 ? Math.round((entry.correct / entry.total) * 100) : 0,
        avgTimeSeconds: entry.total > 0 ? Math.round(entry.timeSum / entry.total) : 0,
      }))
      .sort((a, b) => a.accuracyPercent - b.accuracyPercent || b.incorrect - a.incorrect);

    const attemptedCount =
      attempt.attemptedCount ?? results.filter((r) => r.isAttempted).length;
    const incorrectCount =
      attempt.incorrectCount ?? results.filter((r) => r.isAttempted && !r.isCorrect).length;
    const unattemptedCount = Math.max(0, attempt.totalQuestions - attemptedCount);
    const avgTimePerQuestion =
      attempt.totalQuestions > 0
        ? Math.round(attempt.timeSpentSeconds / attempt.totalQuestions)
        : 0;

    return {
      attemptId: attempt.id,
      title: attempt.title,
      exam: attempt.exam,
      testMode: attempt.testMode,
      score: attempt.score,
      maxScore: attempt.maxScore,
      accuracyPercent: attempt.accuracyPercent,
      totalQuestions: attempt.totalQuestions,
      attemptedCount,
      correctCount: attempt.correctCount,
      incorrectCount,
      unattemptedCount,
      timeSpentSeconds: attempt.timeSpentSeconds,
      avgTimePerQuestion,
      weakestTopics: allTopics.filter((t) => t.accuracyPercent < 70).slice(0, 4),
      strongestTopics: [...allTopics]
        .filter((t) => t.accuracyPercent >= 70)
        .sort((a, b) => b.accuracyPercent - a.accuracyPercent)
        .slice(0, 4),
      allTopics,
    };
  });

  // Aggregate across all filtered tests with higher weight for recent 2 tests
  const aggMap = new Map<
    string,
    {
      exam: ExamType;
      subject: SubjectType;
      topic: string;
      totalSeen: number;
      attempted: number;
      correct: number;
      incorrect: number;
      unattempted: number;
      timeSum: number;
      weightedMisses: number;
      weightedTotal: number;
    }
  >();

  orderedAttempts.forEach((attempt, testIdx) => {
    const recencyWeight = testIdx < 2 ? 1.4 : 1.0;
    const results = Array.isArray(attempt.questionResults) ? attempt.questionResults : [];
    results.forEach((qr) => {
      const topicName = normalizeTopicName(qr.topic);
      const key = `${qr.subject}::${topicName.toLowerCase()}`;
      const row = aggMap.get(key) || {
        exam: attempt.exam,
        subject: qr.subject,
        topic: topicName,
        totalSeen: 0,
        attempted: 0,
        correct: 0,
        incorrect: 0,
        unattempted: 0,
        timeSum: 0,
        weightedMisses: 0,
        weightedTotal: 0,
      };
      row.totalSeen += 1;
      row.weightedTotal += recencyWeight;
      if (qr.isAttempted) {
        row.attempted += 1;
        if (qr.isCorrect) {
          row.correct += 1;
        } else {
          row.incorrect += 1;
          row.weightedMisses += recencyWeight * 1.25;
        }
      } else {
        row.unattempted += 1;
        row.weightedMisses += recencyWeight * 0.85;
      }
      row.timeSum += qr.timeSpentSeconds || 0;
      aggMap.set(key, row);
    });
  });

  const topicDiagnostics: TopicDiagnostic[] = Array.from(aggMap.entries())
    .map(([key, row]) => {
      const accuracyPercent =
        row.totalSeen > 0 ? Math.round((row.correct / row.totalSeen) * 100) : 0;
      const avgTimeSeconds =
        row.totalSeen > 0 ? Math.round(row.timeSum / row.totalSeen) : 0;
      const errorRatio =
        row.weightedTotal > 0 ? row.weightedMisses / row.weightedTotal : 0;
      const timePenalty = avgTimeSeconds > 150 ? 8 : avgTimeSeconds > 110 ? 4 : 0;
      const weaknessScore = Math.round(
        Math.min(100, errorRatio * 75 + (100 - accuracyPercent) * 0.35 + timePenalty)
      );

      let severity: WeaknessSeverity = 'SOLID';
      if (accuracyPercent < 45 || (row.incorrect >= 2 && accuracyPercent < 55)) {
        severity = 'CRITICAL';
      } else if (accuracyPercent < 72 || row.unattempted >= 2) {
        severity = 'NEEDS_WORK';
      }

      const availableVaultCount = vaultCountMap.get(key) || 0;
      const desiredCount =
        severity === 'CRITICAL' ? 6 : severity === 'NEEDS_WORK' ? 4 : 2;
      const recommendedQuestionCount =
        availableVaultCount > 0 ? Math.min(availableVaultCount, desiredCount) : desiredCount;

      return {
        key,
        exam: row.exam,
        subject: row.subject,
        topic: row.topic,
        totalSeen: row.totalSeen,
        attempted: row.attempted,
        correct: row.correct,
        incorrect: row.incorrect,
        unattempted: row.unattempted,
        accuracyPercent,
        avgTimeSeconds,
        weaknessScore,
        severity,
        availableVaultCount,
        recommendedQuestionCount,
      };
    })
    .sort((a, b) => b.weaknessScore - a.weaknessScore || a.accuracyPercent - b.accuracyPercent);

  const weakTopics = topicDiagnostics.filter((t) => t.severity !== 'SOLID');
  const totalRecommendedQuestions = weakTopics.reduce(
    (sum, t) => sum + (t.availableVaultCount > 0 ? t.recommendedQuestionCount : 0),
    0
  );

  return {
    unlocked,
    testsCompleted,
    testsRequiredForBooster: TESTS_REQUIRED_FOR_BOOSTER,
    perTestDiagnostics,
    topicDiagnostics,
    weakTopics,
    totalRecommendedQuestions,
  };
}

export interface BoosterQuotaRequest {
  subject: SubjectType;
  topic: string;
  count: number;
}

export function buildBoosterQuestionSet(
  questions: PyqQuestion[],
  attempts: TestAttempt[],
  quotas: BoosterQuotaRequest[],
  examFilter: ExamType | 'ALL' = 'ALL'
): PyqQuestion[] {
  // Priority score per questionId based on prior test attempts:
  // missed/incorrect = 3, unattempted = 2, unseen = 1, answered correctly before = 0
  const priorityByQid = new Map<string, number>();
  attempts.forEach((a) => {
    a.questionResults?.forEach((qr) => {
      const prev = priorityByQid.get(qr.questionId);
      if (qr.isAttempted && !qr.isCorrect) {
        priorityByQid.set(qr.questionId, 3);
      } else if (!qr.isAttempted) {
        priorityByQid.set(qr.questionId, Math.max(prev ?? 0, 2));
      } else if (prev === undefined) {
        priorityByQid.set(qr.questionId, 0);
      }
    });
  });

  const selected: PyqQuestion[] = [];
  const usedIds = new Set<string>();

  quotas.forEach((quota) => {
    if (quota.count <= 0) return;
    const topicLower = normalizeTopicName(quota.topic).toLowerCase();
    const pool = questions
      .filter(
        (q) =>
          !usedIds.has(q.id) &&
          (examFilter === 'ALL' || q.exam === examFilter) &&
          q.subject === quota.subject &&
          normalizeTopicName(q.topic).toLowerCase() === topicLower
      )
      .sort((a, b) => {
        const pa = priorityByQid.has(a.id) ? (priorityByQid.get(a.id) as number) : 1;
        const pb = priorityByQid.has(b.id) ? (priorityByQid.get(b.id) as number) : 1;
        if (pb !== pa) return pb - pa;
        return Math.random() - 0.5;
      });

    pool.slice(0, quota.count).forEach((q) => {
      usedIds.add(q.id);
      selected.push(q);
    });
  });

  return selected;
}
