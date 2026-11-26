import type { PublicProfile, StudySession, TestAttempt, UserProfile } from '../types/obren';

export function getTodayDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getYesterdayDateKey(): string {
  const dt = new Date();
  dt.setDate(dt.getDate() - 1);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function computeNextStreak(profile: UserProfile): {
  streakDays: number;
  longestStreak: number;
  lastActiveDate: string;
} {
  const today = getTodayDateKey();
  const yesterday = getYesterdayDateKey();
  const current = profile.streakDays || 0;
  const longest = profile.longestStreak || current;

  if (profile.lastActiveDate === today) {
    return {
      streakDays: Math.max(1, current),
      longestStreak: Math.max(1, longest, current),
      lastActiveDate: today,
    };
  }

  if (profile.lastActiveDate === yesterday) {
    const next = current + 1;
    return {
      streakDays: next,
      longestStreak: Math.max(longest, next),
      lastActiveDate: today,
    };
  }

  return {
    streakDays: 1,
    longestStreak: Math.max(longest, 1),
    lastActiveDate: today,
  };
}

export function getLevelInfo(xp: number): {
  level: number;
  title: string;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPercent: number;
} {
  const safeXp = Math.max(0, xp || 0);
  const level = Math.floor(safeXp / 250) + 1;
  const currentLevelXp = (level - 1) * 250;
  const nextLevelXp = level * 250;
  const progressPercent = Math.min(
    100,
    Math.round(((safeXp - currentLevelXp) / 250) * 100)
  );

  const titles = [
    'Initiator',
    'Focused Scholar',
    'Problem Solver',
    'Rank Climber',
    'Centurion',
    'Mock Tactician',
    'Top 1% Contender',
    'AIR Vanguard',
  ];
  const title = titles[Math.min(titles.length - 1, Math.floor((level - 1) / 2))];

  return { level, title, currentLevelXp, nextLevelXp, progressPercent };
}

export type BadgeCategory = 'STREAK' | 'STUDY_HOURS' | 'PERFORMANCE';
export type BadgeTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'DIAMOND';

export interface AchievementBadge {
  id: string;
  name: string;
  label: string;
  category: BadgeCategory;
  tier: BadgeTier;
  description: string;
  requirement: string;
  iconName: string;
  currentValue: number;
  targetValue: number;
  progressPercent: number;
  unlocked: boolean;
}

export function computeBadges(
  profile: UserProfile | PublicProfile,
  attempts?: TestAttempt[],
  sessions?: StudySession[]
): AchievementBadge[] {
  const pUser = profile as Partial<UserProfile>;
  const tests = profile.totalTestsCompleted || attempts?.length || 0;
  const solved = profile.totalQuestionsSolved || 0;
  const correct = profile.totalCorrect || 0;
  const streak = pUser.longestStreak || profile.streakDays || 0;
  const studyMins = pUser.totalStudyMinutes || Math.round((profile.xp || 0) / 2);
  const chaptersCompleted = (pUser.completedChapters || []).length;
  const dailyStreak = pUser.dailyChallengeStreak || 0;

  // Check if any morning focus session (started before 9:00 AM) or 60+ mins morning study
  const hasEarlySession = Boolean(
    sessions?.some((s) => {
      const ts = (s.createdAt as { toMillis?: () => number })?.toMillis?.() || Date.now();
      const hour = new Date(ts).getHours();
      return hour >= 4 && hour <= 8;
    }) || studyMins >= 120
  );

  // Check if any test had >= 80% accuracy
  const hasHighAccuracyTest = Boolean(
    attempts?.some((a) => a.accuracyPercent >= 80) ||
      (solved >= 10 && Math.round((correct / solved) * 100) >= 80)
  );

  const makeProgress = (cur: number, tgt: number) => {
    return Math.min(100, Math.round((Math.max(0, cur) / Math.max(1, tgt)) * 100));
  };

  return [
    // --- STREAK BADGES ---
    {
      id: 'streak-3',
      name: '3-Day Momentum',
      label: '3-Day Momentum',
      category: 'STREAK',
      tier: 'BRONZE',
      description: 'Establish momentum with a 3-day active test or study streak.',
      requirement: 'Maintain a 3-day active streak',
      iconName: 'Flame',
      currentValue: streak,
      targetValue: 3,
      progressPercent: makeProgress(streak, 3),
      unlocked: streak >= 3,
    },
    {
      id: 'perfect-week',
      name: 'Perfect Week',
      label: 'Perfect Week',
      category: 'STREAK',
      tier: 'SILVER',
      description: 'Study 7 days in a row without missing a single day.',
      requirement: 'Achieve a 7-day unbroken study streak',
      iconName: 'CalendarCheck',
      currentValue: streak,
      targetValue: 7,
      progressPercent: makeProgress(streak, 7),
      unlocked: streak >= 7,
    },
    {
      id: 'titan-streak',
      name: 'Titan of Consistency',
      label: 'Titan of Consistency',
      category: 'STREAK',
      tier: 'DIAMOND',
      description: 'Maintain an ironclad 30-day preparation streak.',
      requirement: 'Maintain a 30-day unbroken streak',
      iconName: 'Crown',
      currentValue: streak,
      targetValue: 30,
      progressPercent: makeProgress(streak, 30),
      unlocked: streak >= 30,
    },

    // --- STUDY HOURS BADGES ---
    {
      id: 'early-bird',
      name: 'Early Bird',
      label: 'Early Bird',
      category: 'STUDY_HOURS',
      tier: 'BRONZE',
      description: 'Complete a focused morning study session before 9:00 AM.',
      requirement: 'Log a focus session between 4 AM - 9 AM or reach 2h study',
      iconName: 'Sunrise',
      currentValue: hasEarlySession ? 1 : Math.min(1, Math.round(studyMins / 120)),
      targetValue: 1,
      progressPercent: hasEarlySession ? 100 : Math.min(100, Math.round((studyMins / 120) * 100)),
      unlocked: hasEarlySession,
    },
    {
      id: 'deep-focus',
      name: 'Deep Focus Initiate',
      label: 'Deep Focus Initiate',
      category: 'STUDY_HOURS',
      tier: 'SILVER',
      description: 'Accumulate 5 hours (300 minutes) of dedicated focus timer study.',
      requirement: 'Log 300 minutes in Focus Timer',
      iconName: 'Clock',
      currentValue: studyMins,
      targetValue: 300,
      progressPercent: makeProgress(studyMins, 300),
      unlocked: studyMins >= 300,
    },
    {
      id: 'century-scholar',
      name: 'Century Scholar',
      label: 'Century Scholar',
      category: 'STUDY_HOURS',
      tier: 'GOLD',
      description: 'Accumulate 20 hours (1,200 minutes) in Pomodoro and deep work sessions.',
      requirement: 'Log 1,200 minutes of total study time',
      iconName: 'ShieldCheck',
      currentValue: studyMins,
      targetValue: 1200,
      progressPercent: makeProgress(studyMins, 1200),
      unlocked: studyMins >= 1200,
    },

    // --- ASSESSMENT PERFORMANCE BADGES ---
    {
      id: 'first-test',
      name: 'First CBT Completed',
      label: 'First CBT Completed',
      category: 'PERFORMANCE',
      tier: 'BRONZE',
      description: 'Submit your very first NTA-pattern mock or practice assessment.',
      requirement: 'Complete at least 1 CBT mock test',
      iconName: 'Trophy',
      currentValue: tests,
      targetValue: 1,
      progressPercent: makeProgress(tests, 1),
      unlocked: tests >= 1,
    },
    {
      id: 'century-solver',
      name: '100 PYQs Solved',
      label: '100 PYQs Solved',
      category: 'PERFORMANCE',
      tier: 'SILVER',
      description: 'Answer 100 real Past Year Questions in CBT test practice.',
      requirement: 'Solve 100 PYQ questions',
      iconName: 'Target',
      currentValue: solved,
      targetValue: 100,
      progressPercent: makeProgress(solved, 100),
      unlocked: solved >= 100,
    },
    {
      id: 'formula-master',
      name: 'Formula Master',
      label: 'Formula Master',
      category: 'PERFORMANCE',
      tier: 'GOLD',
      description: 'Master 5+ curriculum chapters and review high-yield formula sheets.',
      requirement: 'Complete 5 chapters or solve 60+ questions with >=70% accuracy',
      iconName: 'BookOpenCheck',
      currentValue: Math.max(chaptersCompleted, Math.min(5, Math.floor(solved / 15))),
      targetValue: 5,
      progressPercent: makeProgress(Math.max(chaptersCompleted, Math.floor(solved / 15)), 5),
      unlocked: chaptersCompleted >= 5 || (solved >= 50 && (correct / Math.max(1, solved)) >= 0.7),
    },
    {
      id: 'bullseye',
      name: 'Bullseye Accuracy',
      label: 'Bullseye Accuracy',
      category: 'PERFORMANCE',
      tier: 'GOLD',
      description: 'Deliver exam-ready precision with an 80%+ accuracy rating.',
      requirement: 'Score 80%+ accuracy on any completed mock test',
      iconName: 'Sparkles',
      currentValue: hasHighAccuracyTest ? 100 : solved > 0 ? Math.round((correct / solved) * 100) : 0,
      targetValue: 80,
      progressPercent: hasHighAccuracyTest ? 100 : makeProgress(solved > 0 ? Math.round((correct / solved) * 100) : 0, 80),
      unlocked: hasHighAccuracyTest,
    },
    {
      id: 'marathon-10',
      name: '10 Mock Marathons',
      label: '10 Mock Marathons',
      category: 'PERFORMANCE',
      tier: 'GOLD',
      description: 'Complete 10 full, weekly, or booster CBT examination runs.',
      requirement: 'Complete 10 test attempts',
      iconName: 'Medal',
      currentValue: tests,
      targetValue: 10,
      progressPercent: makeProgress(tests, 10),
      unlocked: tests >= 10,
    },
    {
      id: 'daily-sprint',
      name: 'Daily Sprint Champion',
      label: 'Daily Sprint Champion',
      category: 'PERFORMANCE',
      tier: 'SILVER',
      description: 'Maintain a 3-day sprint streak in the 5-Minute Daily Challenge.',
      requirement: 'Complete the Daily Challenge 3 days in a row',
      iconName: 'Zap',
      currentValue: dailyStreak,
      targetValue: 3,
      progressPercent: makeProgress(dailyStreak, 3),
      unlocked: dailyStreak >= 3,
    },
  ];
}
