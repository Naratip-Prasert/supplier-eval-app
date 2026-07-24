'use strict';
// ============================================================
//  controllers/shared/uploads.controller.ts
//  POST /api/uploads/attachment — generic evidence-file upload used by the
//  EvalForm note popup (attach a photo/PDF/etc alongside a criterion's
//  note). Stored on local disk under backend/uploads/attachments/, served
//  back out via the static mount in server.ts — the caller only ever
//  handles the returned {path, name}, which then rides along with that
//  item's score/note through to evaluation_scores.attachment_path/name.
// ============================================================
import type { Request, Response } from 'express';
type RequestWithFile = Request & { file?: { filename: string; originalname: string } };

// ── POST /api/uploads/attachment ───────────────────────────────
async function uploadAttachment(req: RequestWithFile, res: Response) {
  if (!req.file) return res.status(400).json({ message: 'กรุณาแนบไฟล์' });
  res.status(201).json({
    path: `/uploads/attachments/${req.file.filename}`,
    name: req.file.originalname,
  });
}

module.exports = { uploadAttachment };
