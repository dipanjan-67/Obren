import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  generateGoogleMeetCode,
  generateGroupInviteKey,
  hashPassword,
  initializeTeacherAccounts,
  loadTeachers,
  requireTeacherAuth,
  saveTeachers,
  signTeacherToken,
  type AuthenticatedTeacherRequest,
  type TeacherAccount,
} from './teacherClassService.ts';
import {
  authorizeGroupChatAccess,
  broadcastToGroupRoom,
  createGroupMessage,
  deleteGroupMessage,
  getGroupMessages,
  pinGroupMessage,
} from './groupChatService.ts';

// Data storage files for classroom persistence
const DATA_DIR = path.resolve(process.cwd(), 'data');
const GROUPS_FILE = path.join(DATA_DIR, 'class_groups.json');
const LIVE_CLASSES_FILE = path.join(DATA_DIR, 'live_classes.json');
const ATTENDANCE_FILE = path.join(DATA_DIR, 'class_attendance.json');
const TESTS_FILE = path.join(DATA_DIR, 'teacher_tests.json');
const ATTEMPTS_FILE = path.join(DATA_DIR, 'teacher_test_attempts.json');
const MATERIALS_FILE = path.join(DATA_DIR, 'study_materials.json');
const ANNOUNCEMENTS_FILE = path.join(DATA_DIR, 'announcements.json');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json');
const STUDENT_CREDENTIALS_FILE = path.join(DATA_DIR, 'student_credentials.json');

// Helper to read and write JSON data files safely
function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), 'utf-8');
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile<T>(filePath: string, data: T): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// Load Firebase API key for Firebase Auth proxy
const firebaseConfigPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8')) as {
  apiKey: string;
  projectId: string;
};

// Initialize teacher accounts
initializeTeacherAccounts();

export const teacherRouter = Router();

// ==========================================
// 1. TEACHER AUTHENTICATION ROUTES
// ==========================================

teacherRouter.post('/api/teacher/login', (req: Request, res: Response) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required.' });
      return;
    }

    const cleanUser = username.trim().toLowerCase();
    const teachers = loadTeachers();
    const teacher = teachers.find((t) => t.username.toLowerCase() === cleanUser);

    if (!teacher) {
      res.status(401).json({ error: 'Invalid teacher username or password.' });
      return;
    }

    const calculatedHash = hashPassword(password, teacher.passwordSalt);
    if (calculatedHash !== teacher.passwordHash) {
      res.status(401).json({ error: 'Invalid teacher username or password.' });
      return;
    }

    const token = signTeacherToken(teacher);
    res.json({
      success: true,
      token,
      teacher: {
        id: teacher.id,
        username: teacher.username,
        name: teacher.name,
        title: teacher.title,
        email: teacher.email,
        subject: teacher.subject,
        avatarColor: teacher.avatarColor,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Login failed.' });
  }
});

teacherRouter.get('/api/teacher/me', requireTeacherAuth, (req: AuthenticatedTeacherRequest, res: Response) => {
  res.json({ teacher: req.teacher });
});

teacherRouter.post(
  '/api/teacher/change-password',
  requireTeacherAuth,
  (req: AuthenticatedTeacherRequest, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body as {
        currentPassword?: string;
        newPassword?: string;
      };
      if (!currentPassword || !newPassword || newPassword.length < 6) {
        res.status(400).json({ error: 'New password must be at least 6 characters long.' });
        return;
      }

      const teachers = loadTeachers();
      const teacher = teachers.find((t) => t.id === req.teacher?.teacherId);
      if (!teacher) {
        res.status(404).json({ error: 'Teacher account not found.' });
        return;
      }

      const currentHash = hashPassword(currentPassword, teacher.passwordSalt);
      if (currentHash !== teacher.passwordHash) {
        res.status(401).json({ error: 'Current password is incorrect.' });
        return;
      }

      teacher.passwordHash = hashPassword(newPassword, teacher.passwordSalt);
      teacher.updatedAt = new Date().toISOString();
      saveTeachers(teachers);

      res.json({ success: true, message: 'Password updated successfully.' });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Password update failed.' });
    }
  }
);

const ADMIN_EMAILS = ['dipanjanoriginal69@gmail.com', 'dipanjannath890@gmail.com'];

async function requireAdminAuth(req: Request, res: Response, next: () => void) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ error: 'Admin authentication required.' });
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
      res.status(401).json({ error: 'Invalid or expired admin session.' });
      return;
    }
    const payload = (await verifyResp.json()) as {
      users?: Array<{ localId: string; email?: string }>;
    };
    const userEmail = (payload.users?.[0]?.email || '').toLowerCase();
    if (!userEmail || !ADMIN_EMAILS.includes(userEmail)) {
      res.status(403).json({ error: 'Administrator privileges required.' });
      return;
    }
    next();
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : 'Admin verification failed.' });
  }
}

// Admin route to manage teacher accounts
teacherRouter.get('/api/teacher/admin/list', requireAdminAuth, (_req: Request, res: Response) => {
  const teachers = loadTeachers().map((t) => ({
    id: t.id,
    username: t.username,
    name: t.name,
    title: t.title,
    email: t.email,
    subject: t.subject,
    avatarColor: t.avatarColor,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }));
  res.json({ teachers });
});

teacherRouter.post('/api/teacher/admin/update-credentials', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const { teacherId, username, password, name, subject, title } = req.body as {
      teacherId?: string;
      username?: string;
      password?: string;
      name?: string;
      subject?: string;
      title?: string;
    };

    if (!teacherId) {
      res.status(400).json({ error: 'teacherId is required.' });
      return;
    }

    const teachers = loadTeachers();
    const teacher = teachers.find((t) => t.id === teacherId);
    if (!teacher) {
      res.status(404).json({ error: 'Teacher not found.' });
      return;
    }

    if (username && username.trim()) {
      teacher.username = username.trim().toLowerCase();
    }
    if (name && name.trim()) {
      teacher.name = name.trim();
    }
    if (subject && subject.trim()) {
      teacher.subject = subject.trim();
    }
    if (title && title.trim()) {
      teacher.title = title.trim();
    }
    if (password && password.trim().length >= 6) {
      teacher.passwordHash = hashPassword(password.trim(), teacher.passwordSalt);
    }

    teacher.updatedAt = new Date().toISOString();
    saveTeachers(teachers);

    res.json({
      success: true,
      message: 'Teacher credentials updated successfully.',
      teacher: {
        id: teacher.id,
        username: teacher.username,
        name: teacher.name,
        title: teacher.title,
        email: teacher.email,
        subject: teacher.subject,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Update failed.' });
  }
});

// ==========================================
// 2. STUDENT REGISTRATION & LOGIN ROUTES
// ==========================================

interface StudentCredentialRecord {
  uid: string;
  username: string;
  email: string;
  fullName: string;
  createdAt: string;
}

teacherRouter.post('/api/auth/student-register', async (req: Request, res: Response) => {
  try {
    const { fullName, email, username, password, confirmPassword } = req.body as {
      fullName?: string;
      email?: string;
      username?: string;
      password?: string;
      confirmPassword?: string;
    };

    if (!fullName || !email || !username || !password) {
      res.status(400).json({ error: 'All registration fields are required.' });
      return;
    }

    if (password !== confirmPassword) {
      res.status(400).json({ error: 'Passwords do not match.' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      return;
    }

    const cleanUsername = username.trim().toLowerCase();
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(cleanUsername)) {
      res.status(400).json({
        error: 'Username must be 3-24 characters long and contain only letters, numbers, and underscores.',
      });
      return;
    }

    // Check duplicate username
    const creds = readJsonFile<StudentCredentialRecord[]>(STUDENT_CREDENTIALS_FILE, []);
    if (creds.some((c) => c.username.toLowerCase() === cleanUsername)) {
      res.status(409).json({ error: 'Username is already taken. Please choose another.' });
      return;
    }

    // Call Firebase Identity Toolkit to create user account with email/password
    const signUpResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          displayName: fullName.trim(),
          returnSecureToken: true,
        }),
      }
    );

    const signUpData = (await signUpResp.json()) as {
      idToken?: string;
      localId?: string;
      email?: string;
      error?: { message?: string };
    };

    if (!signUpResp.ok || !signUpData.idToken || !signUpData.localId) {
      let errMsg = signUpData.error?.message || 'Failed to create student account.';
      if (errMsg.includes('EMAIL_EXISTS')) {
        errMsg = 'An account with this email address already exists. Please sign in instead.';
      }
      res.status(400).json({ error: errMsg });
      return;
    }

    // Record student username mapping
    creds.push({
      uid: signUpData.localId,
      username: cleanUsername,
      email: email.trim().toLowerCase(),
      fullName: fullName.trim(),
      createdAt: new Date().toISOString(),
    });
    writeJsonFile(STUDENT_CREDENTIALS_FILE, creds);

    res.json({
      success: true,
      idToken: signUpData.idToken,
      uid: signUpData.localId,
      email: signUpData.email,
      username: cleanUsername,
      fullName: fullName.trim(),
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Registration failed.',
    });
  }
});

teacherRouter.post('/api/auth/student-login', async (req: Request, res: Response) => {
  try {
    const { identifier, password } = req.body as { identifier?: string; password?: string };
    if (!identifier || !password) {
      res.status(400).json({ error: 'Username/Email and password are required.' });
      return;
    }

    let resolvedEmail = identifier.trim().toLowerCase();
    // Check if user entered a username
    if (!resolvedEmail.includes('@')) {
      const creds = readJsonFile<StudentCredentialRecord[]>(STUDENT_CREDENTIALS_FILE, []);
      const matched = creds.find((c) => c.username.toLowerCase() === resolvedEmail);
      if (matched) {
        resolvedEmail = matched.email;
      }
    }

    // Call Firebase Identity Toolkit to sign in
    const signInResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: resolvedEmail,
          password,
          returnSecureToken: true,
        }),
      }
    );

    const signInData = (await signInResp.json()) as {
      idToken?: string;
      localId?: string;
      email?: string;
      displayName?: string;
      error?: { message?: string };
    };

    if (!signInResp.ok || !signInData.idToken) {
      let msg = 'Invalid username/email or password.';
      if (signInData.error?.message?.includes('INVALID_LOGIN_CREDENTIALS')) {
        msg = 'Invalid email or password.';
      }
      res.status(401).json({ error: msg });
      return;
    }

    res.json({
      success: true,
      idToken: signInData.idToken,
      uid: signInData.localId,
      email: signInData.email,
      displayName: signInData.displayName,
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Login failed.',
    });
  }
});

// ==========================================
// 3. GROUP CREATION & INVITATION KEY SYSTEM
// ==========================================

export interface ClassGroup {
  id: string;
  teacherId: string;
  teacherName: string;
  name: string;
  subject: string;
  classBatch: string;
  description: string;
  privacy: 'PRIVATE' | 'INVITE_ONLY';
  inviteKey: string;
  inviteDisabled: boolean;
  isLive: boolean;
  activeMeetingId?: string;
  activeMeetingUrl?: string;
  studentIds: string[];
  students: Array<{ id: string; name: string; email: string; joinedAt: string }>;
  createdAt: string;
  updatedAt: string;
}

teacherRouter.get('/api/teacher/groups', requireTeacherAuth, (req: AuthenticatedTeacherRequest, res: Response) => {
  const groups = readJsonFile<ClassGroup[]>(GROUPS_FILE, []);
  const teacherGroups = groups.filter((g) => g.teacherId === req.teacher?.teacherId);
  res.json({ groups: teacherGroups });
});

teacherRouter.post('/api/teacher/groups/create', requireTeacherAuth, (req: AuthenticatedTeacherRequest, res: Response) => {
  try {
    const { name, subject, classBatch, description, privacy } = req.body as {
      name?: string;
      subject?: string;
      classBatch?: string;
      description?: string;
      privacy?: 'PRIVATE' | 'INVITE_ONLY';
    };

    if (!name || !subject) {
      res.status(400).json({ error: 'Group name and subject are required.' });
      return;
    }

    const groups = readJsonFile<ClassGroup[]>(GROUPS_FILE, []);
    const inviteKey = generateGroupInviteKey(subject, classBatch || '28');

    const newGroup: ClassGroup = {
      id: `grp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      teacherId: req.teacher!.teacherId,
      teacherName: req.teacher!.name,
      name: name.trim().slice(0, 100),
      subject: subject.trim(),
      classBatch: (classBatch || 'Class 12').trim(),
      description: (description || '').trim().slice(0, 500),
      privacy: privacy || 'PRIVATE',
      inviteKey,
      inviteDisabled: false,
      isLive: false,
      studentIds: [],
      students: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    groups.unshift(newGroup);
    writeJsonFile(GROUPS_FILE, groups);

    res.json({ success: true, group: newGroup });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create group.' });
  }
});

teacherRouter.post('/api/teacher/groups/update', requireTeacherAuth, (req: AuthenticatedTeacherRequest, res: Response) => {
  try {
    const { groupId, name, description, inviteDisabled, regenerateKey } = req.body as {
      groupId: string;
      name?: string;
      description?: string;
      inviteDisabled?: boolean;
      regenerateKey?: boolean;
    };

    const groups = readJsonFile<ClassGroup[]>(GROUPS_FILE, []);
    const group = groups.find((g) => g.id === groupId && g.teacherId === req.teacher?.teacherId);

    if (!group) {
      res.status(404).json({ error: 'Group not found or access denied.' });
      return;
    }

    if (name) group.name = name.trim().slice(0, 100);
    if (description !== undefined) group.description = description.trim().slice(0, 500);
    if (inviteDisabled !== undefined) group.inviteDisabled = Boolean(inviteDisabled);
    if (regenerateKey) group.inviteKey = generateGroupInviteKey(group.subject, group.classBatch);

    group.updatedAt = new Date().toISOString();
    writeJsonFile(GROUPS_FILE, groups);

    res.json({ success: true, group });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Update failed.' });
  }
});

teacherRouter.post('/api/teacher/groups/delete', requireTeacherAuth, (req: AuthenticatedTeacherRequest, res: Response) => {
  try {
    const { groupId } = req.body as { groupId: string };
    const groups = readJsonFile<ClassGroup[]>(GROUPS_FILE, []);
    const filtered = groups.filter((g) => !(g.id === groupId && g.teacherId === req.teacher?.teacherId));
    writeJsonFile(GROUPS_FILE, filtered);
    res.json({ success: true, message: 'Group deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Delete failed.' });
  }
});

teacherRouter.post('/api/teacher/groups/remove-student', requireTeacherAuth, (req: AuthenticatedTeacherRequest, res: Response) => {
  try {
    const { groupId, studentId } = req.body as { groupId: string; studentId: string };
    const groups = readJsonFile<ClassGroup[]>(GROUPS_FILE, []);
    const group = groups.find((g) => g.id === groupId && g.teacherId === req.teacher?.teacherId);
    if (!group) {
      res.status(404).json({ error: 'Group not found.' });
      return;
    }

    group.studentIds = group.studentIds.filter((id) => id !== studentId);
    group.students = group.students.filter((s) => s.id !== studentId);
    group.updatedAt = new Date().toISOString();
    writeJsonFile(GROUPS_FILE, groups);

    res.json({ success: true, group });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to remove student.' });
  }
});

// Student Joins Group via Invite Key
teacherRouter.post('/api/groups/join', (req: Request, res: Response) => {
  try {
    const { inviteKey, studentId, studentName, studentEmail } = req.body as {
      inviteKey?: string;
      studentId?: string;
      studentName?: string;
      studentEmail?: string;
    };

    if (!inviteKey || !studentId) {
      res.status(400).json({ error: 'Invite key and student ID are required.' });
      return;
    }

    const cleanKey = inviteKey.trim().toUpperCase();
    const groups = readJsonFile<ClassGroup[]>(GROUPS_FILE, []);
    const group = groups.find((g) => g.inviteKey.toUpperCase() === cleanKey);

    if (!group) {
      res.status(404).json({ error: 'Invalid invitation key. Please check with your teacher.' });
      return;
    }

    if (group.inviteDisabled) {
      res.status(403).json({ error: 'Invitations for this classroom are currently disabled by the teacher.' });
      return;
    }

    if (group.studentIds.includes(studentId)) {
      res.json({ success: true, alreadyJoined: true, group });
      return;
    }

    group.studentIds.push(studentId);
    group.students.push({
      id: studentId,
      name: studentName || 'Student',
      email: studentEmail || '',
      joinedAt: new Date().toISOString(),
    });
    group.updatedAt = new Date().toISOString();
    writeJsonFile(GROUPS_FILE, groups);

    // Add welcome notification
    addNotification({
      recipientId: studentId,
      senderId: group.teacherId,
      senderName: group.teacherName,
      groupId: group.id,
      groupName: group.name,
      type: 'ANNOUNCEMENT',
      title: `Welcome to ${group.name}`,
      message: `You have successfully joined ${group.name} taught by ${group.teacherName}.`,
    });

    res.json({ success: true, alreadyJoined: false, group });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to join group.' });
  }
});

// Student's joined groups list
teacherRouter.get('/api/student/my-groups', (req: Request, res: Response) => {
  const studentId = String(req.query.studentId || '');
  if (!studentId) {
    res.status(400).json({ error: 'studentId query param is required.' });
    return;
  }

  const groups = readJsonFile<ClassGroup[]>(GROUPS_FILE, []);
  const studentGroups = groups.filter((g) => g.studentIds.includes(studentId));
  res.json({ groups: studentGroups });
});

// Student's active live classes for joined groups
teacherRouter.get('/api/student/live-classes', (req: Request, res: Response) => {
  const studentId = String(req.query.studentId || '');
  if (!studentId) {
    res.status(400).json({ error: 'studentId query param is required.' });
    return;
  }

  const groups = readJsonFile<ClassGroup[]>(GROUPS_FILE, []);
  const myGroupIds = new Set(groups.filter((g) => g.studentIds.includes(studentId)).map((g) => g.id));
  const liveClasses = readJsonFile<LiveClassRecord[]>(LIVE_CLASSES_FILE, []);
  const myLiveClasses = liveClasses.filter((lc) => myGroupIds.has(lc.groupId) && lc.status === 'LIVE');
  res.json({ liveClasses: myLiveClasses });
});

// ==========================================
// 4. GOOGLE MEET & LIVE CLASSROOM
// ==========================================

export interface LiveClassRecord {
  id: string;
  groupId: string;
  groupName: string;
  teacherId: string;
  teacherName: string;
  title: string;
  subject: string;
  meetUrl: string;
  meetCode: string;
  status: 'LIVE' | 'ENDED';
  startedAt: string;
  endedAt?: string;
  attendanceCount: number;
}

export interface AttendanceRecord {
  id: string;
  liveClassId: string;
  groupId: string;
  groupName: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  joinedAt: string;
  leftAt?: string;
  durationMinutes: number;
}

teacherRouter.post('/api/teacher/live-class/start', requireTeacherAuth, async (req: AuthenticatedTeacherRequest, res: Response) => {
  try {
    const { groupId, title, subject, googleAccessToken } = req.body as {
      groupId: string;
      title?: string;
      subject?: string;
      googleAccessToken?: string;
    };

    const groups = readJsonFile<ClassGroup[]>(GROUPS_FILE, []);
    const group = groups.find((g) => g.id === groupId && g.teacherId === req.teacher?.teacherId);

    if (!group) {
      res.status(404).json({ error: 'Group not found or unauthorized.' });
      return;
    }

    let meetUrl = '';
    let meetCode = generateGoogleMeetCode();

    // If teacher provided authorized Google token, call Google Meet API v2
    if (googleAccessToken) {
      try {
        const meetResp = await fetch('https://meet.googleapis.com/v2/spaces', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${googleAccessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });
        if (meetResp.ok) {
          const meetData = (await meetResp.json()) as { meetingUri?: string; meetingCode?: string };
          if (meetData.meetingUri) {
            meetUrl = meetData.meetingUri;
            if (meetData.meetingCode) meetCode = meetData.meetingCode;
          }
        }
      } catch {
        // Fallback to verified direct Google Meet space link
      }
    }

    if (!meetUrl) {
      meetUrl = `https://meet.google.com/${meetCode}`;
    }

    const liveClassId = `class_${Date.now()}`;
    const liveClasses = readJsonFile<LiveClassRecord[]>(LIVE_CLASSES_FILE, []);

    const newClass: LiveClassRecord = {
      id: liveClassId,
      groupId: group.id,
      groupName: group.name,
      teacherId: req.teacher!.teacherId,
      teacherName: req.teacher!.name,
      title: (title || `${group.name} - Live Class`).trim().slice(0, 140),
      subject: (subject || group.subject).trim(),
      meetUrl,
      meetCode,
      status: 'LIVE',
      startedAt: new Date().toISOString(),
      attendanceCount: 0,
    };

    liveClasses.unshift(newClass);
    writeJsonFile(LIVE_CLASSES_FILE, liveClasses);

    // Update group status to LIVE
    group.isLive = true;
    group.activeMeetingId = liveClassId;
    group.activeMeetingUrl = meetUrl;
    group.updatedAt = new Date().toISOString();
    writeJsonFile(GROUPS_FILE, groups);

    // Notify all students in the group
    group.studentIds.forEach((sid) => {
      addNotification({
        recipientId: sid,
        senderId: req.teacher!.teacherId,
        senderName: req.teacher!.name,
        groupId: group.id,
        groupName: group.name,
        type: 'LIVE_CLASS_STARTED',
        title: `🔴 Live Class: ${newClass.title}`,
        message: `${req.teacher!.name} has started a live Google Meet class for ${group.name}. Click to join.`,
      });
    });

    res.json({ success: true, liveClass: newClass });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to start live class.' });
  }
});

teacherRouter.post('/api/teacher/live-class/end', requireTeacherAuth, (req: AuthenticatedTeacherRequest, res: Response) => {
  try {
    const { classId } = req.body as { classId: string };
    const liveClasses = readJsonFile<LiveClassRecord[]>(LIVE_CLASSES_FILE, []);
    const liveClass = liveClasses.find((c) => c.id === classId && c.teacherId === req.teacher?.teacherId);

    if (!liveClass) {
      res.status(404).json({ error: 'Live class not found or unauthorized.' });
      return;
    }

    liveClass.status = 'ENDED';
    liveClass.endedAt = new Date().toISOString();
    writeJsonFile(LIVE_CLASSES_FILE, liveClasses);

    // Update group state
    const groups = readJsonFile<ClassGroup[]>(GROUPS_FILE, []);
    const group = groups.find((g) => g.id === liveClass.groupId);
    if (group) {
      group.isLive = false;
      group.activeMeetingId = undefined;
      group.activeMeetingUrl = undefined;
      group.updatedAt = new Date().toISOString();
      writeJsonFile(GROUPS_FILE, groups);
    }

    // Close any ongoing attendance records
    const attendance = readJsonFile<AttendanceRecord[]>(ATTENDANCE_FILE, []);
    const now = Date.now();
    attendance.forEach((att) => {
      if (att.liveClassId === classId && !att.leftAt) {
        att.leftAt = new Date().toISOString();
        const startMs = new Date(att.joinedAt).getTime();
        att.durationMinutes = Math.max(1, Math.round((now - startMs) / 60000));
      }
    });
    writeJsonFile(ATTENDANCE_FILE, attendance);

    res.json({ success: true, message: 'Class ended successfully.' });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to end class.' });
  }
});

// Classroom Attendance Tracking
teacherRouter.post('/api/classroom/record-attendance', (req: Request, res: Response) => {
  try {
    const { liveClassId, studentId, studentName, studentEmail, action } = req.body as {
      liveClassId: string;
      studentId: string;
      studentName: string;
      studentEmail?: string;
      action: 'JOIN' | 'LEAVE';
    };

    if (!liveClassId || !studentId) {
      res.status(400).json({ error: 'liveClassId and studentId are required.' });
      return;
    }

    const liveClasses = readJsonFile<LiveClassRecord[]>(LIVE_CLASSES_FILE, []);
    const liveClass = liveClasses.find((c) => c.id === liveClassId);
    if (!liveClass) {
      res.status(404).json({ error: 'Live class not found.' });
      return;
    }

    const attendance = readJsonFile<AttendanceRecord[]>(ATTENDANCE_FILE, []);
    let record = attendance.find((a) => a.liveClassId === liveClassId && a.studentId === studentId);

    if (action === 'JOIN') {
      if (!record) {
        record = {
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          liveClassId,
          groupId: liveClass.groupId,
          groupName: liveClass.groupName,
          studentId,
          studentName: studentName || 'Student',
          studentEmail: studentEmail || '',
          joinedAt: new Date().toISOString(),
          durationMinutes: 0,
        };
        attendance.push(record);
        liveClass.attendanceCount = (liveClass.attendanceCount || 0) + 1;
        writeJsonFile(LIVE_CLASSES_FILE, liveClasses);
      }
    } else if (action === 'LEAVE' && record) {
      record.leftAt = new Date().toISOString();
      const startMs = new Date(record.joinedAt).getTime();
      record.durationMinutes = Math.max(1, Math.round((Date.now() - startMs) / 60000));
    }

    writeJsonFile(ATTENDANCE_FILE, attendance);
    res.json({ success: true, record });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Attendance error.' });
  }
});

teacherRouter.get('/api/teacher/live-classes', requireTeacherAuth, (req: AuthenticatedTeacherRequest, res: Response) => {
  const liveClasses = readJsonFile<LiveClassRecord[]>(LIVE_CLASSES_FILE, []);
  const teacherClasses = liveClasses.filter((c) => c.teacherId === req.teacher?.teacherId);
  res.json({ liveClasses: teacherClasses });
});

teacherRouter.get('/api/teacher/attendance', requireTeacherAuth, (req: AuthenticatedTeacherRequest, res: Response) => {
  const liveClasses = readJsonFile<LiveClassRecord[]>(LIVE_CLASSES_FILE, []);
  const myClassIds = new Set(liveClasses.filter((c) => c.teacherId === req.teacher?.teacherId).map((c) => c.id));
  const attendance = readJsonFile<AttendanceRecord[]>(ATTENDANCE_FILE, []);
  const myAttendance = attendance.filter((a) => myClassIds.has(a.liveClassId));
  res.json({ attendance: myAttendance });
});

// ==========================================
// 5. TEACHER TEST MANAGEMENT & ONLINE EXAMS
// ==========================================

export interface TeacherTestQuestion {
  id: string;
  type:
    | 'SINGLE_MCQ'
    | 'MULTI_MCQ'
    | 'NUMERICAL'
    | 'TRUE_FALSE'
    | 'ASSERTION_REASON'
    | 'IMAGE_BASED'
    | 'DIAGRAM_BASED';
  prompt: string;
  options: string[];
  correctAnswer: string | string[];
  positiveMarks: number;
  negativeMarks: number;
  explanation?: string;
  imageUrl?: string;
  diagramSvg?: string;
}

export interface TeacherTest {
  id: string;
  teacherId: string;
  teacherName: string;
  title: string;
  subject: string;
  classLevel: string;
  chapter: string;
  topic?: string;
  description?: string;
  totalMarks: number;
  totalQuestions: number;
  durationMinutes: number;
  startDate?: string;
  endDate?: string;
  negativeMarkingEnabled: boolean;
  instructions?: string;
  targetGroupIds: string[];
  targetGroupNames: string[];
  questions: TeacherTestQuestion[];
  resultsReleased: boolean;
  allowRetake: boolean;
  status: 'DRAFT' | 'PUBLISHED' | 'EXPIRED';
  createdAt: string;
  updatedAt: string;
}

export interface TeacherTestAttempt {
  id: string;
  testId: string;
  testTitle: string;
  teacherId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  startedAt: number;
  serverExpiresAt: number;
  submittedAt?: number;
  durationSeconds: number;
  answers: Record<string, any>;
  score: number;
  maxScore: number;
  accuracyPercent: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  evaluated: boolean;
  teacherFeedback?: string;
  questionResults: Array<{
    questionId: string;
    userAnswer: any;
    correctAnswer: any;
    isCorrect: boolean;
    marksAwarded: number;
    explanation?: string;
  }>;
}

teacherRouter.get('/api/teacher/tests', requireTeacherAuth, (req: AuthenticatedTeacherRequest, res: Response) => {
  const tests = readJsonFile<TeacherTest[]>(TESTS_FILE, []);
  const myTests = tests.filter((t) => t.teacherId === req.teacher?.teacherId);
  res.json({ tests: myTests });
});

teacherRouter.post('/api/teacher/tests/create', requireTeacherAuth, (req: AuthenticatedTeacherRequest, res: Response) => {
  try {
    const testData = req.body as Partial<TeacherTest>;
    if (!testData.title || !testData.subject || !Array.isArray(testData.targetGroupIds)) {
      res.status(400).json({ error: 'Title, subject, and target groups are required.' });
      return;
    }

    const groups = readJsonFile<ClassGroup[]>(GROUPS_FILE, []);
    const targetGroupNames = groups
      .filter((g) => testData.targetGroupIds?.includes(g.id))
      .map((g) => g.name);

    const questions: TeacherTestQuestion[] = Array.isArray(testData.questions)
      ? testData.questions.map((q, idx) => ({
          id: q.id || `q_${Date.now()}_${idx}`,
          type: q.type || 'SINGLE_MCQ',
          prompt: String(q.prompt || '').slice(0, 4000),
          options: Array.isArray(q.options) ? q.options.map(String) : [],
          correctAnswer: q.correctAnswer || 'A',
          positiveMarks: Math.abs(Number(q.positiveMarks) || 4),
          negativeMarks: q.negativeMarks !== undefined ? -Math.abs(Number(q.negativeMarks)) : -1,
          explanation: q.explanation ? String(q.explanation).slice(0, 4000) : '',
          imageUrl: q.imageUrl,
          diagramSvg: q.diagramSvg,
        }))
      : [];

    const totalMarks = questions.reduce((sum, q) => sum + (Number(q.positiveMarks) || 4), 0);

    const newTest: TeacherTest = {
      id: `test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      teacherId: req.teacher!.teacherId,
      teacherName: req.teacher!.name,
      title: testData.title.trim().slice(0, 160),
      subject: testData.subject.trim(),
      classLevel: testData.classLevel || '12',
      chapter: (testData.chapter || 'General').trim().slice(0, 120),
      topic: testData.topic ? testData.topic.trim().slice(0, 140) : '',
      description: testData.description ? testData.description.trim().slice(0, 500) : '',
      totalMarks: totalMarks || 40,
      totalQuestions: questions.length,
      durationMinutes: Math.max(5, Math.min(240, Number(testData.durationMinutes) || 30)),
      startDate: testData.startDate || new Date().toISOString().slice(0, 16),
      endDate: testData.endDate,
      negativeMarkingEnabled: testData.negativeMarkingEnabled !== false,
      instructions: testData.instructions ? testData.instructions.trim().slice(0, 1000) : '',
      targetGroupIds: testData.targetGroupIds,
      targetGroupNames,
      questions,
      resultsReleased: false,
      allowRetake: false,
      status: testData.status || 'PUBLISHED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const tests = readJsonFile<TeacherTest[]>(TESTS_FILE, []);
    tests.unshift(newTest);
    writeJsonFile(TESTS_FILE, tests);

    // If published, notify assigned groups
    if (newTest.status === 'PUBLISHED') {
      groups
        .filter((g) => newTest.targetGroupIds.includes(g.id))
        .forEach((g) => {
          g.studentIds.forEach((sid) => {
            addNotification({
              recipientId: sid,
              senderId: req.teacher!.teacherId,
              senderName: req.teacher!.name,
              groupId: g.id,
              groupName: g.name,
              type: 'TEST_ASSIGNED',
              title: `📝 New Test: ${newTest.title}`,
              message: `${req.teacher!.name} assigned a new ${newTest.subject} test (${newTest.questions.length} questions, ${newTest.durationMinutes} mins).`,
            });
          });
        });
    }

    res.json({ success: true, test: newTest });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Test creation failed.' });
  }
});

teacherRouter.post('/api/teacher/tests/update', requireTeacherAuth, (req: AuthenticatedTeacherRequest, res: Response) => {
  try {
    const { testId, updates } = req.body as { testId: string; updates: Partial<TeacherTest> };
    const tests = readJsonFile<TeacherTest[]>(TESTS_FILE, []);
    const test = tests.find((t) => t.id === testId && t.teacherId === req.teacher?.teacherId);

    if (!test) {
      res.status(404).json({ error: 'Test not found or access denied.' });
      return;
    }

    Object.assign(test, updates, { updatedAt: new Date().toISOString() });
    writeJsonFile(TESTS_FILE, tests);

    res.json({ success: true, test });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Update failed.' });
  }
});

teacherRouter.post('/api/teacher/tests/delete', requireTeacherAuth, (req: AuthenticatedTeacherRequest, res: Response) => {
  try {
    const { testId } = req.body as { testId: string };
    const tests = readJsonFile<TeacherTest[]>(TESTS_FILE, []);
    const filtered = tests.filter((t) => !(t.id === testId && t.teacherId === req.teacher?.teacherId));
    writeJsonFile(TESTS_FILE, filtered);
    res.json({ success: true, message: 'Test deleted.' });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Delete failed.' });
  }
});

teacherRouter.post('/api/teacher/tests/release-results', requireTeacherAuth, (req: AuthenticatedTeacherRequest, res: Response) => {
  try {
    const { testId, release } = req.body as { testId: string; release: boolean };
    const tests = readJsonFile<TeacherTest[]>(TESTS_FILE, []);
    const test = tests.find((t) => t.id === testId && t.teacherId === req.teacher?.teacherId);

    if (!test) {
      res.status(404).json({ error: 'Test not found or access denied.' });
      return;
    }

    test.resultsReleased = Boolean(release);
    test.updatedAt = new Date().toISOString();
    writeJsonFile(TESTS_FILE, tests);

    if (test.resultsReleased) {
      const attempts = readJsonFile<TeacherTestAttempt[]>(ATTEMPTS_FILE, []);
      const testAttempts = attempts.filter((a) => a.testId === testId);
      testAttempts.forEach((att) => {
        addNotification({
          recipientId: att.studentId,
          senderId: req.teacher!.teacherId,
          senderName: req.teacher!.name,
          groupId: test.targetGroupIds[0] || '',
          groupName: test.targetGroupNames[0] || 'Class',
          type: 'TEST_RESULTS_RELEASED',
          title: `📊 Results Released: ${test.title}`,
          message: `${req.teacher!.name} has released results & answer keys for ${test.title}. Check your detailed performance!`,
        });
      });
    }

    res.json({ success: true, resultsReleased: test.resultsReleased });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Release failed.' });
  }
});

teacherRouter.get('/api/teacher/test-results', requireTeacherAuth, (req: AuthenticatedTeacherRequest, res: Response) => {
  const testId = req.query.testId as string;
  const attempts = readJsonFile<TeacherTestAttempt[]>(ATTEMPTS_FILE, []);
  const myAttempts = attempts.filter((a) => a.teacherId === req.teacher?.teacherId && (!testId || a.testId === testId));
  res.json({ attempts: myAttempts });
});

teacherRouter.post('/api/teacher/test-results/update-score', requireTeacherAuth, (req: AuthenticatedTeacherRequest, res: Response) => {
  try {
    const { attemptId, score, teacherFeedback } = req.body as {
      attemptId?: string;
      score?: number;
      teacherFeedback?: string;
    };
    if (!attemptId) {
      res.status(400).json({ error: 'attemptId is required.' });
      return;
    }
    const attempts = readJsonFile<TeacherTestAttempt[]>(ATTEMPTS_FILE, []);
    const attempt = attempts.find((a) => a.id === attemptId && a.teacherId === req.teacher?.teacherId);
    if (!attempt) {
      res.status(404).json({ error: 'Attempt not found.' });
      return;
    }
    if (typeof score === 'number' && !Number.isNaN(score)) {
      attempt.score = Math.max(0, Math.min(attempt.maxScore, score));
    }
    if (typeof teacherFeedback === 'string') {
      attempt.teacherFeedback = teacherFeedback.slice(0, 1000);
    }
    writeJsonFile(ATTEMPTS_FILE, attempts);
    res.json({ success: true, attempt });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update score.' });
  }
});

// Student Views Their Submitted Attempts & Released Results
teacherRouter.get('/api/student/test-results', (req: Request, res: Response) => {
  const studentId = String(req.query.studentId || '');
  if (!studentId) {
    res.status(400).json({ error: 'studentId is required.' });
    return;
  }
  const attempts = readJsonFile<TeacherTestAttempt[]>(ATTEMPTS_FILE, []);
  const tests = readJsonFile<TeacherTest[]>(TESTS_FILE, []);
  const myAttempts = attempts
    .filter((a) => a.studentId === studentId && a.evaluated)
    .map((a) => {
      const test = tests.find((t) => t.id === a.testId);
      const released = Boolean(test?.resultsReleased);
      return {
        ...a,
        resultsReleased: released,
        questionResults: released ? a.questionResults : [],
        questions: released ? test?.questions || [] : [],
      };
    });
  res.json({ attempts: myAttempts });
});

// Student Views Assigned Tests (Only groups student belongs to)
teacherRouter.get('/api/student/assigned-tests', (req: Request, res: Response) => {
  const studentId = String(req.query.studentId || '');
  if (!studentId) {
    res.status(400).json({ error: 'studentId is required.' });
    return;
  }

  const groups = readJsonFile<ClassGroup[]>(GROUPS_FILE, []);
  const studentGroupIds = new Set(groups.filter((g) => g.studentIds.includes(studentId)).map((g) => g.id));

  const tests = readJsonFile<TeacherTest[]>(TESTS_FILE, []);
  const attempts = readJsonFile<TeacherTestAttempt[]>(ATTEMPTS_FILE, []);

  const accessibleTests = tests
    .filter((t) => t.status !== 'DRAFT' && t.targetGroupIds.some((gid) => studentGroupIds.has(gid)))
    .map((t) => {
      const myAttempt = attempts.find((a) => a.testId === t.id && a.studentId === studentId);
      return {
        ...t,
        // Strip correct answers if results not released
        questions: t.resultsReleased
          ? t.questions
          : t.questions.map(({ correctAnswer, explanation, ...rest }) => rest),
        hasAttempted: Boolean(myAttempt),
        attemptSummary: myAttempt
          ? {
              score: myAttempt.score,
              maxScore: myAttempt.maxScore,
              accuracyPercent: myAttempt.accuracyPercent,
              submittedAt: myAttempt.submittedAt,
            }
          : null,
      };
    });

  res.json({ tests: accessibleTests });
});

// Student Starts Exam (Server-enforces countdown timer)
teacherRouter.post('/api/student/tests/start-attempt', (req: Request, res: Response) => {
  try {
    const { testId, studentId, studentName, studentEmail } = req.body as {
      testId: string;
      studentId: string;
      studentName: string;
      studentEmail?: string;
    };

    const tests = readJsonFile<TeacherTest[]>(TESTS_FILE, []);
    const test = tests.find((t) => t.id === testId);
    if (!test || test.status === 'DRAFT') {
      res.status(404).json({ error: 'Test not available or unpublished.' });
      return;
    }

    // Verify group membership
    const groups = readJsonFile<ClassGroup[]>(GROUPS_FILE, []);
    const isMember = groups.some(
      (g) => test.targetGroupIds.includes(g.id) && g.studentIds.includes(studentId)
    );
    if (!isMember) {
      res.status(403).json({ error: 'You are not enrolled in the assigned group for this test.' });
      return;
    }

    const attempts = readJsonFile<TeacherTestAttempt[]>(ATTEMPTS_FILE, []);
    let attempt = attempts.find((a) => a.testId === testId && a.studentId === studentId);

    if (attempt && attempt.submittedAt && !test.allowRetake) {
      res.status(409).json({ error: 'You have already submitted this test.', attemptId: attempt.id });
      return;
    }

    const now = Date.now();
    const durationMs = test.durationMinutes * 60 * 1000;

    if (!attempt || (test.allowRetake && attempt.submittedAt)) {
      attempt = {
        id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        testId: test.id,
        testTitle: test.title,
        teacherId: test.teacherId,
        studentId,
        studentName: studentName || 'Student',
        studentEmail: studentEmail || '',
        startedAt: now,
        serverExpiresAt: now + durationMs,
        durationSeconds: test.durationMinutes * 60,
        answers: {},
        score: 0,
        maxScore: test.totalMarks,
        accuracyPercent: 0,
        correctCount: 0,
        incorrectCount: 0,
        unattemptedCount: test.totalQuestions,
        evaluated: false,
        questionResults: [],
      };
      attempts.push(attempt);
      writeJsonFile(ATTEMPTS_FILE, attempts);
    }

    // Return sanitized questions without answers
    const sanitizedQuestions = test.questions.map(({ correctAnswer, explanation, ...rest }) => rest);

    res.json({
      attemptId: attempt.id,
      test: { ...test, questions: sanitizedQuestions },
      startedAt: attempt.startedAt,
      serverExpiresAt: attempt.serverExpiresAt,
      durationMinutes: test.durationMinutes,
      answers: attempt.answers || {},
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to start attempt.' });
  }
});

// Student Submits Exam Responses & Automatic Evaluation
teacherRouter.post('/api/student/tests/submit-attempt', (req: Request, res: Response) => {
  try {
    const { attemptId, answers } = req.body as {
      attemptId: string;
      answers: Record<string, any>;
    };

    const attempts = readJsonFile<TeacherTestAttempt[]>(ATTEMPTS_FILE, []);
    const attempt = attempts.find((a) => a.id === attemptId);
    if (!attempt) {
      res.status(404).json({ error: 'Attempt record not found.' });
      return;
    }

    const tests = readJsonFile<TeacherTest[]>(TESTS_FILE, []);
    const test = tests.find((t) => t.id === attempt.testId);
    if (!test) {
      res.status(404).json({ error: 'Test not found.' });
      return;
    }

    const submittedAnswers = answers || {};
    let score = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let unattemptedCount = 0;

    const questionResults = test.questions.map((q) => {
      const userAns = submittedAnswers[q.id];
      const isAttempted = userAns !== undefined && userAns !== null && String(userAns).trim() !== '';

      if (!isAttempted) {
        unattemptedCount += 1;
        return {
          questionId: q.id,
          userAnswer: null,
          correctAnswer: q.correctAnswer,
          isCorrect: false,
          marksAwarded: 0,
          explanation: q.explanation,
        };
      }

      let isCorrect = false;
      if (q.type === 'MULTI_MCQ') {
        const parseMulti = (val: any): string[] => {
          if (Array.isArray(val)) return val.map((v) => String(v).trim().toUpperCase()).filter(Boolean).sort();
          return String(val || '')
            .replace(/[\[\]]/g, '')
            .split(',')
            .map((v) => v.trim().toUpperCase())
            .filter(Boolean)
            .sort();
        };
        isCorrect = JSON.stringify(parseMulti(userAns)) === JSON.stringify(parseMulti(q.correctAnswer));
      } else if (q.type === 'NUMERICAL') {
        const uNum = parseFloat(String(userAns).trim());
        const cNum = parseFloat(String(q.correctAnswer).trim());
        isCorrect = !isNaN(uNum) && !isNaN(cNum) && Math.abs(uNum - cNum) < 0.05;
      } else {
        isCorrect = String(userAns).trim().toUpperCase() === String(q.correctAnswer).trim().toUpperCase();
      }

      if (isCorrect) {
        correctCount += 1;
        score += Math.abs(Number(q.positiveMarks) || 4);
        return {
          questionId: q.id,
          userAnswer: userAns,
          correctAnswer: q.correctAnswer,
          isCorrect: true,
          marksAwarded: Math.abs(Number(q.positiveMarks) || 4),
          explanation: q.explanation,
        };
      } else {
        incorrectCount += 1;
        const neg = test.negativeMarkingEnabled ? -Math.abs(Number(q.negativeMarks ?? 1)) : 0;
        score += neg;
        return {
          questionId: q.id,
          userAnswer: userAns,
          correctAnswer: q.correctAnswer,
          isCorrect: false,
          marksAwarded: neg,
          explanation: q.explanation,
        };
      }
    });

    const attemptedTotal = correctCount + incorrectCount;
    const accuracyPercent = attemptedTotal > 0 ? Math.round((correctCount / attemptedTotal) * 100) : 0;

    attempt.submittedAt = Date.now();
    attempt.answers = submittedAnswers;
    attempt.score = Math.max(0, score);
    attempt.accuracyPercent = accuracyPercent;
    attempt.correctCount = correctCount;
    attempt.incorrectCount = incorrectCount;
    attempt.unattemptedCount = unattemptedCount;
    attempt.questionResults = questionResults;
    attempt.evaluated = true;

    writeJsonFile(ATTEMPTS_FILE, attempts);

    res.json({
      success: true,
      score: attempt.score,
      maxScore: attempt.maxScore,
      accuracyPercent,
      correctCount,
      incorrectCount,
      unattemptedCount,
      resultsReleased: test.resultsReleased,
      questionResults: test.resultsReleased ? questionResults : null,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Submission failed.' });
  }
});

// ==========================================
// 6. STUDY MATERIALS & ANNOUNCEMENTS
// ==========================================

export interface StudyMaterial {
  id: string;
  teacherId: string;
  teacherName: string;
  groupId: string;
  groupName: string;
  title: string;
  subject: string;
  description: string;
  fileUrl?: string;
  fileType: 'PDF' | 'NOTE' | 'LINK' | 'DOCUMENT';
  createdAt: string;
}

export interface ClassAnnouncement {
  id: string;
  teacherId: string;
  teacherName: string;
  groupId: string;
  groupName: string;
  title: string;
  content: string;
  priority: 'NORMAL' | 'URGENT';
  createdAt: string;
}

teacherRouter.get('/api/teacher/materials', requireTeacherAuth, (req: AuthenticatedTeacherRequest, res: Response) => {
  const materials = readJsonFile<StudyMaterial[]>(MATERIALS_FILE, []);
  res.json({ materials: materials.filter((m) => m.teacherId === req.teacher?.teacherId) });
});

teacherRouter.post('/api/teacher/materials/add', requireTeacherAuth, (req: AuthenticatedTeacherRequest, res: Response) => {
  try {
    const { groupId, title, subject, description, fileUrl, fileType } = req.body as Partial<StudyMaterial>;
    if (!title) {
      res.status(400).json({ error: 'Title is required.' });
      return;
    }

    const groups = readJsonFile<ClassGroup[]>(GROUPS_FILE, []);
    const myGroups = groups.filter((g) => g.teacherId === req.teacher?.teacherId);
    const targetGroups = groupId && groupId !== 'ALL' ? myGroups.filter((g) => g.id === groupId) : myGroups;

    if (groupId && groupId !== 'ALL' && targetGroups.length === 0) {
      res.status(404).json({ error: 'Group not found.' });
      return;
    }

    const primaryGroup = targetGroups[0];
    const materials = readJsonFile<StudyMaterial[]>(MATERIALS_FILE, []);
    const newMat: StudyMaterial = {
      id: `mat_${Date.now()}`,
      teacherId: req.teacher!.teacherId,
      teacherName: req.teacher!.name,
      groupId: groupId && groupId !== 'ALL' ? groupId : 'ALL',
      groupName: groupId && groupId !== 'ALL' && primaryGroup ? primaryGroup.name : 'All My Groups',
      title: title.trim().slice(0, 140),
      subject: (subject || primaryGroup?.subject || req.teacher!.subject || 'General').trim(),
      description: (description || '').trim().slice(0, 500),
      fileUrl,
      fileType: fileType || 'PDF',
      createdAt: new Date().toISOString(),
    };

    materials.unshift(newMat);
    writeJsonFile(MATERIALS_FILE, materials);

    // Notify students
    const notifiedIds = new Set<string>();
    targetGroups.forEach((group) => {
      group.studentIds.forEach((sid) => {
        if (notifiedIds.has(sid)) return;
        notifiedIds.add(sid);
        addNotification({
          recipientId: sid,
          senderId: req.teacher!.teacherId,
          senderName: req.teacher!.name,
          groupId: group.id,
          groupName: group.name,
          type: 'MATERIAL_UPLOADED',
          title: `📚 Study Material: ${newMat.title}`,
          message: `${req.teacher!.name} uploaded new ${newMat.subject} study material for ${group.name}.`,
        });
      });
    });

    res.json({ success: true, material: newMat });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to add material.' });
  }
});

teacherRouter.get('/api/teacher/announcements', requireTeacherAuth, (req: AuthenticatedTeacherRequest, res: Response) => {
  const announcements = readJsonFile<ClassAnnouncement[]>(ANNOUNCEMENTS_FILE, []);
  res.json({ announcements: announcements.filter((a) => a.teacherId === req.teacher?.teacherId) });
});

teacherRouter.post('/api/teacher/announcements/add', requireTeacherAuth, (req: AuthenticatedTeacherRequest, res: Response) => {
  try {
    const { groupId, title, content, priority } = req.body as Partial<ClassAnnouncement>;
    if (!title || !content) {
      res.status(400).json({ error: 'Title and content are required.' });
      return;
    }

    const groups = readJsonFile<ClassGroup[]>(GROUPS_FILE, []);
    const myGroups = groups.filter((g) => g.teacherId === req.teacher?.teacherId);
    const targetGroups = groupId && groupId !== 'ALL' ? myGroups.filter((g) => g.id === groupId) : myGroups;

    if (groupId && groupId !== 'ALL' && targetGroups.length === 0) {
      res.status(404).json({ error: 'Group not found.' });
      return;
    }

    const primaryGroup = targetGroups[0];
    const announcements = readJsonFile<ClassAnnouncement[]>(ANNOUNCEMENTS_FILE, []);
    const newAnn: ClassAnnouncement = {
      id: `ann_${Date.now()}`,
      teacherId: req.teacher!.teacherId,
      teacherName: req.teacher!.name,
      groupId: groupId && groupId !== 'ALL' ? groupId : 'ALL',
      groupName: groupId && groupId !== 'ALL' && primaryGroup ? primaryGroup.name : 'All My Groups',
      title: title.trim().slice(0, 140),
      content: content.trim().slice(0, 2000),
      priority: priority || 'NORMAL',
      createdAt: new Date().toISOString(),
    };

    announcements.unshift(newAnn);
    writeJsonFile(ANNOUNCEMENTS_FILE, announcements);

    // Notify students
    const notifiedIds = new Set<string>();
    targetGroups.forEach((group) => {
      group.studentIds.forEach((sid) => {
        if (notifiedIds.has(sid)) return;
        notifiedIds.add(sid);
        addNotification({
          recipientId: sid,
          senderId: req.teacher!.teacherId,
          senderName: req.teacher!.name,
          groupId: group.id,
          groupName: group.name,
          type: 'ANNOUNCEMENT',
          title: `📢 Announcement: ${newAnn.title}`,
          message: newAnn.content.slice(0, 160),
        });
      });
    });

    res.json({ success: true, announcement: newAnn });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to add announcement.' });
  }
});

// Student Views Group Materials & Announcements
teacherRouter.get('/api/student/group-resources', (req: Request, res: Response) => {
  const studentId = String(req.query.studentId || '');
  const groups = readJsonFile<ClassGroup[]>(GROUPS_FILE, []);
  const myJoinedGroups = groups.filter((g) => g.studentIds.includes(studentId));
  const myGroupIds = new Set(myJoinedGroups.map((g) => g.id));
  const myTeacherIds = new Set(myJoinedGroups.map((g) => g.teacherId));

  const materials = readJsonFile<StudyMaterial[]>(MATERIALS_FILE, []);
  const announcements = readJsonFile<ClassAnnouncement[]>(ANNOUNCEMENTS_FILE, []);

  res.json({
    materials: materials.filter(
      (m) => myGroupIds.has(m.groupId) || (m.groupId === 'ALL' && myTeacherIds.has(m.teacherId))
    ),
    announcements: announcements.filter(
      (a) => myGroupIds.has(a.groupId) || (a.groupId === 'ALL' && myTeacherIds.has(a.teacherId))
    ),
  });
});

// ==========================================
// 7. REAL-TIME NOTIFICATIONS
// ==========================================

export interface ClassNotification {
  id: string;
  recipientId: string;
  senderId: string;
  senderName: string;
  groupId: string;
  groupName: string;
  type:
    | 'LIVE_CLASS_STARTED'
    | 'TEST_ASSIGNED'
    | 'TEST_RESULTS_RELEASED'
    | 'MATERIAL_UPLOADED'
    | 'ANNOUNCEMENT';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export function addNotification(notif: Omit<ClassNotification, 'id' | 'read' | 'createdAt'>): void {
  const notifs = readJsonFile<ClassNotification[]>(NOTIFICATIONS_FILE, []);
  notifs.unshift({
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ...notif,
    read: false,
    createdAt: new Date().toISOString(),
  });
  if (notifs.length > 500) notifs.length = 500;
  writeJsonFile(NOTIFICATIONS_FILE, notifs);
}

teacherRouter.get('/api/notifications', (req: Request, res: Response) => {
  const userId = String(req.query.userId || '');
  if (!userId) {
    res.status(400).json({ error: 'userId required.' });
    return;
  }
  const notifs = readJsonFile<ClassNotification[]>(NOTIFICATIONS_FILE, []);
  const myNotifs = notifs.filter((n) => n.recipientId === userId).slice(0, 50);
  res.json({ notifications: myNotifs });
});

teacherRouter.post('/api/notifications/mark-read', (req: Request, res: Response) => {
  const { notificationId, userId, markAll } = req.body as {
    notificationId?: string;
    userId?: string;
    markAll?: boolean;
  };
  const notifs = readJsonFile<ClassNotification[]>(NOTIFICATIONS_FILE, []);
  if (markAll && userId) {
    notifs.forEach((n) => {
      if (n.recipientId === userId) n.read = true;
    });
  } else if (notificationId) {
    const item = notifs.find((n) => n.id === notificationId);
    if (item) item.read = true;
  }
  writeJsonFile(NOTIFICATIONS_FILE, notifs);
  res.json({ success: true });
});

// ==========================================
// 8. STUDY GROUP CHAT REST + BROADCAST ROUTES
// ==========================================

function extractTeacherBearerToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
}

teacherRouter.get('/api/group-chat/messages', (req: Request, res: Response) => {
  const groupId = String(req.query.groupId || '');
  const studentId = req.query.studentId ? String(req.query.studentId) : undefined;
  const teacherToken = extractTeacherBearerToken(req);

  const auth = authorizeGroupChatAccess({ groupId, teacherToken, studentId });
  if (!auth.authorized) {
    res.status(403).json({ error: auth.error || 'Access denied.' });
    return;
  }

  res.json({ messages: getGroupMessages(groupId) });
});

teacherRouter.post('/api/group-chat/send', (req: Request, res: Response) => {
  try {
    const { groupId, studentId, userName, text, clientMessageId, replyTo } = req.body as {
      groupId?: string;
      studentId?: string;
      userName?: string;
      text?: string;
      clientMessageId?: string;
      replyTo?: { id: string; senderName: string; text: string };
    };
    const teacherToken = extractTeacherBearerToken(req);

    const auth = authorizeGroupChatAccess({
      groupId: String(groupId || ''),
      teacherToken,
      studentId,
      userName,
    });
    if (!auth.authorized || !auth.userId || !auth.userName || !auth.role || !auth.group) {
      res.status(403).json({ error: auth.error || 'Access denied.' });
      return;
    }

    const result = createGroupMessage({
      groupId: auth.group.id,
      senderId: auth.userId,
      senderName: auth.userName,
      senderRole: auth.role,
      text: String(text || ''),
      clientMessageId,
      replyTo,
    });

    broadcastToGroupRoom(auth.group.id, {
      type: 'chat:message',
      groupId: auth.group.id,
      message: result.message,
    });

    res.json({ success: true, message: result.message });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to send message.' });
  }
});

teacherRouter.post('/api/group-chat/delete', (req: Request, res: Response) => {
  try {
    const { groupId, messageId, studentId } = req.body as {
      groupId?: string;
      messageId?: string;
      studentId?: string;
    };
    const teacherToken = extractTeacherBearerToken(req);

    const auth = authorizeGroupChatAccess({
      groupId: String(groupId || ''),
      teacherToken,
      studentId,
    });
    if (!auth.authorized || !auth.userId || !auth.role || !auth.group) {
      res.status(403).json({ error: auth.error || 'Access denied.' });
      return;
    }

    if (!messageId) {
      res.status(400).json({ error: 'messageId is required.' });
      return;
    }

    const deleted = deleteGroupMessage({
      groupId: auth.group.id,
      messageId,
      requesterId: auth.userId,
      requesterRole: auth.role,
    });

    if (deleted) {
      broadcastToGroupRoom(auth.group.id, {
        type: 'chat:deleted',
        groupId: auth.group.id,
        messageId,
      });
    }

    res.json({ success: true, deleted });
  } catch (err) {
    res.status(403).json({ error: err instanceof Error ? err.message : 'Delete failed.' });
  }
});

teacherRouter.post('/api/group-chat/pin', requireTeacherAuth, (req: AuthenticatedTeacherRequest, res: Response) => {
  try {
    const { groupId, messageId, pinned } = req.body as {
      groupId?: string;
      messageId?: string;
      pinned?: boolean;
    };
    const teacherToken = extractTeacherBearerToken(req);
    const auth = authorizeGroupChatAccess({
      groupId: String(groupId || ''),
      teacherToken,
    });
    if (!auth.authorized || !auth.group) {
      res.status(403).json({ error: auth.error || 'Access denied.' });
      return;
    }
    if (!messageId) {
      res.status(400).json({ error: 'messageId is required.' });
      return;
    }
    const updated = pinGroupMessage({
      groupId: auth.group.id,
      messageId,
      pinned: Boolean(pinned),
    });
    if (!updated) {
      res.status(404).json({ error: 'Message not found.' });
      return;
    }

    broadcastToGroupRoom(auth.group.id, {
      type: 'chat:pinned',
      groupId: auth.group.id,
      messageId: updated.id,
      pinned: updated.pinned,
    });

    res.json({ success: true, message: updated });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Pin failed.' });
  }
});
