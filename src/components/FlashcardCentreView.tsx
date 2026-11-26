import React, { useState, useEffect } from 'react';
import { BookOpen, Calendar, CheckCircle2, Clock, Flame, Play, Sparkles, Trophy, Plus, ShieldAlert, Award, ArrowRight } from 'lucide-react';
import { SYLLABUS_CATALOG, type SyllabusChapter } from '../lib/syllabusCatalog';
import { getFlashcardsForChapter, type FlashcardItem } from '../lib/chapterFlashcards';
import { generateRevisionTestQuestions } from '../lib/flashcardStore';
import { FlashcardStudyModal } from './FlashcardStudyModal';
import { FlashcardTestModal } from './FlashcardTestModal';
import { AiFlashcardGeneratorModal } from './AiFlashcardGeneratorModal';
import { FlashcardAdminModal } from './FlashcardAdminModal';
import type { FlashcardRating, RevisionTestAttempt, RevisionTestQuestion } from '../types/flashcards';

interface FlashcardCentreViewProps {
  isAdmin?: boolean;
  onRateCard: (cardId: string, rating: FlashcardRating) => Promise<void>;
  onSubmitTestAttempt: (attempt: Omit<RevisionTestAttempt, 'id' | 'userId'>) => Promise<void>;
}

export const FlashcardCentreView: React.FC<FlashcardCentreViewProps> = ({
  isAdmin,
  onRateCard,
  onSubmitTestAttempt,
}) => {
  const [selectedSubject, setSelectedSubject] = useState<'Physics' | 'Chemistry' | 'Mathematics'>('Physics');
  const [selectedClass, setSelectedClass] = useState<'11' | '12'>('11');
  const [searchQuery, setSearchQuery] = useState('');

  const [activeStudyChapter, setActiveStudyChapter] = useState<SyllabusChapter | null>(null);
  const [activeTestChapter, setActiveTestChapter] = useState<SyllabusChapter | null>(null);
  const [testQuestions, setTestQuestions] = useState<RevisionTestQuestion[]>([]);
  const [aiGeneratorChapter, setAiGeneratorChapter] = useState<SyllabusChapter | null>(null);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [customCards, setCustomCards] = useState<Record<string, FlashcardItem[]>>({});

  const chapters = SYLLABUS_CATALOG.filter(
    (c) => c.subject === selectedSubject && c.classLevel === selectedClass
  ).filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleStartTest = (chapter: SyllabusChapter) => {
    const qs = generateRevisionTestQuestions(chapter);
    setTestQuestions(qs);
    setActiveTestChapter(chapter);
  };

  const handleAddCustomCards = (chapterName: string, newCards: FlashcardItem[]) => {
    setCustomCards((prev) => ({
      ...prev,
      [chapterName]: [...(prev[chapterName] || []), ...newCards],
    }));
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      {/* Header Banner */}
      <div className="rounded-3xl border border-indigo-500/20 bg-gradient-to-r from-indigo-900 via-slate-900 to-violet-950 p-6 sm:p-8 text-white shadow-2xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/20 px-3.5 py-1 text-xs font-semibold text-indigo-300 backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5" />
              Active Recall & Spaced Repetition Engine
            </div>
            <h1 className="text-2xl sm:text-4xl font-black font-display tracking-tight">
              Flashcards & Revision Centre
            </h1>
            <p className="text-xs sm:text-sm text-indigo-200 max-w-2xl leading-relaxed">
              Master JEE Physics, Chemistry &amp; Mathematics formulas, reactions, and definitions with SM-2 spaced repetition, 15-question revision tests, and Gemini AI flashcard generation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isAdmin && (
              <button
                onClick={() => setAdminModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white backdrop-blur-md transition cursor-pointer"
              >
                <ShieldAlert className="h-4 w-4 text-amber-400" />
                <span>Admin Hub</span>
              </button>
            )}
            <div className="rounded-2xl bg-white/10 backdrop-blur-md p-4 border border-white/10 text-center min-w-[130px]">
              <span className="text-[10px] uppercase font-bold text-indigo-300">Today&apos;s Due</span>
              <div className="text-xl font-black text-white">12 Cards</div>
            </div>
          </div>
        </div>
      </div>

      {/* Subject & Class Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl w-fit">
          {(['Physics', 'Chemistry', 'Mathematics'] as const).map((sub) => (
            <button
              key={sub}
              onClick={() => setSelectedSubject(sub)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                selectedSubject === sub
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {sub}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setSelectedClass('11')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition ${
                selectedClass === '11' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Class 11
            </button>
            <button
              onClick={() => setSelectedClass('12')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition ${
                selectedClass === '12' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Class 12
            </button>
          </div>

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chapters..."
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 focus:outline-indigo-600 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
          />
        </div>
      </div>

      {/* Chapters Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {chapters.map((chap) => {
          const defaultCards = getFlashcardsForChapter(chap.subject, chap.name);
          const extraCards = customCards[chap.name] || [];
          const totalCards = defaultCards.length + extraCards.length;

          return (
            <div
              key={chap.key}
              className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700 transition flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
                  <span>{chap.subject} · Class {chap.classLevel}</span>
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                    {totalCards} Flashcards
                  </span>
                </div>
                <h3 className="text-base font-bold font-display text-slate-900 dark:text-white">
                  {chap.name}
                </h3>
              </div>

              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] font-semibold text-slate-500">
                  <span>Mastery Progress</span>
                  <span>75%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 w-3/4" />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  onClick={() => setActiveStudyChapter(chap)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 cursor-pointer"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>Study Cards</span>
                </button>
                <button
                  onClick={() => handleStartTest(chap)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Award className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Take Test</span>
                </button>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                <button
                  onClick={() => setAiGeneratorChapter(chap)}
                  className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
                >
                  <Sparkles className="h-3 w-3" />
                  <span>Generate AI Cards</span>
                </button>
                <span className="text-slate-400">Due: Today</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modals */}
      {activeStudyChapter && (
        <FlashcardStudyModal
          chapter={activeStudyChapter}
          cards={[...getFlashcardsForChapter(activeStudyChapter.subject, activeStudyChapter.name), ...(customCards[activeStudyChapter.name] || [])]}
          onClose={() => setActiveStudyChapter(null)}
          onRateCard={onRateCard}
          onStartRevisionTest={(chap) => {
            setActiveStudyChapter(null);
            handleStartTest(chap);
          }}
        />
      )}

      {activeTestChapter && (
        <FlashcardTestModal
          chapter={activeTestChapter}
          questions={testQuestions}
          onClose={() => setActiveTestChapter(null)}
          onSubmitAttempt={onSubmitTestAttempt}
        />
      )}

      {aiGeneratorChapter && (
        <AiFlashcardGeneratorModal
          chapter={aiGeneratorChapter}
          onClose={() => setAiGeneratorChapter(null)}
          onAddGeneratedCards={(cards) => handleAddCustomCards(aiGeneratorChapter.name, cards)}
        />
      )}

      {adminModalOpen && (
        <FlashcardAdminModal
          onClose={() => setAdminModalOpen(false)}
          onSaveCustomCard={(card) => handleAddCustomCards(card.chapter, [card])}
        />
      )}
    </div>
  );
};
