import type { ExamType, PyqQuestion } from '../types/obren';

export function parseAnswerTokens(raw: string, options: string[] = []): string[] {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return [];

  // Single-option exact match
  if (options.includes(trimmed)) {
    return [trimmed];
  }

  // Split by comma, semicolon, or whitespace-delimited option letters (e.g. "A, C" or "AC")
  let parts = trimmed
    .split(/[,;|]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 1 && /^[A-Da-d1-4]{2,4}$/.test(parts[0])) {
    parts = parts[0].split('');
  }

  const keyMap: Record<string, number> = {
    A: 0,
    B: 1,
    C: 2,
    D: 3,
    '1': 0,
    '2': 1,
    '3': 2,
    '4': 3,
  };

  return Array.from(
    new Set(
      parts.map((part) => {
        const token = part.replace(/[().]/g, '').trim().toUpperCase();
        if (token in keyMap && options[keyMap[token]]) {
          return options[keyMap[token]];
        }
        const matched = options.find((opt) => opt.trim().toLowerCase() === part.toLowerCase());
        return matched || part;
      })
    )
  );
}

export function parseNumericValue(raw: string): number | null {
  const cleaned = String(raw || '')
    .trim()
    .replace(/,/g, '')
    .replace(/^\+/, '');
  if (!cleaned) return null;

  // Handle simple fractions like 3/4 or -1/2
  const fracMatch = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (fracMatch) {
    const num = Number(fracMatch[1]);
    const den = Number(fracMatch[2]);
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
      return num / den;
    }
  }

  if (!/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(cleaned)) {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isNumericalAnswerCorrect(userAnswer: string, correctAnswer: string): boolean {
  const ua = String(userAnswer || '').trim();
  const ca = String(correctAnswer || '').trim();
  if (!ua || !ca) return false;
  if (ua.toLowerCase() === ca.toLowerCase()) return true;

  const uNum = parseNumericValue(ua);
  const cNum = parseNumericValue(ca);
  if (uNum === null || cNum === null) return false;

  const tolerance = Math.max(0.01, Math.abs(cNum) * 0.005);
  return Math.abs(uNum - cNum) <= tolerance;
}

export interface QuestionGradeResult {
  isAttempted: boolean;
  isCorrect: boolean;
  marksAwarded: number;
}

export function gradeQuestionResponse(
  question: Pick<PyqQuestion, 'questionType' | 'options' | 'correctAnswer'>,
  rawUserAnswer: string,
  markCorrect: number,
  markIncorrect: number
): QuestionGradeResult {
  const ua = String(rawUserAnswer || '').trim();
  if (!ua) {
    return { isAttempted: false, isCorrect: false, marksAwarded: 0 };
  }

  if (question.questionType === 'NUMERICAL') {
    const ok = isNumericalAnswerCorrect(ua, question.correctAnswer);
    return {
      isAttempted: true,
      isCorrect: ok,
      marksAwarded: ok ? markCorrect : 0,
    };
  }

  if (question.questionType === 'MULTI_MCQ') {
    const options = question.options || [];
    const correctTokens = parseAnswerTokens(question.correctAnswer, options);
    const userTokens = parseAnswerTokens(ua, options);
    if (userTokens.length === 0) {
      return { isAttempted: false, isCorrect: false, marksAwarded: 0 };
    }

    const correctSet = new Set(correctTokens.map((t) => t.trim().toLowerCase()));
    const userSet = new Set(userTokens.map((t) => t.trim().toLowerCase()));

    let hasWrongChoice = false;
    userSet.forEach((choice) => {
      if (!correctSet.has(choice)) {
        hasWrongChoice = true;
      }
    });

    if (hasWrongChoice) {
      return {
        isAttempted: true,
        isCorrect: false,
        marksAwarded: markIncorrect < 0 ? -2 : 0,
      };
    }

    if (userSet.size === correctSet.size) {
      return {
        isAttempted: true,
        isCorrect: true,
        marksAwarded: markCorrect,
      };
    }

    // JEE Advanced partial marking: +1 for each correct option chosen with zero wrong options
    return {
      isAttempted: true,
      isCorrect: false,
      marksAwarded: Math.min(markCorrect, userSet.size),
    };
  }

  // Standard single-choice MCQ
  const options = question.options || [];
  const correctTokens = parseAnswerTokens(question.correctAnswer, options);
  const userTokens = parseAnswerTokens(ua, options);
  const expected = (correctTokens[0] || question.correctAnswer).trim().toLowerCase();
  const actual = (userTokens[0] || ua).trim().toLowerCase();
  const isCorrect = actual === expected;

  return {
    isAttempted: true,
    isCorrect,
    marksAwarded: isCorrect ? markCorrect : markIncorrect,
  };
}

export interface ExamStandingEstimate {
  projectedScore: number;
  standardMaxScore: number;
  primaryMetricLabel: string;
  primaryMetricValue: string;
  bandLabel: string;
  tierColor: 'emerald' | 'indigo' | 'amber' | 'rose';
}

export function estimateExamStanding(
  exam: ExamType,
  score: number,
  maxScore: number,
  accuracyPercent: number
): ExamStandingEstimate {
  const ratio = maxScore > 0 ? Math.max(0, Math.min(1, score / maxScore)) : 0;
  // Blend score ratio with slight accuracy normalization for small practice sets
  const accBonus = accuracyPercent >= 85 ? 0.02 : accuracyPercent < 40 ? -0.02 : 0;
  const effectiveRatio = Math.max(0, Math.min(1, ratio + accBonus));

  if (exam === 'NEET') {
    const projected = Math.round(effectiveRatio * 720);
    let rankBand = 'AIR 1,50,000+';
    let bandLabel = 'Build NCERT Precision';
    let tierColor: ExamStandingEstimate['tierColor'] = 'rose';

    if (projected >= 685) {
      rankBand = 'AIR < 800';
      bandLabel = 'AIIMS / Top Govt Seat';
      tierColor = 'emerald';
    } else if (projected >= 650) {
      rankBand = 'AIR 800 – 5,500';
      bandLabel = 'Top State Govt Medical';
      tierColor = 'emerald';
    } else if (projected >= 610) {
      rankBand = 'AIR 5,500 – 22,000';
      bandLabel = 'Govt MBBS Safe Zone';
      tierColor = 'indigo';
    } else if (projected >= 550) {
      rankBand = 'AIR 22,000 – 68,000';
      bandLabel = 'Borderline / Push +60 Marks';
      tierColor = 'amber';
    } else if (projected >= 450) {
      rankBand = 'AIR 68,000 – 1,50,000';
      bandLabel = 'Revise Bio NCERT + Error Log';
      tierColor = 'amber';
    }

    return {
      projectedScore: projected,
      standardMaxScore: 720,
      primaryMetricLabel: 'Projected NEET Rank Band',
      primaryMetricValue: `${projected}/720 · ${rankBand}`,
      bandLabel,
      tierColor,
    };
  }

  if (exam === 'JEE_ADV') {
    const projected = Math.round(effectiveRatio * 360);
    let rankBand = 'Rank > 20,000';
    let bandLabel = 'Target Multi-Concept Drills';
    let tierColor: ExamStandingEstimate['tierColor'] = 'rose';

    if (projected >= 250) {
      rankBand = 'AIR < 400';
      bandLabel = 'Top IIT CSE Tier';
      tierColor = 'emerald';
    } else if (projected >= 195) {
      rankBand = 'AIR 400 – 2,200';
      bandLabel = 'Top 7 IIT Core Branches';
      tierColor = 'emerald';
    } else if (projected >= 145) {
      rankBand = 'AIR 2,200 – 6,500';
      bandLabel = 'Strong IIT Admit Zone';
      tierColor = 'indigo';
    } else if (projected >= 105) {
      rankBand = 'AIR 6,500 – 14,500';
      bandLabel = 'IIT Qualifying Band';
      tierColor = 'amber';
    } else if (projected >= 75) {
      rankBand = 'AIR 14,500 – 22,000';
      bandLabel = 'Cut-off Edge';
      tierColor = 'amber';
    }

    return {
      projectedScore: projected,
      standardMaxScore: 360,
      primaryMetricLabel: 'Projected JEE Adv AIR',
      primaryMetricValue: `${projected}/360 · ${rankBand}`,
      bandLabel,
      tierColor,
    };
  }

  // JEE_MAINS out of 300
  const projected = Math.round(effectiveRatio * 300);
  let percentile = 78.0;
  if (projected >= 255) percentile = 99.95;
  else if (projected >= 225) percentile = 99.75;
  else if (projected >= 195) percentile = 99.35;
  else if (projected >= 170) percentile = 98.7;
  else if (projected >= 145) percentile = 97.6;
  else if (projected >= 120) percentile = 95.8;
  else if (projected >= 95) percentile = 92.8;
  else if (projected >= 70) percentile = 86.5;
  else percentile = Math.max(40, Math.round(40 + (projected / 70) * 46));

  let bandLabel = 'Focus Weak Chapters';
  let tierColor: ExamStandingEstimate['tierColor'] = 'rose';
  if (percentile >= 99.0) {
    bandLabel = 'Top NIT CSE / IIIT-H Tier';
    tierColor = 'emerald';
  } else if (percentile >= 97.0) {
    bandLabel = 'NIT Core & JEE Adv Safe';
    tierColor = 'indigo';
  } else if (percentile >= 92.0) {
    bandLabel = 'JEE Adv Cutoff Cleared';
    tierColor = 'amber';
  }

  return {
    projectedScore: projected,
    standardMaxScore: 300,
    primaryMetricLabel: 'Est. JEE Main Percentile',
    primaryMetricValue: `${percentile.toFixed(2)} %ile (${projected}/300)`,
    bandLabel,
    tierColor,
  };
}

export interface ExamCountdownInfo {
  sessionLabel: string;
  daysLeft: number;
  hoursLeft: number;
  targetDateFormatted: string;
}

export function getExamCountdown(targetExam: ExamType, targetYear?: number): ExamCountdownInfo {
  const now = new Date();
  const baseYear = targetYear && targetYear >= now.getFullYear() ? targetYear : now.getFullYear() + 1;

  const candidates: Array<{ date: Date; label: string }> =
    targetExam === 'NEET'
      ? [
          { date: new Date(baseYear, 4, 4, 14, 0, 0), label: `NEET UG ${baseYear} (May)` },
          { date: new Date(baseYear + 1, 4, 3, 14, 0, 0), label: `NEET UG ${baseYear + 1} (May)` },
        ]
      : targetExam === 'JEE_ADV'
        ? [
            { date: new Date(baseYear, 4, 18, 9, 0, 0), label: `JEE Advanced ${baseYear} (May)` },
            { date: new Date(baseYear + 1, 4, 17, 9, 0, 0), label: `JEE Advanced ${baseYear + 1} (May)` },
          ]
        : [
            { date: new Date(baseYear, 0, 22, 9, 0, 0), label: `JEE Main ${baseYear} Jan Session` },
            { date: new Date(baseYear, 3, 2, 9, 0, 0), label: `JEE Main ${baseYear} Apr Session` },
            { date: new Date(baseYear + 1, 0, 22, 9, 0, 0), label: `JEE Main ${baseYear + 1} Jan Session` },
          ];

  const upcoming = candidates.find((c) => c.date.getTime() > now.getTime()) || candidates[candidates.length - 1];
  const diffMs = Math.max(0, upcoming.date.getTime() - now.getTime());
  const daysLeft = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hoursLeft = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  return {
    sessionLabel: upcoming.label,
    daysLeft,
    hoursLeft,
    targetDateFormatted: upcoming.date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
  };
}
