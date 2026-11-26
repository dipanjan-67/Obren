export type FlashcardDifficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type FlashcardRating = 'AGAIN' | 'HARD' | 'EASY';
export type FlashcardCardStatus = 'NEW' | 'LEARNING' | 'REVIEW' | 'MASTERED';

export interface FlashcardEntity {
  id: string;
  ownerId?: string; // admin or user uid
  subject: string;
  classLevel: '11' | '12';
  chapter: string;
  topic: string;
  question: string;
  answer: string;
  tip?: string;
  difficulty: FlashcardDifficulty;
  isOfficial: boolean;
  createdAt: number;
}

export interface FlashcardProgress {
  id: string; // userId_cardId
  userId: string;
  cardId: string;
  intervalDays: number;
  easeFactor: number;
  repetitionCount: number;
  nextReviewTimestamp: number;
  lastRating?: FlashcardRating;
  status: FlashcardCardStatus;
  difficulty: FlashcardDifficulty;
  updatedAt: number;
}

export interface RevisionTestQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctAnswer: string;
  solution: string;
  difficulty: FlashcardDifficulty;
  concept: string;
}

export interface RevisionTestAttempt {
  id: string;
  userId: string;
  chapter: string;
  subject: string;
  score: number;
  maxScore: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  accuracyPercent: number;
  timeSpentSeconds: number;
  questionResults: {
    questionId: string;
    userAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
  }[];
  createdAt: number;
}

export interface ChapterMasteryStats {
  chapter: string;
  subject: string;
  classLevel: '11' | '12';
  totalCards: number;
  reviewedCards: number;
  masteredCards: number;
  difficultCards: number;
  dueTodayCount: number;
  masteryPercentage: number;
  latestTestScore?: number;
  nextReviewTimestamp?: number;
}
