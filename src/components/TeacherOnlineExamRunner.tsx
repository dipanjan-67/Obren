import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  CheckCircle2,
  Clock,
  Eye,
  HelpCircle,
  RotateCcw,
  Send,
  X,
  XCircle,
} from 'lucide-react';
import { MathText } from './MathText';
import { QuestionDiagramViewer } from './QuestionDiagramViewer';
import { submitStudentExamAttempt } from '../lib/teacherClient';
import type { TeacherTestQuestion, TeacherTest } from '../../server/teacherRoutes';

interface TeacherOnlineExamRunnerProps {
  test: TeacherTest;
  attemptId: string;
  serverExpiresAt: number;
  initialAnswers?: Record<string, any>;
  onExit: () => void;
}

type QuestionStatus = 'NOT_VISITED' | 'NOT_ANSWERED' | 'ANSWERED' | 'MARKED_FOR_REVIEW';

export const TeacherOnlineExamRunner: React.FC<TeacherOnlineExamRunnerProps> = ({
  test,
  attemptId,
  serverExpiresAt,
  initialAnswers = {},
  onExit,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>(initialAnswers);
  const [visitedIndices, setVisitedIndices] = useState<Set<number>>(() => new Set([0]));
  const [markedIndices, setMarkedIndices] = useState<Set<number>>(new Set());
  const [timeLeftSec, setTimeLeftSec] = useState<number>(() => {
    const diff = Math.floor((serverExpiresAt - Date.now()) / 1000);
    return Math.max(0, diff);
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [resultData, setResultData] = useState<{
    score: number;
    maxScore: number;
    accuracyPercent: number;
    correctCount: number;
    incorrectCount: number;
    unattemptedCount: number;
    resultsReleased: boolean;
    questionResults: any[] | null;
  } | null>(null);

  const questions: TeacherTestQuestion[] = test.questions || [];
  const currentQ: TeacherTestQuestion | undefined = questions[currentIndex];

  // Track visited indices whenever current index changes
  useEffect(() => {
    setVisitedIndices((prev) => {
      const next = new Set(prev);
      next.add(currentIndex);
      return next;
    });
  }, [currentIndex]);

  // Server-authoritative countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Math.floor((serverExpiresAt - Date.now()) / 1000);
      if (diff <= 0) {
        setTimeLeftSec(0);
        clearInterval(interval);
        // Auto-submit exam when time runs out
        if (!resultData && !submitting) {
          handleSubmitExam();
        }
      } else {
        setTimeLeftSec(diff);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [serverExpiresAt, answers, resultData, submitting]);

  const formatTimer = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Determine status for question palette
  const getQuestionStatus = (index: number): QuestionStatus => {
    const q = questions[index];
    if (!q) return 'NOT_VISITED';
    const isAnswered =
      answers[q.id] !== undefined &&
      answers[q.id] !== null &&
      answers[q.id] !== '' &&
      !(Array.isArray(answers[q.id]) && answers[q.id].length === 0);

    if (markedIndices.has(index)) return 'MARKED_FOR_REVIEW';
    if (isAnswered) return 'ANSWERED';
    if (visitedIndices.has(index)) return 'NOT_ANSWERED';
    return 'NOT_VISITED';
  };

  // Status counts for summary modal
  const summaryCounts = useMemo(() => {
    let answered = 0;
    let marked = 0;
    let notAnswered = 0;
    let notVisited = 0;

    questions.forEach((_, idx) => {
      const status = getQuestionStatus(idx);
      if (status === 'ANSWERED') answered++;
      else if (status === 'MARKED_FOR_REVIEW') marked++;
      else if (status === 'NOT_ANSWERED') notAnswered++;
      else notVisited++;
    });

    return { answered, marked, notAnswered, notVisited, total: questions.length };
  }, [questions, answers, markedIndices, visitedIndices]);

  // Answer handlers
  const handleSingleSelect = (val: string) => {
    if (!currentQ) return;
    setAnswers((prev) => ({ ...prev, [currentQ.id]: val }));
  };

  const handleMultiSelect = (val: string) => {
    if (!currentQ) return;
    const currentList: string[] = Array.isArray(answers[currentQ.id]) ? [...answers[currentQ.id]] : [];
    const idx = currentList.indexOf(val);
    if (idx >= 0) {
      currentList.splice(idx, 1);
    } else {
      currentList.push(val);
    }
    setAnswers((prev) => ({ ...prev, [currentQ.id]: currentList }));
  };

  const handleNumericalInput = (val: string) => {
    if (!currentQ) return;
    setAnswers((prev) => ({ ...prev, [currentQ.id]: val }));
  };

  const handleClearResponse = () => {
    if (!currentQ) return;
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[currentQ.id];
      return next;
    });
  };

  const handleToggleMarkForReview = () => {
    setMarkedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(currentIndex)) {
        next.delete(currentIndex);
      } else {
        next.add(currentIndex);
      }
      return next;
    });
  };

  const handleSaveAndNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleSubmitExam = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    setShowSubmitModal(false);
    try {
      const res = await submitStudentExamAttempt(attemptId, answers);
      setResultData(res);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit test.');
    } finally {
      setSubmitting(false);
    }
  };

  // Result view after submission
  if (resultData) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4 text-slate-900 dark:text-slate-100">
        <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <h2 className="text-2xl font-black font-display mb-2">Test Submitted Successfully!</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
            Test: <span className="font-semibold text-slate-800 dark:text-slate-200">{test.title}</span> ·
            Group: {test.targetGroupNames?.[0] || 'Assigned Group'}
          </p>

          {/* Performance Overview */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl mx-auto mb-8">
            <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40">
              <div className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold mb-1">
                Score Obtained
              </div>
              <div className="text-2xl font-black font-mono">
                {resultData.score}{' '}
                <span className="text-xs text-slate-400 font-normal">/ {resultData.maxScore}</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/40">
              <div className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mb-1">
                Accuracy
              </div>
              <div className="text-2xl font-black font-mono">{resultData.accuracyPercent}%</div>
            </div>

            <div className="p-4 rounded-2xl bg-teal-50 dark:bg-teal-950/40 border border-teal-100 dark:border-teal-900/40">
              <div className="text-xs text-teal-600 dark:text-teal-400 font-semibold mb-1">
                Correct
              </div>
              <div className="text-2xl font-black font-mono text-teal-600 dark:text-teal-400">
                {resultData.correctCount}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/40">
              <div className="text-xs text-rose-600 dark:text-rose-400 font-semibold mb-1">
                Incorrect
              </div>
              <div className="text-2xl font-black font-mono text-rose-600 dark:text-rose-400">
                {resultData.incorrectCount}
              </div>
            </div>
          </div>

          {!resultData.resultsReleased ? (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 text-sm max-w-xl mx-auto mb-8">
              <p className="font-semibold mb-1">Detailed Solutions Pending Release</p>
              <p className="text-xs opacity-90">
                Your answers have been securely logged. The complete question-wise breakdown and
                solutions will appear here as soon as your teacher releases test results.
              </p>
            </div>
          ) : (
            <div className="text-left mt-8 pt-8 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-indigo-600" />
                Question-Wise Analysis & Solutions
              </h3>
              <div className="space-y-4">
                {resultData.questionResults?.map((q, idx) => (
                  <div
                    key={q.questionId || idx}
                    className={`p-4 rounded-2xl border text-sm ${
                      q.isCorrect
                        ? 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20'
                        : q.userAnswer === undefined
                          ? 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900'
                          : 'border-rose-200 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/20'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold mb-2">
                      <span>Question {idx + 1}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-mono ${
                          q.isCorrect
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                            : q.userAnswer === undefined
                              ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                              : 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300'
                        }`}
                      >
                        {q.marksAwarded >= 0 ? `+${q.marksAwarded}` : q.marksAwarded} Marks
                      </span>
                    </div>
                    {(() => {
                      const matchedQ = questions.find((item) => item.id === q.questionId);
                      return (
                        <>
                          <div className="mb-2">
                            <MathText text={matchedQ?.prompt || ''} />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono my-2">
                            <div className="p-2 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                              <span className="text-slate-400">Your Answer: </span>
                              <span className="font-bold">
                                {q.userAnswer !== undefined ? JSON.stringify(q.userAnswer) : 'Not Answered'}
                              </span>
                            </div>
                            <div className="p-2 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                              <span className="text-slate-400">Correct Answer: </span>
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                {JSON.stringify(q.correctAnswer)}
                              </span>
                            </div>
                          </div>
                          {(q.explanation || matchedQ?.explanation) && (
                            <div className="mt-2 text-xs bg-slate-100 dark:bg-slate-800/80 p-3 rounded-xl text-slate-700 dark:text-slate-300">
                              <span className="font-bold text-indigo-600 dark:text-indigo-400 block mb-1">
                                Solution:
                              </span>
                              <MathText text={q.explanation || matchedQ?.explanation || ''} />
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onExit}
            className="mt-6 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-colors cursor-pointer"
          >
            Back to Assigned Tests
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Exam Navigation Bar */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3.5 flex items-center justify-between shadow-sm sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="text-base font-extrabold font-display">{test.title}</div>
          <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
            {test.subject}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* Server-Synched Timer */}
          <div
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-sm font-mono font-bold ${
              timeLeftSec < 300
                ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 animate-pulse'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4 text-amber-500" />
            <span>Time Left: {formatTimer(timeLeftSec)}</span>
          </div>

          <button
            type="button"
            onClick={() => setShowSubmitModal(true)}
            className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors cursor-pointer"
          >
            Submit Test
          </button>
        </div>
      </header>

      {/* Main Examination Stage */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Question Area */}
        <div className="lg:col-span-8 flex flex-col bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm min-h-[580px] justify-between">
          {currentQ ? (
            <div>
              {/* Question Header & Marking Scheme */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-6">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold font-mono">
                    Question {currentIndex + 1} of {questions.length}
                  </span>
                  <span className="text-xs text-slate-500 capitalize">
                    {currentQ.type.replace('_', ' ')}
                  </span>
                </div>

                <div className="text-xs font-mono font-semibold flex items-center gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400">
                    +{Math.abs(currentQ.positiveMarks || 4)}
                  </span>
                  <span className="text-slate-300 dark:text-slate-600">/</span>
                  <span className="text-rose-600 dark:text-rose-400">
                    -{Math.abs(currentQ.negativeMarks ?? 1)}
                  </span>
                </div>
              </div>
              {submitError && (
                <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
                  {submitError}
                </div>
              )}

              {/* Question Diagram / Image if present */}
              {currentQ.diagramSvg && (
                <div className="mb-6 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 max-h-72 flex justify-center">
                  <QuestionDiagramViewer diagramSvg={currentQ.diagramSvg} compact />
                </div>
              )}
              {currentQ.imageUrl && (
                <div className="mb-6 flex justify-center">
                  <img
                    src={currentQ.imageUrl}
                    alt="Question Diagram"
                    className="max-h-72 rounded-2xl border border-slate-200 dark:border-slate-800 object-contain"
                  />
                </div>
              )}

              {/* Question Statement / Prompt */}
              <div className="text-base sm:text-lg font-medium leading-relaxed mb-6 text-slate-800 dark:text-slate-100">
                <MathText text={currentQ.prompt} />
              </div>

              {/* Options Section */}
              <div className="space-y-3 mb-6">
                {currentQ.type === 'NUMERICAL' ? (
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                    <label className="block text-xs font-semibold text-slate-500 mb-2">
                      Enter Numerical Value (Decimals or Integers):
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={answers[currentQ.id] ?? ''}
                      onChange={(e) => handleNumericalInput(e.target.value)}
                      placeholder="e.g. 4.5 or 24"
                      className="w-full sm:w-64 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                ) : currentQ.type === 'MULTI_MCQ' ? (
                  currentQ.options?.map((opt: string, oIdx: number) => {
                    const optKey = String.fromCharCode(65 + oIdx);
                    const selectedList: string[] = Array.isArray(answers[currentQ.id])
                      ? answers[currentQ.id]
                      : [];
                    const isChecked = selectedList.includes(optKey);
                    return (
                      <label
                        key={optKey}
                        onClick={() => handleMultiSelect(optKey)}
                        className={`flex items-start gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer ${
                          isChecked
                            ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-500 text-indigo-900 dark:text-indigo-200 font-medium'
                            : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="mt-1 rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700">
                          {optKey}
                        </span>
                        <div className="flex-1 text-sm">
                          <MathText text={opt} />
                        </div>
                      </label>
                    );
                  })
                ) : (
                  currentQ.options?.map((opt: string, oIdx: number) => {
                    const optKey = String.fromCharCode(65 + oIdx);
                    const isSelected = answers[currentQ.id] === optKey;
                    return (
                      <label
                        key={optKey}
                        onClick={() => handleSingleSelect(optKey)}
                        className={`flex items-start gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-500 text-indigo-900 dark:text-indigo-200 font-medium'
                            : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`q_${currentQ.id}`}
                          checked={isSelected}
                          onChange={() => {}}
                          className="mt-1 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700">
                          {optKey}
                        </span>
                        <div className="flex-1 text-sm">
                          <MathText text={opt} />
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400">No question selected</div>
          )}

          {/* Action Button Controls */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleMarkForReview}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                  markedIndices.has(currentIndex)
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                }`}
              >
                <Bookmark className="w-3.5 h-3.5" />
                {markedIndices.has(currentIndex) ? 'Unmark Review' : 'Mark for Review'}
              </button>

              <button
                type="button"
                onClick={handleClearResponse}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Clear Response
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={handlePrev}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 disabled:opacity-40 text-slate-700 dark:text-slate-300 hover:bg-slate-200 cursor-pointer flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Previous
              </button>

              <button
                type="button"
                onClick={handleSaveAndNext}
                disabled={currentIndex === questions.length - 1}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white transition-colors cursor-pointer flex items-center gap-1"
              >
                Save & Next
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Question Palette & Legend */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4">
            Question Palette
          </h3>

          {/* Status Legend */}
          <div className="grid grid-cols-2 gap-2 text-[11px] mb-5 pb-5 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-lg bg-emerald-500 text-white font-bold flex items-center justify-center text-[10px]">
                {summaryCounts.answered}
              </div>
              <span className="text-slate-600 dark:text-slate-400">Answered</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-lg bg-rose-500 text-white font-bold flex items-center justify-center text-[10px]">
                {summaryCounts.notAnswered}
              </div>
              <span className="text-slate-600 dark:text-slate-400">Not Answered</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center text-[10px]">
                {summaryCounts.marked}
              </div>
              <span className="text-slate-600 dark:text-slate-400">Marked Review</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold flex items-center justify-center text-[10px]">
                {summaryCounts.notVisited}
              </div>
              <span className="text-slate-600 dark:text-slate-400">Not Visited</span>
            </div>
          </div>

          {/* Question Grid Buttons */}
          <div className="grid grid-cols-5 gap-2 max-h-72 overflow-y-auto pr-1 mb-6">
            {questions.map((_, idx) => {
              const status = getQuestionStatus(idx);
              const isCurrent = idx === currentIndex;
              let bg = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
              if (status === 'ANSWERED') bg = 'bg-emerald-500 text-white';
              else if (status === 'MARKED_FOR_REVIEW') bg = 'bg-indigo-600 text-white';
              else if (status === 'NOT_ANSWERED') bg = 'bg-rose-500 text-white';

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  className={`h-10 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer relative ${bg} ${
                    isCurrent ? 'ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-slate-900 scale-105' : ''
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowSubmitModal(true)}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-md shadow-indigo-500/20"
          >
            Submit Entire Examination
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl">
            <h3 className="text-lg font-bold mb-2">Submit Examination?</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Are you sure you want to finish and submit your test? Here is your attempt summary:
            </p>

            <div className="grid grid-cols-2 gap-3 text-xs mb-6">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                <span className="text-slate-400 block">Total Questions</span>
                <span className="text-base font-bold font-mono">{summaryCounts.total}</span>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                <span className="text-emerald-500 block">Answered</span>
                <span className="text-base font-bold font-mono">{summaryCounts.answered}</span>
              </div>
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300">
                <span className="text-rose-500 block">Not Answered</span>
                <span className="text-base font-bold font-mono">{summaryCounts.notAnswered}</span>
              </div>
              <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
                <span className="text-indigo-500 block">Marked for Review</span>
                <span className="text-base font-bold font-mono">{summaryCounts.marked}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Continue Test
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmitExam}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                {submitting ? 'Submitting...' : 'Confirm Submission'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
