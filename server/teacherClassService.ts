import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

// Storage file paths for teacher credentials and classroom state
const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const TEACHERS_FILE = path.join(DATA_DIR, 'teacher_accounts.json');
const JWT_SECRET = process.env.TEACHER_AUTH_SECRET || crypto.randomBytes(32).toString('hex');

export interface TeacherAccount {
  id: string;
  username: string;
  name: string;
  title: string;
  email: string;
  subject: string;
  avatarColor: string;
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeacherSession {
  teacherId: string;
  username: string;
  name: string;
  email: string;
  subject: string;
  title: string;
  role: 'TEACHER';
  exp: number;
}

export interface AuthenticatedTeacherRequest extends Request {
  teacher?: TeacherSession;
}

// Secure password hashing with scrypt
export function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

// Seed the two requested initial teacher accounts:
// 1. Tatai: username 'tatai099', password 'tatai/00/1'
// 2. RP: username 'rp', password 'rp/00/1'
export function initializeTeacherAccounts(): TeacherAccount[] {
  let teachers: TeacherAccount[] = [];
  if (fs.existsSync(TEACHERS_FILE)) {
    try {
      teachers = JSON.parse(fs.readFileSync(TEACHERS_FILE, 'utf-8'));
    } catch {
      teachers = [];
    }
  }

  let modified = false;

  // Teacher 1: tatai099
  let tatai = teachers.find((t) => t.username.toLowerCase() === 'tatai099');
  if (!tatai) {
    const salt = generateSalt();
    tatai = {
      id: 'teacher_tatai099',
      username: 'tatai099',
      name: 'Prof. Tatai',
      title: 'Senior Faculty · Physics & Mechanics',
      email: 'tatai099@obren.study',
      subject: 'Physics',
      avatarColor: 'bg-indigo-600',
      passwordSalt: salt,
      passwordHash: hashPassword('tatai/00/1', salt),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    teachers.push(tatai);
    modified = true;
  }

  // Teacher 2: rp
  let rp = teachers.find((t) => t.username.toLowerCase() === 'rp');
  if (!rp) {
    const salt = generateSalt();
    rp = {
      id: 'teacher_rp',
      username: 'rp',
      name: 'Dr. R.P.',
      title: 'Head of Department · Chemistry & Mathematics',
      email: 'rp@obren.study',
      subject: 'Chemistry',
      avatarColor: 'bg-emerald-600',
      passwordSalt: salt,
      passwordHash: hashPassword('rp/00/1', salt),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    teachers.push(rp);
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(TEACHERS_FILE, JSON.stringify(teachers, null, 2), 'utf-8');
  }

  return teachers;
}

export function loadTeachers(): TeacherAccount[] {
  if (!fs.existsSync(TEACHERS_FILE)) {
    return initializeTeacherAccounts();
  }
  try {
    return JSON.parse(fs.readFileSync(TEACHERS_FILE, 'utf-8'));
  } catch {
    return initializeTeacherAccounts();
  }
}

export function saveTeachers(teachers: TeacherAccount[]): void {
  fs.writeFileSync(TEACHERS_FILE, JSON.stringify(teachers, null, 2), 'utf-8');
}

// Token Signing and Verification (HMAC-SHA256)
export function signTeacherToken(teacher: TeacherAccount): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload: TeacherSession = {
    teacherId: teacher.id,
    username: teacher.username,
    name: teacher.name,
    email: teacher.email,
    subject: teacher.subject,
    title: teacher.title,
    role: 'TEACHER',
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600, // 7 days
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payloadStr}`)
    .digest('base64url');
  return `${header}.${payloadStr}.${signature}`;
}

export function verifyTeacherToken(token: string): TeacherSession | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payloadStr, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${payloadStr}`)
      .digest('base64url');
    if (signature !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf-8')) as TeacherSession;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

// Express Middleware to authenticate Teacher
export function requireTeacherAuth(
  req: AuthenticatedTeacherRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Teacher authentication required.' });
    return;
  }

  const session = verifyTeacherToken(token);
  if (!session) {
    res.status(401).json({ error: 'Invalid or expired teacher session. Please log in again.' });
    return;
  }

  req.teacher = session;
  next();
}

// Helper to generate clean Google Meet style room code (e.g., 'abc-defg-hij')
export function generateGoogleMeetCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const pick = (len: number) =>
    Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${pick(3)}-${pick(4)}-${pick(3)}`;
}

// Helper to generate unique group invitation key (e.g. 'PHY28-X92K')
export function generateGroupInviteKey(subject = 'GRP', prefixCls = '28'): string {
  const subPrefix = subject.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, '') || 'GRP';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = (len: number) =>
    Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${subPrefix}${prefixCls}-${pick(4)}`;
}
