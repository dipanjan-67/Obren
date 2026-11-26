import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Download,
  Filter,
  Layers,
  Play,
  Search,
  Sparkles,
} from 'lucide-react';
import { exportNotesAsPdf } from '../lib/pdfExport';
import { getStructuredCurriculum, type SyllabusChapter } from '../lib/syllabusCatalog';
import { getFlashcardsForChapter } from '../lib/chapterFlashcards';
import type { ActiveTestConfig, ExamType, PyqQuestion, RequestedCustomPractice, SubjectType, UserProfile } from '../types/obren';
import { EXAM_LABELS, getSubjectsForExam } from '../types/obren';
import { MathText } from './MathText';

interface FormulaBankViewProps {
  profile: UserProfile;
  questions: PyqQuestion[];
  onStartCustomTest: (config: ActiveTestConfig) => void;
  onPracticeRoadmapChapter: (req: RequestedCustomPractice) => void;
}

export const FormulaBankView: React.FC<FormulaBankViewProps> = ({
  profile,
  questions,
  onPracticeRoadmapChapter,
}) => {
  const [selectedExam, setSelectedExam] = useState<ExamType>(profile.targetExam);
  const [selectedSubject, setSelectedSubject] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeChapterModal, setActiveChapterModal] = useState<{
    subject: SubjectType;
    chapterName: string;
    unitName: string;
  } | null>(null);

  const curriculum = useMemo(() => getStructuredCurriculum(selectedExam), [selectedExam]);

  const filteredCurriculum = useMemo(() => {
    return curriculum
      .map((subCur) => {
        if (selectedSubject !== 'ALL' && subCur.subject !== selectedSubject) {
          return null;
        }
        const filteredChapters = subCur.chapters.filter((ch) => {
          if (!searchQuery.trim()) return true;
          const q = searchQuery.toLowerCase();
          return (
            ch.name.toLowerCase().includes(q) ||
            ch.unit.toLowerCase().includes(q) ||
            subCur.subject.toLowerCase().includes(q)
          );
        });
        if (filteredChapters.length === 0) return null;
        return {
          subject: subCur.subject,
          chapters: filteredChapters,
        };
      })
      .filter((item): item is { subject: SubjectType; chapters: SyllabusChapter[] } => item !== null);
  }, [curriculum, selectedSubject, searchQuery]);

  const modalFlashcards = useMemo(() => {
    if (!activeChapterModal) return [];
    return getFlashcardsForChapter(activeChapterModal.subject, activeChapterModal.chapterName);
  }, [activeChapterModal]);

  const availableVaultCountForModal = useMemo(() => {
    if (!activeChapterModal) return 0;
    return questions.filter(
      (q) =>
        q.exam === selectedExam &&
        q.subject === activeChapterModal.subject &&
        q.topic.toLowerCase().includes(activeChapterModal.chapterName.toLowerCase().slice(0, 6))
    ).length;
  }, [questions, selectedExam, activeChapterModal]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight">
            Formula Bank & Quick-Recall Flashcards
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Browse high-yield formulas, core derivations, and active-recall flashcards linked directly to every curriculum chapter.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedExam}
            onChange={(e) => setSelectedExam(e.target.value as ExamType)}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
          >
            <option value="JEE_MAINS">JEE Main Curriculum</option>
            <option value="JEE_ADV">JEE Advanced Curriculum</option>
            <option value="NEET">NEET UG Curriculum</option>
          </select>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chapters, formulas, or units..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setSelectedSubject('ALL')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              selectedSubject === 'ALL'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            All Subjects
          </button>
          {getSubjectsForExam(selectedExam).map((sub) => (
            <button
              key={sub}
              type="button"
              onClick={() => setSelectedSubject(sub)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                selectedSubject === sub
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              {sub}
            </button>
          ))}
        </div>
      </div>

      {/* Curriculum Subject Sections */}
      <div className="space-y-8">
        {filteredCurriculum.map((subSec) => (
          <div key={subSec.subject} className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
              <Layers className="w-5 h-5 text-indigo-500" />
              <h2 className="text-xl font-bold font-display">{subSec.subject}</h2>
              <span className="text-xs font-mono font-semibold text-slate-400 ml-2">
                ({subSec.chapters.length} chapters)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {subSec.chapters.map((ch) => {
                const sampleCards = getFlashcardsForChapter(subSec.subject, ch.name);
                return (
                  <div
                    key={`${subSec.subject}-${ch.name}`}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-4 hover:border-indigo-400 transition-colors shadow-xs"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          Class {ch.classLevel}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${
                            ch.weightage === 'HIGH'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {ch.weightage} Weightage
                        </span>
                      </div>

                      <h3 className="font-bold text-base font-display">{ch.name}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{ch.unit}</p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setActiveChapterModal({
                            subject: subSec.subject,
                            chapterName: ch.name,
                            unitName: ch.unit,
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-950/60 cursor-pointer"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>View Flashcards ({sampleCards.length})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onPracticeRoadmapChapter({
                            exam: selectedExam,
                            subject: subSec.subject,
                            classLevel: ch.classLevel,
                            chapter: ch.name,
                          })
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
                      >
                        <Play className="w-3 h-3" />
                        <span>Drill Qs</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Flashcards & Formula Sheet Modal */}
      {activeChapterModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full max-h-[85vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  {activeChapterModal.subject} · {activeChapterModal.unitName}
                </div>
                <h2 className="text-xl font-bold font-display mt-0.5">
                  {activeChapterModal.chapterName} — Formula & Flashcard Sheet
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    exportNotesAsPdf(
                      `${activeChapterModal.chapterName} Formula Sheet`,
                      modalFlashcards.map((f) => ({
                        id: f.id,
                        ownerId: profile.uid,
                        authorName: profile.displayName,
                        folderId: 'formula-bank',
                        memberIds: [profile.uid],
                        title: f.title,
                        subject: activeChapterModal.subject,
                        topic: activeChapterModal.chapterName,
                        content: `Formula / Equation:\n${f.formula}\n\nKey Tip / Trap:\n${f.tip}`,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                      })),
                      {
                        id: 'formula-bank',
                        ownerId: profile.uid,
                        name: activeChapterModal.chapterName,
                        subject: activeChapterModal.subject,
                        exam: selectedExam,
                        isShared: false,
                        inviteCode: '',
                        memberIds: [profile.uid],
                      }
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Export PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveChapterModal(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {modalFlashcards.map((card, idx) => (
                <div
                  key={card.id}
                  className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      Flashcard #{idx + 1}
                    </span>
                    <span>{card.title}</span>
                  </div>

                  <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-sm leading-relaxed overflow-x-auto">
                    <MathText text={card.formula} />
                  </div>

                  <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-indigo-50/60 dark:bg-indigo-950/30 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900/50">
                    <strong className="text-indigo-900 dark:text-indigo-300">Active Recall Tip: </strong>
                    <MathText text={card.tip} />
                  </div>
                </div>
              ))}
            </div>

            <div className="p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between gap-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {availableVaultCountForModal > 0
                  ? `${availableVaultCountForModal} PYQ(s) available in Vault for this chapter.`
                  : 'Practice drill generates instant AI questions for this chapter.'}
              </div>
              <button
                type="button"
                onClick={() => {
                  const modal = activeChapterModal;
                  setActiveChapterModal(null);
                  onPracticeRoadmapChapter({
                    exam: selectedExam,
                    subject: modal.subject,
                    classLevel: '12',
                    chapter: modal.chapterName,
                  });
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
              >
                <Play className="w-4 h-4" />
                <span>Launch Chapter Practice Drill</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
