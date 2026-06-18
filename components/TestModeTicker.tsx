"use client";

import { useEffect, useState } from "react";

interface DistributeResult {
  status: string;
  reason?: string;
  holderWallet?: string;
  eligibleHolders?: number;
  totalHolders?: number;
}

export function TestModeTicker() {
  const [enabled, setEnabled] = useState(false);
  const [intervalMs, setIntervalMs] = useState(10_000);
  const [lastResult, setLastResult] = useState<DistributeResult | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((data) => {
        if (data.testMode) {
          setEnabled(true);
          setIntervalMs(data.testIntervalMs ?? 10_000);
        }
      })
      .catch(() => {});
  }, []);

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
        window.dispatchEvent(new Event("stats-refresh"));
      } catch {
        setError("Network error");
      }
    }

    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs]);

  if (!enabled) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-vice-gold/40 bg-vice-black/90 p-4 text-sm shadow-xl backdrop-blur-md">
      <p className="font-display text-xs uppercase tracking-widest text-vice-gold">
        Test Mode Active
      </p>
      <p className="mt-1 text-vice-muted">
        Picking a random holder every {intervalMs / 1000}s · Treasury simulated
        at $100
      </p>
      {lastRun && (
        <p className="mt-2 text-xs text-vice-muted">Last run: {lastRun}</p>
      )}
      {lastResult?.status === "distributed" && lastResult.holderWallet && (
        <p className="mt-1 font-mono text-xs text-vice-teal">
          Winner: {lastResult.holderWallet.slice(0, 8)}...
          {lastResult.holderWallet.slice(-4)}
        </p>
      )}
      {lastResult?.status === "skipped" && (
        <p className="mt-1 text-xs text-vice-pink">
          Skipped: {lastResult.reason}
          {lastResult.totalHolders != null &&
            ` (${lastResult.eligibleHolders ?? 0}/${lastResult.totalHolders} eligible)`}
        </p>
      )}
      {error && <p className="mt-1 text-xs text-vice-pink">{error}</p>}
    </div>
  );
}
