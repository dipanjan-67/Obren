import type {
  ClassGroup,
  LiveClassRecord,
  AttendanceRecord,
  TeacherTest,
  TeacherTestQuestion,
  TeacherTestAttempt,
  StudyMaterial,
  ClassAnnouncement,
  ClassNotification,
} from '../../server/teacherRoutes';
export type { GroupChatMessage, OnlineChatUser } from '../../server/groupChatService';
import type { GroupChatMessage } from '../../server/groupChatService';

export interface TeacherUser {
  id: string;
  username: string;
  name: string;
  title: string;
  email: string;
  subject: string;
  avatarColor: string;
}

// In-memory teacher session storage
let currentTeacherToken: string | null = null;
let currentTeacher: TeacherUser | null = null;

// Allow session restore across tabs via sessionStorage (non-persistent after tab close)
const SESSION_KEY = 'obren_teacher_token';
const TEACHER_KEY = 'obren_teacher_profile';

try {
  const savedToken = sessionStorage.getItem(SESSION_KEY);
  const savedProfile = sessionStorage.getItem(TEACHER_KEY);
  if (savedToken && savedProfile) {
    currentTeacherToken = savedToken;
    currentTeacher = JSON.parse(savedProfile);
  }
} catch {
  // ignore
}

export function getTeacherToken(): string | null {
  return currentTeacherToken;
}

export function getCurrentTeacher(): TeacherUser | null {
  return currentTeacher;
}

export function setTeacherSession(token: string, teacher: TeacherUser): void {
  currentTeacherToken = token;
  currentTeacher = teacher;
  try {
    sessionStorage.setItem(SESSION_KEY, token);
    sessionStorage.setItem(TEACHER_KEY, JSON.stringify(teacher));
  } catch {
    // ignore
  }
}

export function clearTeacherSession(): void {
  currentTeacherToken = null;
  currentTeacher = null;
  try {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(TEACHER_KEY);
  } catch {
    // ignore
  }
}

// Generic authenticated fetch helper for teacher APIs
async function teacherApiFetch<T>(
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown
): Promise<T> {
  const token = getTeacherToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(endpoint, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data as T;
}

// Teacher Auth
export async function teacherLogin(username: string, password: string): Promise<TeacherUser> {
  const res = await fetch('/api/teacher/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Teacher login failed.');
  }
  setTeacherSession(data.token, data.teacher);
  return data.teacher;
}

export async function teacherChangePassword(currentPassword: string, newPassword: string): Promise<void> {
  await teacherApiFetch('/api/teacher/change-password', 'POST', { currentPassword, newPassword });
}

// Teacher Groups
export async function fetchTeacherGroups(): Promise<ClassGroup[]> {
  const data = await teacherApiFetch<{ groups: ClassGroup[] }>('/api/teacher/groups');
  return data.groups;
}

export async function createTeacherGroup(groupData: {
  name: string;
  subject: string;
  classBatch?: string;
  description?: string;
}): Promise<ClassGroup> {
  const data = await teacherApiFetch<{ group: ClassGroup }>('/api/teacher/groups/create', 'POST', groupData);
  return data.group;
}

export async function updateTeacherGroup(
  groupId: string,
  updates: { name?: string; description?: string; inviteDisabled?: boolean; regenerateKey?: boolean }
): Promise<ClassGroup> {
  const data = await teacherApiFetch<{ group: ClassGroup }>('/api/teacher/groups/update', 'POST', {
    groupId,
    ...updates,
  });
  return data.group;
}

export async function deleteTeacherGroup(groupId: string): Promise<void> {
  await teacherApiFetch('/api/teacher/groups/delete', 'POST', { groupId });
}

export async function removeStudentFromGroup(groupId: string, studentId: string): Promise<ClassGroup> {
  const data = await teacherApiFetch<{ group: ClassGroup }>('/api/teacher/groups/remove-student', 'POST', {
    groupId,
    studentId,
  });
  return data.group;
}

// Live Classes
export async function startLiveClass(
  groupId: string,
  title?: string,
  subject?: string,
  googleAccessToken?: string
): Promise<LiveClassRecord> {
  const data = await teacherApiFetch<{ liveClass: LiveClassRecord }>('/api/teacher/live-class/start', 'POST', {
    groupId,
    title,
    subject,
    googleAccessToken,
  });
  return data.liveClass;
}

export async function endLiveClass(classId: string): Promise<void> {
  await teacherApiFetch('/api/teacher/live-class/end', 'POST', { classId });
}

export async function fetchTeacherLiveClasses(): Promise<LiveClassRecord[]> {
  const data = await teacherApiFetch<{ liveClasses: LiveClassRecord[] }>('/api/teacher/live-classes');
  return data.liveClasses;
}

export async function fetchTeacherAttendance(): Promise<AttendanceRecord[]> {
  const data = await teacherApiFetch<{ attendance: AttendanceRecord[] }>('/api/teacher/attendance');
  return data.attendance;
}

// Tests
export async function fetchTeacherTests(): Promise<TeacherTest[]> {
  const data = await teacherApiFetch<{ tests: TeacherTest[] }>('/api/teacher/tests');
  return data.tests;
}

export async function createTeacherTest(testData: Partial<TeacherTest>): Promise<TeacherTest> {
  const data = await teacherApiFetch<{ test: TeacherTest }>('/api/teacher/tests/create', 'POST', testData);
  return data.test;
}

export async function updateTeacherTest(testId: string, updates: Partial<TeacherTest>): Promise<TeacherTest> {
  const data = await teacherApiFetch<{ test: TeacherTest }>('/api/teacher/tests/update', 'POST', {
    testId,
    updates,
  });
  return data.test;
}

export async function deleteTeacherTest(testId: string): Promise<void> {
  await teacherApiFetch('/api/teacher/tests/delete', 'POST', { testId });
}

export async function releaseTeacherTestResults(testId: string, release: boolean): Promise<boolean> {
  const data = await teacherApiFetch<{ resultsReleased: boolean }>(
    '/api/teacher/tests/release-results',
    'POST',
    { testId, release }
  );
  return data.resultsReleased;
}

export async function fetchTeacherTestResults(testId?: string): Promise<TeacherTestAttempt[]> {
  const url = testId ? `/api/teacher/test-results?testId=${encodeURIComponent(testId)}` : '/api/teacher/test-results';
  const data = await teacherApiFetch<{ attempts: TeacherTestAttempt[] }>(url);
  return data.attempts;
}

// Materials & Announcements
export async function fetchTeacherMaterials(): Promise<StudyMaterial[]> {
  const data = await teacherApiFetch<{ materials: StudyMaterial[] }>('/api/teacher/materials');
  return data.materials;
}

export async function addTeacherMaterial(mat: Partial<StudyMaterial>): Promise<StudyMaterial> {
  const data = await teacherApiFetch<{ material: StudyMaterial }>('/api/teacher/materials/add', 'POST', mat);
  return data.material;
}

export async function fetchTeacherAnnouncements(): Promise<ClassAnnouncement[]> {
  const data = await teacherApiFetch<{ announcements: ClassAnnouncement[] }>('/api/teacher/announcements');
  return data.announcements;
}

export async function addTeacherAnnouncement(ann: Partial<ClassAnnouncement>): Promise<ClassAnnouncement> {
  const data = await teacherApiFetch<{ announcement: ClassAnnouncement }>(
    '/api/teacher/announcements/add',
    'POST',
    ann
  );
  return data.announcement;
}

export async function updateTeacherTestScore(
  attemptId: string,
  score?: number,
  teacherFeedback?: string
): Promise<TeacherTestAttempt> {
  const data = await teacherApiFetch<{ attempt: TeacherTestAttempt }>(
    '/api/teacher/test-results/update-score',
    'POST',
    { attemptId, score, teacherFeedback }
  );
  return data.attempt;
}

export async function fetchAdminTeacherList(firebaseIdToken: string): Promise<TeacherUser[]> {
  const res = await fetch('/api/teacher/admin/list', {
    headers: { Authorization: `Bearer ${firebaseIdToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load teacher accounts.');
  return data.teachers || [];
}

export async function updateAdminTeacherCredentials(
  firebaseIdToken: string,
  payload: {
    teacherId: string;
    username?: string;
    password?: string;
    name?: string;
    subject?: string;
    title?: string;
  }
): Promise<TeacherUser> {
  const res = await fetch('/api/teacher/admin/update-credentials', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${firebaseIdToken}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update teacher credentials.');
  return data.teacher;
}

// Student APIs
export async function studentJoinGroup(
  inviteKey: string,
  studentId: string,
  studentName: string,
  studentEmail?: string
): Promise<{ success: boolean; alreadyJoined: boolean; group: ClassGroup }> {
  const res = await fetch('/api/groups/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inviteKey, studentId, studentName, studentEmail }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to join group.');
  return data;
}

export async function fetchStudentMyGroups(studentId: string): Promise<ClassGroup[]> {
  const res = await fetch(`/api/student/my-groups?studentId=${encodeURIComponent(studentId)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch student groups.');
  return data.groups || [];
}

export async function fetchStudentLiveClasses(studentId: string): Promise<LiveClassRecord[]> {
  const res = await fetch(`/api/student/live-classes?studentId=${encodeURIComponent(studentId)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch student live classes.');
  return data.liveClasses || [];
}

export async function fetchStudentGroupResources(
  studentId: string
): Promise<{ materials: StudyMaterial[]; announcements: ClassAnnouncement[] }> {
  const res = await fetch(`/api/student/group-resources?studentId=${encodeURIComponent(studentId)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch classroom resources.');
  return {
    materials: data.materials || [],
    announcements: data.announcements || [],
  };
}

export interface StudentAttemptWithDetails extends TeacherTestAttempt {
  resultsReleased?: boolean;
  questions?: TeacherTestQuestion[];
}

export async function fetchStudentTestResults(studentId: string): Promise<StudentAttemptWithDetails[]> {
  const res = await fetch(`/api/student/test-results?studentId=${encodeURIComponent(studentId)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch student test results.');
  return data.attempts || [];
}

export async function fetchStudentAssignedTests(studentId: string): Promise<TeacherTest[]> {
  const res = await fetch(`/api/student/assigned-tests?studentId=${encodeURIComponent(studentId)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch assigned tests.');
  return data.tests || [];
}

export async function startStudentExamAttempt(
  testId: string,
  studentId: string,
  studentName: string,
  studentEmail?: string
): Promise<{
  attemptId: string;
  test: TeacherTest;
  startedAt: number;
  serverExpiresAt: number;
  durationMinutes: number;
  answers: Record<string, any>;
}> {
  const res = await fetch('/api/student/tests/start-attempt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ testId, studentId, studentName, studentEmail }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to start exam.');
  return data;
}

export async function submitStudentExamAttempt(
  attemptId: string,
  answers: Record<string, any>
): Promise<{
  success: boolean;
  score: number;
  maxScore: number;
  accuracyPercent: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  resultsReleased: boolean;
  questionResults: any[] | null;
}> {
  const res = await fetch('/api/student/tests/submit-attempt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attemptId, answers }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to submit exam.');
  return data;
}

export async function recordClassroomAttendance(
  liveClassId: string,
  studentId: string,
  studentName: string,
  studentEmail?: string,
  action: 'JOIN' | 'LEAVE' = 'JOIN'
): Promise<void> {
  try {
    await fetch('/api/classroom/record-attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ liveClassId, studentId, studentName, studentEmail, action }),
    });
  } catch {
    // Non-blocking
  }
}

export async function fetchNotifications(userId: string): Promise<ClassNotification[]> {
  try {
    const res = await fetch(`/api/notifications?userId=${encodeURIComponent(userId)}`);
    const data = await res.json();
    return data.notifications || [];
  } catch {
    return [];
  }
}

export async function markNotificationRead(notificationId?: string, userId?: string, markAll = false): Promise<void> {
  try {
    await fetch('/api/notifications/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId, userId, markAll }),
    });
  } catch {
    // Non-blocking
  }
}

// Study Group Chat REST helpers
export async function fetchGroupChatMessages(
  groupId: string,
  studentId?: string
): Promise<GroupChatMessage[]> {
  const token = getTeacherToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const qs = studentId
    ? `groupId=${encodeURIComponent(groupId)}&studentId=${encodeURIComponent(studentId)}`
    : `groupId=${encodeURIComponent(groupId)}`;
  const res = await fetch(`/api/group-chat/messages?${qs}`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load chat messages.');
  return data.messages || [];
}

export async function sendGroupChatMessage(params: {
  groupId: string;
  studentId?: string;
  userName?: string;
  text: string;
  clientMessageId?: string;
  replyTo?: { id: string; senderName: string; text: string };
}): Promise<GroupChatMessage> {
  const token = getTeacherToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch('/api/group-chat/send', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to send message.');
  return data.message;
}

export async function deleteGroupChatMessage(params: {
  groupId: string;
  messageId: string;
  studentId?: string;
}): Promise<void> {
  const token = getTeacherToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch('/api/group-chat/delete', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete message.');
}

export async function pinGroupChatMessage(
  groupId: string,
  messageId: string,
  pinned: boolean
): Promise<GroupChatMessage> {
  const data = await teacherApiFetch<{ message: GroupChatMessage }>('/api/group-chat/pin', 'POST', {
    groupId,
    messageId,
    pinned,
  });
  return data.message;
}
