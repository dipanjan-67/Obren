import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  Key,
  Lock,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
  Trophy,
  User,
  X,
  Zap,
} from 'lucide-react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';
import type { ExamType, TargetClass } from '../types/obren';
import { teacherLogin, type TeacherUser } from '../lib/teacherClient';

interface AuthScreenProps {
  mode: 'LOGIN' | 'ONBOARDING';
  pendingDisplayName?: string;
  pendingEmail?: string;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onGoogleAuth: () => Promise<void>;
  onStudentCredentialLogin?: (user: {
    uid: string;
    email: string;
    displayName: string;
  }) => Promise<void>;
  onTeacherLoginSuccess: (teacher: TeacherUser) => void;
  onCompleteOnboarding: (data: {
    displayName: string;
    targetExam: ExamType;
    targetClass: TargetClass;
    targetYear: number;
    dailyStudyGoalMins: number;
  }) => Promise<void>;
  authError: string | null;
  authLoading: boolean;
}

type AuthTab = 'STUDENT_LOGIN' | 'STUDENT_SIGNUP' | 'TEACHER_LOGIN';

export const AuthScreen: React.FC<AuthScreenProps> = ({
  mode,
  pendingDisplayName = '',
  pendingEmail = '',
  darkMode,
  onToggleDarkMode,
  onGoogleAuth,
  onStudentCredentialLogin,
  onTeacherLoginSuccess,
  onCompleteOnboarding,
  authError,
  authLoading,
}) => {
  const [authTab, setAuthTab] = useState<AuthTab>('STUDENT_SIGNUP');
  const [showTeacherModal, setShowTeacherModal] = useState(false);

  // Student registration fields
  const [studentFullName, setStudentFullName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [studentUsername, setStudentUsername] = useState('');
  const [studentPassword, setStudentPassword] = useState('');
  const [studentConfirmPassword, setStudentConfirmPassword] = useState('');
  const [studentAuthSubmitting, setStudentAuthSubmitting] = useState(false);
  const [studentAuthError, setStudentAuthError] = useState<string | null>(null);

  // Student login fields
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Teacher login fields
  const [teacherUsername, setTeacherUsername] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [teacherLoading, setTeacherLoading] = useState(false);
  const [teacherError, setTeacherError] = useState<string | null>(null);

  // Onboarding fields
  const [displayName, setDisplayName] = useState(pendingDisplayName);
  const [targetExam, setTargetExam] = useState<ExamType>('JEE_MAINS');
  const [targetClass, setTargetClass] = useState<TargetClass>('12');
  const [targetYear, setTargetYear] = useState<number>(2027);
  const [dailyGoalMins, setDailyGoalMins] = useState<number>(180);
  const [imgFailed, setImgFailed] = useState(false);

  // Handle Teacher Login
  const handleTeacherLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherUsername.trim() || !teacherPassword.trim()) {
      setTeacherError('Please enter teacher username and password.');
      return;
    }
    setTeacherLoading(true);
    setTeacherError(null);
    try {
      const teacher = await teacherLogin(teacherUsername.trim(), teacherPassword.trim());
      onTeacherLoginSuccess(teacher);
    } catch (err) {
      setTeacherError(err instanceof Error ? err.message : 'Invalid teacher credentials.');
    } finally {
      setTeacherLoading(false);
    }
  };

  // Select teacher username without exposing any passwords in client JS
  const selectTeacherUsername = (user: 'tatai099' | 'rp') => {
    setTeacherUsername(user);
    setTeacherPassword('');
    setTeacherError(null);
  };

  // Handle Student Registration
  const handleStudentRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (studentPassword !== studentConfirmPassword) {
      setStudentAuthError('Passwords do not match.');
      return;
    }
    if (studentPassword.length < 6) {
      setStudentAuthError('Password must be at least 6 characters.');
      return;
    }
    setStudentAuthSubmitting(true);
    setStudentAuthError(null);

    try {
      const res = await fetch('/api/auth/student-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: studentFullName.trim(),
          email: studentEmail.trim(),
          username: studentUsername.trim(),
          password: studentPassword,
          confirmPassword: studentConfirmPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed.');
      }

      // Sign into Firebase Auth client-side
      await signInWithEmailAndPassword(auth, studentEmail.trim(), studentPassword);
    } catch (err) {
      setStudentAuthError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setStudentAuthSubmitting(false);
    }
  };

  // Handle Student Login with Email/Username + Password
  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStudentAuthSubmitting(true);
    setStudentAuthError(null);

    try {
      let emailToAuth = loginIdentifier.trim();
      if (!emailToAuth.includes('@')) {
        // Resolve username to email via endpoint
        const res = await fetch('/api/auth/student-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: loginIdentifier.trim(),
            password: loginPassword,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Login failed.');
        }
        emailToAuth = data.email;
      }

      // Sign into Firebase Auth client-side
      await signInWithEmailAndPassword(auth, emailToAuth, loginPassword);
    } catch (err) {
      setStudentAuthError(err instanceof Error ? err.message : 'Invalid credentials.');
    } finally {
      setStudentAuthSubmitting(false);
    }
  };

  const handleSubmitOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    await onCompleteOnboarding({
      displayName: displayName.trim() || 'Aspirant',
      targetExam,
      targetClass,
      targetYear,
      dailyStudyGoalMins: dailyGoalMins,
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <header className="w-full max-w-7xl mx-auto px-6 py-5 flex items-center justify-between gap-8">
        <div className="flex items-center gap-3">
          <div className="text-2xl font-extrabold tracking-tight font-display whitespace-nowrap shrink-0">
            OBREN
          </div>
          <span className="hidden sm:inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
            Study Portal & Classroom
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleDarkMode}
          aria-label="Toggle dark mode"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
          <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="lg:col-span-6 flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 md:p-10 shadow-sm"
        >
          {mode === 'LOGIN' ? (
            <div>
              {/* Student Auth Tabs */}
              <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl mb-6 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('STUDENT_SIGNUP');
                    setStudentAuthError(null);
                  }}
                  className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer text-center ${
                    authTab === 'STUDENT_SIGNUP'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Student Sign Up
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('STUDENT_LOGIN');
                    setStudentAuthError(null);
                  }}
                  className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer text-center ${
                    authTab === 'STUDENT_LOGIN'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Student Sign In
                </button>
              </div>

              {showTeacherModal && (
                <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl relative">
                    <button
                      type="button"
                      onClick={() => setShowTeacherModal(false)}
                      className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <X className="w-5 h-5" />
                    </button>
                    <div className="mb-4">
                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block mb-1">
                        Faculty & Instructor Portal
                      </span>
                      <h2 className="text-xl font-extrabold font-display tracking-tight text-slate-900 dark:text-slate-100">
                        Teacher Command Sign In
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Enter teacher credentials / passcode to access your teacher command desk.
                      </p>
                    </div>

                    <div className="mb-4 p-2.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40">
                      <span className="text-[11px] font-bold text-indigo-900 dark:text-indigo-200 block mb-1">
                        Select Authorized Faculty:
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => selectTeacherUsername('tatai099')}
                          className="flex-1 py-1.5 px-2 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-indigo-50 transition-colors cursor-pointer text-left"
                        >
                          <div className="text-[9px] text-indigo-600">Teacher 1</div>
                          <div>@tatai099</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => selectTeacherUsername('rp')}
                          className="flex-1 py-1.5 px-2 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-indigo-50 transition-colors cursor-pointer text-left"
                        >
                          <div className="text-[9px] text-indigo-600">Teacher 2</div>
                          <div>@rp</div>
                        </button>
                      </div>
                    </div>

                    {teacherError && (
                      <div className="mb-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-rose-700 text-xs">
                        {teacherError}
                      </div>
                    )}

                    <form onSubmit={handleTeacherLogin} className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold mb-1">Teacher Username</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. tatai099 or rp"
                          value={teacherUsername}
                          onChange={(e) => setTeacherUsername(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1">Teacher Password / Passcode</label>
                        <input
                          type="password"
                          required
                          placeholder="Enter teacher password"
                          value={teacherPassword}
                          onChange={(e) => setTeacherPassword(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={teacherLoading}
                        className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md transition-all cursor-pointer"
                      >
                        <GraduationCap className="w-4 h-4" />
                        <span>{teacherLoading ? 'Authenticating...' : 'Sign In as Teacher'}</span>
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {/* ========================================================= */}
              {/* TAB 2: STUDENT SIGN UP */}
              {/* ========================================================= */}
              {authTab === 'STUDENT_SIGNUP' && (
                <div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-balance mb-2">
                    Build unstoppable momentum for JEE & NEET.
                  </h1>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-5">
                    Register with your student profile or use 1-click Google Sign-Up.
                  </p>

                  {(authError || studentAuthError) && (
                    <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
                      {authError || studentAuthError}
                    </div>
                  )}

                  {/* 1-Click Google Sign Up */}
                  <button
                    type="button"
                    disabled={authLoading}
                    onClick={onGoogleAuth}
                    className="w-full inline-flex items-center justify-center gap-3 px-6 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 font-semibold text-xs transition-colors cursor-pointer mb-5 shadow-sm"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>{authLoading ? 'Connecting...' : 'Sign Up with Google'}</span>
                  </button>

                  <div className="relative flex items-center justify-center mb-5">
                    <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
                    <span className="bg-white dark:bg-slate-900 px-3 text-[10px] text-slate-400 uppercase font-bold absolute">
                      Or with email
                    </span>
                  </div>

                  {/* Student Registration Form */}
                  <form onSubmit={handleStudentRegister} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold mb-1">Full Name</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Rahul Sharma"
                          value={studentFullName}
                          onChange={(e) => setStudentFullName(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1">Username</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. rahul_jee26"
                          value={studentUsername}
                          onChange={(e) => setStudentUsername(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold mb-1">Email Address</label>
                      <input
                        type="email"
                        required
                        placeholder="you@example.com"
                        value={studentEmail}
                        onChange={(e) => setStudentEmail(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold mb-1">Password</label>
                        <input
                          type="password"
                          required
                          placeholder="Min 6 characters"
                          value={studentPassword}
                          onChange={(e) => setStudentPassword(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1">Confirm Password</label>
                        <input
                          type="password"
                          required
                          placeholder="Re-type password"
                          value={studentConfirmPassword}
                          onChange={(e) => setStudentConfirmPassword(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={studentAuthSubmitting}
                      className="w-full mt-2 inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors cursor-pointer"
                    >
                      <span>{studentAuthSubmitting ? 'Creating Student Profile...' : 'Complete Registration'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              )}

              {/* ========================================================= */}
              {/* TAB 3: STUDENT LOGIN */}
              {/* ========================================================= */}
              {authTab === 'STUDENT_LOGIN' && (
                <div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-balance mb-2">
                    Welcome back to OBREN.
                  </h1>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-5">
                    Resume your study streak, live tests, flashcards, and group classrooms.
                  </p>

                  {(authError || studentAuthError) && (
                    <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
                      {authError || studentAuthError}
                    </div>
                  )}

                  {/* 1-Click Google Sign In */}
                  <button
                    type="button"
                    disabled={authLoading}
                    onClick={onGoogleAuth}
                    className="w-full inline-flex items-center justify-center gap-3 px-6 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 font-semibold text-xs transition-colors cursor-pointer mb-5 shadow-sm"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>{authLoading ? 'Connecting...' : 'Sign In with Google'}</span>
                  </button>

                  <div className="relative flex items-center justify-center mb-5">
                    <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
                    <span className="bg-white dark:bg-slate-900 px-3 text-[10px] text-slate-400 uppercase font-bold absolute">
                      Or with credentials
                    </span>
                  </div>

                  <form onSubmit={handleStudentLogin} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1">
                        Username or Email
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Enter username or email"
                        value={loginIdentifier}
                        onChange={(e) => setLoginIdentifier(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold mb-1">Password</label>
                      <input
                        type="password"
                        required
                        placeholder="Enter your password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={studentAuthSubmitting}
                      className="w-full mt-2 inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors cursor-pointer"
                    >
                      <span>{studentAuthSubmitting ? 'Signing In...' : 'Sign In'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              )}

              {/* Feature Highlights bottom */}
              <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="flex items-start gap-2.5">
                  <Zap className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold">NTA CBT Exams</div>
                    <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                      Timer, review & palette
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <BookOpen className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold">Group Classrooms</div>
                    <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                      Live Meet & invite codes
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold">Faculty Desks</div>
                    <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                      Isolated teacher tools
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ONBOARDING MODE */
            <form onSubmit={handleSubmitOnboarding} className="space-y-6">
              <div>
                <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-2">
                  Profile Setup · {pendingEmail}
                </div>
                <h1 className="text-3xl font-extrabold font-display tracking-tight text-balance">
                  Customize your exam track
                </h1>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" htmlFor="obren-name">
                  Display Name
                </label>
                <input
                  id="obren-name"
                  type="text"
                  required
                  maxLength={80}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter your name"
                />
              </div>

              <div>
                <span className="block text-sm font-medium mb-2">Target Exam</span>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ['JEE_MAINS', 'JEE Main'],
                    ['JEE_ADV', 'JEE Advanced'],
                    ['NEET', 'NEET UG'],
                  ] as const).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setTargetExam(val)}
                      className={`py-2.5 px-3 rounded-xl border text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        targetExam === val
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <span className="block text-sm font-medium mb-2">Class Track</span>
                  <div className="grid grid-cols-3 gap-2">
                    {(['11', '12', 'DROPPER'] as const).map((cls) => (
                      <button
                        key={cls}
                        type="button"
                        onClick={() => setTargetClass(cls)}
                        className={`py-2 px-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                          targetClass === cls
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {cls === 'DROPPER' ? 'Dropper' : `Class ${cls}`}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" htmlFor="target-year">
                    Target Year
                  </label>
                  <select
                    id="target-year"
                    value={targetYear}
                    onChange={(e) => setTargetYear(Number(e.target.value))}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  >
                    {[2026, 2027, 2028, 2029].map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" htmlFor="daily-goal">
                  Daily Focused Study Goal:{' '}
                  <span className="font-mono tabular-nums font-bold">{dailyGoalMins} mins</span>
                </label>
                <input
                  id="daily-goal"
                  type="range"
                  min={30}
                  max={600}
                  step={30}
                  value={dailyGoalMins}
                  onChange={(e) => setDailyGoalMins(Number(e.target.value))}
                  className="w-full accent-indigo-600"
                />
              </div>

              {authError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>{authLoading ? 'Saving profile...' : 'Enter OBREN Dashboard'}</span>
              </button>
            </form>
          )}

          <div className="mt-8 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-4">
            <span>JEE Main · JEE Advanced · NEET UG</span>
            <button
              type="button"
              onClick={() => {
                setShowTeacherModal(true);
                setTeacherError(null);
              }}
              className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer inline-flex items-center gap-1"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Faculty Sign In</span>
            </button>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="lg:col-span-6 relative rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 min-h-[320px]"
        >
          {!imgFailed ? (
            <img
              src="/src/assets/images/hero_obren_study_1795432797216.jpg"
              alt="Precision engineering desk and study notebooks for JEE and NEET preparation"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-full h-full lg:h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-8">
              <Trophy className="w-16 h-16 text-amber-400" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-transparent flex flex-col justify-end p-8">
            <div className="text-xs font-medium text-amber-300 mb-2">
              Teacher Classrooms · Live Google Meet · Online Test Series
            </div>
            <h2 className="text-2xl font-bold font-display text-white text-balance">
              Private study groups, live classes with attendance, and multi-pattern timed exams.
            </h2>
          </div>
        </motion.section>
      </main>
    </div>
  );
};
