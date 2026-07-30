'use strict';
// ============================================================
//  controllers/shared/suppliers.controller.ts
//  GET  /api/suppliers                      — list all active suppliers
//  GET  /api/suppliers/validate             — validate vendorCode + name (req 8)
//  GET  /api/suppliers/:vendorCode/permission?employeeId=X  (req 1)
// ============================================================
import type { Request, Response } from 'express';
const pool   = require('../../db');

// GET /api/suppliers
// ADMIN: returns all suppliers (active + inactive) with isActive field.
// Others: returns only active suppliers (for dropdowns).
async function listSuppliers(req: Request, res: Response) {
  const isAdmin = req.user?.role === 'ADMIN';
  try {
    const result = await pool.query(
      isAdmin
        ? `SELECT vendor_code AS "vendorCode", supplier_name AS "supplierName",
                  product_type AS "productType", is_active AS "isActive"
             FROM "SPES_suppliers" ORDER BY supplier_name`
        : `SELECT vendor_code AS "vendorCode", supplier_name AS "supplierName",
                  product_type AS "productType"
             FROM "SPES_suppliers" WHERE is_active = TRUE ORDER BY supplier_name`
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /api/suppliers error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ' });
  }
}

// GET /api/suppliers/validate?vendorCode=SUP-001&supplierName=ABC+Supply
// Checks that vendor code AND supplier name both exist and match the same record (req 8).
async function validateSupplier(req: Request, res: Response) {
  const vendorCode = req.query.vendorCode as string | undefined;
  const supplierName = req.query.supplierName as string | undefined;

  if (!vendorCode || !supplierName) {
    return res.status(400).json({ message: 'กรุณาระบุ vendorCode และ supplierName' });
  }

  try {
    const result = await pool.query(
      `SELECT vendor_code AS "vendorCode", supplier_name AS "supplierName", product_type AS "productType"
         FROM "SPES_suppliers"
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
  } catch (err: any) {
    console.error('GET /api/suppliers/validate error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ' });
  }
}

// POST /api/suppliers  (ADMIN only, gated via requireRole at route) — add new supplier
async function createSupplier(req: Request, res: Response) {
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
      `INSERT INTO "SPES_suppliers" (vendor_code, supplier_name, product_type, is_active)
       VALUES ($1, $2, $3, TRUE)
       RETURNING vendor_code AS "vendorCode", supplier_name AS "supplierName", product_type AS "productType"`,
      [vendorCode.trim().toUpperCase(), supplierName.trim(), productType || 'goods']
    );
    res.status(201).json({ message: 'เพิ่มซัพพลายเออร์สำเร็จ', supplier: result.rows[0] });
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Vendor Code นี้มีอยู่แล้ว' });
    }
    console.error('POST /api/suppliers error:', err);
    res.status(500).json({ message: 'เพิ่มไม่สำเร็จ' });
  }
}

// GET /api/suppliers/:vendorCode  — fetch single supplier by vendor code
async function getSupplier(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT vendor_code    AS "vendorCode",
              supplier_name  AS "supplierName",
              product_type   AS "productType"
         FROM "SPES_suppliers"
        WHERE vendor_code = $1 AND is_active = TRUE`,
      [(req.params.vendorCode as string).trim()]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'ไม่พบรหัสผู้ขาย' });
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    console.error('GET /api/suppliers/:vendorCode error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ' });
  }
}

// PATCH /api/suppliers/:vendorCode  (ADMIN only, gated via requireRole at route) — update supplier
async function updateSupplier(req: Request, res: Response) {
  const { supplierName, productType, isActive } = req.body;
  if (supplierName !== undefined && !supplierName?.trim()) {
    return res.status(400).json({ message: 'supplierName ต้องไม่เป็นค่าว่าง' });
  }
  const validTypes = ['goods', 'services', 'both'];
  if (productType !== undefined && !validTypes.includes(productType)) {
    return res.status(400).json({ message: 'productType ไม่ถูกต้อง' });
  }
  if (supplierName === undefined && productType === undefined && isActive === undefined) {
    return res.status(400).json({ message: 'ไม่มีข้อมูลที่จะอัปเดต' });
  }
  try {
    const result = await pool.query(
      `UPDATE "SPES_suppliers"
          SET supplier_name = COALESCE($1, supplier_name),
              product_type  = COALESCE($2, product_type),
              is_active     = COALESCE($3, is_active)
        WHERE vendor_code = $4
        RETURNING vendor_code`,
      [
        supplierName !== undefined ? supplierName.trim() : null,
        productType  !== undefined ? productType : null,
        isActive     !== undefined ? isActive : null,
        (req.params.vendorCode as string).trim(),
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'ไม่พบซัพพลายเออร์' });
    res.json({ message: 'อัปเดตสำเร็จ' });
  } catch (err: any) {
    console.error('PATCH /api/suppliers/:vendorCode error:', err);
    res.status(500).json({ message: 'อัปเดตไม่สำเร็จ' });
  }
}

// GET /api/suppliers/:vendorCode/permission?employeeId=EMP-001
// Checks whether a USER employee has permission to evaluate this supplier (req 1).
// GCP employees always have permission.
async function checkPermission(req: Request, res: Response) {
  const vendorCode = req.params.vendorCode as string;
  const employeeId = req.query.employeeId as string | undefined;

  if (!employeeId) {
    return res.status(400).json({ message: 'กรุณาระบุ employeeId' });
  }

  try {
    // Fetch employee and supplier in parallel
    const [empResult, supResult] = await Promise.all([
      pool.query(
        `SELECT e.emp_no AS id, COALESCE(r.role, 'USER') AS role FROM "Master_Data_GCP" e
         LEFT JOIN "SPES_Roles" r ON e.emp_no = r.emp_no
         WHERE UPPER(e.emp_no) = UPPER($1)`,
        [employeeId.trim()]
      ),
      pool.query(
        `SELECT id FROM "SPES_suppliers" WHERE vendor_code = $1 AND is_active = TRUE`,
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
      `SELECT 1 FROM "SPES_employee_supplier_permissions"
        WHERE employee_id = $1 AND supplier_id = $2`,
      [employee.id, supplier.id] ///
    );

    res.json({ hasPermission: permResult.rows.length > 0 });
  } catch (err: any) {
    console.error('GET /api/suppliers/:vendorCode/permission error:', err);
    res.status(500).json({ message: 'ดึงข้อมูลไม่สำเร็จ' });
  }
}

module.exports = { listSuppliers, validateSupplier, createSupplier, getSupplier, updateSupplier, checkPermission };
