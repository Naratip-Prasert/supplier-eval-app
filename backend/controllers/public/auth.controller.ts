'use strict';
import type { Request, Response } from 'express';
const pool    = require('../../db');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const { AUTH_COOKIE, cookieOptions } = require('../../utils/cookieOptions');
const { verifyViaEhr } = require('../../utils/ehrAuth');

// Tries the corporate EHR system first (real employees' passwords live
// there, not in our DB), then falls back to local bcrypt — covers local/
// system accounts that don't exist in EHR and EHR outages alike.
async function verifyCredentials(empno: string, password: string, localHash: string | null | undefined): Promise<boolean> {
  if (await verifyViaEhr(empno, password)) return true;
  if (!localHash) return false;
  return bcrypt.compare(password, localHash);
}

// ── POST /api/auth/login ──────────────────────────────────────
async function login(req: Request, res: Response) {
  const { identifier, password } = req.body;

  if (!identifier?.trim() || !password) {
    return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบ' });
  }

  try {
    const id = identifier.trim();
    
    // 1. Check EHR first
    const ehrValid = await verifyViaEhr(id, password);
    let valid = ehrValid;

    // 2. Lookup employee in DBs
    let foundEmp = null;
    let computedRole = 'USER';

    const gcpResult = await pool.query(
      `SELECT emp_no, name, email, team, position FROM "Master_Data_GCP" WHERE UPPER(emp_no) = UPPER($1) OR LOWER(email) = LOWER($1)`,
      [id]
    );

    if (gcpResult.rows.length > 0) {
      foundEmp = gcpResult.rows[0];
      computedRole = 'GCP';
    } else {
      const userResult = await pool.query(
        `SELECT emp_no, name, email, team, position FROM "Master_Data_User" WHERE UPPER(emp_no) = UPPER($1) OR LOWER(email) = LOWER($1)`,
        [id]
      );
      if (userResult.rows.length > 0) {
        foundEmp = userResult.rows[0];
        computedRole = 'USER';
      }
    }

    // Overwrite role if in SPES2_Roles
    if (foundEmp) {
      const roleResult = await pool.query(`SELECT role FROM "SPES2_Roles" WHERE UPPER(emp_no) = UPPER($1)`, [foundEmp.emp_no]);
      if (roleResult.rows.length > 0) {
        computedRole = roleResult.rows[0].role;
      }
    }

    // Try local fallback if EHR failed (check old employees table just for password_hash)
    if (!valid) {
      const fallbackResult = await pool.query(`SELECT password_hash FROM employees WHERE UPPER(employee_id) = UPPER($1) OR LOWER(email) = LOWER($1)`, [id]);
      if (fallbackResult.rows.length > 0 && fallbackResult.rows[0].password_hash) {
        valid = await bcrypt.compare(password, fallbackResult.rows[0].password_hash);
      }
    }

    if (!valid) {
      console.warn(`[auth] login failed: password ผิด หรือไม่พบผู้ใช้ "${id}"`);
      return res.status(401).json({ message: 'รหัสพนักงาน/Email หรือรหัสผ่านไม่ถูกต้อง' });
    }

    // 3. Auto-provision user if they do not exist
    if (!foundEmp) {
      let fullName = id;
      let email = null;
      let position = null;
      let team = null;
      let cobu = null;

      try {
        const profileRes = await fetch(`https://ehr.bjc.co.th/API/PUR/api/EmployeeProfile/${id}`);
        if (profileRes.ok) {
          const profileData: any = await profileRes.json();
          if (profileData && profileData.employeeLocalName) {
            fullName = profileData.employeeLocalName;
            email = profileData.email || null;
            position = profileData.positionTitleENG || profileData.positionTitleTHA || null;
            team = profileData.departmentDescription || null;
            cobu = profileData.coBuDescription || null;
          }
        }
      } catch (err: any) {
        console.warn(`[auth] Failed to fetch profile for ${id}:`, err.message);
      }

      try {
        await pool.query(
          `INSERT INTO "Master_Data_User" (emp_no, name, email, position, team, cobu_name)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id.toUpperCase(), fullName, email, position, team, cobu]
        );
        foundEmp = {
          emp_no: id.toUpperCase(),
          name: fullName,
          email: email,
          position: position,
          team: team
        };
        computedRole = 'USER';
        console.log(`[auth] Auto-provisioned new employee record for ${id} in Master_Data_User`);
      } catch (err: any) {
        console.error('[auth] Auto-provision error:', err);
        return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการสร้างบัญชีผู้ใช้' });
      }
    }

    const emp = {
      employee_id: foundEmp.emp_no,
      full_name: foundEmp.name,
      role: computedRole,
      email: foundEmp.email,
      department: foundEmp.team,
      job_title: foundEmp.position
    };

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
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
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
    if (!result.rows[0]) {
      return res.status(401).json({ message: 'รหัสผ่านไม่ถูกต้อง' });
    }
    const valid = await verifyCredentials(req.user!.empId, password, result.rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ message: 'รหัสผ่านไม่ถูกต้อง' });
    }
    res.json({ verified: true });
  } catch (err: any) {
    console.error('[auth] verify-password error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
}

module.exports = { login, logout, me, verifyPassword };
