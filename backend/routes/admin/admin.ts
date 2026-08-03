'use strict';
// ============================================================
//  routes/admin/admin.ts
//  POST /api/admin/upload/pre-post   — Pre/Post eval CSV/Excel
//  POST /api/admin/upload/periodic   — Half-Year/Yearly Excel
//  GET  /api/admin/tasks             — all evaluation tasks
//  POST /api/admin/tasks/:id/remind  — manual remind
//  GET  /api/admin/batches           — upload history
// ============================================================
import type { Request } from 'express';
const router = require('express').Router();
const multer = require('multer');
const requireRole = require('../../middleware/requireRole');
const {
  uploadPrePost, validatePrePostUpload, validatePeriodicUpload, uploadPeriodic, createAdHocEvaluation, listTasks, remindTask, updateTask,
  deleteSession, remindAllTasks, bulkDeleteSessions, listBatches, listServiceEvaluations,
  listSuppliersAdmin, updateSupplierAdmin, createSupplierAdmin, uploadSuppliers,
} = require('../../controllers/admin/admin.controller');

router.use(requireRole('ADMIN'));

// multer: memory storage, max 10 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req: Request, file: any, cb: (error: Error | null, acceptFile: boolean) => void) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    cb(ok ? null : new Error('รองรับเฉพาะไฟล์ .xlsx, .xls, .csv'), ok);
  },
});

router.post('/upload/validate-pre-post', upload.single('file'), validatePrePostUpload);
router.post('/upload/pre-post', upload.single('file'), uploadPrePost);
router.post('/upload/validate-periodic', upload.single('file'), validatePeriodicUpload);
router.post('/upload/periodic', upload.single('file'), uploadPeriodic);
router.post('/ad-hoc-evaluation', createAdHocEvaluation);
router.get('/tasks', listTasks);
router.post('/tasks/:id/remind', remindTask);
router.patch('/tasks/:id', updateTask);
router.delete('/sessions/:sessionId', deleteSession);
router.post('/tasks/remind-all', remindAllTasks);
router.post('/sessions/bulk-delete', bulkDeleteSessions);
router.get('/batches', listBatches);
router.get('/service-evaluations', listServiceEvaluations);
router.get('/suppliers', listSuppliersAdmin);
router.post('/suppliers', createSupplierAdmin);
router.patch('/suppliers/:vendorCode', updateSupplierAdmin);
router.post('/suppliers/upload', upload.single('file'), uploadSuppliers);

module.exports = router;
