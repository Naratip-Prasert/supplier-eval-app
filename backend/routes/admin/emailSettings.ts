'use strict';
// ============================================================
//  routes/admin/emailSettings.ts
//  GET/PATCH /api/admin/email-templates[/:emailType]
//  GET/PATCH /api/admin/email-settings[/:key]
// ============================================================
const router = require('express').Router();
const requireRole = require('../../middleware/requireRole');
const {
  listEmailTemplates, updateEmailTemplate, listEmailSettings, updateEmailSetting,
} = require('../../controllers/admin/emailSettings.controller');

router.use(requireRole('ADMIN'));

router.get('/email-templates', listEmailTemplates);
router.patch('/email-templates/:emailType', updateEmailTemplate);
router.get('/email-settings', listEmailSettings);
router.patch('/email-settings/:key', updateEmailSetting);

module.exports = router;
