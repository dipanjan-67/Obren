import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  type DocumentData,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import type {
  FlashcardEntity,
  FlashcardProgress,
  FlashcardRating,
  RevisionTestAttempt,
  RevisionTestQuestion,
  ChapterMasteryStats,
} from '../types/flashcards';
import { SYLLABUS_CATALOG, type SyllabusChapter } from './syllabusCatalog';
import { getFlashcardsForChapter } from './chapterFlashcards';

// SM-2 Spaced Repetition calculation
export function calculateSm2(
  rating: FlashcardRating,
  prevInterval = 0,
  prevEaseFactor = 2.5,
  prevRepetitions = 0
): { intervalDays: number; easeFactor: number; repetitionCount: number; nextReviewTimestamp: number; status: 'NEW' | 'LEARNING' | 'REVIEW' | 'MASTERED' } {
  let quality = 4; // Easy
  if (rating === 'AGAIN') quality = 1;
  else if (rating === 'HARD') quality = 3;
  else if (rating === 'EASY') quality = 5;

  let easeFactor = prevEaseFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  let intervalDays = 1;
  let repetitionCount = prevRepetitions;

  if (quality < 3) {
    repetitionCount = 0;
    intervalDays = rating === 'AGAIN' ? 0.007 : 1; // 10 mins or 1 day
  } else {
    repetitionCount += 1;
    if (repetitionCount === 1) {
      intervalDays = rating === 'HARD' ? 1 : 2;
    } else if (repetitionCount === 2) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(prevInterval * easeFactor);
    }
  }

  const now = Date.now();
  const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
  const nextReviewTimestamp = now + intervalMs;

  let status: 'NEW' | 'LEARNING' | 'REVIEW' | 'MASTERED' = 'LEARNING';
  if (repetitionCount >= 4 || intervalDays >= 21) {
    status = 'MASTERED';
  } else if (repetitionCount >= 2) {
    status = 'REVIEW';
  }

  return {
    intervalDays,
    easeFactor: Number(easeFactor.toFixed(2)),
    repetitionCount,
    nextReviewTimestamp,
    status,
  };
}

export function generateRevisionTestQuestions(chapter: SyllabusChapter): RevisionTestQuestion[] {
  const cards = getFlashcardsForChapter(chapter.subject, chapter.name);
  const questions: RevisionTestQuestion[] = [];

  // Generate 15 distinct questions based on chapter flashcards and conceptual variations
  for (let i = 0; i < 15; i++) {
    const card = cards[i % cards.length];
    const qNum = i + 1;
    const diff = i < 5 ? 'EASY' : i < 11 ? 'MEDIUM' : 'HARD';

    let prompt = `In relation to ${chapter.name} (${card.title}), what is the key condition or formula result for standard JEE applications?`;
    let correctAnswer = card.formula;
    let options = [
      card.formula,
      `$2 \\times (${card.formula})$`,
      `$\\frac{1}{2} (${card.formula})$`,
      `Zero / Independent of parameter`,
    ];

    if (i % 3 === 1) {
      prompt = `For a typical problem in ${chapter.name}, applying ${card.title} yields which core relation?`;
      options = [
        `$\\sqrt{${card.formula}}$`,
        card.formula,
        `(${card.formula})^2`,
        `Undefined at boundary`,
      ];
      correctAnswer = card.formula;
    } else if (i % 3 === 2) {
    }

    // Shuffle options deterministically based on index
    options = options.sort((a, b) => (a.length > b.length ? 1 : -1));

    questions.push({
      id: `${chapter.key}-q-${qNum}`,
      prompt,
      options,
      correctAnswer,
      solution: `Step-by-step JEE analysis for ${card.title}: ${card.tip}. Standard derived formula is ${card.formula}.`,
      difficulty: diff,
      concept: card.title,
    });
  }

  return questions;
}
