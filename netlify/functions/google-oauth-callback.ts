import { Handler } from '@netlify/functions';
import fs from 'fs';
import path from 'path';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const queryParams = event.queryStringParameters || {};
  const code = queryParams.code;
  const state = queryParams.state;

  if (!code || !state) {
    return { statusCode: 400, body: 'Authorization code or state missing.' };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return { statusCode: 500, body: 'Server OAuth configuration missing.' };
  }

  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const apiKey = firebaseConfig.apiKey;
    const projectId = firebaseConfig.projectId;

    // Validate CSRF state in Firestore
    const stateDocUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/oauth_states/${state}?key=${apiKey}`;
    const stateResp = await fetch(stateDocUrl);
    if (!stateResp.ok) {
      return { statusCode: 403, body: 'Invalid or expired OAuth state (CSRF check failed).' };
    }
    const stateData = await stateResp.json();
    const teacherUid = stateData.fields?.teacherUid?.stringValue;

    if (!teacherUid) {
      return { statusCode: 403, body: 'Associated teacher UID not found in state.' };
    }

    // Delete state document (single use)
    await fetch(stateDocUrl, { method: 'DELETE' });

    // Exchange code for tokens
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = (await tokenResp.json()) as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
    };

    if (!tokenResp.ok || !tokenData.access_token) {
      return { statusCode: 400, body: `Token exchange failed: ${tokenData.error || 'Unknown error'}` };
    }

    // Store tokens securely in Firestore collection teacher_oauth_tokens/{teacherUid}
    const tokenDocUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/teacher_oauth_tokens/${teacherUid}?key=${apiKey}`;
    const fieldsToSave: Record<string, any> = {
      accessToken: { stringValue: tokenData.access_token },
      updatedAt: { timestampValue: new Date().toISOString() },
    };
    if (tokenData.refresh_token) {
      fieldsToSave.refreshToken = { stringValue: tokenData.refresh_token };
    }

    await fetch(tokenDocUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: fieldsToSave }),
    });

    return {
      statusCode: 302,
      headers: { Location: '/?googleAuth=success' },
      body: '',
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: err instanceof Error ? err.message : 'Callback failed.',
    };
  }
};
