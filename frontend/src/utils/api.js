const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export async function authFetch(path, options = {}) {
  const token = localStorage.getItem('spe_token');
  const isFormData = options.body instanceof FormData;
  return fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      // FormData needs the browser to set its own multipart boundary —
      // forcing application/json here breaks file uploads.
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export const API_BASE = BASE;
