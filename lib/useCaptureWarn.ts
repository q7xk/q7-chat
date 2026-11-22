'use client';
import { useEffect, useRef, useState } from 'react';

export function useCaptureWarn(enabled: boolean) {
  const [warn, setWarn] = useState<string | null>(null);
  const last = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    const fire = (reason: string) => {
      const now = Date.now();
      if (now - last.current < 4000) return;
      last.current = now;
      setWarn(reason);
      setTimeout(() => setWarn(null), 5000);
    };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'printscreen') fire('screenshot');
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && ['3', '4', '5', 's'].includes(k))
        fire('screenshot');
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        // Heuristic: quick hide/show is common on mobile screenshots; warn on return.
        const t = Date.now();
        const onShow = () => {
          document.removeEventListener('visibilitychange', onShow);
          if (Date.now() - t < 1200) fire('screenshot');
        };
        document.addEventListener('visibilitychange', onShow);
      }
    };
    document.addEventListener('keyup', onKey);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('keyup', onKey);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled]);
  return warn;
}
