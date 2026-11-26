import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  FileCheck2,
  FileText,
  Lock,
  Play,
  X,
  XCircle,
} from 'lucide-react';
import {
  fetchStudentAssignedTests,
  fetchStudentTestResults,
  startStudentExamAttempt,
  type StudentAttemptWithDetails,
} from '../lib/teacherClient';
import { MathText } from './MathText';
import { QuestionDiagramViewer } from './QuestionDiagramViewer';
import type { TeacherTest } from '../../server/teacherRoutes';

interface StudentAssignedTestsViewProps {
  studentId: string;
  studentName: string;
  studentEmail?: string;
  onStartExam: (
    test: TeacherTest,
    attemptId: string,
    serverExpiresAt: number,
    initialAnswers?: Record<string, any>
  ) => void;
}

type TestCategory = 'ALL' | 'AVAILABLE' | 'UPCOMING' | 'LIVE' | 'COMPLETED' | 'EXPIRED' | 'RESULTS';

export const StudentAssignedTestsView: React.FC<StudentAssignedTestsViewProps> = ({
  studentId,
  studentName,
  studentEmail,
  onStartExam,
}) => {
  const [tests, setTests] = useState<TeacherTest[]>([]);
  const [attempts, setAttempts] = useState<StudentAttemptWithDetails[]>([]);
  const [activeCategory, setActiveCategory] = useState<TestCategory>('AVAILABLE');
  const [loading, setLoading] = useState(true);
  const [startingTestId, setStartingTestId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reviewingResult, setReviewingResult] = useState<{
    test: TeacherTest;
    attempt: StudentAttemptWithDetails;
  } | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [tList, aList] = await Promise.all([
        fetchStudentAssignedTests(studentId),
        fetchStudentTestResults(studentId),
      ]);
      setTests(tList);
      setAttempts(aList);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [studentId]);

  // Determine category for each test
  const getTestStatus = (t: TeacherTest) => {
    const now = Date.now();
    const myAttempt = attempts.find((a) => a.testId === t.id);

    if (myAttempt) {
      if (t.resultsReleased) return 'RESULTS';
      return 'COMPLETED';
    }

    if (t.startDate && new Date(t.startDate).getTime() > now) {
      return 'UPCOMING';
    }

    if (t.endDate && new Date(t.endDate).getTime() < now) {
      return 'EXPIRED';
    }

    return 'AVAILABLE';
  };

  const handleStartTest = async (t: TeacherTest) => {
    setStartingTestId(t.id);
    setActionError(null);
    try {
      const res = await startStudentExamAttempt(t.id, studentId, studentName, studentEmail);
      onStartExam(res.test, res.attemptId, res.serverExpiresAt, res.answers);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to launch test session.');
    } finally {
      setStartingTestId(null);
    }
  };

  const filteredTests = tests.filter((t) => {
    const status = getTestStatus(t);
    if (activeCategory === 'ALL') return true;
    if (activeCategory === 'RESULTS') return status === 'RESULTS';
    if (activeCategory === 'COMPLETED') return status === 'COMPLETED' || status === 'RESULTS';
    if (activeCategory === 'UPCOMING') return status === 'UPCOMING';
    if (activeCategory === 'EXPIRED') return status === 'EXPIRED';
    if (activeCategory === 'LIVE' || activeCategory === 'AVAILABLE') {
      return status === 'AVAILABLE';
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shadow-lg">
        <div>
          <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider block mb-1">
            Group Examination System
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display">
            My Classroom Tests & Assessments
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
            Strict timed exams prepared by your teachers for your enrolled study groups.
            Features server-synchronized timers, multiple question patterns, and detailed evaluations.
          </p>
        </div>
      </div>

      {actionError && (
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {actionError}
          </span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-rose-500 hover:text-rose-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Category Filter Tabs (6 Categories + All) */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        {(
          [
            ['AVAILABLE', 'Available Tests'],
            ['UPCOMING', 'Upcoming'],
            ['LIVE', 'Live Active'],
            ['COMPLETED', 'Completed'],
            ['EXPIRED', 'Expired'],
            ['RESULTS', 'Released Results'],
            ['ALL', 'All Tests'],
          ] as const
        ).map(([catKey, label]) => {
          const isActive = activeCategory === catKey;
          return (
            <button
              key={catKey}
              type="button"
              onClick={() => setActiveCategory(catKey as TestCategory)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Tests Grid */}
      {loading ? (
        <div className="p-16 text-center text-slate-400 text-xs">
          Loading classroom assessments...
        </div>
      ) : filteredTests.length === 0 ? (
        <div className="p-12 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
          <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <h3 className="text-sm font-bold mb-1">No Tests Found in this Category</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            When your teachers schedule examinations for your study groups, they will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTests.map((test) => {
            const status = getTestStatus(test);
            const myAttempt = attempts.find((a) => a.testId === test.id);

            return (
              <div
                key={test.id}
                className="flex flex-col justify-between p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                      {test.subject}
                    </span>

                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                        status === 'AVAILABLE'
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                          : status === 'RESULTS'
                            ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800'
                            : status === 'COMPLETED'
                              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                              : status === 'UPCOMING'
                                ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {status === 'RESULTS'
                        ? 'Results Released'
                        : status === 'COMPLETED'
                          ? 'Submitted'
                          : status === 'AVAILABLE'
                            ? 'Ready to Start'
                            : status === 'UPCOMING'
                              ? 'Scheduled'
                              : 'Expired'}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1 leading-snug">
                    {test.title}
                  </h3>

                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Assigned Group:{' '}
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {test.targetGroupNames?.[0] || 'All Groups'}
                    </span>
                  </div>

                  {/* Test Specs */}
                  <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-[11px] font-mono mb-4">
                    <div>
                      <span className="text-slate-400 block">Questions</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {test.questions?.length || 0}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Duration</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {test.durationMinutes}m
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Total Marks</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {test.totalMarks}
                      </span>
                    </div>
                  </div>

                  {/* If attempt completed, show summary badge */}
                  {myAttempt && (
                    <div className="mb-4 p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 text-xs flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Your Score:</span>
                      <span className="font-bold font-mono text-indigo-600 dark:text-indigo-400">
                        {myAttempt.score} / {myAttempt.maxScore} ({myAttempt.accuracyPercent}%)
                      </span>
                    </div>
                  )}
                </div>

                {/* Card Action Button */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  {status === 'AVAILABLE' ? (
                    <button
                      type="button"
                      disabled={startingTestId === test.id}
                      onClick={() => handleStartTest(test)}
                      className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm shadow-indigo-500/20"
                    >
                      <Play className="w-3.5 h-3.5" />
                      {startingTestId === test.id ? 'Starting Session...' : 'Start Test Now'}
                    </button>
                  ) : status === 'RESULTS' && myAttempt ? (
                    <button
                      type="button"
                      onClick={() => setReviewingResult({ test, attempt: myAttempt })}
                      className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <FileCheck2 className="w-3.5 h-3.5" />
                      View Solutions & Results
                    </button>
                  ) : status === 'COMPLETED' ? (
                    <div className="text-center py-2 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5 font-medium">
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      Submitted · Results Pending Release
                    </div>
                  ) : status === 'UPCOMING' ? (
                    <div className="text-center py-2 text-xs text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1.5 font-medium">
                      <Clock className="w-4 h-4" />
                      Starts {test.startDate ? new Date(test.startDate).toLocaleString() : 'soon'}
                    </div>
                  ) : (
                    <div className="text-center py-2 text-xs text-slate-400 flex items-center justify-center gap-1.5 font-medium">
                      <Lock className="w-3.5 h-3.5" />
                      Exam Window Expired
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detailed Solutions & Evaluation Modal */}
      {reviewingResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-3xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl max-h-[88vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-4">
              <div>
                <span className="text-[11px] font-bold uppercase text-purple-600 dark:text-purple-400">
                  Released Answer Key & Evaluation
                </span>
                <h3 className="text-xl font-black font-display text-slate-900 dark:text-slate-100 mt-0.5">
                  {reviewingResult.test.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {reviewingResult.test.subject} · {reviewingResult.test.teacherName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewingResult(null)}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {/* Summary Scorecard */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 text-center">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Score</div>
                  <div className="text-lg font-black font-mono text-indigo-600 dark:text-indigo-400">
                    {reviewingResult.attempt.score}/{reviewingResult.attempt.maxScore}
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Accuracy</div>
                  <div className="text-lg font-black font-mono">
                    {reviewingResult.attempt.accuracyPercent}%
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 text-center">
                  <div className="text-[10px] text-emerald-700 dark:text-emerald-400 uppercase font-semibold">
                    Correct
                  </div>
                  <div className="text-lg font-black font-mono text-emerald-600">
                    {reviewingResult.attempt.correctCount}
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-center">
                  <div className="text-[10px] text-rose-700 dark:text-rose-400 uppercase font-semibold">
                    Incorrect
                  </div>
                  <div className="text-lg font-black font-mono text-rose-600">
                    {reviewingResult.attempt.incorrectCount}
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Skipped</div>
                  <div className="text-lg font-black font-mono text-slate-500">
                    {reviewingResult.attempt.unattemptedCount}
                  </div>
                </div>
              </div>

              {reviewingResult.attempt.teacherFeedback && (
                <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-xs">
                  <span className="font-bold text-amber-800 dark:text-amber-300 block mb-1">
                    Teacher Feedback:
                  </span>
                  <p className="text-slate-700 dark:text-slate-200">
                    {reviewingResult.attempt.teacherFeedback}
                  </p>
                </div>
              )}

              {/* Question-wise Breakdown */}
              <div className="space-y-4">
                {(reviewingResult.attempt.questions && reviewingResult.attempt.questions.length > 0
                  ? reviewingResult.attempt.questions
                  : reviewingResult.test.questions
                ).map((q, idx) => {
                  const qr = reviewingResult.attempt.questionResults?.find(
                    (r) => r.questionId === q.id
                  );
                  const isUnattempted =
                    qr?.userAnswer === null ||
                    qr?.userAnswer === undefined ||
                    String(qr?.userAnswer).trim() === '';
                  const isCorrect = Boolean(qr?.isCorrect);

                  return (
                    <div
                      key={q.id || idx}
                      className={`p-4 rounded-2xl border text-xs space-y-3 ${
                        isUnattempted
                          ? 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30'
                          : isCorrect
                            ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20'
                            : 'border-rose-200 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/20'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                          Question {idx + 1} · {q.type.replace('_', ' ')}
                        </span>
                        <span
                          className={`font-mono font-bold inline-flex items-center gap-1 ${
                            isUnattempted
                              ? 'text-slate-500'
                              : isCorrect
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {isUnattempted ? (
                            'Unattempted (0)'
                          ) : isCorrect ? (
                            <>
                              <CheckCircle className="w-3.5 h-3.5" />
                              +{qr?.marksAwarded ?? q.positiveMarks} Marks
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3.5 h-3.5" />
                              {qr?.marksAwarded ?? q.negativeMarks} Marks
                            </>
                          )}
                        </span>
                      </div>

                      <div className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed">
                        <MathText text={q.prompt} />
                      </div>

                      {q.imageUrl && (
                        <img
                          src={q.imageUrl}
                          alt={`Question ${idx + 1} figure`}
                          className="max-h-56 rounded-xl border border-slate-200 dark:border-slate-700"
                        />
                      )}
                      {q.diagramSvg && (
                        <QuestionDiagramViewer diagramSvg={q.diagramSvg} />
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px] p-3 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800">
                        <div>
                          Your Answer:{' '}
                          <span className="font-bold">
                            {isUnattempted
                              ? 'Not Attempted'
                              : Array.isArray(qr?.userAnswer)
                                ? qr.userAnswer.join(', ')
                                : String(qr?.userAnswer)}
                          </span>
                        </div>
                        <div>
                          Correct Answer:{' '}
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            {Array.isArray(qr?.correctAnswer ?? q.correctAnswer)
                              ? (qr?.correctAnswer ?? q.correctAnswer).join(', ')
                              : String(qr?.correctAnswer ?? q.correctAnswer)}
                          </span>
                        </div>
                      </div>

                      {(qr?.explanation || q.explanation) && (
                        <div className="p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40">
                          <span className="font-bold text-indigo-700 dark:text-indigo-300 block mb-1">
                            Solution:
                          </span>
                          <MathText text={qr?.explanation || q.explanation || ''} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setReviewingResult(null)}
                className="px-5 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-bold hover:bg-slate-800 cursor-pointer"
              >
                Close Solutions
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
