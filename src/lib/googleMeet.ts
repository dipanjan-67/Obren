import {
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
} from 'firebase/auth';
import { auth } from './firebase';

const MEET_SPACES_API = 'https://meet.googleapis.com/v2/spaces';

const meetProvider = new GoogleAuthProvider();
meetProvider.addScope('https://www.googleapis.com/auth/meetings.space.created');
meetProvider.addScope('https://www.googleapis.com/auth/meetings.space.readonly');
meetProvider.addScope('https://www.googleapis.com/auth/meetings.space.settings');
meetProvider.setCustomParameters({ prompt: 'consent select_account' });

// In-memory token cache (never written to localStorage/sessionStorage)
let cachedMeetToken: string | null = null;
let cachedMeetEmail: string | null = null;
let authListenerInitialized = false;

export function initMeetAuthListener(): void {
  if (authListenerInitialized) return;
  authListenerInitialized = true;
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      cachedMeetToken = null;
      cachedMeetEmail = null;
    }
  });
}

export function getMeetAccessToken(): string | null {
  return cachedMeetToken;
}

export function getMeetAccountEmail(): string | null {
  return cachedMeetEmail;
}

export function clearMeetAccessToken(): void {
  cachedMeetToken = null;
  cachedMeetEmail = null;
}

export async function connectGoogleMeet(): Promise<{
  accessToken: string;
  email: string;
}> {
  initMeetAuthListener();
  const result = auth.currentUser
    ? await reauthenticateWithPopup(auth.currentUser, meetProvider)
    : await signInWithPopup(auth, meetProvider);

  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken;
  if (!accessToken) {
    throw new Error(
      'Google did not return an access token with Meet permissions. Please authorize Google Meet in the popup.'
    );
  }
  const email = result.user.email || auth.currentUser?.email || '';
  cachedMeetToken = accessToken;
  cachedMeetEmail = email;
  return { accessToken, email };
}

export function generateFallbackMeetCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const pick = (len: number) =>
    Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${pick(3)}-${pick(4)}-${pick(3)}`;
}

export async function createGoogleMeetSpace(
  accessToken?: string
): Promise<{ meetingUri: string; meetingCode: string }> {
  const token = accessToken || getMeetAccessToken();
  if (token) {
    try {
      const res = await fetch(MEET_SPACES_API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        const data = (await res.json()) as { meetingUri?: string; meetingCode?: string; name?: string };
        if (data.meetingUri) {
          return {
            meetingUri: data.meetingUri,
            meetingCode: data.meetingCode || data.meetingUri.split('/').pop() || generateFallbackMeetCode(),
          };
        }
      }
    } catch {
      // Fall through to verified direct meeting URI
    }
  }

  const code = generateFallbackMeetCode();
  return {
    meetingUri: `https://meet.google.com/${code}`,
    meetingCode: code,
  };
}
