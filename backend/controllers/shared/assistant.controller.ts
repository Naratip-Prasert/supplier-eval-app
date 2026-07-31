'use strict';
// ============================================================
//  controllers/shared/assistant.controller.ts
//  In-app help chat widget — answers questions about how the
//  evaluation criteria/system work. Proxies to the Google Gemini
//  API (free tier) using GEMINI_API_KEY, created at
//  aistudio.google.com and set in backend/.env. Until it's set,
//  the endpoint replies with a friendly "not configured yet"
//  message instead of erroring, so the widget always renders.
// ============================================================
import type { Request, Response } from 'express';
const pool = require('../../db');

const GEMINI_MODEL = 'gemini-flash-latest';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `คุณคือผู้ช่วย AI ประจำระบบ "Supplier Evaluation App" ซึ่งเป็นระบบประเมินผู้ขาย/ซัพพลายเออร์ภายในองค์กร
หน้าที่ของคุณคืออธิบายวิธีใช้งานระบบและความหมายของเกณฑ์การประเมินให้ผู้ใช้เข้าใจง่าย ตอบเป็นภาษาไทยเป็นหลัก (ตอบภาษาอังกฤษถ้าผู้ใช้ถามเป็นภาษาอังกฤษ) กระชับ ตรงประเด็น

บริบทของระบบ:
- บทบาทผู้ใช้งาน: ADMIN (ดูแลระบบ ตั้งค่าเกณฑ์/น้ำหนัก/บัญชีผู้ใช้), SUPERVISOR (ตรวจทาน/อนุมัติผลประเมิน), GCP (ผู้ซื้อ/Buyer ที่ประเมินซัพพลายเออร์), USER (ผู้ใช้งานฝ่ายธุรกิจที่ประเมินซัพพลายเออร์ และให้คะแนนบริการของ Buyer/GCP ย้อนกลับหลังจบงาน)
- การประเมินซัพพลายเออร์แบ่งเป็นกลุ่มเกณฑ์หลัก: Core (เกณฑ์กลางบังคับทุกซัพพลายเออร์ แบ่งเป็นหมวดย่อยหลายหมวด), Function (โมดูลเฉพาะทางที่เลือกใช้ตามลักษณะงาน เช่น F1, F2, ...), และ ESG (Environment, Social, Governance)
- แต่ละเกณฑ์ให้คะแนนแบบ 1-5 ระดับ พร้อมคำอธิบายของแต่ละระดับ คะแนนรวมถ่วงน้ำหนักออกมาเป็นเกรด A/B/C/D/F (A ดีที่สุด, F คือไม่ผ่าน/ตัดออก)
- ผลประเมินต้องผ่านการตรวจทานจาก SUPERVISOR ก่อนถึงจะถือว่าสมบูรณ์ และดูย้อนหลังได้ที่หน้า History
- มีระบบประเมินย้อนกลับ "เชิงบริการ": USER ให้คะแนนบริการของ Buyer (GCP) ที่ตนทำงานด้วยหลังจบ session การประเมิน

แผนผังหน้าเว็บจริงของระบบ — ห้ามอ้างอิงหรือเดาชื่อหน้าอื่นนอกเหนือจากรายการนี้เด็ดขาด (เช่นไม่มีหน้าชื่อ "Supplier List" หรือ "Master Data" ในระบบนี้)และไม่ต้องบอกชื่อของแต่ละหน้าที่อยู่หลัง/และไม่ต้อง/ด้วย ให้บอกรายละเอียดเป็นหน้านั้นไปเลย:
- /portal — หน้าแรกหลัง login, การ์ดเลือกโมดูลตามสิทธิ์ของแต่ละ role (เรียกว่าหน้า "Portal")
- /landing - บอกว่ามันคือหน้าประเมิน Supplier (หน้าดูว่ามีกี่รายประเมินซัพพลายเออร์) → /eval (หน้าทำแบบฟรอม) → /eval/result (หน้ารวมผลการประเมิน)— ขั้นตอน "ประเมินซัพพลายเออร์" ของ USER/GCP: /landing แสดงรายการ "งานประเมิน" (task) ที่ตัวเองถูกมอบหมายให้ประเมินซัพพลายเออร์รายไหนบ้าง พร้อมสถานะ/กำหนดส่ง — เป็นหน้าที่ใกล้เคียงที่สุดที่ USER/GCP จะเห็นรายชื่อซัพพลายเออร์ของตัวเอง (เฉพาะงานที่ถูก assign ให้ ไม่ใช่จำนวนซัพพลายเออร์ทั้งหมดในระบบ)
- /history — บอกว่ามันคือหน้าประวัติผลการประเมินที่ตัวเองทำเสร็จแล้ว
- /service-eval — USER ให้คะแนนบริการของ Buyer (GCP) หลัง session เสร็จ
- /profile — ข้อมูลส่วนตัว
- /admin (เฉพาะ ADMIN เท่านั้น) มีแท็บย่อย: พนักงาน (Employees), งานประเมิน/Upload (จุดที่ ADMIN อัปโหลดรายชื่อซัพพลายเออร์จาก Excel และมอบหมายงาน — เป็นจุดเดียวที่เห็นภาพรวม/จำนวนซัพพลายเออร์ทั้งหมดในระบบได้จริง), ผลและประวัติการประเมิน (ทุก session ทั้งระบบ), ผลประเมินเชิงบริการ, เปลี่ยนเกณฑ์และ Parameter (Criteria Editor)
- /admin/upload-history (เฉพาะ ADMIN) — ประวัติการอัปโหลดไฟล์ซัพพลายเออร์แต่ละครั้ง
- /supervisor (เฉพาะ SUPERVISOR) — ตรวจทาน/อนุมัติหรือตีกลับผลการประเมิน

กติกาสำคัญ:
- คุณไม่มีสิทธิ์เข้าถึงฐานข้อมูลจริงของระบบ ไม่ทราบข้อมูลเรียลไทม์ใดๆ (เช่น จำนวนซัพพลายเออร์ทั้งหมด, สถานะงานล่าสุด, คะแนนของใคร) — ถ้าถูกถามคำถามลักษณะนี้ ให้บอกตรงๆ ว่าไม่สามารถเข้าถึงข้อมูลนี้ได้ แล้วชี้ไปยังหน้าที่ตรงกับ "บทบาทของผู้ใช้ที่กำลังคุยด้วย" เท่านั้น (ดูด้านล่าง) จากแผนผังข้างต้น ห้ามแนะนำหน้าที่ role นั้นเข้าไม่ถึง
- ข้อยกเว้น: ถ้ามีหัวข้อ "ประวัติการอัปโหลดไฟล์ล่าสุด" แนบต่อท้ายพรอมป์นี้ (ส่งมาเฉพาะกรณี role เป็น ADMIN) นั่นคือข้อมูลจริงจากระบบ ณ ขณะนี้ ให้ใช้ตอบคำถามเกี่ยวกับสถานะ/ข้อผิดพลาดของการอัปโหลดไฟล์ได้โดยตรง แต่ห้ามอ้างว่ารู้ข้อมูลอื่นนอกเหนือจากที่แนบมา (เช่นจำนวนซัพพลายเออร์ทั้งหมด คะแนนประเมิน ฯลฯ ยังคงตอบว่าไม่สามารถเข้าถึงได้เหมือนเดิม)
- ห้ามสร้างชื่อหน้า ปุ่ม หรือเมนูที่ไม่มีอยู่ในแผนผังข้างต้นขึ้นมาเองเด็ดขาด ถ้าไม่มีหน้าที่ตรงกับสิ่งที่ผู้ใช้ถามหา ให้บอกตรงๆ ว่าไม่มีฟีเจอร์นั้น
- ถ้าผู้ใช้ถามเรื่องที่ไม่เกี่ยวกับระบบนี้เลย ให้ตอบตามความรู้ทั่วไปได้ตามปกติแต่กระชับ ถ้าไม่แน่ใจตัวเลข/ค่าที่แอดมินอาจปรับเปลี่ยนเองได้ (เช่นน้ำหนักเกณฑ์) ให้แนะนำให้ตรวจสอบในหน้า Parameter/Criteria Editor แทนการเดา`;

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_TURNS = 12;
const ADMIN_BATCH_HISTORY_LIMIT = 15;

// ADMIN-only, read-only context: recent upload-batch history, so the
// assistant can actually answer "did my upload go through" / "why did it
// error" / "did I already upload this" instead of just pointing at the
// Upload History page. This is the same data an ADMIN already sees on
// /admin/upload-history (GET /api/admin/batches) — the only new thing is
// it also gets sent to the Gemini API as context. Never fetched for any
// other role, and never used to let the assistant take any action (no
// retry/delete) — reporting only.
async function fetchAdminUploadContext(): Promise<string> {
  try {
    const result = await pool.query(`
      SELECT b.filename, b.batch_type AS "batchType", b.row_count AS "rowCount",
             b.status, b.error_msg AS "errorMsg", b.created_at AS "createdAt",
             emp.name AS "uploadedBy"
        FROM "SPES_supplier_upload_batches" b
        LEFT JOIN "Master_Data_All" emp ON emp.emp_no = b.uploaded_by
       ORDER BY b.created_at DESC
       LIMIT $1
    `, [ADMIN_BATCH_HISTORY_LIMIT]);

    if (result.rows.length === 0) return '';

    const lines = result.rows.map((b: any, i: number) => {
      const when = new Date(b.createdAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
      const who = b.uploadedBy ?? 'ไม่ทราบผู้อัปโหลด';
      const detail = b.status === 'error'
        ? `ผิดพลาด — ${b.errorMsg || 'ไม่มีรายละเอียด'}`
        : `${b.status} (${b.rowCount} แถว)`;
      return `${i + 1}. [${when}] "${b.filename}" ประเภท ${b.batchType} โดย ${who} — สถานะ: ${detail}`;
    });

    return `\n\nประวัติการอัปโหลดไฟล์ล่าสุด (ข้อมูลจริงจากระบบ ณ ขณะนี้ เรียงจากล่าสุดไปเก่าสุด สูงสุด ${ADMIN_BATCH_HISTORY_LIMIT} รายการ):\n${lines.join('\n')}`;
  } catch (err: any) {
    console.warn('fetchAdminUploadContext error:', err.message);
    return '';
  }
}

async function chat(req: Request, res: Response) {
  const { message, history } = req.body;

  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ message: 'กรุณาระบุข้อความ' });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ message: 'ข้อความยาวเกินไป' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.json({
      configured: false,
      reply: 'ผู้ช่วย AI ยังไม่ได้ถูกตั้งค่าโดยแอดมินระบบ  — ลองสอบถามแอดมินของคุณได้ครับ',
    });
  }

  const adminContext = req.user!.role === 'ADMIN' ? await fetchAdminUploadContext() : '';

  const rawHistory = Array.isArray(history) ? history : [];
  // Gemini uses role "model" where this app's own convention (and the
  // frontend's stored message list) uses "assistant".
  const cleanHistory = rawHistory
    .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY_TURNS * 2)
    .map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content.slice(0, MAX_MESSAGE_LENGTH) }],
    }));

  try {
    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [...cleanHistory, { role: 'user', parts: [{ text: message }] }],
        // Told fresh per-request (not baked into the static SYSTEM_PROMPT)
        // so the model only ever recommends pages this specific requester's
        // role can actually reach — a USER should never be pointed at
        // /admin, for example.
        systemInstruction: {
          parts: [{ text: `${SYSTEM_PROMPT}\n\nบทบาท (role) ของผู้ใช้ที่กำลังคุยกับคุณตอนนี้คือ: ${req.user!.role} — คุณรู้ค่านี้แน่นอนอยู่แล้ว ไม่ต้องถามผู้ใช้ว่า role อะไร และห้ามตอบแบบมีเงื่อนไขหลาย role ("ถ้าคุณเป็น ADMIN ให้... ถ้าเป็น USER ให้...") ให้ตอบตรงๆ เฉพาะสำหรับ role นี้ role เดียวไปเลย โดยแนะนำเฉพาะหน้าที่ role นี้เข้าถึงได้จริงเท่านั้น${adminContext}` }],
        },
        generationConfig: { maxOutputTokens: 1024 },
      }),
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text().catch(() => '');
      console.error('Gemini API error:', geminiRes.status, errBody);
      return res.status(502).json({ message: 'ผู้ช่วย AI ไม่ตอบสนอง กรุณาลองใหม่อีกครั้ง' });
    }

    const data: any = await geminiRes.json();
    const reply = (data.candidates?.[0]?.content?.parts || [])
      .map((part: any) => part.text || '')
      .join('\n')
      .trim() || 'ขออภัย ไม่สามารถตอบคำถามนี้ได้';

    res.json({ configured: true, reply });
  } catch (err: any) {
    console.error('POST /api/assistant/chat error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการเชื่อมต่อผู้ช่วย AI' });
  }
}

module.exports = { chat };
