import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CornerUpLeft,
  MessageSquare,
  Pin,
  PinOff,
  Send,
  Sigma,
  Trash2,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  deleteGroupChatMessage,
  fetchGroupChatMessages,
  getTeacherToken,
  pinGroupChatMessage,
  sendGroupChatMessage,
  type GroupChatMessage,
  type OnlineChatUser,
} from '../lib/teacherClient';
import { MathText } from './MathText';

interface StudyGroupChatBoxProps {
  groupId: string;
  groupName: string;
  subject?: string;
  role: 'TEACHER' | 'STUDENT';
  userId: string;
  userName: string;
  compact?: boolean;
  darkSurface?: boolean;
}

type ConnectionState = 'CONNECTING' | 'CONNECTED' | 'RECONNECTING';

export const StudyGroupChatBox: React.FC<StudyGroupChatBoxProps> = ({
  groupId,
  groupName,
  subject,
  role,
  userId,
  userName,
  compact = false,
  darkSurface = false,
}) => {
  const [messages, setMessages] = useState<GroupChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineChatUser[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, { userName: string; role: string }>>({});
  const [connectionState, setConnectionState] = useState<ConnectionState>('CONNECTING');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<GroupChatMessage | null>(null);
  const [showOnlineList, setShowOnlineList] = useState(false);
  const [sending, setSending] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  const upsertMessageIdempotent = (incoming: GroupChatMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === incoming.id)) return prev;
      if (incoming.clientMessageId) {
        const optIdx = prev.findIndex((m) => m.clientMessageId === incoming.clientMessageId);
        if (optIdx >= 0) {
          const next = [...prev];
          next[optIdx] = incoming;
          return next;
        }
      }
      return [...prev, incoming];
    });
  };

  useEffect(() => {
    unmountedRef.current = false;
    setLoading(true);
    setError(null);
    setMessages([]);
    setOnlineUsers([]);
    setTypingUsers({});
    reconnectAttemptRef.current = 0;

    // Initial REST fetch so history renders immediately even while WS upgrades
    fetchGroupChatMessages(groupId, role === 'STUDENT' ? userId : undefined)
      .then((initial) => {
        if (!unmountedRef.current) {
          setMessages(initial);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!unmountedRef.current) {
          setError(err instanceof Error ? err.message : 'Unable to load group chat.');
          setLoading(false);
        }
      });

    const connectWebSocket = () => {
      if (unmountedRef.current) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/group-chat`;

      setConnectionState(reconnectAttemptRef.current > 0 ? 'RECONNECTING' : 'CONNECTING');
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmountedRef.current) {
          ws.close();
          return;
        }
        reconnectAttemptRef.current = 0;
        setConnectionState('CONNECTED');
        setError(null);

        ws.send(
          JSON.stringify({
            type: 'chat:join',
            groupId,
            teacherToken: role === 'TEACHER' ? getTeacherToken() || undefined : undefined,
            studentId: role === 'STUDENT' ? userId : undefined,
            userName,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.groupId && payload.groupId !== groupId) return;

          if (payload.type === 'chat:init') {
            setMessages(Array.isArray(payload.messages) ? payload.messages : []);
            setOnlineUsers(Array.isArray(payload.onlineUsers) ? payload.onlineUsers : []);
            setLoading(false);
          } else if (payload.type === 'chat:message' && payload.message) {
            upsertMessageIdempotent(payload.message as GroupChatMessage);
          } else if (payload.type === 'chat:deleted' && payload.messageId) {
            setMessages((prev) => prev.filter((m) => m.id !== payload.messageId));
          } else if (payload.type === 'chat:pinned' && payload.messageId) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === payload.messageId ? { ...m, pinned: Boolean(payload.pinned) } : m
              )
            );
          } else if (payload.type === 'chat:presence') {
            setOnlineUsers(Array.isArray(payload.onlineUsers) ? payload.onlineUsers : []);
          } else if (payload.type === 'chat:typing' && payload.userId !== userId) {
            setTypingUsers((prev) => {
              const next = { ...prev };
              if (payload.isTyping) {
                next[payload.userId] = { userName: payload.userName, role: payload.role };
              } else {
                delete next[payload.userId];
              }
              return next;
            });
          } else if (payload.type === 'chat:error') {
            setError(payload.error || 'Chat error occurred.');
          }
        } catch {
          // Ignore malformed WS frames
        }
      };

      ws.onclose = () => {
        if (unmountedRef.current) return;
        setConnectionState('RECONNECTING');
        const delay = Math.min(10000, 1000 * Math.pow(2, reconnectAttemptRef.current));
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = setTimeout(connectWebSocket, delay);
      };

      ws.onerror = () => {
        // Error handler triggers close -> reconnect
      };
    };

    connectWebSocket();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [groupId, role, userId, userName]);

  const pinnedMessages = useMemo(() => messages.filter((m) => m.pinned), [messages]);
  const typingNames = useMemo(
    () => Object.values(typingUsers).map((u) => u.userName),
    [typingUsers]
  );

  const emitTyping = (isTyping: boolean) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'chat:typing', groupId, isTyping }));
    }
  };

  const handleDraftChange = (val: string) => {
    setDraft(val);
    emitTyping(val.trim().length > 0);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => emitTyping(false), 2000);
  };

  const handleInsertFormula = () => {
    setDraft((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}$ $`);
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanText = draft.trim();
    if (!cleanText || sending) return;

    const clientMessageId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const replyPayload = replyTo
      ? {
          id: replyTo.id,
          senderName: replyTo.senderName,
          text: replyTo.text.slice(0, 160),
        }
      : undefined;

    const optimisticMsg: GroupChatMessage = {
      id: clientMessageId,
      groupId,
      senderId: userId,
      senderName: userName,
      senderRole: role,
      text: cleanText,
      clientMessageId,
      replyTo: replyPayload,
      pinned: false,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setDraft('');
    setReplyTo(null);
    setError(null);
    emitTyping(false);

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'chat:send',
          groupId,
          text: cleanText,
          clientMessageId,
          replyTo: replyPayload,
        })
      );
      return;
    }

    // Fallback to REST if socket is mid-reconnect
    setSending(true);
    try {
      const saved = await sendGroupChatMessage({
        groupId,
        studentId: role === 'STUDENT' ? userId : undefined,
        userName,
        text: cleanText,
        clientMessageId,
        replyTo: replyPayload,
      });
      upsertMessageIdempotent(saved);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.clientMessageId !== clientMessageId));
      setDraft(cleanText);
      setError(err instanceof Error ? err.message : 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (msgId: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'chat:delete', groupId, messageId: msgId }));
      return;
    }
    try {
      await deleteGroupChatMessage({
        groupId,
        messageId: msgId,
        studentId: role === 'STUDENT' ? userId : undefined,
      });
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete message.');
    }
  };

  const handleTogglePin = async (msg: GroupChatMessage) => {
    if (role !== 'TEACHER') return;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'chat:pin',
          groupId,
          messageId: msg.id,
          pinned: !msg.pinned,
        })
      );
      return;
    }
    try {
      const updated = await pinGroupChatMessage(groupId, msg.id, !msg.pinned);
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update pin.');
    }
  };

  const containerClasses = darkSurface
    ? 'bg-slate-900 border-slate-800 text-slate-100'
    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100';

  const subtleBorder = darkSurface ? 'border-slate-800' : 'border-slate-200 dark:border-slate-800';
  const mutedText = darkSurface ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400';

  return (
    <div
      className={`flex flex-col border rounded-2xl overflow-hidden ${containerClasses} ${
        compact ? 'h-[440px]' : 'h-[560px]'
      }`}
    >
      {/* Header Bar */}
      <div className={`px-4 py-3 border-b ${subtleBorder} flex items-center justify-between gap-3`}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-indigo-500 shrink-0" />
            <h3 className="text-sm font-bold truncate">{groupName} Chat</h3>
          </div>
          <div className={`text-[11px] flex items-center gap-1.5 mt-0.5 ${mutedText}`}>
            {subject && (
              <>
                <span className="truncate">{subject}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span className="inline-flex items-center gap-1 font-medium tabular-nums">
              {connectionState === 'CONNECTED' ? (
                <>
                  <Wifi className="w-3 h-3 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">Live</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-amber-500" />
                  <span className="text-amber-600 dark:text-amber-400">
                    {connectionState === 'RECONNECTING' ? 'Reconnecting' : 'Connecting'}
                  </span>
                </>
              )}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowOnlineList((prev) => !prev)}
          className={`px-3 py-1.5 rounded-xl border ${subtleBorder} text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer`}
        >
          <Users className="w-3.5 h-3.5 text-indigo-500" />
          <span className="tabular-nums">{onlineUsers.length} online</span>
        </button>
      </div>

      {/* Expandable Active Members Drawer */}
      {showOnlineList && (
        <div
          className={`px-4 py-2.5 border-b ${subtleBorder} ${
            darkSurface ? 'bg-slate-950/60' : 'bg-slate-50 dark:bg-slate-800/40'
          } text-xs flex flex-wrap items-center gap-x-4 gap-y-1`}
        >
          <span className={`font-semibold ${mutedText}`}>Active now:</span>
          {onlineUsers.length === 0 ? (
            <span className={mutedText}>Only you</span>
          ) : (
            onlineUsers.map((u, idx) => (
              <span key={u.userId} className="font-medium">
                {u.userName}
                {u.role === 'TEACHER' ? ' (Teacher)' : ''}
                {idx < onlineUsers.length - 1 ? ',' : ''}
              </span>
            ))
          )}
        </div>
      )}

      {/* Pinned Messages Strip */}
      {pinnedMessages.length > 0 && (
        <div
          className={`px-4 py-2.5 border-b ${subtleBorder} ${
            darkSurface ? 'bg-indigo-950/30' : 'bg-indigo-50/70 dark:bg-indigo-950/30'
          } flex items-start justify-between gap-3 text-xs`}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 font-semibold text-indigo-600 dark:text-indigo-400">
              <Pin className="w-3 h-3 shrink-0" />
              <span>Pinned by {pinnedMessages[pinnedMessages.length - 1].senderName}</span>
            </div>
            <div className="mt-0.5 line-clamp-2">
              <MathText text={pinnedMessages[pinnedMessages.length - 1].text} />
            </div>
          </div>
          {role === 'TEACHER' && (
            <button
              type="button"
              onClick={() => void handleTogglePin(pinnedMessages[pinnedMessages.length - 1])}
              className={`text-[11px] font-semibold ${mutedText} hover:text-indigo-600 shrink-0 cursor-pointer`}
            >
              Unpin
            </button>
          )}
        </div>
      )}

      {/* Error Notice */}
      {error && (
        <div className="px-4 py-2 bg-rose-50 dark:bg-rose-950/40 border-b border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between gap-2">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {loading ? (
          <div className={`h-full flex items-center justify-center text-xs ${mutedText}`}>
            Loading group discussion...
          </div>
        ) : messages.length === 0 ? (
          <div className={`h-full flex flex-col items-center justify-center text-center px-4 ${mutedText}`}>
            <MessageSquare className="w-8 h-8 opacity-40 mb-2" />
            <p className="text-xs font-semibold">No messages in {groupName} yet</p>
            <p className="text-[11px] mt-1 max-w-xs">
              Start the study discussion — share doubts, key derivations, or class updates with your group.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.senderId === userId;
            const canDelete = role === 'TEACHER' || isOwn;
            const timeLabel = new Date(msg.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={msg.id}
                className={`group flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
              >
                {/* Clean unboxed metadata row */}
                <div className={`flex items-center gap-1.5 text-[11px] mb-1 px-1 ${mutedText}`}>
                  <span
                    className={`font-semibold ${
                      msg.senderRole === 'TEACHER'
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : isOwn
                          ? 'text-slate-700 dark:text-slate-200'
                          : ''
                    }`}
                  >
                    {msg.senderRole === 'TEACHER' ? `Teacher · ${msg.senderName}` : msg.senderName}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{timeLabel}</span>
                  {msg.pinned && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                        Pinned
                      </span>
                    </>
                  )}
                </div>

                <div className={`flex items-end gap-1.5 max-w-[85%] ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div
                    className={`px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed break-words ${
                      isOwn
                        ? 'bg-indigo-600 text-white'
                        : msg.senderRole === 'TEACHER'
                          ? darkSurface
                            ? 'bg-slate-800 border border-indigo-500/40 text-slate-100'
                            : 'bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-slate-900 dark:text-slate-100'
                          : darkSurface
                            ? 'bg-slate-800 text-slate-100'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {msg.replyTo && (
                      <div
                        className={`mb-2 pb-1.5 border-b text-[11px] opacity-85 ${
                          isOwn ? 'border-white/25' : 'border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        <div className="font-semibold">Replying to {msg.replyTo.senderName}</div>
                        <div className="truncate">{msg.replyTo.text}</div>
                      </div>
                    )}
                    <MathText text={msg.text} />
                  </div>

                  {/* Message Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                    <button
                      type="button"
                      onClick={() => setReplyTo(msg)}
                      title="Reply"
                      className={`p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 ${mutedText} cursor-pointer`}
                    >
                      <CornerUpLeft className="w-3.5 h-3.5" />
                    </button>
                    {role === 'TEACHER' && (
                      <button
                        type="button"
                        onClick={() => void handleTogglePin(msg)}
                        title={msg.pinned ? 'Unpin message' : 'Pin message'}
                        className={`p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 ${
                          msg.pinned ? 'text-indigo-500' : mutedText
                        } cursor-pointer`}
                      >
                        {msg.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => void handleDelete(msg.id)}
                        title="Delete message"
                        className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 text-slate-400 hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing Indicator */}
      {typingNames.length > 0 && (
        <div className={`px-4 py-1 text-[11px] ${mutedText}`}>
          {typingNames.join(', ')} {typingNames.length === 1 ? 'is' : 'are'} typing...
        </div>
      )}

      {/* Reply Quote Preview */}
      {replyTo && (
        <div
          className={`px-4 py-2 border-t ${subtleBorder} ${
            darkSurface ? 'bg-slate-950/80' : 'bg-slate-50 dark:bg-slate-800/50'
          } flex items-center justify-between gap-2 text-xs`}
        >
          <div className="min-w-0">
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">
              Replying to {replyTo.senderName}:{' '}
            </span>
            <span className={`truncate ${mutedText}`}>{replyTo.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            className={`${mutedText} hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Live KaTeX Preview when typing math */}
      {draft.includes('$') && (
        <div
          className={`px-4 py-2 border-t ${subtleBorder} ${
            darkSurface ? 'bg-slate-950' : 'bg-slate-50 dark:bg-slate-800/40'
          } text-xs`}
        >
          <span className={`text-[10px] font-semibold block mb-0.5 ${mutedText}`}>Math Preview</span>
          <MathText text={draft} />
        </div>
      )}

      {/* Message Composer */}
      <form
        onSubmit={handleSend}
        className={`p-3 border-t ${subtleBorder} flex items-end gap-2 ${
          darkSurface ? 'bg-slate-950/60' : 'bg-slate-50/70 dark:bg-slate-900'
        }`}
      >
        <button
          type="button"
          onClick={handleInsertFormula}
          title="Insert KaTeX math delimiters ($...$)"
          className={`p-2.5 rounded-xl border ${subtleBorder} ${mutedText} hover:text-indigo-600 hover:bg-white dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer`}
        >
          <Sigma className="w-4 h-4" />
        </button>

        <textarea
          rows={1}
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Message your study group (supports $LaTeX$)..."
          maxLength={2000}
          className={`flex-1 px-3.5 py-2.5 rounded-xl border ${subtleBorder} ${
            darkSurface
              ? 'bg-slate-900 text-slate-100 placeholder:text-slate-500'
              : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100'
          } text-xs sm:text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 max-h-28`}
        />

        <button
          type="submit"
          disabled={!draft.trim() || sending}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Send</span>
        </button>
      </form>
    </div>
  );
};
