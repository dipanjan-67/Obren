import { jsPDF } from 'jspdf';
import { estimateExamStanding } from './examMetrics';
import type { PlannerTask, PyqQuestion, StudyFolder, StudyNote, TestAttempt } from '../types/obren';
import { EXAM_LABELS } from '../types/obren';

export function exportNotesAsPdf(
  title: string,
  notes: StudyNote[],
  folder?: StudyFolder
) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  let y = 56;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 54) {
      doc.addPage();
      y = 56;
    }
  };

  // Header band
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 84, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(`OBREN — ${title}`, margin, 38);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const subtitle = folder
    ? `${folder.exam.replace('_', ' ')} · ${folder.subject} · Exported ${new Date().toLocaleDateString()}`
    : `Organized Study Notes · Exported ${new Date().toLocaleDateString()}`;
  doc.text(subtitle, margin, 58);

  y = 112;

  if (notes.length === 0) {
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(12);
    doc.text('No notes in this selection yet.', margin, y);
  } else {
    notes.forEach((note, index) => {
      ensureSpace(70);
      doc.setTextColor(79, 70, 229);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(
        `${String(index + 1).padStart(2, '0')}. ${note.subject}${note.topic ? ` / ${note.topic}` : ''}`,
        margin,
        y
      );
      y += 18;

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      const titleLines = doc.splitTextToSize(note.title, maxWidth) as string[];
      titleLines.forEach((line) => {
        ensureSpace(20);
        doc.text(line, margin, y);
        y += 18;
      });

      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Author: ${note.authorName}`, margin, y);
      y += 16;

      doc.setTextColor(30, 41, 59);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      const paragraphs = note.content.split('\n');
      paragraphs.forEach((para) => {
        if (!para.trim()) {
          y += 8;
          return;
        }
        const wrapped = doc.splitTextToSize(para, maxWidth) as string[];
        wrapped.forEach((line) => {
          ensureSpace(16);
          doc.text(line, margin, y);
          y += 15;
        });
      });

      y += 14;
      ensureSpace(16);
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y, pageWidth - margin, y);
      y += 22;
    });
  }

  const safeFile = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48) || 'obren-notes';
  doc.save(`${safeFile}.pdf`);
}

function stripLatexMarkers(text: string): string {
  return String(text || '')
    .replace(/\$\$/g, '')
    .replace(/\$/g, '')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\\ln/g, 'ln')
    .replace(/\\sin/g, 'sin')
    .replace(/\\cos/g, 'cos')
    .replace(/\\tan/g, 'tan')
    .replace(/\\theta/g, 'theta')
    .replace(/\\pi/g, 'pi')
    .replace(/\\times/g, 'x')
    .replace(/\\cdot/g, '.')
    .replace(/\\Omega/g, 'Ohm')
    .replace(/\\circ/g, ' deg')
    .replace(/\\to|\\rightarrow/g, '->')
    .replace(/\\rightleftharpoons/g, '<=>')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function exportAttemptReportPdf(
  attempt: Omit<TestAttempt, 'id' | 'createdAt'>,
  questions?: PyqQuestion[]
) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 44;
  const maxWidth = pageWidth - margin * 2;
  let y = 52;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 48) {
      doc.addPage();
      y = 48;
    }
  };

  const standing = estimateExamStanding(
    attempt.exam,
    attempt.score,
    attempt.maxScore,
    attempt.accuracyPercent
  );

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 92, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(`OBREN Test Scorecard & Solutions`, margin, 36);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${EXAM_LABELS[attempt.exam]} · ${attempt.title}`, margin, 56);
  doc.text(
    `Generated ${new Date().toLocaleDateString()} · Time Spent: ${Math.floor(attempt.timeSpentSeconds / 60)}m ${attempt.timeSpentSeconds % 60}s`,
    margin,
    72
  );

  y = 118;

  // Scorecard Summary Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, maxWidth, 74, 8, 8, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Score: ${attempt.score} / ${attempt.maxScore}`, margin + 16, y + 24);
  doc.text(`Accuracy: ${attempt.accuracyPercent}%`, margin + 175, y + 24);
  doc.text(
    `Correct: ${attempt.correctCount}  Wrong: ${attempt.incorrectCount || 0}  Total: ${attempt.totalQuestions}`,
    margin + 305,
    y + 24
  );

  doc.setTextColor(79, 70, 229);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`${standing.primaryMetricLabel}: ${standing.primaryMetricValue} (${standing.bandLabel})`, margin + 16, y + 52);

  y += 96;

  // Subject Breakdown
  if (attempt.subjectStats && Object.keys(attempt.subjectStats).length > 0) {
    ensureSpace(64);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Subject Performance Breakdown', margin, y);
    y += 18;

    Object.entries(attempt.subjectStats).forEach(([sub, stat]) => {
      ensureSpace(18);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);
      doc.text(
        `${sub}: ${stat.correct}/${stat.total} correct · ${stat.incorrect} incorrect · Score ${stat.score}`,
        margin + 8,
        y
      );
      y += 16;
    });
    y += 12;
  }

  // Detailed Solutions
  const results = attempt.questionResults || [];
  if (results.length > 0 || (questions && questions.length > 0)) {
    ensureSpace(32);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Question-by-Question Review & Solutions', margin, y);
    y += 20;

    const totalRows = Math.max(results.length, questions?.length || 0);
    for (let i = 0; i < totalRows; i += 1) {
      const q = questions?.[i];
      const res = results[i];
      ensureSpace(85);

      const statusText = res?.isAttempted
        ? res.isCorrect
          ? `CORRECT (+${res.marksAwarded})`
          : `INCORRECT (${res.marksAwarded})`
        : 'UNATTEMPTED (0)';

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      if (res?.isCorrect) doc.setTextColor(5, 150, 105);
      else if (res?.isAttempted) doc.setTextColor(225, 29, 72);
      else doc.setTextColor(100, 116, 139);

      doc.text(
        `Q${i + 1}. [${q?.subject || res?.subject || 'General'} · ${q?.topic || res?.topic || 'Topic'}] — ${statusText} (${res?.timeSpentSeconds ?? 0}s)`,
        margin,
        y
      );
      y += 15;

      if (q?.prompt) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(30, 41, 59);
        const promptLines = doc.splitTextToSize(stripLatexMarkers(q.prompt), maxWidth) as string[];
        promptLines.forEach((line) => {
          ensureSpace(14);
          doc.text(line, margin, y);
          y += 13;
        });
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `Your Answer: ${stripLatexMarkers(res?.userAnswer || 'Not Attempted')}   |   Correct Answer: ${stripLatexMarkers(q?.correctAnswer || res?.correctAnswer || '-')}`,
        margin,
        y
      );
      y += 14;

      if (q?.solution) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(51, 65, 85);
        const solLines = doc.splitTextToSize(
          `Solution: ${stripLatexMarkers(q.solution)}`,
          maxWidth
        ) as string[];
        solLines.forEach((line) => {
          ensureSpace(13);
          doc.text(line, margin, y);
          y += 12;
        });
      }

      y += 10;
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y, pageWidth - margin, y);
      y += 16;
    }
  }

  const safeFile =
    attempt.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 44) || 'obren-scorecard';
  doc.save(`${safeFile}-report.pdf`);
}

export function exportTestDeadlinesIcs(tasks: PlannerTask[]) {
  const upcoming = tasks.filter((t) => t.category === 'TEST_PLAN' && !t.completed && t.scheduledDate);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OBREN//JEE NEET Prep//EN',
  ];

  upcoming.forEach((task) => {
    const datePart = (task.scheduledDate || '').replace(/-/g, '');
    if (!datePart) return;
    const timePart = (task.scheduledTime || '09:00').replace(':', '') + '00';
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${task.id}@obren.study`);
    lines.push(`DTSTART:${datePart}T${timePart}`);
    lines.push(`SUMMARY:OBREN Test: ${task.title}`);
    lines.push(`DESCRIPTION:${task.exam || 'Exam'} - ${task.subject || 'All Subjects'} (${task.testMode || 'Scheduled'})`);
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'obren-test-deadlines.ics';
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCurriculumMasteryAsPdf(
  examName: string,
  subjectReports: Array<{
    subject: string;
    completionPct: number;
    units: Array<{
      unit: string;
      completedCount: number;
      chapters: Array<{ name: string; classLevel: string; status: string; completionPct: number }>;
    }>;
  }>
) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  let y = 56;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 54) {
      doc.addPage();
      y = 56;
    }
  };

  // Header band
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 84, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(`OBREN — Chapter Mastery & Curriculum Summary`, margin, 38);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Exam: ${examName} · Exported on ${new Date().toLocaleDateString()}`, margin, 58);

  y = 112;

  subjectReports.forEach((sr) => {
    ensureSpace(40);
    doc.setTextColor(79, 70, 229);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`${sr.subject} Overview (${sr.completionPct}% Completed)`, margin, y);
    y += 20;

    sr.units.forEach((unit) => {
      ensureSpace(30);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`Unit: ${unit.unit} (${unit.completedCount}/${unit.chapters.length} chapters done)`, margin, y);
      y += 16;

      unit.chapters.forEach((ch) => {
        ensureSpace(20);
        doc.setTextColor(71, 85, 105);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const statusStr = ch.status === 'COMPLETED' ? '[COMPLETED]' : ch.status === 'IN_PROGRESS' ? '[IN PROGRESS]' : '[REMAINING]';
        doc.text(`  • ${ch.name} (Class ${ch.classLevel}) - ${statusStr} - ${ch.completionPct}%`, margin, y);
        y += 14;
      });
      y += 6;
    });
    y += 14;
  });

  doc.save(`curriculum-mastery-${examName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`);
}

