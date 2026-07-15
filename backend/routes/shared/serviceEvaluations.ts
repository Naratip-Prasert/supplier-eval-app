'use strict';
export {}; // forces file (module) scope — no top-level import/export otherwise, needed since `const router` is repeated across every route file
const router = require('express').Router();
const { pending, myFeedback, criteria, submit } = require('../../controllers/shared/serviceEvaluations.controller');

router.get('/pending', pending);
router.get('/my-feedback', myFeedback);
router.get('/criteria', criteria);
router.post('/', submit);

module.exports = router;
