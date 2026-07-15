'use strict';
import type { Request, Response, NextFunction } from 'express';
import type { AuthUser } from '../types/express';
const jwt = require('jsonwebtoken');
const { AUTH_COOKIE } = require('../utils/cookieOptions');

module.exports = function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) {
    return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบก่อน' });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET) as AuthUser;
    next();
  } catch (err: any) {
    const msg = err.name === 'TokenExpiredError'
      ? 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่'
      : 'Token ไม่ถูกต้อง';
    res.status(401).json({ message: msg });
  }
};
