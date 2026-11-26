export type SubjectType =
  | 'Physics'
  | 'Chemistry'
  | 'Mathematics'
  | 'Biology'
  | 'Computer Science'
  | 'English'
  | 'Other';

export type SessionStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface TeacherProfile {
  id: string;
  ownerId?: string;
  name: string;
  subject: SubjectType;
  email?: string;
  phone?: string;
  locationOrLink?: string;
  avatarColor: string;
  createdAt: number;
  updatedAt?: unknown;
}

export interface TuitionSession {
  id: string;
  ownerId?: string;
  teacherId: string;
  teacherName: string;
  subject: SubjectType;
  date: string; // YYYY-MM-DD (Asia/Kolkata)
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  recurringDays: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  locationOrLink: string;
  status: SessionStatus;
  teacherCameAt?: string;
  teacherGoneAt?: string;
  teacherCameTimestamp?: number;
  teacherGoneTimestamp?: number;
  actualDurationMinutes?: number;
  googleEventId?: string;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StudyTask {
  id: string;
  title: string;
  subject: SubjectType;
  chapter?: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  targetDurationMinutes: number;
  scheduledDate: string; // YYYY-MM-DD
  completed: boolean;
  actualDurationMinutes?: number;
  createdAt: number;
}

export interface StopwatchSessionRecord {
  id: string;
  ownerId?: string;
  subject: SubjectType;
  taskId?: string;
  taskTitle?: string;
  startTime: string;
  durationSeconds: number;
  type: 'SELF_STUDY' | 'TUITION';
  date: string; // YYYY-MM-DD
  createdAt?: unknown;
}

export interface NotificationSettings {
  enabled15MinReminder: boolean;
  pushNotifications: boolean;
  reminderOffsetMinutes: number;
  soundAlert: boolean;
  speechAlert?: boolean;
}

export interface UserSettings {
  googleCalendarConnected: boolean;
  googleAccountEmail?: string;
  notifications: NotificationSettings;
}

export interface ActiveTuitionReminder {
  sessionId: string;
  teacherName: string;
  subject: SubjectType;
  startTime: string;
  locationOrLink: string;
  minutesUntilStart: number;
}
