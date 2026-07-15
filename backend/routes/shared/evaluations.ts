'use strict';
export {}; // forces file (module) scope — no top-level import/export otherwise, needed since `const router` is repeated across every route file
const router = require('express').Router();
const requireRole = require('../../middleware/requireRole');
const {
  createEvaluation, listSessions, listAllEvaluations, listMyEvaluations,
  myTasks, myTimeline, byVendor, getById,
} = require('../../controllers/shared/evaluations.controller');

router.post('/', createEvaluation);
router.get('/', requireRole('ADMIN', 'SUPERVISOR'), listSessions);
router.get('/all', requireRole('ADMIN'), listAllEvaluations);
router.get('/my', listMyEvaluations);
router.get('/my-tasks', myTasks);
router.get('/my-timeline', myTimeline);
router.get('/by-vendor/:vendorCode', byVendor);
router.get('/:id', getById);

module.exports = router;
