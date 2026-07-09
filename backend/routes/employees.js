'use strict';
// ============================================================
//  route/employees.js
// ============================================================
const router = require('express').Router();
const pool   = require('../db');
const jwt    = require('jsonwebtoken');
const { AUTH_COOKIE, cookieOptions } = require('../utils/cookieOptions');

// ── GET /api/employees  (ADMIN only) ─────────────────────────
router.get('/', async (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ message: 'เฉพาะ Admin เท่านั้น' });
  }
  try {
    const result = await pool.query(
      `SELECT
         e.employee_id    AS "employeeId",
         e.full_name      AS "fullName",
         e.email,
         e.role,
         e.is_active      AS "isActive",
         d.name_th        AS "department",
         j.name_th        AS "jobTitle",
         e.created_at     AS "createdAt",
         e.profile_picture AS "profilePicture"
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN job_titles  j ON j.id = e.job_title_id
       ORDER BY e.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/employees error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ', error: err.message });
  }
});

// ── GET /api/employees/me ─────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.employee_id    AS "empId",
              e.full_name      AS "fullName",
              e.email,
              e.role,
              e.profile_picture AS "profilePicture",
              d.name_th        AS "department",
              j.name_th        AS "jobTitle"
         FROM employees e
         LEFT JOIN departments d ON d.id = e.department_id
         LEFT JOIN job_titles  j ON j.id = e.job_title_id
        WHERE e.employee_id = $1 AND e.is_active = TRUE`,
      [req.user.empId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'ไม่พบผู้ใช้' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /api/employees/me error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ', error: err.message });
  }
});

// ── PATCH /api/employees/me ───────────────────────────────────
// Name/email are managed by the organization's identity system (or by an
// ADMIN), not by the employee themselves — this endpoint only ever touches
// profile_picture, regardless of what else a caller sends.
router.patch('/me', async (req, res) => {
  const { profilePicture } = req.body;

  if (profilePicture && profilePicture.length > 6 * 1024 * 1024) {
    return res.status(400).json({ message: 'รูปภาพใหญ่เกินไป (สูงสุด ~4.5 MB)' });
  }

  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE employees
          SET profile_picture = $1,
              updated_at      = NOW()
        WHERE employee_id = $2`,
      [profilePicture || null, req.user.empId]
    );

    const updated = await client.query(
      `SELECT e.employee_id AS "empId",
              e.full_name   AS "fullName",
              e.email,
              e.role,
              d.name_th     AS "department",
              j.name_th     AS "jobTitle"
         FROM employees e
         LEFT JOIN departments d ON d.id = e.department_id
         LEFT JOIN job_titles  j ON j.id = e.job_title_id
        WHERE e.employee_id = $1`,
      [req.user.empId]
    );

    const payload  = updated.rows[0];
    const newToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });

    console.log(`[employees] อัปเดตโปรไฟล์: ${req.user.empId}`);
    res.cookie(AUTH_COOKIE, newToken, cookieOptions);
    res.json({ message: 'บันทึกสำเร็จ', user: payload });
  } catch (err) {
    console.error('PATCH /api/employees/me error:', err);
    res.status(500).json({ message: 'บันทึกไม่สำเร็จ', error: err.message });
  } finally {
    client.release();
  }
});

// ── GET /api/employees/:employeeId ────────────────────────────
router.get('/:employeeId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         e.employee_id  AS "employeeId",
         e.full_name    AS "fullName",
         e.role,
         d.name_th      AS "department",
         d.code         AS "departmentCode",
         j.name_th      AS "jobTitle",
         j.code         AS "jobTitleCode"
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN job_titles  j ON j.id = e.job_title_id
       WHERE e.employee_id = $1 AND e.is_active = TRUE`,
      [req.params.employeeId.trim()]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'ไม่พบรหัสพนักงาน' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /api/employees/:employeeId error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ', error: err.message });
  }
});

// ── PATCH /api/employees/:employeeId  (ADMIN only) ────────────
// Body: { role?, isActive? }
router.patch('/:employeeId', async (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ message: 'เฉพาะ Admin เท่านั้น' });
  }
  const { role, isActive } = req.body;
  const validRoles = ['USER', 'GCP', 'ADMIN', 'SUPERVISOR'];
  if (role !== undefined && !validRoles.includes(role)) {
    return res.status(400).json({ message: 'role ไม่ถูกต้อง' });
  }
  if (role === undefined && isActive === undefined) {
    return res.status(400).json({ message: 'ไม่มีข้อมูลที่จะอัปเดต' });
  }
  try {
    const result = await pool.query(
      `UPDATE employees
          SET role       = COALESCE($1, role),
              is_active  = COALESCE($2, is_active),
              updated_at = NOW()
        WHERE employee_id = $3
        RETURNING employee_id`,
      [
        role     !== undefined ? role : null,
        isActive !== undefined ? isActive : null,
        req.params.employeeId,
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'ไม่พบพนักงาน' });
    res.json({ message: 'อัปเดตสำเร็จ' });
  } catch (err) {
    console.error('PATCH /api/employees/:employeeId error:', err);
    res.status(500).json({ message: 'อัปเดตไม่สำเร็จ', error: err.message });
  }
});

module.exports = router;
