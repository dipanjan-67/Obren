import React, { useEffect, useRef, useState } from 'react';
import {
  Clock,
  ExternalLink,
  GraduationCap,
  LogOut,
  Maximize2,
  MessageSquare,
  Minimize2,
  Monitor,
  MonitorOff,
  PenTool,
  Radio,
  Share2,
  ShieldCheck,
  UserCheck,
  Users,
  Video,
  VideoOff,
  Volume2,
} from 'lucide-react';
import { recordClassroomAttendance } from '../lib/teacherClient';
import { StudyGroupChatBox } from './StudyGroupChatBox';
import { ClassroomWhiteboard } from './ClassroomWhiteboard';

interface InWebsiteClassroomProps {
  classId: string;
  groupId?: string;
  title: string;
  subject: string;
  teacherId?: string;
  teacherName: string;
  groupName: string;
  meetUri: string;
  isTeacher: boolean;
  studentId?: string;
  studentName?: string;
  studentEmail?: string;
  onEndClass?: () => void;
  onLeaveClass: () => void;
}

export const InWebsiteClassroom: React.FC<InWebsiteClassroomProps> = ({
  classId,
  groupId,
  title,
  subject,
  teacherId,
  teacherName,
  groupName,
  meetUri,
  isTeacher,
  studentId,
  studentName,
  studentEmail,
  onEndClass,
  onLeaveClass,
}) => {
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [attendanceLogged, setAttendanceLogged] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [notes, setNotes] = useState('');
  const [sidebarTab, setSidebarTab] = useState<'CHAT' | 'NOTES'>(groupId ? 'CHAT' : 'NOTES');
  const [stageMode, setStageMode] = useState<'MEET' | 'WHITEBOARD'>('MEET');

  // WebRTC Screen Sharing state
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);

  // Start live timer
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Clean up screen stream on unmount
  useEffect(() => {
    return () => {
      if (screenStream) {
        screenStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [screenStream]);

  // Attach screen stream to video element when available
  useEffect(() => {
    if (screenVideoRef.current && screenStream) {
      screenVideoRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  const toggleScreenShare = async () => {
    if (isSharingScreen) {
      if (screenStream) {
        screenStream.getTracks().forEach((track) => track.stop());
      }
      setScreenStream(null);
      setIsSharingScreen(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' } as MediaTrackConstraints,
          audio: true,
        });

        stream.getVideoTracks()[0].onended = () => {
          setScreenStream(null);
          setIsSharingScreen(false);
        };

        setScreenStream(stream);
        setIsSharingScreen(true);
      } catch (err) {
        console.error('Screen sharing failed or cancelled:', err);
      }
    }
  };

  // Record student attendance join and leave
  useEffect(() => {
    if (!isTeacher && studentId && studentName) {
      recordClassroomAttendance(classId, studentId, studentName, studentEmail, 'JOIN').then(() => {
        setAttendanceLogged(true);
      });

      return () => {
        recordClassroomAttendance(classId, studentId, studentName, studentEmail, 'LEAVE');
      };
    }
  }, [classId, isTeacher, studentId, studentName, studentEmail]);

  const formatTimer = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleCopyMeetLink = () => {
    navigator.clipboard.writeText(meetUri);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleLeave = () => {
    if (!isTeacher && studentId && studentName) {
      recordClassroomAttendance(classId, studentId, studentName, studentEmail, 'LEAVE');
    }
    onLeaveClass();
  };

  return (
    <div
      className={`flex flex-col bg-slate-900 text-white rounded-3xl overflow-hidden border border-slate-800 shadow-2xl transition-all ${
        isFullscreen ? 'fixed inset-2 z-50 rounded-2xl' : 'min-h-[640px]'
      }`}
    >
      {/* Classroom Header Bar */}
      <div className="bg-slate-950/80 px-6 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">
            <Radio className="w-3.5 h-3.5 text-rose-400" />
            LIVE CLASS
          </span>
          <div>
            <h2 className="text-lg font-bold text-white leading-tight flex items-center gap-2">
              {title || 'Live Interactive Lecture'}
              <span className="text-xs px-2 py-0.5 rounded bg-indigo-900/60 text-indigo-300 font-medium">
                {subject}
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Group: <span className="text-slate-200 font-semibold">{groupName}</span> · Teacher:{' '}
              <span className="text-slate-200 font-semibold">{teacherName}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Live Timer */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-200 text-xs font-mono font-bold">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>{formatTimer(secondsElapsed)}</span>
          </div>

          {/* Attendance Indicator */}
          {!isTeacher && attendanceLogged && (
            <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-400 text-xs">
              <UserCheck className="w-3.5 h-3.5" />
              <span>Attendance Logged</span>
            </div>
          )}

          {/* Screen Share Toggle Button */}
          <button
            type="button"
            onClick={toggleScreenShare}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              isSharingScreen
                ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-md animate-pulse'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md'
            }`}
            title={isSharingScreen ? 'Stop Screen Sharing' : 'Share Your Screen'}
          >
            {isSharingScreen ? <MonitorOff className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
            <span>{isSharingScreen ? 'Stop Sharing' : 'Share Screen'}</span>
          </button>

          {/* Fullscreen toggle */}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Action buttons */}
          {isTeacher ? (
            <button
              type="button"
              onClick={onEndClass}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              End Live Class
            </button>
          ) : (
            <button
              type="button"
              onClick={handleLeave}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-xs transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Leave Room
            </button>
          )}
        </div>
      </div>

      {/* Main Classroom Body */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden">
        {/* Left / Center Video Stage */}
        <div className="lg:col-span-8 p-6 flex flex-col justify-between bg-gradient-to-b from-slate-900 to-slate-950 border-r border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setStageMode('MEET')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  stageMode === 'MEET' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Video className="w-3.5 h-3.5" />
                <span>Google Meet Room</span>
              </button>
              <button
                type="button"
                onClick={() => setStageMode('WHITEBOARD')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  stageMode === 'WHITEBOARD' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>GoodNotes Whiteboard</span>
              </button>
            </div>
          </div>

          {stageMode === 'WHITEBOARD' ? (
            <ClassroomWhiteboard
              groupId={groupId}
              isTeacher={isTeacher}
              userName={isTeacher ? teacherName : studentName || 'Student'}
            />
          ) : isSharingScreen ? (
            <div className="rounded-2xl bg-black border border-slate-800 p-3 flex flex-col items-center justify-center my-auto min-h-[420px] relative overflow-hidden shadow-2xl">
              <video
                ref={screenVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full max-h-[520px] object-contain rounded-xl"
              />
              <div className="absolute top-4 left-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700 text-white text-xs font-bold shadow-md">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                <span>Live Screen Presentation</span>
              </div>
              <button
                type="button"
                onClick={toggleScreenShare}
                className="absolute bottom-4 right-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-lg transition-colors cursor-pointer"
              >
                <MonitorOff className="w-4 h-4" />
                <span>Stop Sharing</span>
              </button>
            </div>
          ) : (
            <div className="rounded-2xl bg-slate-950 border border-slate-800/90 p-8 flex flex-col items-center justify-center text-center my-auto min-h-[380px] relative overflow-hidden">
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#4f46e5_1px,transparent_1px)] [background-size:16px_16px]" />

            <div className="w-20 h-20 rounded-3xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center mb-5 text-indigo-400">
              <Video className="w-10 h-10" />
            </div>

            <h3 className="text-xl font-bold text-white mb-2">Google Meet Live Room</h3>
            <p className="text-slate-400 text-sm max-w-md mb-6 leading-relaxed">
              Connect your camera and microphone through the Google Meet session.
              Attendance is tracked in the background.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <a
                href={meetUri}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 transition-all cursor-pointer"
              >
                <Video className="w-4 h-4" />
                Launch Google Meet Space
                <ExternalLink className="w-3.5 h-3.5 opacity-70" />
              </a>

              <button
                type="button"
                onClick={handleCopyMeetLink}
                className="inline-flex items-center gap-1.5 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-colors cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                {copiedLink ? 'Copied Meeting URL!' : 'Copy Meeting Link'}
              </button>
            </div>

            <div className="mt-6 flex items-center gap-2 text-xs text-slate-500 font-mono">
              <span>Space URL:</span>
              <span className="text-slate-400 underline truncate max-w-xs">{meetUri}</span>
            </div>
          </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Verified Session · Isolated Group Access</span>
            </div>
            <div>
              <span>Active Duration: </span>
              <span className="font-mono text-white font-bold">{formatTimer(secondsElapsed)}</span>
            </div>
          </div>
        </div>

        {/* Right Panel: Live Group Chat & Scratchpad Notes */}
        <div className="lg:col-span-4 p-5 bg-slate-950 flex flex-col justify-between gap-4">
          {groupId && (
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
              <button
                type="button"
                onClick={() => setSidebarTab('CHAT')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  sidebarTab === 'CHAT'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Group Chat</span>
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab('NOTES')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  sidebarTab === 'NOTES'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <GraduationCap className="w-3.5 h-3.5" />
                <span>Scratchpad</span>
              </button>
            </div>
          )}

          {sidebarTab === 'CHAT' && groupId ? (
            <StudyGroupChatBox
              groupId={groupId}
              groupName={groupName}
              subject={subject}
              role={isTeacher ? 'TEACHER' : 'STUDENT'}
              userId={isTeacher ? teacherId || 'teacher' : studentId || ''}
              userName={isTeacher ? teacherName : studentName || 'Student'}
              compact
              darkSurface
            />
          ) : (
            <div className="flex-1">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-indigo-400" />
                  Classroom Scratchpad &amp; Notes
                </h4>
              </div>

              <p className="text-xs text-slate-400 mb-3">
                Jot down quick key formulas, derivations, or doubt questions during the live
                explanation.
              </p>

              <textarea
                rows={12}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Focus on Gauss's Law step 3, calculate flux for cylindrical Gaussian surface..."
                className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
          )}

          <div className="pt-3 border-t border-slate-800 text-xs text-slate-400 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span>Class Status:</span>
              <span className="text-emerald-400 font-semibold">Active Transmission</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Participant Role:</span>
              <span className="text-indigo-300 font-semibold">
                {isTeacher ? 'Teacher / Host' : 'Enrolled Student'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
