import { ThinkingLevel } from '@google/genai';
import {
  buildCandidateModelList,
  describeFailoverReason,
  getGeminiClient,
  resolveProviderForModel,
  withTimeout,
  type AiProviderId,
  type EnabledProvidersMap,
} from './aiPaperService.ts';

export interface AiTutorHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiTutorChatRequest {
  prompt: string;
  history?: AiTutorHistoryMessage[];
  mode?: string;
  style?: string;
  userContext?: unknown;
  imageBase64?: string;
  pdfBase64?: string;
  model?: string;
  backupModel?: string;
  enabledProviders?: EnabledProvidersMap;
}

export interface AiTutorChatResponse {
  reply: string;
  modelUsed: string;
  providerUsed: AiProviderId;
  failoverFrom?: string;
  failoverReason?: string;
  attemptedModels: string[];
}

function parseDataUrl(raw: string, fallbackMime: string): { mimeType: string; data: string } {
  const match = raw.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (match) {
    return {
      mimeType: match[1].trim() || fallbackMime,
      data: match[2].trim(),
    };
  }
  const commaIdx = raw.indexOf(',');
  return {
    mimeType: fallbackMime,
    data: (commaIdx >= 0 ? raw.slice(commaIdx + 1) : raw).trim(),
  };
}

function normalizeAnthropicMime(mimeType: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  const lower = mimeType.toLowerCase();
  if (lower === 'image/png') return 'image/png';
  if (lower === 'image/gif') return 'image/gif';
  if (lower === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

function buildTutorSystemInstruction(req: AiTutorChatRequest): string {
  return `You are an expert, friendly, and rigorous JEE (Joint Entrance Examination Main & Advanced) and NEET personal AI tutor, doubt-solving assistant, and mentor.
You specialize in Physics, Chemistry, and Mathematics for Class 11, Class 12, and Dropper students.
Current Learning Mode: ${req.mode || 'DOUBT_SOLVER'}
Explanation Style: ${req.style || 'EXAM_ORIENTED'}
Student Context: ${JSON.stringify(req.userContext || {})}

Guidelines for your responses:
- Explain concepts using clear step-by-step reasoning tailored to JEE difficulty.
- Use LaTeX notation for mathematical formulas (enclosed in $...$ or $$...$$).
- Highlight important formulas, shortcuts, and common traps/mistakes to avoid.
- Clearly distinguish JEE Main (speed & formula application) vs JEE Advanced (deep conceptual multi-step analysis) approaches.
- If an image or PDF attachment is provided, analyze the question or document carefully, identify the relevant chapter, explain the core concept, solve step-by-step, and state the final answer clearly.
- Be encouraging, precise, and professional like an experienced Kota coaching faculty member.`;
}

function sanitizeHistory(history?: AiTutorHistoryMessage[]): AiTutorHistoryMessage[] {
  if (!Array.isArray(history)) return [];
  const cleaned: AiTutorHistoryMessage[] = [];
  for (const item of history.slice(-10)) {
    const content = typeof item?.content === 'string' ? item.content.trim() : '';
    if (!content) continue;
    const role: 'user' | 'assistant' = item.role === 'assistant' ? 'assistant' : 'user';
    cleaned.push({ role, content });
  }
  // Avoid duplicating the current prompt if the client already appended it at the tail of history
  return cleaned;
}

async function callGeminiTutor(
  modelId: string,
  systemInstruction: string,
  req: AiTutorChatRequest,
  history: AiTutorHistoryMessage[]
): Promise<string> {
  const ai = getGeminiClient();
  const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = [];

  for (const h of history) {
    contents.push({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }],
    });
  }

  const userParts: Array<Record<string, unknown>> = [{ text: req.prompt }];
  if (req.imageBase64) {
    const parsedImg = parseDataUrl(req.imageBase64, 'image/jpeg');
    userParts.push({
      inlineData: {
        mimeType: parsedImg.mimeType,
        data: parsedImg.data,
      },
    });
  }
  if (req.pdfBase64) {
    const parsedPdf = parseDataUrl(req.pdfBase64, 'application/pdf');
    userParts.push({
      inlineData: {
        mimeType: 'application/pdf',
        data: parsedPdf.data,
      },
    });
  }

  contents.push({
    role: 'user',
    parts: userParts,
  });

  const isGemini4 = modelId.startsWith('gemini-4-');
  const response = await withTimeout(
    ai.models.generateContent({
      model: modelId,
      contents,
      config: {
        systemInstruction,
        ...(isGemini4 ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
      },
    }),
    30000,
    `Gemini (${modelId})`
  );

  const text = (response.text || '').trim();
  if (!text) throw new Error(`Gemini (${modelId}) returned an empty response.`);
  return text;
}

async function callAnthropicTutor(
  modelId: string,
  systemInstruction: string,
  req: AiTutorChatRequest,
  history: AiTutorHistoryMessage[]
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured.');

  // Anthropic requires strictly alternating user/assistant messages starting with 'user'
  const mergedMessages: Array<{ role: 'user' | 'assistant'; content: string | Array<Record<string, unknown>> }> = [];
  for (const h of history) {
    const last = mergedMessages[mergedMessages.length - 1];
    if (last && last.role === h.role && typeof last.content === 'string') {
      last.content = `${last.content}\n\n${h.content}`;
    } else if (mergedMessages.length > 0 || h.role === 'user') {
      mergedMessages.push({ role: h.role, content: h.content });
    }
  }

  const finalUserBlocks: Array<Record<string, unknown>> = [{ type: 'text', text: req.prompt }];
  if (req.imageBase64) {
    const parsedImg = parseDataUrl(req.imageBase64, 'image/jpeg');
    finalUserBlocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: normalizeAnthropicMime(parsedImg.mimeType),
        data: parsedImg.data,
      },
    });
  }
  if (req.pdfBase64) {
    const parsedPdf = parseDataUrl(req.pdfBase64, 'application/pdf');
    finalUserBlocks.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: parsedPdf.data,
      },
    });
  }

  const last = mergedMessages[mergedMessages.length - 1];
  if (last && last.role === 'user') {
    const priorText = typeof last.content === 'string' ? last.content : '';
    if (priorText && priorText !== req.prompt) {
      finalUserBlocks.unshift({ type: 'text', text: priorText });
    }
    last.content = finalUserBlocks;
  } else {
    mergedMessages.push({
      role: 'user',
      content: finalUserBlocks.length === 1 ? req.prompt : finalUserBlocks,
    });
  }

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
        messages: mergedMessages,
      }),
    }),
    32000,
    `Anthropic (${modelId})`
  );

  if (!resp.ok) {
    const errTxt = await resp.text();
    throw new Error(`Anthropic error (${resp.status}): ${errTxt.slice(0, 260)}`);
  }

  const json = (await resp.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const reply = (json.content || [])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim();

  if (!reply) throw new Error(`Anthropic (${modelId}) returned an empty response.`);
  return reply;
}

async function callDeepSeekTutor(
  modelId: string,
  systemInstruction: string,
  req: AiTutorChatRequest,
  history: AiTutorHistoryMessage[]
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not configured.');

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemInstruction },
  ];

  // DeepSeek reasoner prefers non-adjacent same roles; normalize cleanly for both chat & reasoner
  for (const h of history) {
    const prev = messages[messages.length - 1];
    if (prev && prev.role === h.role) {
      prev.content = `${prev.content}\n\n${h.content}`;
    } else {
      messages.push({ role: h.role, content: h.content });
    }
  }

  const prev = messages[messages.length - 1];
  if (prev && prev.role === 'user') {
    if (prev.content !== req.prompt) {
      prev.content = `${prev.content}\n\n${req.prompt}`;
    }
  } else {
    messages.push({ role: 'user', content: req.prompt });
  }

  const resp = await withTimeout(
    fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        max_tokens: 4096,
      }),
    }),
    35000,
    `DeepSeek (${modelId})`
  );

  if (!resp.ok) {
    const errTxt = await resp.text();
    throw new Error(`DeepSeek error (${resp.status}): ${errTxt.slice(0, 260)}`);
  }

  const json = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
  };
  const reply = (json.choices?.[0]?.message?.content || '').trim();
  if (!reply) throw new Error(`DeepSeek (${modelId}) returned an empty response.`);
  return reply;
}

async function callOpenAiTutor(
  modelId: string,
  systemInstruction: string,
  req: AiTutorChatRequest,
  history: AiTutorHistoryMessage[]
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | Array<Record<string, unknown>> }> = [
    { role: 'system', content: systemInstruction },
  ];

  for (const h of history) {
    messages.push({ role: h.role, content: h.content });
  }

  const last = messages[messages.length - 1];
  const userContent: string | Array<Record<string, unknown>> = req.imageBase64
    ? [
        { type: 'text', text: req.prompt },
        {
          type: 'image_url',
          image_url: {
            url: req.imageBase64.startsWith('data:')
              ? req.imageBase64
              : `data:image/jpeg;base64,${req.imageBase64}`,
          },
        },
      ]
    : req.prompt;

  if (last && last.role === 'user' && last.content === req.prompt) {
    last.content = userContent;
  } else {
    messages.push({ role: 'user', content: userContent });
  }

  const resp = await withTimeout(
    fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages,
      }),
    }),
    30000,
    `OpenAI (${modelId})`
  );

  if (!resp.ok) {
    const errTxt = await resp.text();
    throw new Error(`OpenAI error (${resp.status}): ${errTxt.slice(0, 260)}`);
  }

  const json = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const reply = (json.choices?.[0]?.message?.content || '').trim();
  if (!reply) throw new Error(`OpenAI (${modelId}) returned an empty response.`);
  return reply;
}

async function callGroqTutor(
  modelId: string,
  systemInstruction: string,
  req: AiTutorChatRequest,
  history: AiTutorHistoryMessage[]
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error('GROQ_API_KEY is not configured.');

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | Array<Record<string, unknown>> }> = [
    { role: 'system', content: systemInstruction },
  ];

  for (const h of history) {
    messages.push({ role: h.role, content: h.content });
  }

  const supportsVision = modelId.includes('llama-4-scout') || modelId.includes('llama-4-maverick');
  const userContent: string | Array<Record<string, unknown>> =
    req.imageBase64 && supportsVision
      ? [
          { type: 'text', text: req.prompt },
          {
            type: 'image_url',
            image_url: {
              url: req.imageBase64.startsWith('data:')
                ? req.imageBase64
                : `data:image/jpeg;base64,${req.imageBase64}`,
            },
          },
        ]
      : req.prompt;

  const last = messages[messages.length - 1];
  if (last && last.role === 'user' && last.content === req.prompt) {
    last.content = userContent;
  } else {
    messages.push({ role: 'user', content: userContent });
  }

  const resp = await withTimeout(
    fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        max_tokens: 4096,
      }),
    }),
    25000,
    `Groq (${modelId})`
  );

  if (!resp.ok) {
    const errTxt = await resp.text();
    throw new Error(`Groq error (${resp.status}): ${errTxt.slice(0, 260)}`);
  }

  const json = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const reply = (json.choices?.[0]?.message?.content || '').trim();
  if (!reply) throw new Error(`Groq (${modelId}) returned an empty response.`);
  return reply;
}

export async function generateAiTutorReplyWithFailover(
  req: AiTutorChatRequest
): Promise<AiTutorChatResponse> {
  const preferred = req.model && req.model !== 'AUTO' ? req.model : undefined;
  const allCandidates = buildCandidateModelList(preferred, req.backupModel, req.enabledProviders);

  const hasPdf = Boolean(req.pdfBase64);
  const hasImage = Boolean(req.imageBase64);

  // Filter out models that cannot read the attached file type so failover never wastes hops
  const compatibleCandidates = allCandidates.filter((modelId) => {
    const provider = resolveProviderForModel(modelId);
    if (hasPdf) {
      return provider === 'gemini' || provider === 'anthropic';
    }
    if (hasImage) {
      if (provider === 'groq') {
        return modelId.includes('llama-4-scout') || modelId.includes('llama-4-maverick');
      }
      return provider === 'gemini' || provider === 'anthropic' || provider === 'openai';
    }
    return true;
  });

  if (compatibleCandidates.length === 0) {
    throw new Error(
      hasPdf
        ? 'No PDF-capable AI provider (Gemini or Claude) is currently configured and enabled on the server.'
        : hasImage
          ? 'No vision-capable AI provider (Gemini, Claude, Groq Vision, or OpenAI) is currently configured and enabled on the server.'
          : 'No AI provider API keys are configured on the server.'
    );
  }

  const systemInstruction = buildTutorSystemInstruction(req);
  const history = sanitizeHistory(req.history);
  const attemptedModels: string[] = [];
  let firstFailedModel: string | undefined;
  let firstFailureReason: string | undefined;
  if (preferred && !compatibleCandidates.includes(preferred)) {
    firstFailedModel = preferred;
    const prefProvider = resolveProviderForModel(preferred);
    const groqVisionOk =
      prefProvider === 'groq' &&
      (preferred.includes('llama-4-scout') || preferred.includes('llama-4-maverick'));
    if (
      (hasPdf && prefProvider !== 'gemini' && prefProvider !== 'anthropic') ||
      (hasImage && (prefProvider === 'deepseek' || (prefProvider === 'groq' && !groqVisionOk)))
    ) {
      firstFailureReason = 'attachment not supported by model';
    } else {
      firstFailureReason = 'API key not set in server secrets';
    }
  }
  let lastErr: unknown;

  for (let i = 0; i < compatibleCandidates.length; i += 1) {
    const candidate = compatibleCandidates[i];
    const provider = resolveProviderForModel(candidate);
    attemptedModels.push(candidate);

    if (i > 0) {
      await new Promise((r) => setTimeout(r, 200 + Math.floor(Math.random() * 150)));
    }

    try {
      let reply = '';
      if (provider === 'groq') {
        reply = await callGroqTutor(candidate, systemInstruction, req, history);
      } else if (provider === 'anthropic') {
        reply = await callAnthropicTutor(candidate, systemInstruction, req, history);
      } else if (provider === 'deepseek') {
        reply = await callDeepSeekTutor(candidate, systemInstruction, req, history);
      } else if (provider === 'openai') {
        reply = await callOpenAiTutor(candidate, systemInstruction, req, history);
      } else {
        reply = await callGeminiTutor(candidate, systemInstruction, req, history);
      }

      if (reply) {
        return {
          reply,
          modelUsed: candidate,
          providerUsed: provider,
          ...(firstFailedModel && firstFailedModel !== candidate
            ? {
                failoverFrom: firstFailedModel,
                failoverReason: firstFailureReason,
              }
            : {}),
          attemptedModels,
        };
      }
      throw new Error(`Model ${candidate} returned an empty response.`);
    } catch (err) {
      lastErr = err;
      if (!firstFailedModel) {
        firstFailedModel = candidate;
        firstFailureReason = describeFailoverReason(err);
      }
      // Continue immediately to the next configured model/provider (Gemini -> Claude -> DeepSeek -> OpenAI)
    }
  }

  throw lastErr || new Error('All configured AI models reached their limit or failed.');
}
