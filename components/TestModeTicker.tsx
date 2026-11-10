"use client";

import { useEffect, useState } from "react";
import { shortAddress } from "@/lib/format";
import { useStats } from "./site-data";

interface DistributeResult {
  status: string;
  reason?: string;
  holderWallet?: string;
  winnerTier?: string;
  eligibleHolders?: number;
  totalTickets?: number;
}

/** Dev-only: fires simulated draws on an interval when TEST_MODE=true. */
export function TestModeTicker() {
  const { stats, refresh } = useStats();
  const enabled = stats?.testMode ?? false;
  const intervalMs = stats?.testIntervalMs ?? 10_000;
  const [lastResult, setLastResult] = useState<DistributeResult | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    async function tick() {
      try {
        const res = await fetch("/api/test/distribute");
        const data = (await res.json()) as DistributeResult & { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Distribution failed");
          return;
        }
        setError(null);
        setLastResult(data);
        setLastRun(new Date().toLocaleTimeString());
        refresh();
      } catch {
        setError("Network error");
      }
    }

    void tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, refresh]);

  if (!enabled) return null;

  return (
    <div className="panel fixed bottom-4 right-4 z-50 max-w-xs p-4 text-sm">
      <p className="label text-gold">Test mode</p>
      <p className="mt-1 text-haze">
        Simulated draw every {intervalMs / 1000}s. No funds move.
      </p>
      {lastRun && <p className="mt-2 text-xs text-haze">Last run {lastRun}</p>}
      {lastResult?.status === "distributed" && lastResult.holderWallet && (
        <p className="mt-1 font-mono text-xs text-teal">
          {shortAddress(lastResult.holderWallet)} · {lastResult.winnerTier} ·{" "}
          {lastResult.totalTickets} tickets
        </p>
      )}
      {lastResult?.status === "skipped" && (
        <p className="mt-1 text-xs text-rose">Skipped: {lastResult.reason}</p>
      )}
      {error && <p className="mt-1 text-xs text-rose">{error}</p>}
    </div>
  );
}
