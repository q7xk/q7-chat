"use client";
import { I18nProvider } from "@/lib/i18n";
import { StoreProvider } from "@/lib/store";
import { P2PProvider } from "@/lib/p2p/context";
import { LockGate } from "@/components/Lock";
import { Shell } from "@/components/Shell";

export default function Page() {
  return (
    <I18nProvider>
    <StoreProvider>
      <LockGate>
        <P2PProvider>
          <Shell />
        </P2PProvider>
      </LockGate>
    </StoreProvider>
    </I18nProvider>
  );
}
