import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type {
  ClassLevel,
  DifficultyLevel,
  ExamType,
  QuestionType,
  SubjectType,
} from '../types/obren';
import { getSubjectsForExam } from '../types/obren';

// Wire Mozilla PDF.js Web Worker (off-main-thread decompression, glyph decoding & layout parsing)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export interface PdfQuickInfo {
  totalPages: number;
  hasSelectableText: boolean;
  parseError?: string;
}

export interface PageExtractionBatch {
  textPages: Array<{ pageNumber: number; text: string }>;
  visionPages: Array<{ pageNumber: number; imageBase64: string; mimeType: 'image/jpeg' }>;
  answerKeyContext: string;
  totalPages: number;
  processedPages: number;
  usedColumnAwareLayout: boolean;
  fallbackToServerUpload: boolean;
  fallbackReason?: string;
}

export interface IsolatedPyqDraft {
  subject: SubjectType;
  topic: string;
  classLevel: ClassLevel;
  year: string;
  questionType: QuestionType;
  prompt: string;
  options: string[];
  correctAnswer: string;
  solution: string;
  imageUrl?: string;
  difficulty: DifficultyLevel;
}

export interface IsolationValidationReport {
  valid: IsolatedPyqDraft[];
  rejectedCount: number;
  warnings: string[];
}

interface PositionedItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hasEOL: boolean;
}

export function normalizeUnicodeMathText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\u00ad/g, '')
    .replace(/\ufb01/g, 'fi')
    .replace(/\ufb02/g, 'fl')
    .replace(/\ufb00/g, 'ff')
    .replace(/[−–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');
}

function findPdfHeaderOffset(bytes: Uint8Array): number {
  const limit = Math.min(bytes.length, 131072); // search first 128 KB
  const sig = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  for (let i = 0; i <= limit - sig.length; i += 1) {
    if (
      bytes[i] === sig[0] &&
      bytes[i + 1] === sig[1] &&
      bytes[i + 2] === sig[2] &&
      bytes[i + 3] === sig[3] &&
      bytes[i + 4] === sig[4]
    ) {
      return i;
    }
  }
  return -1;
}

function reconstructLinesFromItems(items: PositionedItem[]): string {
  if (items.length === 0) return '';

  const sorted = [...items].sort((a, b) => {
    const tol = Math.max(3, Math.min(a.height, b.height) * 0.42);
    if (Math.abs(a.y - b.y) > tol) return b.y - a.y;
    return a.x - b.x;
  });

  const lines: PositionedItem[][] = [];
  for (const item of sorted) {
    const lastLine = lines[lines.length - 1];
    if (!lastLine) {
      lines.push([item]);
      continue;
    }
    const refY = lastLine[0].y;
    const tol = Math.max(3.5, Math.max(lastLine[0].height, item.height) * 0.48);
    if (Math.abs(item.y - refY) <= tol) {
      lastLine.push(item);
    } else {
      lines.push([item]);
    }
  }

  const textLines: string[] = [];
  for (const line of lines) {
    line.sort((a, b) => a.x - b.x);
    let out = '';
    let prevRight = -Infinity;
    for (const part of line) {
      const text = part.str;
      if (!text) continue;
      if (out.length > 0 && prevRight > -Infinity) {
        const gap = part.x - prevRight;
        const spaceThreshold = Math.max(1.8, (part.height || 10) * 0.22);
        if (gap > spaceThreshold && !out.endsWith(' ') && !text.startsWith(' ')) {
          out += ' ';
        }
      }
      out += text;
      prevRight = part.x + (part.width || 0);
    }
    const trimmed = normalizeUnicodeMathText(out).replace(/\s+/g, ' ').trim();
    if (trimmed) {
      textLines.push(trimmed);
    }
  }

  return textLines.join('\n');
}

function reconstructPageLayoutText(
  rawItems: PositionedItem[],
  pageWidth: number
): { text: string; twoColumnDetected: boolean } {
  if (rawItems.length === 0) {
    return { text: '', twoColumnDetected: false };
  }

  const midX = pageWidth * 0.5;
  const bandMargin = Math.max(12, pageWidth * 0.035);
  const leftItems: PositionedItem[] = [];
  const rightItems: PositionedItem[] = [];
  let crossingCount = 0;

  for (const item of rawItems) {
    const rightEdge = item.x + Math.max(0, item.width);
    if (rightEdge <= midX + bandMargin * 0.35) {
      leftItems.push(item);
    } else if (item.x >= midX - bandMargin * 0.35) {
      rightItems.push(item);
    } else {
      crossingCount += 1;
    }
  }

  const isTwoColumn =
    leftItems.length >= 12 &&
    rightItems.length >= 12 &&
    crossingCount < rawItems.length * 0.14;

  if (isTwoColumn) {
    const leftText = reconstructLinesFromItems(leftItems);
    const rightText = reconstructLinesFromItems(rightItems);
    return {
      text: [leftText, rightText].filter(Boolean).join('\n\n'),
      twoColumnDetected: true,
    };
  }

  return { text: reconstructLinesFromItems(rawItems), twoColumnDetected: false };
}

function stripRepeatedHeadersAndFooters(
  pages: Array<{ pageNumber: number; text: string }>
): Array<{ pageNumber: number; text: string }> {
  if (pages.length < 3) return pages;

  const edgeLineFreq = new Map<string, number>();
  const pageLinesList = pages.map((p) => {
    const lines = p.text.split('\n');
    const edgeLines = [...lines.slice(0, 2), ...lines.slice(-2)];
    const seenOnPage = new Set<string>();
    edgeLines.forEach((ln) => {
      const normalized = ln.replace(/\d+/g, '#').trim();
      if (normalized.length >= 5 && normalized.length <= 120 && !seenOnPage.has(normalized)) {
        seenOnPage.add(normalized);
        edgeLineFreq.set(normalized, (edgeLineFreq.get(normalized) || 0) + 1);
      }
    });
    return lines;
  });

  const minRepeat = Math.max(2, Math.floor(pages.length * 0.5));
  return pages.map((p, idx) => {
    const lines = pageLinesList[idx];
    const filtered = lines.filter((ln, lineIdx) => {
      const isEdge = lineIdx < 2 || lineIdx >= lines.length - 2;
      if (!isEdge) return true;
      const trimmed = ln.trim();
      if (/^page\s+\d+(?:\s+of\s+\d+)?$/i.test(trimmed)) return false;
      const normalized = trimmed.replace(/\d+/g, '#');
      return (edgeLineFreq.get(normalized) || 0) < minRepeat;
    });
    return { pageNumber: p.pageNumber, text: filtered.join('\n') };
  });
}

function isReadablePageText(text: string): boolean {
  const cleaned = text.trim();
  if (cleaned.length < 75) return false;
  const words = cleaned.match(/[a-zA-Z0-9]{2,}/g) || [];
  if (words.length < 10) return false;
  const printableCount = (cleaned.match(/[a-zA-Z0-9\s.,?!()[\]{}=+\-*/:;'"%^<>°]/g) || []).length;
  return printableCount / cleaned.length >= 0.68;
}

function extractAnswerKeyContextFromPages(
  pages: Array<{ pageNumber: number; text: string }>
): string {
  const snippets: string[] = [];
  for (const p of pages) {
    const keyMatch = p.text.match(
      /(?:^|\n)\s*(?:ANSWER\s*KEY|ANSWERS|OFFICIAL\s*KEY|HINTS\s*(?:&|AND)\s*SOLUTIONS|SOLUTIONS)\b[\s\S]{0,4500}/i
    );
    if (keyMatch) {
      snippets.push(`[Page ${p.pageNumber}]\n${keyMatch[0].trim()}`);
    } else {
      const denseLines = p.text.split('\n').filter((line) => {
        const keyTokens = line.match(/\b\d{1,3}\s*[\.\)\:\-]?\s*\(?[A-Da-d1-4]\)?(?=\s|,|;|$)/g) || [];
        return keyTokens.length >= 3 && line.length < 180;
      });
      if (denseLines.length >= 2) {
        snippets.push(`[Page ${p.pageNumber} Key]\n${denseLines.join('\n')}`);
      }
    }
  }
  return snippets.join('\n\n').slice(0, 5000);
}

function stripTrailingYearTag(text: string): { cleaned: string; yearTag: string } {
  const rx =
    /\s*[\[\(]\s*((?:JEE\s*(?:Main|Mains|Adv(?:anced)?)|NEET|AIEEE|AIPMT|IIT[- ]?JEE)[^\]\)]{0,28}(?:19\d\d|20[0-2]\d)[^\]\)]{0,18}|(?:19\d\d|20[0-2]\d)\s*(?:Shift|Jan|Apr|Feb|Sep|Session|Phase)[^\]\)]{0,18})\s*[\]\)]\s*$/i;
  const m = text.match(rx);
  if (!m || m.index === undefined) {
    return { cleaned: text, yearTag: '' };
  }
  return {
    cleaned: text.slice(0, m.index).trim(),
    yearTag: m[1].replace(/\s+/g, ' ').trim().slice(0, 32),
  };
}

/**
 * Isolates a single extracted question's prompt, options, correctAnswer, and solution
 * so trailing inline options, answer keys, year tags, or solution text never bleed across fields.
 */
export function isolateQuestionStructure(
  raw: Partial<IsolatedPyqDraft>,
  exam: ExamType,
  defaultClass: '11' | '12' | 'ALL' = '12'
): IsolatedPyqDraft | null {
  const validSubjects = getSubjectsForExam(exam);
  let prompt = normalizeUnicodeMathText(String(raw.prompt || '')).trim();
  let solution = normalizeUnicodeMathText(String(raw.solution || '')).trim();
  let rawAnswer = normalizeUnicodeMathText(String(raw.correctAnswer || '')).trim();
  let extractedYear = String(raw.year || '').trim();
  let options = Array.isArray(raw.options)
    ? raw.options.map((o) => normalizeUnicodeMathText(String(o)).trim()).filter(Boolean)
    : [];

  // Strip leaked "Sol:/Explanation:" tail from prompt if present
  const leakedSolInPrompt = prompt.match(
    /(?:^|\n)\s*(?:Sol(?:ution)?|Exp(?:lanation)?|Hint)\s*[:\.\-]\s*([\s\S]+)$/i
  );
  if (leakedSolInPrompt && leakedSolInPrompt.index !== undefined) {
    if (!solution) {
      solution = leakedSolInPrompt[1].trim();
    }
    prompt = prompt.slice(0, leakedSolInPrompt.index).trim();
  }

  // Strip leaked "Ans:/Key:" tail from prompt if present
  const leakedAnsInPrompt = prompt.match(
    /(?:^|\n|\s)(?:Ans(?:wer)?|Correct\s*(?:Option|Answer)|Key)\s*[:\.\-]\s*\(?([A-Da-d1-4]|-?\d+(?:\.\d+)?)\)?\.?\s*$/i
  );
  if (leakedAnsInPrompt && leakedAnsInPrompt.index !== undefined) {
    if (!rawAnswer) {
      rawAnswer = leakedAnsInPrompt[1].trim();
    }
    prompt = prompt.slice(0, leakedAnsInPrompt.index).trim();
  }

  // Strip leaked "Ans:/Sol:" and trailing year tags from options
  if (options.length > 0) {
    const cleanedOpts: string[] = [];
    for (let i = 0; i < options.length && cleanedOpts.length < 6; i += 1) {
      let opt = options[i];
      const optSol = opt.match(/(?:^|\n|\s)(?:Sol(?:ution)?|Exp(?:lanation)?)\s*[:\.\-]\s*([\s\S]+)$/i);
      if (optSol && optSol.index !== undefined) {
        if (!solution) solution = optSol[1].trim();
        opt = opt.slice(0, optSol.index).trim();
      }
      const optAns = opt.match(/(?:^|\n|\s)(?:Ans(?:wer)?|Key)\s*[:\.\-]\s*\(?([A-Da-d1-4]|-?\d+(?:\.\d+)?)\)?\.?\s*$/i);
      if (optAns && optAns.index !== undefined) {
        if (!rawAnswer) rawAnswer = optAns[1].trim();
        opt = opt.slice(0, optAns.index).trim();
      }
      const yearRes = stripTrailingYearTag(opt);
      if (yearRes.yearTag) {
        if (!extractedYear || extractedYear === 'PYQ') extractedYear = yearRes.yearTag;
        opt = yearRes.cleaned;
      }
      // Clean leading option labels like "(A) " or "A) " or "(1) " if duplicated
      opt = opt.replace(/^(?:\([A-Da-d1-4]\)|[A-Da-d1-4][\.\)])\s+/, '').trim();
      if (opt) cleanedOpts.push(opt.slice(0, 500));
    }
    options = cleanedOpts;
  }

  // If options were empty for an MCQ, attempt inline (A)...(D) / A)...D) / (1)...(4) split from prompt
  if (options.length === 0 && raw.questionType !== 'NUMERICAL') {
    const splitPatterns = [
      /(?:^|\n|\s)\(([A-Da-d])\)\s+/g,
      /(?:^|\n|\s)([A-Da-d])\)\s+/g,
      /(?:^|\n|\s)\(([1-4])\)\s+/g,
    ];
    for (const inlineRx of splitPatterns) {
      inlineRx.lastIndex = 0;
      const marks: Array<{ label: string; start: number; contentStart: number }> = [];
      let m: RegExpExecArray | null;
      while ((m = inlineRx.exec(prompt)) !== null) {
        marks.push({
          label: m[1].toUpperCase(),
          start: m.index,
          contentStart: m.index + m[0].length,
        });
      }
      const aIdx = marks.findIndex((mk) => mk.label === 'A' || mk.label === '1');
      if (aIdx >= 0 && marks.length - aIdx >= 4) {
        const expected = marks[aIdx].label === 'A' ? ['A', 'B', 'C', 'D'] : ['1', '2', '3', '4'];
        const seq = marks.slice(aIdx, aIdx + 4);
        if (seq.every((mk, idx) => mk.label === expected[idx])) {
          const stemOnly = prompt.slice(0, seq[0].start).trim();
          const extractedOpts = seq.map((mk, idx) => {
            const end = idx + 1 < seq.length ? seq[idx + 1].start : prompt.length;
            let optVal = prompt.slice(mk.contentStart, end).replace(/\s+/g, ' ').trim();
            if (idx === 3) {
              const yr = stripTrailingYearTag(optVal);
              if (yr.yearTag) {
                if (!extractedYear || extractedYear === 'PYQ') extractedYear = yr.yearTag;
                optVal = yr.cleaned;
              }
            }
            return optVal;
          });
          if (stemOnly.length >= 12 && extractedOpts.every(Boolean)) {
            prompt = stemOnly;
            options = extractedOpts;
            break;
          }
        }
      }
    }
  }

  // Strip leading question number prefix (e.g., "Q12. " or "12) ") cleanly
  prompt = prompt.replace(/^(?:Q(?:uestion)?\.?\s*#?\s*\d{1,3}\s*[\.\):\-]?\s*)/i, '').trim();
  const promptYear = stripTrailingYearTag(prompt);
  if (promptYear.yearTag) {
    if (!extractedYear || extractedYear === 'PYQ') extractedYear = promptYear.yearTag;
    prompt = promptYear.cleaned;
  }

  if (prompt.length < 8) return null;

  const questionType: QuestionType =
    raw.questionType === 'NUMERICAL' || options.length === 0
      ? 'NUMERICAL'
      : raw.questionType === 'MULTI_MCQ' && options.length >= 2
        ? 'MULTI_MCQ'
        : 'MCQ';

  if (questionType === 'NUMERICAL') {
    options = [];
  } else {
    options = options.slice(0, 6);
  }

  // Resolve exact correctAnswer cleanly to isolated option text or numerical token
  let correctAnswer = rawAnswer.replace(/^\(?([A-Da-d1-4])\)?\.?$/, '$1').trim();
  const idxMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, '1': 0, '2': 1, '3': 2, '4': 3 };
  if (questionType === 'MULTI_MCQ' && options.length > 0) {
    let parts = correctAnswer
      .split(/[,;|]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 1 && /^[A-Da-d1-4]{2,4}$/.test(parts[0])) {
      parts = parts[0].split('');
    }
    const resolved = Array.from(
      new Set(
        parts
          .map((part) => {
            const key = part.replace(/[().]/g, '').trim().toUpperCase();
            if (key in idxMap && options[idxMap[key]]) {
              return options[idxMap[key]];
            }
            const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
            return options.find((o) => norm(o) === norm(part)) || '';
          })
          .filter(Boolean)
      )
    );
    correctAnswer = resolved.length > 0 ? resolved.join(', ') : options[0];
  } else if (questionType === 'MCQ' && options.length > 0) {
    const upper = correctAnswer.toUpperCase();
    if (upper in idxMap && options[idxMap[upper]]) {
      correctAnswer = options[idxMap[upper]];
    } else if (!options.includes(correctAnswer)) {
      const strippedAnswer = correctAnswer
        .replace(/^(?:\([A-Da-d1-4]\)|[A-Da-d1-4][\.\)])\s+/, '')
        .trim();
      const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
      const normAns = norm(strippedAnswer);
      const matched =
        options.find((o) => norm(o) === normAns) ||
        options.find((o) => normAns.length > 0 && (norm(o).startsWith(normAns) || normAns.startsWith(norm(o))));
      correctAnswer = matched || options[0];
    }
  } else if (questionType === 'NUMERICAL') {
    const numMatch = correctAnswer.match(/-?\d+(?:\.\d+)?/);
    correctAnswer = numMatch ? numMatch[0] : correctAnswer || '0';
  }

  if (!correctAnswer) {
    correctAnswer = options[0] || '0';
  }

  const subject: SubjectType =
    raw.subject && validSubjects.includes(raw.subject) ? raw.subject : validSubjects[0];
  const classLevel: ClassLevel =
    raw.classLevel === '11' || raw.classLevel === '12'
      ? raw.classLevel
      : defaultClass === '11' || defaultClass === '12'
        ? defaultClass
        : '12';
  const difficulty: DifficultyLevel =
    raw.difficulty === 'EASY' || raw.difficulty === 'HARD' ? raw.difficulty : 'MEDIUM';

  const cleanImageUrl =
    typeof raw.imageUrl === 'string' && raw.imageUrl.trim().length > 0 && raw.imageUrl.length <= 250000
      ? raw.imageUrl.trim()
      : undefined;

  return {
    subject,
    topic: (String(raw.topic || 'Core PYQ').trim() || 'Core PYQ').slice(0, 120),
    classLevel,
    year: (extractedYear || 'PYQ').slice(0, 32),
    questionType,
    prompt: prompt.slice(0, 4000),
    options,
    correctAnswer: correctAnswer.slice(0, 200),
    solution: (solution || 'Verify core concepts and formula substitution.').slice(0, 4000),
    ...(cleanImageUrl ? { imageUrl: cleanImageUrl } : {}),
    difficulty,
  };
}

/**
 * Sanitizes and validates an entire batch of extracted questions against Firestore rule limits
 * prior to database submission so invalid payloads cannot trigger schema rejections.
 */
export function validateQuestionsForDatabase(
  questions: Array<Partial<IsolatedPyqDraft>>,
  exam: ExamType,
  defaultClass: '11' | '12' | 'ALL' = '12'
): IsolationValidationReport {
  const valid: IsolatedPyqDraft[] = [];
  const warnings: string[] = [];
  let rejectedCount = 0;

  questions.forEach((q, idx) => {
    const isolated = isolateQuestionStructure(q, exam, defaultClass);
    if (!isolated) {
      rejectedCount += 1;
      warnings.push(`Question #${idx + 1} skipped: prompt was empty or malformed.`);
      return;
    }
    if ((isolated.questionType === 'MCQ' || isolated.questionType === 'MULTI_MCQ') && isolated.options.length < 2) {
      rejectedCount += 1;
      warnings.push(`Question #${idx + 1} skipped: MCQ had fewer than 2 isolated options.`);
      return;
    }
    valid.push(isolated);
  });

  return { valid, rejectedCount, warnings };
}

export class PdfExtractor {
  static async inspect(file: File): Promise<PdfQuickInfo> {
    try {
      const buffer = await file.arrayBuffer();
      let bytes = new Uint8Array(buffer);
      const pdfOffset = findPdfHeaderOffset(bytes);
      if (pdfOffset < 0) {
        return {
          totalPages: 0,
          hasSelectableText: false,
          parseError: 'PDF header not found locally; server inspection required.',
        };
      }
      if (pdfOffset > 0) {
        bytes = bytes.subarray(pdfOffset);
      }

      const loadingTask = pdfjsLib.getDocument({
        data: bytes,
        verbosity: 0,
        stopAtErrors: false,
        isEvalSupported: false,
      });
      const pdfDoc = await loadingTask.promise;
      try {
        const totalPages = pdfDoc.numPages;
        let sampleTextLen = 0;
        const samplePages = Math.min(2, totalPages);
        for (let p = 1; p <= samplePages; p += 1) {
          const page = await pdfDoc.getPage(p);
          try {
            const tc = await page.getTextContent();
            const joined = tc.items
              .map((it) => ('str' in it ? it.str : ''))
              .join(' ')
              .trim();
            sampleTextLen += joined.length;
          } finally {
            page.cleanup();
          }
        }
        return {
          totalPages,
          hasSelectableText: sampleTextLen >= 90,
        };
      } finally {
        await pdfDoc.destroy();
      }
    } catch (err) {
      return {
        totalPages: 0,
        hasSelectableText: false,
        parseError: err instanceof Error ? err.message : 'Unable to inspect PDF locally.',
      };
    }
  }

  static async extractPages(
    file: File,
    startPage: number,
    endPage: number,
    onProgress?: (pct: number, stage: string) => void
  ): Promise<PageExtractionBatch> {
    try {
      onProgress?.(4, 'Initializing PDF.js Web Worker...');
      const rawBuffer = await file.arrayBuffer();
      let bytes = new Uint8Array(rawBuffer);
      const pdfOffset = findPdfHeaderOffset(bytes);
      if (pdfOffset < 0) {
        return {
          textPages: [],
          visionPages: [],
          answerKeyContext: '',
          totalPages: 0,
          processedPages: 0,
          usedColumnAwareLayout: false,
          fallbackToServerUpload: true,
          fallbackReason: 'Missing %PDF- header locally',
        };
      }
      if (pdfOffset > 0) {
        bytes = bytes.subarray(pdfOffset);
      }

      const loadingTask = pdfjsLib.getDocument({
        data: bytes,
        verbosity: 0,
        stopAtErrors: false,
        isEvalSupported: false,
      });
      const pdfDoc = await loadingTask.promise;

      try {
        const totalPages = pdfDoc.numPages;
        const firstPage = Math.max(1, Math.min(startPage, totalPages));
        const lastPage = Math.max(firstPage, Math.min(endPage, totalPages));
        const pageCount = lastPage - firstPage + 1;

        const rawTextPages: Array<{ pageNumber: number; text: string }> = [];
        const visionPages: Array<{ pageNumber: number; imageBase64: string; mimeType: 'image/jpeg' }> = [];
        let usedColumnAwareLayout = false;

        for (let p = firstPage; p <= lastPage; p += 1) {
          const doneCount = p - firstPage;
          onProgress?.(
            5 + Math.round((doneCount / Math.max(1, pageCount)) * 40),
            `PDF.js worker parsing page ${p} of ${lastPage}...`
          );

          const page = await pdfDoc.getPage(p);
          try {
            const viewport = page.getViewport({ scale: 1.0 });
            const textContent = await page.getTextContent();
            const positioned: PositionedItem[] = [];

            for (const rawItem of textContent.items) {
              if (!('str' in rawItem) || !rawItem.str) continue;
              const tm = rawItem.transform;
              positioned.push({
                str: rawItem.str,
                x: Number(tm?.[4] ?? 0),
                y: Number(tm?.[5] ?? 0),
                width: Number(rawItem.width ?? 0),
                height: Math.max(6, Math.abs(Number(tm?.[3] ?? rawItem.height ?? 10))),
                hasEOL: Boolean(rawItem.hasEOL),
              });
            }

            const layoutResult = reconstructPageLayoutText(positioned, viewport.width);
            if (layoutResult.twoColumnDetected) {
              usedColumnAwareLayout = true;
            }

            if (isReadablePageText(layoutResult.text)) {
              rawTextPages.push({ pageNumber: p, text: layoutResult.text });
            } else if (visionPages.length < 15) {
              onProgress?.(
                5 + Math.round((doneCount / Math.max(1, pageCount)) * 40),
                `Rendering scanned page ${p} via PDF.js worker...`
              );
              const renderViewport = page.getViewport({ scale: 1.6 });
              const canvas = document.createElement('canvas');
              canvas.width = Math.min(1800, Math.ceil(renderViewport.width));
              canvas.height = Math.min(2600, Math.ceil(renderViewport.height));
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                await page.render({
                  canvas,
                  canvasContext: ctx,
                  viewport: renderViewport,
                }).promise;
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                const base64 = dataUrl.split(',')[1] || '';
                if (base64) {
                  visionPages.push({
                    pageNumber: p,
                    imageBase64: base64,
                    mimeType: 'image/jpeg',
                  });
                }
              }
            }
          } finally {
            page.cleanup();
          }
        }

        const textPages = stripRepeatedHeadersAndFooters(rawTextPages);
        const answerKeyContext = extractAnswerKeyContextFromPages(textPages);

        return {
          textPages,
          visionPages,
          answerKeyContext,
          totalPages,
          processedPages: pageCount,
          usedColumnAwareLayout,
          fallbackToServerUpload: false,
        };
      } finally {
        await pdfDoc.destroy();
      }
    } catch (err) {
      return {
        textPages: [],
        visionPages: [],
        answerKeyContext: '',
        totalPages: 0,
        processedPages: 0,
        usedColumnAwareLayout: false,
        fallbackToServerUpload: true,
        fallbackReason: err instanceof Error ? err.message : 'PDF.js worker parse failed',
      };
    }
  }

  static isolateAll(
    rawQuestions: Array<Partial<IsolatedPyqDraft>>,
    exam: ExamType,
    defaultClass: '11' | '12' | 'ALL' = '12'
  ): IsolationValidationReport {
    return validateQuestionsForDatabase(rawQuestions, exam, defaultClass);
  }
}
