'use strict';
// Verifies credentials against BJC's corporate EHR system so this app no
// longer needs to be the source of truth for real employees' passwords.
// Login (auth.controller.ts) tries this FIRST and only falls back to the
// local password_hash/bcrypt check when this returns false — that covers
// both "this empno doesn't exist in EHR" (local/system test accounts) and
// "the EHR API itself is down" (so login isn't a single point of failure).

const EHR_TIMEOUT_MS = 8000;

async function verifyViaEhr(empno: string, password: string): Promise<boolean> {
  const url = process.env.EHR_API_URL;
  const apiKey = process.env.EHR_API_KEY;
  if (!url || !apiKey) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EHR_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({ empno, password }),
      signal: controller.signal,
    });

    // Response contract not fully documented on our side yet — logging the
    // status (never the password) lets us confirm/adjust this against real
    // logins without needing to guess the body shape up front.
    console.log(`[ehrAuth] empno="${empno}" → HTTP ${res.status}`);
    if (!res.ok) return false;

    const data = await res.json().catch(() => null);
    // Treat a 2xx with no explicit failure flag as success; some APIs
    // return 200 with an internal { success:false } / { status:"fail" }
    // body instead of a non-2xx status, so guard against that too.
    if (data && typeof data === 'object') {
      if ('success' in data && !data.success) return false;
      if ('status' in data && typeof data.status === 'string' && data.status.toLowerCase() !== 'success') return false;
    }
    return true;
  } catch (err: any) {
    console.warn(`[ehrAuth] empno="${empno}" → request failed: ${err.message}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { verifyViaEhr };
