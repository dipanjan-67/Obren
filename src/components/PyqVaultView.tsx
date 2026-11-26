import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Crop,
  Database,
  FileUp,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { collection, doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { ApiRequestError, postApiJson } from '../lib/apiClient';
import { auth, db } from '../lib/firebase';
import {
  PdfExtractor,
  type IsolatedPyqDraft,
  type PdfQuickInfo,
} from '../lib/PdfExtractor';
import { seedStarterPyqPack } from '../lib/starterPyqBank';
import type {
  ClassLevel,
  ExamType,
  PyqBank,
  PyqQuestion,
  QuestionType,
  SubjectType,
} from '../types/obren';
import { EXAM_LABELS, getSubjectsForExam } from '../types/obren';
import { MathText } from './MathText';
import { PdfDiagramCropModal } from './PdfDiagramCropModal';

type DraftQuestion = IsolatedPyqDraft;

interface PyqVaultViewProps {
  userId: string;
  defaultExam: ExamType;
  banks: PyqBank[];
  questions: PyqQuestion[];
  onDeleteBank: (bankId: string) => Promise<void>;
  onDeleteQuestion: (questionId: string) => Promise<void>;
  onSeedStarterPack?: (exam?: ExamType) => Promise<number>;
}

const MAX_PDF_BYTES = 100 * 1024 * 1024; // 100 MB

export const PyqVaultView: React.FC<PyqVaultViewProps> = ({
  userId,
  defaultExam,
  banks,
  questions,
  onDeleteBank,
  onDeleteQuestion,
  onSeedStarterPack,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [bankTitle, setBankTitle] = useState('');
  const [exam, setExam] = useState<ExamType>(defaultExam);
  const [classLevel, setClassLevel] = useState<'11' | '12' | 'ALL'>('ALL');
  const [subjectHint, setSubjectHint] = useState<string>('');
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(25);
  const [visibility, setVisibility] = useState<'PRIVATE' | 'PUBLIC'>('PRIVATE');
  const [extractionMode, setExtractionMode] = useState<'HYBRID' | 'FAST_LOCAL'>('HYBRID');
  const [pdfQuickInfo, setPdfQuickInfo] = useState<PdfQuickInfo | null>(null);
  const [extractionSummary, setExtractionSummary] = useState<string | null>(null);

  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [draftQuestions, setDraftQuestions] = useState<DraftQuestion[]>([]);
  const [editingDraftIdx, setEditingDraftIdx] = useState<number | null>(null);
  const [savingToFirestore, setSavingToFirestore] = useState(false);
  const [saveStageText, setSaveStageText] = useState<string>('Syncing...');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [seedingStarter, setSeedingStarter] = useState(false);
  const [cropTarget, setCropTarget] = useState<'MANUAL' | number | null>(null);

  // Filter existing vault
  const [searchTerm, setSearchTerm] = useState('');
  const [filterExam, setFilterExam] = useState<'ALL' | ExamType>('ALL');
  const [filterClass, setFilterClass] = useState<'ALL' | ClassLevel>('ALL');
  const [filterSubject, setFilterSubject] = useState<string>('ALL');
  const [filterQType, setFilterQType] = useState<'ALL' | QuestionType>('ALL');

  // Manual PYQ modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualQ, setManualQ] = useState<DraftQuestion>({
    subject: 'Physics',
    topic: '',
    classLevel: '12',
    year: '2024',
    questionType: 'MCQ',
    prompt: '',
    options: ['', '', '', ''],
    correctAnswer: '',
    solution: '',
    difficulty: 'MEDIUM',
  });

  const handleLoadStarterPack = async () => {
    setSeedingStarter(true);
    setUploadError(null);
    setSaveSuccess(null);
    try {
      const count = onSeedStarterPack
        ? await onSeedStarterPack()
        : (await seedStarterPyqPack(userId)).insertedCount;
      setSaveSuccess(
        `Loaded ${count} verified Starter PYQs across JEE Main, JEE Advanced & NEET so all mock tests, Booster, and Duels work immediately.`
      );
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to load starter PYQ bank.');
    } finally {
      setSeedingStarter(false);
    }
  };

  const handleFileChange = async (file: File | null) => {
    setUploadError(null);
    setSaveSuccess(null);
    setExtractionSummary(null);
    setPdfQuickInfo(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Only PDF files are accepted.');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setUploadError('PDF exceeds the 100 MB maximum file size limit.');
      return;
    }
    setSelectedFile(file);
    if (!bankTitle) {
      setBankTitle(file.name.replace(/\.pdf$/i, '').slice(0, 100));
    }
    const info = await PdfExtractor.inspect(file);
    setPdfQuickInfo(info);
    if (info.totalPages > 0 && endPage > info.totalPages) {
      setEndPage(info.totalPages);
    }
  };

  const [uploadStageText, setUploadStageText] = useState<string>('Parsing PDF...');

  const parseJsonSafe = async <T,>(resp: Response): Promise<T> => {
    const raw = await resp.text();
    let parsed: (T & { error?: string }) | null = null;
    try {
      parsed = JSON.parse(raw) as T & { error?: string };
    } catch {
      throw new Error(`Server returned non-JSON response (HTTP ${resp.status}).`);
    }
    if (!resp.ok) {
      throw new Error(parsed.error || `Server returned HTTP ${resp.status}.`);
    }
    return parsed;
  };

  const postJsonWithRetry = async <T,>(
    url: string,
    payload: Record<string, unknown>,
    idToken: string,
    stageLabel: string
  ): Promise<T> => {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await postApiJson<T>(url, payload, idToken);
      } catch (err) {
        const isRetryable = err instanceof ApiRequestError && err.retryable;
        if (isRetryable && attempt < maxAttempts) {
          setUploadStageText(`${stageLabel} (AI busy, retrying ${attempt}/${maxAttempts - 1}...)`);
          await new Promise((r) => setTimeout(r, 2500 * attempt));
          continue;
        }
        throw err;
      }
    }
    throw new Error('AI extraction servers are currently busy. Please retry shortly.');
  };

  const deduplicateQuestions = (items: DraftQuestion[]): DraftQuestion[] => {
    const seen = new Set<string>();
    const out: DraftQuestion[] = [];
    for (const q of items) {
      const sig = q.prompt.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 140);
      if (sig && !seen.has(sig)) {
        seen.add(sig);
        out.push(q);
      }
    }
    return out;
  };

  const handleUploadAndExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    setUploadError(null);
    setSaveSuccess(null);
    setExtractionSummary(null);
    setUploading(true);
    setUploadProgress(2);
    setUploadStageText('Analyzing PDF structure in browser with PDF.js...');

    const collected: DraftQuestion[] = [];
    const usedModes = new Set<string>();
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error('Authentication token unavailable. Please sign in again.');
      }

      // Phase 1: Client-side layout-aware PDF.js Web Worker parsing
      const localResult = await PdfExtractor.extractPages(
        selectedFile,
        startPage,
        endPage,
        (pct, stage) => {
          setUploadProgress(pct);
          setUploadStageText(stage);
        }
      );

      let detectedTotalPages = localResult.totalPages;

      if (!localResult.fallbackToServerUpload) {
        if (localResult.usedColumnAwareLayout) {
          usedModes.add('2-Column PDF.js Layout');
        } else {
          usedModes.add('Client PDF.js');
        }

        // Batch text pages cleanly into <= 10,000 char chunks
        const textChunks: string[] = [];
        let buffer = '';
        for (const tp of localResult.textPages) {
          const pageBlock = `--- Page ${tp.pageNumber} ---\n${tp.text}\n`;
          if (buffer.length + pageBlock.length > 9800 && buffer.length > 0) {
            textChunks.push(buffer);
            buffer = pageBlock;
          } else {
            buffer += pageBlock;
          }
        }
        if (buffer.trim()) {
          textChunks.push(buffer);
        }

        const visionBatches: Array<typeof localResult.visionPages> = [];
        for (let i = 0; i < localResult.visionPages.length; i += 2) {
          visionBatches.push(localResult.visionPages.slice(i, i + 2));
        }

        const totalWork = Math.max(1, textChunks.length + visionBatches.length);
        let completedWork = 0;

        for (let idx = 0; idx < textChunks.length; idx += 1) {
          const stageLabel = `Extracting PYQs (text batch ${idx + 1} of ${textChunks.length})...`;
          setUploadStageText(stageLabel);
          const extData = await postJsonWithRetry<{
            questions: DraftQuestion[];
            parserMode?: string;
          }>(
            '/api/pyq/extract-chunk',
            {
              text: textChunks[idx],
              exam,
              classLevel,
              subjectHint,
              answerKeyContext: localResult.answerKeyContext,
              mode: extractionMode,
            },
            idToken,
            stageLabel
          );
          if (extData.parserMode) usedModes.add(extData.parserMode);
          if (Array.isArray(extData.questions)) {
            collected.push(...extData.questions);
          }
          completedWork += 1;
          setUploadProgress(48 + Math.round((completedWork / totalWork) * 52));
        }

        for (let bIdx = 0; bIdx < visionBatches.length; bIdx += 1) {
          const batch = visionBatches[bIdx];
          const stageLabel = `Running OCR on scanned pages (${batch.map((b) => b.pageNumber).join(', ')})...`;
          setUploadStageText(stageLabel);
          const imgData = await postJsonWithRetry<{
            questions: DraftQuestion[];
            parserMode?: string;
          }>(
            '/api/pyq/extract-images',
            {
              images: batch,
              exam,
              classLevel,
              subjectHint,
              answerKeyContext: localResult.answerKeyContext,
            },
            idToken,
            stageLabel
          );
          if (imgData.parserMode) usedModes.add(imgData.parserMode);
          if (Array.isArray(imgData.questions)) {
            collected.push(...imgData.questions);
          }
          completedWork += 1;
          setUploadProgress(48 + Math.round((completedWork / totalWork) * 52));
        }
      } else {
        // Phase 2: Seamless fallback to chunked server repair/salvage/Files API for corrupted-xref PDFs
        usedModes.add('Server PDF Repair');
        const uploadId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const chunkSize = 4 * 1024 * 1024;
        const totalChunks = Math.max(1, Math.ceil(selectedFile.size / chunkSize));

        for (let i = 0; i < totalChunks; i += 1) {
          const start = i * chunkSize;
          const end = Math.min(selectedFile.size, start + chunkSize);
          const slice = selectedFile.slice(start, end);
          const fd = new FormData();
          fd.append('uploadId', uploadId);
          fd.append('chunkIndex', String(i));
          fd.append('totalChunks', String(totalChunks));
          fd.append('offset', String(start));
          fd.append('chunk', slice, selectedFile.name);

          setUploadStageText(`Local parser fallback — uploading chunk ${i + 1} of ${totalChunks}...`);
          const chunkResp = await fetch('/api/pyq/upload-chunk', {
            method: 'POST',
            headers: { Authorization: `Bearer ${idToken}` },
            body: fd,
          });
          await parseJsonSafe(chunkResp);
          setUploadProgress(15 + Math.round(((i + 1) / totalChunks) * 30));
        }

        setUploadStageText('Repairing & inspecting PDF on server...');
        const prepData = await postApiJson<{
          totalPages: number;
          extractedChars: number;
          isScanned: boolean;
          repairedByAi?: boolean;
          mimeType?: string;
          textChunks: string[];
          answerKeyContext?: string;
        }>('/api/pyq/prepare', { uploadId, startPage, endPage }, idToken);
        detectedTotalPages = prepData.totalPages;
        setUploadProgress(50);

        if (prepData.isScanned) {
          const stageLabel = prepData.repairedByAi
            ? 'Repairing & reading PDF directly with AI...'
            : 'Reading scanned PDF pages...';
          setUploadStageText(stageLabel);
          const scanData = await postJsonWithRetry<{ questions: DraftQuestion[] }>(
            '/api/pyq/extract-scanned',
            {
              uploadId,
              exam,
              classLevel,
              subjectHint,
              startPage,
              endPage,
              mimeType: prepData.mimeType || 'application/pdf',
            },
            idToken,
            stageLabel
          );
          usedModes.add('Native PDF Reader');
          if (Array.isArray(scanData.questions)) {
            collected.push(...scanData.questions);
          }
          setUploadProgress(100);
        } else {
          const chunks = prepData.textChunks || [];
          for (let idx = 0; idx < chunks.length; idx += 1) {
            const stageLabel = `Extracting PYQs (batch ${idx + 1} of ${chunks.length})...`;
            setUploadStageText(stageLabel);
            const extData = await postJsonWithRetry<{
              questions: DraftQuestion[];
              parserMode?: string;
            }>(
              '/api/pyq/extract-chunk',
              {
                text: chunks[idx],
                exam,
                classLevel,
                subjectHint,
                answerKeyContext: prepData.answerKeyContext || '',
                mode: extractionMode,
              },
              idToken,
              stageLabel
            );
            if (extData.parserMode) usedModes.add(extData.parserMode);
            if (Array.isArray(extData.questions)) {
              collected.push(...extData.questions);
            }
            setUploadProgress(50 + Math.round(((idx + 1) / Math.max(1, chunks.length)) * 50));
          }
        }
      }

      const deduped = deduplicateQuestions(collected);
      const isolatedReport = PdfExtractor.isolateAll(deduped, exam, classLevel);
      const unique = isolatedReport.valid;

      if (unique.length === 0) {
        setUploadError(
          `Processed pages ${startPage}–${endPage}${detectedTotalPages ? ` (of ${detectedTotalPages})` : ''}, but no valid structured questions were isolated. Try adjusting the page range or switching to Hybrid AI mode.`
        );
      } else {
        setDraftQuestions(unique);
        const rejectedNote =
          isolatedReport.rejectedCount > 0
            ? ` (${isolatedReport.rejectedCount} incomplete fragment(s) filtered)`
            : '';
        setExtractionSummary(
          `Isolated ${unique.length} valid PYQs via ${Array.from(usedModes).join(' + ')}${rejectedNote}`
        );
      }
    } catch (err) {
      const deduped = deduplicateQuestions(collected);
      const isolatedReport = PdfExtractor.isolateAll(deduped, exam, classLevel);
      if (isolatedReport.valid.length > 0) {
        setDraftQuestions(isolatedReport.valid);
        setUploadError(
          `Recovered & isolated ${isolatedReport.valid.length} questions before an interruption: ${err instanceof Error ? err.message : 'PDF extraction paused.'}`
        );
      } else {
        setUploadError(err instanceof Error ? err.message : 'PDF extraction failed.');
      }
    } finally {
      setUploading(false);
    }
  };

  const commitWithTimeout = async (promise: Promise<void>, label: string) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(
              new Error(
                `${label} timed out. Check your internet connection or refresh and try again.`
              )
            );
          }, 20000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const handleSaveQuestionsToVault = async (
    list: DraftQuestion[],
    customTitle?: string
  ) => {
    const validation = PdfExtractor.isolateAll(list, exam, classLevel);
    if (validation.valid.length === 0) {
      setUploadError(
        'No structurally valid questions to save. Ensure each MCQ has >= 2 options and a clear prompt/answer.'
      );
      return;
    }
    if (!auth.currentUser || !auth.currentUser.emailVerified) {
      setUploadError('Please sign in with a verified Google account before saving PYQs.');
      return;
    }

    setSavingToFirestore(true);
    setSaveStageText('Creating PYQ bank...');
    setUploadError(null);
    setSaveSuccess(null);

    try {
      const bankRef = doc(collection(db, 'pyqBanks'));
      const titleToUse =
        (customTitle || bankTitle || selectedFile?.name || 'Custom PYQ Pack')
          .trim()
          .slice(0, 150) || 'Custom PYQ Pack';
      const safeFileName =
        (selectedFile?.name || 'manual-entry.pdf').trim().slice(0, 200) || 'manual-entry.pdf';
      const safeFileSize = Math.min(104857600, Math.max(0, Math.round(selectedFile?.size || 0)));
      const questionsToSave = validation.valid.slice(0, 1000);

      // Step 1: Commit pyqBanks doc first so subsequent pyqQuestions batches pass exists() cleanly
      await commitWithTimeout(
        setDoc(bankRef, {
          ownerId: userId,
          title: titleToUse,
          fileName: safeFileName,
          fileSizeBytes: safeFileSize,
          exam,
          classLevel,
          questionCount: questionsToSave.length,
          visibility,
          createdAt: serverTimestamp(),
        }),
        'Creating PYQ bank'
      );

      // Step 2: Commit pyqQuestions in <= 12-doc batches (strictly under Firestore's 20 exists() per-batch limit)
      const batchSize = 12;
      for (let offset = 0; offset < questionsToSave.length; offset += batchSize) {
        const end = Math.min(questionsToSave.length, offset + batchSize);
        setSaveStageText(`Saving ${end} / ${questionsToSave.length}...`);
        const nextBatch = writeBatch(db);
        questionsToSave.slice(offset, end).forEach((q) => {
          const qRef = doc(collection(db, 'pyqQuestions'));
          const safeOpts = Array.isArray(q.options)
            ? q.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 6)
            : [];
          const safeImage =
            typeof q.imageUrl === 'string' &&
            q.imageUrl.trim().length > 0 &&
            q.imageUrl.trim().length <= 250000
              ? q.imageUrl.trim()
              : '';
          const rawSubj = String(q.subject || '').toLowerCase();
          const safeSubject = rawSubj.includes('chem')
            ? 'Chemistry'
            : rawSubj.includes('math')
              ? 'Mathematics'
              : rawSubj.includes('bio')
                ? 'Biology'
                : 'Physics';
          nextBatch.set(qRef, {
            ownerId: userId,
            bankId: bankRef.id,
            visibility,
            exam,
            classLevel: q.classLevel === '11' ? '11' : '12',
            subject: safeSubject,
            topic: (q.topic || 'Core PYQ').trim().slice(0, 120) || 'Core PYQ',
            year: (q.year || 'PYQ').trim().slice(0, 32),
            questionType: q.questionType,
            prompt: q.prompt.trim().slice(0, 4000),
            options: safeOpts,
            correctAnswer: (q.correctAnswer || safeOpts[0] || '0').trim().slice(0, 200),
            solution: (q.solution || '').trim().slice(0, 4000),
            ...(safeImage ? { imageUrl: safeImage } : {}),
            difficulty: q.difficulty || 'MEDIUM',
            createdAt: serverTimestamp(),
          });
        });
        await commitWithTimeout(nextBatch.commit(), `Saving PYQs (${end}/${questionsToSave.length})`);
      }

      setSaveSuccess(
        `Saved ${questionsToSave.length} validated PYQs into "${titleToUse}" with real-time sync.`
      );
      setDraftQuestions([]);
      setSelectedFile(null);
      setPdfQuickInfo(null);
      setExtractionSummary(null);
      setBankTitle('');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to save PYQs to Firestore. Please try again.';
      setUploadError(msg);
      console.error('Failed to save PYQs to Firestore:', err);
    } finally {
      setSavingToFirestore(false);
      setSaveStageText('Syncing...');
    }
  };

  const handleSaveManualQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedOptions =
      manualQ.questionType === 'NUMERICAL'
        ? []
        : manualQ.options.map((o) => o.trim()).filter(Boolean);
    const correctAns =
      manualQ.questionType !== 'NUMERICAL' && !manualQ.correctAnswer && cleanedOptions[0]
        ? cleanedOptions[0]
        : manualQ.correctAnswer.trim();

    await handleSaveQuestionsToVault(
      [
        {
          ...manualQ,
          topic: manualQ.topic.trim() || 'Core Topic',
          prompt: manualQ.prompt.trim(),
          options: cleanedOptions,
          correctAnswer: correctAns,
          solution: manualQ.solution.trim(),
        },
      ],
      `Manual ${EXAM_LABELS[exam]} PYQ`
    );
    setShowManualModal(false);
    setManualQ({
      subject: getSubjectsForExam(exam)[0],
      topic: '',
      classLevel: '12',
      year: '2024',
      questionType: 'MCQ',
      prompt: '',
      options: ['', '', '', ''],
      correctAnswer: '',
      solution: '',
      difficulty: 'MEDIUM',
    });
  };

  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (filterExam !== 'ALL' && q.exam !== filterExam) return false;
      if (filterClass !== 'ALL' && q.classLevel !== filterClass) return false;
      if (filterSubject !== 'ALL' && q.subject !== filterSubject) return false;
      if (filterQType !== 'ALL' && q.questionType !== filterQType) return false;
      if (
        searchTerm.trim() &&
        !q.prompt.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !q.topic.toLowerCase().includes(searchTerm.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [questions, filterExam, filterClass, filterSubject, filterQType, searchTerm]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight">
            PYQ Vault & PDF Importer
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Upload your JEE Main, JEE Advanced, or NEET PYQ PDFs (up to 100 MB) to extract structured tests with Class 11/12 & topic tags.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={seedingStarter}
            onClick={() => void handleLoadStarterPack()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            {seedingStarter ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>{seedingStarter ? 'Loading Starter Pack...' : 'Load Starter PYQ Pack'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowManualModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Add Question Manually</span>
          </button>
        </div>
      </div>

      {/* 100MB PDF Uploader */}
      <form
        onSubmit={handleUploadAndExtract}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
              Exam Stream
            </label>
            <select
              value={exam}
              onChange={(e) => setExam(e.target.value as ExamType)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            >
              <option value="JEE_MAINS">JEE Main</option>
              <option value="JEE_ADV">JEE Advanced</option>
              <option value="NEET">NEET UG</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
              Default Class Tag
            </label>
            <select
              value={classLevel}
              onChange={(e) => setClassLevel(e.target.value as '11' | '12' | 'ALL')}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            >
              <option value="ALL">Auto-detect Class 11 / 12</option>
              <option value="11">Class 11</option>
              <option value="12">Class 12</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
              Subject Hint (Optional)
            </label>
            <select
              value={subjectHint}
              onChange={(e) => setSubjectHint(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            >
              <option value="">Auto-detect Subject</option>
              {getSubjectsForExam(exam).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
              Visibility
            </label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as 'PRIVATE' | 'PUBLIC')}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            >
              <option value="PRIVATE">Private (Only Me)</option>
              <option value="PUBLIC">Shared Community Library</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
              PYQ Bank Name
            </label>
            <input
              type="text"
              maxLength={140}
              value={bankTitle}
              onChange={(e) => setBankTitle(e.target.value)}
              placeholder="e.g., JEE Main Jan 2025 Shift 1"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
              Extraction Engine
            </label>
            <select
              value={extractionMode}
              onChange={(e) => setExtractionMode(e.target.value as 'HYBRID' | 'FAST_LOCAL')}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            >
              <option value="HYBRID">PDF.js + AI Hybrid (Best Accuracy)</option>
              <option value="FAST_LOCAL">PDF.js + Structural Parser (Instant)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  Start Page
                </label>
                <input
                  type="number"
                  min={1}
                  max={pdfQuickInfo?.totalPages || undefined}
                  value={startPage}
                  onChange={(e) => {
                    const nextStart = Math.max(1, Number(e.target.value) || 1);
                    setStartPage(nextStart);
                    if (endPage < nextStart) setEndPage(nextStart);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  End Page
                </label>
                <input
                  type="number"
                  min={startPage}
                  max={pdfQuickInfo?.totalPages || undefined}
                  value={endPage}
                  onChange={(e) => {
                    const maxP = pdfQuickInfo?.totalPages || 9999;
                    setEndPage(Math.max(startPage, Math.min(maxP, Number(e.target.value) || startPage)));
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono tabular-nums"
                />
              </div>
            </div>
            {pdfQuickInfo && pdfQuickInfo.totalPages > 0 && (
              <div className="flex items-center gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    setStartPage(1);
                    setEndPage(Math.min(10, pdfQuickInfo.totalPages));
                  }}
                  className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-mono cursor-pointer"
                >
                  1–10
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStartPage(1);
                    setEndPage(Math.min(25, pdfQuickInfo.totalPages));
                  }}
                  className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-mono cursor-pointer"
                >
                  1–25
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStartPage(1);
                    setEndPage(pdfQuickInfo.totalPages);
                  }}
                  className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-mono cursor-pointer"
                >
                  All ({pdfQuickInfo.totalPages})
                </button>
              </div>
            )}
          </div>
        </div>

        <label className="block border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 rounded-2xl p-8 text-center cursor-pointer transition-colors">
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => void handleFileChange(e.target.files?.[0] || null)}
          />
          <FileUp className="w-8 h-8 text-indigo-500 mx-auto mb-3" />
          <div className="font-semibold text-sm">
            {selectedFile
              ? `${selectedFile.name} (${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)`
              : 'Click to select a PYQ PDF (max 100 MB)'}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {pdfQuickInfo
              ? pdfQuickInfo.totalPages > 0
                ? `${pdfQuickInfo.totalPages} pages detected · ${
                    pdfQuickInfo.hasSelectableText
                      ? '2-column PDF.js text parser ready (zero upload delay)'
                      : 'Scanned/image pages detected — browser Canvas OCR ready'
                  }`
                : 'Complex PDF header detected — server repair & native reader ready'
              : 'Supports up to 100 MB PDFs · Browser PDF.js 2-column parser + OCR + Structural fallback'}
          </div>
        </label>

        {uploading && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono tabular-nums">
              <span>{uploadStageText}</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-indigo-600 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {extractionSummary && (
          <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-medium">
            {extractionSummary}
          </div>
        )}

        {uploadError && (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm">
            {uploadError}
          </div>
        )}

        {saveSuccess && (
          <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{saveSuccess}</span>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!selectedFile || uploading}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            <FileUp className="w-4 h-4" />
            <span>{uploading ? 'Processing PDF...' : 'Extract PYQs from PDF'}</span>
          </button>
        </div>
      </form>

      {/* Extracted Preview Queue */}
      {draftQuestions.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded-2xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold font-display">
                Review Extracted PYQs ({draftQuestions.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {draftQuestions.filter((q) => q.questionType === 'MCQ').length} MCQs ·{' '}
                {draftQuestions.filter((q) => q.questionType === 'NUMERICAL').length} Numericals · Click Edit on any item to refine before saving.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setDraftQuestions([]);
                  setEditingDraftIdx(null);
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                Discard
              </button>
              <button
                type="button"
                disabled={savingToFirestore}
                onClick={() => void handleSaveQuestionsToVault(draftQuestions)}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
              >
                {savingToFirestore ? saveStageText : `Save All ${draftQuestions.length} PYQs`}
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[540px] overflow-y-auto pr-2">
            {draftQuestions.map((dq, idx) => {
              const isEditing = editingDraftIdx === idx;
              const updateDraft = (patch: Partial<DraftQuestion>) => {
                setDraftQuestions((prev) =>
                  prev.map((item, i) => (i === idx ? { ...item, ...patch } : item))
                );
              };
              return (
                <div key={idx} className="py-4 space-y-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium">
                      Q{idx + 1} · {dq.subject} · Class {dq.classLevel} · {dq.topic} · {dq.questionType}
                      {dq.year ? ` · ${dq.year}` : ''}
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setEditingDraftIdx(isEditing ? null : idx)}
                        className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
                      >
                        {isEditing ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                        <span>{isEditing ? 'Done' : 'Edit'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDraftQuestions((prev) => prev.filter((_, i) => i !== idx));
                          if (editingDraftIdx === idx) setEditingDraftIdx(null);
                        }}
                        className="text-rose-500 hover:text-rose-600 cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3 text-xs">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <select
                          value={dq.subject}
                          onChange={(e) => updateDraft({ subject: e.target.value as SubjectType })}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                        >
                          {getSubjectsForExam(exam).map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        <select
                          value={dq.classLevel}
                          onChange={(e) => updateDraft({ classLevel: e.target.value as ClassLevel })}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                        >
                          <option value="11">Class 11</option>
                          <option value="12">Class 12</option>
                        </select>
                        <select
                          value={dq.questionType}
                          onChange={(e) => {
                            const nextType = e.target.value as QuestionType;
                            updateDraft({
                              questionType: nextType,
                              options: nextType === 'NUMERICAL' ? [] : dq.options.length > 0 ? dq.options : ['', '', '', ''],
                            });
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                        >
                          <option value="MCQ">MCQ</option>
                          <option value="MULTI_MCQ">Multi-Correct MCQ</option>
                          <option value="NUMERICAL">NUMERICAL</option>
                        </select>
                        <select
                          value={dq.difficulty}
                          onChange={(e) => updateDraft({ difficulty: e.target.value as DraftQuestion['difficulty'] })}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                        >
                          <option value="EASY">EASY</option>
                          <option value="MEDIUM">MEDIUM</option>
                          <option value="HARD">HARD</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <input
                          type="text"
                          value={dq.topic}
                          onChange={(e) => updateDraft({ topic: e.target.value })}
                          placeholder="Topic / Chapter"
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                        <input
                          type="text"
                          value={dq.year}
                          onChange={(e) => updateDraft({ year: e.target.value })}
                          placeholder="Year / Shift"
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                      </div>
                      <textarea
                        rows={3}
                        value={dq.prompt}
                        onChange={(e) => updateDraft({ prompt: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setCropTarget(idx)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 font-semibold cursor-pointer"
                        >
                          <Crop className="w-3.5 h-3.5" />
                          <span>{dq.imageUrl ? 'Replace Diagram' : 'Crop / Attach Diagram'}</span>
                        </button>
                        {dq.imageUrl && (
                          <button
                            type="button"
                            onClick={() => updateDraft({ imageUrl: undefined })}
                            className="text-rose-500 hover:underline cursor-pointer"
                          >
                            Remove Diagram
                          </button>
                        )}
                      </div>
                      {dq.imageUrl && (
                        <img
                          src={dq.imageUrl}
                          alt="Question diagram preview"
                          className="max-h-40 rounded-lg border border-slate-200 dark:border-slate-700 bg-white object-contain"
                        />
                      )}
                      {dq.questionType !== 'NUMERICAL' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {[0, 1, 2, 3].map((optIdx) => (
                            <input
                              key={optIdx}
                              type="text"
                              value={dq.options[optIdx] || ''}
                              onChange={(e) => {
                                const nextOpts = [...dq.options];
                                const wasCorrect = dq.correctAnswer === nextOpts[optIdx];
                                nextOpts[optIdx] = e.target.value;
                                updateDraft({
                                  options: nextOpts,
                                  ...(wasCorrect ? { correctAnswer: e.target.value } : {}),
                                });
                              }}
                              placeholder={`Option ${String.fromCharCode(65 + optIdx)}`}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                            />
                          ))}
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {dq.questionType === 'MCQ' && dq.options.filter(Boolean).length > 0 ? (
                          <select
                            value={dq.options.includes(dq.correctAnswer) ? dq.correctAnswer : dq.options.filter(Boolean)[0]}
                            onChange={(e) => updateDraft({ correctAnswer: e.target.value })}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                          >
                            {dq.options.filter(Boolean).map((opt, oIdx) => (
                              <option key={oIdx} value={opt}>
                                ({String.fromCharCode(65 + oIdx)}) {opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={dq.correctAnswer}
                            onChange={(e) => updateDraft({ correctAnswer: e.target.value })}
                            placeholder={dq.questionType === 'MULTI_MCQ' ? 'e.g., A, C or comma-separated options' : 'Correct numeric answer'}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                          />
                        )}
                        <input
                          type="text"
                          value={dq.solution}
                          onChange={(e) => updateDraft({ solution: e.target.value })}
                          placeholder="Solution explanation"
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="font-medium leading-relaxed">
                        <MathText text={dq.prompt} />
                      </div>
                      {dq.imageUrl && (
                        <img
                          src={dq.imageUrl}
                          alt="Attached question diagram"
                          className="max-h-44 rounded-xl border border-slate-200 dark:border-slate-700 bg-white p-1 object-contain"
                        />
                      )}
                      {dq.options.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                          {dq.options.map((opt, optIdx) => {
                            const isCorrect =
                              opt === dq.correctAnswer ||
                              dq.correctAnswer.split(/[,;|]+/).map((s) => s.trim()).includes(opt);
                            return (
                              <div
                                key={optIdx}
                                className={`px-2.5 py-1.5 rounded-lg border ${
                                  isCorrect
                                    ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 font-semibold'
                                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                ({String.fromCharCode(65 + optIdx)}) <MathText text={opt} />
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <span className="text-emerald-600 dark:text-emerald-400 font-mono font-semibold">
                          Answer: <MathText text={dq.correctAnswer} />
                        </span>
                        <button
                          type="button"
                          onClick={() => setCropTarget(idx)}
                          className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
                        >
                          <ImagePlus className="w-3.5 h-3.5" />
                          <span>{dq.imageUrl ? 'Change Figure' : 'Attach Figure'}</span>
                        </button>
                      </div>
                      {dq.solution && (
                        <div className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2">
                          <span className="font-semibold">Solution:</span> <MathText text={dq.solution} />
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Uploaded Banks Summary */}
      {banks.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-bold font-display">Saved PYQ Banks ({banks.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {banks.map((b) => (
              <div
                key={b.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{b.title}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
                    {EXAM_LABELS[b.exam]} · Class {b.classLevel} · {b.questionCount} Qs
                  </div>
                </div>
                {b.ownerId === userId && (
                  <button
                    type="button"
                    aria-label="Delete PYQ bank"
                    disabled={deletingId === b.id}
                    onClick={async () => {
                      setDeletingId(b.id);
                      try {
                        await onDeleteBank(b.id);
                      } finally {
                        setDeletingId((cur) => (cur === b.id ? null : cur));
                      }
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-40 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Question Bank Browser */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-bold font-display">
              Synced PYQ Question Library ({filteredQuestions.length})
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search topic or text..."
                className="pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>
            <select
              value={filterExam}
              onChange={(e) => setFilterExam(e.target.value as 'ALL' | ExamType)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            >
              <option value="ALL">All Exams</option>
              <option value="JEE_MAINS">JEE Main</option>
              <option value="JEE_ADV">JEE Adv</option>
              <option value="NEET">NEET</option>
            </select>
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value as 'ALL' | ClassLevel)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            >
              <option value="ALL">All Classes</option>
              <option value="11">Class 11</option>
              <option value="12">Class 12</option>
            </select>
            <select
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            >
              <option value="ALL">All Subjects</option>
              <option value="Physics">Physics</option>
              <option value="Chemistry">Chemistry</option>
              <option value="Mathematics">Mathematics</option>
              <option value="Biology">Biology</option>
            </select>
            <select
              value={filterQType}
              onChange={(e) => setFilterQType(e.target.value as 'ALL' | QuestionType)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            >
              <option value="ALL">All Types</option>
              <option value="MCQ">MCQ</option>
              <option value="MULTI_MCQ">Multi-Correct</option>
              <option value="NUMERICAL">Numerical</option>
            </select>
          </div>
        </div>

        {filteredQuestions.length === 0 ? (
          <div className="py-12 text-center space-y-3 text-sm text-slate-500 dark:text-slate-400">
            <p>
              No PYQs match this filter yet. Upload a PDF above, add a question manually, or load the instant verified Starter Pack.
            </p>
            {questions.length === 0 && (
              <button
                type="button"
                disabled={seedingStarter}
                onClick={() => void handleLoadStarterPack()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>{seedingStarter ? 'Loading Starter Pack...' : 'Load Verified Starter PYQ Pack (Instant)'}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[500px] overflow-y-auto pr-1">
            {filteredQuestions.slice(0, 60).map((q) => (
              <div key={q.id} className="py-4 flex items-start justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                      {EXAM_LABELS[q.exam]}
                    </span>
                    <span>·</span>
                    <span>Class {q.classLevel}</span>
                    <span>·</span>
                    <span>{q.subject}</span>
                    <span>·</span>
                    <span>{q.topic}</span>
                    {q.questionType === 'MULTI_MCQ' && (
                      <>
                        <span>·</span>
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">Multi-Correct</span>
                      </>
                    )}
                    {q.year && (
                      <>
                        <span>·</span>
                        <span>{q.year}</span>
                      </>
                    )}
                  </div>
                  <div className="text-sm font-medium line-clamp-3">
                    <MathText text={q.prompt} />
                  </div>
                  {q.imageUrl && (
                    <img
                      src={q.imageUrl}
                      alt="Question diagram"
                      className="max-h-36 rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-1 object-contain"
                    />
                  )}
                </div>
                {q.ownerId === userId && (
                  <button
                    type="button"
                    aria-label="Delete question"
                    disabled={deletingId === q.id}
                    onClick={async () => {
                      setDeletingId(q.id);
                      try {
                        await onDeleteQuestion(q.id);
                      } finally {
                        setDeletingId((cur) => (cur === q.id ? null : cur));
                      }
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 disabled:opacity-40 shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual PYQ Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveManualQuestion}
            className="max-w-xl w-full max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold font-display">Add PYQ Manually</h3>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Subject</label>
                <select
                  value={manualQ.subject}
                  onChange={(e) => setManualQ({ ...manualQ, subject: e.target.value as SubjectType })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  {getSubjectsForExam(exam).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Class</label>
                <select
                  value={manualQ.classLevel}
                  onChange={(e) => setManualQ({ ...manualQ, classLevel: e.target.value as ClassLevel })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  <option value="11">Class 11</option>
                  <option value="12">Class 12</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Type</label>
                <select
                  value={manualQ.questionType}
                  onChange={(e) => setManualQ({ ...manualQ, questionType: e.target.value as QuestionType })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  <option value="MCQ">MCQ</option>
                  <option value="MULTI_MCQ">Multi-Correct (JEE Adv)</option>
                  <option value="NUMERICAL">Numerical</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Topic / Chapter</label>
                <input
                  type="text"
                  required
                  value={manualQ.topic}
                  onChange={(e) => setManualQ({ ...manualQ, topic: e.target.value })}
                  placeholder="e.g., Rotational Dynamics"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Exam Year / Shift</label>
                <input
                  type="text"
                  value={manualQ.year}
                  onChange={(e) => setManualQ({ ...manualQ, year: e.target.value })}
                  placeholder="e.g., 2024 Jan"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Question Prompt (Supports $LaTeX$)</label>
              <textarea
                required
                rows={3}
                value={manualQ.prompt}
                onChange={(e) => setManualQ({ ...manualQ, prompt: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <button
                type="button"
                onClick={() => setCropTarget('MANUAL')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 font-semibold cursor-pointer"
              >
                <ImagePlus className="w-3.5 h-3.5" />
                <span>{manualQ.imageUrl ? 'Replace Diagram / Circuit' : 'Attach Diagram / Crop from PDF'}</span>
              </button>
              {manualQ.imageUrl && (
                <button
                  type="button"
                  onClick={() => setManualQ({ ...manualQ, imageUrl: undefined })}
                  className="text-rose-500 hover:underline cursor-pointer"
                >
                  Remove Diagram
                </button>
              )}
            </div>
            {manualQ.imageUrl && (
              <img
                src={manualQ.imageUrl}
                alt="Manual diagram preview"
                className="max-h-36 rounded-lg border border-slate-200 dark:border-slate-700 bg-white object-contain"
              />
            )}

            {manualQ.questionType !== 'NUMERICAL' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[0, 1, 2, 3].map((i) => (
                  <input
                    key={i}
                    type="text"
                    required
                    value={manualQ.options[i] || ''}
                    onChange={(e) => {
                      const next = [...manualQ.options];
                      next[i] = e.target.value;
                      setManualQ({ ...manualQ, options: next });
                    }}
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                ))}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold mb-1">
                Correct Answer{' '}
                {manualQ.questionType === 'MULTI_MCQ'
                  ? '(Comma-separated options or letters e.g. A, C)'
                  : manualQ.questionType === 'MCQ'
                    ? '(Exact option text or A/B/C/D)'
                    : '(Numeric value)'}
              </label>
              <input
                type="text"
                required
                value={manualQ.correctAnswer}
                onChange={(e) => setManualQ({ ...manualQ, correctAnswer: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Solution Explanation</label>
              <textarea
                rows={2}
                value={manualQ.solution}
                onChange={(e) => setManualQ({ ...manualQ, solution: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingToFirestore}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold cursor-pointer"
              >
                {savingToFirestore ? 'Saving...' : 'Save PYQ'}
              </button>
            </div>
          </form>
        </div>
      )}

      {cropTarget !== null && (
        <PdfDiagramCropModal
          pdfFile={selectedFile}
          initialPage={startPage}
          onAttachImage={(dataUrl) => {
            if (cropTarget === 'MANUAL') {
              setManualQ((prev) => ({ ...prev, imageUrl: dataUrl }));
            } else if (typeof cropTarget === 'number') {
              setDraftQuestions((prev) =>
                prev.map((item, i) => (i === cropTarget ? { ...item, imageUrl: dataUrl } : item))
              );
            }
            setCropTarget(null);
          }}
          onClose={() => setCropTarget(null)}
        />
      )}
    </div>
  );
};
