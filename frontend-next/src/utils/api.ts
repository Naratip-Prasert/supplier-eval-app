const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const isFormData = options.body instanceof FormData;
  return fetch(`${BASE}${path}`, {
    ...options,
    // Auth now lives in an httpOnly cookie set by the backend — the browser
    // attaches it automatically, we just need to ask it to.
    credentials: 'include',
    headers: {
      // FormData needs the browser to set its own multipart boundary —
      // forcing application/json here breaks file uploads.
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
      // Required by the backend's CSRF guard — a plain cross-site <form>
      // POST can't set a custom header, so this forces the same
      // preflight-then-origin-check gate onto every request.
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
}

export const API_BASE = BASE;
