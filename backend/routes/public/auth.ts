'use strict';
export {}; // forces file (module) scope — no top-level import/export otherwise, needed since `const router` is repeated across every route file
const router  = require('express').Router();
const requireAuth = require('../../middleware/authMiddleware');
const { login, logout, me, verifyPassword } = require('../../controllers/public/auth.controller');

router.post('/login', login);
router.post('/logout', logout);
router.get('/me', requireAuth, me);
router.post('/verify-password', requireAuth, verifyPassword);

module.exports = router;
