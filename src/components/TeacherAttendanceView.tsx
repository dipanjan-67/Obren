import React, { useMemo } from 'react';
import { Users, Calendar, Clock, CheckCircle2, TrendingUp } from 'lucide-react';
import type { TeacherProfile, TuitionSession } from '../types/studytrack';

interface TeacherAttendanceViewProps {
  teachers: TeacherProfile[];
  sessions: TuitionSession[];
}

export const TeacherAttendanceView: React.FC<TeacherAttendanceViewProps> = ({
  teachers,
  sessions,
}) => {
  const completedSessions = useMemo(() => {
    return sessions.filter((s) => s.status === 'COMPLETED');
  }, [sessions]);

  // Teacher statistics
  const teacherStats = useMemo(() => {
    const map: Record<string, { totalClasses: number; totalMinutes: number }> = {};
    completedSessions.forEach((s) => {
      if (!map[s.teacherId]) {
        map[s.teacherId] = { totalClasses: 0, totalMinutes: 0 };
      }
      map[s.teacherId].totalClasses += 1;
      map[s.teacherId].totalMinutes += s.actualDurationMinutes || 0;
    });
    return map;
  }, [completedSessions]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold font-display text-slate-900 dark:text-white">
          Teacher Attendance & History
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Review arrival and departure timestamp logs and total study hours per teacher.
        </p>
      </div>

      {/* Summary Cards per Teacher */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {teachers.map((t) => {
          const stats = teacherStats[t.id] || { totalClasses: 0, totalMinutes: 0 };
          const hours = (stats.totalMinutes / 60).toFixed(1);
          return (
            <div
              key={t.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${t.avatarColor} text-white flex items-center justify-center font-bold font-display`}>
                  {t.name.charAt(0)}
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                    {t.name}
                  </h4>
                  <span className="text-xs text-indigo-600 dark:text-indigo-400 font-mono">
                    {t.subject}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs font-mono">
                <div>
                  <div className="text-slate-400 text-[10px]">Completed</div>
                  <div className="text-base font-bold text-slate-900 dark:text-white">
                    {stats.totalClasses} classes
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px]">Total Duration</div>
                  <div className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                    {hours} hrs
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Attendance History Log Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="font-bold text-sm text-slate-900 dark:text-white font-display flex items-center gap-2">
          <Clock className="w-4 h-4 text-emerald-500" />
          <span>Completed Tuition Attendance Logs ({completedSessions.length})</span>
        </h3>

        {completedSessions.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
            No completed attendance logs recorded yet. Use the "Teacher Came" and "Teacher Gone" buttons in the Tuition Planner.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-3 pr-4">Teacher & Subject</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Scheduled Time</th>
                  <th className="py-3 px-4">Teacher Came</th>
                  <th className="py-3 px-4">Teacher Gone</th>
                  <th className="py-3 pl-4 text-right">Actual Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                {completedSessions.map((s) => (
                  <tr key={s.id}>
                    <td className="py-3 pr-4 font-sans font-semibold text-slate-900 dark:text-white">
                      {s.teacherName} <span className="text-slate-400 font-normal">({s.subject})</span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{s.date}</td>
                    <td className="py-3 px-4 text-slate-500">{s.startTime} – {s.endTime}</td>
                    <td className="py-3 px-4 text-emerald-600 dark:text-emerald-400 font-bold">{s.teacherCameAt || '—'}</td>
                    <td className="py-3 px-4 text-rose-600 dark:text-rose-400 font-bold">{s.teacherGoneAt || '—'}</td>
                    <td className="py-3 pl-4 text-right font-bold text-indigo-600 dark:text-indigo-400">
                      {s.actualDurationMinutes} mins
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
