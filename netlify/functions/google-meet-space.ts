import { Handler } from '@netlify/functions';
import fs from 'fs';
import path from 'path';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const authHeader = event.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!idToken) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Authentication token required.' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const { teacherId, groupId } = body;
    if (!teacherId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'teacherId is required.' }) };
    }

    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const apiKey = firebaseConfig.apiKey;
    const projectId = firebaseConfig.projectId;

    // Verify Firebase ID Token via identitytoolkit
    const verifyResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    const verifyData = await verifyResp.json();
    if (!verifyResp.ok || !verifyData.users?.[0]) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired Firebase authentication token.' }) };
    }
    const authenticatedUid = verifyData.users[0].localId;

    // Enforce that teachers cannot read or modify another teacher's tokens (teacherId must match authenticated user)
    if (authenticatedUid !== teacherId) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Unauthorized: Teacher ID mismatch.' }) };
    }

    // Retrieve token from Firestore collection teacher_oauth_tokens/{teacherId}
    const tokenDocUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/teacher_oauth_tokens/${teacherId}?key=${apiKey}`;
    const tokenResp = await fetch(tokenDocUrl);
    if (!tokenResp.ok) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Google account not connected for this teacher.' }) };
    }
    const tokenDoc = await tokenResp.json();
    let accessToken = tokenDoc.fields?.accessToken?.stringValue;
    const refreshToken = tokenDoc.fields?.refreshToken?.stringValue;

    // Validate group ownership if groupId provided
    if (groupId) {
      const groupsFile = path.resolve(process.cwd(), 'data/class_groups.json');
      if (fs.existsSync(groupsFile)) {
        const groups = JSON.parse(fs.readFileSync(groupsFile, 'utf-8'));
        const group = groups.find((g: any) => g.id === groupId);
        if (group && group.teacherId !== teacherId) {
          return { statusCode: 403, body: JSON.stringify({ error: 'Unauthorized: You do not own this study group.' }) };
        }
      }
    }

    // Call Google Meet API v2 with scope https://www.googleapis.com/auth/meetings.space.created
    let meetResp = await fetch('https://meet.googleapis.com/v2/spaces', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (meetResp.status === 401 && refreshToken) {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (clientId && clientSecret) {
        const refreshResp = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
          }),
        });
        const refreshData = (await refreshResp.json()) as { access_token?: string };
        if (refreshData.access_token) {
          accessToken = refreshData.access_token;
          meetResp = await fetch('https://meet.googleapis.com/v2/spaces', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
          });
        }
      }
    }

    if (!meetResp.ok) {
      const errText = await meetResp.text();
      return {
        statusCode: meetResp.status,
        body: JSON.stringify({ error: `Google Meet API error: ${errText}` }),
      };
    }

    const meetData = (await meetResp.json()) as { meetingUri?: string; meetingCode?: string };
    const meetingCode = meetData.meetingCode || (meetData.meetingUri ? meetData.meetingUri.split('/').pop() : '');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meetingUri: meetData.meetingUri || `https://meet.google.com/${meetingCode}`,
        meetingCode,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err instanceof Error ? err.message : 'Internal Server Error' }),
    };
  }
};
