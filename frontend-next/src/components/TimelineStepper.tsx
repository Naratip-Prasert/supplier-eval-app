// ============================================================
//  components/TimelineStepper.tsx — horizontal stage tracker for
//  an evaluation_sessions.status, shared by AdminPage (results &
//  history) and the User/GCP "my tasks" timeline.
// ============================================================
"use client";

import { Clock } from "lucide-react";
import { SESSION_STAGES, getDisplayStatus, stageIndexFor } from "../utils/statusLabels";

interface TimelineStepperProps {
  status: string;
  dueDate?: string | Date | null;
  compact?: boolean;
}

export function TimelineStepper({ status, dueDate, compact = false }: TimelineStepperProps) {
  const isReturned   = status === "returned";
  const reachedIndex = stageIndexFor(status);
  const lastIndex    = SESSION_STAGES.length - 1;
  const display      = getDisplayStatus(status, dueDate);
  const overdueNow    = display === "overdue";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 10 : 14, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        {SESSION_STAGES.map((stage, i) => {
          const isLast    = i === lastIndex;
          const reached   = i <= reachedIndex;
          const isCurrent = i === reachedIndex;
          const stepColor = isLast && reached
            ? (isReturned ? "#c62828" : "#1b5e20")
            : reached ? "#1565c0" : "#cfd8dc";
          const label = isLast && reached
            ? (isReturned ? "Returned" : "Approved")
            : stage.label;

          return (
            <div key={stage.key} style={{ display: "flex", alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: compact ? 56 : 72 }}>
                <div style={{
                  width: compact ? 16 : 20, height: compact ? 16 : 20, borderRadius: "50%",
                  background: reached ? stepColor : "#fff",
                  border: `2px solid ${stepColor}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: isCurrent ? `0 0 0 3px ${stepColor}33` : "none",
                  transition: "all .15s",
                }}>
                  {reached && !isCurrent && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
                </div>
                <div style={{
                  fontSize: compact ? 9.5 : 10.5, marginTop: 4, textAlign: "center",
                  color: reached ? stepColor : "#9aa5ab", fontWeight: isCurrent || (isLast && reached) ? 700 : 500,
                  whiteSpace: "nowrap",
                }}>
                  {label}
                </div>
              </div>
              {!isLast && (
                <div style={{
                  width: compact ? 18 : 28, height: 2, marginBottom: compact ? 14 : 16,
                  background: i < reachedIndex ? "#1565c0" : "#e0e0e0",
                }} />
              )}
            </div>
          );
        })}
      </div>

      {overdueNow && (
        <span style={{
          display: "flex", alignItems: "center", gap: 4,
          background: "#fce4ec", color: "#ad1457", borderRadius: 20,
          padding: "3px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
        }}>
          <Clock size={11} /> Overdue
        </span>
      )}
    </div>
  );
}
