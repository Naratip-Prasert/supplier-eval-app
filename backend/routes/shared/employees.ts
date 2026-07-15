'use strict';
export {}; // forces file (module) scope — no top-level import/export otherwise, needed since `const router` is repeated across every route file
const router = require('express').Router();
const requireRole = require('../../middleware/requireRole');
const { listEmployees, getMe, updateMe, getEmployee, updateEmployee } = require('../../controllers/shared/employees.controller');

router.get('/', requireRole('ADMIN'), listEmployees);
router.get('/me', getMe);
router.patch('/me', updateMe);
router.get('/:employeeId', requireRole('ADMIN'), getEmployee);
router.patch('/:employeeId', requireRole('ADMIN'), updateEmployee);

module.exports = router;
