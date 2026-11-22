'use client';
import { useEffect, useState } from 'react';

export function useTabLock() {
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const id = Math.random().toString(36).slice(2);
    const bc = new BroadcastChannel('q7-tab-lock');
    let alive = true;
    bc.onmessage = e => {
      const d = e.data as { t?: string; id?: string } | null;
      if (!d || d.id === id) return;
      if (d.t === 'hello') {
        bc.postMessage({ t: 'alive', id });
        setConflict(true);
      }
      if (d.t === 'alive') setConflict(true);
    };
    bc.postMessage({ t: 'hello', id });
    const onVis = () => {
      if (document.visibilityState === 'visible') bc.postMessage({ t: 'hello', id });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVis);
      bc.close();
    };
  }, []);
  return conflict;
}
