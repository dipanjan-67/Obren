import type { BookmarkItem, QuestionResultItem, StudyNote, TestAttempt } from '../types/obren';

export interface QueuedOfflineAttempt {
  localId: string;
  uid: string;
  queuedAt: number;
  payload: Omit<TestAttempt, 'id' | 'createdAt'>;
  summary: {
    xpDelta: number;
    questionsSolved: number;
    correctCount: number;
    testsCompleted: number;
    studyMinutes: number;
  };
  questionResults: QuestionResultItem[];
}

const QUEUE_KEY = 'obren_offline_attempt_queue_v1';
const BOOKMARKS_CACHE_PREFIX = 'obren_cached_bookmarks_v1_';
const NOTES_CACHE_PREFIX = 'obren_cached_notes_v1_';

export function readOfflineAttemptQueue(uid?: string): QueuedOfflineAttempt[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedOfflineAttempt[];
    if (!Array.isArray(parsed)) return [];
    return uid ? parsed.filter((item) => item.uid === uid) : parsed;
  } catch {
    return [];
  }
}

export function enqueueOfflineAttempt(item: QueuedOfflineAttempt): QueuedOfflineAttempt[] {
  const existing = readOfflineAttemptQueue();
  const next = [...existing, item].slice(-25);
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota issues
  }
  return next.filter((x) => x.uid === item.uid);
}

export function removeQueuedOfflineAttempt(localId: string): void {
  const existing = readOfflineAttemptQueue();
  const next = existing.filter((x) => x.localId !== localId);
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  } catch {
    // Ignore
  }
}

export function cacheBookmarksOffline(uid: string, bookmarks: BookmarkItem[]): void {
  try {
    localStorage.setItem(`${BOOKMARKS_CACHE_PREFIX}${uid}`, JSON.stringify(bookmarks.slice(0, 120)));
  } catch {
    // Ignore quota issues
  }
}

export function getCachedBookmarksOffline(uid: string): BookmarkItem[] {
  try {
    const raw = localStorage.getItem(`${BOOKMARKS_CACHE_PREFIX}${uid}`);
    return raw ? (JSON.parse(raw) as BookmarkItem[]) : [];
  } catch {
    return [];
  }
}

export function cacheNotesOffline(uid: string, notes: StudyNote[]): void {
  try {
    localStorage.setItem(`${NOTES_CACHE_PREFIX}${uid}`, JSON.stringify(notes.slice(0, 80)));
  } catch {
    // Ignore
  }
}

export function getCachedNotesOffline(uid: string): StudyNote[] {
  try {
    const raw = localStorage.getItem(`${NOTES_CACHE_PREFIX}${uid}`);
    return raw ? (JSON.parse(raw) as StudyNote[]) : [];
  } catch {
    return [];
  }
}
