import React, { useMemo, useState } from 'react';
import {
  Copy,
  Download,
  Edit2,
  FolderPlus,
  Folders,
  LogOut,
  Plus,
  Share2,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import {
  addDoc,
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { exportNotesAsPdf } from '../lib/pdfExport';
import type { ExamType, StudyFolder, StudyNote, UserProfile } from '../types/obren';
import { EXAM_LABELS, getSubjectsForExam } from '../types/obren';
import { MathText } from './MathText';

interface NotesViewProps {
  profile: UserProfile;
  folders: StudyFolder[];
  notes: StudyNote[];
}

function makeCode(prefix: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = `${prefix}-`;
  for (let i = 0; i < 6; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export const NotesView: React.FC<NotesViewProps> = ({ profile, folders, notes }) => {
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderSubject, setNewFolderSubject] = useState<string>(getSubjectsForExam(profile.targetExam)[0]);
  const [newFolderShared, setNewFolderShared] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [joinStatus, setJoinStatus] = useState<string | null>(null);

  const [noteTitle, setNoteTitle] = useState('');
  const [noteTopic, setNoteTopic] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [editingNote, setEditingNote] = useState<StudyNote | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState(false);
  const [renameFolderValue, setRenameFolderValue] = useState('');
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState(false);
  const [folderActionBusy, setFolderActionBusy] = useState(false);

  const activeFolder = useMemo(() => {
    return folders.find((f) => f.id === selectedFolderId) || folders[0] || null;
  }, [folders, selectedFolderId]);

  const folderNotes = useMemo(() => {
    if (!activeFolder) return [];
    return notes.filter((n) => n.folderId === activeFolder.id);
  }, [notes, activeFolder]);

  React.useEffect(() => {
    if (!activeFolder) return;
    folderNotes.forEach((n) => {
      if (
        n.ownerId === profile.uid &&
        n.memberIds.length !== activeFolder.memberIds.length
      ) {
        void updateDoc(doc(db, 'studyNotes', n.id), {
          memberIds: activeFolder.memberIds,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    });
  }, [activeFolder, folderNotes, profile.uid]);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    const inviteCode = makeCode('FLD');
    try {
      const folderRef = doc(collection(db, 'studyFolders'));
      await setDoc(folderRef, {
        ownerId: profile.uid,
        name: newFolderName.trim().slice(0, 95),
        subject: newFolderSubject,
        exam: profile.targetExam as ExamType,
        isShared: newFolderShared,
        inviteCode,
        memberIds: [profile.uid],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (newFolderShared) {
        await setDoc(doc(db, 'studyFolderInvites', inviteCode), {
          targetId: folderRef.id,
          ownerId: profile.uid,
          title: newFolderName.trim().slice(0, 95),
          targetExam: profile.targetExam,
          createdAt: serverTimestamp(),
        });
      }
      setSelectedFolderId(folderRef.id);
      setNewFolderName('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'studyFolders');
    }
  };

  const handleJoinFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoinStatus(null);
    try {
      const invSnap = await getDoc(doc(db, 'studyFolderInvites', code));
      if (!invSnap.exists()) {
        setJoinStatus('No shared folder found for that invite code.');
        return;
      }
      const { targetId } = invSnap.data() as { targetId: string };
      const folderRef = doc(db, 'studyFolders', targetId);
      const folderSnap = await getDoc(folderRef);
      if (!folderSnap.exists()) {
        setJoinStatus('Shared folder no longer exists.');
        return;
      }
      const fData = folderSnap.data() as StudyFolder;
      if (!fData.memberIds.includes(profile.uid)) {
        await updateDoc(folderRef, {
          memberIds: [...fData.memberIds, profile.uid],
          updatedAt: serverTimestamp(),
        });
      }
      setSelectedFolderId(targetId);
      setJoinCode('');
      setJoinStatus(`Joined shared folder "${fData.name}".`);
    } catch (err) {
      setJoinStatus(err instanceof Error ? err.message : 'Unable to join folder.');
    }
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFolder || !noteTitle.trim() || !noteContent.trim()) return;
    try {
      if (editingNote) {
        await updateDoc(doc(db, 'studyNotes', editingNote.id), {
          title: noteTitle.trim().slice(0, 150),
          subject: activeFolder.subject,
          topic: noteTopic.trim().slice(0, 110),
          content: noteContent.trim().slice(0, 19500),
          memberIds: activeFolder.memberIds,
          updatedAt: serverTimestamp(),
        });
        setEditingNote(null);
      } else {
        await addDoc(collection(db, 'studyNotes'), {
          ownerId: profile.uid,
          authorName: profile.displayName,
          folderId: activeFolder.id,
          memberIds: activeFolder.memberIds,
          title: noteTitle.trim().slice(0, 150),
          subject: activeFolder.subject,
          topic: noteTopic.trim().slice(0, 110),
          content: noteContent.trim().slice(0, 19500),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      setNoteTitle('');
      setNoteTopic('');
      setNoteContent('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'studyNotes');
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await deleteDoc(doc(db, 'studyNotes', noteId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `studyNotes/${noteId}`);
    }
  };

  const handleRenameActiveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFolder || activeFolder.ownerId !== profile.uid) return;
    const trimmed = renameFolderValue.trim().slice(0, 95);
    if (!trimmed) return;
    setFolderActionBusy(true);
    try {
      await updateDoc(doc(db, 'studyFolders', activeFolder.id), {
        name: trimmed,
        updatedAt: serverTimestamp(),
      });
      setRenamingFolder(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `studyFolders/${activeFolder.id}`);
    } finally {
      setFolderActionBusy(false);
    }
  };

  const handleDeleteActiveFolder = async () => {
    if (!activeFolder || activeFolder.ownerId !== profile.uid) return;
    setFolderActionBusy(true);
    try {
      const batch = writeBatch(db);
      folderNotes
        .filter((n) => n.ownerId === profile.uid)
        .forEach((n) => {
          batch.delete(doc(db, 'studyNotes', n.id));
        });
      if (activeFolder.isShared && activeFolder.inviteCode) {
        batch.delete(doc(db, 'studyFolderInvites', activeFolder.inviteCode));
      }
      batch.delete(doc(db, 'studyFolders', activeFolder.id));
      await batch.commit();
      setConfirmDeleteFolder(false);
      setSelectedFolderId('');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `studyFolders/${activeFolder.id}`);
    } finally {
      setFolderActionBusy(false);
    }
  };

  const handleLeaveSharedFolder = async () => {
    if (!activeFolder || activeFolder.ownerId === profile.uid) return;
    setFolderActionBusy(true);
    try {
      await updateDoc(doc(db, 'studyFolders', activeFolder.id), {
        memberIds: arrayRemove(profile.uid),
        updatedAt: serverTimestamp(),
      });
      setSelectedFolderId('');
      setJoinStatus(`Left shared folder "${activeFolder.name}".`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `studyFolders/${activeFolder.id}`);
    } finally {
      setFolderActionBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight">
            Study Notes & Collaborative Folders
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Organize formulas, mistake logs, and shared group notes—then export any folder as a structured PDF.
          </p>
        </div>

        {activeFolder && (
          <button
            type="button"
            onClick={() => exportNotesAsPdf(activeFolder.name, folderNotes, activeFolder)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>Export Folder PDF ({folderNotes.length})</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sidebar: Folders & Join */}
        <div className="lg:col-span-4 space-y-5">
          <form
            onSubmit={handleCreateFolder}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3"
          >
            <div className="flex items-center gap-2 font-bold font-display text-base">
              <FolderPlus className="w-4 h-4 text-indigo-500" />
              <span>Create Study Folder</span>
            </div>
            <input
              type="text"
              required
              maxLength={90}
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g., Organic Mechanisms & Reagents"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
            <div className="flex items-center gap-3">
              <select
                value={newFolderSubject}
                onChange={(e) => setNewFolderSubject(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              >
                {getSubjectsForExam(profile.targetExam).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={newFolderShared}
                  onChange={(e) => setNewFolderShared(e.target.checked)}
                  className="accent-indigo-600"
                />
                <span>Shared</span>
              </label>
            </div>
            <button
              type="submit"
              className="w-full py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
            >
              Create Folder
            </button>
          </form>

          <form
            onSubmit={handleJoinFolder}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3"
          >
            <div className="flex items-center gap-2 font-bold font-display text-sm">
              <UserPlus className="w-4 h-4 text-emerald-500" />
              <span>Join Shared Folder by Code</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="FLD-XXXXXX"
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono uppercase"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
              >
                Join
              </button>
            </div>
            {joinStatus && <p className="text-xs text-slate-500 dark:text-slate-400">{joinStatus}</p>}
          </form>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2 px-2 py-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <Folders className="w-4 h-4" />
              <span>Your Folders ({folders.length})</span>
            </div>
            {folders.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 px-2 py-3">
                Create your first folder above to start writing and exporting PDF notes.
              </p>
            ) : (
              <div className="space-y-1">
                {folders.map((f) => {
                  const selected = activeFolder?.id === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setSelectedFolderId(f.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors cursor-pointer ${
                        selected
                          ? 'bg-indigo-600 text-white'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="font-semibold text-sm truncate">{f.name}</div>
                      <div className={`text-xs ${selected ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'}`}>
                        {f.subject} · {f.isShared ? `Shared (${f.memberIds.length})` : 'Private'}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Main Notes Workspace */}
        <div className="lg:col-span-8 space-y-6">
          {!activeFolder ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center text-sm text-slate-500 dark:text-slate-400">
              Select or create a folder on the left to add study notes and export organized PDFs.
            </div>
          ) : (
            <>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    {renamingFolder ? (
                      <form onSubmit={handleRenameActiveFolder} className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          required
                          maxLength={95}
                          value={renameFolderValue}
                          onChange={(e) => setRenameFolderValue(e.target.value)}
                          className="px-3 py-1.5 rounded-lg border border-indigo-400 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
                        />
                        <button
                          type="submit"
                          disabled={folderActionBusy}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold cursor-pointer"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingFolder(false)}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    ) : (
                      <h2 className="text-xl font-bold font-display truncate">{activeFolder.name}</h2>
                    )}
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {EXAM_LABELS[activeFolder.exam]} · {activeFolder.subject} · {activeFolder.memberIds.length} collaborator(s)
                      {activeFolder.ownerId !== profile.uid && ' · Shared with you'}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {activeFolder.isShared && (
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(activeFolder.inviteCode);
                          setCopiedCode(true);
                          setTimeout(() => setCopiedCode(false), 2000);
                        }}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-mono font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Share2 className="w-3.5 h-3.5 text-indigo-500" />
                        <span>{copiedCode ? 'Copied!' : `Invite: ${activeFolder.inviteCode}`}</span>
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {activeFolder.ownerId === profile.uid ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setRenameFolderValue(activeFolder.name);
                            setRenamingFolder(true);
                            setConfirmDeleteFolder(false);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Rename</span>
                        </button>
                        {confirmDeleteFolder ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={folderActionBusy}
                              onClick={() => void handleDeleteActiveFolder()}
                              className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-semibold cursor-pointer"
                            >
                              {folderActionBusy ? 'Deleting...' : 'Confirm Delete'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteFolder(false)}
                              className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteFolder(true)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 text-xs font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={folderActionBusy}
                        onClick={() => void handleLeaveSharedFolder()}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-300 text-xs font-semibold hover:bg-amber-50 dark:hover:bg-amber-950/30 cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Leave Folder</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <form
                onSubmit={handleSaveNote}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
              >
                <h3 className="text-base font-bold font-display">
                  {editingNote ? 'Edit Study Note' : 'Write New Note'}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    maxLength={150}
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    placeholder="Note Title (e.g., Gauss Law Applications)"
                    className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                  <input
                    type="text"
                    maxLength={100}
                    value={noteTopic}
                    onChange={(e) => setNoteTopic(e.target.value)}
                    placeholder="Chapter / Topic (optional)"
                    className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>
                <textarea
                  required
                  rows={5}
                  maxLength={19000}
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Write key derivations, formulas, NCERT highlights, or mistake takeaways..."
                  className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm leading-relaxed"
                />
                <div className="flex justify-end gap-2">
                  {editingNote && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingNote(null);
                        setNoteTitle('');
                        setNoteTopic('');
                        setNoteContent('');
                      }}
                      className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                    >
                      Cancel Edit
                    </button>
                  )}
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{editingNote ? 'Update Note' : 'Save Note'}</span>
                  </button>
                </div>
              </form>

              <div className="space-y-4">
                {folderNotes.map((note) => (
                  <div
                    key={note.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="font-bold text-base font-display">{note.title}</h4>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {note.topic || note.subject} · By {note.authorName}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => exportNotesAsPdf(note.title, [note], activeFolder)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNote(note);
                            setNoteTitle(note.title);
                            setNoteTopic(note.topic || '');
                            setNoteContent(note.content);
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          Edit
                        </button>
                        {note.ownerId === profile.uid && (
                          <button
                            type="button"
                            aria-label="Delete note"
                            onClick={() => void handleDeleteNote(note.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                      <MathText text={note.content} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
