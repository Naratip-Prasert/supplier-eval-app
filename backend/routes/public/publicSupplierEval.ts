'use strict';
// ============================================================
//  routes/public/publicSupplierEval.ts
//  Cross-evaluation #3 (database/CROSS_EVALUATION_SPEC.md) — NOT
//  mounted behind requireAuth in server.ts, since suppliers have no
//  login in this system.
// ============================================================
export {}; // forces file (module) scope — no top-level import/export otherwise, needed since `const router` is repeated across every route file
const router = require('express').Router();
const { rateLimit } = require('express-rate-limit');
const { getToken, submitToken } = require('../../controllers/public/publicSupplierEval.controller');

// Public + unauthenticated — cap attempts per IP the same way /login does,
// so the (unguessable, but still worth bounding) token isn't brute-forceable
// and a single IP can't spam submissions.
const publicEvalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'พยายามบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' },
});
router.use(publicEvalLimiter);

router.get('/:token', getToken);
router.post('/:token', submitToken);

module.exports = router;
