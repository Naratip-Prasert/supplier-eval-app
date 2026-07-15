'use strict';
import type { Request, Response } from 'express';
const pool    = require('../../db');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const { AUTH_COOKIE, cookieOptions } = require('../../utils/cookieOptions');

// ── POST /api/auth/login ──────────────────────────────────────
async function login(req: Request, res: Response) {
  const { identifier, password } = req.body;

  if (!identifier?.trim() || !password) {
    return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบ' });
  }

  try {
    const id = identifier.trim();
    const result = await pool.query(
      `SELECT e.employee_id, e.full_name, e.role, e.email, e.password_hash,
              d.name_th AS department, j.name_th AS job_title
         FROM employees e
         LEFT JOIN departments d ON d.id = e.department_id
         LEFT JOIN job_titles  j ON j.id = e.job_title_id
        WHERE (UPPER(e.employee_id) = UPPER($1) OR e.email = LOWER($1))
          AND e.is_active = TRUE`,
      [id]
    );

    const emp = result.rows[0];
    if (!emp || !emp.password_hash) {
      console.warn(`[auth] login failed: ไม่พบบัญชี "${identifier}"`);
      return res.status(401).json({ message: 'รหัสพนักงาน/Email หรือรหัสผ่านไม่ถูกต้อง' });
    }

    const valid = await bcrypt.compare(password, emp.password_hash);
    if (!valid) {
      console.warn(`[auth] login failed: password ผิด สำหรับ "${identifier}"`);
      return res.status(401).json({ message: 'รหัสพนักงาน/Email หรือรหัสผ่านไม่ถูกต้อง' });
    }

    const payload = {
      empId:      emp.employee_id,
      fullName:   emp.full_name,
      role:       emp.role,
      email:      emp.email,
      department: emp.department,
      jobTitle:   emp.job_title,
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });

    console.log(`[auth] เข้าสู่ระบบ: ${emp.employee_id} (${emp.role})`);
    res.cookie(AUTH_COOKIE, token, cookieOptions);
    res.json({ user: payload });
  } catch (err: any) {
    console.error('[auth] login error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด', error: err.message });
  }
}

// ── POST /api/auth/logout ─────────────────────────────────────
function logout(req: Request, res: Response) {
  res.clearCookie(AUTH_COOKIE, { ...cookieOptions, maxAge: undefined });
  res.json({ message: 'ออกจากระบบแล้ว' });
}

// ── GET /api/auth/me ───────────────────────────────────────────
// Lets the frontend restore/verify the session on load without ever being
// able to read the (httpOnly) cookie or decode the JWT itself.
function me(req: Request, res: Response) {
  res.json({ user: req.user });
}

// ── POST /api/auth/verify-password ───────────────────────────
// Re-confirms the CURRENTLY logged-in user's own credentials before a
// sensitive action (e.g. granting another employee the ADMIN role).
// Requires auth so we can check the entered employeeId against the
// session's own empId — this verifies "you, again", not just "someone
// who knows a password".
async function verifyPassword(req: Request, res: Response) {
  const { employeeId, password } = req.body;
  if (!employeeId?.trim() || !password) {
    return res.status(400).json({ message: 'กรุณากรอกรหัสพนักงานและรหัสผ่านของคุณ' });
  }
  if (employeeId.trim().toUpperCase() !== req.user!.empId.toUpperCase()) {
    return res.status(403).json({ message: 'รหัสพนักงานไม่ตรงกับผู้ใช้ที่เข้าสู่ระบบ' });
  }

  try {
    const result = await pool.query(
      `SELECT password_hash FROM employees WHERE employee_id = $1 AND is_active = TRUE`,
      [req.user!.empId]
    );
    const hash = result.rows[0]?.password_hash;
    if (!hash || !(await bcrypt.compare(password, hash))) {
      return res.status(401).json({ message: 'รหัสผ่านไม่ถูกต้อง' });
    }
    res.json({ verified: true });
  } catch (err: any) {
    console.error('[auth] verify-password error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด', error: err.message });
  }
}

module.exports = { login, logout, me, verifyPassword };
