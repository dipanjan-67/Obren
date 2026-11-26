import React, { useState } from 'react';
import { Sparkles, Upload, FileText, CheckCircle2, Loader2, X } from 'lucide-react';
import type { SyllabusChapter } from '../lib/syllabusCatalog';
import type { FlashcardItem } from '../lib/chapterFlashcards';

interface AiFlashcardGeneratorModalProps {
  chapter: SyllabusChapter;
  onClose: () => void;
  onAddGeneratedCards: (cards: FlashcardItem[]) => void;
}

export const AiFlashcardGeneratorModal: React.FC<AiFlashcardGeneratorModalProps> = ({
  chapter,
  onClose,
  onAddGeneratedCards,
}) => {
  const [sourceType, setSourceType] = useState<'CHAPTER' | 'PDF' | 'NOTES' | 'FORMULAS'>('CHAPTER');
  const [cardCount, setCardCount] = useState<number>(10);
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedPreview, setGeneratedPreview] = useState<FlashcardItem[] | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    // Simulate AI generation or call backend API
    setTimeout(() => {
      const mockCards: FlashcardItem[] = [];
      for (let i = 1; i <= cardCount; i++) {
        mockCards.push({
          id: `ai-gen-${Date.now()}-${i}`,
          title: `AI Generated Concept #${i} for ${chapter.name}`,
          formula: `$\\text{Formula}_${i} = \\int \\text{Analysis}(x)\\,dx$`,
          tip: `AI verified JEE Main/Advanced high-yield tip #${i}. Watch out for sign conventions and boundary limits.`,
        });
      }
      setGeneratedPreview(mockCards);
      setIsGenerating(false);
    }, 1500);
  };

  const handleSaveCards = () => {
    if (generatedPreview) {
      onAddGeneratedCards(generatedPreview);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md">
      <div className="w-full max-w-xl rounded-3xl border border-indigo-500/30 bg-white shadow-2xl dark:border-indigo-900/50 dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                AI Flashcard Generator
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Generate high-yield JEE cards instantly using Gemini AI
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {!generatedPreview ? (
            <>
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
                  Source Material
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    onClick={() => setSourceType('CHAPTER')}
                    className={`p-3 rounded-2xl border text-xs font-semibold text-center cursor-pointer transition ${
                      sourceType === 'CHAPTER'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Syllabus Chapter
                  </button>
                  <button
                    onClick={() => setSourceType('PDF')}
                    className={`p-3 rounded-2xl border text-xs font-semibold text-center cursor-pointer transition ${
                      sourceType === 'PDF'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Uploaded PDF
                  </button>
                  <button
                    onClick={() => setSourceType('NOTES')}
                    className={`p-3 rounded-2xl border text-xs font-semibold text-center cursor-pointer transition ${
                      sourceType === 'NOTES'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Handwritten Notes
                  </button>
                  <button
                    onClick={() => setSourceType('FORMULAS')}
                    className={`p-3 rounded-2xl border text-xs font-semibold text-center cursor-pointer transition ${
                      sourceType === 'FORMULAS'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Formula Bank
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
                  Number of Flashcards
                </label>
                <div className="grid grid-cols-4 gap-3">
                  {[10, 20, 30, 50].map((num) => (
                    <button
                      key={num}
                      onClick={() => setCardCount(num)}
                      className={`py-2 rounded-xl border text-xs font-bold cursor-pointer transition ${
                        cardCount === num
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {num} Cards
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
                  Custom Focus / Instructions (Optional)
                </label>
                <textarea
                  rows={3}
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="e.g. Focus specifically on previous year numerical traps and exception cases..."
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 focus:outline-indigo-600 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <button
                disabled={isGenerating}
                onClick={() => void handleGenerate()}
                className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:from-indigo-700 hover:to-violet-700 cursor-pointer flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Generating AI Flashcards with Gemini...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Generate {cardCount} Flashcards</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-600 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  Successfully generated {generatedPreview.length} AI cards for {chapter.name}!
                </span>
                <button
                  onClick={() => setGeneratedPreview(null)}
                  className="text-xs font-semibold text-indigo-600 hover:underline cursor-pointer"
                >
                  Regenerate
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {generatedPreview.map((card, idx) => (
                  <div key={card.id} className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-xs space-y-1">
                    <span className="font-bold text-slate-900 dark:text-white">{idx + 1}. {card.title}</span>
                    <p className="text-indigo-600 dark:text-indigo-400 font-mono">{card.formula}</p>
                  </div>
                ))}
              </div>

              <button
                onClick={handleSaveCards}
                className="w-full rounded-2xl bg-indigo-600 py-3 text-xs font-bold text-white hover:bg-indigo-700 cursor-pointer shadow-md"
              >
                Save & Add to Deck
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
