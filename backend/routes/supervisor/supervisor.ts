'use strict';
// ============================================================
//  routes/supervisor/supervisor.ts
// ============================================================
export {}; // forces file (module) scope — no top-level import/export otherwise, needed since `const router` is repeated across every route file
const router = require('express').Router();
const requireRole = require('../../middleware/requireRole');
const { queue, history, overdueTasks, approve, returnSession, updateReviewNotes } = require('../../controllers/supervisor/supervisor.controller');

router.use(requireRole('SUPERVISOR', 'ADMIN'));

router.get('/queue', queue);
router.get('/history', history);
router.get('/overdue-tasks', overdueTasks);
router.post('/sessions/:id/approve', approve);
router.post('/sessions/:id/return', returnSession);
router.patch('/reviews/:id/notes', updateReviewNotes);

module.exports = router;
