import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Bookmark,
  Compass,
  FileQuestion,
  NotebookPen,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { getStructuredCurriculum } from '../lib/syllabusCatalog';
import type {
  BookmarkItem,
  ExamType,
  PyqQuestion,
  RequestedCustomPractice,
  StudyNote,
} from '../types/obren';
import { MathText } from './MathText';

interface GlobalSearchModalProps {
  open: boolean;
  targetExam: ExamType;
  questions: PyqQuestion[];
  notes: StudyNote[];
  bookmarks: BookmarkItem[];
  onClose: () => void;
  onNavigate: (tab: 'dashboard' | 'tests' | 'vault' | 'analytics' | 'planner' | 'notes' | 'arena') => void;
  onPracticeChapter: (req: RequestedCustomPractice) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  open,
  targetExam,
  questions,
  notes,
  bookmarks,
  onClose,
  onNavigate,
  onPracticeChapter,
}) => {
  const [queryText, setQueryText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQueryText('');
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const allChapters = useMemo(() => {
    return getStructuredCurriculum(targetExam).flatMap((sub) => sub.chapters);
  }, [targetExam]);

  const results = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) {
      return {
        chapters: allChapters.filter((c) => c.weightage === 'HIGH').slice(0, 5),
        questions: questions.slice(0, 4),
        notes: notes.slice(0, 4),
        bookmarks: bookmarks.slice(0, 4),
      };
    }

    return {
      chapters: allChapters
        .filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.subject.toLowerCase().includes(q) ||
            c.unit.toLowerCase().includes(q) ||
            c.keywords.some((k) => k.toLowerCase().includes(q))
        )
        .slice(0, 6),
      questions: questions
        .filter(
          (item) =>
            item.prompt.toLowerCase().includes(q) ||
            item.topic.toLowerCase().includes(q) ||
            item.subject.toLowerCase().includes(q)
        )
        .slice(0, 6),
      notes: notes
        .filter(
          (n) =>
            n.title.toLowerCase().includes(q) ||
            (n.topic || '').toLowerCase().includes(q) ||
            n.content.toLowerCase().includes(q)
        )
        .slice(0, 5),
      bookmarks: bookmarks
        .filter(
          (b) =>
            b.prompt.toLowerCase().includes(q) ||
            (b.topic || '').toLowerCase().includes(q) ||
            (b.note || '').toLowerCase().includes(q)
        )
        .slice(0, 5),
    };
  }, [queryText, allChapters, questions, notes, bookmarks]);

  if (!open) return null;

  const totalHits =
    results.chapters.length +
    results.questions.length +
    results.notes.length +
    results.bookmarks.length;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-start justify-center p-4 sm:pt-16"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-4 h-4 text-indigo-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Search PYQs, syllabus chapters, study notes, or bookmarks..."
            className="flex-1 bg-transparent text-sm outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-4 space-y-5">
          {totalHits === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              No matching chapters, PYQs, notes, or bookmarks found.
            </div>
          ) : (
            <>
              {results.chapters.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <Compass className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Syllabus Chapters</span>
                  </div>
                  {results.chapters.map((ch) => (
                    <div
                      key={ch.key}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/70"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onNavigate('dashboard');
                          onClose();
                        }}
                        className="text-left min-w-0 flex-1 cursor-pointer"
                      >
                        <div className="text-sm font-semibold truncate">{ch.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {ch.subject} · Class {ch.classLevel} · {ch.unit}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onPracticeChapter({
                            exam: targetExam,
                            subject: ch.subject,
                            classLevel: ch.classLevel,
                            chapter: ch.name,
                          });
                          onClose();
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-xs font-semibold shrink-0 cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Practice</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {results.questions.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <FileQuestion className="w-3.5 h-3.5 text-amber-500" />
                    <span>PYQ Vault Questions</span>
                  </div>
                  {results.questions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onNavigate('vault');
                        onClose();
                      }}
                      className="w-full text-left flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/70 cursor-pointer"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                          {item.subject} · {item.topic} {item.year ? `· ${item.year}` : ''}
                        </div>
                        <div className="text-xs text-slate-700 dark:text-slate-300 line-clamp-1 mt-0.5">
                          <MathText text={item.prompt} />
                        </div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {results.notes.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <NotebookPen className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Study Notes</span>
                  </div>
                  {results.notes.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        onNavigate('notes');
                        onClose();
                      }}
                      className="w-full text-left flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/70 cursor-pointer"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{n.title}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {n.subject} {n.topic ? `· ${n.topic}` : ''} · {n.content.slice(0, 70)}
                        </div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {results.bookmarks.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <Bookmark className="w-3.5 h-3.5 text-rose-500" />
                    <span>Saved Bookmarks</span>
                  </div>
                  {results.bookmarks.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        onNavigate('analytics');
                        onClose();
                      }}
                      className="w-full text-left flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/70 cursor-pointer"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                          {b.subject} {b.topic ? `· ${b.topic}` : ''} · {b.masteryStatus}
                        </div>
                        <div className="text-xs text-slate-700 dark:text-slate-300 line-clamp-1 mt-0.5">
                          <MathText text={b.prompt} />
                        </div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
