import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import zlib from 'zlib';
import dotenv from 'dotenv';
import { PDFParse } from 'pdf-parse';
import nodemailer from 'nodemailer';
import { GoogleGenAI, ThinkingLevel, Type, createPartFromUri } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { extractExplicitKeySections, extractPyqsDeterministically, normalizeMathText } from './server/pyqTextParser.ts';
import {
  detectConnectedProviders,
  generateQuestionPaper,
  regenerateSingleQuestion,
  verifyGroqConnection,
  type EnabledProvidersMap,
  type ServerAiClassChoice,
  type ServerAiExamTarget,
  type ServerAiQuestionFormat,
  type ServerSubjectType,
} from './server/aiPaperService.ts';
import { generateAiTutorReplyWithFailover } from './server/aiChatService.ts';
import { teacherRouter } from './server/teacherRoutes.ts';
import { attachGroupChatWebSocketServer } from './server/groupChatService.ts';

dotenv.config();

const firebaseConfigPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8')) as {
  apiKey: string;
  projectId: string;
};

const PORT = 3000;
const MAX_PDF_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_CHUNK_BYTES = 8 * 1024 * 1024; // 8 MB per HTTP chunk (well under 32MB proxy limit)
const uploadDir = path.join(os.tmpdir(), 'obren-pdf-uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.pdf`),
});

const upload = multer({
  storage: diskStorage,
  limits: { fileSize: MAX_PDF_BYTES },
  fileFilter: (_req, file, cb) => {
    const isPdf =
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      cb(new Error('Only PDF files are supported.'));
      return;
    }
    cb(null, true);
  },
});

const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CHUNK_BYTES },
});

interface AuthenticatedRequest extends Request {
  authUser?: {
    uid: string;
    email: string;
    emailVerified: boolean;
  };
}

async function requireFirebaseAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ error: 'Authentication required. Please sign in.' });
      return;
    }

    const verifyResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      }
    );

    if (!verifyResp.ok) {
      res.status(401).json({ error: 'Invalid or expired authentication session.' });
      return;
    }

    const payload = (await verifyResp.json()) as {
      users?: Array<{ localId: string; email?: string; emailVerified?: boolean }>;
    };
    const user = payload.users?.[0];
    if (!user || !user.localId) {
      res.status(401).json({ error: 'Unable to verify user identity.' });
      return;
    }

    req.authUser = {
      uid: user.localId,
      email: user.email || '',
      emailVerified: Boolean(user.emailVerified),
    };
    next();
  } catch (err) {
    res.status(401).json({
      error: err instanceof Error ? err.message : 'Authentication verification failed.',
    });
  }
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function parseGeminiHttpError(err: unknown): {
  status: number;
  message: string;
  retryable: boolean;
} {
  const raw = err instanceof Error ? err.message : String(err || 'AI request failed.');
  let code = 500;
  let apiStatus = '';
  let apiMessage = raw;

  try {
    const jsonStart = raw.indexOf('{');
    if (jsonStart >= 0) {
      const parsed = JSON.parse(raw.slice(jsonStart)) as {
        error?: { code?: number; message?: string; status?: string };
      };
      if (parsed.error) {
        code = parsed.error.code || code;
        apiStatus = parsed.error.status || '';
        apiMessage = parsed.error.message || raw;
      }
    }
  } catch {
    // Non-JSON error message
  }

  const lower = `${apiStatus} ${apiMessage}`.toLowerCase();
  if (code === 503 || lower.includes('unavailable') || lower.includes('high demand') || lower.includes('overloaded')) {
    return {
      status: 503,
      message:
        'AI services are currently experiencing a temporary traffic spike. Please wait a few seconds and try again.',
      retryable: true,
    };
  }
  if (code === 429 || lower.includes('resource_exhausted') || lower.includes('rate limit') || lower.includes('quota')) {
    return {
      status: 429,
      message: 'AI assistant rate limit reached momentarily. Please wait a few seconds and try again.',
      retryable: true,
    };
  }
  if (code === 403 || code === 401 || lower.includes('api_key_invalid') || lower.includes('permission_denied')) {
    return {
      status: 403,
      message: 'Gemini API key permission error. Please check your key in Settings > Secrets.',
      retryable: false,
    };
  }
  if (lower.includes('unable to process') || lower.includes('invalid_argument') || lower.includes('no pages')) {
    return {
      status: 422,
      message:
        'This PDF file appears to be password-protected, encrypted, or unreadable. Try opening it in Chrome/Preview and choosing "Print -> Save as PDF", then upload the fresh copy.',
      retryable: false,
    };
  }

  return {
    status: code >= 400 && code < 600 ? code : 500,
    message: apiMessage,
    retryable: lower.includes('econnreset') || lower.includes('etimedout') || lower.includes('fetch failed'),
  };
}

function parseMultiProviderHttpError(err: unknown): {
  status: number;
  message: string;
  retryable: boolean;
} {
  const raw = err instanceof Error ? err.message : String(err || 'AI request failed.');
  const lower = raw.toLowerCase();

  if (
    lower.includes('529') ||
    lower.includes('503') ||
    lower.includes('overloaded') ||
    lower.includes('unavailable')
  ) {
    return {
      status: 503,
      message: 'All configured AI providers are experiencing high traffic right now. Please retry in a few seconds.',
      retryable: true,
    };
  }
  if (
    lower.includes('429') ||
    lower.includes('402') ||
    lower.includes('resource_exhausted') ||
    lower.includes('rate limit') ||
    lower.includes('rate_limit') ||
    lower.includes('quota') ||
    lower.includes('insufficient balance') ||
    lower.includes('credit balance')
  ) {
    return {
      status: 429,
      message:
        'Configured AI models temporarily reached their rate or quota limit. Please retry shortly or verify provider credits in server secrets.',
      retryable: true,
    };
  }
  if (lower.includes('401') || lower.includes('403') || lower.includes('authentication') || lower.includes('api_key_invalid')) {
    return {
      status: 403,
      message: 'AI provider API key authentication error. Please verify your configured server secrets.',
      retryable: false,
    };
  }
  return parseGeminiHttpError(err);
}

function normalizeEnabledProviders(raw: unknown): EnabledProvidersMap | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  return {
    gemini: obj.gemini !== false,
    openai: obj.openai !== false,
    anthropic: obj.anthropic !== false,
    deepseek: obj.deepseek !== false,
    groq: obj.groq !== false,
  };
}

async function generatePyqExtractionWithRetry(
  ai: GoogleGenAI,
  contents: Parameters<GoogleGenAI['models']['generateContent']>[0]['contents'],
  exam: string
) {
  const attempts: Array<{ model: string; useLowThinking: boolean; delayMs: number }> = [
    { model: 'gemini-4-hydrogen', useLowThinking: true, delayMs: 0 },
    { model: 'gemini-4-hydrogen', useLowThinking: true, delayMs: 1200 },
    { model: 'gemini-4-hydrogen', useLowThinking: true, delayMs: 2500 },
    { model: 'gemini-3.1-flash-lite', useLowThinking: false, delayMs: 800 },
    { model: 'gemini-3.1-flash-lite', useLowThinking: false, delayMs: 2000 },
  ];

  let lastErr: unknown;
  for (let i = 0; i < attempts.length; i += 1) {
    const { model, useLowThinking, delayMs } = attempts[i];
    if (delayMs > 0) {
      const jitter = Math.floor(Math.random() * 400);
      await new Promise((r) => setTimeout(r, delayMs + jitter));
    }
    try {
      return await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: buildExtractionSystemInstruction(exam),
          ...(useLowThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
          responseMimeType: 'application/json',
          responseSchema: pyqExtractionSchema,
        },
      });
    } catch (err) {
      lastErr = err;
      const parsed = parseGeminiHttpError(err);
      if (!parsed.retryable) {
        throw err;
      }
    }
  }
  throw lastErr;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s.`));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function generateAiQuestionsWithRetry(
  ai: GoogleGenAI,
  promptText: string,
  systemInstruction: string
) {
  const attempts: Array<{ model: string; thinkingLevel?: ThinkingLevel; delayMs: number; timeoutMs: number }> = [
    { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, delayMs: 0, timeoutMs: 14000 },
    { model: 'gemini-3.1-flash-lite', delayMs: 300, timeoutMs: 13000 },
    { model: 'gemini-3.1-flash-lite', delayMs: 900, timeoutMs: 12000 },
  ];

  let lastErr: unknown;
  for (let i = 0; i < attempts.length; i += 1) {
    const { model, thinkingLevel, delayMs, timeoutMs } = attempts[i];
    if (delayMs > 0) {
      const jitter = Math.floor(Math.random() * 250);
      await new Promise((r) => setTimeout(r, delayMs + jitter));
    }
    try {
      return await withTimeout(
        ai.models.generateContent({
          model,
          contents: promptText,
          config: {
            systemInstruction,
            ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
            responseMimeType: 'application/json',
            responseSchema: pyqExtractionSchema,
          },
        }),
        timeoutMs,
        `Gemini (${model})`
      );
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      const parsed = parseGeminiHttpError(err);
      const isTimeout = msg.includes('timed out');
      if (!parsed.retryable && !isTimeout) {
        throw err;
      }
    }
  }
  throw lastErr;
}

// Cleanup stale temp PDFs older than 20 minutes
function cleanupStaleUploads() {
  fs.promises
    .readdir(uploadDir)
    .then(async (files) => {
      const cutoff = Date.now() - 20 * 60 * 1000;
      for (const f of files) {
        const full = path.join(uploadDir, f);
        const st = await fs.promises.stat(full).catch(() => null);
        if (st && st.mtimeMs < cutoff) {
          await fs.promises.unlink(full).catch(() => {});
        }
      }
    })
    .catch(() => {});
}

function safeUploadFilePath(uid: string, uploadId: string): string {
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '');
  const safeId = uploadId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeUid || !safeId || safeId.length < 6) {
    throw new Error('Invalid upload identifier.');
  }
  const resolved = path.resolve(uploadDir, `${safeUid}_${safeId}.pdf`);
  if (!resolved.startsWith(path.resolve(uploadDir) + path.sep)) {
    throw new Error('Invalid upload path.');
  }
  return resolved;
}

interface ExtractedPyqItem {
  subject: 'Physics' | 'Chemistry' | 'Mathematics' | 'Biology';
  topic: string;
  classLevel: '11' | '12';
  year: string;
  questionType: 'MCQ' | 'NUMERICAL' | 'MULTI_MCQ';
  prompt: string;
  options: string[];
  correctAnswer: string;
  solution: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
}

const pyqExtractionSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      subject: {
        type: Type.STRING,
        description: 'Must be one of: Physics, Chemistry, Mathematics, Biology',
      },
      topic: {
        type: Type.STRING,
        description: 'Concise chapter or topic name, e.g. Electrostatics, Rotational Motion, Organic Chemistry',
      },
      classLevel: {
        type: Type.STRING,
        description: 'Must be "11" or "12"',
      },
      year: {
        type: Type.STRING,
        description: 'Exam year/shift if present in text, otherwise "PYQ"',
      },
      questionType: {
        type: Type.STRING,
        description: 'Must be "MCQ" or "NUMERICAL"',
      },
      prompt: {
        type: Type.STRING,
        description: 'Complete question statement cleanly formatted without answer key',
      },
      options: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: '4 option strings for MCQ, or empty array [] for NUMERICAL',
      },
      correctAnswer: {
        type: Type.STRING,
        description: 'For MCQ: exact matching option string or letter (A/B/C/D resolved to option text). For NUMERICAL: exact numeric string.',
      },
      solution: {
        type: Type.STRING,
        description: 'Concise step-by-step solution or explanation.',
      },
      difficulty: {
        type: Type.STRING,
        description: 'Must be EASY, MEDIUM, or HARD',
      },
    },
    required: ['subject', 'topic', 'classLevel', 'questionType', 'prompt', 'options', 'correctAnswer', 'difficulty'],
  },
};

function unwrapJsonArray(parsed: unknown): ExtractedPyqItem[] {
  if (Array.isArray(parsed)) return parsed as ExtractedPyqItem[];
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as { questions?: unknown; items?: unknown };
    if (Array.isArray(obj.questions)) return obj.questions as ExtractedPyqItem[];
    if (Array.isArray(obj.items)) return obj.items as ExtractedPyqItem[];
  }
  return [];
}

function escapeInvalidJsonBackslashes(raw: string): string {
  // Replace single backslashes not forming valid JSON escapes (\" \\ \/ \b \f \n \r \t \uXXXX)
  return raw.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\');
}

function parseGeminiJsonArray(rawText: string | undefined): ExtractedPyqItem[] {
  if (!rawText) return [];
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  for (const variant of [cleaned, escapeInvalidJsonBackslashes(cleaned)]) {
    try {
      const parsed = JSON.parse(variant);
      const unwrapped = unwrapJsonArray(parsed);
      if (unwrapped.length > 0) return unwrapped;
    } catch {
      // Fall through to truncation salvage
    }

    const arrStart = variant.indexOf('[');
    if (arrStart >= 0) {
      let searchEnd = variant.length;
      while (searchEnd > arrStart) {
        const lastBrace = variant.lastIndexOf('}', searchEnd - 1);
        if (lastBrace <= arrStart) break;
        const candidate = `${variant.slice(arrStart, lastBrace + 1).replace(/,\s*$/, '')}]`;
        try {
          const salvaged = JSON.parse(candidate);
          if (Array.isArray(salvaged) && salvaged.length > 0) {
            return salvaged as ExtractedPyqItem[];
          }
        } catch {
          searchEnd = lastBrace;
        }
      }
    }
  }
  return [];
}

function stripOptionPrefix(opt: string): string {
  return opt
    .replace(/^\s*(?:\([A-Da-d1-4]\)|[A-Da-d1-4][\.\)])\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pullTrailingYearTag(text: string): { cleaned: string; yearTag: string } {
  const rx =
    /\s*[\[\(]\s*((?:JEE\s*(?:Main|Mains|Adv(?:anced)?)|NEET|AIEEE|AIPMT|IIT[- ]?JEE)[^\]\)]{0,28}(?:19\d\d|20[0-2]\d)[^\]\)]{0,18}|(?:19\d\d|20[0-2]\d)\s*(?:Shift|Jan|Apr|Feb|Sep|Session|Phase)[^\]\)]{0,18})\s*[\]\)]\s*$/i;
  const m = text.match(rx);
  if (!m || m.index === undefined) return { cleaned: text, yearTag: '' };
  return {
    cleaned: text.slice(0, m.index).trim(),
    yearTag: m[1].replace(/\s+/g, ' ').trim().slice(0, 30),
  };
}

function normalizeExtractedQuestions(
  rawList: ExtractedPyqItem[],
  exam: string,
  defaultClass: string,
  subjectHint?: string
): ExtractedPyqItem[] {
  const validSubjects =
    exam === 'NEET'
      ? ['Physics', 'Chemistry', 'Biology']
      : ['Physics', 'Chemistry', 'Mathematics'];

  return rawList
    .filter((q) => q && typeof q.prompt === 'string' && q.prompt.trim().length > 8)
    .map((q) => {
      const subject: ExtractedPyqItem['subject'] = validSubjects.includes(q.subject)
        ? q.subject
        : subjectHint && validSubjects.includes(subjectHint)
          ? (subjectHint as ExtractedPyqItem['subject'])
          : (validSubjects[0] as ExtractedPyqItem['subject']);

      const classLevel: '11' | '12' =
        q.classLevel === '11' || q.classLevel === '12'
          ? q.classLevel
          : defaultClass === '11' || defaultClass === '12'
            ? defaultClass
            : '12';

      let inferredYear = String(q.year || 'PYQ').trim();
      const options = (Array.isArray(q.options) ? q.options : [])
        .map((o, idx, arr) => {
          let cleaned = stripOptionPrefix(String(o));
          if (idx === arr.length - 1) {
            const pulled = pullTrailingYearTag(cleaned);
            if (pulled.yearTag) {
              if (!inferredYear || inferredYear === 'PYQ') inferredYear = pulled.yearTag;
              cleaned = pulled.cleaned;
            }
          }
          return cleaned;
        })
        .filter(Boolean)
        .slice(0, 6);

      const questionType: 'MCQ' | 'NUMERICAL' | 'MULTI_MCQ' =
        q.questionType === 'NUMERICAL' || options.length === 0
          ? 'NUMERICAL'
          : q.questionType === 'MULTI_MCQ'
            ? 'MULTI_MCQ'
            : 'MCQ';

      let correctAnswer = stripOptionPrefix(String(q.correctAnswer || '').trim());
      if (questionType === 'MCQ' && options.length > 0) {
        const keyToken = correctAnswer.replace(/[().]/g, '').trim().toUpperCase();
        const keyMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, '1': 0, '2': 1, '3': 2, '4': 3 };
        if (keyToken in keyMap && options[keyMap[keyToken]]) {
          correctAnswer = options[keyMap[keyToken]];
        } else if (!options.includes(correctAnswer)) {
          const matchByLower = options.find(
            (opt) => opt.toLowerCase() === correctAnswer.toLowerCase()
          );
          if (matchByLower) {
            correctAnswer = matchByLower;
          } else {
            const matchByPrefix = options.find((opt) =>
              opt.toLowerCase().startsWith(correctAnswer.toLowerCase())
            );
            if (matchByPrefix) correctAnswer = matchByPrefix;
          }
        }
      } else if (questionType === 'MULTI_MCQ' && options.length > 0) {
        const keyMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, '1': 0, '2': 1, '3': 2, '4': 3 };
        const resolved = correctAnswer
          .split(/[,;|]+/)
          .map((p) => stripOptionPrefix(p).trim())
          .filter(Boolean)
          .map((part) => {
            const tok = part.replace(/[().]/g, '').trim().toUpperCase();
            if (tok in keyMap && options[keyMap[tok]]) return options[keyMap[tok]];
            const match = options.find((opt) => opt.toLowerCase() === part.toLowerCase());
            return match || part;
          });
        if (resolved.length > 0) {
          correctAnswer = Array.from(new Set(resolved)).join(', ');
        }
      }
      if (!correctAnswer && options.length > 0) {
        correctAnswer = options[0];
      }

      const difficulty: 'EASY' | 'MEDIUM' | 'HARD' =
        q.difficulty === 'EASY' || q.difficulty === 'HARD' ? q.difficulty : 'MEDIUM';

      return {
        subject,
        topic: String(q.topic || 'General PYQ').trim().slice(0, 110),
        classLevel,
        year: (inferredYear || 'PYQ').slice(0, 30),
        questionType,
        prompt: q.prompt.trim().slice(0, 3900),
        options,
        correctAnswer: (correctAnswer || '0').slice(0, 190),
        solution: String(q.solution || 'Review the core formula and verify boundary conditions.').trim().slice(0, 3900),
        difficulty,
      };
    });
}

function buildExtractionSystemInstruction(exam: string): string {
  return `You are an expert Indian competitive exam (JEE Mains, JEE Advanced, NEET) PYQ parser.
Extract every actual Past Year Question present in the provided content into strict JSON.
Do NOT invent or fabricate questions, and do NOT include non-question headers, footers, or standalone answer key tables as questions.
Formatting rules:
- Identify subject (${exam === 'NEET' ? 'Physics, Chemistry, or Biology' : 'Physics, Chemistry, or Mathematics'}), specific NCERT/exam topic, and Class 11 or 12.
- Move exam year/shift tags like "[JEE Main 2024]" out of prompt/options into the "year" field.
- Options array must contain clean option text WITHOUT "(A)", "B)", "(1)" prefixes. Use [] for NUMERICAL questions.
- Resolve "correctAnswer" from any provided Answer Key or Hints & Solutions section first; for MCQ, return the exact matching option text (or resolved A/B/C/D option text). Provide a crisp step-by-step solution.`;
}

type BufferInspectionResult =
  | { kind: 'pdf'; buffer: Buffer; trimmedBytes: number }
  | { kind: 'image'; mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; buffer: Buffer }
  | { kind: 'invalid'; reason: string };

function inspectAndSanitizePdfBuffer(rawBuffer: Buffer): BufferInspectionResult {
  if (!rawBuffer || rawBuffer.length < 16) {
    return { kind: 'invalid', reason: 'The uploaded file is empty or too small to be a valid PDF.' };
  }

  // Search up to first 64 KB for %PDF- header (strips leading BOM, banners, whitespace, download wrappers)
  const searchWindow = rawBuffer.subarray(0, Math.min(rawBuffer.length, 65536));
  const pdfIdx = searchWindow.indexOf(Buffer.from('%PDF-'));
  if (pdfIdx >= 0) {
    return {
      kind: 'pdf',
      buffer: pdfIdx > 0 ? rawBuffer.subarray(pdfIdx) : rawBuffer,
      trimmedBytes: pdfIdx,
    };
  }

  // Detect common non-PDF files
  if (rawBuffer[0] === 0x89 && rawBuffer[1] === 0x50 && rawBuffer[2] === 0x4e && rawBuffer[3] === 0x47) {
    return { kind: 'image', mimeType: 'image/png', buffer: rawBuffer };
  }
  if (rawBuffer[0] === 0xff && rawBuffer[1] === 0xd8 && rawBuffer[2] === 0xff) {
    return { kind: 'image', mimeType: 'image/jpeg', buffer: rawBuffer };
  }
  if (
    rawBuffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    rawBuffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { kind: 'image', mimeType: 'image/webp', buffer: rawBuffer };
  }

  const headText = rawBuffer.subarray(0, Math.min(rawBuffer.length, 512)).toString('utf-8').trim().toLowerCase();
  if (headText.startsWith('<!doctype') || headText.startsWith('<html') || headText.includes('<head>')) {
    return {
      kind: 'invalid',
      reason:
        'This file is an HTML webpage saved with a .pdf filename rather than an actual PDF document. Please download the real PDF file and try again.',
    };
  }
  if (rawBuffer[0] === 0x50 && rawBuffer[1] === 0x4b && rawBuffer[2] === 0x03 && rawBuffer[3] === 0x04) {
    return {
      kind: 'invalid',
      reason: 'This file is a ZIP archive or DOCX/Office document renamed as .pdf, not a valid PDF document.',
    };
  }

  return {
    kind: 'invalid',
    reason: 'The file does not have a valid PDF signature (%PDF-). Please check that it is an uncorrupted PDF.',
  };
}

async function extractTextWithPdfParse(
  pdfBuffer: Buffer,
  startPage: number,
  endPageRaw: number
): Promise<{ totalPages: number; text: string }> {
  const parseParams =
    endPageRaw >= startPage
      ? { first: startPage, last: endPageRaw }
      : { first: startPage, last: startPage + 24 };

  const parser = new PDFParse({
    data: new Uint8Array(pdfBuffer),
    stopAtErrors: false,
    disableFontFace: true,
    verbosity: 0,
  });

  try {
    try {
      const textResult = await parser.getText(parseParams);
      return {
        totalPages: textResult.total || 0,
        text: (textResult.text || '').trim(),
      };
    } catch (rangeErr) {
      // If requested page range fails metadata lookup, attempt full parse if document isn't huge
      if (pdfBuffer.length <= 25 * 1024 * 1024) {
        try {
          const fullResult = await parser.getText();
          return {
            totalPages: fullResult.total || 0,
            text: (fullResult.text || '').trim(),
          };
        } catch {
          throw rangeErr;
        }
      }
      throw rangeErr;
    }
  } finally {
    await parser.destroy().catch(() => {});
  }
}

function salvageRawPdfText(pdfBuf: Buffer): string {
  const parts: string[] = [];
  let cursor = 0;
  let totalOut = 0;
  const maxOut = 1.5 * 1024 * 1024;
  const startMarker = Buffer.from('stream');
  const endMarker = Buffer.from('endstream');

  while (cursor < pdfBuf.length && totalOut < maxOut) {
    const sIdx = pdfBuf.indexOf(startMarker, cursor);
    if (sIdx === -1) break;
    let dataStart = sIdx + startMarker.length;
    if (pdfBuf[dataStart] === 0x0d && pdfBuf[dataStart + 1] === 0x0a) dataStart += 2;
    else if (pdfBuf[dataStart] === 0x0a || pdfBuf[dataStart] === 0x0d) dataStart += 1;
    else {
      cursor = dataStart;
      continue;
    }

    const eIdx = pdfBuf.indexOf(endMarker, dataStart);
    if (eIdx === -1) break;
    const rawStream = pdfBuf.subarray(dataStart, eIdx);
    cursor = eIdx + endMarker.length;

    if (rawStream.length === 0 || rawStream.length > 8 * 1024 * 1024) continue;

    let streamStr = '';
    try {
      const inflated = zlib.inflateSync(rawStream, { maxOutputLength: 2 * 1024 * 1024 });
      streamStr = inflated.toString('latin1');
    } catch {
      try {
        const inflatedRaw = zlib.inflateRawSync(rawStream, { maxOutputLength: 2 * 1024 * 1024 });
        streamStr = inflatedRaw.toString('latin1');
      } catch {
        if (rawStream.includes(Buffer.from('BT')) || rawStream.includes(Buffer.from('Tj'))) {
          streamStr = rawStream.toString('latin1');
        }
      }
    }

    if (!streamStr || (!streamStr.includes('Tj') && !streamStr.includes('TJ'))) continue;

    const strRegex = /\((?:\\.|[^\\()])*\)/g;
    const matches = streamStr.match(strRegex);
    if (!matches) continue;

    const joined = matches
      .map((m) =>
        m
          .slice(1, -1)
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '')
          .replace(/\\t/g, ' ')
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')')
          .replace(/\\\\/g, '\\')
      )
      .join(' ')
      .replace(/[^\x20-\x7E\n]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (joined.length >= 10) {
      parts.push(joined);
      totalOut += joined.length;
    }
  }

  const combined = parts.join('\n').trim();
  if (combined.length < 120) return '';

  // Ensure extracted stream text is genuinely readable words rather than CID glyph codes
  const wordTokens = combined.match(/[a-zA-Z0-9]{2,}/g) || [];
  if (wordTokens.length < 15) return '';
  const readableChars = (combined.match(/[a-zA-Z0-9 .,?!()=+\-*/:;]/g) || []).length;
  if (readableChars / combined.length < 0.72) return '';

  return combined;
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '8mb' }));

  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Authorization, Cookie');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(teacherRouter);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, maxPdfBytes: MAX_PDF_BYTES, timestamp: Date.now() });
  });

  // Step 1: Upload PDF in <= 4MB chunks (bypasses 32MB proxy limit for up to 100MB PDFs)
  app.post(
    '/api/pyq/upload-chunk',
    requireFirebaseAuth,
    chunkUpload.single('chunk'),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const uid = req.authUser?.uid || '';
        const uploadId = String(req.body.uploadId || '');
        const chunkIndex = parseInt(String(req.body.chunkIndex || '0'), 10);
        const totalChunks = parseInt(String(req.body.totalChunks || '1'), 10);

        if (!req.file || !req.file.buffer) {
          res.status(400).json({ error: 'Missing PDF chunk data.' });
          return;
        }
        if (Number.isNaN(chunkIndex) || Number.isNaN(totalChunks) || totalChunks < 1 || chunkIndex < 0) {
          res.status(400).json({ error: 'Invalid chunk indices.' });
          return;
        }

        const filePath = safeUploadFilePath(uid, uploadId);
        const offset = parseInt(String(req.body.offset ?? '-1'), 10);
        if (chunkIndex === 0) {
          await fs.promises.writeFile(filePath, req.file.buffer);
        } else {
          const stat = await fs.promises.stat(filePath).catch(() => null);
          if (!stat) {
            res.status(400).json({ error: 'Upload session expired or missing initial chunk.' });
            return;
          }
          if (stat.size + req.file.buffer.length > MAX_PDF_BYTES) {
            await fs.promises.unlink(filePath).catch(() => {});
            res.status(400).json({ error: 'PDF exceeds the 100 MB upload limit.' });
            return;
          }
          if (offset >= 0 && stat.size > offset) {
            await fs.promises.truncate(filePath, offset);
          }
          await fs.promises.appendFile(filePath, req.file.buffer);
        }

        res.json({ ok: true, chunkIndex, totalChunks });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Failed to store PDF chunk.',
        });
      }
    }
  );

  // Step 2: Parse assembled PDF into text chunks on disk (with header cleanup, stream salvage, and native AI fallback)
  app.post(
    '/api/pyq/prepare',
    requireFirebaseAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      let filePath = '';
      let keepForScanned = false;
      try {
        const uid = req.authUser?.uid || '';
        const uploadId = String(req.body.uploadId || '');
        const startPage = Math.max(1, parseInt(String(req.body.startPage || '1'), 10) || 1);
        const endPageRaw = parseInt(String(req.body.endPage || '0'), 10) || 0;

        filePath = safeUploadFilePath(uid, uploadId);
        const stat = await fs.promises.stat(filePath).catch(() => null);
        if (!stat) {
          res.status(404).json({ error: 'Uploaded PDF file not found. Please retry upload.' });
          return;
        }

        const rawBuffer = await fs.promises.readFile(filePath);
        const inspection = inspectAndSanitizePdfBuffer(rawBuffer);

        if (inspection.kind === 'invalid') {
          res.status(422).json({ error: inspection.reason });
          return;
        }

        if (inspection.kind === 'image') {
          keepForScanned = true;
          res.json({
            totalPages: 1,
            extractedChars: 0,
            isScanned: true,
            repairedByAi: true,
            mimeType: inspection.mimeType,
            textChunks: [],
          });
          return;
        }

        // Persist trimmed header buffer if leading garbage bytes were removed
        if (inspection.trimmedBytes > 0) {
          await fs.promises.writeFile(filePath, inspection.buffer);
        }

        let totalPages = 0;
        let extractedText = '';
        let pdfParseFailed = false;

        try {
          const parsed = await extractTextWithPdfParse(inspection.buffer, startPage, endPageRaw);
          totalPages = parsed.totalPages;
          extractedText = parsed.text;
        } catch {
          pdfParseFailed = true;
        }

        // If pdfjs rejected xref/structure or extracted very little text, try raw stream salvage
        if (extractedText.length < 120) {
          const salvaged = salvageRawPdfText(inspection.buffer);
          if (salvaged.length >= 120) {
            extractedText = salvaged;
          }
        }

        if (extractedText.length >= 120) {
          const normalizedFull = normalizeMathText(extractedText);
          const answerKeyContext = extractExplicitKeySections(normalizedFull).slice(0, 5000);
          const chunkSize = 10000;
          const maxChunks = 8;
          const textChunks: string[] = [];
          for (let i = 0; i < normalizedFull.length && textChunks.length < maxChunks; i += chunkSize) {
            textChunks.push(normalizedFull.slice(i, i + chunkSize));
          }
          res.json({
            totalPages,
            extractedChars: normalizedFull.length,
            isScanned: false,
            repairedByAi: false,
            mimeType: 'application/pdf',
            textChunks,
            answerKeyContext,
          });
        } else {
          // Hand off directly to Gemini Native PDF / Files API (handles scanned PDFs & broken xref tables up to 100 MB)
          keepForScanned = true;
          res.json({
            totalPages,
            extractedChars: extractedText.length,
            isScanned: true,
            repairedByAi: pdfParseFailed,
            mimeType: 'application/pdf',
            textChunks: [],
          });
        }
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Failed to inspect PDF contents.',
        });
      } finally {
        if (filePath && !keepForScanned && fs.existsSync(filePath)) {
          fs.promises.unlink(filePath).catch(() => {});
        }
      }
    }
  );

  // Step 3A: Extract one text chunk per HTTP call (AI primary + deterministic structural parser fallback)
  app.post(
    '/api/pyq/extract-chunk',
    requireFirebaseAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
        if (!text) {
          res.json({ questions: [], parserMode: 'EMPTY' });
          return;
        }
        const exam = ['JEE_MAINS', 'JEE_ADV', 'NEET'].includes(String(req.body.exam))
          ? String(req.body.exam)
          : 'JEE_MAINS';
        const defaultClass = ['11', '12', 'ALL'].includes(String(req.body.classLevel))
          ? String(req.body.classLevel)
          : '12';
        const subjectHint = typeof req.body.subjectHint === 'string' ? req.body.subjectHint : '';
        const answerKeyContext =
          typeof req.body.answerKeyContext === 'string'
            ? req.body.answerKeyContext.trim().slice(0, 5000)
            : '';
        const mode = req.body.mode === 'FAST_LOCAL' ? 'FAST_LOCAL' : 'HYBRID';

        if (mode === 'FAST_LOCAL') {
          const localQuestions = extractPyqsDeterministically(
            text,
            exam,
            defaultClass,
            subjectHint,
            answerKeyContext
          );
          res.json({ questions: localQuestions, parserMode: 'STRUCTURAL_DIRECT' });
          return;
        }

        try {
          const ai = getGeminiClient();
          const keySection = answerKeyContext
            ? `\n\nDetected Answer Key / Solutions Reference from this PDF:\n${answerKeyContext}`
            : '';
          const response = await generatePyqExtractionWithRetry(
            ai,
            `Target Exam: ${exam}\nDefault Class: ${defaultClass}\nSubject Hint: ${subjectHint || 'Auto-detect'}\n\nPDF Text Excerpt:\n${text.slice(0, 14000)}${keySection}`,
            exam
          );

          const parsed = parseGeminiJsonArray(response.text);
          let questions = normalizeExtractedQuestions(parsed, exam, defaultClass, subjectHint);
          let parserMode = 'AI';

          if (questions.length === 0) {
            const localFallback = extractPyqsDeterministically(
              text,
              exam,
              defaultClass,
              subjectHint,
              answerKeyContext
            );
            if (localFallback.length > 0) {
              questions = localFallback;
              parserMode = 'STRUCTURAL_FALLBACK';
            }
          }

          res.json({ questions, parserMode });
        } catch (aiErr) {
          // If Gemini hits 503/429 spikes, recover structured PYQs deterministically from PDF.js text
          const localFallback = extractPyqsDeterministically(
            text,
            exam,
            defaultClass,
            subjectHint,
            answerKeyContext
          );
          if (localFallback.length > 0) {
            res.json({ questions: localFallback, parserMode: 'STRUCTURAL_FALLBACK' });
            return;
          }
          const parsedErr = parseGeminiHttpError(aiErr);
          res.status(parsedErr.status).json({
            error: parsedErr.message,
            retryable: parsedErr.retryable,
          });
        }
      } catch (err) {
        const parsedErr = parseGeminiHttpError(err);
        res.status(parsedErr.status).json({
          error: parsedErr.message,
          retryable: parsedErr.retryable,
        });
      }
    }
  );

  // Step 3A-Vision: Extract PYQs from client-side PDF.js canvas-rendered page images
  app.post(
    '/api/pyq/extract-images',
    requireFirebaseAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const rawImages = Array.isArray(req.body.images) ? req.body.images : [];
        if (rawImages.length === 0) {
          res.json({ questions: [] });
          return;
        }

        const exam = ['JEE_MAINS', 'JEE_ADV', 'NEET'].includes(String(req.body.exam))
          ? String(req.body.exam)
          : 'JEE_MAINS';
        const defaultClass = ['11', '12', 'ALL'].includes(String(req.body.classLevel))
          ? String(req.body.classLevel)
          : '12';
        const subjectHint = typeof req.body.subjectHint === 'string' ? req.body.subjectHint : '';
        const answerKeyContext =
          typeof req.body.answerKeyContext === 'string'
            ? req.body.answerKeyContext.trim().slice(0, 5000)
            : '';

        type RenderedPageImage = { imageBase64: string; mimeType?: string; pageNumber?: number };
        const validMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
        const imageParts = (rawImages as unknown[])
          .slice(0, 4)
          .filter((item): item is RenderedPageImage => {
            if (!item || typeof item !== 'object') return false;
            const candidate = item as Partial<RenderedPageImage>;
            return typeof candidate.imageBase64 === 'string' && candidate.imageBase64.length > 100;
          })
          .map((item) => ({
            inlineData: {
              mimeType: validMimeTypes.includes(String(item.mimeType)) ? String(item.mimeType) : 'image/jpeg',
              data: item.imageBase64,
            },
          }));

        if (imageParts.length === 0) {
          res.json({ questions: [] });
          return;
        }

        const pageLabels = rawImages
          .slice(0, 4)
          .map((i: { pageNumber?: number }) => i?.pageNumber)
          .filter(Boolean)
          .join(', ');

        const ai = getGeminiClient();
        const keyNote = answerKeyContext ? `\n\nAnswer Key Reference:\n${answerKeyContext}` : '';
        const response = await generatePyqExtractionWithRetry(
          ai,
          {
            parts: [
              ...imageParts,
              {
                text: `Extract all ${exam} PYQs visible on these rendered PDF pages${pageLabels ? ` (Pages ${pageLabels})` : ''}. Default class: ${defaultClass}. Subject hint: ${subjectHint || 'Auto-detect'}.${keyNote}`,
              },
            ],
          },
          exam
        );

        const parsed = parseGeminiJsonArray(response.text);
        const questions = normalizeExtractedQuestions(parsed, exam, defaultClass, subjectHint);
        res.json({ questions, parserMode: 'VISION_OCR' });
      } catch (err) {
        const parsedErr = parseGeminiHttpError(err);
        res.status(parsedErr.status).json({
          error: parsedErr.message,
          retryable: parsedErr.retryable,
        });
      }
    }
  );

  // Step 3B: Native PDF / Scanned / Broken-Xref fallback (inline <= 18MB, Files API up to 100MB)
  app.post(
    '/api/pyq/extract-scanned',
    requireFirebaseAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      let filePath = '';
      let uploadedRemoteFileName: string | undefined;
      let aiClient: GoogleGenAI | null = null;
      let keepFileForRetry = false;
      try {
        cleanupStaleUploads();
        const uid = req.authUser?.uid || '';
        const uploadId = String(req.body.uploadId || '');
        const exam = ['JEE_MAINS', 'JEE_ADV', 'NEET'].includes(String(req.body.exam))
          ? String(req.body.exam)
          : 'JEE_MAINS';
        const defaultClass = ['11', '12', 'ALL'].includes(String(req.body.classLevel))
          ? String(req.body.classLevel)
          : '12';
        const subjectHint = typeof req.body.subjectHint === 'string' ? req.body.subjectHint : '';
        const startPage = Math.max(1, parseInt(String(req.body.startPage || '1'), 10) || 1);
        const endPage = Math.max(startPage, parseInt(String(req.body.endPage || String(startPage + 24)), 10) || startPage + 24);
        const allowedMimeTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
        const mimeType = allowedMimeTypes.includes(String(req.body.mimeType))
          ? String(req.body.mimeType)
          : 'application/pdf';

        filePath = safeUploadFilePath(uid, uploadId);
        const stat = await fs.promises.stat(filePath).catch(() => null);
        if (!stat) {
          res.status(404).json({ error: 'Uploaded PDF session expired. Please re-upload the file.' });
          return;
        }

        const ai = getGeminiClient();
        aiClient = ai;
        const pageInstruction = `Focus on extracting all PYQs from pages ${startPage} to ${endPage} (or the whole document if fewer pages).`;

        let filePart: ReturnType<typeof createPartFromUri> | { inlineData: { mimeType: string; data: string } };

        if (stat.size <= 18 * 1024 * 1024) {
          const fileBuffer = await fs.promises.readFile(filePath);
          filePart = {
            inlineData: {
              mimeType,
              data: fileBuffer.toString('base64'),
            },
          };
        } else {
          let uploaded = await ai.files.upload({
            file: filePath,
            config: { mimeType },
          });
          uploadedRemoteFileName = uploaded.name;

          let attempts = 0;
          while (uploaded.state === 'PROCESSING' && uploaded.name && attempts < 30) {
            await new Promise((r) => setTimeout(r, 1500));
            uploaded = await ai.files.get({ name: uploaded.name });
            attempts += 1;
          }
          if (uploaded.state === 'FAILED' || !uploaded.uri) {
            throw new Error('Could not process large PDF file with Gemini document reader.');
          }
          filePart = createPartFromUri(uploaded.uri, mimeType);
        }

        const response = await generatePyqExtractionWithRetry(
          ai,
          {
            parts: [
              filePart,
              {
                text: `Extract all ${exam} PYQs from this document. ${pageInstruction} Default class: ${defaultClass}. Subject hint: ${subjectHint || 'Auto-detect'}.`,
              },
            ],
          },
          exam
        );

        const parsed = parseGeminiJsonArray(response.text);
        const questions = normalizeExtractedQuestions(parsed, exam, defaultClass, subjectHint);
        res.json({ questions });
      } catch (err) {
        const parsedErr = parseGeminiHttpError(err);
        if (parsedErr.retryable) {
          keepFileForRetry = true;
        }
        res.status(parsedErr.status).json({
          error: parsedErr.message,
          retryable: parsedErr.retryable,
        });
      } finally {
        if (aiClient && uploadedRemoteFileName) {
          aiClient.files.delete({ name: uploadedRemoteFileName }).catch(() => {});
        }
        if (filePath && !keepFileForRetry && fs.existsSync(filePath)) {
          fs.promises.unlink(filePath).catch(() => {});
        }
      }
    }
  );

  // Legacy single-request upload endpoint (kept for direct small PDF calls)
  app.post(
    '/api/pyq/upload',
    requireFirebaseAuth,
    (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      upload.single('pdf')(req, res, (err: unknown) => {
        if (err) {
          const msg =
            err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
              ? 'PDF exceeds the 100 MB upload limit.'
              : err instanceof Error
                ? err.message
                : 'PDF upload failed.';
          res.status(400).json({ error: msg });
          return;
        }
        next();
      });
    },
    async (req: AuthenticatedRequest, res: Response) => {
      const uploadedPath = req.file?.path;
      try {
        if (!req.file || !uploadedPath) {
          res.status(400).json({ error: 'No PDF file received.' });
          return;
        }
        const exam = ['JEE_MAINS', 'JEE_ADV', 'NEET'].includes(String(req.body.exam))
          ? String(req.body.exam)
          : 'JEE_MAINS';
        const defaultClass = ['11', '12', 'ALL'].includes(String(req.body.classLevel))
          ? String(req.body.classLevel)
          : '12';
        const subjectHint = typeof req.body.subjectHint === 'string' ? req.body.subjectHint : '';
        const startPage = Math.max(1, parseInt(String(req.body.startPage || '1'), 10) || 1);
        const endPageRaw = parseInt(String(req.body.endPage || '0'), 10) || 0;

        const rawBuffer = await fs.promises.readFile(uploadedPath);
        const inspection = inspectAndSanitizePdfBuffer(rawBuffer);
        if (inspection.kind === 'invalid') {
          res.status(422).json({ error: inspection.reason });
          return;
        }

        let totalPages = 0;
        let extractedText = '';
        if (inspection.kind === 'pdf') {
          try {
            const parsed = await extractTextWithPdfParse(inspection.buffer, startPage, endPageRaw);
            totalPages = parsed.totalPages;
            extractedText = parsed.text;
          } catch {
            // Try raw stream salvage on broken xref
          }
          if (extractedText.length < 120) {
            const salvaged = salvageRawPdfText(inspection.buffer);
            if (salvaged.length >= 120) extractedText = salvaged;
          }
        }

        const ai = getGeminiClient();
        const extractedQuestions: ExtractedPyqItem[] = [];
        if (extractedText.length >= 120) {
          const chunk = extractedText.slice(0, 14000);
          const response = await generatePyqExtractionWithRetry(
            ai,
            `Target Exam: ${exam}\nDefault Class: ${defaultClass}\nSubject Hint: ${subjectHint || 'Auto-detect'}\n\nPDF Text Excerpt:\n${chunk}`,
            exam
          );
          extractedQuestions.push(
            ...normalizeExtractedQuestions(parseGeminiJsonArray(response.text), exam, defaultClass, subjectHint)
          );
        } else if (inspection.buffer.length <= 18 * 1024 * 1024) {
          const mimeType = inspection.kind === 'image' ? inspection.mimeType : 'application/pdf';
          const response = await generatePyqExtractionWithRetry(
            ai,
            {
              parts: [
                { inlineData: { mimeType, data: inspection.buffer.toString('base64') } },
                { text: `Extract all ${exam} PYQs. Default class: ${defaultClass}. Subject hint: ${subjectHint || 'Auto-detect'}.` },
              ],
            },
            exam
          );
          extractedQuestions.push(
            ...normalizeExtractedQuestions(parseGeminiJsonArray(response.text), exam, defaultClass, subjectHint)
          );
        }

        res.json({
          fileName: req.file.originalname,
          fileSizeBytes: req.file.size,
          totalPages,
          extractedChars: extractedText.length,
          questions: extractedQuestions,
        });
      } catch (err) {
        const parsedErr = parseGeminiHttpError(err);
        res.status(parsedErr.status).json({
          error: parsedErr.message,
          retryable: parsedErr.retryable,
        });
      } finally {
        if (uploadedPath && fs.existsSync(uploadedPath)) {
          fs.promises.unlink(uploadedPath).catch(() => {});
        }
      }
    }
  );

  // Step 4: Generate fresh, original AI practice questions (NOT PYQs) scoped by exam, class, subject & chapters
  app.post(
    '/api/tests/generate-ai',
    requireFirebaseAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const uid = req.authUser?.uid || '';
        const exam = ['JEE_MAINS', 'JEE_ADV', 'NEET'].includes(String(req.body.exam))
          ? (String(req.body.exam) as 'JEE_MAINS' | 'JEE_ADV' | 'NEET')
          : 'JEE_MAINS';

        const validSubjects =
          exam === 'NEET'
            ? ['Physics', 'Chemistry', 'Biology']
            : ['Physics', 'Chemistry', 'Mathematics'];
        const requestedSubject = String(req.body.subject || '');
        const subject = validSubjects.includes(requestedSubject)
          ? requestedSubject
          : validSubjects[0];

        const rawClasses: unknown[] = Array.isArray(req.body.classes) ? req.body.classes : [];
        const classes = Array.from(
          new Set(
            rawClasses
              .map((c) => String(c))
              .filter((c): c is '11' | '12' => c === '11' || c === '12')
          )
        );
        const effectiveClasses: Array<'11' | '12'> =
          classes.length > 0 ? classes : ['11', '12'];

        const rawChapters: unknown[] = Array.isArray(req.body.chapters) ? req.body.chapters : [];
        const chapters = Array.from(
          new Set(
            rawChapters
              .map((ch) => String(ch || '').trim().slice(0, 100))
              .filter(Boolean)
          )
        ).slice(0, 20);

        if (chapters.length === 0) {
          res.status(400).json({ error: 'Select at least one chapter or topic to generate questions.' });
          return;
        }

        const rawDiff = String(req.body.difficulty || 'MEDIUM').toUpperCase();
        const difficulty = (['EASY', 'MEDIUM', 'HARD', 'MIXED'].includes(rawDiff)
          ? rawDiff
          : 'MEDIUM') as 'EASY' | 'MEDIUM' | 'HARD' | 'MIXED';
        const questionType = ['MCQ', 'NUMERICAL', 'MULTI_MCQ', 'MIXED'].includes(String(req.body.questionType))
          ? String(req.body.questionType)
          : 'MCQ';

        const requestedCount = Math.max(1, Math.min(25, Math.round(Number(req.body.count) || 5)));
        const externalAvoid = Array.isArray(req.body.avoidPrompts)
          ? req.body.avoidPrompts
              .map((s: unknown) => String(s || '').trim().slice(0, 70))
              .filter(Boolean)
              .slice(0, 12)
          : [];

        const mappedFormats: ServerAiQuestionFormat[] =
          questionType === 'MIXED'
            ? exam === 'JEE_ADV'
              ? ['MCQ', 'MULTI_MCQ', 'NUMERICAL']
              : ['MCQ', 'NUMERICAL']
            : questionType === 'NUMERICAL'
              ? ['NUMERICAL']
              : questionType === 'MULTI_MCQ'
                ? ['MULTI_MCQ']
                : ['MCQ'];

        const classChoice: ServerAiClassChoice =
          effectiveClasses.length === 1 ? effectiveClasses[0] : 'OTHER';

        const paperRes = await generateQuestionPaper({
          uid,
          classChoice,
          examTarget: exam,
          subject: subject as ServerSubjectType,
          chapters,
          count: requestedCount,
          difficulty,
          questionFormats: mappedFormats,
          negativeMarkingEnabled: true,
          markingCorrect: 4,
          markingIncorrect: -1,
          durationMins: Math.max(10, requestedCount * 2),
          includeSolutions: true,
          includeHints: true,
          preferredModel: req.body.preferredModel ? String(req.body.preferredModel).trim() : undefined,
          backupModel: req.body.backupModel ? String(req.body.backupModel).trim() : undefined,
          enabledProviders: normalizeEnabledProviders(req.body.enabledProviders),
          avoidPrompts: externalAvoid,
        });

        const questions = paperRes.questions.slice(0, requestedCount).map((q) => ({
          id: q.id,
          ownerId: uid,
          bankId: 'ai-generated',
          visibility: 'PRIVATE' as const,
          exam,
          classLevel: effectiveClasses.length === 1 ? effectiveClasses[0] : q.classLevel,
          subject: q.subject,
          topic: q.topic,
          year: 'AI Practice',
          questionType: q.questionType,
          aiFormat: q.aiFormat,
          prompt: q.prompt,
          options: q.options,
          correctAnswer: q.correctAnswer,
          solution: q.solution,
          hint: q.hint,
          difficulty: q.difficulty,
          requiresDiagram: q.requiresDiagram,
          diagramCategory: q.diagramCategory,
          diagramTitle: q.diagramTitle,
          diagramCaption: q.diagramCaption,
          diagramPlacement: q.diagramPlacement,
          diagramSvg: q.diagramSvg,
        }));

        res.json({
          questions,
          modelUsed: paperRes.modelUsed,
          providerUsed: paperRes.providerUsed,
        });
      } catch (err) {
        const parsedErr = parseMultiProviderHttpError(err);
        res.status(parsedErr.status).json({
          error: parsedErr.message,
          retryable: parsedErr.retryable,
        });
      }
    }
  );

  // Detect available AI providers & configured models (never exposes keys)
  app.get(
    '/api/ai/providers',
    requireFirebaseAuth,
    (_req: AuthenticatedRequest, res: Response) => {
      try {
        const providers = detectConnectedProviders();
        res.json({ providers });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Unable to inspect AI providers.',
        });
      }
    }
  );

  // Live Groq API connection verification (never exposes GROQ_API_KEY)
  app.get(
    '/api/ai/groq/verify',
    requireFirebaseAuth,
    async (_req: AuthenticatedRequest, res: Response) => {
      try {
        const status = await verifyGroqConnection();
        res.json(status);
      } catch (err) {
        res.status(500).json({
          configured: Boolean(process.env.GROQ_API_KEY?.trim()),
          verified: false,
          availableModels: [],
          error: err instanceof Error ? err.message : 'Unable to verify Groq connection.',
        });
      }
    }
  );

  // Smart Question Paper Generator (All classes, exam targets, 10 formats, up to 90 Qs, diagrams, multi-model failover)
  app.post(
    '/api/tests/generate-paper',
    requireFirebaseAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const uid = req.authUser?.uid || '';
        const body = req.body as Record<string, unknown>;

        const rawTarget = String(body.examTarget || 'JEE_MAINS');
        const examTarget: ServerAiExamTarget = ['JEE_MAINS', 'JEE_ADV', 'NEET', 'CBSE_BOARDS', 'CUSTOM'].includes(rawTarget)
          ? (rawTarget as ServerAiExamTarget)
          : 'JEE_MAINS';

        const rawClass = String(body.classChoice || '12');
        const classChoice: ServerAiClassChoice = ['11', '12', 'OTHER'].includes(rawClass)
          ? (rawClass as ServerAiClassChoice)
          : '12';

        const rawSubj = String(body.subject || 'Physics');
        const subject: ServerSubjectType = ['Physics', 'Chemistry', 'Mathematics', 'Biology'].includes(rawSubj)
          ? (rawSubj as ServerSubjectType)
          : 'Physics';

        const chapters = Array.isArray(body.chapters)
          ? Array.from(new Set(body.chapters.map((c) => String(c || '').trim().slice(0, 100)).filter(Boolean))).slice(0, 25)
          : [];

        if (chapters.length === 0) {
          res.status(400).json({ error: 'Select at least one chapter to generate a question paper.' });
          return;
        }

        const validFormats = new Set<ServerAiQuestionFormat>([
          'MCQ',
          'MULTI_MCQ',
          'NUMERICAL',
          'ASSERTION_REASON',
          'MATCH_FOLLOWING',
          'STATEMENT_BASED',
          'DIAGRAM_BASED',
          'CASE_BASED',
          'INTEGER',
          'PYQ_INSPIRED',
        ]);
        const questionFormats = Array.isArray(body.questionFormats)
          ? Array.from(
              new Set(
                body.questionFormats
                  .map((f) => String(f || '').trim().toUpperCase() as ServerAiQuestionFormat)
                  .filter((f) => validFormats.has(f))
              )
            )
          : [];
        if (questionFormats.length === 0) questionFormats.push('MCQ');

        const rawDiff = String(body.difficulty || 'MIXED').toUpperCase();
        const difficulty = ['EASY', 'MEDIUM', 'HARD', 'MIXED'].includes(rawDiff)
          ? (rawDiff as 'EASY' | 'MEDIUM' | 'HARD' | 'MIXED')
          : 'MIXED';

        const count = Math.max(1, Math.min(90, Math.round(Number(body.count) || 10)));
        const negativeMarkingEnabled = body.negativeMarkingEnabled !== false;
        const markingCorrect = Math.max(1, Math.min(20, Math.round(Number(body.markingCorrect) || 4)));
        const markingIncorrect = negativeMarkingEnabled
          ? Math.max(-10, Math.min(0, Math.round(Number(body.markingIncorrect ?? -1))))
          : 0;
        const durationMins = Math.max(0, Math.min(240, Math.round(Number(body.durationMins) ?? count * 2)));

        const result = await generateQuestionPaper({
          uid,
          classChoice,
          examTarget,
          customExamName: body.customExamName ? String(body.customExamName).trim().slice(0, 80) : undefined,
          subject,
          chapters,
          specificTopic: body.specificTopic ? String(body.specificTopic).trim().slice(0, 140) : undefined,
          count,
          difficulty,
          questionFormats,
          negativeMarkingEnabled,
          markingCorrect,
          markingIncorrect,
          durationMins,
          includeSolutions: body.includeSolutions !== false,
          includeHints: body.includeHints !== false,
          preferredModel: body.preferredModel ? String(body.preferredModel).trim() : undefined,
          backupModel: body.backupModel ? String(body.backupModel).trim() : undefined,
          enabledProviders: normalizeEnabledProviders(body.enabledProviders),
          avoidPrompts: Array.isArray(body.avoidPrompts)
            ? body.avoidPrompts.map((p) => String(p || '').trim().slice(0, 80)).filter(Boolean).slice(0, 15)
            : [],
        });

        res.json(result);
      } catch (err) {
        const parsedErr = parseMultiProviderHttpError(err);
        res.status(parsedErr.status).json({
          error: parsedErr.message,
          retryable: parsedErr.retryable,
        });
      }
    }
  );

  // Smart Single-Question Regeneration (Replace / Harder / Similar)
  app.post(
    '/api/tests/regenerate-question',
    requireFirebaseAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const uid = req.authUser?.uid || '';
        const body = req.body as Record<string, unknown>;
        const modeRaw = String(body.mode || 'REPLACE').toUpperCase();
        const mode = ['REPLACE', 'HARDER', 'SIMILAR'].includes(modeRaw)
          ? (modeRaw as 'REPLACE' | 'HARDER' | 'SIMILAR')
          : 'REPLACE';

        const sq = (body.sourceQuestion || {}) as Record<string, unknown>;
        const rawSubj = String(sq.subject || 'Physics');
        const subject: ServerSubjectType = ['Physics', 'Chemistry', 'Mathematics', 'Biology'].includes(rawSubj)
          ? (rawSubj as ServerSubjectType)
          : 'Physics';

        const rawTarget = String(body.examTarget || 'JEE_MAINS');
        const examTarget: ServerAiExamTarget = ['JEE_MAINS', 'JEE_ADV', 'NEET', 'CBSE_BOARDS', 'CUSTOM'].includes(rawTarget)
          ? (rawTarget as ServerAiExamTarget)
          : 'JEE_MAINS';

        const result = await regenerateSingleQuestion({
          uid,
          mode,
          sourceQuestion: {
            subject,
            topic: String(sq.topic || 'General').slice(0, 120),
            classLevel: String(sq.classLevel) === '11' ? '11' : '12',
            aiFormat: String(sq.aiFormat || 'MCQ').toUpperCase() as ServerAiQuestionFormat,
            difficulty: (['EASY', 'MEDIUM', 'HARD'].includes(String(sq.difficulty))
              ? String(sq.difficulty)
              : 'MEDIUM') as 'EASY' | 'MEDIUM' | 'HARD',
            prompt: String(sq.prompt || 'Practice problem').slice(0, 1000),
            requiresDiagram: Boolean(sq.requiresDiagram),
          },
          examTarget,
          customExamName: body.customExamName ? String(body.customExamName).trim().slice(0, 80) : undefined,
          includeSolutions: body.includeSolutions !== false,
          includeHints: body.includeHints !== false,
          avoidPrompts: Array.isArray(body.avoidPrompts)
            ? body.avoidPrompts.map((p) => String(p || '').trim().slice(0, 80)).filter(Boolean).slice(0, 12)
            : [],
          preferredModel: body.preferredModel ? String(body.preferredModel).trim() : undefined,
          backupModel: body.backupModel ? String(body.backupModel).trim() : undefined,
          enabledProviders: normalizeEnabledProviders(body.enabledProviders),
        });

        res.json(result);
      } catch (err) {
        const parsedErr = parseMultiProviderHttpError(err);
        res.status(parsedErr.status).json({
          error: parsedErr.message,
          retryable: parsedErr.retryable,
        });
      }
    }
  );

  function buildDailyChallengeFallback(
    exam: 'JEE_MAINS' | 'JEE_ADV' | 'NEET',
    dateKey: string
  ) {
    const subjects =
      exam === 'NEET'
        ? (['Physics', 'Chemistry', 'Biology'] as const)
        : (['Physics', 'Chemistry', 'Mathematics'] as const);

    const bank: Record<
      'Physics' | 'Chemistry' | 'Mathematics' | 'Biology',
      Array<{
        topic: string;
        classLevel: '11' | '12';
        prompt: string;
        options: string[];
        correctAnswer: string;
        solution: string;
      }>
    > = {
      Physics: [
        {
          topic: 'Current Electricity',
          classLevel: '12',
          prompt:
            'A $12\\text{ V}$ battery with internal resistance $1\\,\\Omega$ delivers maximum power to a variable external resistor $R$. What is the maximum power dissipated in $R$?',
          options: ['36 W', '72 W', '18 W', '144 W'],
          correctAnswer: '36 W',
          solution:
            'Maximum power transfer occurs when $R = r = 1\\,\\Omega$. Thus $P_{\\max} = \\frac{E^2}{4r} = \\frac{144}{4} = 36\\text{ W}$.',
        },
        {
          topic: 'Kinematics (Motion in 1D & 2D)',
          classLevel: '11',
          prompt:
            'A particle starts from rest with uniform acceleration $a$. What is the ratio of distances covered in the 3rd second to that in the 1st second?',
          options: ['5 : 1', '3 : 1', '9 : 1', '4 : 1'],
          correctAnswer: '5 : 1',
          solution:
            'Distance in the $n^{\\text{th}}$ second from rest is $s_n = \\frac{a}{2}(2n - 1)$, giving $s_3 : s_1 = 5 : 1$.',
        },
      ],
      Chemistry: [
        {
          topic: 'Chemical & Ionic Equilibrium',
          classLevel: '11',
          prompt:
            'What is the pH of a $10^{-4}\\text{ M}$ aqueous solution of $H_2SO_4$ assuming complete first and second ionization at $298\\text{ K}$?',
          options: ['3.70', '4.00', '3.30', '2.70'],
          correctAnswer: '3.70',
          solution:
            '$[H^+] = 2 \\times 10^{-4}\\text{ M}$, so $\\text{pH} = -\\log(2 \\times 10^{-4}) = 4 - 0.301 \\approx 3.70$.',
        },
        {
          topic: 'Chemical Kinetics',
          classLevel: '12',
          prompt:
            'For a zero-order reaction with initial concentration $0.8\\text{ M}$ and rate constant $k = 0.04\\text{ M s}^{-1}$, find the time required for complete consumption.',
          options: ['20 s', '10 s', '40 s', '15 s'],
          correctAnswer: '20 s',
          solution:
            'For zero-order kinetics, completion time $t_{100\\%} = \\frac{[A]_0}{k} = \\frac{0.8}{0.04} = 20\\text{ s}$.',
        },
      ],
      Mathematics: [
        {
          topic: 'Indefinite & Definite Integrals',
          classLevel: '12',
          prompt:
            'Evaluate $\\int_{-2}^{2} (x^3\\cos x + 3)\\,dx$.',
          options: ['12', '6', '0', '24'],
          correctAnswer: '12',
          solution:
            '$x^3\\cos x$ is an odd function so its integral over $[-2, 2]$ is $0$, leaving $\\int_{-2}^{2} 3\\,dx = 3 \\times 4 = 12$.',
        },
        {
          topic: 'Sequences & Series',
          classLevel: '11',
          prompt:
            'If positive numbers $a, b, c$ satisfy $abc = 27$, what is the minimum possible value of $a + b + c$?',
          options: ['9', '27', '12', '6'],
          correctAnswer: '9',
          solution:
            'By AM $\\ge$ GM, $\\frac{a+b+c}{3} \\ge (abc)^{1/3} = 3$, hence $a+b+c \\ge 9$.',
        },
      ],
      Biology: [
        {
          topic: 'Molecular Basis of Inheritance',
          classLevel: '12',
          prompt:
            'If a double-stranded DNA molecule contains $18\\%$ cytosine bases, what percentage of adenine bases does it contain according to Chargaff’s rule?',
          options: ['32%', '18%', '36%', '64%'],
          correctAnswer: '32%',
          solution:
            '$C = G = 18\\%$, so $C + G = 36\\%$. Thus $A + T = 64\\%$ and $A = T = 32\\%$.',
        },
        {
          topic: 'Body Fluids & Circulation',
          classLevel: '11',
          prompt:
            'In a standard ECG waveform, what does the QRS complex represent?',
          options: [
            'Depolarization of the ventricles',
            'Depolarization of the atria',
            'Repolarization of the ventricles',
            'Ventricular diastole',
          ],
          correctAnswer: 'Depolarization of the ventricles',
          solution:
            'The QRS complex marks ventricular depolarization triggering ventricular contraction, whereas P-wave marks atrial depolarization and T-wave marks ventricular repolarization.',
        },
      ],
    };

    const seedNum = dateKey
      .split('-')
      .reduce((acc, part) => acc + (parseInt(part, 10) || 0), 0);

    return subjects.map((sub, idx) => {
      const choices = bank[sub];
      const item = choices[seedNum % choices.length];
      return {
        id: `daily_${dateKey}_${exam}_${idx}`,
        ownerId: 'daily',
        bankId: 'daily-challenge',
        visibility: 'PRIVATE' as const,
        exam,
        classLevel: item.classLevel,
        subject: sub,
        topic: item.topic,
        year: `Daily ${dateKey}`,
        questionType: 'MCQ' as 'MCQ' | 'MULTI_MCQ' | 'NUMERICAL',
        prompt: item.prompt,
        options: item.options,
        correctAnswer: item.correctAnswer,
        solution: item.solution,
        difficulty: 'MEDIUM' as 'EASY' | 'MEDIUM' | 'HARD',
      };
    });
  }

  // Daily 24h Challenge cache (3 questions: 1 per subject, regenerated daily per exam)
  const dailyChallengeCache = new Map<string, { dateKey: string; questions: unknown[] }>();

  app.get(
    '/api/daily-challenge',
    requireFirebaseAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      const exam = ['JEE_MAINS', 'JEE_ADV', 'NEET'].includes(String(req.query.exam))
        ? (String(req.query.exam) as 'JEE_MAINS' | 'JEE_ADV' | 'NEET')
        : 'JEE_MAINS';
      const dateKey = new Date().toISOString().slice(0, 10);
      const cacheKey = `${dateKey}_${exam}`;
      const subjects =
        exam === 'NEET'
          ? (['Physics', 'Chemistry', 'Biology'] as const)
          : (['Physics', 'Chemistry', 'Mathematics'] as const);

      const cached = dailyChallengeCache.get(cacheKey);
      if (cached && cached.questions.length === 3) {
        res.json({ dateKey, exam, questions: cached.questions, source: 'cache' });
        return;
      }

      const fallbackQuestions = buildDailyChallengeFallback(exam, dateKey);

      try {
        const ai = getGeminiClient();
        const sys = `You create a crisp 3-question Daily Challenge for ${exam.replace('_', ' ')} students (exactly 1 ${subjects[0]}, 1 ${subjects[1]}, 1 ${subjects[2]} question).
Each problem must be solvable in 90-120 seconds, use clean $...$ LaTeX for math/chem, have 4 clean options (or [] for 1 numerical if desired, though MCQ is preferred for quick daily sprint), exact "correctAnswer", and a 2-sentence "solution".`;
        const prompt = `Date seed: ${dateKey}. Generate exactly 3 short conceptual/calculation questions: 1 from ${subjects[0]}, 1 from ${subjects[1]}, and 1 from ${subjects[2]} for ${exam.replace('_', ' ')}. Return strict JSON array of length 3.`;

        const resp = await generateAiQuestionsWithRetry(ai, prompt, sys);
        const parsed = normalizeExtractedQuestions(parseGeminiJsonArray(resp.text), exam, '12');

        const picked: typeof fallbackQuestions = [];
        subjects.forEach((sub, idx) => {
          const match = parsed.find((q) => q.subject === sub);
          if (match) {
            picked.push({
              id: `daily_${dateKey}_${exam}_${idx}`,
              ownerId: req.authUser?.uid || 'daily',
              bankId: 'daily-challenge',
              visibility: 'PRIVATE' as const,
              exam,
              classLevel: match.classLevel,
              subject: sub,
              topic: match.topic,
              year: `Daily ${dateKey}`,
              questionType: match.questionType,
              prompt: match.prompt,
              options: match.options,
              correctAnswer: match.correctAnswer,
              solution: match.solution,
              difficulty: match.difficulty,
            });
          } else {
            picked.push(fallbackQuestions[idx]);
          }
        });

        dailyChallengeCache.set(cacheKey, { dateKey, questions: picked });
        res.json({ dateKey, exam, questions: picked, source: 'ai' });
      } catch {
        dailyChallengeCache.set(cacheKey, { dateKey, questions: fallbackQuestions });
        res.json({ dateKey, exam, questions: fallbackQuestions, source: 'fallback' });
      }
    }
  );

  app.post(
    '/api/notifications/send-email',
    requireFirebaseAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userEmail = req.authUser?.email;
        if (!userEmail || !req.authUser?.emailVerified) {
          res.status(400).json({ error: 'A verified email address is required.' });
          return;
        }

        const { deadlines = [], sharedFolders = [], subject } = req.body as {
          deadlines?: Array<{ title: string; scheduledDate?: string; scheduledTime?: string; exam?: string }>;
          sharedFolders?: Array<{ name: string; subject: string; inviteCode: string }>;
          subject?: string;
        };

        const smtpHost = process.env.SMTP_HOST;
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;
        const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10) || 587;
        const smtpFrom = process.env.SMTP_FROM || smtpUser;

        if (!smtpHost || !smtpUser || !smtpPass) {
          res.json({
            sent: false,
            configured: false,
            recipient: userEmail,
            message:
              'Outbound SMTP credentials (SMTP_HOST, SMTP_USER, SMTP_PASS) are not configured in Settings > Secrets. Your upcoming deadlines and shared folders are synced in-app and can also be exported to your calendar (.ics).',
          });
          return;
        }

        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: { user: smtpUser, pass: smtpPass },
        });

        const safeDeadlines = Array.isArray(deadlines) ? deadlines.slice(0, 15) : [];
        const safeFolders = Array.isArray(sharedFolders) ? sharedFolders.slice(0, 10) : [];

        const textLines = [
          'OBREN Study & Test Reminder Digest',
          '',
          'Upcoming Test & Study Deadlines:',
          ...(safeDeadlines.length
            ? safeDeadlines.map(
                (d) =>
                  `- ${String(d.title).slice(0, 120)} (${d.exam || 'Exam'}) — ${d.scheduledDate || 'Scheduled'} ${d.scheduledTime || ''}`
              )
            : ['- No upcoming deadlines scheduled.']),
          '',
          'Active Shared Collaborative Folders:',
          ...(safeFolders.length
            ? safeFolders.map(
                (f) => `- ${String(f.name).slice(0, 80)} (${f.subject}) · Code: ${f.inviteCode}`
              )
            : ['- No shared collaborative folders yet.']),
        ].join('\n');

        const info = await transporter.sendMail({
          from: smtpFrom,
          to: userEmail,
          subject:
            typeof subject === 'string' && subject.trim()
              ? subject.trim().slice(0, 120)
              : 'OBREN — Upcoming Test Deadlines & Shared Folders',
          text: textLines,
        });

        res.json({
          sent: true,
          configured: true,
          recipient: userEmail,
          messageId: info.messageId,
        });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Failed to send email notification.',
        });
      }
    }
  );

  // Server-side examination submission validation & duplicate-submission guard
  const recentValidatedSessions = new Map<string, number>();

  app.post(
    '/api/exam/validate-submission',
    requireFirebaseAuth,
    (req: AuthenticatedRequest, res: Response) => {
      try {
        const uid = req.authUser?.uid || '';
        const {
          proctoringSessionId,
          totalQuestions,
          attemptedCount,
          timeSpentSeconds,
          lookingAwayWarnings,
          faceMissingWarnings,
          maxLookingAwayWarnings,
          maxFaceMissingWarnings,
          submissionReason,
        } = req.body as {
          proctoringSessionId?: string;
          totalQuestions?: number;
          attemptedCount?: number;
          timeSpentSeconds?: number;
          lookingAwayWarnings?: number;
          faceMissingWarnings?: number;
          maxLookingAwayWarnings?: number;
          maxFaceMissingWarnings?: number;
          submissionReason?: string;
        };

        const sessionKey = `${uid}:${String(proctoringSessionId || '').slice(0, 128)}`;
        if (proctoringSessionId && recentValidatedSessions.has(sessionKey)) {
          res.status(409).json({
            valid: false,
            duplicate: true,
            error: 'This examination session has already been submitted.',
          });
          return;
        }

        const safeTotal = Math.max(1, Math.min(200, Math.round(Number(totalQuestions) || 1)));
        const safeAttempted = Math.max(
          0,
          Math.min(safeTotal, Math.round(Number(attemptedCount) || 0))
        );
        const safeTime = Math.max(1, Math.min(43200, Math.round(Number(timeSpentSeconds) || 1)));

        const allowedReasons = [
          'MANUAL',
          'TIMER_EXPIRED',
          'LOOKING_AWAY_LIMIT',
          'FACE_MISSING_LIMIT',
        ];
        let verifiedReason = allowedReasons.includes(String(submissionReason))
          ? String(submissionReason)
          : 'MANUAL';

        const lookAway = Math.max(0, Math.round(Number(lookingAwayWarnings) || 0));
        const faceMissing = Math.max(0, Math.round(Number(faceMissingWarnings) || 0));
        const maxLookAway = Math.max(1, Math.round(Number(maxLookingAwayWarnings) || 3));
        const maxFaceMissing = Math.max(1, Math.round(Number(maxFaceMissingWarnings) || 5));

        if (verifiedReason === 'LOOKING_AWAY_LIMIT' && lookAway < maxLookAway) {
          verifiedReason = 'MANUAL';
        }
        if (verifiedReason === 'FACE_MISSING_LIMIT' && faceMissing < maxFaceMissing) {
          verifiedReason = 'MANUAL';
        }

        if (proctoringSessionId) {
          recentValidatedSessions.set(sessionKey, Date.now());
          if (recentValidatedSessions.size > 2000) {
            const firstKey = recentValidatedSessions.keys().next().value;
            if (firstKey) recentValidatedSessions.delete(firstKey);
          }
        }

        res.json({
          valid: true,
          duplicate: false,
          verifiedReason,
          attemptedCount: safeAttempted,
          timeSpentSeconds: safeTime,
          verifiedAt: new Date().toISOString(),
        });
      } catch (err) {
        res.status(500).json({
          valid: false,
          error: err instanceof Error ? err.message : 'Submission validation failed.',
        });
      }
    }
  );

  // AI Assistant Chat Proxy Route (Multi-provider: Gemini, Claude, DeepSeek, OpenAI with automatic failover)
  app.post(
    '/api/ai/chat',
    requireFirebaseAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const {
          prompt,
          history,
          mode,
          style,
          userContext,
          imageBase64,
          pdfBase64,
          model,
          backupModel,
          enabledProviders,
        } = req.body as {
          prompt?: string;
          history?: Array<{ role: 'user' | 'assistant'; content: string }>;
          mode?: string;
          style?: string;
          userContext?: unknown;
          imageBase64?: string;
          pdfBase64?: string;
          model?: string;
          backupModel?: string;
          enabledProviders?: unknown;
        };

        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
          if (!imageBase64 && !pdfBase64) {
            res.status(400).json({ error: 'Prompt is required.' });
            return;
          }
        }

        const effectivePrompt =
          typeof prompt === 'string' && prompt.trim().length > 0
            ? prompt.trim()
            : 'Please carefully analyze the attached study material / question and explain the complete solution step-by-step.';

        const result = await generateAiTutorReplyWithFailover({
          prompt: effectivePrompt,
          history,
          mode,
          style,
          userContext,
          imageBase64,
          pdfBase64,
          model: typeof model === 'string' ? model.trim() : undefined,
          backupModel: typeof backupModel === 'string' ? backupModel.trim() : undefined,
          enabledProviders: normalizeEnabledProviders(enabledProviders),
        });

        res.json({
          reply: result.reply,
          modelUsed: result.modelUsed,
          providerUsed: result.providerUsed,
          failoverFrom: result.failoverFrom,
          failoverReason: result.failoverReason,
          attemptedModels: result.attemptedModels,
        });
      } catch (err) {
        const parsed = parseMultiProviderHttpError(err);
        res.status(parsed.status).json({ error: parsed.message, retryable: parsed.retryable });
      }
    }
  );

  // Ensure unmatched /api/* routes return JSON instead of SPA HTML
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Global JSON error handler for /api routes
  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status =
      (err as { status?: number; statusCode?: number })?.status ||
      (err as { statusCode?: number })?.statusCode ||
      500;
    const message = err instanceof Error ? err.message : 'Unexpected server error.';
    res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        watch: null,
      },
      plugins: [
        {
          name: 'disable-vite-hmr-websocket',
          enforce: 'post',
          transform(code, id) {
            if (
              id.includes('vite/dist/client/client.mjs') ||
              id.endsWith('/@vite/client')
            ) {
              return {
                code: code.replace(
                  'transport.connect(createHMRHandler(handleMessage));',
                  '/* HMR WebSocket disabled */'
                ),
                map: null,
              };
            }
            if (
              id.includes('pwa-entry-point') ||
              id.includes('virtual:pwa-register') ||
              id.includes('pwa-entry-point-loaded') ||
              code.includes('registerDevSW')
            ) {
              return {
                code: 'export function registerDevSW() {} \n export function registerSW() { return () => {}; }\nexport default {};',
                map: null,
              };
            }
          },
        },
      ],
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  attachGroupChatWebSocketServer(httpServer);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`OBREN server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
