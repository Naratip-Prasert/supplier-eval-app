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
// Returns all active suppliers (for dropdowns / autocomplete).
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT vendor_code AS "vendorCode", supplier_name AS "supplierName", product_type AS "productType"
         FROM suppliers
        WHERE is_active = TRUE
        ORDER BY supplier_name`
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

// GET /api/suppliers/:vendorCode/permission?employeeId=EMP-001
// Checks whether a BU employee has permission to evaluate this supplier (req 1).
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

    // BU: check permissions table
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
