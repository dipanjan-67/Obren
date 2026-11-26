import React from 'react';
import { MathText } from './MathText';
import type { PyqQuestion } from '../types/obren';

interface QuestionStructuredBlocksProps {
  question: PyqQuestion;
  subtleSurfaceBg?: string;
  borderColor?: string;
}

export const QuestionStructuredBlocks: React.FC<QuestionStructuredBlocksProps> = ({
  question,
  subtleSurfaceBg,
  borderColor,
}) => {
  const hasPassage = Boolean(question.passage && question.passage.trim());
  const hasAssertionReason = Boolean(question.assertionText || question.reasonText);
  const hasStatements = Array.isArray(question.statements) && question.statements.length > 0;
  const hasMatch =
    Array.isArray(question.matchLeft) &&
    question.matchLeft.length > 0 &&
    Array.isArray(question.matchRight) &&
    question.matchRight.length > 0;

  if (!hasPassage && !hasAssertionReason && !hasStatements && !hasMatch) {
    return null;
  }

  const boxStyle: React.CSSProperties | undefined =
    subtleSurfaceBg || borderColor
      ? {
          ...(subtleSurfaceBg ? { backgroundColor: subtleSurfaceBg } : {}),
          ...(borderColor ? { borderColor } : {}),
        }
      : undefined;

  return (
    <div className="space-y-3 max-w-3xl">
      {hasPassage && (
        <div
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3.5 text-xs sm:text-sm leading-relaxed space-y-1"
          style={boxStyle}
        >
          <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            Case Study / Comprehension Passage
          </div>
          <div className="whitespace-pre-wrap">
            <MathText text={question.passage || ''} />
          </div>
        </div>
      )}

      {hasAssertionReason && (
        <div
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3.5 text-xs sm:text-sm space-y-2"
          style={boxStyle}
        >
          {question.assertionText && (
            <div>
              <span className="font-bold text-indigo-600 dark:text-indigo-400 mr-1.5">
                Assertion (A):
              </span>
              <MathText text={question.assertionText} />
            </div>
          )}
          {question.reasonText && (
            <div>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 mr-1.5">
                Reason (R):
              </span>
              <MathText text={question.reasonText} />
            </div>
          )}
        </div>
      )}

      {hasStatements && (
        <div
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3.5 text-xs sm:text-sm space-y-2"
          style={boxStyle}
        >
          {question.statements!.map((stmt, idx) => (
            <div key={idx}>
              <span className="font-bold text-indigo-600 dark:text-indigo-400 mr-1.5">
                Statement {idx === 0 ? 'I' : idx === 1 ? 'II' : idx + 1}:
              </span>
              <MathText text={stmt} />
            </div>
          ))}
        </div>
      )}

      {hasMatch && (
        <div
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 overflow-hidden text-xs sm:text-sm"
          style={boxStyle}
        >
          <div className="grid grid-cols-2 border-b border-slate-200 dark:border-slate-700 font-bold text-[11px] font-mono uppercase tracking-wider px-3.5 py-2 bg-slate-100/70 dark:bg-slate-800">
            <div>Column I</div>
            <div>Column II</div>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {Array.from({
              length: Math.max(question.matchLeft!.length, question.matchRight!.length),
            }).map((_, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-3 px-3.5 py-2">
                <div>
                  <span className="font-mono font-bold mr-1.5 text-indigo-600 dark:text-indigo-400">
                    ({String.fromCharCode(65 + idx)})
                  </span>
                  <MathText text={question.matchLeft![idx] || ''} />
                </div>
                <div>
                  <span className="font-mono font-bold mr-1.5 text-emerald-600 dark:text-emerald-400">
                    ({['p', 'q', 'r', 's', 't', 'u'][idx] || idx + 1})
                  </span>
                  <MathText text={question.matchRight![idx] || ''} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
