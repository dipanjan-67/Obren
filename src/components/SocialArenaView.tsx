import React, { useEffect, useMemo, useState } from 'react';
import {
  Copy,
  Edit2,
  LogOut,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  Swords,
  Trash2,
  Trophy,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  addDoc,
  arrayRemove,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { postApiJson } from '../lib/apiClient';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { getStructuredCurriculum } from '../lib/syllabusCatalog';
import { Leaderboard } from './Leaderboard';
import type {
  ActiveTestConfig,
  ExamType,
  GroupMessage,
  PublicProfile,
  PyqQuestion,
  StudyGroup,
  StudyNote,
  TestDuel,
  UserProfile,
} from '../types/obren';
import { EXAM_LABELS, getSubjectsForExam } from '../types/obren';

interface SocialArenaViewProps {
  profile: UserProfile;
  questions: PyqQuestion[];
  notes: StudyNote[];
  initialSubTab?: 'GROUPS' | 'DUELS' | 'LEADERBOARD';
  onClearInitialSubTab?: () => void;
  onStartDuelExam: (config: ActiveTestConfig) => void;
}

function makeCode(prefix: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = `${prefix}-`;
  for (let i = 0; i < 6; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export const SocialArenaView: React.FC<SocialArenaViewProps> = ({
  profile,
  questions,
  notes,
  initialSubTab,
  onClearInitialSubTab,
  onStartDuelExam,
}) => {
  const [subTab, setSubTab] = useState<'GROUPS' | 'DUELS' | 'LEADERBOARD'>(initialSubTab || 'GROUPS');

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
      onClearInitialSubTab?.();
    }
  }, [initialSubTab, onClearInitialSubTab]);

  // Study Groups & Chat
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string>('');
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [groupInviteInput, setGroupInviteInput] = useState('');
  const [groupStatus, setGroupStatus] = useState<string | null>(null);
  const [chatText, setChatText] = useState('');
  const [chatShareNoteId, setChatShareNoteId] = useState('');
  const [renamingGroup, setRenamingGroup] = useState(false);
  const [renameGroupValue, setRenameGroupValue] = useState('');
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(false);
  const [groupActionBusy, setGroupActionBusy] = useState(false);
  const [memberProfiles, setMemberProfiles] = useState<Record<string, PublicProfile>>({});

  // Test Duels
  const [duels, setDuels] = useState<TestDuel[]>([]);
  const [duelExam, setDuelExam] = useState<ExamType>(profile.targetExam);
  const [duelSubject, setDuelSubject] = useState<string>('ALL');
  const [duelCount, setDuelCount] = useState<number>(10);
  const [duelSource, setDuelSource] = useState<'AI' | 'VAULT'>('AI');
  const [creatingDuel, setCreatingDuel] = useState(false);
  const [duelJoinCode, setDuelJoinCode] = useState('');
  const [duelStatus, setDuelStatus] = useState<string | null>(null);

  useEffect(() => {
    const grpQuery = query(
      collection(db, 'studyGroups'),
      where('memberIds', 'array-contains', profile.uid)
    );
    const unsubGroups = onSnapshot(
      grpQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<StudyGroup, 'id'>),
        }));
        setGroups(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'studyGroups')
    );

    const hostDuelQ = query(
      collection(db, 'duels'),
      where('hostId', '==', profile.uid)
    );
    const guestDuelQ = query(
      collection(db, 'duels'),
      where('guestId', '==', profile.uid)
    );

    const hostDuelMap = new Map<string, TestDuel>();
    const guestDuelMap = new Map<string, TestDuel>();
    const syncDuels = () => {
      const merged = new Map<string, TestDuel>([...guestDuelMap, ...hostDuelMap]);
      setDuels(Array.from(merged.values()));
    };

    const unsubDuelsHost = onSnapshot(
      hostDuelQ,
      (snap) => {
        hostDuelMap.clear();
        snap.docs.forEach((d) =>
          hostDuelMap.set(d.id, { id: d.id, ...(d.data() as Omit<TestDuel, 'id'>) })
        );
        syncDuels();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'duels')
    );

    const unsubDuelsGuest = onSnapshot(
      guestDuelQ,
      (snap) => {
        guestDuelMap.clear();
        snap.docs.forEach((d) =>
          guestDuelMap.set(d.id, { id: d.id, ...(d.data() as Omit<TestDuel, 'id'>) })
        );
        syncDuels();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'duels')
    );

    return () => {
      unsubGroups();
      unsubDuelsHost();
      unsubDuelsGuest();
    };
  }, [profile.uid]);

  const activeGroup = useMemo(
    () => groups.find((g) => g.id === activeGroupId) || groups[0] || null,
    [groups, activeGroupId]
  );

  // Load member display names cleanly from publicProfiles
  useEffect(() => {
    if (!activeGroup) return;
    let cancelled = false;
    const missingIds = activeGroup.memberIds.filter((uid) => !memberProfiles[uid]).slice(0, 25);
    if (missingIds.length === 0) return;

    void Promise.allSettled(missingIds.map((uid) => getDoc(doc(db, 'publicProfiles', uid)))).then(
      (results) => {
        if (cancelled) return;
        const updates: Record<string, PublicProfile> = {};
        results.forEach((res) => {
          if (res.status === 'fulfilled' && res.value.exists()) {
            const p = res.value.data() as PublicProfile;
            updates[p.uid] = p;
          }
        });
        if (Object.keys(updates).length > 0) {
          setMemberProfiles((prev) => ({ ...prev, ...updates }));
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [activeGroup, memberProfiles]);

  // Subscribe to real-time group messages
  useEffect(() => {
    if (!activeGroup) {
      setMessages([]);
      return;
    }
    const msgQuery = query(
      collection(db, 'studyGroups', activeGroup.id, 'messages'),
      where('memberIds', 'array-contains', profile.uid)
    );
    const unsub = onSnapshot(
      msgQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<GroupMessage, 'id'>),
        }));
        list.sort((a, b) => {
          const ta = (a.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
          const tb = (b.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
          return ta - tb;
        });
        setMessages(list.slice(-100));
      },
      (err) =>
        handleFirestoreError(
          err,
          OperationType.LIST,
          `studyGroups/${activeGroup.id}/messages`
        )
    );
    return () => unsub();
  }, [activeGroup, profile.uid]);

  // Sync newly joined group members onto messages sent by current user
  useEffect(() => {
    if (!activeGroup) return;
    messages.forEach((m) => {
      if (
        m.senderId === profile.uid &&
        m.memberIds.length !== activeGroup.memberIds.length
      ) {
        void updateDoc(
          doc(db, 'studyGroups', activeGroup.id, 'messages', m.id),
          { memberIds: activeGroup.memberIds }
        ).catch(() => {});
      }
    });
  }, [activeGroup, messages, profile.uid]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    const inviteCode = makeCode('GRP');
    try {
      const grpRef = doc(collection(db, 'studyGroups'));
      await setDoc(grpRef, {
        ownerId: profile.uid,
        name: newGroupName.trim().slice(0, 95),
        description: newGroupDesc.trim().slice(0, 280),
        targetExam: profile.targetExam,
        inviteCode,
        memberIds: [profile.uid],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'studyGroupInvites', inviteCode), {
        targetId: grpRef.id,
        ownerId: profile.uid,
        title: newGroupName.trim().slice(0, 95),
        targetExam: profile.targetExam,
        createdAt: serverTimestamp(),
      });
      setActiveGroupId(grpRef.id);
      setNewGroupName('');
      setNewGroupDesc('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'studyGroups');
    }
  };

  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = groupInviteInput.trim().toUpperCase();
    if (!code) return;
    setGroupStatus(null);
    try {
      const invSnap = await getDoc(doc(db, 'studyGroupInvites', code));
      if (!invSnap.exists()) {
        setGroupStatus('No study group matches that invite code.');
        return;
      }
      const { targetId } = invSnap.data() as { targetId: string };
      const grpRef = doc(db, 'studyGroups', targetId);
      const grpSnap = await getDoc(grpRef);
      if (!grpSnap.exists()) {
        setGroupStatus('Study group no longer exists.');
        return;
      }
      const gData = grpSnap.data() as StudyGroup;
      if (!gData.memberIds.includes(profile.uid)) {
        await updateDoc(grpRef, {
          memberIds: [...gData.memberIds, profile.uid],
          updatedAt: serverTimestamp(),
        });
      }
      setActiveGroupId(targetId);
      setGroupInviteInput('');
      setGroupStatus(`Joined "${gData.name}".`);
    } catch (err) {
      setGroupStatus(err instanceof Error ? err.message : 'Unable to join group.');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGroup || !chatText.trim()) return;
    const attachedNote = notes.find((n) => n.id === chatShareNoteId);
    try {
      await addDoc(collection(db, 'studyGroups', activeGroup.id, 'messages'), {
        groupId: activeGroup.id,
        senderId: profile.uid,
        senderName: profile.displayName,
        senderPhoto: profile.photoURL || '',
        text: chatText.trim().slice(0, 1950),
        attachmentType: attachedNote ? 'NOTE' : 'NONE',
        attachmentTitle: attachedNote ? `${attachedNote.title} (${attachedNote.subject})` : '',
        memberIds: activeGroup.memberIds,
        createdAt: serverTimestamp(),
      });
      setChatText('');
      setChatShareNoteId('');
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.CREATE,
        `studyGroups/${activeGroup.id}/messages`
      );
    }
  };

  const handleRenameGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGroup || activeGroup.ownerId !== profile.uid) return;
    const trimmed = renameGroupValue.trim().slice(0, 95);
    if (!trimmed) return;
    setGroupActionBusy(true);
    try {
      await updateDoc(doc(db, 'studyGroups', activeGroup.id), {
        name: trimmed,
        updatedAt: serverTimestamp(),
      });
      setRenamingGroup(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `studyGroups/${activeGroup.id}`);
    } finally {
      setGroupActionBusy(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!activeGroup || activeGroup.ownerId !== profile.uid) return;
    setGroupActionBusy(true);
    try {
      const batch = writeBatch(db);
      messages
        .filter((m) => m.senderId === profile.uid)
        .forEach((m) => {
          batch.delete(doc(db, 'studyGroups', activeGroup.id, 'messages', m.id));
        });
      if (activeGroup.inviteCode) {
        batch.delete(doc(db, 'studyGroupInvites', activeGroup.inviteCode));
      }
      batch.delete(doc(db, 'studyGroups', activeGroup.id));
      await batch.commit();
      setConfirmDeleteGroup(false);
      setActiveGroupId('');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `studyGroups/${activeGroup.id}`);
    } finally {
      setGroupActionBusy(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (!activeGroup || activeGroup.ownerId === profile.uid) return;
    setGroupActionBusy(true);
    try {
      await updateDoc(doc(db, 'studyGroups', activeGroup.id), {
        memberIds: arrayRemove(profile.uid),
        updatedAt: serverTimestamp(),
      });
      setActiveGroupId('');
      setGroupStatus(`Left study group "${activeGroup.name}".`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `studyGroups/${activeGroup.id}`);
    } finally {
      setGroupActionBusy(false);
    }
  };

  const sanitizeDuelQuestions = (list: PyqQuestion[]): PyqQuestion[] => {
    return list.slice(0, 30).map((q) => ({
      id: q.id,
      ownerId: q.ownerId || profile.uid,
      bankId: q.bankId || 'duel',
      visibility: q.visibility || 'PRIVATE',
      exam: q.exam || duelExam,
      classLevel: q.classLevel || '12',
      subject: q.subject,
      topic: q.topic || 'Mixed',
      year: q.year || '',
      questionType: q.questionType || 'MCQ',
      prompt: q.prompt,
      options: Array.isArray(q.options) ? q.options.slice(0, 6) : [],
      correctAnswer: q.correctAnswer,
      solution: q.solution || '',
      difficulty: q.difficulty || 'MEDIUM',
    }));
  };

  const handleCreateDuel = async () => {
    setDuelStatus(null);
    setCreatingDuel(true);
    try {
      let chosen: PyqQuestion[] = [];

      if (duelSource === 'AI') {
        const token = await auth.currentUser?.getIdToken();
        const curriculum = getStructuredCurriculum(duelExam);
        const subjectsToGen =
          duelSubject === 'ALL'
            ? getSubjectsForExam(duelExam)
            : [duelSubject as PyqQuestion['subject']];

        const basePerSub = Math.floor(duelCount / subjectsToGen.length);
        const rem = duelCount % subjectsToGen.length;

        const responses = await Promise.all(
          subjectsToGen.map(async (sub, idx) => {
            const countForSub = basePerSub + (idx < rem ? 1 : 0);
            if (countForSub <= 0) return [];
            const subCur = curriculum.find((c) => c.subject === sub);
            const chapters = (subCur?.chapters || [])
              .filter((c) => c.weightage === 'HIGH')
              .slice(0, 8)
              .map((c) => c.name);
            const fallbackChapters =
              chapters.length > 0
                ? chapters
                : (subCur?.chapters || []).slice(0, 8).map((c) => c.name);

            const res = await postApiJson<{ questions: PyqQuestion[] }>(
              '/api/tests/generate-ai',
              {
                exam: duelExam,
                subject: sub,
                classes: ['11', '12'],
                chapters: fallbackChapters.length > 0 ? fallbackChapters : [sub],
                count: countForSub,
                difficulty: 'MIXED',
                questionType: 'MCQ',
              },
              token
            );
            return Array.isArray(res.questions) ? res.questions : [];
          })
        );

        chosen = responses.flat().slice(0, duelCount);
        if (chosen.length === 0) {
          setDuelStatus('AI could not generate duel questions right now. Try again or switch to Vault PYQs.');
          return;
        }
      } else {
        const pool = questions.filter(
          (q) => q.exam === duelExam && (duelSubject === 'ALL' || q.subject === duelSubject)
        );
        if (pool.length === 0) {
          setDuelStatus('No Vault PYQs found for this exam/subject. Switch Question Source to AI Fresh Questions or upload PYQs.');
          return;
        }
        chosen = [...pool]
          .sort(() => Math.random() - 0.5)
          .slice(0, Math.min(duelCount, pool.length));
      }

      const duelCode = makeCode('DUEL');
      const inlineQuestions = sanitizeDuelQuestions(chosen);

      await setDoc(doc(db, 'duels', duelCode), {
        hostId: profile.uid,
        hostName: profile.displayName,
        guestId: '',
        guestName: '',
        duelCode,
        exam: duelExam,
        subject: duelSubject,
        questionCount: inlineQuestions.length,
        questionIds: inlineQuestions.map((q) => q.id),
        inlineQuestions,
        status: 'WAITING',
        hostProgress: 0,
        hostScore: 0,
        hostFinished: false,
        guestProgress: 0,
        guestScore: 0,
        guestFinished: false,
        winnerId: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setDuelStatus(
        `${duelSource === 'AI' ? 'AI-Powered ' : ''}Duel room ${duelCode} ready (${inlineQuestions.length} Qs)! Share the code or launch now.`
      );
    } catch (err) {
      setDuelStatus(err instanceof Error ? err.message : 'Unable to create duel.');
    } finally {
      setCreatingDuel(false);
    }
  };

  const handleJoinDuel = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = duelJoinCode.trim().toUpperCase();
    if (!code) return;
    setDuelStatus(null);
    try {
      const duelRef = doc(db, 'duels', code);
      const snap = await getDoc(duelRef);
      if (!snap.exists()) {
        setDuelStatus('Duel code not found.');
        return;
      }
      const d = snap.data() as TestDuel;
      if (d.hostId !== profile.uid && !d.guestId && d.status === 'WAITING') {
        await updateDoc(duelRef, {
          guestId: profile.uid,
          guestName: profile.displayName,
          status: 'ACTIVE',
          updatedAt: serverTimestamp(),
        });
      }
      setDuelJoinCode('');
      setDuelStatus(`Connected to duel ${code}! Click Launch Duel CBT to race.`);
    } catch (err) {
      setDuelStatus(err instanceof Error ? err.message : 'Unable to join duel.');
    }
  };

  const launchDuelTest = (duel: TestDuel) => {
    const duelQs =
      Array.isArray(duel.inlineQuestions) && duel.inlineQuestions.length > 0
        ? duel.inlineQuestions
        : duel.questionIds
            .map((id) => questions.find((q) => q.id === id))
            .filter((q): q is PyqQuestion => Boolean(q));
    if (duelQs.length === 0) {
      setDuelStatus('Duel questions are unavailable. Create an AI-Powered duel or ensure Vault PYQs are PUBLIC.');
      return;
    }
    onStartDuelExam({
      title: `1v1 Duel (${duel.duelCode})`,
      exam: duel.exam,
      testMode: 'DUEL',
      classLevel: 'ALL',
      subjectFilter: duel.subject,
      topicFilter: 'Duel',
      durationSeconds: Math.max(5, duelQs.length * 2) * 60,
      questions: duelQs,
      duelId: duel.duelCode,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight">
            Study Groups, Live Chat & Duel Arena
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Collaborate in real-time study rooms, race peers in 1v1 PYQ duels, and track verified global rankings.
          </p>
        </div>

        <div className="inline-flex p-1 bg-slate-200/70 dark:bg-slate-800 rounded-xl self-start">
          {([
            ['GROUPS', 'Study Groups & Chat', Users],
            ['DUELS', 'Test Duels', Swords],
            ['LEADERBOARD', 'Leaderboard', Trophy],
          ] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSubTab(key)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                subTab === key
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {subTab === 'GROUPS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-5">
            <form
              onSubmit={handleCreateGroup}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3"
            >
              <div className="font-bold font-display text-base">Create Study Group</div>
              <input
                type="text"
                required
                maxLength={90}
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g., AIR 500 Physics Squad"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
              <input
                type="text"
                maxLength={200}
                value={newGroupDesc}
                onChange={(e) => setNewGroupDesc(e.target.value)}
                placeholder="Short goal (optional)"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create Group</span>
              </button>
            </form>

            <form
              onSubmit={handleJoinGroup}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3"
            >
              <div className="flex items-center gap-2 font-bold font-display text-sm">
                <UserPlus className="w-4 h-4 text-emerald-500" />
                <span>Join Group by Invite Code</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={groupInviteInput}
                  onChange={(e) => setGroupInviteInput(e.target.value)}
                  placeholder="GRP-XXXXXX"
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono uppercase"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Join
                </button>
              </div>
              {groupStatus && <p className="text-xs text-slate-500 dark:text-slate-400">{groupStatus}</p>}
            </form>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-1.5">
              <div className="px-2 py-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Your Study Groups ({groups.length})
              </div>
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setActiveGroupId(g.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors cursor-pointer ${
                    activeGroup?.id === g.id
                      ? 'bg-indigo-600 text-white'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="font-semibold text-sm truncate">{g.name}</div>
                  <div className={`text-xs ${activeGroup?.id === g.id ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'}`}>
                    {EXAM_LABELS[g.targetExam]} · {g.memberIds.length} member(s)
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col min-h-[460px]">
            {!activeGroup ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                <MessageSquare className="w-8 h-8 text-slate-400 mb-3" />
                <p>Create or join a Study Group to start real-time chat and share notes or duel codes.</p>
              </div>
            ) : (
              <>
                <div className="p-5 border-b border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {renamingGroup ? (
                        <form onSubmit={handleRenameGroup} className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            required
                            maxLength={95}
                            value={renameGroupValue}
                            onChange={(e) => setRenameGroupValue(e.target.value)}
                            className="px-3 py-1.5 rounded-lg border border-indigo-400 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
                          />
                          <button
                            type="submit"
                            disabled={groupActionBusy}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenamingGroup(false)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </form>
                      ) : (
                        <h2 className="font-bold font-display text-lg truncate">{activeGroup.name}</h2>
                      )}
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {activeGroup.description || EXAM_LABELS[activeGroup.targetExam]} · {activeGroup.memberIds.length} member(s)
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void navigator.clipboard?.writeText(activeGroup.inviteCode)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-mono font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <span>Invite: {activeGroup.inviteCode}</span>
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      {activeGroup.ownerId === profile.uid ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setRenameGroupValue(activeGroup.name);
                              setRenamingGroup(true);
                              setConfirmDeleteGroup(false);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Rename</span>
                          </button>
                          {confirmDeleteGroup ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={groupActionBusy}
                                onClick={() => void handleDeleteGroup()}
                                className="px-2.5 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-semibold cursor-pointer"
                              >
                                {groupActionBusy ? 'Deleting...' : 'Confirm'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteGroup(false)}
                                className="px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteGroup(true)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 text-xs font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          )}
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={groupActionBusy}
                          onClick={() => void handleLeaveGroup()}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-300 text-xs font-semibold hover:bg-amber-50 dark:hover:bg-amber-950/30 cursor-pointer"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Leave</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Clean Member Directory Chips */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="text-slate-400 font-semibold mr-1">Members:</span>
                    {activeGroup.memberIds.map((uid) => {
                      const mp = memberProfiles[uid];
                      const name =
                        uid === profile.uid
                          ? `${profile.displayName} (You)`
                          : mp?.displayName || `Aspirant ${uid.slice(0, 5)}`;
                      return (
                        <span
                          key={uid}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium"
                        >
                          <span>{name}</span>
                          {uid === activeGroup.ownerId && (
                            <span className="text-indigo-600 dark:text-indigo-400 font-bold">· Host</span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-3 max-h-[380px]">
                  {messages.length === 0 ? (
                    <div className="text-center text-xs text-slate-500 dark:text-slate-400 py-12">
                      No messages yet. Say hello or share a study note below!
                    </div>
                  ) : (
                    messages.map((m) => {
                      const isMe = m.senderId === profile.uid;
                      return (
                        <div
                          key={m.id}
                          className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                        >
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                            {m.senderName}
                          </div>
                          <div
                            className={`max-w-[82%] px-4 py-2.5 rounded-2xl text-sm ${
                              isMe
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {m.attachmentTitle && (
                              <div className="text-xs font-semibold opacity-85 mb-1 underline">
                                Shared Note: {m.attachmentTitle}
                              </div>
                            )}
                            <p className="whitespace-pre-wrap">{m.text}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <form
                  onSubmit={handleSendMessage}
                  className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2"
                >
                  {notes.length > 0 && (
                    <select
                      value={chatShareNoteId}
                      onChange={(e) => setChatShareNoteId(e.target.value)}
                      className="w-full sm:w-auto px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    >
                      <option value="">Attach a Study Note (optional)</option>
                      {notes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.title} ({n.subject})
                        </option>
                      ))}
                    </select>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={chatText}
                      onChange={(e) => setChatText(e.target.value)}
                      placeholder="Message your study group..."
                      className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold cursor-pointer"
                    >
                      <Send className="w-4 h-4" />
                      <span>Send</span>
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {subTab === 'DUELS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold font-display">Host Custom 1v1 Test Duel</h2>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                  <Sparkles className="w-3.5 h-3.5" />
                  {duelSource === 'AI' ? 'AI Fresh' : 'Vault PYQs'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setDuelSource('AI')}
                  className={`py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                    duelSource === 'AI'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  AI Fresh (No PYQs Needed)
                </button>
                <button
                  type="button"
                  onClick={() => setDuelSource('VAULT')}
                  className={`py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                    duelSource === 'VAULT'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  From PYQ Vault
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold mb-1">Exam</label>
                  <select
                    value={duelExam}
                    onChange={(e) => setDuelExam(e.target.value as ExamType)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    <option value="JEE_MAINS">JEE Main</option>
                    <option value="JEE_ADV">JEE Advanced</option>
                    <option value="NEET">NEET UG</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Subject</label>
                  <select
                    value={duelSubject}
                    onChange={(e) => setDuelSubject(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    <option value="ALL">All Subjects</option>
                    {getSubjectsForExam(duelExam).map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Questions in Duel: <span className="font-mono">{duelCount}</span>
                </label>
                <input
                  type="range"
                  min={5}
                  max={duelSource === 'AI' ? 15 : 30}
                  step={5}
                  value={Math.min(duelCount, duelSource === 'AI' ? 15 : 30)}
                  onChange={(e) => setDuelCount(Number(e.target.value))}
                  className="w-full accent-indigo-600"
                />
              </div>
              <button
                type="button"
                disabled={creatingDuel}
                onClick={() => void handleCreateDuel()}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-slate-950 text-sm font-bold cursor-pointer"
              >
                {creatingDuel
                  ? duelSource === 'AI'
                    ? 'Generating AI Duel Questions...'
                    : 'Creating Duel Room...'
                  : 'Create Duel Room'}
              </button>
            </div>

            <form
              onSubmit={handleJoinDuel}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-3"
            >
              <h2 className="text-base font-bold font-display">Join Duel by Code</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={duelJoinCode}
                  onChange={(e) => setDuelJoinCode(e.target.value)}
                  placeholder="DUEL-XXXXXX"
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono uppercase"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Join Duel
                </button>
              </div>
              {duelStatus && <p className="text-xs text-slate-600 dark:text-slate-300">{duelStatus}</p>}
            </form>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold font-display">Your Duel Rooms ({duels.length})</h2>
            {duels.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                No active duels yet. Create a duel room on the left and share the code with a peer.
              </div>
            ) : (
              <div className="space-y-3">
                {duels.map((d) => (
                  <div
                    key={d.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="font-mono font-bold text-sm">
                        {d.duelCode} · {EXAM_LABELS[d.exam]} ({d.subject})
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {d.hostName} ({d.hostScore} pts) vs {d.guestName || 'Waiting for Challenger'} ({d.guestScore} pts) · {d.status}
                      </div>
                    </div>
                    {d.status !== 'FINISHED' && (
                      <button
                        type="button"
                        onClick={() => launchDuelTest(d)}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                      >
                        Launch Duel CBT
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'LEADERBOARD' && (
        <Leaderboard currentUserId={profile.uid} defaultExamFilter="ALL" />
      )}
    </div>
  );
};
