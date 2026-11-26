import React, { useState, useEffect } from 'react';
import { Award, CheckCircle2, Clock, HelpCircle, RefreshCw, Trophy, X, ArrowRight, ArrowLeft } from 'lucide-react';
import { MathText } from './MathText';
import type { SyllabusChapter } from '../lib/syllabusCatalog';
import type { RevisionTestQuestion, RevisionTestAttempt } from '../types/flashcards';

interface FlashcardTestModalProps {
  chapter: SyllabusChapter;
  questions: RevisionTestQuestion[];
  onClose: () => void;
  onSubmitAttempt: (attempt: Omit<RevisionTestAttempt, 'id' | 'userId'>) => Promise<void>;
}

export const FlashcardTestModal: React.FC<FlashcardTestModalProps> = ({
  chapter,
  questions,
  onClose,
  onSubmitAttempt,
}) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [markedForReview, setMarkedForReview] = useState<Record<number, boolean>>({});
  const [timeLeft, setTimeLeft] = useState(900); // 15 minutes
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultAttempt, setResultAttempt] = useState<Omit<RevisionTestAttempt, 'id' | 'userId'> | null>(null);

  useEffect(() => {
    if (submitted) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmitTest();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [submitted, selectedAnswers]);

  const currentQ = questions[currentIdx] || questions[0];

  const handleSelectOption = (opt: string) => {
    setSelectedAnswers((prev) => ({ ...prev, [currentIdx]: opt }));
  };

  const handleSubmitTest = async () => {
    if (isSubmitting || submitted) return;
    setIsSubmitting(true);

    let correctCount = 0;
    let incorrectCount = 0;
    let unattemptedCount = 0;

    const questionResults = questions.map((q, idx) => {
      const userAns = selectedAnswers[idx] || '';
      const isCorrect = userAns === q.correctAnswer;
      if (!userAns) unattemptedCount++;
      else if (isCorrect) correctCount++;
      else incorrectCount++;

      return {
        questionId: q.id,
        userAnswer: userAns,
        correctAnswer: q.correctAnswer,
        isCorrect,
      };
    });

    const score = correctCount * 4 - incorrectCount * 1;
    const maxScore = questions.length * 4;
    const attemptedTotal = correctCount + incorrectCount;
    const accuracyPercent = attemptedTotal > 0 ? Number(((correctCount / attemptedTotal) * 100).toFixed(1)) : 0;
    const timeSpentSeconds = 900 - timeLeft;

    const attemptData: Omit<RevisionTestAttempt, 'id' | 'userId'> = {
      chapter: chapter.name,
      subject: chapter.subject,
      score,
      maxScore,
      correctCount,
      incorrectCount,
      unattemptedCount,
      accuracyPercent,
      timeSpentSeconds,
      questionResults,
      createdAt: Date.now(),
    };

    try {
      await onSubmitAttempt(attemptData);
      setResultAttempt(attemptData);
      setSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (submitted && resultAttempt) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md overflow-y-auto">
        <div className="w-full max-w-2xl rounded-3xl border border-indigo-500/30 bg-white p-6 sm:p-8 shadow-2xl dark:border-indigo-900/50 dark:bg-slate-900 space-y-6 my-auto">
          <div className="text-center space-y-2">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/30">
              <Trophy className="h-8 w-8" />
            </div>
            <span className="inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              Revision Test Submitted Successfully
            </span>
            <h3 className="text-2xl font-black font-display text-slate-900 dark:text-white">
              {chapter.name} Performance Report
            </h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 text-center dark:border-indigo-900/30 dark:bg-indigo-950/20">
              <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">Score</span>
              <div className="text-2xl font-black text-indigo-700 dark:text-indigo-300">{resultAttempt.score} / {resultAttempt.maxScore}</div>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 text-center dark:border-emerald-900/30 dark:bg-emerald-950/20">
              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Correct</span>
              <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{resultAttempt.correctCount}</div>
            </div>
            <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4 text-center dark:border-rose-900/30 dark:bg-rose-950/20">
              <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase">Incorrect</span>
              <div className="text-2xl font-black text-rose-700 dark:text-rose-300">{resultAttempt.incorrectCount}</div>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 text-center dark:border-amber-900/30 dark:bg-amber-950/20">
              <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase">Accuracy</span>
              <div className="text-2xl font-black text-amber-700 dark:text-amber-300">{resultAttempt.accuracyPercent}%</div>
            </div>
          </div>

          <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
            <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Question Explanations Review</h4>
            {questions.map((q, qIdx) => {
              const res = resultAttempt.questionResults[qIdx];
              return (
                <div key={q.id} className={`p-4 rounded-2xl border ${res.isCorrect ? 'border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-950/10' : 'border-rose-200 bg-rose-50/30 dark:border-rose-900/40 dark:bg-rose-950/10'}`}>
                  <div className="flex items-center justify-between text-xs font-bold mb-1">
                    <span className="text-slate-900 dark:text-white">Q{qIdx + 1}: {q.concept}</span>
                    <span className={res.isCorrect ? 'text-emerald-600' : 'text-rose-600'}>{res.isCorrect ? 'Correct (+4)' : 'Incorrect (-1)'}</span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 mb-2"><MathText text={q.prompt} /></p>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="font-bold">Solution: </span><MathText text={q.solution} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-2">
            <button
              onClick={onClose}
              className="w-full rounded-xl bg-indigo-600 py-3 text-xs font-bold text-white hover:bg-indigo-700 cursor-pointer"
            >
              Return to Flashcard Centre
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md">
      <div className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              <Award className="h-4 w-4" />
              {chapter.subject} · 15-Question Revision Assessment
            </div>
            <h3 className="mt-0.5 font-display text-base font-bold text-slate-900 dark:text-white">
              {chapter.name}
            </h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50 dark:text-amber-300">
              <Clock className="h-4 w-4" />
              <span>{formatTime(timeLeft)}</span>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Question Navigation Bar */}
        <div className="bg-slate-50 dark:bg-slate-950 px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto">
          {questions.map((_, idx) => {
            const isAnswered = !!selectedAnswers[idx];
            const isCurrent = idx === currentIdx;
            return (
              <button
                key={idx}
                onClick={() => setCurrentIdx(idx)}
                className={`h-8 w-8 rounded-xl text-xs font-bold shrink-0 transition cursor-pointer flex items-center justify-center ${
                  isCurrent
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : isAnswered
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                    : 'bg-white text-slate-700 border border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800'
                }`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>

        {/* Question Content */}
        <div className="p-6 sm:p-8 flex-1 overflow-y-auto space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Question {currentIdx + 1} of {questions.length} ({currentQ.difficulty})
            </span>
            <span className="text-xs text-slate-500">
              Concept: {currentQ.concept}
            </span>
          </div>

          <div className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white leading-relaxed">
            <MathText text={currentQ.prompt} />
          </div>

          <div className="space-y-3">
            {currentQ.options.map((opt, optIdx) => {
              const isSelected = selectedAnswers[currentIdx] === opt;
              return (
                <button
                  key={optIdx}
                  onClick={() => handleSelectOption(opt)}
                  className={`w-full text-left p-4 rounded-2xl border transition cursor-pointer flex items-center gap-3 ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/70 dark:border-indigo-500 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-slate-700 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <div className={`h-6 w-6 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 ${isSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-700'}`}>
                    {String.fromCharCode(65 + optIdx)}
                  </div>
                  <div className="flex-1 text-sm font-medium">
                    <MathText text={opt} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/50 flex items-center justify-between">
          <button
            disabled={currentIdx === 0}
            onClick={() => setCurrentIdx((p) => Math.max(0, p - 1))}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            Previous
          </button>

          <div className="flex items-center gap-3">
            {currentIdx < questions.length - 1 ? (
              <button
                onClick={() => setCurrentIdx((p) => Math.min(questions.length - 1, p + 1))}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-700 cursor-pointer shadow-md shadow-indigo-600/30"
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                disabled={isSubmitting}
                onClick={() => void handleSubmitTest()}
                className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700 cursor-pointer shadow-lg shadow-emerald-600/30"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Assessment'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
