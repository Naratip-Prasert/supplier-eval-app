'use strict';
export {}; // forces file (module) scope — no top-level import/export otherwise, needed since `const router` is repeated across every route file
const router = require('express').Router();
const requireRole = require('../../middleware/requireRole');
const {
  listSuppliers, validateSupplier, createSupplier, getSupplier, updateSupplier, checkPermission,
} = require('../../controllers/shared/suppliers.controller');

router.get('/', listSuppliers);
router.get('/validate', validateSupplier);
router.post('/', requireRole('ADMIN'), createSupplier);
router.get('/:vendorCode', getSupplier);
router.patch('/:vendorCode', requireRole('ADMIN'), updateSupplier);
router.get('/:vendorCode/permission', checkPermission);

module.exports = router;
