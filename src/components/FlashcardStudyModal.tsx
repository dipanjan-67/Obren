import React, { useState } from 'react';
import { BookOpen, CheckCircle, ChevronLeft, ChevronRight, Eye, RotateCw, Sparkles, Trophy, X, AlertTriangle, Bookmark, ThumbsUp } from 'lucide-react';
import { MathText } from './MathText';
import type { SyllabusChapter } from '../lib/syllabusCatalog';
import type { FlashcardItem } from '../lib/chapterFlashcards';
import type { FlashcardRating } from '../types/flashcards';

interface FlashcardStudyModalProps {
  chapter: SyllabusChapter;
  cards: FlashcardItem[];
  onClose: () => void;
  onRateCard: (cardId: string, rating: FlashcardRating) => Promise<void>;
  onStartRevisionTest: (chapter: SyllabusChapter) => void;
  onBookmarkCard?: (cardId: string) => void;
}

export const FlashcardStudyModal: React.FC<FlashcardStudyModalProps> = ({
  chapter,
  cards,
  onClose,
  onRateCard,
  onStartRevisionTest,
  onBookmarkCard,
}) => {
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [completedSession, setCompletedSession] = useState(false);
  const [ratingsSummary, setRatingsSummary] = useState<{ again: number; hard: number; easy: number }>({ again: 0, hard: 0, easy: 0 });
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [bookmarked, setBookmarked] = useState<Record<string, boolean>>({});

  const current = cards[idx] || cards[0];
  const progressPercent = Math.round(((idx + 1) / cards.length) * 100);

  const handleRate = async (rating: FlashcardRating) => {
    if (isSubmittingRating) return;
    setIsSubmittingRating(true);
    try {
      await onRateCard(current.id, rating);
      setRatingsSummary((prev) => ({
        ...prev,
        [rating.toLowerCase()]: prev[rating.toLowerCase() as keyof typeof prev] + 1,
      }));

      if (idx + 1 >= cards.length) {
        setCompletedSession(true);
      } else {
        setRevealed(false);
        setIdx((p) => p + 1);
      }
    } finally {
      setIsSubmittingRating(false);
    }
  };

  const toggleBookmark = () => {
    setBookmarked((prev) => ({ ...prev, [current.id]: !prev[current.id] }));
    if (onBookmarkCard) onBookmarkCard(current.id);
  };

  if (completedSession) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md">
        <div className="w-full max-w-lg rounded-3xl border border-indigo-500/30 bg-white p-8 text-center shadow-2xl dark:border-indigo-900/50 dark:bg-slate-900">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
            <Trophy className="h-8 w-8" />
          </div>
          <span className="inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
            Chapter Flashcards Completed
          </span>
          <h3 className="mt-2 text-2xl font-black font-display text-slate-900 dark:text-white">
            Great work! You reviewed {chapter.name}
          </h3>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
            Active recall session finished. Here is your self-assessment breakdown:
          </p>

          <div className="my-6 grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-3.5 dark:border-rose-900/30 dark:bg-rose-950/20">
              <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase">Again</span>
              <div className="text-xl font-black text-rose-700 dark:text-rose-300">{ratingsSummary.again}</div>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-3.5 dark:border-amber-900/30 dark:bg-amber-950/20">
              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">Hard</span>
              <div className="text-xl font-black text-amber-700 dark:text-amber-300">{ratingsSummary.hard}</div>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3.5 dark:border-emerald-900/30 dark:bg-emerald-950/20">
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Easy</span>
              <div className="text-xl font-black text-emerald-700 dark:text-emerald-300">{ratingsSummary.easy}</div>
            </div>
          </div>

          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            Ready to test your knowledge with a 15-question JEE assessment?
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={() => {
                onClose();
                onStartRevisionTest(chapter);
              }}
              className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:from-indigo-700 hover:to-violet-700 cursor-pointer"
            >
              Take 15-Question Revision Test
            </button>
            <button
              onClick={() => {
                setIdx(0);
                setCompletedSession(false);
                setRatingsSummary({ again: 0, hard: 0, easy: 0 });
              }}
              className="w-full rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
            >
              Revise Flashcards Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              <BookOpen className="h-3.5 w-3.5" />
              {chapter.subject} · Class {chapter.classLevel} · {chapter.name}
            </div>
            <h3 className="mt-0.5 font-display text-base font-bold text-slate-900 dark:text-white">
              Active Recall & Spaced Repetition
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleBookmark}
              title="Bookmark card"
              className={`rounded-xl p-2 transition cursor-pointer ${
                bookmarked[current.id]
                  ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400'
                  : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Bookmark className="h-4 w-4 fill-current" />
            </button>
            <button
              onClick={onClose}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="bg-slate-100 dark:bg-slate-800 h-1.5 w-full">
          <div
            className="bg-indigo-600 h-1.5 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Card Body */}
        <div className="p-6 sm:p-8 flex-1 flex flex-col justify-between">
          <div className="mb-4 flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>
              Card {idx + 1} of {cards.length}
            </span>
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
              {current.difficulty || 'MEDIUM'}
            </span>
          </div>

          {/* 3D Flip Card Container */}
          <div
            onClick={() => setRevealed((p) => !p)}
            className="cursor-pointer rounded-3xl border-2 border-slate-200/80 bg-gradient-to-b from-slate-50/80 to-white p-6 sm:p-8 shadow-sm transition hover:border-indigo-400 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950/80 dark:hover:border-indigo-600 min-h-[260px] flex flex-col justify-center text-center relative group"
          >
            <h4 className="text-base sm:text-lg font-black text-slate-900 dark:text-white mb-4">
              {current.title}
            </h4>

            {!revealed ? (
              <div className="flex flex-col items-center justify-center py-6 px-4 rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/30 dark:border-indigo-900/40 dark:bg-indigo-950/10">
                <Eye className="h-7 w-7 text-indigo-500 mb-2 animate-pulse" />
                <p className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200">
                  Recall formula and boundary conditions mentally
                </p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Click or tap card to reveal solution
                </p>
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in duration-300 text-left">
                <div className="rounded-2xl border border-indigo-100 bg-white p-4 sm:p-5 text-sm sm:text-base leading-relaxed text-slate-900 shadow-xs dark:border-indigo-900/40 dark:bg-slate-900 dark:text-slate-100 font-mono">
                  <MathText text={current.formula} />
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-xs sm:text-sm leading-relaxed text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
                  <span className="font-bold">Exam Trap & Tip: </span>
                  <MathText text={current.tip} />
                </div>
              </div>
            )}
          </div>

          {/* Action Options (Again, Hard, Easy) */}
          <div className="mt-6">
            {!revealed ? (
              <button
                onClick={() => setRevealed(true)}
                className="w-full rounded-2xl bg-indigo-600 py-3.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 cursor-pointer"
              >
                Reveal Answer
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-center text-slate-500 dark:text-slate-400">
                  How well did you recall this?
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    disabled={isSubmittingRating}
                    onClick={() => void handleRate('AGAIN')}
                    className="rounded-2xl border border-rose-200 bg-rose-50/70 py-3 text-xs font-bold text-rose-700 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300 cursor-pointer transition"
                  >
                    🔄 Again (10m)
                  </button>
                  <button
                    disabled={isSubmittingRating}
                    onClick={() => void handleRate('HARD')}
                    className="rounded-2xl border border-amber-200 bg-amber-50/70 py-3 text-xs font-bold text-amber-700 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300 cursor-pointer transition"
                  >
                    ⚡ Hard (1 day)
                  </button>
                  <button
                    disabled={isSubmittingRating}
                    onClick={() => void handleRate('EASY')}
                    className="rounded-2xl border border-emerald-200 bg-emerald-50/70 py-3 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300 cursor-pointer transition"
                  >
                    ✅ Easy (3+ days)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
