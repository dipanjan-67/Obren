import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { PieChart as PieIcon, TrendingUp, Clock, Calendar } from 'lucide-react';
import type { StopwatchSessionRecord, SubjectType } from '../types/studytrack';

interface AnalyticsViewProps {
  stopwatchRecords: StopwatchSessionRecord[];
}

const SUBJECT_COLORS: Record<string, string> = {
  Physics: '#6366F1',
  Mathematics: '#10B981',
  Chemistry: '#F59E0B',
  Biology: '#EC4899',
  'Computer Science': '#8B5CF6',
  English: '#3B82F6',
  Other: '#64748B',
};

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ stopwatchRecords }) => {
  // Aggregate subject stats
  const subjectData = useMemo(() => {
    const map: Record<string, number> = {};
    stopwatchRecords.forEach((r) => {
      if (!map[r.subject]) map[r.subject] = 0;
      map[r.subject] += r.durationSeconds;
    });

    return Object.entries(map).map(([subject, totalSecs]) => ({
      subject,
      hours: Number((totalSecs / 3600).toFixed(2)),
      minutes: Math.round(totalSecs / 60),
    }));
  }, [stopwatchRecords]);

  // Aggregate type stats (Self study vs Tuition)
  const typeData = useMemo(() => {
    let selfSecs = 0;
    let tuitionSecs = 0;

    stopwatchRecords.forEach((r) => {
      if (r.type === 'TUITION') tuitionSecs += r.durationSeconds;
      else selfSecs += r.durationSeconds;
    });

    return [
      { name: 'Self Study', hours: Number((selfSecs / 3600).toFixed(2)), color: '#6366F1' },
      { name: 'Tuition Study', hours: Number((tuitionSecs / 3600).toFixed(2)), color: '#10B981' },
    ];
  }, [stopwatchRecords]);

  const totalStudyHours = useMemo(() => {
    const totalSecs = stopwatchRecords.reduce((acc, r) => acc + r.durationSeconds, 0);
    return (totalSecs / 3600).toFixed(1);
  }, [stopwatchRecords]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold font-display text-slate-900 dark:text-white">
          Study Time Analytics & Reports
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Comprehensive graphs and subject-wise breakdown of your total study hours.
        </p>
      </div>

      {/* Overview Metric */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">Total Recorded Study Hours</div>
          <div className="text-3xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
            {totalStudyHours} <span className="text-xs font-normal text-slate-400">hrs</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">Total Sessions Logged</div>
          <div className="text-3xl font-bold font-mono text-slate-900 dark:text-white">
            {stopwatchRecords.length}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">Subjects Tracked</div>
          <div className="text-3xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {subjectData.length}
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Subject Bar Chart */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white font-display">
            Subject-wise Study Duration (Hours)
          </h3>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subjectData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.15} />
                <XAxis dataKey="subject" tick={{ fontSize: 11 }} />
                <YAxis unit="h" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderColor: '#334155',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#F8FAFC',
                  }}
                  formatter={(val: any) => [`${val} hrs`, 'Study Time']}
                />
                <Bar dataKey="hours" fill="#6366F1" radius={[6, 6, 0, 0]}>
                  {subjectData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={SUBJECT_COLORS[entry.subject] || '#6366F1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Self Study vs Tuition Distribution */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white font-display">
            Self-Study vs Tuition Breakdown
          </h3>

          <div className="h-64 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={typeData}
                  dataKey="hours"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }: { name?: string; percent?: number }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {typeData.map((entry, index) => (
                    <Cell key={`pie-cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderColor: '#334155',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#F8FAFC',
                  }}
                  formatter={(val: any) => [`${val} hrs`, 'Duration']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Study Sessions Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="font-bold text-sm text-slate-900 dark:text-white font-display">
          Recent Completed Study & Tuition Sessions ({stopwatchRecords.length})
        </h3>

        {stopwatchRecords.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
            No study sessions recorded yet. Use the Stopwatch or complete tuition attendance.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-3 pr-4">Title / Subject</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Start Time</th>
                  <th className="py-3 pl-4 text-right">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                {stopwatchRecords.map((r) => (
                  <tr key={r.id}>
                    <td className="py-3 pr-4 font-sans font-semibold text-slate-900 dark:text-white">
                      {r.taskTitle || r.subject} <span className="text-slate-400 font-normal">({r.subject})</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        r.type === 'TUITION'
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                          : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                      }`}>
                        {r.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{r.date}</td>
                    <td className="py-3 px-4 text-slate-500">{r.startTime}</td>
                    <td className="py-3 pl-4 text-right font-bold text-indigo-600 dark:text-indigo-400">
                      {Math.round(r.durationSeconds / 60)} mins
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
