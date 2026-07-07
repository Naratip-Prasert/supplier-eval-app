// ============================================================
//  components/PaginationBar.jsx
//  ปุ่มเปลี่ยนหน้า + ตัวนับรายการ — ใช้ร่วมกันใน TasksPage, LandingPage,
//  UploadHistoryPage (เดิมอยู่ใน TasksPage.jsx แล้วให้หน้าอื่น import
//  ข้ามไฟล์ ย้ายมาไว้ที่ shared components ให้ถูกที่กว่าเดิม)
// ============================================================
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PaginationBar({ page, totalPages, total, pageSize, onPrev, onNext }) {
  const from = (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, total);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, fontSize: 12, color: "#888" }}>
      <span>แสดง {from}-{to} จาก {total} รายการ</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={onPrev}
          disabled={page <= 1}
          style={{ display: "flex", alignItems: "center", background: "#fff", border: "1px solid #ddd", borderRadius: 6, padding: "4px 8px", cursor: "pointer", opacity: page <= 1 ? 0.5 : 1 }}
        >
          <ChevronLeft size={14} />
        </button>
        <span>หน้า {page} / {totalPages}</span>
        <button
          onClick={onNext}
          disabled={page >= totalPages}
          style={{ display: "flex", alignItems: "center", background: "#fff", border: "1px solid #ddd", borderRadius: 6, padding: "4px 8px", cursor: "pointer", opacity: page >= totalPages ? 0.5 : 1 }}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
