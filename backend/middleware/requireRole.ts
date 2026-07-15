'use strict';
import type { Request, Response, NextFunction } from 'express';
import type { AuthUser } from '../types/express';

// Collapses the role-gate pattern that used to be duplicated inline across
// 7 route files (some as `role !== 'ADMIN'`, some as `!['ADMIN','SUPERVISOR']
// .includes(...)`, one as a locally-defined `requireAdmin` in criteria.ts) —
// each with its own slightly different 403 message wording. This is the
// single source of truth for that message format now.
module.exports = function requireRole(...roles: AuthUser['role'][]) {
  return function (req: Request, res: Response, next: NextFunction) {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: `สิทธิ์ไม่เพียงพอ (ต้องการ ${roles.join(' หรือ ')})` });
    }
    next();
  };
};
