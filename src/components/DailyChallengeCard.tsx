import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Flame,
  Play,
  RefreshCw,
  Sparkles,
  Trophy,
  XCircle,
} from 'lucide-react';
import { getApiJson } from '../lib/apiClient';
import { gradeQuestionResponse } from '../lib/examMetrics';
import { auth } from '../lib/firebase';
import { STARTER_PYQ_SEEDS } from '../lib/starterPyqBank';
import type {
  ActiveTestConfig,
  ExamType,
  PyqQuestion,
  QuestionResultItem,
  TestAttempt,
  UserProfile,
} from '../types/obren';
import { EXAM_LABELS, getSubjectsForExam } from '../types/obren';
import { MathText } from './MathText';

interface DailyChallengeCardProps {
  profile: UserProfile;
  onLaunchDailyChallenge?: (cfg: ActiveTestConfig) => void;
  onCompleteDailyChallenge?: (
    attempt: Omit<TestAttempt, 'id' | 'createdAt'>,
    xpEarned: number,
    dateKey: string,
    questions?: PyqQuestion[]
  ) => Promise<void>;
}

interface DailyChallengeApiResponse {
  dateKey: string;
  exam: ExamType;
  questions: PyqQuestion[];
  source: string;
}

function getUtcResetCountdown(): string {
  const now = new Date();
  const nextUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0
  );
  const diffSec = Math.max(0, Math.floor((nextUtc - now.getTime()) / 1000));
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const s = diffSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function buildLocalFallbackChallenge(exam: ExamType, dateKey: string, uid: string): PyqQuestion[] {
  const subjects = getSubjectsForExam(exam);
  const dayNum = dateKey
    .split('-')
    .reduce((sum, part) => sum + (parseInt(part, 10) || 0), 0);

  return subjects.map((sub, idx) => {
    const exactPool = STARTER_PYQ_SEEDS.filter((q) => q.exam === exam && q.subject === sub);
    const subjectPool =
      exactPool.length > 0 ? exactPool : STARTER_PYQ_SEEDS.filter((q) => q.subject === sub);
    const seed = subjectPool[(dayNum + idx) % Math.max(1, subjectPool.length)] || STARTER_PYQ_SEEDS[idx];
    return {
      id: `daily_local_${dateKey}_${exam}_${idx}`,
      ownerId: uid,
      bankId: 'daily-challenge',
      visibility: 'PRIVATE',
      exam,
      classLevel: seed.classLevel,
      subject: sub,
      topic: seed.topic,
      year: `Daily ${dateKey}`,
      questionType: seed.questionType,
      prompt: seed.prompt,
      options: seed.options,
      correctAnswer: seed.correctAnswer,
      solution: seed.solution,
      difficulty: seed.difficulty,
    };
  });
}

const DAILY_SPRINT_SECONDS = 360; // 6 minutes for 3 problems

export const DailyChallengeCard: React.FC<DailyChallengeCardProps> = ({
  profile,
  onLaunchDailyChallenge,
  onCompleteDailyChallenge,
}) => {
  const todayUtcKey = new Date().toISOString().slice(0, 10);
  const [dateKey, setDateKey] = useState(todayUtcKey);
  const [resetClock, setResetClock] = useState(getUtcResetCountdown());
  const [challengeQs, setChallengeQs] = useState<PyqQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  // Inline timed sprint state
  const [sprintOpen, setSprintOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState(DAILY_SPRINT_SECONDS);
  const [submitting, setSubmitting] = useState(false);
  const [sprintResult, setSprintResult] = useState<{
    correct: number;
    score: number;
    xpEarned: number;
    results: QuestionResultItem[];
  } | null>(null);

  const completedToday = profile.lastDailyChallengeDate === dateKey;

  useEffect(() => {
    const id = window.setInterval(() => {
      setResetClock(getUtcResetCountdown());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const fetchChallenge = async () => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const resp = await getApiJson<DailyChallengeApiResponse>(
        `/api/daily-challenge?exam=${encodeURIComponent(profile.targetExam)}`,
        token
      );
      if (Array.isArray(resp.questions) && resp.questions.length > 0) {
        setDateKey(resp.dateKey || todayUtcKey);
        setChallengeQs(resp.questions);
      } else {
        setChallengeQs(buildLocalFallbackChallenge(profile.targetExam, todayUtcKey, profile.uid));
      }
    } catch {
      setChallengeQs(buildLocalFallbackChallenge(profile.targetExam, todayUtcKey, profile.uid));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchChallenge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.targetExam]);

  useEffect(() => {
    if (!sprintOpen || sprintResult) return;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          void handleSubmitSprint(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprintOpen, sprintResult]);

  const subjectOrder = useMemo(() => getSubjectsForExam(profile.targetExam), [profile.targetExam]);

  const handleStartInlineSprint = () => {
    setAnswers({});
    setActiveIdx(0);
    setSecondsLeft(DAILY_SPRINT_SECONDS);
    setSprintResult(null);
    setSprintOpen(true);
  };

  const handleSubmitSprint = async (timedOut = false) => {
    if (submitting || sprintResult || challengeQs.length === 0) return;
    setSubmitting(true);
    try {
      let correctCount = 0;
      let attemptedCount = 0;
      let incorrectCount = 0;
      let rawScore = 0;
      const subjectStats: Record<
        string,
        { total: number; correct: number; incorrect: number; score: number }
      > = {};

      const results: QuestionResultItem[] = challengeQs.map((q) => {
        const ua = answers[q.id] || '';
        const graded = gradeQuestionResponse(q, ua, 4, -1);
        if (!subjectStats[q.subject]) {
          subjectStats[q.subject] = { total: 0, correct: 0, incorrect: 0, score: 0 };
        }
        subjectStats[q.subject].total += 1;
        if (graded.isAttempted) {
          attemptedCount += 1;
          if (graded.isCorrect) {
            correctCount += 1;
            subjectStats[q.subject].correct += 1;
          } else {
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
          timeSpentSeconds: Math.round(
            Math.max(5, (DAILY_SPRINT_SECONDS - secondsLeft) / Math.max(1, challengeQs.length))
          ),
        };
      });

      const maxScore = challengeQs.length * 4;
      const accuracyPercent =
        attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0;
      const timeSpentSeconds = timedOut
        ? DAILY_SPRINT_SECONDS
        : Math.max(5, DAILY_SPRINT_SECONDS - secondsLeft);

      // Award +60 base bonus XP + 20 perfection bonus if 3/3 (only on first completion of the day)
      const xpEarned = completedToday
        ? 0
        : 60 + (correctCount === challengeQs.length ? 20 : 0);

      if (onCompleteDailyChallenge) {
        await onCompleteDailyChallenge(
          {
            ownerId: profile.uid,
            title: `Daily 3-Subject Sprint (${dateKey})`,
            exam: profile.targetExam,
            testMode: 'DAILY_CHALLENGE',
            classLevel: 'ALL',
            subjectFilter: subjectOrder.join(', '),
            topicFilter: 'Daily Challenge',
            totalQuestions: challengeQs.length,
            attemptedCount,
            correctCount,
            incorrectCount,
            score: rawScore,
            maxScore,
            accuracyPercent,
            timeSpentSeconds,
            subjectStats,
            questionResults: results,
          },
          xpEarned,
          dateKey,
          challengeQs
        );
      }

      setSprintResult({
        correct: correctCount,
        score: rawScore,
        xpEarned,
        results,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const currentQ = challengeQs[activeIdx] || challengeQs[0];
  const minsStr = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const secsStr = String(secondsLeft % 60).padStart(2, '0');

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400">
            <Sparkles className="w-4 h-4" />
            <span>24h Daily Tri-Subject Challenge · {EXAM_LABELS[profile.targetExam]}</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 font-mono">
              <Flame className="w-3 h-3" />
              {profile.dailyChallengeStreak || 0}d streak
            </span>
          </div>
          <h2 className="text-lg font-bold font-display">
            3 Quick Problems ({subjectOrder.join(' + ')})
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            6-minute active-recall sprint across all 3 subjects. Awards{' '}
            <span className="font-semibold text-amber-600 dark:text-amber-400">+60 Bonus XP</span>{' '}
            (+20 extra for 3/3). Resets in{' '}
            <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
              {resetClock}
            </span>
            .
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {completedToday ? (
            <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4" />
              Completed Today
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
              <Trophy className="w-3.5 h-3.5" />
              3 Questions · 6 Mins
            </span>
          )}

          <button
            type="button"
            disabled={loading || challengeQs.length === 0}
            onClick={handleStartInlineSprint}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{sprintOpen ? 'Restart Sprint' : completedToday ? 'Practice Again' : 'Solve Inline'}</span>
          </button>

          {onLaunchDailyChallenge && challengeQs.length > 0 && (
            <button
              type="button"
              disabled={loading}
              onClick={() =>
                onLaunchDailyChallenge({
                  title: `Daily Challenge (${dateKey})`,
                  exam: profile.targetExam,
                  testMode: 'DAILY_CHALLENGE',
                  classLevel: 'ALL',
                  subjectFilter: subjectOrder.join(', '),
                  topicFilter: 'Daily Challenge',
                  durationSeconds: DAILY_SPRINT_SECONDS,
                  questions: challengeQs,
                })
              }
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer"
            >
              Open Full CBT
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>Preparing today&apos;s 3-subject sprint...</span>
        </div>
      )}

      {sprintOpen && currentQ && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              {challengeQs.map((q, idx) => {
                const answered = Boolean(answers[q.id]?.trim());
                const res = sprintResult?.results[idx];
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setActiveIdx(idx)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      idx === activeIdx
                        ? 'bg-indigo-600 text-white'
                        : res
                          ? res.isCorrect
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                          : answered
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-300'
                            : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Q{idx + 1} · {q.subject}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3">
              {!sprintResult && (
                <div
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-mono text-xs font-bold ${
                    secondsLeft <= 60
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    {minsStr}:{secsStr}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => setSprintOpen(false)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                {currentQ.subject} · {currentQ.topic}
              </span>
              <span className="font-mono">
                Class {currentQ.classLevel} · {currentQ.questionType}
              </span>
            </div>

            <div className="text-sm leading-relaxed text-slate-900 dark:text-slate-100">
              <MathText text={currentQ.prompt} />
            </div>

            {currentQ.questionType === 'NUMERICAL' || !currentQ.options || currentQ.options.length === 0 ? (
              <input
                type="text"
                disabled={Boolean(sprintResult)}
                value={answers[currentQ.id] || ''}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [currentQ.id]: e.target.value }))
                }
                placeholder="Enter numerical value..."
                className="w-full sm:w-64 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-sm"
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {currentQ.options.map((opt, oIdx) => {
                  const selected = answers[currentQ.id] === opt;
                  const isCorrectOpt = sprintResult && opt === currentQ.correctAnswer;
                  const isWrongSelected = sprintResult && selected && opt !== currentQ.correctAnswer;
                  return (
                    <button
                      key={`${currentQ.id}_opt_${oIdx}`}
                      type="button"
                      disabled={Boolean(sprintResult)}
                      onClick={() =>
                        setAnswers((prev) => ({ ...prev, [currentQ.id]: opt }))
                      }
                      className={`text-left px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm transition-colors cursor-pointer flex items-start gap-2 ${
                        isCorrectOpt
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 font-semibold'
                          : isWrongSelected
                            ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200'
                            : selected
                              ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 font-semibold'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-indigo-300'
                      }`}
                    >
                      <span className="font-mono font-bold text-slate-400 shrink-0">
                        ({String.fromCharCode(65 + oIdx)})
                      </span>
                      <span className="flex-1">
                        <MathText text={opt} />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {sprintResult && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold">
                  {sprintResult.results[activeIdx]?.isCorrect ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" /> Correct!
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                      <XCircle className="w-4 h-4" /> Answer: <MathText text={currentQ.correctAnswer} />
                    </span>
                  )}
                </div>
                {currentQ.solution && (
                  <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    <span className="font-semibold">Solution: </span>
                    <MathText text={currentQ.solution} />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="text-xs text-slate-500">
              {sprintResult ? (
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  Score: {sprintResult.score}/{challengeQs.length * 4} · {sprintResult.correct}/
                  {challengeQs.length} correct
                  {sprintResult.xpEarned > 0 ? ` · +${sprintResult.xpEarned} Bonus XP awarded!` : ''}
                </span>
              ) : (
                <span>
                  Answered {Object.values(answers).filter((v) => v.trim()).length} of{' '}
                  {challengeQs.length}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {activeIdx < challengeQs.length - 1 && (
                <button
                  type="button"
                  onClick={() => setActiveIdx((i) => Math.min(challengeQs.length - 1, i + 1))}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Next Subject
                </button>
              )}
              {!sprintResult && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleSubmitSprint(false)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                >
                  {submitting ? 'Grading...' : 'Submit Daily Challenge'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
