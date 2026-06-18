"use client";

import { useEffect, useState } from "react";

interface Stats {
  balanceSol: number;
  balanceUsd: number;
  allocatedUsd: number;
  availableUsd: number;
  threshold: number;
  progressPercent: number;
  solPrice: number;
  rewardWallet: string | null;
  totalRewards: number;
  totalClaimed: number;
  totalDistributedUsd: number;
  recentWinners: Array<{
    id: string;
    wallet: string;
    brand: string;
    amountUsd: number;
    status: string;
    createdAt: string;
  }>;
  lastRunAt: string | null;
}

export function StatsPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/stats");
        if (!res.ok) throw new Error("Failed to load stats");
        const data = (await res.json()) as Stats;
        setStats(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error loading stats");
      }
    }

    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    const onRefresh = () => fetchStats();
    window.addEventListener("stats-refresh", onRefresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener("stats-refresh", onRefresh);
    };
  }, []);

  if (error) {
    return (
      <div className="card-glass rounded-2xl p-8 text-center text-vice-pink">
        {error}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="card-glass rounded-2xl p-10 text-center text-vice-muted">
        <span className="pulse-glow inline-block">Loading reward pool...</span>
      </div>
    );
  }

  return (
    <div className="card-glass card-neon rounded-2xl p-8 sm:p-10">
      <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow mb-3">Available Now</p>
          <p className="font-display text-6xl leading-none text-white sm:text-7xl">
            <span className="text-vice-muted">$</span>
            {stats.availableUsd.toFixed(2)}
          </p>
          <p className="mt-3 text-sm text-vice-muted">
            {stats.balanceSol.toFixed(4)} SOL @ ${stats.solPrice.toFixed(2)}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs uppercase tracking-widest text-vice-muted">
            Next Drop At
          </p>
          <p className="font-display text-4xl gradient-text">
            ${stats.threshold.toFixed(0)}
          </p>
          <span className="mt-2 inline-flex items-center gap-2 text-xs text-vice-teal">
            <span className="h-2 w-2 rounded-full bg-vice-teal pulse-glow" />
            Checked hourly
          </span>
        </div>
      </div>

      <div className="mb-2 flex justify-between text-xs uppercase tracking-wider text-vice-muted">
        <span>Progress to next reward</span>
        <span className="text-white">{stats.progressPercent.toFixed(1)}%</span>
      </div>
      <div className="progress-bar">
        <div
          className="progress-bar-fill"
          style={{ width: `${Math.max(2, stats.progressPercent)}%` }}
        />
      </div>

      <div className="mt-8 rounded-xl border border-vice-gold/25 bg-gradient-to-r from-vice-gold/10 to-transparent px-6 py-5 sm:flex sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-vice-gold">
            Gift Cards Distributed
          </p>
          <p className="mt-1 font-display text-4xl text-white sm:text-5xl">
            <span className="text-vice-muted">$</span>
            {stats.totalDistributedUsd.toLocaleString(undefined, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })}
          </p>
        </div>
        <p className="mt-3 text-sm text-vice-muted sm:mt-0 sm:max-w-xs sm:text-right">
          {stats.totalClaimed === 0
            ? "No gift cards claimed yet — be the first winner."
            : `${stats.totalClaimed} gift card${stats.totalClaimed === 1 ? "" : "s"} claimed so far`}
        </p>
      </div>

      <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox label="Total Rewards" value={stats.totalRewards.toString()} />
        <StatBox label="Claimed" value={stats.totalClaimed.toString()} />
        <StatBox label="Allocated" value={`$${stats.allocatedUsd.toFixed(0)}`} />
        <StatBox
          label="Last Check"
          value={
            stats.lastRunAt
              ? new Date(stats.lastRunAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"
          }
        />
      </div>

      {stats.rewardWallet && (
        <p className="mt-8 text-xs text-vice-muted">
          Treasury wallet: {stats.rewardWallet}
        </p>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-vice-black/40 p-4 transition hover:border-vice-pink/40">
      <p className="text-[0.65rem] uppercase tracking-wider text-vice-muted">
        {label}
      </p>
      <p className="mt-1.5 font-display text-xl text-white">{value}</p>
    </div>
  );
}

const BRAND_STYLES: Record<string, string> = {
  playstation: "from-vice-pink/30 to-transparent text-vice-pink",
  xbox: "from-vice-teal/30 to-transparent text-vice-teal",
};

export function RecentWinners() {
  const [winners, setWinners] = useState<Stats["recentWinners"]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function fetchStats() {
      const res = await fetch("/api/stats");
      if (res.ok) {
        const data = (await res.json()) as Stats;
        setWinners(data.recentWinners);
      }
      setLoaded(true);
    }
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    const onRefresh = () => fetchStats();
    window.addEventListener("stats-refresh", onRefresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener("stats-refresh", onRefresh);
    };
  }, []);

  if (loaded && winners.length === 0) {
    return (
      <div className="card-glass rounded-2xl p-10 text-center text-vice-muted">
        No winners yet. The first drop triggers when the pool hits $100.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {winners.map((w, i) => (
        <div
          key={w.id}
          className="card-glass flex items-center justify-between gap-4 rounded-xl px-5 py-4 transition hover:border-vice-pink/30"
        >
          <div className="flex items-center gap-4">
            <span className="font-display text-lg text-white/30">
              #{(i + 1).toString().padStart(2, "0")}
            </span>
            <div>
              <p className="font-mono text-sm text-vice-teal">{w.wallet}</p>
              <p className="text-xs text-vice-muted">
                {new Date(w.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`hidden rounded-full bg-gradient-to-r px-3 py-1 font-display text-xs uppercase tracking-wider sm:inline-block ${
                BRAND_STYLES[w.brand] ?? "from-white/10 to-transparent text-white"
              }`}
            >
              {w.brand === "pending" ? "PS / Xbox" : w.brand}
            </span>
            <div className="text-right">
              <p className="font-display text-base text-white">${w.amountUsd}</p>
              <p
                className={`text-xs ${
                  w.status === "CLAIMED" ? "text-vice-teal" : "text-vice-gold"
                }`}
              >
                {w.status}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
