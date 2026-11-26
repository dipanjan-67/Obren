import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Brain,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileText,
  Image as ImageIcon,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Palette,
  Plus,
  RefreshCcw,
  Send,
  Sliders,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { getApiJson, postApiJson } from '../lib/apiClient';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  DEFAULT_AI_SETTINGS,
  type AiExplanationStyle,
  type AiLearningMode,
  type AiProviderStatus,
  type AiSavedSnippet,
  type AiSettings,
  type UserProfile,
} from '../types/obren';
import { MathText } from './MathText';

interface AIChatWidgetProps {
  profile: UserProfile | null;
  attempts?: Array<any>;
  weakReport?: any;
}

const MODES: Array<{ id: AiLearningMode; label: string; desc: string }> = [
  { id: 'DOUBT_SOLVER', label: 'Doubt Solver', desc: 'Step-by-step problem solving & formulas' },
  { id: 'CONCEPT_TEACHER', label: 'Concept Teacher', desc: 'Complete topic teaching from basics' },
  { id: 'JEE_ADVANCED', label: 'JEE Advanced', desc: 'Deep conceptual multi-step analysis' },
  { id: 'QUICK_REVISION', label: 'Quick Revision', desc: 'Short notes & formula sheets' },
  { id: 'PRACTICE_MODE', label: 'Practice Mode', desc: 'Chapter-wise questions with hints' },
  { id: 'TEST_ANALYSIS', label: 'Test Analysis', desc: 'Analyze mock performance & weak areas' },
];

const STYLES: Array<{ id: AiExplanationStyle; label: string }> = [
  { id: 'BEGINNER', label: 'Beginner Friendly' },
  { id: 'DETAILED', label: 'Detailed Explanation' },
  { id: 'SHORT', label: 'Short & Direct' },
  { id: 'EXAM_ORIENTED', label: 'Exam-Oriented' },
];

const QUICK_CARDS = [
  { title: 'Solve a Physics Question', prompt: 'Can you help me solve a tough mechanics/rotational motion question step by step?' },
  { title: 'Explain a Chemistry Concept', prompt: 'Explain GOC (General Organic Chemistry) inductive and resonance effects with JEE examples.' },
  { title: 'Help with Mathematics', prompt: 'What are the most important calculus shortcuts and integration by parts rules for JEE Advanced?' },
  { title: 'Generate Formula Sheets', prompt: 'Generate a comprehensive formula sheet for Electrostatics and Current Electricity.' },
  { title: 'Analyse My Mock Test', prompt: 'Based on my recent test performance and weak topics, what should I revise today?' },
  { title: 'Start Practice Questions', prompt: 'Give me a challenging JEE Main level practice question in Mathematics (Matrices & Determinants) with hints.' },
];

interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  pdfUrl?: string;
  isError?: boolean;
  timestamp?: string;
  modelUsed?: string;
  providerUsed?: string;
  failoverFrom?: string;
  failoverReason?: string;
  createdAt?: any;
}

export const AIChatWidget: React.FC<AIChatWidgetProps> = ({
  profile,
  attempts = [],
  weakReport,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [mode, setMode] = useState<AiLearningMode>('DOUBT_SOLVER');
  const [style, setStyle] = useState<AiExplanationStyle>('EXAM_ORIENTED');
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [thinkingStep, setThinkingStep] = useState('Analyzing question...');
  const [selectedImageBase64, setSelectedImageBase64] = useState<string | null>(null);
  const [selectedPdfBase64, setSelectedPdfBase64] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedSnippets, setSavedSnippets] = useState<AiSavedSnippet[]>([]);
  const [showSavedModal, setShowSavedModal] = useState(false);
  const [showAppearanceMenu, setShowAppearanceMenu] = useState(false);

  // Chat appearance preferences
  const [chatTheme, setChatTheme] = useState<'DARK' | 'LIGHT' | 'MIDNIGHT'>(() => {
    return (localStorage.getItem('obren_ai_chat_theme') as any) || 'DARK';
  });
  const [chatFontSize, setChatFontSize] = useState<'SMALL' | 'MEDIUM' | 'LARGE'>(() => {
    return (localStorage.getItem('obren_ai_chat_font_size') as any) || 'MEDIUM';
  });
  const [chatDensity, setChatDensity] = useState<'COMFORTABLE' | 'COMPACT'>(() => {
    return (localStorage.getItem('obren_ai_chat_density') as any) || 'COMFORTABLE';
  });

  const [aiSettings, setAiSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [providers, setProviders] = useState<AiProviderStatus[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('AUTO');
  const [toastNotice, setToastNotice] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  const uid = profile?.uid;

  // Sync appearance preferences to localStorage
  useEffect(() => {
    localStorage.setItem('obren_ai_chat_theme', chatTheme);
    localStorage.setItem('obren_ai_chat_font_size', chatFontSize);
    localStorage.setItem('obren_ai_chat_density', chatDensity);
  }, [chatTheme, chatFontSize, chatDensity]);

  // Load global AI Settings
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'aiSettings', 'global'),
      (snap) => {
        if (snap.exists()) {
          setAiSettings({
            ...DEFAULT_AI_SETTINGS,
            ...(snap.data() as Partial<AiSettings>),
          });
        }
      },
      () => {}
    );
    return () => unsub();
  }, []);

  // Load saved snippets
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(collection(db, 'aiSavedSnippets'), orderBy('createdAt', 'desc'), limit(50)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<AiSavedSnippet, 'id'>) }))
          .filter((s) => s.ownerId === uid);
        setSavedSnippets(list);
      },
      () => {}
    );
    return () => unsub();
  }, [uid]);

  // Load connected backend AI providers (Gemini, Claude, DeepSeek, OpenAI)
  useEffect(() => {
    if (!isOpen || !uid) return;
    let active = true;
    const loadProviders = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token || !active) return;
        const res = await getApiJson<{ providers?: AiProviderStatus[] }>('/api/ai/providers', token);
        if (active && Array.isArray(res.providers)) {
          setProviders(res.providers);
        }
      } catch {
        // Non-fatal UI check; fallback models remain available
      }
    };
    void loadProviders();
    return () => {
      active = false;
    };
  }, [isOpen, uid]);

  // Scroll to bottom on new message
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, loading]);

  // Thinking step animation
  useEffect(() => {
    if (!loading) return;
    const steps = [
      'Reading and analyzing question...',
      'Identifying core concepts and chapter...',
      'Applying JEE formulas and shortcuts...',
      'Structuring rigorous step-by-step explanation...',
    ];
    let i = 0;
    setThinkingStep(steps[0]);
    const timer = setInterval(() => {
      i = (i + 1) % steps.length;
      setThinkingStep(steps[i]);
    }, 1800);
    return () => clearInterval(timer);
  }, [loading]);

  // Voice recognition support
  const handleToggleVoice = () => {
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any })
        .SpeechRecognition ||
      (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any })
        .webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setToastNotice('Voice recognition is not supported in this browser.');
      setTimeout(() => setToastNotice(null), 3500);
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-IN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setInputPrompt((prev) => (prev ? `${prev} ${text}` : text));
        setIsListening(false);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImageBase64(String(reader.result));
      setSelectedFileName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handlePdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedPdfBase64(String(reader.result));
      setSelectedFileName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async (overrideText?: string, isRetry = false) => {
    const textToSend = overrideText || inputPrompt;
    if ((!textToSend.trim() && !selectedImageBase64 && !selectedPdfBase64) || loading || !uid) return;

    const userMsg: ChatMessageItem = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      ...(selectedImageBase64 ? { imageUrl: selectedImageBase64 } : {}),
      ...(selectedPdfBase64 ? { pdfUrl: selectedFileName || 'Uploaded PDF' } : {}),
    };

    // If retry, don't duplicate the user message
    const nextMessages = isRetry ? [...messages] : [...messages, userMsg];
    if (!isRetry) {
      setMessages(nextMessages);
      setInputPrompt('');
    }

    const imgPayload = selectedImageBase64;
    const pdfPayload = selectedPdfBase64;
    setSelectedImageBase64(null);
    setSelectedPdfBase64(null);
    setSelectedFileName(null);
    setLoading(true);

    try {
      const userContext = {
        displayName: profile?.displayName,
        targetExam: profile?.targetExam,
        targetClass: profile?.targetClass,
        xp: profile?.xp,
        streakDays: profile?.streakDays,
        completedChaptersCount: profile?.completedChapters?.length || 0,
        recentAttemptsCount: attempts.length,
        weakTopics: weakReport?.weakTopics?.slice(0, 5) || [],
      };

      const historyPayload = nextMessages
        .filter((m) => !m.isError)
        .slice(-8)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const token = await auth.currentUser?.getIdToken();
      const effectiveModel =
        selectedModel === 'AUTO' ? aiSettings.model || 'gemini-4-hydrogen' : selectedModel;

      const res = await postApiJson<{
        reply: string;
        modelUsed?: string;
        providerUsed?: string;
        failoverFrom?: string;
        failoverReason?: string;
      }>(
        '/api/ai/chat',
        {
          prompt: textToSend,
          history: historyPayload,
          mode,
          style,
          model: effectiveModel,
          backupModel: aiSettings.backupModel || 'claude-3-5-sonnet-latest',
          enabledProviders: {
            gemini: aiSettings.enableGemini ?? true,
            openai: aiSettings.enableOpenAi ?? true,
            anthropic: aiSettings.enableAnthropic ?? true,
            deepseek: aiSettings.enableDeepSeek ?? true,
            groq: aiSettings.enableGroq ?? true,
          },
          userContext,
          ...(imgPayload ? { imageBase64: imgPayload } : {}),
          ...(pdfPayload ? { pdfBase64: pdfPayload } : {}),
        },
        token
      );

      const aiMsg: ChatMessageItem = {
        id: `ai_${Date.now()}`,
        role: 'assistant',
        content: res.reply || 'No response generated.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed: res.modelUsed,
        providerUsed: res.providerUsed,
        failoverFrom: res.failoverFrom,
        failoverReason: res.failoverReason,
      };

      setMessages([...nextMessages, aiMsg]);
    } catch (err) {
      const errText = err instanceof Error ? err.message : 'AI service temporarily unavailable.';
      setMessages([
        ...nextMessages,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          isError: true,
          content: `⚠️ **AI Service Notice**: ${errText}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (loading || messages.length === 0) return;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) return;

    // Prune the trailing assistant message or error message
    const filtered = [...messages];
    if (filtered.length > 0 && filtered[filtered.length - 1].role === 'assistant') {
      filtered.pop();
    }
    setMessages(filtered);
    void handleSend(lastUserMsg.content, true);
  };

  const handleSaveSnippet = async (msg: ChatMessageItem) => {
    if (!uid) return;
    try {
      const lastUserMsg = messages
        .slice(0, messages.indexOf(msg))
        .reverse()
        .find((m) => m.role === 'user');
      const qPrompt = lastUserMsg?.content || 'JEE Discussion';

      await addDoc(collection(db, 'aiSavedSnippets'), {
        ownerId: uid,
        questionPrompt: qPrompt.slice(0, 1900),
        answerContent: msg.content.slice(0, 19000),
        chapter: 'JEE Physics / Chem / Math',
        createdAt: serverTimestamp(),
      });
      setToastNotice('Solution saved to your AI Bookmarks.');
      setTimeout(() => setToastNotice(null), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'aiSavedSnippets');
    }
  };

  const handleDownloadNotes = (msg: ChatMessageItem) => {
    const blob = new Blob([msg.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OBREN_AI_Revision_Notes_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Theme-specific styles
  const themeContainerClass =
    chatTheme === 'LIGHT'
      ? 'bg-white text-slate-900 border-slate-300'
      : chatTheme === 'MIDNIGHT'
        ? 'bg-[#060a14] text-slate-100 border-slate-800'
        : 'bg-slate-900 text-slate-100 border-slate-800';

  const themeHeaderClass =
    chatTheme === 'LIGHT'
      ? 'bg-slate-50 border-slate-200'
      : chatTheme === 'MIDNIGHT'
        ? 'bg-[#03060c] border-slate-800'
        : 'bg-slate-950/90 border-slate-800';

  const themeBubbleAssistant =
    chatTheme === 'LIGHT'
      ? 'bg-slate-100 text-slate-800 border-slate-200'
      : 'bg-slate-950 text-slate-100 border-slate-800';

  const fontClass =
    chatFontSize === 'SMALL'
      ? 'text-[11px]'
      : chatFontSize === 'LARGE'
        ? 'text-[14px]'
        : 'text-xs';

  const paddingClass = chatDensity === 'COMPACT' ? 'p-2.5' : 'p-4';

  return (
    <>
      {/* Floating AI Assistant Trigger Button */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 group flex items-center gap-2.5 px-4 py-3.5 rounded-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 text-white shadow-2xl hover:scale-105 transition-all duration-300 cursor-pointer border border-indigo-400/30"
          aria-label="Open AI JEE Tutor"
        >
          <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center animate-spin-slow">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold font-display text-xs tracking-wide">
            AI JEE Tutor &amp; Mentor
          </span>
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
        </button>
      )}

      {/* Chat Modal / Fullscreen Window */}
      {isOpen && (
        <div
          className={`fixed z-50 transition-all duration-300 flex flex-col border shadow-2xl overflow-hidden ${themeContainerClass} ${
            isFullScreen
              ? 'inset-0 rounded-none'
              : 'bottom-4 right-4 w-[92vw] sm:w-[470px] h-[650px] rounded-2xl'
          }`}
        >
          {/* Header */}
          <div className={`px-4 py-3 border-b flex items-center justify-between shrink-0 ${themeHeaderClass}`}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-500 flex items-center justify-center text-white shrink-0 shadow-md">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold font-display text-sm flex items-center gap-1.5">
                  <span>OBREN AI JEE Mentor</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Online 24/7
                  </span>
                </h3>
                <p className="text-[10px] text-slate-400 font-mono">
                  Mode: {MODES.find((m) => m.id === mode)?.label}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMessages([])}
                title="New Chat Session"
                className="p-2 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-800/40 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowAppearanceMenu((prev) => !prev)}
                title="Chat Appearance"
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/40 cursor-pointer"
              >
                <Palette className="w-4 h-4 text-cyan-400" />
              </button>
              <button
                type="button"
                onClick={() => setShowSavedModal(true)}
                title="Saved AI Bookmarks"
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/40 cursor-pointer"
              >
                <FileText className="w-4 h-4 text-amber-400" />
              </button>
              <button
                type="button"
                onClick={() => setIsFullScreen((prev) => !prev)}
                title={isFullScreen ? 'Minimize Window' : 'Full Screen'}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/40 cursor-pointer"
              >
                {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Close"
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/40 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Appearance Customization Sub-Bar */}
          {showAppearanceMenu && (
            <div className="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-mono text-slate-400">Theme:</span>
                {(['DARK', 'LIGHT', 'MIDNIGHT'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setChatTheme(t)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                      chatTheme === t ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-mono text-slate-400">Size:</span>
                {(['SMALL', 'MEDIUM', 'LARGE'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setChatFontSize(s)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                      chatFontSize === s ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-mono text-slate-400">Density:</span>
                {(['COMFORTABLE', 'COMPACT'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setChatDensity(d)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                      chatDensity === d ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Mode, Style & Multi-Model Auto-Failover Bar */}
          <div className="px-3 py-2 bg-slate-950/40 border-b border-slate-800/80 flex flex-wrap items-center gap-2 shrink-0 text-xs">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as AiLearningMode)}
              className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-900 text-[11px] font-semibold text-indigo-300 focus:outline-none"
            >
              {MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  Mode: {m.label}
                </option>
              ))}
            </select>

            <select
              value={style}
              onChange={(e) => setStyle(e.target.value as AiExplanationStyle)}
              className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-900 text-[11px] font-semibold text-cyan-300 focus:outline-none"
            >
              {STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  Style: {s.label}
                </option>
              ))}
            </select>

            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              title="Preferred AI Model (automatically switches to Claude, DeepSeek, or Gemini if limits are reached)"
              className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-900 text-[11px] font-mono font-semibold text-emerald-300 focus:outline-none max-w-[190px]"
            >
              <option value="AUTO">Auto Failover ({aiSettings.model})</option>
              {providers.length > 0 ? (
                providers.map((p) =>
                  p.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id} · {p.configured ? p.label : `${p.label} (Key Unset)`}
                    </option>
                  ))
                )
              ) : (
                <>
                  <option value="gemini-4-hydrogen">gemini-4-hydrogen</option>
                  <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite</option>
                  <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
                  <option value="llama-3.1-8b-instant">llama-3.1-8b-instant</option>
                  <option value="claude-3-5-sonnet-latest">claude-3-5-sonnet-latest</option>
                  <option value="claude-3-5-haiku-latest">claude-3-5-haiku-latest</option>
                  <option value="deepseek-chat">deepseek-chat</option>
                  <option value="deepseek-reasoner">deepseek-reasoner</option>
                </>
              )}
            </select>

            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setMessages([])}
                className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-rose-400 hover:bg-rose-950/40 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
          </div>

          {(() => {
            if (selectedModel === 'AUTO' || providers.length === 0) return null;
            const matchedProvider = providers.find((p) =>
              p.models.some((m) => m.id === selectedModel)
            );
            if (!matchedProvider || matchedProvider.configured) return null;
            return (
              <div className="px-3 py-1.5 bg-amber-950/50 border-b border-amber-800/60 text-[11px] text-amber-200 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>
                  <strong className="font-mono">{matchedProvider.envVarName}</strong> is not set in server Secrets yet — replies will auto-failover to a connected model until configured.
                </span>
              </div>
            );
          })()}

          {toastNotice && (
            <div className="px-3 py-1.5 bg-emerald-950/60 border-b border-emerald-800/70 text-[11px] font-semibold text-emerald-300 flex items-center justify-between">
              <span>{toastNotice}</span>
              <button
                type="button"
                onClick={() => setToastNotice(null)}
                className="text-emerald-400 hover:text-white cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Chat Messages / Welcome Screen Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="py-6 space-y-5 text-center">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center mx-auto">
                  <Bot className="w-6 h-6" />
                </div>
                <div className="space-y-1.5 max-w-sm mx-auto">
                  <h4 className="font-bold font-display text-base text-white">
                    Hello! I&apos;m your AI JEE Study Assistant.
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Ask me anything about Physics, Chemistry or Mathematics. I can solve your doubts, explain concepts and help you prepare for JEE Main and Advanced.
                  </p>
                </div>

                {/* Quick Action Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left pt-2">
                  {QUICK_CARDS.map((card) => (
                    <button
                      key={card.title}
                      type="button"
                      onClick={() => void handleSend(card.prompt)}
                      className="p-3 rounded-xl border border-slate-800 bg-slate-950/60 hover:bg-slate-800/80 transition-colors text-xs space-y-1 cursor-pointer group"
                    >
                      <div className="font-bold text-indigo-300 group-hover:text-indigo-200">
                        {card.title}
                      </div>
                      <div className="text-[11px] text-slate-400 line-clamp-1">
                        {card.prompt}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => {
                const isUser = m.role === 'user';
                return (
                  <div
                    key={m.id}
                    className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isUser && (
                      <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0 mt-1">
                        <Bot className="w-4 h-4" />
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-2xl ${paddingClass} ${fontClass} leading-relaxed space-y-2 border ${
                        isUser
                          ? 'bg-indigo-600 text-white border-indigo-500 rounded-br-xs'
                          : m.isError
                            ? 'bg-rose-950/30 text-rose-200 border-rose-800/80 rounded-bl-xs'
                            : `${themeBubbleAssistant} rounded-bl-xs`
                      }`}
                    >
                      {m.imageUrl && (
                        <div className="rounded-lg overflow-hidden border border-slate-700 max-h-48 mb-2">
                          <img src={m.imageUrl} alt="Uploaded attachment" className="w-full h-full object-cover" />
                        </div>
                      )}
                      {m.pdfUrl && (
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-cyan-300">
                          <FileText className="w-4 h-4 shrink-0" />
                          <span className="truncate">{m.pdfUrl}</span>
                        </div>
                      )}

                      <div className="whitespace-pre-wrap">
                        <MathText text={m.content} />
                      </div>

                      {!isUser && !m.isError && m.modelUsed && (
                        <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px] font-mono text-slate-400">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700/80 text-slate-300">
                            Model: {m.modelUsed}
                          </span>
                          {m.failoverFrom && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-950/50 border border-amber-700/60 text-amber-300">
                              Auto-switched from {m.failoverFrom} ({m.failoverReason || 'limit reached'})
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-[10px] text-slate-400">
                        <span>{m.timestamp || ''}</span>
                        {!isUser && !m.isError && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleRegenerate()}
                              className="inline-flex items-center gap-1 hover:text-indigo-300 cursor-pointer"
                            >
                              <RefreshCcw className="w-3 h-3" />
                              <span>Regenerate</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard.writeText(m.content);
                                setCopiedId(m.id);
                                setTimeout(() => setCopiedId(null), 2000);
                              }}
                              className="inline-flex items-center gap-1 hover:text-white cursor-pointer"
                            >
                              {copiedId === m.id ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              <span>{copiedId === m.id ? 'Copied' : 'Copy'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleSaveSnippet(m)}
                              className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 cursor-pointer"
                            >
                              <span>Bookmark</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadNotes(m)}
                              className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 cursor-pointer"
                            >
                              <Download className="w-3 h-3" />
                              <span>Notes</span>
                            </button>
                          </div>
                        )}
                        {m.isError && (
                          <button
                            type="button"
                            onClick={() => void handleRegenerate()}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer"
                          >
                            <RefreshCcw className="w-3 h-3" />
                            <span>Retry Query</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {loading && (
              <div className="flex items-center gap-3 text-slate-400 text-xs">
                <div className="w-7 h-7 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center shrink-0">
                  <RefreshCcw className="w-4 h-4 animate-spin" />
                </div>
                <div className="px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                  <span>{thinkingStep}</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input & Attachment Toolbar */}
          <div className="p-3 border-t border-slate-800 bg-slate-950/90 shrink-0 space-y-2">
            {(selectedFileName || selectedImageBase64) && (
              <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                <span className="truncate text-indigo-300 font-mono">
                  Attached: {selectedFileName || 'Question Image'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedImageBase64(null);
                    setSelectedPdfBase64(null);
                    setSelectedFileName(null);
                  }}
                  className="text-slate-400 hover:text-rose-400 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                className="hidden"
                onChange={handleImageSelect}
              />
              <input
                type="file"
                ref={pdfInputRef}
                accept=".pdf"
                className="hidden"
                onChange={handlePdfSelect}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Upload Question Image"
                className="p-2.5 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 cursor-pointer"
              >
                <ImageIcon className="w-4 h-4 text-indigo-400" />
              </button>

              <button
                type="button"
                onClick={() => pdfInputRef.current?.click()}
                title="Upload Study Material PDF"
                className="p-2.5 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 cursor-pointer"
              >
                <FileText className="w-4 h-4 text-cyan-400" />
              </button>

              <button
                type="button"
                onClick={handleToggleVoice}
                title="Voice Input"
                className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
                  isListening
                    ? 'border-rose-500 bg-rose-500/20 text-rose-300 animate-pulse'
                    : 'border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300'
                }`}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-emerald-400" />}
              </button>

              <textarea
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="Ask any JEE doubt or equation..."
                rows={1}
                className="flex-1 px-3.5 py-2 rounded-xl border border-slate-800 bg-slate-900 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
              />

              <button
                type="button"
                disabled={loading || (!inputPrompt.trim() && !selectedImageBase64 && !selectedPdfBase64)}
                onClick={() => void handleSend()}
                className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white cursor-pointer shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bookmarked AI Solutions Modal */}
      {showSavedModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold font-display text-base text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-400" />
                <span>Bookmarked AI Solutions ({savedSnippets.length})</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowSavedModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {savedSnippets.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No bookmarked solutions yet. Click &quot;Bookmark&quot; on any AI answer to save it here.
              </div>
            ) : (
              <div className="space-y-3">
                {savedSnippets.map((s) => (
                  <div key={s.id} className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-2">
                    <div className="text-xs font-bold text-indigo-300">Q: {s.questionPrompt}</div>
                    <div className="text-xs text-slate-300 whitespace-pre-wrap max-h-36 overflow-y-auto p-2 rounded bg-slate-900 border border-slate-800">
                      <MathText text={s.answerContent} />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void deleteDoc(doc(db, 'aiSavedSnippets', s.id))}
                        className="text-[11px] text-rose-400 hover:text-rose-300 cursor-pointer"
                      >
                        Remove Bookmark
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
