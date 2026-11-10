"use client";

import { EntryProvider, StatsProvider } from "./site-data";
import { WalletProvider } from "./wallet";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <StatsProvider>
        <EntryProvider>{children}</EntryProvider>
      </StatsProvider>
    </WalletProvider>
  );
}
