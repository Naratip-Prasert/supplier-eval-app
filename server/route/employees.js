'use strict';
// ============================================================
//  route/employees.js
//  GET /api/employees/:employeeId  — validate employee (req 2, 11)
// ============================================================
const router = require('express').Router();
const pool   = require('../db');

// GET /api/employees/:employeeId
// Returns employee info including department + job title so the
// frontend can auto-fill those fields immediately (req 11).
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
