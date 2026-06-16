const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export async function authFetch(path, options = {}) {
  const token = localStorage.getItem('spe_token');
  return fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export const API_BASE = BASE;
