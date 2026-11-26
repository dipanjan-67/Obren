import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Award,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Edit2,
  ExternalLink,
  Eye,
  FileCheck,
  FilePlus,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Key,
  Layers,
  LayoutDashboard,
  LogOut,
  Maximize2,
  Megaphone,
  MessageSquare,
  Plus,
  Radio,
  RefreshCw,
  Save,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  UserMinus,
  Users,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import {
  addTeacherAnnouncement,
  addTeacherMaterial,
  clearTeacherSession,
  createTeacherGroup,
  createTeacherTest,
  deleteTeacherGroup,
  deleteTeacherTest,
  endLiveClass,
  fetchTeacherAnnouncements,
  fetchTeacherAttendance,
  fetchTeacherGroups,
  fetchTeacherLiveClasses,
  fetchTeacherMaterials,
  fetchTeacherTestResults,
  fetchTeacherTests,
  releaseTeacherTestResults,
  removeStudentFromGroup,
  startLiveClass,
  teacherChangePassword,
  updateTeacherGroup,
  updateTeacherTest,
  updateTeacherTestScore,
  type TeacherUser,
} from '../lib/teacherClient';
import {
  connectGoogleMeet,
  createGoogleMeetSpace,
  getMeetAccessToken,
  getMeetAccountEmail,
} from '../lib/googleMeet';
import { MathText } from './MathText';
import { QuestionDiagramViewer } from './QuestionDiagramViewer';
import { StudyGroupChatBox } from './StudyGroupChatBox';
import type {
  AttendanceRecord,
  ClassAnnouncement,
  ClassGroup,
  LiveClassRecord,
  StudyMaterial,
  TeacherTestQuestion,
  TeacherTest,
  TeacherTestAttempt,
} from '../../server/teacherRoutes';

interface TeacherDashboardProps {
  teacher: TeacherUser;
  onLogout: () => void;
  onLaunchClassroom: (liveClass: LiveClassRecord) => void;
}

type TeacherTab =
  | 'OVERVIEW'
  | 'GROUPS'
  | 'GROUP_CHAT'
  | 'STUDENTS'
  | 'LIVE_CLASSES'
  | 'TEST_MANAGEMENT'
  | 'TEST_RESULTS'
  | 'STUDY_MATERIALS'
  | 'ANNOUNCEMENTS'
  | 'CLASS_SCHEDULE'
  | 'SETTINGS';

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({
  teacher,
  onLogout,
  onLaunchClassroom,
}) => {
  const [activeTab, setActiveTab] = useState<TeacherTab>('OVERVIEW');
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [liveClasses, setLiveClasses] = useState<LiveClassRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [tests, setTests] = useState<TeacherTest[]>([]);
  const [attempts, setAttempts] = useState<TeacherTestAttempt[]>([]);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [announcements, setAnnouncements] = useState<ClassAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);

  // Group creation modal state
  const [createGroupModalOpen, setCreateGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupSubject, setNewGroupSubject] = useState(teacher.subject || 'Physics');
  const [newGroupBatch, setNewGroupBatch] = useState('Class 12 - 2026/27');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [groupActionLoading, setGroupActionLoading] = useState(false);

  // Group details modal / view
  const [viewingGroup, setViewingGroup] = useState<ClassGroup | null>(null);
  const [chatGroupId, setChatGroupId] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Live class start modal state
  const [liveModalOpen, setLiveModalOpen] = useState(false);
  const [liveClassGroupId, setLiveClassGroupId] = useState('');
  const [liveClassTitle, setLiveClassTitle] = useState('');
  const [liveClassSubject, setLiveClassSubject] = useState(teacher.subject || 'Physics');
  const [startingLive, setStartingLive] = useState(false);
  const [googleMeetEmail, setGoogleMeetEmail] = useState<string | null>(getMeetAccountEmail());

  // Test builder modal state
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [editingTestId, setEditingTestId] = useState<string | null>(null);
  const [testTitle, setTestTitle] = useState('');
  const [testDesc, setTestDesc] = useState('');
  const [testSubject, setTestSubject] = useState(teacher.subject || 'Physics');
  const [testTargetGroupId, setTestTargetGroupId] = useState('');
  const [testDurationMins, setTestDurationMins] = useState(60);
  const [testPositiveMarks, setTestPositiveMarks] = useState(4);
  const [testNegativeMarks, setTestNegativeMarks] = useState(1);
  const [testQuestions, setTestQuestions] = useState<TeacherTestQuestion[]>([]);
  const [csvInput, setCsvInput] = useState('');
  const [showCsvBox, setShowCsvBox] = useState(false);

  // Question editing draft state inside test builder
  const [qStatement, setQStatement] = useState('');
  const [qType, setQType] = useState<
    'SINGLE_CORRECT' | 'MULTIPLE_CORRECT' | 'NUMERICAL' | 'TRUE_FALSE' | 'ASSERTION_REASON' | 'IMAGE_BASED' | 'DIAGRAM_BASED'
  >('SINGLE_CORRECT');
  const [qOptions, setQOptions] = useState<string[]>(['', '', '', '']);
  const [qCorrectAnswer, setQCorrectAnswer] = useState<any>('A');
  const [qSolution, setQSolution] = useState('');
  const [qDiagramSvg, setQDiagramSvg] = useState('');
  const [qImageUrl, setQImageUrl] = useState('');

  // Results tab state
  const [selectedResultTestId, setSelectedResultTestId] = useState<string>('ALL');
  const [viewingAttempt, setViewingAttempt] = useState<TeacherTestAttempt | null>(null);
  const [overrideScore, setOverrideScore] = useState('');
  const [overrideFeedback, setOverrideFeedback] = useState('');
  const [savingOverride, setSavingOverride] = useState(false);

  // Study materials modal state
  const [matModalOpen, setMatModalOpen] = useState(false);
  const [matTitle, setMatTitle] = useState('');
  const [matDesc, setMatDesc] = useState('');
  const [matGroupId, setMatGroupId] = useState('');
  const [matFileUrl, setMatFileUrl] = useState('');

  // Announcements modal state
  const [annModalOpen, setAnnModalOpen] = useState(false);
  const [annTitle, setAnnTitle] = useState('');
  const [annMessage, setAnnMessage] = useState('');
  const [annGroupId, setAnnGroupId] = useState('');
  const [annPriority, setAnnPriority] = useState<'NORMAL' | 'URGENT'>('NORMAL');

  // Schedule state (stored in localStorage for teacher planner)
  const [scheduleSlots, setScheduleSlots] = useState<
    Array<{ id: string; day: string; time: string; groupName: string; topic: string }>
  >(() => {
    try {
      const saved = localStorage.getItem(`obren_teacher_schedule_${teacher.id}`);
      return saved ? JSON.parse(saved) : [
        { id: '1', day: 'Monday', time: '17:00 - 18:30', groupName: 'Batch Alpha (JEE 2026)', topic: 'Electromagnetism & Gauss Law' },
        { id: '2', day: 'Wednesday', time: '18:00 - 19:30', groupName: 'Batch Alpha (JEE 2026)', topic: 'Alternating Current & LC Oscillations' },
        { id: '3', day: 'Friday', time: '16:30 - 18:00', groupName: 'NEET Physics Droppers', topic: 'Ray Optics & Wave Theory' },
      ];
    } catch {
      return [];
    }
  });

  // Settings state
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwMessage, setPwMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const loadAllTeacherData = async () => {
    try {
      setLoading(true);
      const [gList, lList, attList, tList, resList, mList, aList] = await Promise.all([
        fetchTeacherGroups(),
        fetchTeacherLiveClasses(),
        fetchTeacherAttendance(),
        fetchTeacherTests(),
        fetchTeacherTestResults(),
        fetchTeacherMaterials(),
        fetchTeacherAnnouncements(),
      ]);
      setGroups(gList);
      setLiveClasses(lList);
      setAttendance(attList);
      setTests(tList);
      setAttempts(resList);
      setMaterials(mList);
      setAnnouncements(aList);
      if (gList.length > 0 && !liveClassGroupId) {
        setLiveClassGroupId(gList[0].id);
      }
      if (gList.length > 0 && !chatGroupId) {
        setChatGroupId(gList[0].id);
      }
    } catch (err) {
      console.error('Error loading teacher data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllTeacherData();
  }, [teacher.id]);

  // Aggregate metrics for Overview
  const totalStudents = useMemo(() => {
    const studentIds = new Set<string>();
    groups.forEach((g) => g.students.forEach((s) => studentIds.add(s.id)));
    return studentIds.size;
  }, [groups]);

  const activeLiveClasses = useMemo(() => {
    return liveClasses.filter((lc) => lc.status === 'LIVE');
  }, [liveClasses]);

  const avgStudentScore = useMemo(() => {
    if (attempts.length === 0) return 0;
    const totalScore = attempts.reduce((acc, a) => acc + (a.accuracyPercent || 0), 0);
    return Math.round(totalScore / attempts.length);
  }, [attempts]);

  // Group Handlers
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setGroupActionLoading(true);
    try {
      const created = await createTeacherGroup({
        name: newGroupName.trim(),
        subject: newGroupSubject.trim(),
        classBatch: newGroupBatch.trim(),
        description: newGroupDesc.trim(),
      });
      setGroups((prev) => [created, ...prev]);
      setCreateGroupModalOpen(false);
      setNewGroupName('');
      setNewGroupDesc('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create group.');
    } finally {
      setGroupActionLoading(false);
    }
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleRegenerateKey = async (groupId: string) => {
    try {
      const updated = await updateTeacherGroup(groupId, { regenerateKey: true });
      setGroups((prev) => prev.map((g) => (g.id === groupId ? updated : g)));
      if (viewingGroup?.id === groupId) setViewingGroup(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to regenerate key.');
    }
  };

  const handleToggleKeyDisabled = async (group: ClassGroup) => {
    try {
      const updated = await updateTeacherGroup(group.id, { inviteDisabled: !group.inviteDisabled });
      setGroups((prev) => prev.map((g) => (g.id === group.id ? updated : g)));
      if (viewingGroup?.id === group.id) setViewingGroup(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update key status.');
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('Are you sure you want to delete this group? All enrollments will be closed.')) return;
    try {
      await deleteTeacherGroup(groupId);
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      if (viewingGroup?.id === groupId) setViewingGroup(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete group.');
    }
  };

  const handleRemoveStudent = async (groupId: string, studentId: string) => {
    if (!confirm('Remove this student from the group?')) return;
    try {
      const updated = await removeStudentFromGroup(groupId, studentId);
      setGroups((prev) => prev.map((g) => (g.id === groupId ? updated : g)));
      if (viewingGroup?.id === groupId) setViewingGroup(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove student.');
    }
  };

  // Live Class Handlers
  const handleConnectGoogleMeet = async () => {
    try {
      const res = await connectGoogleMeet();
      setGoogleMeetEmail(res.email);
      alert(`Google Meet successfully connected for account: ${res.email}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Google Meet connection failed.');
    }
  };

  const handleStartLiveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveClassGroupId) return;
    setStartingLive(true);
    try {
      const meetToken = getMeetAccessToken() || undefined;
      const started = await startLiveClass(
        liveClassGroupId,
        liveClassTitle.trim() || 'Live Interactive Class',
        liveClassSubject,
        meetToken
      );
      setLiveClasses((prev) => [started, ...prev]);
      // Update group in state to mark active
      setGroups((prev) =>
        prev.map((g) =>
          g.id === liveClassGroupId
            ? { ...g, isLive: true, activeMeetingId: started.id, activeMeetingUrl: started.meetUrl }
            : g
        )
      );
      setLiveModalOpen(false);
      // Launch directly into classroom
      onLaunchClassroom(started);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to start live class.');
    } finally {
      setStartingLive(false);
    }
  };

  const handleEndLiveClass = async (classId: string) => {
    if (!confirm('Are you sure you want to end this live class?')) return;
    try {
      await endLiveClass(classId);
      setLiveClasses((prev) =>
        prev.map((c) =>
          c.id === classId
            ? { ...c, status: 'ENDED', endedAt: new Date().toISOString() }
            : c
        )
      );
      await loadAllTeacherData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to end live class.');
    }
  };

  // Test Management Handlers
  const openNewTestModal = () => {
    setEditingTestId(null);
    setTestTitle('');
    setTestDesc('');
    setTestSubject(teacher.subject || 'Physics');
    setTestTargetGroupId(groups[0]?.id || '');
    setTestDurationMins(60);
    setTestPositiveMarks(4);
    setTestNegativeMarks(1);
    setTestQuestions([]);
    resetQuestionDraft();
    setTestModalOpen(true);
  };

  const openEditTestModal = (t: TeacherTest) => {
    setEditingTestId(t.id);
    setTestTitle(t.title);
    setTestDesc(t.description || '');
    setTestSubject(t.subject);
    setTestTargetGroupId(t.targetGroupIds?.[0] || '');
    setTestDurationMins(t.durationMinutes);
    setTestPositiveMarks(Math.abs(t.questions?.[0]?.positiveMarks || 4));
    setTestNegativeMarks(Math.abs(t.questions?.[0]?.negativeMarks ?? 1));
    setTestQuestions(t.questions || []);
    resetQuestionDraft();
    setTestModalOpen(true);
  };

  const resetQuestionDraft = () => {
    setQStatement('');
    setQType('SINGLE_CORRECT');
    setQOptions(['', '', '', '']);
    setQCorrectAnswer('A');
    setQSolution('');
    setQDiagramSvg('');
    setQImageUrl('');
  };

  const handleAddQuestionToTest = () => {
    if (!qStatement.trim()) {
      alert('Please enter the question statement.');
      return;
    }

    const resolvedType =
      qType === 'SINGLE_CORRECT'
        ? 'SINGLE_MCQ'
        : qType === 'MULTIPLE_CORRECT'
          ? 'MULTI_MCQ'
          : qType;

    const newQ: TeacherTestQuestion = {
      id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      prompt: qStatement.trim(),
      type: resolvedType as any,
      options:
        qType === 'NUMERICAL'
          ? []
          : qType === 'TRUE_FALSE'
            ? ['True', 'False']
            : qOptions.filter((o) => o.trim().length > 0),
      correctAnswer: qCorrectAnswer,
      explanation: qSolution.trim() || undefined,
      diagramSvg: qDiagramSvg.trim() || undefined,
      imageUrl: qImageUrl.trim() || undefined,
      positiveMarks: Math.abs(testPositiveMarks),
      negativeMarks: -Math.abs(testNegativeMarks),
    };

    setTestQuestions((prev) => [...prev, newQ]);
    resetQuestionDraft();
  };

  const handleRemoveQuestionFromTest = (qId: string) => {
    setTestQuestions((prev) => prev.filter((q) => q.id !== qId));
  };

  const handleSaveTest = async () => {
    if (!testTitle.trim()) {
      alert('Please enter a test title.');
      return;
    }
    if (testQuestions.length === 0) {
      alert('Please add at least one question to the test.');
      return;
    }

    const totalMarks = testQuestions.reduce(
      (acc, q) => acc + (q.positiveMarks || testPositiveMarks),
      0
    );

    const targetGroup = groups.find((g) => g.id === testTargetGroupId);

    try {
      if (editingTestId) {
        const updated = await updateTeacherTest(editingTestId, {
          title: testTitle.trim(),
          description: testDesc.trim(),
          subject: testSubject,
          targetGroupIds: testTargetGroupId ? [testTargetGroupId] : [],
          targetGroupNames: targetGroup ? [targetGroup.name] : [],
          durationMinutes: testDurationMins,
          totalMarks,
          totalQuestions: testQuestions.length,
          questions: testQuestions,
        });
        setTests((prev) => prev.map((t) => (t.id === editingTestId ? updated : t)));
      } else {
        const created = await createTeacherTest({
          title: testTitle.trim(),
          description: testDesc.trim(),
          subject: testSubject,
          targetGroupIds: testTargetGroupId ? [testTargetGroupId] : [],
          targetGroupNames: targetGroup ? [targetGroup.name] : [],
          durationMinutes: testDurationMins,
          totalMarks,
          totalQuestions: testQuestions.length,
          classLevel: '12',
          chapter: testSubject,
          negativeMarkingEnabled: testNegativeMarks > 0,
          questions: testQuestions,
          resultsReleased: false,
        });
        setTests((prev) => [created, ...prev]);
      }
      setTestModalOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save test.');
    }
  };

  const handleDeleteTest = async (testId: string) => {
    if (!confirm('Are you sure you want to delete this test? All student attempts will be archived.'))
      return;
    try {
      await deleteTeacherTest(testId);
      setTests((prev) => prev.filter((t) => t.id !== testId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete test.');
    }
  };

  const handleToggleReleaseResults = async (test: TeacherTest) => {
    try {
      const newState = !test.resultsReleased;
      await releaseTeacherTestResults(test.id, newState);
      setTests((prev) =>
        prev.map((t) => (t.id === test.id ? { ...t, resultsReleased: newState } : t))
      );
      alert(
        newState
          ? `Results for "${test.title}" are now RELEASED to students.`
          : `Results for "${test.title}" are now HIDDEN from students.`
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to toggle results release.');
    }
  };

  // CSV Question Parser
  const handleImportCsv = () => {
    if (!csvInput.trim()) return;
    const lines = csvInput.trim().split('\n');
    const parsed: TeacherTestQuestion[] = [];

    lines.forEach((line, idx) => {
      // Format: Statement|OptionA|OptionB|OptionC|OptionD|CorrectAnswer|Solution
      const parts = line.split('|').map((p) => p.trim());
      if (parts.length >= 6) {
        parsed.push({
          id: `q_csv_${Date.now()}_${idx}`,
          prompt: parts[0],
          type: 'SINGLE_MCQ',
          options: [parts[1], parts[2], parts[3], parts[4]],
          correctAnswer: parts[5].toUpperCase(),
          explanation: parts[6] || undefined,
          positiveMarks: Math.abs(testPositiveMarks),
          negativeMarks: -Math.abs(testNegativeMarks),
        });
      }
    });

    if (parsed.length > 0) {
      setTestQuestions((prev) => [...prev, ...parsed]);
      setCsvInput('');
      setShowCsvBox(false);
      alert(`Successfully imported ${parsed.length} questions from CSV!`);
    } else {
      alert('Could not parse questions. Ensure format: Statement|OptionA|OptionB|OptionC|OptionD|CorrectAnswer|Solution');
    }
  };

  // Materials & Announcements Handlers
  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matTitle.trim()) return;
    try {
      const targetGroup = groups.find((g) => g.id === matGroupId);
      const created = await addTeacherMaterial({
        title: matTitle.trim(),
        description: matDesc.trim(),
        subject: teacher.subject || 'Physics',
        groupId: matGroupId || undefined,
        groupName: targetGroup?.name,
        fileUrl: matFileUrl.trim(),
      });
      setMaterials((prev) => [created, ...prev]);
      setMatModalOpen(false);
      setMatTitle('');
      setMatDesc('');
      setMatFileUrl('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add study material.');
    }
  };

  const handleAddAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annMessage.trim()) return;
    try {
      const targetGroup = groups.find((g) => g.id === annGroupId);
      const created = await addTeacherAnnouncement({
        title: annTitle.trim(),
        content: annMessage.trim(),
        priority: annPriority,
        groupId: annGroupId || undefined,
        groupName: targetGroup?.name,
      });
      setAnnouncements((prev) => [created, ...prev]);
      setAnnModalOpen(false);
      setAnnTitle('');
      setAnnMessage('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create announcement.');
    }
  };

  // Manual Score Adjustment & Teacher Feedback
  const handleSaveScoreOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewingAttempt) return;
    setSavingOverride(true);
    try {
      const numericScore = overrideScore.trim() === '' ? viewingAttempt.score : Number(overrideScore);
      const updated = await updateTeacherTestScore(
        viewingAttempt.id,
        Number.isNaN(numericScore) ? viewingAttempt.score : numericScore,
        overrideFeedback
      );
      setAttempts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setViewingAttempt(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save manual evaluation.');
    } finally {
      setSavingOverride(false);
    }
  };

  // Settings: Password Change
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMessage(null);
    if (!currentPw || !newPw) {
      setPwMessage({ text: 'All password fields are required.', isError: true });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMessage({ text: 'New passwords do not match.', isError: true });
      return;
    }
    if (newPw.length < 6) {
      setPwMessage({ text: 'New password must be at least 6 characters long.', isError: true });
      return;
    }

    try {
      await teacherChangePassword(currentPw, newPw);
      setPwMessage({ text: 'Password successfully updated!', isError: false });
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err) {
      setPwMessage({
        text: err instanceof Error ? err.message : 'Failed to update password.',
        isError: true,
      });
    }
  };

  // Export Results to CSV
  const handleExportResultsCsv = () => {
    const relevantAttempts =
      selectedResultTestId === 'ALL'
        ? attempts
        : attempts.filter((a) => a.testId === selectedResultTestId);

    if (relevantAttempts.length === 0) {
      alert('No test attempts available to export.');
      return;
    }

    const headers = ['Student Name', 'Email', 'Test Title', 'Score', 'Max Score', 'Accuracy (%)', 'Submitted At'];
    const rows = relevantAttempts.map((a) => [
      `"${a.studentName}"`,
      `"${a.studentEmail || ''}"`,
      `"${a.testTitle}"`,
      a.score,
      a.maxScore,
      `${a.accuracyPercent}%`,
      `"${a.submittedAt ? new Date(a.submittedAt).toLocaleString() : 'N/A'}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `teacher_results_${teacher.username}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Teacher Command Bar */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3.5 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white font-black text-sm flex items-center justify-center shadow-md shadow-indigo-500/25">
            {teacher.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base font-display">{teacher.name}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-200 dark:border-emerald-800">
                Teacher Verified
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              @{teacher.username} · {teacher.title} ({teacher.subject})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {activeLiveClasses.length > 0 && (
            <button
              type="button"
              onClick={() => onLaunchClassroom(activeLiveClasses[0])}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-500 text-white font-bold text-xs animate-pulse shadow-md shadow-rose-500/25 cursor-pointer"
            >
              <Radio className="w-3.5 h-3.5" />
              Live Class Active
            </button>
          )}

          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Exit Teacher Mode</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Sidebar Navigation (10 Sections) */}
        <nav className="lg:col-span-3 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-3 shadow-sm space-y-1">
          {(
            [
              ['OVERVIEW', 'Overview', LayoutDashboard],
              ['GROUPS', 'My Groups', Users],
              ['GROUP_CHAT', 'Group Chat', MessageSquare],
              ['STUDENTS', 'My Students', GraduationCap],
              ['LIVE_CLASSES', 'Live Classes (Meet)', Video],
              ['TEST_MANAGEMENT', 'Test Management', FilePlus],
              ['TEST_RESULTS', 'Test Results', Award],
              ['STUDY_MATERIALS', 'Study Materials', BookOpen],
              ['ANNOUNCEMENTS', 'Announcements', Megaphone],
              ['CLASS_SCHEDULE', 'Class Schedule', Calendar],
              ['SETTINGS', 'Settings & Security', Settings],
            ] as const
          ).map(([tabKey, label, Icon]) => {
            const isActive = activeTab === tabKey;
            return (
              <button
                key={tabKey}
                type="button"
                onClick={() => setActiveTab(tabKey as TeacherTab)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </div>
                {tabKey === 'LIVE_CLASSES' && activeLiveClasses.length > 0 && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Right Content Area */}
        <main className="lg:col-span-9 space-y-6">
          {/* ========================================================= */}
          {/* 1. OVERVIEW */}
          {/* ========================================================= */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-6">
              {/* Active Live Class Banner if running */}
              {activeLiveClasses.length > 0 && (
                <div className="p-5 rounded-3xl bg-rose-500 text-white shadow-lg flex flex-wrap items-center justify-between gap-4 animate-fadeIn">
                  <div className="flex items-center gap-3">
                    <span className="p-2 rounded-2xl bg-white/20 text-white">
                      <Radio className="w-5 h-5 animate-pulse" />
                    </span>
                    <div>
                      <h4 className="font-bold text-sm">
                        You have an active Live Class: "{activeLiveClasses[0].title}"
                      </h4>
                      <p className="text-xs text-rose-100">
                        Group: {activeLiveClasses[0].groupName || 'Assigned Group'} · Started at{' '}
                        {new Date(activeLiveClasses[0].startedAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onLaunchClassroom(activeLiveClasses[0])}
                      className="px-4 py-2 rounded-xl bg-white text-rose-600 font-bold text-xs hover:bg-rose-50 cursor-pointer shadow-sm"
                    >
                      Enter Live Classroom
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEndLiveClass(activeLiveClasses[0].id)}
                      className="px-3 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-semibold text-xs cursor-pointer"
                    >
                      End Class
                    </button>
                  </div>
                </div>
              )}

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">
                    Total Groups
                  </div>
                  <div className="text-2xl font-black font-mono">{groups.length}</div>
                </div>

                <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">
                    Enrolled Students
                  </div>
                  <div className="text-2xl font-black font-mono">{totalStudents}</div>
                </div>

                <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">
                    Tests Created
                  </div>
                  <div className="text-2xl font-black font-mono">{tests.length}</div>
                </div>

                <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">
                    Avg Student Accuracy
                  </div>
                  <div className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                    {avgStudentScore}%
                  </div>
                </div>
              </div>

              {/* Quick Action Hub */}
              <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4">
                  Quick Actions
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('LIVE_CLASSES');
                      setLiveModalOpen(true);
                    }}
                    className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/40 text-left hover:scale-[1.02] transition-transform cursor-pointer"
                  >
                    <Video className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mb-2" />
                    <div className="font-bold text-xs text-indigo-950 dark:text-indigo-200">
                      Start Google Meet Class
                    </div>
                    <div className="text-[11px] text-indigo-600/80 dark:text-indigo-400/80 mt-0.5">
                      Stream live to enrolled group
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('TEST_MANAGEMENT');
                      openNewTestModal();
                    }}
                    className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/40 text-left hover:scale-[1.02] transition-transform cursor-pointer"
                  >
                    <FilePlus className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mb-2" />
                    <div className="font-bold text-xs text-emerald-950 dark:text-emerald-200">
                      Create New Test
                    </div>
                    <div className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
                      7 question types with LaTeX
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('GROUPS');
                      setCreateGroupModalOpen(true);
                    }}
                    className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/40 text-left hover:scale-[1.02] transition-transform cursor-pointer"
                  >
                    <Users className="w-5 h-5 text-purple-600 dark:text-purple-400 mb-2" />
                    <div className="font-bold text-xs text-purple-950 dark:text-purple-200">
                      Create Study Group
                    </div>
                    <div className="text-[11px] text-purple-600/80 dark:text-purple-400/80 mt-0.5">
                      Generate unique invitation code
                    </div>
                  </button>
                </div>
              </div>

              {/* Recent Test Attempts Feed */}
              <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-4">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <Award className="w-4 h-4 text-indigo-600" />
                    Recent Student Test Submissions ({attempts.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab('TEST_RESULTS')}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    View All Results
                  </button>
                </div>

                {attempts.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">
                    No student submissions yet. Once students submit assigned tests, their scores will appear here.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {attempts.slice(0, 5).map((att) => (
                      <div
                        key={att.id}
                        className="py-3 flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-200">
                            {att.studentName}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Test: {att.testTitle} · {att.submittedAt ? new Date(att.submittedAt).toLocaleTimeString() : 'Pending'}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                            {att.score} / {att.maxScore}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {att.accuracyPercent}% Accuracy
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* 2. MY GROUPS */}
          {/* ========================================================= */}
          {activeTab === 'GROUPS' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black font-display">Class Groups & Batches</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Create isolated classrooms, generate invitation keys, and manage enrolled rosters.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setCreateGroupModalOpen(true)}
                  className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-indigo-500/20 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Create New Group
                </button>
              </div>

              {groups.length === 0 ? (
                <div className="p-12 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
                  <Users className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                  <h3 className="text-sm font-bold mb-1">No Groups Created Yet</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-4">
                    Create your first study group to generate an invitation code for your students.
                  </p>
                  <button
                    type="button"
                    onClick={() => setCreateGroupModalOpen(true)}
                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 cursor-pointer"
                  >
                    Create Group
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {groups.map((group) => (
                    <div
                      key={group.id}
                      className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 uppercase">
                              {group.subject}
                            </span>
                            <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100 mt-1">
                              {group.name}
                            </h3>
                            {group.classBatch && (
                              <p className="text-xs text-slate-400">{group.classBatch}</p>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDeleteGroup(group.id)}
                              className="p-2 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                              title="Delete Group"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Invite Key Card */}
                        <div className="my-4 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                              Invitation Key
                            </span>
                            <span className="font-mono font-black text-sm tracking-widest text-indigo-600 dark:text-indigo-400">
                              {group.inviteKey}
                            </span>
                            {group.inviteDisabled && (
                              <span className="ml-2 text-[10px] text-rose-500 font-semibold">
                                (Disabled)
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleCopyKey(group.inviteKey)}
                              className="p-1.5 rounded-lg bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 text-xs flex items-center gap-1 cursor-pointer"
                              title="Copy Code"
                            >
                              {copiedKey === group.inviteKey ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRegenerateKey(group.id)}
                              className="p-1.5 rounded-lg bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 text-xs cursor-pointer"
                              title="Regenerate Key"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-4">
                          <span>Students Enrolled:</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {group.students?.length || 0}
                          </span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setViewingGroup(group)}
                            className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs cursor-pointer"
                          >
                            Roster ({group.students?.length || 0})
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setChatGroupId(group.id);
                              setActiveTab('GROUP_CHAT');
                            }}
                            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs inline-flex items-center gap-1 cursor-pointer"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            Chat
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleToggleKeyDisabled(group)}
                          className="text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {group.inviteDisabled ? 'Enable Code' : 'Disable Code'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Roster Modal */}
              {viewingGroup && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
                  <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
                      <div>
                        <h3 className="font-bold text-base">{viewingGroup.name} - Enrolled Roster</h3>
                        <p className="text-xs text-slate-400">
                          {viewingGroup.students?.length || 0} students joined via {viewingGroup.inviteKey}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setViewingGroup(null)}
                        className="text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {(!viewingGroup.students || viewingGroup.students.length === 0) ? (
                        <p className="text-xs text-slate-400 py-6 text-center">
                          No students have joined this group yet. Share code{' '}
                          <span className="font-mono font-bold text-indigo-500">{viewingGroup.inviteKey}</span> with your class.
                        </p>
                      ) : (
                        viewingGroup.students.map((s) => (
                          <div
                            key={s.id}
                            className="py-2.5 flex items-center justify-between text-xs"
                          >
                            <div>
                              <div className="font-bold text-slate-800 dark:text-slate-200">
                                {s.name}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {s.email || 'No email provided'} · Joined{' '}
                                {new Date(s.joinedAt).toLocaleDateString()}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveStudent(viewingGroup.id, s.id)}
                              className="text-rose-500 hover:text-rose-700 text-xs font-semibold cursor-pointer"
                            >
                              Remove
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* 2B. GROUP CHAT */}
          {/* ========================================================= */}
          {activeTab === 'GROUP_CHAT' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black font-display">Study Group Chat</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Real-time discussion room for your enrolled students, doubt clearing, and pinned notes.
                  </p>
                </div>

                {groups.length > 0 && (
                  <select
                    value={chatGroupId || groups[0].id}
                    onChange={(e) => setChatGroupId(e.target.value)}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                  >
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.students?.length || 0} students)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {groups.length === 0 ? (
                <div className="p-12 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
                  <MessageSquare className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                  <h3 className="text-sm font-bold mb-1">Create a Study Group First</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-4">
                    Each study group gets its own private real-time chat room for you and your enrolled students.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('GROUPS');
                      setCreateGroupModalOpen(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 cursor-pointer"
                  >
                    Create Study Group
                  </button>
                </div>
              ) : (
                (() => {
                  const activeGroup = groups.find((g) => g.id === chatGroupId) || groups[0];
                  return (
                    <StudyGroupChatBox
                      groupId={activeGroup.id}
                      groupName={activeGroup.name}
                      subject={activeGroup.subject}
                      role="TEACHER"
                      userId={teacher.id}
                      userName={teacher.name}
                    />
                  );
                })()
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* 3. MY STUDENTS */}
          {/* ========================================================= */}
          {activeTab === 'STUDENTS' && (
            <div className="space-y-6">
              <h2 className="text-xl font-black font-display">Student Roster & Performance</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                All students currently enrolled in your study groups.
              </p>

              <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold uppercase text-[10px]">
                      <th className="pb-3">Student Name</th>
                      <th className="pb-3">Email</th>
                      <th className="pb-3">Groups</th>
                      <th className="pb-3">Tests Taken</th>
                      <th className="pb-3">Avg Accuracy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {groups.flatMap((g) => g.students.map((s) => ({ ...s, groupName: g.name }))).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          No students enrolled in your groups yet.
                        </td>
                      </tr>
                    ) : (
                      groups.flatMap((g) => g.students.map((s) => ({ ...s, groupName: g.name }))).map((st, idx) => {
                        const stAttempts = attempts.filter((a) => a.studentId === st.id);
                        const avgAcc =
                          stAttempts.length > 0
                            ? Math.round(
                                stAttempts.reduce((acc, a) => acc + (a.accuracyPercent || 0), 0) /
                                  stAttempts.length
                              )
                            : 0;

                        return (
                          <tr key={`${st.id}_${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-3 font-bold text-slate-800 dark:text-slate-200">
                              {st.name}
                            </td>
                            <td className="py-3 text-slate-500">{st.email || '—'}</td>
                            <td className="py-3 font-semibold text-indigo-600 dark:text-indigo-400">
                              {st.groupName}
                            </td>
                            <td className="py-3 font-mono">{stAttempts.length}</td>
                            <td className="py-3 font-mono font-bold text-emerald-600">
                              {stAttempts.length > 0 ? `${avgAcc}%` : '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* 4. LIVE CLASSES */}
          {/* ========================================================= */}
          {activeTab === 'LIVE_CLASSES' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black font-display">Live Classes & Google Meet</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Host live interactive video sessions powered by Google Meet API with real-time attendance logging.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {!googleMeetEmail ? (
                    <button
                      type="button"
                      onClick={handleConnectGoogleMeet}
                      className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer flex items-center gap-1.5"
                    >
                      <Video className="w-3.5 h-3.5 text-indigo-600" />
                      Connect Google Meet
                    </button>
                  ) : (
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200">
                      Meet: {googleMeetEmail}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => setLiveModalOpen(true)}
                    className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-indigo-500/20 cursor-pointer"
                  >
                    <Video className="w-4 h-4" />
                    Start Live Class
                  </button>
                </div>
              </div>

              {/* Active Live Class Card */}
              {activeLiveClasses.map((lc) => (
                <div
                  key={lc.id}
                  className="p-6 rounded-3xl bg-slate-900 text-white border border-slate-800 shadow-xl flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center animate-pulse">
                      <Radio className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500 text-white">
                          LIVE NOW
                        </span>
                        <h3 className="font-bold text-base text-white">{lc.title}</h3>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Group: {lc.groupName} · Subject: {lc.subject} · Space: {lc.meetUrl}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onLaunchClassroom(lc)}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors cursor-pointer"
                    >
                      Enter Classroom
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEndLiveClass(lc.id)}
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-colors cursor-pointer"
                    >
                      End Class
                    </button>
                  </div>
                </div>
              ))}

              {/* Past Live Sessions & Attendance */}
              <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4">
                  Past Live Class Attendance Records ({attendance.length})
                </h3>

                {attendance.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">
                    No attendance logs recorded yet. When students join your live classes, their joining time and duration will be displayed here.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {attendance.map((rec) => (
                      <div
                        key={rec.id}
                        className="py-3 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-200">
                            {rec.studentName}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Group: {rec.groupName} · Joined:{' '}
                            {new Date(rec.joinedAt).toLocaleTimeString()}
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                            {rec.durationMinutes ? `${rec.durationMinutes} mins` : 'In progress'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* 5. TEST MANAGEMENT */}
          {/* ========================================================= */}
          {activeTab === 'TEST_MANAGEMENT' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black font-display">Online Examination Creator</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Build professional chapter tests with 7 question patterns, KaTeX math formulas, and negative marking.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={openNewTestModal}
                  className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-indigo-500/20 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  + CREATE NEW TEST
                </button>
              </div>

              {tests.length === 0 ? (
                <div className="p-12 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
                  <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                  <h3 className="text-sm font-bold mb-1">No Tests Created Yet</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-4">
                    Create customized practice exams and assign them to your classrooms.
                  </p>
                  <button
                    type="button"
                    onClick={openNewTestModal}
                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 cursor-pointer"
                  >
                    Create Your First Test
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {tests.map((test) => (
                    <div
                      key={test.id}
                      className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 uppercase">
                            {test.subject}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              test.resultsReleased
                                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60'
                                : 'bg-amber-50 text-amber-600 dark:bg-amber-950/60'
                            }`}
                          >
                            {test.resultsReleased ? 'Results Released' : 'Results Hidden'}
                          </span>
                        </div>

                        <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100 mb-1">
                          {test.title}
                        </h3>
                        <p className="text-xs text-slate-400 mb-4">
                          Target: {test.targetGroupNames?.[0] || 'All Groups'} · {test.durationMinutes} mins ·{' '}
                          {test.questions?.length || 0} Questions
                        </p>
                      </div>

                      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditTestModal(test)}
                            className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-semibold text-xs cursor-pointer flex items-center gap-1"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTest(test.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleToggleReleaseResults(test)}
                          className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-colors cursor-pointer ${
                            test.resultsReleased
                              ? 'bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          }`}
                        >
                          {test.resultsReleased ? 'Hide Results' : 'Release Results'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* 6. TEST RESULTS */}
          {/* ========================================================= */}
          {activeTab === 'TEST_RESULTS' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black font-display">Test Results & Analytics</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Review student scores, inspect question-wise answers, and export reports.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportResultsCsv}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Export CSV Report
                  </button>
                </div>
              </div>

              {/* Filter by Test */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Filter Test:</span>
                <select
                  value={selectedResultTestId}
                  onChange={(e) => setSelectedResultTestId(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold"
                >
                  <option value="ALL">All Tests ({tests.length})</option>
                  {tests.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Results Table */}
              <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold uppercase text-[10px]">
                      <th className="pb-3">Student</th>
                      <th className="pb-3">Test</th>
                      <th className="pb-3">Score</th>
                      <th className="pb-3">Accuracy</th>
                      <th className="pb-3">Submitted At</th>
                      <th className="pb-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {attempts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          No student submissions found.
                        </td>
                      </tr>
                    ) : (
                      (selectedResultTestId === 'ALL'
                        ? attempts
                        : attempts.filter((a) => a.testId === selectedResultTestId)
                      ).map((att) => (
                        <tr key={att.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-3 font-bold text-slate-800 dark:text-slate-200">
                            {att.studentName}
                          </td>
                          <td className="py-3 text-slate-600 dark:text-slate-400">{att.testTitle}</td>
                          <td className="py-3 font-mono font-bold">
                            {att.score} / {att.maxScore}
                          </td>
                          <td className="py-3 font-mono text-emerald-600 font-bold">
                            {att.accuracyPercent}%
                          </td>
                          <td className="py-3 text-slate-400">
                            {att.submittedAt
                              ? new Date(att.submittedAt).toLocaleString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'In progress'}
                          </td>
                          <td className="py-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setViewingAttempt(att);
                                setOverrideScore(String(att.score));
                                setOverrideFeedback(att.teacherFeedback || '');
                              }}
                              className="px-3 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-semibold hover:bg-indigo-100 cursor-pointer"
                            >
                              Review Answers
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Attempt Review & Manual Score Adjustment Modal */}
              {viewingAttempt && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
                  <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl max-h-[85vh] flex flex-col justify-between">
                    <div className="pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-base">
                          {viewingAttempt.studentName} - {viewingAttempt.testTitle}
                        </h3>
                        <p className="text-xs text-slate-400">
                          Score: {viewingAttempt.score}/{viewingAttempt.maxScore} (
                          {viewingAttempt.accuracyPercent}%)
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setViewingAttempt(null)}
                        className="text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto py-4 space-y-3">
                      <form
                        onSubmit={handleSaveScoreOverride}
                        className="p-3.5 rounded-2xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/20 space-y-2.5 text-xs"
                      >
                        <div className="font-bold text-indigo-900 dark:text-indigo-200">
                          Manual Evaluation &amp; Teacher Feedback
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                              Adjusted Score (Max {viewingAttempt.maxScore})
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={viewingAttempt.maxScore}
                              step="0.5"
                              value={overrideScore}
                              onChange={(e) => setOverrideScore(e.target.value)}
                              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                              Teacher Feedback
                            </label>
                            <input
                              type="text"
                              placeholder="Optional feedback visible when results are released..."
                              value={overrideFeedback}
                              onChange={(e) => setOverrideFeedback(e.target.value)}
                              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={savingOverride}
                            className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold text-xs cursor-pointer"
                          >
                            {savingOverride ? 'Saving...' : 'Save Evaluation'}
                          </button>
                        </div>
                      </form>

                      {viewingAttempt.questionResults?.map((qr, idx) => (
                        <div
                          key={idx}
                          className={`p-3.5 rounded-2xl border text-xs ${
                            qr.isCorrect
                              ? 'border-emerald-200 bg-emerald-50/30 dark:bg-emerald-950/20'
                              : qr.userAnswer === undefined
                                ? 'border-slate-200 bg-slate-50 dark:bg-slate-800/40'
                                : 'border-rose-200 bg-rose-50/30 dark:bg-rose-950/20'
                          }`}
                        >
                          <div className="flex items-center justify-between font-bold mb-1">
                            <span>Question {idx + 1}</span>
                            <span
                              className={
                                qr.isCorrect
                                  ? 'text-emerald-600 font-bold'
                                  : 'text-rose-600 font-bold'
                              }
                            >
                              {qr.marksAwarded >= 0 ? `+${qr.marksAwarded}` : qr.marksAwarded} Marks
                            </span>
                          </div>
                          <p className="mb-2 text-slate-700 dark:text-slate-300">
                            {qr.explanation || `Question ID: ${qr.questionId}`}
                          </p>
                          <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                            <div>
                              Student: <span className="font-bold">{JSON.stringify(qr.userAnswer)}</span>
                            </div>
                            <div>
                              Correct: <span className="font-bold text-emerald-600">{JSON.stringify(qr.correctAnswer)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setViewingAttempt(null)}
                        className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* 7. STUDY MATERIALS */}
          {/* ========================================================= */}
          {activeTab === 'STUDY_MATERIALS' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black font-display">Study Materials & Notes</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Upload formula sheets, lecture PDFs, and drive links for your classrooms.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setMatModalOpen(true)}
                  className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-indigo-500/20 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Material
                </button>
              </div>

              {materials.length === 0 ? (
                <div className="p-12 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                  No materials added yet. Click "+ Add Material" to share resources.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {materials.map((mat) => (
                    <div
                      key={mat.id}
                      className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between"
                    >
                      <div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 uppercase">
                          {mat.subject}
                        </span>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 mt-1">
                          {mat.title}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {mat.description}
                        </p>
                      </div>

                      {mat.fileUrl && (
                        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs">
                          <span className="text-slate-400">Resource Link:</span>
                          <a
                            href={mat.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
                          >
                            Open <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* 8. ANNOUNCEMENTS */}
          {/* ========================================================= */}
          {activeTab === 'ANNOUNCEMENTS' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black font-display">Class Announcements</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Post urgent reminders, timetable updates, and batch notifications.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setAnnModalOpen(true)}
                  className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-indigo-500/20 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Post Announcement
                </button>
              </div>

              {announcements.length === 0 ? (
                <div className="p-12 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                  No announcements broadcast yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {announcements.map((ann) => (
                    <div
                      key={ann.id}
                      className={`p-5 rounded-3xl border text-xs ${
                        ann.priority === 'URGENT'
                          ? 'border-rose-200 bg-rose-50/40 dark:bg-rose-950/20'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold mb-1">
                        <span className="text-sm text-slate-900 dark:text-slate-100">
                          {ann.title}
                        </span>
                        <span className="text-[10px] text-slate-400">
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
          )}

          {/* ========================================================= */}
          {/* 9. CLASS SCHEDULE */}
          {/* ========================================================= */}
          {activeTab === 'CLASS_SCHEDULE' && (
            <div className="space-y-6">
              <h2 className="text-xl font-black font-display">Weekly Class Timetable</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Plan recurring lecture schedules and share class timing with students.
              </p>

              <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                {scheduleSlots.map((slot) => (
                  <div
                    key={slot.id}
                    className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          {slot.day}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 font-mono">
                          {slot.time}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        {slot.groupName} · Topic: <span className="font-medium text-slate-700 dark:text-slate-300">{slot.topic}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* 10. SETTINGS */}
          {/* ========================================================= */}
          {activeTab === 'SETTINGS' && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h2 className="text-xl font-black font-display">Teacher Profile & Security</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Manage your credentials and Google Meet authorization.
                </p>
              </div>

              {/* Password Change Form */}
              <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  Change Account Password
                </h3>

                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Current Password
                    </label>
                    <input
                      type="password"
                      required
                      value={currentPw}
                      onChange={(e) => setCurrentPw(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      New Password (min 6 characters)
                    </label>
                    <input
                      type="password"
                      required
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      required
                      value={confirmPw}
                      onChange={(e) => setConfirmPw(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  {pwMessage && (
                    <div
                      className={`p-3 rounded-xl text-xs font-semibold ${
                        pwMessage.isError
                          ? 'bg-rose-50 text-rose-600 border border-rose-200'
                          : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                      }`}
                    >
                      {pwMessage.text}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors cursor-pointer"
                  >
                    Update Password
                  </button>
                </form>
              </div>

              {/* Google Meet OAuth Connection Status */}
              <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
                  <Video className="w-4 h-4 text-indigo-600" />
                  Google Meet Integration
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  Google Meet API creates authentic live video spaces for your students.
                </p>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600 dark:text-slate-300">
                    Status:{' '}
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                      {googleMeetEmail ? `Connected (${googleMeetEmail})` : 'Not Connected'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={handleConnectGoogleMeet}
                    className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-semibold cursor-pointer"
                  >
                    {googleMeetEmail ? 'Re-authorize' : 'Connect Now'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ========================================================= */}
      {/* MODAL: CREATE GROUP */}
      {/* ========================================================= */}
      {createGroupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl">
            <h3 className="text-lg font-bold mb-4">Create New Classroom Group</h3>
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Group Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Batch Alpha (JEE 2026)"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  required
                  value={newGroupSubject}
                  onChange={(e) => setNewGroupSubject(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Class Batch
                </label>
                <input
                  type="text"
                  placeholder="e.g. Class 12 Dropper Batch"
                  value={newGroupBatch}
                  onChange={(e) => setNewGroupBatch(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Description / Topic Focus
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Intensive problem-solving on Mechanics & Electrodynamics"
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateGroupModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={groupActionLoading}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  {groupActionLoading ? 'Creating...' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: START LIVE CLASS */}
      {/* ========================================================= */}
      {liveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Video className="w-5 h-5 text-indigo-600" />
              Start Live Google Meet Class
            </h3>
            <form onSubmit={handleStartLiveClass} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Target Group
                </label>
                <select
                  required
                  value={liveClassGroupId}
                  onChange={(e) => setLiveClassGroupId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.subject})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Class Title / Lecture Topic
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Electromagnetic Induction & Lenz's Law"
                  value={liveClassTitle}
                  onChange={(e) => setLiveClassTitle(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                />
              </div>

              <div className="p-3 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 text-xs text-indigo-900 dark:text-indigo-200">
                <span className="font-bold block mb-1">Live Classroom Features:</span>
                • Automatic Google Meet space generated<br />
                • In-website classroom page loaded<br />
                • Real-time attendance join & duration tracked<br />
                • Instant notification sent to enrolled students
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setLiveModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={startingLive}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  {startingLive ? 'Initializing Meet Space...' : 'Launch Live Class'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: TEST BUILDER */}
      {/* ========================================================= */}
      {testModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-4xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-6">
              <div>
                <h3 className="text-xl font-bold">
                  {editingTestId ? 'Edit Online Test' : 'Create New Online Test'}
                </h3>
                <p className="text-xs text-slate-400">
                  Configure timing, marking scheme, and add questions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTestModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Test Metadata Config */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Test Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Unit Test 04 - Rotational Dynamics"
                  value={testTitle}
                  onChange={(e) => setTestTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Assign to Group
                </label>
                <select
                  value={testTargetGroupId}
                  onChange={(e) => setTestTargetGroupId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                >
                  <option value="">All Groups (Public)</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Duration (m)
                  </label>
                  <input
                    type="number"
                    min={5}
                    value={testDurationMins}
                    onChange={(e) => setTestDurationMins(Number(e.target.value))}
                    className="w-full px-2 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Correct (+)
                  </label>
                  <input
                    type="number"
                    value={testPositiveMarks}
                    onChange={(e) => setTestPositiveMarks(Number(e.target.value))}
                    className="w-full px-2 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Wrong (-)
                  </label>
                  <input
                    type="number"
                    value={testNegativeMarks}
                    onChange={(e) => setTestNegativeMarks(Number(e.target.value))}
                    className="w-full px-2 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            {/* CSV Import Accordion */}
            <div className="mb-6 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Bulk CSV Import (Optional)
                </span>
                <button
                  type="button"
                  onClick={() => setShowCsvBox(!showCsvBox)}
                  className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold cursor-pointer"
                >
                  {showCsvBox ? 'Hide CSV' : 'Show CSV Importer'}
                </button>
              </div>

              {showCsvBox && (
                <div className="mt-3 space-y-2">
                  <textarea
                    rows={4}
                    placeholder="Statement | Option A | Option B | Option C | Option D | CorrectAnswer | Solution"
                    value={csvInput}
                    onChange={(e) => setCsvInput(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleImportCsv}
                    className="px-4 py-1.5 rounded-xl bg-indigo-600 text-white font-semibold text-xs cursor-pointer"
                  >
                    Parse and Add Questions
                  </button>
                </div>
              )}
            </div>

            {/* Question Builder Box */}
            <div className="p-5 rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 mb-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
                  + Add Question to Test
                </span>
                <select
                  value={qType}
                  onChange={(e: any) => {
                    const nextType = e.target.value;
                    setQType(nextType);
                    if (nextType === 'TRUE_FALSE') setQCorrectAnswer('True');
                    else if (nextType === 'NUMERICAL') setQCorrectAnswer('');
                    else if (nextType === 'MULTIPLE_CORRECT') setQCorrectAnswer('A, C');
                    else setQCorrectAnswer('A');
                  }}
                  className="px-3 py-1 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 text-xs font-semibold"
                >
                  <option value="SINGLE_CORRECT">Single Correct MCQ</option>
                  <option value="MULTIPLE_CORRECT">Multiple Correct MCQ</option>
                  <option value="NUMERICAL">Numerical Value Based</option>
                  <option value="TRUE_FALSE">True / False</option>
                  <option value="ASSERTION_REASON">Assertion &amp; Reason</option>
                  <option value="IMAGE_BASED">Image Based</option>
                  <option value="DIAGRAM_BASED">Diagram Based (SVG)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Question Statement (Supports KaTeX: $E = mc^2$ or $$\int f(x)dx$$)
                </label>
                <textarea
                  rows={3}
                  placeholder="Enter the question text..."
                  value={qStatement}
                  onChange={(e) => setQStatement(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                />
              </div>

              {/* Mathematical preview */}
              {qStatement && (
                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                  <span className="text-[10px] text-slate-400 block mb-1">LaTeX Live Preview:</span>
                  <MathText text={qStatement} />
                </div>
              )}

              {qType === 'IMAGE_BASED' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Question Image URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://example.com/diagram.png"
                    value={qImageUrl}
                    onChange={(e) => setQImageUrl(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
              )}

              {qType === 'DIAGRAM_BASED' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Vector SVG Markup (&lt;svg ...&gt;...&lt;/svg&gt;)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="<svg viewBox='0 0 200 120'>...</svg>"
                    value={qDiagramSvg}
                    onChange={(e) => setQDiagramSvg(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                  />
                </div>
              )}

              {/* Options */}
              {qType !== 'NUMERICAL' && qType !== 'TRUE_FALSE' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {qOptions.map((opt, oIdx) => {
                    const optKey = String.fromCharCode(65 + oIdx);
                    return (
                      <div key={optKey} className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-700 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                          {optKey}
                        </span>
                        <input
                          type="text"
                          placeholder={`Option ${optKey}`}
                          value={opt}
                          onChange={(e) => {
                            const next = [...qOptions];
                            next[oIdx] = e.target.value;
                            setQOptions(next);
                          }}
                          className="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Correct Answer & Solution */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Correct Answer
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. A, A, C, True, or 14.5"
                    value={qCorrectAnswer}
                    onChange={(e) => setQCorrectAnswer(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Solution Explanation (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Step-by-step reasoning or formula used..."
                    value={qSolution}
                    onChange={(e) => setQSolution(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleAddQuestionToTest}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  + Append Question
                </button>
              </div>
            </div>

            {/* Questions List */}
            <div className="space-y-3 mb-6">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Questions in this Test ({testQuestions.length})
              </h4>
              {testQuestions.map((q, idx) => (
                <div
                  key={q.id || idx}
                  className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-start justify-between gap-3 text-xs"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-indigo-600 font-mono">Q{idx + 1}.</span>
                      <span className="text-[10px] text-slate-400 capitalize">
                        {q.type.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-emerald-600 font-mono font-bold">
                        Ans: {JSON.stringify(q.correctAnswer)}
                      </span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300">{q.prompt}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveQuestionFromTest(q.id)}
                    className="text-rose-500 hover:text-rose-700 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Footer Buttons */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setTestModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTest}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-md shadow-indigo-500/20"
              >
                Save & Deploy Test
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD MATERIAL */}
      {/* ========================================================= */}
      {matModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl">
            <h3 className="text-lg font-bold mb-4">Add Study Material</h3>
            <form onSubmit={handleAddMaterial} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Formula Sheet - Thermodynamics"
                  value={matTitle}
                  onChange={(e) => setMatTitle(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Target Group (Optional)
                </label>
                <select
                  value={matGroupId}
                  onChange={(e) => setMatGroupId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                >
                  <option value="">All My Groups</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Link / Resource URL
                </label>
                <input
                  type="url"
                  placeholder="https://drive.google.com/..."
                  value={matFileUrl}
                  onChange={(e) => setMatFileUrl(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Summary of formulas and derivations..."
                  value={matDesc}
                  onChange={(e) => setMatDesc(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setMatModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  Add Resource
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: POST ANNOUNCEMENT */}
      {/* ========================================================= */}
      {annModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl">
            <h3 className="text-lg font-bold mb-4">Post Class Announcement</h3>
            <form onSubmit={handleAddAnnouncement} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Extra Doubt Clearing Session on Saturday"
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Target Group
                </label>
                <select
                  value={annGroupId}
                  onChange={(e) => setAnnGroupId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                >
                  <option value="">All My Groups</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Priority
                </label>
                <select
                  value={annPriority}
                  onChange={(e: any) => setAnnPriority(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                >
                  <option value="NORMAL">Normal</option>
                  <option value="URGENT">Urgent (Highlighted in Red)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Message Content
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Details for students..."
                  value={annMessage}
                  onChange={(e) => setAnnMessage(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAnnModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  Post Announcement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
