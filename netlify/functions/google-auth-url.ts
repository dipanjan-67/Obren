import { Handler } from '@netlify/functions';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const queryParams = event.queryStringParameters || {};
    const teacherUid = queryParams.teacherUid;
    if (!teacherUid) {
      return { statusCode: 400, body: JSON.stringify({ error: 'teacherUid is required.' }) };
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Google OAuth configuration missing.' }) };
    }

    // Generate cryptographic CSRF state token
    const stateToken = crypto.randomBytes(24).toString('hex');

    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const apiKey = firebaseConfig.apiKey;
    const projectId = firebaseConfig.projectId;

    // Store state in Firestore via REST API
    const firestoreRestUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/oauth_states/${stateToken}?key=${apiKey}`;
    await fetch(firestoreRestUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          teacherUid: { stringValue: teacherUid },
          createdAt: { timestampValue: new Date().toISOString() },
        },
      }),
    });

    const scope = 'https://www.googleapis.com/auth/meetings.space.created';
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
      clientId
    )}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(
      scope
    )}&access_type=offline&prompt=consent&state=${encodeURIComponent(stateToken)}`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authUrl }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
    };
  }
};
