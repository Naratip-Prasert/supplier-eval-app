'use strict';
export {}; // forces file (module) scope — no top-level import/export otherwise, needed since `const router` is repeated across every route file
const router = require('express').Router();
const fs     = require('fs');
const path   = require('path');
const multer = require('multer');
const crypto = require('crypto');
const { uploadAttachment } = require('../../controllers/shared/uploads.controller');

// Not committed (see .gitignore) — created on demand, since a fresh clone
// won't have it yet and multer's disk storage errors if the destination
// directory doesn't already exist.
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'attachments');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req: any, file: any, cb: (err: Error | null, dest: string) => void) => cb(null, UPLOAD_DIR),
  // Randomized filename — the original name is never trusted as a path
  // component (blocks path traversal / overwrite-by-collision) and is kept
  // separately in the DB (attachment_name) purely for display.
  filename: (req: any, file: any, cb: (err: Error | null, filename: string) => void) => {
    const ext = path.extname(file.originalname).slice(0, 20); // cap in case of a pathological "extension"
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

// No fileFilter — deliberately accepts any file type (evidence photos,
// PDFs, docs, whatever the evaluator needs to attach).
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

router.post('/attachment', upload.single('file'), uploadAttachment);

module.exports = router;
