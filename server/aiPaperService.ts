import crypto from 'crypto';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { buildProgrammaticEducationalSvg, sanitizeSvgMarkup } from './diagramEngine.ts';

export type ServerAiExamTarget = 'JEE_MAINS' | 'JEE_ADV' | 'NEET' | 'CBSE_BOARDS' | 'CUSTOM';
export type ServerAiClassChoice = '11' | '12' | 'OTHER';
export type ServerSubjectType = 'Physics' | 'Chemistry' | 'Mathematics' | 'Biology';
export type ServerAiQuestionFormat =
  | 'MCQ'
  | 'MULTI_MCQ'
  | 'NUMERICAL'
  | 'ASSERTION_REASON'
  | 'MATCH_FOLLOWING'
  | 'STATEMENT_BASED'
  | 'DIAGRAM_BASED'
  | 'CASE_BASED'
  | 'INTEGER'
  | 'PYQ_INSPIRED';

export type AiProviderId = 'gemini' | 'openai' | 'anthropic' | 'deepseek' | 'groq';

export interface EnabledProvidersMap {
  gemini?: boolean;
  openai?: boolean;
  anthropic?: boolean;
  deepseek?: boolean;
  groq?: boolean;
}

export interface ProviderModelInfo {
  id: string;
  label: string;
  provider: AiProviderId;
  supportsStructuredJson: boolean;
  supportsSvgDiagrams: boolean;
  supportsRasterImage: boolean;
  recommended?: boolean;
  note?: string;
}

export interface ProviderStatusInfo {
  provider: AiProviderId;
  label: string;
  configured: boolean;
  envVarName: string;
  models: ProviderModelInfo[];
}

export interface GeneratePaperRequest {
  uid: string;
  classChoice: ServerAiClassChoice;
  examTarget: ServerAiExamTarget;
  customExamName?: string;
  subject: ServerSubjectType;
  chapters: string[];
  specificTopic?: string;
  count: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'MIXED';
  questionFormats: ServerAiQuestionFormat[];
  negativeMarkingEnabled: boolean;
  markingCorrect: number;
  markingIncorrect: number;
  durationMins: number;
  includeSolutions: boolean;
  includeHints: boolean;
  preferredModel?: string;
  backupModel?: string;
  enabledProviders?: EnabledProvidersMap;
  avoidPrompts?: string[];
}

export interface GeneratedQuestionPayload {
  id: string;
  ownerId: string;
  bankId: string;
  visibility: 'PRIVATE';
  exam: 'JEE_MAINS' | 'JEE_ADV' | 'NEET';
  classLevel: '11' | '12';
  subject: ServerSubjectType;
  topic: string;
  year: string;
  questionType: 'MCQ' | 'NUMERICAL' | 'MULTI_MCQ';
  aiFormat: ServerAiQuestionFormat;
  prompt: string;
  options: string[];
  correctAnswer: string;
  solution: string;
  hint: string;
  passage?: string;
  assertionText?: string;
  reasonText?: string;
  matchLeft?: string[];
  matchRight?: string[];
  statements?: string[];
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  requiresDiagram: boolean;
  diagramCategory?: string;
  diagramTitle?: string;
  diagramCaption?: string;
  diagramPlacement?: 'above' | 'below';
  diagramSvg?: string;
  sourceLabel?: string;
}

export function detectConnectedProviders(): ProviderStatusInfo[] {
  const hasGemini = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim());
  const hasDeepSeek = Boolean(process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.trim());
  const hasGroq = Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim());

  return [
    {
      provider: 'groq',
      label: 'Groq Cloud',
      configured: hasGroq,
      envVarName: 'GROQ_API_KEY',
      models: [
        {
          id: 'llama-3.3-70b-versatile',
          label: 'Llama 3.3 70B Versatile (Groq · Fast STEM & JSON)',
          provider: 'groq',
          supportsStructuredJson: true,
          supportsSvgDiagrams: true,
          supportsRasterImage: false,
          recommended: true,
          note: 'Ultra-fast Groq inference for JEE/NEET questions, step-by-step solutions, and diagram specs.',
        },
        {
          id: 'llama-3.1-8b-instant',
          label: 'Llama 3.1 8B Instant (Groq · High-Speed)',
          provider: 'groq',
          supportsStructuredJson: true,
          supportsSvgDiagrams: true,
          supportsRasterImage: false,
          note: 'Sub-second Groq fallback model for rapid practice generation.',
        },
        {
          id: 'meta-llama/llama-4-scout-17b-16e-instruct',
          label: 'Llama 4 Scout 17B (Groq · Vision + STEM)',
          provider: 'groq',
          supportsStructuredJson: true,
          supportsSvgDiagrams: true,
          supportsRasterImage: false,
          note: 'Multimodal Groq model supporting question images and structured scientific outputs.',
        },
      ],
    },
    {
      provider: 'gemini',
      label: 'Google Gemini',
      configured: hasGemini,
      envVarName: 'GEMINI_API_KEY',
      models: [
        {
          id: 'gemini-4-hydrogen',
          label: 'Gemini 4 Hydrogen (Reasoning + LaTeX + Vision)',
          provider: 'gemini',
          supportsStructuredJson: true,
          supportsSvgDiagrams: true,
          supportsRasterImage: false,
          recommended: true,
          note: 'Best balance of JEE/NEET accuracy, math formatting, PDF/image analysis, and diagrams.',
        },
        {
          id: 'gemini-3.1-flash-lite',
          label: 'Gemini 3.1 Flash Lite (High-Speed)',
          provider: 'gemini',
          supportsStructuredJson: true,
          supportsSvgDiagrams: true,
          supportsRasterImage: false,
          note: 'Fast multi-question generation and reliable low-latency fallback.',
        },
      ],
    },
    {
      provider: 'anthropic',
      label: 'Anthropic Claude',
      configured: hasAnthropic,
      envVarName: 'ANTHROPIC_API_KEY',
      models: [
        {
          id: 'claude-3-5-sonnet-latest',
          label: 'Claude 3.5 Sonnet (Deep Tutor + Vision + PDF)',
          provider: 'anthropic',
          supportsStructuredJson: false,
          supportsSvgDiagrams: true,
          supportsRasterImage: false,
          note: 'Excellent step-by-step JEE derivations, conceptual depth, and image/PDF reading.',
        },
        {
          id: 'claude-3-5-haiku-latest',
          label: 'Claude 3.5 Haiku (Fast Backup)',
          provider: 'anthropic',
          supportsStructuredJson: false,
          supportsSvgDiagrams: true,
          supportsRasterImage: false,
          note: 'Fast Anthropic fallback model for doubt solving and practice papers.',
        },
      ],
    },
    {
      provider: 'deepseek',
      label: 'DeepSeek',
      configured: hasDeepSeek,
      envVarName: 'DEEPSEEK_API_KEY',
      models: [
        {
          id: 'deepseek-chat',
          label: 'DeepSeek V3 Chat (Fast STEM & Math)',
          provider: 'deepseek',
          supportsStructuredJson: true,
          supportsSvgDiagrams: true,
          supportsRasterImage: false,
          note: 'Strong STEM calculation accuracy and fast rate-limit failover.',
        },
        {
          id: 'deepseek-reasoner',
          label: 'DeepSeek R1 Reasoner (JEE Advanced Depth)',
          provider: 'deepseek',
          supportsStructuredJson: false,
          supportsSvgDiagrams: true,
          supportsRasterImage: false,
          note: 'Chain-of-thought reasoning for challenging multi-concept JEE problems.',
        },
      ],
    },
    {
      provider: 'openai',
      label: 'OpenAI',
      configured: hasOpenAi,
      envVarName: 'OPENAI_API_KEY',
      models: [
        {
          id: 'gpt-4o-mini',
          label: 'GPT-4o Mini',
          provider: 'openai',
          supportsStructuredJson: true,
          supportsSvgDiagrams: true,
          supportsRasterImage: false,
        },
        {
          id: 'gpt-4o',
          label: 'GPT-4o',
          provider: 'openai',
          supportsStructuredJson: true,
          supportsSvgDiagrams: true,
          supportsRasterImage: false,
        },
      ],
    },
  ];
}

export function getGeminiClient(): GoogleGenAI {
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

export function resolveProviderForModel(modelId: string): AiProviderId {
  const normalized = (modelId || '').toLowerCase();
  if (
    normalized.startsWith('llama-') ||
    normalized.startsWith('meta-llama/') ||
    normalized.startsWith('groq/') ||
    normalized.startsWith('mixtral-') ||
    normalized.startsWith('qwen/') ||
    normalized.startsWith('openai/gpt-oss') ||
    normalized.startsWith('gemma2-')
  ) {
    return 'groq';
  }
  if (normalized.startsWith('deepseek-')) {
    return 'deepseek';
  }
  if (normalized.startsWith('claude-')) {
    return 'anthropic';
  }
  if (normalized.startsWith('gpt-') || normalized.startsWith('o1') || normalized.startsWith('o3')) {
    return 'openai';
  }
  return 'gemini';
}

export async function verifyGroqConnection(): Promise<{
  configured: boolean;
  verified: boolean;
  availableModels: string[];
  error?: string;
}> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    return {
      configured: false,
      verified: false,
      availableModels: [],
      error: 'GROQ_API_KEY is not configured in server environment secrets.',
    };
  }
  try {
    const resp = await withTimeout(
      fetch('https://api.groq.com/openai/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }),
      8000,
      'Groq model verification'
    );
    if (!resp.ok) {
      const errTxt = await resp.text();
      return {
        configured: true,
        verified: false,
        availableModels: [],
        error: `Groq verification returned HTTP ${resp.status}: ${errTxt.slice(0, 160)}`,
      };
    }
    const data = (await resp.json()) as { data?: Array<{ id?: string }> };
    const availableModels = Array.isArray(data.data)
      ? data.data.map((m) => String(m.id || '')).filter(Boolean).slice(0, 20)
      : [];
    return {
      configured: true,
      verified: true,
      availableModels,
    };
  } catch (err) {
    return {
      configured: true,
      verified: false,
      availableModels: [],
      error: err instanceof Error ? err.message : 'Unable to reach Groq API.',
    };
  }
}

export function describeFailoverReason(err: unknown): string {
  const raw = (err instanceof Error ? err.message : String(err || '')).toLowerCase();
  if (
    raw.includes('429') ||
    raw.includes('rate_limit') ||
    raw.includes('rate limit') ||
    raw.includes('resource_exhausted') ||
    raw.includes('too many requests')
  ) {
    return 'rate limit reached';
  }
  if (
    raw.includes('402') ||
    raw.includes('quota') ||
    raw.includes('insufficient_quota') ||
    raw.includes('insufficient balance') ||
    raw.includes('credit balance')
  ) {
    return 'usage quota or credit limit reached';
  }
  if (raw.includes('529') || raw.includes('503') || raw.includes('overloaded') || raw.includes('unavailable')) {
    return 'provider temporarily overloaded';
  }
  if (raw.includes('timed out') || raw.includes('timeout')) {
    return 'request timed out';
  }
  return 'provider temporarily unavailable';
}

function escapeInvalidJsonBackslashes(raw: string): string {
  return raw.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\');
}

function parseJsonArrayFromModel(rawText: string | undefined): Record<string, unknown>[] {
  if (!rawText) return [];
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const unwrap = (val: unknown): Record<string, unknown>[] => {
    if (Array.isArray(val)) return val as Record<string, unknown>[];
    if (val && typeof val === 'object') {
      const obj = val as Record<string, unknown>;
      if (Array.isArray(obj.questions)) return obj.questions as Record<string, unknown>[];
      if (Array.isArray(obj.items)) return obj.items as Record<string, unknown>[];
    }
    return [];
  };

  for (const variant of [cleaned, escapeInvalidJsonBackslashes(cleaned)]) {
    try {
      const parsed = JSON.parse(variant);
      const unwrapped = unwrap(parsed);
      if (unwrapped.length > 0) return unwrapped;
    } catch {
      // Attempt salvage below
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
            return salvaged as Record<string, unknown>[];
          }
        } catch {
          searchEnd = lastBrace;
        }
      }
    }
  }
  return [];
}

const paperQuestionSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      topic: { type: Type.STRING, description: 'Exact chapter/topic name from the requested list.' },
      classLevel: { type: Type.STRING, description: 'Class "11" or "12"' },
      aiFormat: {
        type: Type.STRING,
        description:
          'One of: MCQ, MULTI_MCQ, NUMERICAL, ASSERTION_REASON, MATCH_FOLLOWING, STATEMENT_BASED, DIAGRAM_BASED, CASE_BASED, INTEGER, PYQ_INSPIRED',
      },
      difficulty: { type: Type.STRING, description: 'EASY, MEDIUM, or HARD' },
      prompt: { type: Type.STRING, description: 'Complete clearly formatted question statement using $...$ for LaTeX.' },
      passage: { type: Type.STRING, description: 'For CASE_BASED questions: short paragraph/context.' },
      assertionText: { type: Type.STRING, description: 'For ASSERTION_REASON: Assertion (A) statement.' },
      reasonText: { type: Type.STRING, description: 'For ASSERTION_REASON: Reason (R) statement.' },
      statements: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'For STATEMENT_BASED: array of 2 statements (Statement I, Statement II).',
      },
      matchLeft: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'For MATCH_FOLLOWING: 4 items in Column I.',
      },
      matchRight: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'For MATCH_FOLLOWING: 4 items in Column II.',
      },
      options: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: '4 distinct options without A)/B) prefixes for choice questions; [] for NUMERICAL or INTEGER.',
      },
      correctAnswer: {
        type: Type.STRING,
        description:
          'For single-correct: exact verbatim matching option string. For MULTI_MCQ: comma-separated verbatim matching options. For NUMERICAL/INTEGER: exact clean number string.',
      },
      hint: { type: Type.STRING, description: 'Concise conceptual hint that guides without revealing the answer.' },
      solution: { type: Type.STRING, description: 'Verified step-by-step explanation using $...$ LaTeX.' },
      requiresDiagram: {
        type: Type.BOOLEAN,
        description: 'true ONLY if a diagram/figure/graph genuinely helps solve the problem or format is DIAGRAM_BASED.',
      },
      diagramCategory: {
        type: Type.STRING,
        description:
          'One of: physics_fbd, physics_incline, physics_circuit, physics_optics, physics_projectile, physics_wave, physics_bfield, physics_graph, chem_molecule, chem_reaction, chem_orbital, chem_apparatus, math_graph, math_conic, math_geometry, bio_cell, bio_genetics, bio_process',
      },
      diagramTitle: { type: Type.STRING, description: 'Short descriptive figure title.' },
      diagramCaption: { type: Type.STRING, description: 'Concise labeled caption explaining the diagram.' },
      diagramPlacement: { type: Type.STRING, description: '"above" or "below"' },
      diagramSvg: {
        type: Type.STRING,
        description:
          'If requiresDiagram is true: clean self-contained <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 280">...</svg> with clear text labels, dark readable strokes on light background (#ffffff), and NO script/style/foreignObject.',
      },
    },
    required: [
      'topic',
      'classLevel',
      'aiFormat',
      'difficulty',
      'prompt',
      'options',
      'correctAnswer',
      'requiresDiagram',
    ],
  },
};

function stripOptionPrefix(opt: string): string {
  return String(opt || '')
    .replace(/^\s*(?:\([A-Da-d1-4]\)|[A-Da-d1-4][.)])\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapFormatToBaseQuestionType(aiFormat: ServerAiQuestionFormat): 'MCQ' | 'NUMERICAL' | 'MULTI_MCQ' {
  if (aiFormat === 'MULTI_MCQ') return 'MULTI_MCQ';
  if (aiFormat === 'NUMERICAL' || aiFormat === 'INTEGER') return 'NUMERICAL';
  return 'MCQ';
}

function mapExamTargetToLegacyExam(target: ServerAiExamTarget): 'JEE_MAINS' | 'JEE_ADV' | 'NEET' {
  if (target === 'JEE_ADV') return 'JEE_ADV';
  if (target === 'NEET') return 'NEET';
  return 'JEE_MAINS';
}

function resolveMcqCorrectAnswer(rawAns: string, options: string[]): string {
  const trimmed = String(rawAns || '').trim();
  if (options.includes(trimmed)) return trimmed;
  const letterMap: Record<string, number> = {
    A: 0,
    B: 1,
    C: 2,
    D: 3,
    '1': 0,
    '2': 1,
    '3': 2,
    '4': 3,
  };
  const key = trimmed.replace(/[().]/g, '').trim().toUpperCase();
  if (key in letterMap && options[letterMap[key]]) {
    return options[letterMap[key]];
  }
  const matched = options.find((o) => o.toLowerCase() === trimmed.toLowerCase());
  return matched || options[0] || trimmed || '0';
}

function resolveMultiMcqCorrectAnswer(rawAns: string, options: string[]): string {
  const parts = String(rawAns || '')
    .split(/[,;|]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const letterMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, '1': 0, '2': 1, '3': 2, '4': 3 };
  const resolved: string[] = [];
  for (const part of parts) {
    const key = part.replace(/[().]/g, '').trim().toUpperCase();
    if (key in letterMap && options[letterMap[key]]) {
      resolved.push(options[letterMap[key]]);
    } else {
      const matched = options.find((o) => o.toLowerCase() === part.toLowerCase());
      if (matched) resolved.push(matched);
    }
  }
  const unique = Array.from(new Set(resolved));
  if (unique.length === 0 && options.length >= 2) {
    return `${options[0]}, ${options[1]}`;
  }
  return unique.join(', ');
}

function normalizeGeneratedItems(
  rawItems: Record<string, unknown>[],
  req: Pick<
    GeneratePaperRequest,
    'uid' | 'classChoice' | 'examTarget' | 'subject' | 'chapters' | 'includeSolutions' | 'includeHints' | 'questionFormats'
  >
): GeneratedQuestionPayload[] {
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
  const stamp = Date.now();
  const baseExam = mapExamTargetToLegacyExam(req.examTarget);
  const defaultClass: '11' | '12' = req.classChoice === '11' ? '11' : '12';

  const normalized: GeneratedQuestionPayload[] = [];

  for (let i = 0; i < rawItems.length; i += 1) {
    const item = rawItems[i];
    let prompt = String(item.prompt || '').trim();
    if (prompt.length < 10) continue;

    const rawFmt = String(item.aiFormat || req.questionFormats[0] || 'MCQ')
      .trim()
      .toUpperCase() as ServerAiQuestionFormat;
    const aiFormat: ServerAiQuestionFormat = validFormats.has(rawFmt)
      ? rawFmt
      : req.questionFormats[0] || 'MCQ';

    let baseType = mapFormatToBaseQuestionType(aiFormat);
    const rawOptions = Array.isArray(item.options)
      ? item.options.map((o) => stripOptionPrefix(String(o || ''))).filter(Boolean).slice(0, 6)
      : [];

    if (baseType !== 'NUMERICAL' && rawOptions.length < 2) {
      // Coerce to NUMERICAL if AI produced no options
      baseType = 'NUMERICAL';
    }

    const effectiveOptions = baseType === 'NUMERICAL' ? [] : rawOptions;
    let correctAnswer = String(item.correctAnswer || '').trim();
    if (baseType === 'MCQ') {
      correctAnswer = resolveMcqCorrectAnswer(correctAnswer, effectiveOptions);
    } else if (baseType === 'MULTI_MCQ') {
      correctAnswer = resolveMultiMcqCorrectAnswer(correctAnswer, effectiveOptions);
    } else {
      const cleanedNum = correctAnswer.replace(/[^0-9eE.+/-]/g, '');
      correctAnswer = cleanedNum || '0';
      if (aiFormat === 'INTEGER') {
        const asNum = Number(correctAnswer);
        if (Number.isFinite(asNum)) {
          correctAnswer = String(Math.round(asNum));
        }
      }
    }

    const rawDiff = String(item.difficulty || 'MEDIUM').trim().toUpperCase();
    const difficulty: 'EASY' | 'MEDIUM' | 'HARD' =
      rawDiff === 'EASY' || rawDiff === 'HARD' ? rawDiff : 'MEDIUM';

    const topic =
      String(item.topic || req.chapters[i % req.chapters.length] || 'General')
        .trim()
        .slice(0, 120) || 'General';

    const classLevel: '11' | '12' =
      req.classChoice === '11' || req.classChoice === '12'
        ? req.classChoice
        : String(item.classLevel) === '11'
          ? '11'
          : defaultClass;

    const passage = item.passage ? String(item.passage).trim().slice(0, 1800) : undefined;
    const assertionText = item.assertionText
      ? String(item.assertionText).trim().slice(0, 800)
      : undefined;
    const reasonText = item.reasonText ? String(item.reasonText).trim().slice(0, 800) : undefined;
    const statements = Array.isArray(item.statements)
      ? item.statements.map((s) => String(s || '').trim().slice(0, 600)).filter(Boolean).slice(0, 4)
      : undefined;
    const matchLeft = Array.isArray(item.matchLeft)
      ? item.matchLeft.map((s) => String(s || '').trim().slice(0, 300)).filter(Boolean).slice(0, 6)
      : undefined;
    const matchRight = Array.isArray(item.matchRight)
      ? item.matchRight.map((s) => String(s || '').trim().slice(0, 300)).filter(Boolean).slice(0, 6)
      : undefined;

    if (aiFormat === 'PYQ_INSPIRED' && !prompt.toLowerCase().includes('inspired')) {
      prompt = prompt;
    }

    const requiresDiagram =
      aiFormat === 'DIAGRAM_BASED' || Boolean(item.requiresDiagram);
    let diagramSvg = '';
    const diagramCategory = item.diagramCategory ? String(item.diagramCategory).trim().slice(0, 60) : undefined;
    const diagramTitle = item.diagramTitle ? String(item.diagramTitle).trim().slice(0, 120) : undefined;
    const diagramCaption = item.diagramCaption ? String(item.diagramCaption).trim().slice(0, 240) : undefined;
    const diagramPlacement: 'above' | 'below' =
      String(item.diagramPlacement || '').toLowerCase() === 'below' ? 'below' : 'above';

    if (requiresDiagram) {
      diagramSvg = sanitizeSvgMarkup(typeof item.diagramSvg === 'string' ? item.diagramSvg : '');
      if (!diagramSvg) {
        diagramSvg = buildProgrammaticEducationalSvg({
          subject: req.subject,
          topic,
          category: diagramCategory,
          title: diagramTitle || topic,
          caption: diagramCaption,
        });
      }
    }

    normalized.push({
      id: `ai_${stamp}_${i}_${crypto.randomBytes(3).toString('hex')}`,
      ownerId: req.uid,
      bankId: 'ai-generated',
      visibility: 'PRIVATE',
      exam: baseExam,
      classLevel,
      subject: req.subject,
      topic,
      year: aiFormat === 'PYQ_INSPIRED' ? 'PYQ-Inspired (AI)' : 'AI Practice',
      questionType: baseType,
      aiFormat,
      prompt: prompt.slice(0, 4000),
      options: effectiveOptions,
      correctAnswer: correctAnswer.slice(0, 200),
      solution: req.includeSolutions ? String(item.solution || '').trim().slice(0, 3900) : '',
      hint: req.includeHints ? String(item.hint || '').trim().slice(0, 800) : '',
      ...(passage ? { passage } : {}),
      ...(assertionText ? { assertionText } : {}),
      ...(reasonText ? { reasonText } : {}),
      ...(statements && statements.length > 0 ? { statements } : {}),
      ...(matchLeft && matchLeft.length > 0 ? { matchLeft } : {}),
      ...(matchRight && matchRight.length > 0 ? { matchRight } : {}),
      difficulty,
      requiresDiagram,
      ...(diagramCategory ? { diagramCategory } : {}),
      ...(diagramTitle ? { diagramTitle } : {}),
      ...(diagramCaption ? { diagramCaption } : {}),
      diagramPlacement,
      ...(diagramSvg ? { diagramSvg } : {}),
      sourceLabel: aiFormat === 'PYQ_INSPIRED' ? 'Original PYQ-Inspired Practice' : 'AI Original Practice',
    });
  }

  return normalized;
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s.`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function callSingleModel(
  modelId: string,
  systemInstruction: string,
  userPrompt: string
): Promise<{ text: string; modelUsed: string; providerUsed: AiProviderId }> {
  const provider = resolveProviderForModel(modelId);

  if (provider === 'groq') {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) throw new Error('GROQ_API_KEY is not configured.');
    const resp = await withTimeout(
      fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: systemInstruction },
            {
              role: 'user',
              content: `${userPrompt}\n\nReturn ONLY a raw JSON object {"questions": [...]} matching every required field (including requiresDiagram, diagramCategory, diagramTitle, diagramCaption, diagramPlacement, diagramSvg, solution, hint).`,
            },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 4096,
        }),
      }),
      25000,
      `Groq (${modelId})`
    );
    if (!resp.ok) {
      const errTxt = await resp.text();
      throw new Error(`Groq error (${resp.status}): ${errTxt.slice(0, 220)}`);
    }
    const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return {
      text: json.choices?.[0]?.message?.content || '',
      modelUsed: modelId,
      providerUsed: 'groq',
    };
  }

  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');
    const resp = await withTimeout(
      fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: `${userPrompt}\n\nReturn ONLY a raw JSON object {"questions": [...]} or JSON array.` },
          ],
          response_format: { type: 'json_object' },
        }),
      }),
      25000,
      `OpenAI (${modelId})`
    );
    if (!resp.ok) {
      const errTxt = await resp.text();
      throw new Error(`OpenAI error (${resp.status}): ${errTxt.slice(0, 220)}`);
    }
    const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return {
      text: json.choices?.[0]?.message?.content || '',
      modelUsed: modelId,
      providerUsed: 'openai',
    };
  }

  if (provider === 'deepseek') {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not configured.');
    const supportsJsonObject = modelId !== 'deepseek-reasoner';
    const resp = await withTimeout(
      fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: systemInstruction },
            {
              role: 'user',
              content: supportsJsonObject
                ? `${userPrompt}\n\nReturn ONLY valid JSON: {"questions": [...]} matching every required field.`
                : `${userPrompt}\n\nReturn ONLY a valid raw JSON array matching every required field.`,
            },
          ],
          ...(supportsJsonObject ? { response_format: { type: 'json_object' } } : {}),
        }),
      }),
      28000,
      `DeepSeek (${modelId})`
    );
    if (!resp.ok) {
      const errTxt = await resp.text();
      throw new Error(`DeepSeek error (${resp.status}): ${errTxt.slice(0, 220)}`);
    }
    const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return {
      text: json.choices?.[0]?.message?.content || '',
      modelUsed: modelId,
      providerUsed: 'deepseek',
    };
  }

  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured.');
    const resp = await withTimeout(
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: modelId,
          max_tokens: 4096,
          system: systemInstruction,
          messages: [
            { role: 'user', content: `${userPrompt}\n\nReturn ONLY a valid JSON array.` },
          ],
        }),
      }),
      28000,
      `Anthropic (${modelId})`
    );
    if (!resp.ok) {
      const errTxt = await resp.text();
      throw new Error(`Anthropic error (${resp.status}): ${errTxt.slice(0, 220)}`);
    }
    const json = (await resp.json()) as { content?: Array<{ text?: string }> };
    return {
      text: json.content?.[0]?.text || '',
      modelUsed: modelId,
      providerUsed: 'anthropic',
    };
  }

  // Gemini provider
  const ai = getGeminiClient();
  const isGemini4 = modelId.startsWith('gemini-4-');
  const response = await withTimeout(
    ai.models.generateContent({
      model: modelId,
      contents: userPrompt,
      config: {
        systemInstruction,
        ...(isGemini4 ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
        responseMimeType: 'application/json',
        responseSchema: paperQuestionSchema,
      },
    }),
    24000,
    `Gemini (${modelId})`
  );

  return {
    text: response.text || '',
    modelUsed: modelId,
    providerUsed: 'gemini',
  };
}

async function generateWithFailover(
  candidateModels: string[],
  systemInstruction: string,
  userPrompt: string
): Promise<{ rawItems: Record<string, unknown>[]; modelUsed: string; providerUsed: AiProviderId }> {
  let lastErr: unknown;

  for (let i = 0; i < candidateModels.length; i += 1) {
    const modelId = candidateModels[i];
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 250 + Math.floor(Math.random() * 200)));
    }
    try {
      const result = await callSingleModel(modelId, systemInstruction, userPrompt);
      const parsed = parseJsonArrayFromModel(result.text);
      if (parsed.length > 0) {
        return {
          rawItems: parsed,
          modelUsed: result.modelUsed,
          providerUsed: result.providerUsed,
        };
      }
      lastErr = new Error(`Model ${modelId} returned empty or unparseable output.`);
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error('All configured AI models failed to generate questions.');
}

export function buildCandidateModelList(
  preferredModel?: string,
  backupModel?: string,
  enabledProviders?: EnabledProvidersMap
): string[] {
  const connected = detectConnectedProviders();
  const isProviderAllowed = (provider: AiProviderId) =>
    !enabledProviders || enabledProviders[provider] !== false;

  const availableIds = new Set(
    connected
      .filter((p) => p.configured && isProviderAllowed(p.provider))
      .flatMap((p) => p.models.map((m) => m.id))
  );

  const candidates = [
    preferredModel,
    backupModel,
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'gemini-4-hydrogen',
    'gemini-3.1-flash-lite',
    'claude-3-5-sonnet-latest',
    'claude-3-5-haiku-latest',
    'deepseek-chat',
    'deepseek-reasoner',
    'gpt-4o-mini',
    'gpt-4o',
  ].filter((m): m is string => typeof m === 'string' && m.length > 0 && availableIds.has(m));

  return Array.from(new Set(candidates));
}

function buildPaperSystemInstruction(req: GeneratePaperRequest): string {
  const examName =
    req.examTarget === 'CUSTOM'
      ? req.customExamName || 'Custom Competitive Exam'
      : req.examTarget.replace('_', ' ');

  return `You are a senior ${examName} faculty question author designing an academically rigorous, 100% original question paper.
STRICT QUALITY & PATTERN RULES:
1. Academic Scope: Class ${req.classChoice === 'OTHER' ? 'Competitive / Bridge Level' : req.classChoice}, Exam Target: ${examName}, Subject: ${req.subject}.
2. Originality: Generate original practice questions. Even for PYQ_INSPIRED, write original questions modeled on authentic exam concepts — NEVER falsely claim an AI question is an official past exam question.
3. No Duplicates: Every question in a paper must test a distinct concept, numerical scenario, or case.
4. Scientific & LaTeX Accuracy: Use exact scientific terminology and wrap math/chemical expressions in $...$ (e.g., $\\vec{F} = m\\vec{a}$, $\\int_0^1 x^2 dx$, $\\mathrm{H_2SO_4}$). Double-check numerical calculations before setting "correctAnswer".
5. Format Compliance:
   - MCQ / PYQ_INSPIRED / DIAGRAM_BASED: 4 clear non-overlapping options (no "A)" prefix), "correctAnswer" = exact text of the single correct option.
   - MULTI_MCQ: 4 options, "correctAnswer" = comma-separated exact text of 2 or 3 correct options.
   - NUMERICAL / INTEGER: "options" = [], "correctAnswer" = exact number string (integer only for INTEGER).
   - ASSERTION_REASON: populate "assertionText" and "reasonText", plus 4 standard Assertion-Reason options in "options".
   - MATCH_FOLLOWING: populate "matchLeft" (Column I, 4 items) and "matchRight" (Column II, 4 items), plus 4 matching code options in "options".
   - STATEMENT_BASED: populate "statements" (2 statements), plus 4 options in "options".
   - CASE_BASED: populate "passage" (concise scientific scenario), plus clear question "prompt" and 4 options.
6. Diagram Intelligence:
   - Set "requiresDiagram": true ONLY when a diagram/graph/circuit/ray-diagram/structure is truly needed (and always for DIAGRAM_BASED).
   - Never attach irrelevant decorative images; keep purely algebraic/conceptual questions with "requiresDiagram": false and "diagramSvg": "".
   - When "requiresDiagram": true, author a clean, legible, properly labeled SVG inside "diagramSvg" with viewBox="0 0 460 280", white/light background rect, high-contrast strokes, and explicit scientific labels (forces, axes, nodes, reagents, organelles, angles).
7. Hints & Solutions:
   - ${req.includeHints ? 'Provide a concise conceptual "hint" (do NOT reveal the answer).' : 'Set "hint": "".'}
   - ${req.includeSolutions ? 'Provide a crisp verified step-by-step "solution".' : 'Set "solution": "".'}
8. Marking context: ${req.negativeMarkingEnabled ? `Negative marking enabled (+${req.markingCorrect} / ${req.markingIncorrect})` : `No negative marking (+${req.markingCorrect} / 0)`}. Duration: ${req.durationMins > 0 ? `${req.durationMins} mins` : 'Untimed'}.`;
}

export async function generateQuestionPaper(req: GeneratePaperRequest): Promise<{
  questions: GeneratedQuestionPayload[];
  modelUsed: string;
  providerUsed: string;
  diagramCount: number;
  durationMs: number;
}> {
  const startedAt = Date.now();
  const candidateModels = buildCandidateModelList(
    req.preferredModel,
    req.backupModel,
    req.enabledProviders
  );
  if (candidateModels.length === 0) {
    throw new Error('No enabled AI provider API keys are configured on the server.');
  }

  const systemInstruction = buildPaperSystemInstruction(req);
  const safeCount = Math.max(1, Math.min(90, Math.round(req.count || 10)));
  const batchSize = 5;
  const batchSizes: number[] = [];
  let rem = safeCount;
  while (rem > 0) {
    const take = Math.min(batchSize, rem);
    batchSizes.push(take);
    rem -= take;
  }

  const collected: GeneratedQuestionPayload[] = [];
  let lastModelUsed = candidateModels[0];
  let lastProviderUsed = resolveProviderForModel(lastModelUsed);

  // Process in waves of up to 3 concurrent batches so 30-90 question papers finish quickly without rate spikes
  const CONCURRENCY = 3;
  for (let w = 0; w < batchSizes.length; w += CONCURRENCY) {
    const waveIndices = Array.from(
      { length: Math.min(CONCURRENCY, batchSizes.length - w) },
      (_, k) => w + k
    );

    const waveResults = await Promise.all(
      waveIndices.map(async (batchIdx) => {
        const takeCount = batchSizes[batchIdx];
        const rotatedChapters = req.chapters.map(
          (_, idx) => req.chapters[(idx + batchIdx) % req.chapters.length]
        );
        const targetFormat =
          req.questionFormats.length === 1
            ? req.questionFormats[0]
            : req.questionFormats
                .map((_, idx) => req.questionFormats[(idx + batchIdx) % req.questionFormats.length])
                .join(', ');

        const avoidList = [
          ...(req.avoidPrompts || []),
          ...collected.slice(-8).map((q) => q.prompt.slice(0, 75)),
        ].slice(-12);

        const userPrompt = [
          `Generate exactly ${takeCount} distinct questions (Batch ${batchIdx + 1} of ${batchSizes.length}) in strict JSON array format.`,
          `Exam Target: ${req.examTarget === 'CUSTOM' ? req.customExamName || 'Custom' : req.examTarget}`,
          `Class Level: ${req.classChoice === 'OTHER' ? 'Other / Competitive Bridge' : `Class ${req.classChoice}`}`,
          `Subject: ${req.subject}`,
          `Chapters to cover: ${rotatedChapters.join('; ')}`,
          req.specificTopic ? `Specific Topic Focus: ${req.specificTopic}` : 'Specific Topic Focus: Entire chapter coverage',
          `Difficulty: ${req.difficulty === 'MIXED' ? 'Balanced mix of EASY, MEDIUM, and HARD' : req.difficulty}`,
          `Allowed Question Formats (distribute evenly): ${targetFormat}`,
          avoidList.length > 0 ? `Do NOT repeat these existing question concepts: ${avoidList.join(' | ')}` : '',
        ]
          .filter(Boolean)
          .join('\n');

        const res = await generateWithFailover(candidateModels, systemInstruction, userPrompt);
        return {
          items: normalizeGeneratedItems(res.rawItems, req),
          modelUsed: res.modelUsed,
          providerUsed: res.providerUsed,
        };
      })
    );

    for (const r of waveResults) {
      for (const item of r.items) {
        const normPrompt = item.prompt.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120);
        if (!collected.some((ex) => ex.prompt.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120) === normPrompt)) {
          collected.push(item);
        }
      }
      lastModelUsed = r.modelUsed;
      lastProviderUsed = r.providerUsed;
    }
  }

  // Top-up pass if deduplication or short batch left fewer than requested count
  if (collected.length > 0 && collected.length < safeCount) {
    const needed = Math.min(8, safeCount - collected.length);
    const avoidList = [
      ...(req.avoidPrompts || []),
      ...collected.slice(-10).map((q) => q.prompt.slice(0, 75)),
    ].slice(-12);
    const topUpPrompt = [
      `Generate exactly ${needed} distinct additional questions in strict JSON array format.`,
      `Exam Target: ${req.examTarget === 'CUSTOM' ? req.customExamName || 'Custom' : req.examTarget}`,
      `Class Level: ${req.classChoice === 'OTHER' ? 'Other / Competitive Bridge' : `Class ${req.classChoice}`}`,
      `Subject: ${req.subject}`,
      `Chapters to cover: ${req.chapters.join('; ')}`,
      req.specificTopic ? `Specific Topic Focus: ${req.specificTopic}` : 'Specific Topic Focus: Entire chapter coverage',
      `Difficulty: ${req.difficulty === 'MIXED' ? 'Balanced mix of EASY, MEDIUM, and HARD' : req.difficulty}`,
      `Allowed Question Formats: ${req.questionFormats.join(', ')}`,
      avoidList.length > 0 ? `Do NOT repeat these existing question concepts: ${avoidList.join(' | ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const topUpRes = await generateWithFailover(candidateModels, systemInstruction, topUpPrompt);
      const topUpItems = normalizeGeneratedItems(topUpRes.rawItems, req);
      for (const item of topUpItems) {
        if (collected.length >= safeCount) break;
        const normPrompt = item.prompt.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120);
        if (!collected.some((ex) => ex.prompt.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120) === normPrompt)) {
          collected.push(item);
        }
      }
      lastModelUsed = topUpRes.modelUsed;
      lastProviderUsed = topUpRes.providerUsed;
    } catch {
      // Preserve existing collected questions if optional top-up fails
    }
  }

  const finalQuestions = collected.slice(0, safeCount);
  if (finalQuestions.length === 0) {
    throw new Error('AI returned an empty question paper. Please refine your chapters and try again.');
  }

  const diagramCount = finalQuestions.filter((q) => q.requiresDiagram && Boolean(q.diagramSvg)).length;

  return {
    questions: finalQuestions,
    modelUsed: lastModelUsed,
    providerUsed: lastProviderUsed,
    diagramCount,
    durationMs: Date.now() - startedAt,
  };
}

export async function regenerateSingleQuestion(params: {
  uid: string;
  mode: 'REPLACE' | 'HARDER' | 'SIMILAR';
  sourceQuestion: {
    subject: ServerSubjectType;
    topic: string;
    classLevel: '11' | '12';
    aiFormat: ServerAiQuestionFormat;
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    prompt: string;
    requiresDiagram?: boolean;
  };
  examTarget: ServerAiExamTarget;
  customExamName?: string;
  includeSolutions: boolean;
  includeHints: boolean;
  avoidPrompts?: string[];
  preferredModel?: string;
  backupModel?: string;
  enabledProviders?: EnabledProvidersMap;
}): Promise<{
  question: GeneratedQuestionPayload;
  modelUsed: string;
  providerUsed: string;
}> {
  const candidateModels = buildCandidateModelList(
    params.preferredModel,
    params.backupModel,
    params.enabledProviders
  );
  if (candidateModels.length === 0) {
    throw new Error('No enabled AI provider API keys are configured on the server.');
  }

  const nextDiff =
    params.mode === 'HARDER'
      ? 'HARD'
      : params.sourceQuestion.difficulty || 'MEDIUM';

  const fakeReq: GeneratePaperRequest = {
    uid: params.uid,
    classChoice: params.sourceQuestion.classLevel,
    examTarget: params.examTarget,
    customExamName: params.customExamName,
    subject: params.sourceQuestion.subject,
    chapters: [params.sourceQuestion.topic],
    count: 1,
    difficulty: nextDiff,
    questionFormats: [params.sourceQuestion.aiFormat || 'MCQ'],
    negativeMarkingEnabled: true,
    markingCorrect: 4,
    markingIncorrect: -1,
    durationMins: 30,
    includeSolutions: params.includeSolutions,
    includeHints: params.includeHints,
  };

  const systemInstruction = buildPaperSystemInstruction(fakeReq);
  const modeDirective =
    params.mode === 'HARDER'
      ? 'Make this replacement noticeably MORE CHALLENGING (multi-concept analytical depth) than the original question while staying on the same chapter/topic.'
      : params.mode === 'SIMILAR'
        ? 'Create an ISOMORPHIC PRACTICE QUESTION testing the exact same underlying formula/concept as the reference question, using new numbers, substances, or physical setup.'
        : 'Generate a COMPLETELY FRESH replacement question on the same chapter and format, testing a different sub-concept.';

  const userPrompt = [
    `Generate exactly 1 replacement question in strict JSON array format (array length = 1).`,
    `Mode: ${modeDirective}`,
    `Subject: ${params.sourceQuestion.subject} | Topic: ${params.sourceQuestion.topic} | Class ${params.sourceQuestion.classLevel}`,
    `Required Format: ${params.sourceQuestion.aiFormat}`,
    `Required Difficulty: ${nextDiff}`,
    params.sourceQuestion.requiresDiagram ? 'Include an accurate labeled SVG diagram ("requiresDiagram": true).' : '',
    `Original Reference Question (do NOT copy verbatim): ${params.sourceQuestion.prompt.slice(0, 300)}`,
    params.avoidPrompts && params.avoidPrompts.length > 0
      ? `Avoid duplicating: ${params.avoidPrompts.slice(-8).join(' | ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const res = await generateWithFailover(candidateModels, systemInstruction, userPrompt);
  const normalized = normalizeGeneratedItems(res.rawItems, fakeReq);
  if (normalized.length === 0) {
    throw new Error('AI failed to return a valid replacement question.');
  }

  return {
    question: normalized[0],
    modelUsed: res.modelUsed,
    providerUsed: res.providerUsed,
  };
}
