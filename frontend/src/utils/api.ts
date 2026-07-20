const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

// Every route except these two prefixes sits behind requireAuth on the
// backend (see server.ts) — so a 401 from anything else unambiguously means
// the session cookie is missing/expired, not "wrong password" or "not
// logged in yet" (which /api/auth/* routes surface as 401 all the time as
// normal, expected outcomes — redirecting on those would break the login
// form itself and the public supplier magic-link flow has no session concept
// to expire in the first place).
const SESSION_EXEMPT_PREFIXES = ['/api/auth', '/api/public'];

export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
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

  // The SPA only checks "am I logged in" once, on first load (see
  // AuthContext.tsx) — after that, `user` just sits in React memory with no
  // re-check, so a JWT that expires (or a laptop that sleeps past the 8h
  // cookie lifetime) never gets noticed until the user happens to look at
  // stale-looking data. A hard reload (not the Next.js router) is
  // deliberate here — it wipes every in-memory context (Auth/Criteria/
  // EvalFlow) at once instead of leaving the rest of the app half-stale
  // while only the auth piece resets.
  if (
    res.status === 401 &&
    typeof window !== 'undefined' &&
    !SESSION_EXEMPT_PREFIXES.some(p => path.startsWith(p)) &&
    !window.location.pathname.startsWith('/login')
  ) {
    window.location.href = '/login';
  }

  return res;
}

export const API_BASE = BASE;
