'use strict';
const router  = require('express').Router();
const pool    = require('../db');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// ── POST /api/auth/register ───────────────────────────────────
router.post('/register', async (req, res) => {
  const { employeeId, email, password } = req.body;

  if (!employeeId?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบ' });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });
  }

  const client = await pool.connect();
  try {
    const empResult = await client.query(
      `SELECT id, full_name, password_hash FROM employees
        WHERE employee_id = $1 AND is_active = TRUE`,
      [employeeId.trim()]
    );
    if (empResult.rows.length === 0) {
      console.warn(`[auth] register: ไม่พบรหัสพนักงาน ${employeeId}`);
      return res.status(404).json({ message: 'ไม่พบรหัสพนักงานนี้ในระบบ' });
    }
    if (empResult.rows[0].password_hash) {
      return res.status(409).json({ message: 'รหัสพนักงานนี้มีบัญชีอยู่แล้ว' });
    }

    const emailTaken = await client.query(
      'SELECT id FROM employees WHERE email = $1',
      [email.trim().toLowerCase()]
    );
    if (emailTaken.rows.length > 0) {
      return res.status(409).json({ message: 'Email นี้ถูกใช้งานแล้ว' });
    }

    const hash = await bcrypt.hash(password, 10);
    await client.query(
      'UPDATE employees SET email = $1, password_hash = $2 WHERE employee_id = $3',
      [email.trim().toLowerCase(), hash, employeeId.trim()]
    );

    console.log(`[auth] สมัครสมาชิกสำเร็จ: ${employeeId} (${email})`);
    res.status(201).json({ message: 'สมัครสมาชิกสำเร็จ' });
  } catch (err) {
    console.error('[auth] register error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด', error: err.message });
  } finally {
    client.release();
  }
});

// ── POST /api/auth/login ──────────────────────────────────────
router.post('/login', async (req, res) => {
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
    res.json({ token, user: payload });
  } catch (err) {
    console.error('[auth] login error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด', error: err.message });
  }
});

// ── POST /api/auth/forgot-password ───────────────────────────
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email?.trim()) {
    return res.status(400).json({ message: 'กรุณากรอก Email' });
  }

  const REPLY = { message: 'ถ้า Email นี้มีในระบบ เราจะส่งลิงก์รีเซ็ตรหัสผ่านให้' };

  try {
    const result = await pool.query(
      `SELECT employee_id, full_name FROM employees
        WHERE email = $1 AND is_active = TRUE AND password_hash IS NOT NULL`,
      [email.trim().toLowerCase()]
    );
    if (result.rows.length === 0) return res.json(REPLY);

    const emp        = result.rows[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expires    = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      'UPDATE employees SET reset_token = $1, reset_token_expires = $2 WHERE email = $3',
      [resetToken, expires, email.trim().toLowerCase()]
    );

    const resetUrl = `${process.env.FRONTEND_URL}?reset=${resetToken}`;

    await resend.emails.send({
      from:    process.env.EMAIL_FROM || 'Supplier Eval <onboarding@resend.dev>',
      to:      [email.trim()],
      subject: 'รีเซ็ตรหัสผ่าน — Supplier Evaluation System',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:28px">
          <div style="background:#1a6b1a;padding:18px 24px;border-radius:10px 10px 0 0">
            <h2 style="color:#fff;margin:0;font-size:18px;font-weight:700">
              <span style="color:rgba(255,255,255,0.75);margin-right:10px">&#9632;</span>รีเซ็ตรหัสผ่าน
            </h2>
          </div>
          <div style="background:#f9f9f9;padding:24px;border-radius:0 0 10px 10px;border:1px solid #ddd">
            <p style="margin:0 0 12px;font-size:14px;color:#222">สวัสดีคุณ <strong>${emp.full_name}</strong></p>
            <p style="margin:0 0 20px;color:#555;font-size:14px;line-height:1.7">
              มีการขอรีเซ็ตรหัสผ่านสำหรับระบบ Supplier Performance Evaluation<br>
              ลิงก์จะหมดอายุใน <strong>1 ชั่วโมง</strong>
            </p>
            <a href="${resetUrl}"
               style="display:inline-block;background:#1a6b1a;color:#fff;
                      padding:13px 32px;border-radius:8px;text-decoration:none;
                      font-weight:700;font-size:15px;letter-spacing:0.3px">
              ตั้งรหัสผ่านใหม่
            </a>
            <hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0 16px" />
            <p style="margin:0;color:#aaa;font-size:12px;line-height:1.6">
              หากคุณไม่ได้ขอรีเซ็ต ไม่ต้องดำเนินการใดๆ<br>
              Supplier Performance Evaluation System
            </p>
          </div>
        </div>`,
    });

    console.log(`[auth] ส่ง reset email ไปที่ ${email}`);
    res.json(REPLY);
  } catch (err) {
    console.error('[auth] forgot-password error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด', error: err.message });
  }
});

// ── POST /api/auth/reset-password ────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ message: 'ข้อมูลไม่ครบ' });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });
  }

  try {
    const result = await pool.query(
      `SELECT id FROM employees
        WHERE reset_token = $1 AND reset_token_expires > NOW() AND is_active = TRUE`,
      [token]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'ลิงก์หมดอายุหรือไม่ถูกต้อง' });
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `UPDATE employees
          SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL
        WHERE reset_token = $2`,
      [hash, token]
    );

    console.log('[auth] reset password สำเร็จ');
    res.json({ message: 'ตั้งรหัสผ่านใหม่สำเร็จ' });
  } catch (err) {
    console.error('[auth] reset-password error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาด', error: err.message });
  }
});

module.exports = router;
