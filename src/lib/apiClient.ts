export class ApiRequestError extends Error {
  status: number;
  retryable: boolean;
  needsSessionReload: boolean;

  constructor(
    message: string,
    opts?: { status?: number; retryable?: boolean; needsSessionReload?: boolean }
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = opts?.status ?? 500;
    this.retryable = Boolean(opts?.retryable);
    this.needsSessionReload = Boolean(opts?.needsSessionReload);
  }
}

interface ProbeOutcome {
  authRedirected: boolean;
  staticSpaOnly: boolean;
  backendHealthy: boolean;
}

async function probeApiGateway(): Promise<ProbeOutcome> {
  try {
    const healthUrl = new URL('/api/health', window.location.origin).toString();
    const probe = await fetch(healthUrl, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'manual',
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    if (probe.type === 'opaqueredirect' || probe.status === 0 || (probe.status >= 300 && probe.status < 400)) {
      return { authRedirected: true, staticSpaOnly: false, backendHealthy: false };
    }

    const probeText = await probe.text();
    try {
      const parsed = JSON.parse(probeText) as { ok?: boolean };
      return {
        authRedirected: false,
        staticSpaOnly: false,
        backendHealthy: Boolean(probe.ok && parsed.ok),
      };
    } catch {
      const isAppShell = /<title[^>]*>\s*OBREN\b/i.test(probeText);
      const isAuthHtml =
        /accounts\.google\.com|sign in|authentication|aistudio/i.test(probeText) &&
        !isAppShell;
      return {
        authRedirected: isAuthHtml,
        staticSpaOnly: isAppShell,
        backendHealthy: false,
      };
    }
  } catch {
    return { authRedirected: false, staticSpaOnly: false, backendHealthy: false };
  }
}

async function parseApiResponse<T>(resp: Response): Promise<T> {
  const rawText = await resp.text();
  let parsed: (T & { error?: string; retryable?: boolean }) | null = null;
  try {
    parsed = JSON.parse(rawText) as T & { error?: string; retryable?: boolean };
  } catch {
    const looksLikeHtml = /^\s*</.test(rawText) || /<html[\s>]|<!doctype/i.test(rawText);
    if (looksLikeHtml) {
      const isAppShell = /<title[^>]*>\s*OBREN\b/i.test(rawText);
      const probe = typeof window !== 'undefined'
        ? await probeApiGateway()
        : { authRedirected: false, staticSpaOnly: false, backendHealthy: false };

      if (resp.redirected || probe.authRedirected) {
        throw new ApiRequestError(
          'Your preview gateway session expired or redirected to authentication. Click "Reload Preview Session" below and try again.',
          {
            status: resp.status,
            retryable: false,
            needsSessionReload: true,
          }
        );
      }

      if (isAppShell || probe.staticSpaOnly) {
        throw new ApiRequestError(
          'The API backend is not reachable on this static preview host (received app shell HTML instead of JSON). Reload the live server preview and retry.',
          {
            status: resp.status,
            retryable: false,
            needsSessionReload: true,
          }
        );
      }

      if (resp.status === 502 || resp.status === 504) {
        throw new ApiRequestError(
          `Request timed out at gateway (HTTP ${resp.status}). Retrying automatically...`,
          { status: resp.status, retryable: true }
        );
      }

      throw new ApiRequestError(
        `Preview gateway returned an HTML page (HTTP ${resp.status}). Reloading the preview session usually clears this.`,
        {
          status: resp.status,
          retryable: resp.status >= 500 || resp.status === 429,
          needsSessionReload: resp.status === 200 || resp.status === 401 || resp.status === 403,
        }
      );
    }

    const snippet = rawText.replace(/\s+/g, ' ').trim().slice(0, 140) || `HTTP ${resp.status}`;
    throw new ApiRequestError(`Unexpected server response (${snippet}).`, {
      status: resp.status,
      retryable: resp.status >= 500 || resp.status === 429,
    });
  }

  if (!resp.ok || !parsed) {
    throw new ApiRequestError(
      parsed?.error || `Server request failed (HTTP ${resp.status}).`,
      {
        status: resp.status,
        retryable: Boolean(parsed?.retryable) || resp.status >= 500 || resp.status === 429,
      }
    );
  }

  return parsed;
}

export async function getApiJson<T>(path: string, idToken?: string): Promise<T> {
  const resolvedUrl =
    typeof window !== 'undefined' ? new URL(path, window.location.origin).toString() : path;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  let resp: Response;
  try {
    resp = await fetch(resolvedUrl, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'follow',
      headers,
    });
  } catch (networkErr) {
    throw new ApiRequestError(
      networkErr instanceof Error
        ? `Network error while contacting server: ${networkErr.message}`
        : 'Network error while contacting server.',
      { status: 0, retryable: true }
    );
  }

  return parseApiResponse<T>(resp);
}

export async function postApiJson<T>(
  path: string,
  body: unknown,
  idToken?: string
): Promise<T> {
  const resolvedUrl =
    typeof window !== 'undefined' ? new URL(path, window.location.origin).toString() : path;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  let resp: Response;
  try {
    resp = await fetch(resolvedUrl, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'follow',
      headers,
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    throw new ApiRequestError(
      networkErr instanceof Error
        ? `Network error while contacting server: ${networkErr.message}`
        : 'Network error while contacting server.',
      { status: 0, retryable: true }
    );
  }

  return parseApiResponse<T>(resp);
}
