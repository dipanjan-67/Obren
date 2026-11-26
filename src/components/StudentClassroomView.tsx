import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  GraduationCap,
  Key,
  Layers,
  MessageSquare,
  Plus,
  Radio,
  Search,
  Users,
  Video,
} from 'lucide-react';
import {
  fetchStudentGroupResources,
  fetchStudentLiveClasses,
  fetchStudentMyGroups,
  studentJoinGroup,
} from '../lib/teacherClient';
import type {
  ClassAnnouncement,
  ClassGroup,
  LiveClassRecord,
  StudyMaterial,
} from '../../server/teacherRoutes';
import { StudyGroupChatBox } from './StudyGroupChatBox';

interface StudentClassroomViewProps {
  studentId: string;
  studentName: string;
  studentEmail?: string;
  onJoinLiveClass: (liveClass: LiveClassRecord) => void;
}

export const StudentClassroomView: React.FC<StudentClassroomViewProps> = ({
  studentId,
  studentName,
  studentEmail,
  onJoinLiveClass,
}) => {
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [liveClasses, setLiveClasses] = useState<LiveClassRecord[]>([]);
  const [announcements, setAnnouncements] = useState<ClassAnnouncement[]>([]);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [loading, setLoading] = useState(true);

  // Join group dialog
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [inviteKey, setInviteKey] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinSuccess, setJoinSuccess] = useState<string | null>(null);

  const [selectedGroup, setSelectedGroup] = useState<ClassGroup | null>(null);
  const [groupDetailTab, setGroupDetailTab] = useState<'CHAT' | 'RESOURCES'>('CHAT');

  const loadData = async () => {
    try {
      setLoading(true);
      const [gList, lList, resources] = await Promise.all([
        fetchStudentMyGroups(studentId),
        fetchStudentLiveClasses(studentId),
        fetchStudentGroupResources(studentId),
      ]);
      setGroups(gList);
      setLiveClasses(lList);
      setAnnouncements(resources.announcements);
      setMaterials(resources.materials);
      if (gList.length > 0 && !selectedGroup) {
        setSelectedGroup(gList[0]);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      // Refresh live classes & resources periodically so students see live status immediately
      fetchStudentLiveClasses(studentId).then(setLiveClasses).catch(() => {});
    }, 12000);
    return () => clearInterval(interval);
  }, [studentId]);

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteKey.trim()) return;
    setJoining(true);
    setJoinError(null);
    setJoinSuccess(null);
    try {
      const res = await studentJoinGroup(inviteKey.trim(), studentId, studentName, studentEmail);
      setJoinSuccess(`Successfully joined ${res.group.name}!`);
      setInviteKey('');
      await loadData();
      setTimeout(() => {
        setJoinModalOpen(false);
        setJoinSuccess(null);
      }, 1500);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Invalid invitation key.');
    } finally {
      setJoining(false);
    }
  };

  // Check if a group is currently live
  const getActiveLiveClassForGroup = (groupId: string): LiveClassRecord | undefined => {
    return liveClasses.find((lc) => lc.groupId === groupId && lc.status === 'LIVE');
  };

  const groupAnnouncements = announcements.filter(
    (a) =>
      !a.groupId ||
      a.groupId === selectedGroup?.id ||
      (a.groupId === 'ALL' && a.teacherId === selectedGroup?.teacherId)
  );
  const groupMaterials = materials.filter(
    (m) =>
      !m.groupId ||
      m.groupId === selectedGroup?.id ||
      (m.groupId === 'ALL' && m.teacherId === selectedGroup?.teacherId)
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 text-white shadow-lg">
        <div>
          <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider block mb-1">
            Classrooms & Groups
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display">
            Interactive Live Learning & Study Groups
          </h1>
          <p className="text-xs sm:text-sm text-indigo-200/80 mt-1 max-w-xl">
            Join your teacher's private classrooms, access shared chapter notes, attend Google Meet
            live sessions, and stay updated with class announcements.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setJoinModalOpen(true);
            setJoinError(null);
            setJoinSuccess(null);
          }}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-sm shadow-md shadow-indigo-500/30 transition-all cursor-pointer whitespace-nowrap self-start sm:self-center"
        >
          <Plus className="w-4 h-4" />
          Join a Group with Code
        </button>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Joined Classrooms List */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              My Joined Groups ({groups.length})
            </h2>
          </div>

          {groups.length === 0 ? (
            <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
              <GraduationCap className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <h3 className="text-sm font-bold mb-1">No Groups Joined Yet</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 max-w-xs mx-auto">
                Ask your teacher for their group invitation code (e.g. PHY28-X92K) to unlock live classes and tests.
              </p>
              <button
                type="button"
                onClick={() => setJoinModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 cursor-pointer"
              >
                Enter Invitation Code
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => {
                const activeLive = getActiveLiveClassForGroup(group.id);
                const isSelected = selectedGroup?.id === group.id;

                return (
                  <div
                    key={group.id}
                    onClick={() => setSelectedGroup(group)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer relative ${
                      isSelected
                        ? 'border-indigo-600 dark:border-indigo-500 bg-white dark:bg-slate-900 shadow-md ring-1 ring-indigo-500/20'
                        : 'border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                            {group.name}
                          </h3>
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-semibold">
                            {group.subject}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Teacher: <span className="font-medium text-slate-700 dark:text-slate-300">{group.teacherName}</span>
                          {group.classBatch && ` · ${group.classBatch}`}
                        </div>
                      </div>

                      {activeLive && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500 text-white animate-pulse">
                          <Radio className="w-3 h-3" />
                          LIVE NOW
                        </span>
                      )}
                    </div>

                    {activeLive && (
                      <div className="mt-3 pt-3 border-t border-rose-100 dark:border-rose-950/60 flex items-center justify-between">
                        <span className="text-xs text-rose-600 dark:text-rose-400 font-semibold truncate">
                          {activeLive.title || 'Live Lecture in Session'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onJoinLiveClass(activeLive);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Video className="w-3.5 h-3.5" />
                          Join Live Class
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Group Details, Announcements & Materials */}
        <div className="lg:col-span-7 space-y-6">
          {selectedGroup ? (
            <>
              {/* Selected Group Header */}
              <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <h2 className="text-xl font-black font-display text-slate-900 dark:text-slate-100">
                      {selectedGroup.name}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Teacher: {selectedGroup.teacherName} · Subject: {selectedGroup.subject}
                    </p>
                  </div>

                  {getActiveLiveClassForGroup(selectedGroup.id) ? (
                    <button
                      type="button"
                      onClick={() => {
                        const lc = getActiveLiveClassForGroup(selectedGroup.id);
                        if (lc) onJoinLiveClass(lc);
                      }}
                      className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-rose-500/20 cursor-pointer animate-pulse"
                    >
                      <Video className="w-4 h-4" />
                      Join Active Class Now
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span>No active class right now</span>
                    </div>
                  )}
                </div>

                {selectedGroup.description && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-4 leading-relaxed">
                    {selectedGroup.description}
                  </p>
                )}

                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setGroupDetailTab('CHAT')}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                      groupDetailTab === 'CHAT'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Group Chat</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupDetailTab('RESOURCES')}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                      groupDetailTab === 'RESOURCES'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>
                      Notices &amp; Materials ({groupAnnouncements.length + groupMaterials.length})
                    </span>
                  </button>
                </div>
              </div>

              {groupDetailTab === 'CHAT' ? (
                <StudyGroupChatBox
                  groupId={selectedGroup.id}
                  groupName={selectedGroup.name}
                  subject={selectedGroup.subject}
                  role="STUDENT"
                  userId={studentId}
                  userName={studentName}
                />
              ) : (
                <>

              {/* Announcements Section */}
              <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Classroom Announcements ({groupAnnouncements.length})
                </h3>

                {groupAnnouncements.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">
                    No announcements posted for this classroom yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {groupAnnouncements.map((ann) => (
                      <div
                        key={ann.id}
                        className={`p-4 rounded-2xl border text-xs ${
                          ann.priority === 'URGENT'
                            ? 'border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold mb-1">
                          <span className="text-sm text-slate-900 dark:text-slate-100">
                            {ann.title}
                          </span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            {new Date(ann.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                          {ann.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Study Materials Section */}
              <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Study Materials & Resources ({groupMaterials.length})
                </h3>

                {groupMaterials.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">
                    No study materials uploaded for this classroom yet.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {groupMaterials.map((mat) => (
                      <div
                        key={mat.id}
                        className="py-3 flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            {mat.title}
                          </div>
                          {mat.description && (
                            <div className="text-[11px] text-slate-400">{mat.description}</div>
                          )}
                        </div>

                        {mat.fileUrl && (
                          <a
                            href={mat.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center gap-1.5 transition-colors"
                          >
                            <span>Open Material</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
                </>
              )}
            </>
          ) : (
            <div className="p-12 text-center text-slate-400 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              Select a group on the left to view announcements and materials.
            </div>
          )}
        </div>
      </div>

      {/* Join Group Dialog */}
      {joinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Key className="w-5 h-5 text-indigo-600" />
                Join Group with Invitation Code
              </h3>
              <button
                type="button"
                onClick={() => setJoinModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleJoinSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  Enter Group Invitation Key
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. PHY28-X92K"
                  value={inviteKey}
                  onChange={(e) => setInviteKey(e.target.value.toUpperCase())}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-base uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Keys are case-insensitive and generated directly by your teacher.
                </p>
              </div>

              {joinError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-xs">
                  {joinError}
                </div>
              )}

              {joinSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                  {joinSuccess}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setJoinModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={joining || !inviteKey.trim()}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  {joining ? 'Verifying Key...' : 'Join Classroom'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
