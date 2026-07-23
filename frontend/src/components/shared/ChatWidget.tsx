// ============================================================
//  components/shared/ChatWidget.tsx
//  Floating help-chat bubble, shown on every page after login
//  (mounted once in app/(app)/layout.tsx, inside AuthGate). Talks to
//  POST /api/assistant/chat, which proxies to the Anthropic API —
//  until an admin sets ANTHROPIC_API_KEY on the backend, every reply
//  is just the "not configured yet" message the backend sends back.
//  Conversation is in-memory only (resets on page reload) — this is a
//  lightweight FAQ helper, not a saved chat history feature.
// ============================================================
"use client";

import { useEffect, useRef, useState } from "react";
import { authFetch } from "@/utils/api";

type ChatMessage = { role: "user" | "assistant"; content: string };

const GREEN = "#2e7d32";

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    try {
      const res = await authFetch("/api/assistant/chat", {
        method: "POST",
        body: JSON.stringify({ message: text, history: messages }),
      });
      const data = await res.json();
      setMessages([...nextMessages, { role: "assistant", content: data.reply || data.message || "เกิดข้อผิดพลาด" }]);
    } catch {
      setMessages([...nextMessages, { role: "assistant", content: "เชื่อมต่อผู้ช่วย AI ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? "ปิดผู้ช่วย AI" : "เปิดผู้ช่วย AI"}
        style={{
          position: "fixed", right: 24, bottom: 24, zIndex: 1000,
          width: 56, height: 56, borderRadius: "50%", border: "none",
          background: GREEN, color: "#fff", fontSize: 24,
          boxShadow: "0 4px 14px rgba(0,0,0,0.25)", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {open ? "×" : "💬"}
      </button>

      {open && (
        <div
          style={{
            position: "fixed", right: 24, bottom: 92, zIndex: 1000,
            width: 340, maxWidth: "calc(100vw - 32px)", height: 460,
            maxHeight: "calc(100vh - 140px)", background: "#fff",
            borderRadius: 14, boxShadow: "0 8px 28px rgba(0,0,0,0.22)",
            display: "flex", flexDirection: "column", overflow: "hidden",
            border: "1px solid #e0e0e0",
          }}
        >
          <div style={{ background: GREEN, color: "#fff", padding: "12px 16px", fontWeight: 600, fontSize: 15 }}>
            ผู้ช่วย AI ประจำระบบ
            <div style={{ fontWeight: 400, fontSize: 12.5, opacity: 0.9, marginTop: 2 }}>
              ถามเรื่องเกณฑ์การประเมินหรือวิธีใช้งานได้เลย
            </div>
          </div>

          <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.length === 0 && (
              <div style={{ color: "#888", fontSize: 13.5, textAlign: "center", marginTop: 24 }}>
                สวัสดีครับ 👋 มีอะไรให้ช่วยอธิบายเกี่ยวกับระบบประเมินไหมครับ?
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  background: m.role === "user" ? GREEN : "#f1f3f1",
                  color: m.role === "user" ? "#fff" : "#222",
                  borderRadius: 12,
                  padding: "8px 12px",
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  maxWidth: "85%",
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.content}
              </div>
            ))}
            {loading && (
              <div style={{ alignSelf: "flex-start", color: "#888", fontSize: 13, padding: "8px 12px" }}>
                กำลังพิมพ์...
              </div>
            )}
          </div>

          <div style={{ display: "flex", borderTop: "1px solid #eee", padding: 8, gap: 8 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="พิมพ์คำถาม..."
              disabled={loading}
              style={{
                flex: 1, border: "1px solid #ddd", borderRadius: 8,
                padding: "8px 10px", fontSize: 13.5, outline: "none",
              }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              style={{
                background: GREEN, color: "#fff", border: "none", borderRadius: 8,
                padding: "0 16px", fontSize: 13.5, fontWeight: 600,
                cursor: loading || !input.trim() ? "default" : "pointer",
                opacity: loading || !input.trim() ? 0.6 : 1,
              }}
            >
              ส่ง
            </button>
          </div>
        </div>
      )}
    </>
  );
}
