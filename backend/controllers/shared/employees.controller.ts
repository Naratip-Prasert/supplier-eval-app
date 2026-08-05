'use strict';
// ============================================================
//  controllers/shared/employees.controller.ts
// ============================================================
import type { Request, Response } from 'express';
const pool   = require('../../db');
const jwt    = require('jsonwebtoken');
const { AUTH_COOKIE, cookieOptions } = require('../../utils/cookieOptions');

// ── GET /api/employees  (ADMIN only, gated via requireRole at route) ──
async function listEmployees(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT
         e.emp_no         AS "employeeId",
         e.name           AS "fullName",
         e.email,
         COALESCE(r.role, 'GCP') AS role,
         TRUE             AS "isActive",
         e.team           AS "department",
         e.position       AS "jobTitle",
         NULL             AS "createdAt",
         NULL             AS "profilePicture"
       FROM "Master_Data_All" e
       LEFT JOIN "SPES2_Roles" r ON r.emp_no = e.emp_no`
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /api/employees error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ' });
  }
}

// ── GET /api/employees/me ─────────────────────────────────────
async function getMe(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT e.emp_no         AS "empId",
              e.name           AS "fullName",
              e.email,
              COALESCE(r.role, 'GCP') AS role,
              NULL             AS "profilePicture",
              e.team           AS "department",
              e.position       AS "jobTitle"
         FROM "Master_Data_All" e
         LEFT JOIN "SPES2_Roles" r ON r.emp_no = e.emp_no
        WHERE e.emp_no = $1`,
      [req.user!.empId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'ไม่พบผู้ใช้' });
    res.json(result.rows[0]);
  } catch (err: any) {
    console.error('GET /api/employees/me error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ' });
  }
}

// ── PATCH /api/employees/me ───────────────────────────────────
// Name/email are managed by the organization's identity system (or by an
// ADMIN), not by the employee themselves — this endpoint only ever touches
// profile_picture, regardless of what else a caller sends.
async function updateMe(req: Request, res: Response) {
  const { profilePicture } = req.body;

  if (profilePicture && profilePicture.length > 6 * 1024 * 1024) {
    return res.status(400).json({ message: 'รูปภาพใหญ่เกินไป (สูงสุด ~4.5 MB)' });
  }

  const client = await pool.connect();
  try {
    // profile_picture updating is disabled because Master_Data_GCP has no profile_picture column.
    // We mock it for now.
    // await client.query(
    //   `UPDATE "Master_Data_All"
    //       SET profile_picture = $1,
    //           updated_at      = NOW()
    //     WHERE emp_no = $2`,
    //   [profilePicture || null, req.user!.empId]
    // );

    const updated = await client.query(
      `SELECT e.emp_no      AS "empId",
              e.name        AS "fullName",
              e.email,
              COALESCE(r.role, 'GCP') AS role,
              e.team        AS "department",
              e.position    AS "jobTitle"
         FROM "Master_Data_All" e
         LEFT JOIN "SPES2_Roles" r ON r.emp_no = e.emp_no
        WHERE e.emp_no = $1`,
      [req.user!.empId]
    );

    const payload  = updated.rows[0];
    const newToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });

    console.log(`[employees] อัปเดตโปรไฟล์: ${req.user!.empId}`);
    res.cookie(AUTH_COOKIE, newToken, cookieOptions);
    res.json({ message: 'บันทึกสำเร็จ', user: payload });
  } catch (err: any) {
    console.error('PATCH /api/employees/me error:', err);
    res.status(500).json({ message: 'บันทึกไม่สำเร็จ' });
  } finally {
    client.release();
  }
}

// ── GET /api/employees/:employeeId  (ADMIN only, gated via requireRole) ──
// Not called by any current frontend flow (only PATCH /:employeeId is,
// for the admin role/status editor) — was previously reachable by any
// authenticated role, letting one logged-in user enumerate every other
// employee's name/role/department just by guessing employee_id values.
async function getEmployee(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT
         e.emp_no       AS "employeeId",
         e.name         AS "fullName",
         COALESCE(r.role, 'GCP') AS role,
         e.team         AS "department",
         NULL           AS "departmentCode",
         e.position     AS "jobTitle",
         NULL           AS "jobTitleCode"
       FROM "Master_Data_All" e
       LEFT JOIN "SPES2_Roles" r ON r.emp_no = e.emp_no
       WHERE e.emp_no = $1`,
      [(req.params.employeeId as string).trim()]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'ไม่พบรหัสพนักงาน' });
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    console.error('GET /api/employees/:employeeId error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ' });
  }
}

// ── PATCH /api/employees/:employeeId  (ADMIN only, gated via requireRole) ──
// Body: { role?, isActive? }
async function updateEmployee(req: Request, res: Response) {
  const { role, isActive } = req.body;
  const validRoles = ['USER', 'GCP', 'ADMIN', 'SUPERVISOR'];
  if (role !== undefined && !validRoles.includes(role)) {
    return res.status(400).json({ message: 'role ไม่ถูกต้อง' });
  }
  if (role === undefined && isActive === undefined) {
    return res.status(400).json({ message: 'ไม่มีข้อมูลที่จะอัปเดต' });
  }
  try {
    // updateEmployee changes role. Role is stored in SPES2_Roles.
    if (role !== undefined) {
      const result = await pool.query(
        `INSERT INTO "SPES2_Roles" (emp_no, role)
         VALUES ($1, $2)
         ON CONFLICT (emp_no) DO UPDATE SET role = EXCLUDED.role
         RETURNING emp_no`,
        [req.params.employeeId, role]
      );
    }
    // is_active is no longer managed via database since Master_Data_GCP implies active.
    res.json({ message: 'อัปเดตสำเร็จ' });
  } catch (err: any) {
    console.error('PATCH /api/employees/:employeeId error:', err);
    res.status(500).json({ message: 'อัปเดตไม่สำเร็จ' });
  }
}

module.exports = { listEmployees, getMe, updateMe, getEmployee, updateEmployee };
