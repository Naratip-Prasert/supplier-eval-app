// ============================================================
//  utils/statusLabels.ts — shared evaluation_sessions.status →
//  English label/color mapping, used by AdminPage (results &
//  history) and the User/GCP timeline view.
// ============================================================

export type SessionStatus =
  | "pending"
  | "in_progress"
  | "pending_review"
  | "completed"
  | "returned"
  | "overdue";

// Main progression — "returned" branches off the last step instead of
// sitting on this line (a returned session restarts the cycle).
export const SESSION_STAGES: { key: string; label: string }[] = [
  { key: "pending",        label: "Not Started" },
  { key: "in_progress",    label: "In Process"  },
  { key: "pending_review", label: "Submitted"   },
  { key: "completed",      label: "Approved"    },
];

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  pending:        "Not Started",
  in_progress:    "In Process",
  pending_review: "Submitted",
  completed:      "Approved",
  returned:       "Returned",
  overdue:        "Overdue",
};

export const SESSION_STATUS_COLORS: Record<SessionStatus, { bg: string; color: string }> = {
  pending:        { bg: "#f5f5f5", color: "#616161" },
  in_progress:    { bg: "#e3f2fd", color: "#1565c0" },
  pending_review: { bg: "#fff8e1", color: "#f57f17" },
  completed:      { bg: "#e8f5e9", color: "#1b5e20" },
  returned:       { bg: "#ffebee", color: "#c62828" },
  overdue:        { bg: "#fce4ec", color: "#ad1457" },
};

// "overdue" isn't a real DB value — it's pending/in_progress/pending_review
// past its relevant deadline (task due_date, or supervisor review_due once
// submitted). completed/returned are terminal, so they're never overdue.
export function getDisplayStatus(status: string, dueDate?: string | Date | null): string {
  const terminal = status === "completed" || status === "returned";
  if (!terminal && dueDate && new Date() > new Date(dueDate)) return "overdue";
  return status;
}

// Index of `status` along SESSION_STAGES, for driving a stepper UI.
// "returned" reads as having reached the last step (it branches off
// "Submitted", same depth as "completed").
export function stageIndexFor(status: string): number {
  if (status === "completed" || status === "returned") return SESSION_STAGES.length - 1;
  return SESSION_STAGES.findIndex(s => s.key === status);
}
