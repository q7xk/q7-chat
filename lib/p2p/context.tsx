"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useStore } from "../store";
import { P2PManager } from "./manager";

const Ctx = createContext<P2PManager | null>(null);

export function P2PProvider({ children }: { children: ReactNode }) {
  const s = useStore();
  const ref = useRef(s); ref.current = s;
  const mgr = useMemo(() => new P2PManager({
    getConversations: () => ref.current.conversations,
    getMessages: () => ref.current.messages,
    ensureConversation: (cid, title) => ref.current.createP2P(cid, title),
    addMessage: (m, blob) => ref.current.addMessage(m, blob),
    blobReady: () => ref.current.bumpBlobs(),
    updateMessage: (id, patch) => ref.current.updateMessage(id, patch),
    removeConversationFor: (cid) => { const c = ref.current.conversations.find((x) => x.contactId === cid); if (c) ref.current.removeConversation(c.id); },
    bumpUnread: (convId) => { const c = ref.current.conversations.find((x) => x.id === convId); if (c) ref.current.update(convId, { unread: c.unread + 1 }); },
  }), []);
  useEffect(() => { if (s.ready) void mgr.init(); }, [s.ready, mgr]);
  return <Ctx.Provider value={mgr}>{children}</Ctx.Provider>;
}

export function useP2P() {
  const mgr = useContext(Ctx); if (!mgr) throw new Error("P2PProvider missing");
  const snap = useSyncExternalStore(mgr.subscribe, mgr.getSnapshot, mgr.getSnapshot);
  return { mgr, snap };
}
