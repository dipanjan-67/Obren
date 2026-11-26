import React, { useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Eye, Play, Sparkles, X } from 'lucide-react';
import { getFlashcardsForChapter } from '../lib/chapterFlashcards';
import type { SyllabusChapter } from '../lib/syllabusCatalog';
import { MathText } from './MathText';

interface ChapterFlashcardsModalProps {
  chapter: SyllabusChapter;
  onClose: () => void;
  onPracticeChapter: (chapter: SyllabusChapter) => void;
}

export const ChapterFlashcardsModal: React.FC<ChapterFlashcardsModalProps> = ({
  chapter,
  onClose,
  onPracticeChapter,
}) => {
  const cards = getFlashcardsForChapter(chapter.subject, chapter.name);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const current = cards[idx] || cards[0];

  const handleNext = () => {
    setRevealed(false);
    setIdx((prev) => (prev + 1) % cards.length);
  };

  const handlePrev = () => {
    setRevealed(false);
    setIdx((prev) => (prev - 1 + cards.length) % cards.length);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              <BookOpen className="h-3.5 w-3.5" />
              {chapter.subject} · Class {chapter.classLevel} · Formula Flashcards
            </div>
            <h3 className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white">
              {chapter.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
            aria-label="Close flashcards"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6">
          <div className="mb-3 flex items-center justify-between text-xs font-medium text-slate-500">
            <span>
              Card {idx + 1} of {cards.length}
            </span>
            <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
              <Sparkles className="h-3.5 w-3.5" />
              Active Recall
            </span>
          </div>

          <div
            onClick={() => setRevealed((prev) => !prev)}
            className="cursor-pointer rounded-2xl border border-slate-200 bg-slate-50/70 p-6 transition hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-950/50 dark:hover:border-indigo-700"
          >
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">{current.title}</h4>

            {!revealed ? (
              <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-indigo-200 bg-white/80 px-4 py-8 text-center dark:border-indigo-900/50 dark:bg-slate-900/60">
                <Eye className="mb-2 h-6 w-6 text-indigo-500" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Recite the key formula & boundary rules mentally first
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Click card to reveal formula & trap notes
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-indigo-100 bg-white p-4 text-sm leading-relaxed text-slate-900 dark:border-indigo-900/40 dark:bg-slate-900 dark:text-slate-100">
                  <MathText text={current.formula} />
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3.5 text-xs leading-relaxed text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
                  <span className="font-bold">Exam Tip: </span>
                  <MathText text={current.tip} />
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrev}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </button>
              <button
                onClick={() => setRevealed((prev) => !prev)}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {revealed ? 'Hide Formula' : 'Reveal Formula'}
              </button>
              <button
                onClick={handleNext}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <button
              onClick={() => {
                onClose();
                onPracticeChapter(chapter);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              <Play className="h-3.5 w-3.5" />
              Practice {chapter.subject} Drill
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
