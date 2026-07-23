'use strict';
export {}; // forces file (module) scope — no top-level import/export otherwise, needed since `const router` is repeated across every route file
const router = require('express').Router();
const { chat } = require('../../controllers/shared/assistant.controller');

router.post('/chat', chat);

module.exports = router;
