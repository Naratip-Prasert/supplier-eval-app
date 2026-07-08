'use strict';
const isProd = process.env.NODE_ENV === 'production';

const AUTH_COOKIE = 'spe_token';

// 'none' is required when the frontend/backend end up on different
// subdomains in production (cross-site from the cookie spec's point of
// view); 'lax' is fine in dev since localhost:5173/localhost:5000 are
// same-site (site = registrable domain + scheme, port doesn't count).
const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  maxAge: 8 * 60 * 60 * 1000, // mirrors the JWT's 8h expiresIn
  path: '/',
};

module.exports = { AUTH_COOKIE, cookieOptions };
