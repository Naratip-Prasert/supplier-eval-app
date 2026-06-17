'use strict';
// ============================================================
//  route/employees.js
// ============================================================
const router = require('express').Router();
const pool   = require('../db');
const jwt    = require('jsonwebtoken');

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
router.patch('/me', async (req, res) => {
  const { fullName, email, profilePicture } = req.body;

  if (!fullName?.trim()) {
    return res.status(400).json({ message: 'กรุณากรอกชื่อ-สกุล' });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ message: 'รูปแบบ Email ไม่ถูกต้อง' });
  }
  if (profilePicture && profilePicture.length > 6 * 1024 * 1024) {
    return res.status(400).json({ message: 'รูปภาพใหญ่เกินไป (สูงสุด ~4.5 MB)' });
  }

  const client = await pool.connect();
  try {
    if (email?.trim()) {
      const dupe = await client.query(
        'SELECT employee_id FROM employees WHERE email = $1 AND employee_id != $2',
        [email.trim().toLowerCase(), req.user.empId]
      );
      if (dupe.rows.length > 0) {
        return res.status(409).json({ message: 'Email นี้ถูกใช้งานแล้ว' });
      }
    }

    await client.query(
      `UPDATE employees
          SET full_name       = $1,
              email           = $2,
              profile_picture = $3,
              updated_at      = NOW()
        WHERE employee_id = $4`,
      [
        fullName.trim(),
        email?.trim().toLowerCase() || null,
        profilePicture || null,
        req.user.empId,
      ]
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
    res.json({ message: 'บันทึกสำเร็จ', token: newToken, user: payload });
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

module.exports = router;
