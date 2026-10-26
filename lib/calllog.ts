/** Local call history. Kept in localStorage (small, best-effort, capped at 100 entries). */
export interface CallEntry {
  id: string; cid: string; name: string;
  dir: "in" | "out"; video: boolean; missed: boolean;
  at: number; dur: number; // epoch ms; dur in seconds (0 for missed)
}

const KEY = "q7.calllog";

export const getCallLog = (): CallEntry[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((e) => e && typeof e.cid === "string" && typeof e.at === "number").slice(0, 100) : [];
  } catch { return []; }
};

export const pushCallEntry = (e: CallEntry) => {
  try { localStorage.setItem(KEY, JSON.stringify([e, ...getCallLog()].slice(0, 100))); } catch { /* best effort */ }
};

export const clearCallLog = () => {
  try { localStorage.setItem(KEY, "[]"); } catch { /* best effort */ }
};
