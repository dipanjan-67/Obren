import fs from 'fs';
import path from 'path';
import type http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { verifyTeacherToken } from './teacherClassService.ts';
import type { ClassGroup } from './teacherRoutes.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const GROUPS_FILE = path.join(DATA_DIR, 'class_groups.json');
const CHAT_MESSAGES_FILE = path.join(DATA_DIR, 'group_chat_messages.json');

export interface GroupChatMessage {
  id: string;
  groupId: string;
  senderId: string;
  senderName: string;
  senderRole: 'TEACHER' | 'STUDENT';
  text: string;
  clientMessageId?: string;
  replyTo?: {
    id: string;
    senderName: string;
    text: string;
  };
  pinned: boolean;
  createdAt: string;
}

export interface OnlineChatUser {
  userId: string;
  userName: string;
  role: 'TEACHER' | 'STUDENT';
}

interface RoomClient {
  ws: WebSocket;
  groupId: string;
  userId: string;
  userName: string;
  role: 'TEACHER' | 'STUDENT';
  isAlive: boolean;
}

const rooms = new Map<string, Set<RoomClient>>();

function readJsonSafe<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), 'utf-8');
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function writeJsonSafe<T>(filePath: string, data: T): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function authorizeGroupChatAccess(params: {
  groupId: string;
  teacherToken?: string;
  studentId?: string;
  userName?: string;
}): {
  authorized: boolean;
  error?: string;
  userId?: string;
  userName?: string;
  role?: 'TEACHER' | 'STUDENT';
  group?: ClassGroup;
} {
  const { groupId, teacherToken, studentId, userName } = params;
  if (!groupId) {
    return { authorized: false, error: 'groupId is required.' };
  }

  const groups = readJsonSafe<ClassGroup[]>(GROUPS_FILE, []);
  const group = groups.find((g) => g.id === groupId);
  if (!group) {
    return { authorized: false, error: 'Study group not found.' };
  }

  if (teacherToken) {
    const session = verifyTeacherToken(teacherToken);
    if (!session) {
      return { authorized: false, error: 'Invalid or expired teacher session.' };
    }
    if (group.teacherId !== session.teacherId) {
      return { authorized: false, error: 'You do not own this study group.' };
    }
    return {
      authorized: true,
      userId: session.teacherId,
      userName: session.name,
      role: 'TEACHER',
      group,
    };
  }

  if (studentId) {
    if (!group.studentIds.includes(studentId)) {
      return { authorized: false, error: 'You are not enrolled in this study group.' };
    }
    const enrolled = group.students.find((s) => s.id === studentId);
    return {
      authorized: true,
      userId: studentId,
      userName: (userName || enrolled?.name || 'Student').trim(),
      role: 'STUDENT',
      group,
    };
  }

  return { authorized: false, error: 'Authentication credentials required.' };
}

export function getGroupMessages(groupId: string): GroupChatMessage[] {
  const all = readJsonSafe<GroupChatMessage[]>(CHAT_MESSAGES_FILE, []);
  return all.filter((m) => m.groupId === groupId).slice(-250);
}

export function createGroupMessage(params: {
  groupId: string;
  senderId: string;
  senderName: string;
  senderRole: 'TEACHER' | 'STUDENT';
  text: string;
  clientMessageId?: string;
  replyTo?: { id: string; senderName: string; text: string };
}): { message: GroupChatMessage; duplicate: boolean } {
  const cleanText = String(params.text || '').trim().slice(0, 2000);
  if (!cleanText) {
    throw new Error('Message text cannot be empty.');
  }

  const all = readJsonSafe<GroupChatMessage[]>(CHAT_MESSAGES_FILE, []);

  // Idempotency guard for reconnect retries / optimistic reconciliation
  if (params.clientMessageId) {
    const existing = all.find(
      (m) =>
        m.groupId === params.groupId &&
        m.senderId === params.senderId &&
        m.clientMessageId === params.clientMessageId
    );
    if (existing) {
      return { message: existing, duplicate: true };
    }
  }

  const message: GroupChatMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    groupId: params.groupId,
    senderId: params.senderId,
    senderName: params.senderName,
    senderRole: params.senderRole,
    text: cleanText,
    clientMessageId: params.clientMessageId,
    replyTo: params.replyTo
      ? {
          id: String(params.replyTo.id).slice(0, 80),
          senderName: String(params.replyTo.senderName).slice(0, 80),
          text: String(params.replyTo.text).slice(0, 180),
        }
      : undefined,
    pinned: false,
    createdAt: new Date().toISOString(),
  };

  all.push(message);
  // Keep file bounded to most recent 5000 messages across groups
  if (all.length > 5000) {
    all.splice(0, all.length - 5000);
  }
  writeJsonSafe(CHAT_MESSAGES_FILE, all);
  return { message, duplicate: false };
}

export function deleteGroupMessage(params: {
  groupId: string;
  messageId: string;
  requesterId: string;
  requesterRole: 'TEACHER' | 'STUDENT';
}): boolean {
  const all = readJsonSafe<GroupChatMessage[]>(CHAT_MESSAGES_FILE, []);
  const idx = all.findIndex((m) => m.id === params.messageId && m.groupId === params.groupId);
  if (idx === -1) return false;

  const target = all[idx];
  if (params.requesterRole !== 'TEACHER' && target.senderId !== params.requesterId) {
    throw new Error('You can only delete your own messages.');
  }

  all.splice(idx, 1);
  writeJsonSafe(CHAT_MESSAGES_FILE, all);
  return true;
}

export function pinGroupMessage(params: {
  groupId: string;
  messageId: string;
  pinned: boolean;
}): GroupChatMessage | null {
  const all = readJsonSafe<GroupChatMessage[]>(CHAT_MESSAGES_FILE, []);
  const target = all.find((m) => m.id === params.messageId && m.groupId === params.groupId);
  if (!target) return null;
  target.pinned = Boolean(params.pinned);
  writeJsonSafe(CHAT_MESSAGES_FILE, all);
  return target;
}

function getRoomOnlineUsers(groupId: string): OnlineChatUser[] {
  const clients = rooms.get(groupId);
  if (!clients) return [];
  const seen = new Map<string, OnlineChatUser>();
  clients.forEach((c) => {
    if (c.ws.readyState === WebSocket.OPEN) {
      seen.set(c.userId, {
        userId: c.userId,
        userName: c.userName,
        role: c.role,
      });
    }
  });
  return Array.from(seen.values());
}

export function broadcastToGroupRoom(groupId: string, payload: unknown, excludeWs?: WebSocket): void {
  const clients = rooms.get(groupId);
  if (!clients) return;
  const serialized = JSON.stringify(payload);
  clients.forEach((client) => {
    if (excludeWs && client.ws === excludeWs) return;
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(serialized);
    }
  });
}

function removeClientFromCurrentRoom(client: RoomClient | null): void {
  if (!client) return;
  const set = rooms.get(client.groupId);
  if (!set) return;
  set.delete(client);
  if (set.size === 0) {
    rooms.delete(client.groupId);
  } else {
    broadcastToGroupRoom(client.groupId, {
      type: 'chat:presence',
      groupId: client.groupId,
      onlineUsers: getRoomOnlineUsers(client.groupId),
    });
  }
}

export function attachGroupChatWebSocketServer(httpServer: http.Server): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    try {
      const host = request.headers.host || 'localhost:3000';
      const url = new URL(request.url || '/', `http://${host}`);
      if (url.pathname === '/ws/group-chat') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      }
    } catch {
      socket.destroy();
    }
  });

  // Heartbeat to prune dropped sockets
  const heartbeat = setInterval(() => {
    wss.clients.forEach((socket) => {
      const tagged = socket as WebSocket & { __chatClient?: RoomClient };
      const client = tagged.__chatClient;
      if (client && !client.isAlive) {
        removeClientFromCurrentRoom(client);
        socket.terminate();
        return;
      }
      if (client) {
        client.isAlive = false;
      }
      socket.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  wss.on('connection', (ws) => {
    let activeClient: RoomClient | null = null;

    ws.on('pong', () => {
      if (activeClient) activeClient.isAlive = true;
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          groupId?: string;
          teacherToken?: string;
          studentId?: string;
          userName?: string;
          text?: string;
          clientMessageId?: string;
          replyTo?: { id: string; senderName: string; text: string };
          messageId?: string;
          pinned?: boolean;
          isTyping?: boolean;
        };

        if (msg.type === 'chat:join') {
          const auth = authorizeGroupChatAccess({
            groupId: String(msg.groupId || ''),
            teacherToken: msg.teacherToken,
            studentId: msg.studentId,
            userName: msg.userName,
          });

          if (!auth.authorized || !auth.userId || !auth.userName || !auth.role || !auth.group) {
            ws.send(JSON.stringify({ type: 'chat:error', error: auth.error || 'Access denied.' }));
            return;
          }

          if (activeClient) {
            removeClientFromCurrentRoom(activeClient);
          }

          activeClient = {
            ws,
            groupId: auth.group.id,
            userId: auth.userId,
            userName: auth.userName,
            role: auth.role,
            isAlive: true,
          };
          (ws as WebSocket & { __chatClient?: RoomClient }).__chatClient = activeClient;

          if (!rooms.has(auth.group.id)) {
            rooms.set(auth.group.id, new Set());
          }
          rooms.get(auth.group.id)!.add(activeClient);

          const messages = getGroupMessages(auth.group.id);
          const onlineUsers = getRoomOnlineUsers(auth.group.id);

          ws.send(
            JSON.stringify({
              type: 'chat:init',
              groupId: auth.group.id,
              messages,
              onlineUsers,
            })
          );

          broadcastToGroupRoom(
            auth.group.id,
            {
              type: 'chat:presence',
              groupId: auth.group.id,
              onlineUsers,
            },
            ws
          );
          return;
        }

        if (!activeClient) {
          ws.send(JSON.stringify({ type: 'chat:error', error: 'Join a study group room first.' }));
          return;
        }

        if (msg.type === 'chat:send') {
          if (msg.groupId && msg.groupId !== activeClient.groupId) {
            ws.send(JSON.stringify({ type: 'chat:error', error: 'Group mismatch.' }));
            return;
          }
          const created = createGroupMessage({
            groupId: activeClient.groupId,
            senderId: activeClient.userId,
            senderName: activeClient.userName,
            senderRole: activeClient.role,
            text: String(msg.text || ''),
            clientMessageId: msg.clientMessageId,
            replyTo: msg.replyTo,
          });
          broadcastToGroupRoom(activeClient.groupId, {
            type: 'chat:message',
            groupId: activeClient.groupId,
            message: created.message,
          });
          return;
        }

        if (msg.type === 'chat:delete' && msg.messageId) {
          const deleted = deleteGroupMessage({
            groupId: activeClient.groupId,
            messageId: msg.messageId,
            requesterId: activeClient.userId,
            requesterRole: activeClient.role,
          });
          if (deleted) {
            broadcastToGroupRoom(activeClient.groupId, {
              type: 'chat:deleted',
              groupId: activeClient.groupId,
              messageId: msg.messageId,
            });
          }
          return;
        }

        if (msg.type === 'chat:pin' && msg.messageId) {
          if (activeClient.role !== 'TEACHER') {
            ws.send(JSON.stringify({ type: 'chat:error', error: 'Only teachers can pin messages.' }));
            return;
          }
          const updated = pinGroupMessage({
            groupId: activeClient.groupId,
            messageId: msg.messageId,
            pinned: Boolean(msg.pinned),
          });
          if (updated) {
            broadcastToGroupRoom(activeClient.groupId, {
              type: 'chat:pinned',
              groupId: activeClient.groupId,
              messageId: updated.id,
              pinned: updated.pinned,
            });
          }
          return;
        }

        if (msg.type === 'chat:typing') {
          broadcastToGroupRoom(
            activeClient.groupId,
            {
              type: 'chat:typing',
              groupId: activeClient.groupId,
              userId: activeClient.userId,
              userName: activeClient.userName,
              role: activeClient.role,
              isTyping: Boolean(msg.isTyping),
            },
            ws
          );
        }
      } catch (err) {
        ws.send(
          JSON.stringify({
            type: 'chat:error',
            error: err instanceof Error ? err.message : 'Invalid chat action.',
          })
        );
      }
    });

    ws.on('close', () => {
      removeClientFromCurrentRoom(activeClient);
      activeClient = null;
    });
  });
}
