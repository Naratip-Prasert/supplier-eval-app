'use strict';
// ============================================================
//  route/suppliers.js
//  GET  /api/suppliers                      — list all active suppliers
//  GET  /api/suppliers/validate             — validate vendorCode + name (req 8)
//  GET  /api/suppliers/:vendorCode/permission?employeeId=X  (req 1)
// ============================================================
const router = require('express').Router();
const pool   = require('../db');

// GET /api/suppliers
// ADMIN: returns all suppliers (active + inactive) with isActive field.
// Others: returns only active suppliers (for dropdowns).
router.get('/', async (req, res) => {
  const isAdmin = req.user?.role === 'ADMIN';
  try {
    const result = await pool.query(
      isAdmin
        ? `SELECT vendor_code AS "vendorCode", supplier_name AS "supplierName",
                  product_type AS "productType", is_active AS "isActive"
             FROM suppliers ORDER BY supplier_name`
        : `SELECT vendor_code AS "vendorCode", supplier_name AS "supplierName",
                  product_type AS "productType"
             FROM suppliers WHERE is_active = TRUE ORDER BY supplier_name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/suppliers error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ', error: err.message });
  }
});

// GET /api/suppliers/validate?vendorCode=SUP-001&supplierName=ABC+Supply
// Checks that vendor code AND supplier name both exist and match the same record (req 8).
router.get('/validate', async (req, res) => {
  const { vendorCode, supplierName } = req.query;

  if (!vendorCode || !supplierName) {
    return res.status(400).json({ message: 'กรุณาระบุ vendorCode และ supplierName' });
  }

  try {
    const result = await pool.query(
      `SELECT vendor_code AS "vendorCode", supplier_name AS "supplierName", product_type AS "productType"
         FROM suppliers
        WHERE vendor_code   = $1
          AND supplier_name = $2
          AND is_active     = TRUE`,
      [vendorCode.trim(), supplierName.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        valid: false,
        message: 'ไม่พบซัพพลายเออร์ หรือรหัสและชื่อไม่ตรงกัน',
      });
    }

    res.json({ valid: true, supplier: result.rows[0] });
  } catch (err) {
    console.error('GET /api/suppliers/validate error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ', error: err.message });
  }
});

// POST /api/suppliers  (ADMIN only) — add new supplier
router.post('/', async (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ message: 'เฉพาะ Admin เท่านั้น' });
  }
  const { vendorCode, supplierName, productType } = req.body;
  if (!vendorCode?.trim() || !supplierName?.trim()) {
    return res.status(400).json({ message: 'กรุณากรอก vendorCode และ supplierName' });
  }
  const validTypes = ['goods', 'services', 'both'];
  if (productType && !validTypes.includes(productType)) {
    return res.status(400).json({ message: 'productType ไม่ถูกต้อง' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO suppliers (vendor_code, supplier_name, product_type, is_active)
       VALUES ($1, $2, $3, TRUE)
       RETURNING vendor_code AS "vendorCode", supplier_name AS "supplierName", product_type AS "productType"`,
      [vendorCode.trim().toUpperCase(), supplierName.trim(), productType || 'goods']
    );
    res.status(201).json({ message: 'เพิ่มซัพพลายเออร์สำเร็จ', supplier: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Vendor Code นี้มีอยู่แล้ว' });
    }
    console.error('POST /api/suppliers error:', err);
    res.status(500).json({ message: 'เพิ่มไม่สำเร็จ', error: err.message });
  }
});

// GET /api/suppliers/:vendorCode  — fetch single supplier by vendor code
router.get('/:vendorCode', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT vendor_code    AS "vendorCode",
              supplier_name  AS "supplierName",
              product_type   AS "productType"
         FROM suppliers
        WHERE vendor_code = $1 AND is_active = TRUE`,
      [req.params.vendorCode.trim()]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'ไม่พบรหัสผู้ขาย' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /api/suppliers/:vendorCode error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ', error: err.message });
  }
});

// PATCH /api/suppliers/:vendorCode  (ADMIN only) — update supplier
router.patch('/:vendorCode', async (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ message: 'เฉพาะ Admin เท่านั้น' });
  }
  const { supplierName, productType, isActive } = req.body;
  if (supplierName !== undefined && !supplierName?.trim()) {
    return res.status(400).json({ message: 'supplierName ต้องไม่เป็นค่าว่าง' });
  }
  const validTypes = ['goods', 'services', 'both'];
  if (productType !== undefined && !validTypes.includes(productType)) {
    return res.status(400).json({ message: 'productType ไม่ถูกต้อง' });
  }
  const fields = [];
  const params = [];
  if (supplierName !== undefined) { params.push(supplierName.trim()); fields.push(`supplier_name = $${params.length}`); }
  if (productType  !== undefined) { params.push(productType);          fields.push(`product_type = $${params.length}`); }
  if (isActive     !== undefined) { params.push(isActive);             fields.push(`is_active = $${params.length}`); }
  if (fields.length === 0) return res.status(400).json({ message: 'ไม่มีข้อมูลที่จะอัปเดต' });
  params.push(req.params.vendorCode.trim());
  try {
    const result = await pool.query(
      `UPDATE suppliers SET ${fields.join(', ')} WHERE vendor_code = $${params.length} RETURNING vendor_code`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'ไม่พบซัพพลายเออร์' });
    res.json({ message: 'อัปเดตสำเร็จ' });
  } catch (err) {
    console.error('PATCH /api/suppliers/:vendorCode error:', err);
    res.status(500).json({ message: 'อัปเดตไม่สำเร็จ', error: err.message });
  }
});

// GET /api/suppliers/:vendorCode/permission?employeeId=EMP-001
// Checks whether a USER employee has permission to evaluate this supplier (req 1).
// GCP employees always have permission.
router.get('/:vendorCode/permission', async (req, res) => {
  const { vendorCode } = req.params;
  const { employeeId } = req.query;

  if (!employeeId) {
    return res.status(400).json({ message: 'กรุณาระบุ employeeId' });
  }

  try {
    // Fetch employee and supplier in parallel
    const [empResult, supResult] = await Promise.all([
      pool.query(
        `SELECT id, role FROM employees WHERE employee_id = $1 AND is_active = TRUE`,
        [employeeId.trim()]
      ),
      pool.query(
        `SELECT id FROM suppliers WHERE vendor_code = $1 AND is_active = TRUE`,
        [vendorCode.trim()]
      ),
    ]);

    if (empResult.rows.length === 0) {
      return res.status(404).json({ message: 'ไม่พบรหัสพนักงาน' });
    }
    if (supResult.rows.length === 0) {
      return res.status(404).json({ message: 'ไม่พบรหัสซัพพลายเออร์' });
    }

    const employee = empResult.rows[0];
    const supplier = supResult.rows[0];

    // GCP can always evaluate
    if (employee.role === 'GCP' || employee.role === 'ADMIN') {
      return res.json({ hasPermission: true });
    }

    // USER: check permissions table
    const permResult = await pool.query(
      `SELECT 1 FROM employee_supplier_permissions
        WHERE employee_id = $1 AND supplier_id = $2`,
      [employee.id, supplier.id]
    );

    res.json({ hasPermission: permResult.rows.length > 0 });
  } catch (err) {
    console.error('GET /api/suppliers/:vendorCode/permission error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ', error: err.message });
  }
});

module.exports = router;
