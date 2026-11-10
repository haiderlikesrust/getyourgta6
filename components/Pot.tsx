"use client";

import { compact, timeAgo, usd } from "@/lib/format";
import { Reveal } from "./Reveal";
import { useStats } from "./site-data";

/** The pot, shown as a sun that rises over the horizon as it fills. */
export function Pot() {
  const { stats, error } = useStats();
  const progress = Math.min(100, Math.max(0, stats?.progressPercent ?? 0));
  const remaining = stats ? Math.max(0, stats.threshold - stats.availableUsd) : null;
  // sun centre travels from below the horizon (y=250) to fully risen (y=120)
  const sunY = 250 - (progress / 100) * 130;

  return (
    <section id="pot" className="relative overflow-hidden px-5 py-24 sm:px-8 sm:py-32">
      <div
        className="pointer-events-none absolute -left-40 top-10 h-[520px] w-[520px] rounded-full opacity-40 blur-[120px]"
        style={{ background: "radial-gradient(circle,#ff2d8e,transparent 65%)" }}
        aria-hidden
      />
      <div className="relative mx-auto grid max-w-[1320px] gap-14 lg:grid-cols-[1fr_1.05fr] lg:items-center">
        <Reveal>
          <p className="label text-gold">The pot</p>
          <h2 className="h-section mt-3">
            When the sun&apos;s up,
            <br />
            <span className="text-sunset">somebody wins.</span>
          </h2>
          <p className="mt-5 max-w-lg text-lg text-haze">
            Creator rewards from every trade flow into one public wallet. It is
            checked every 5 minutes, and whenever it holds enough to buy a $
            {stats?.prizeUsd ?? 100} gift card, a winner is drawn on the spot.
          </p>

          <dl className="mt-10 grid max-w-lg grid-cols-2 gap-x-8 gap-y-7">
            <Stat label="Gift cards claimed" value={stats ? String(stats.totalClaimed) : "—"} />
            <Stat label="Paid out" value={stats ? `$${compact(stats.totalDistributedUsd)}` : "—"} />
            <Stat
              label="Rewards waiting to swap"
              value={stats ? `$${usd(stats.pendingTokenUsd)}` : "—"}
              hint="TTWO → SOL via Jupiter"
            />
            <Stat label="Last check" value={stats ? timeAgo(stats.lastRunAt) : "—"} hint="runs every 5 minutes" />
          </dl>

          {stats?.rewardWallet && (
            <p className="mt-8 font-mono text-xs text-haze">
              Treasury {stats.rewardWallet} · SOL ${usd(stats.solPrice)}
            </p>
          )}
          {error && !stats && (
            <p className="mt-6 text-sm text-rose">Live numbers are unavailable right now.</p>
          )}
        </Reveal>

        <Reveal delay={120}>
          <div className="panel overflow-hidden">
            <svg viewBox="0 0 600 330" className="block w-full" role="img" aria-label={`Pot is ${progress.toFixed(0)}% full`}>
              <defs>
                <linearGradient id="pot-sky" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#1a0a3a" />
                  <stop offset="0.55" stopColor="#7c1c78" />
                  <stop offset="1" stopColor="#ff7a4a" />
                </linearGradient>
                <linearGradient id="pot-sun" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#fff6cf" />
                  <stop offset="0.5" stopColor="#ffd45e" />
                  <stop offset="1" stopColor="#ff7a2f" />
                </linearGradient>
                <radialGradient id="pot-glow" cx="300" cy="250" r="300" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#ffd45e" stopOpacity="0.75" />
                  <stop offset="1" stopColor="#ff2d8e" stopOpacity="0" />
                </radialGradient>
                <clipPath id="pot-above">
                  <rect width="600" height="250" />
                </clipPath>
              </defs>
              <rect width="600" height="250" fill="url(#pot-sky)" />
              <rect width="600" height="250" fill="url(#pot-glow)" opacity={0.35 + progress / 160} />
              {/* target ring: where the sun sits when the pot is full */}
              <circle cx="300" cy="120" r="96" fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="1.5" strokeDasharray="3 7" />
              <g clipPath="url(#pot-above)">
                <circle
                  cx="300"
                  cy={sunY}
                  r="96"
                  fill="url(#pot-sun)"
                  style={{ transition: "cy 1.4s cubic-bezier(0.16,1,0.3,1)" }}
                />
              </g>
              <rect y="250" width="600" height="80" fill="#12062b" />
              <rect y="249" width="600" height="2" fill="#ffe6ae" opacity="0.7" />
              {[0, 1, 2, 3].map((i) => (
                <rect
                  key={i}
                  x={300 - (90 - i * 16)}
                  y={262 + i * 15}
                  width={(90 - i * 16) * 2}
                  height={3 + i}
                  rx="2"
                  fill="#ffd98a"
                  opacity={(0.2 + progress / 180) * (1 - i * 0.2)}
                />
              ))}
            </svg>

            <div className="px-7 pb-7 pt-6 sm:px-9">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="label text-haze">In the pot</p>
                  <p className="h-display num mt-1 text-7xl sm:text-8xl">
                    <span className="text-haze">$</span>
                    {stats ? usd(stats.availableUsd) : "0.00"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="label text-haze">Draws at</p>
                  <p className="h-display num mt-1 text-5xl text-sunset">
                    ${stats ? usd(stats.threshold, 0) : "—"}
                  </p>
                </div>
              </div>
              <div className="meter mt-6">
                <div className="meter__fill" style={{ width: `${Math.max(2, progress)}%` }} />
              </div>
              <p className="mt-3 text-sm text-haze">
                {remaining === null
                  ? " "
                  : remaining <= 0
                    ? "The pot is full — the next 5-minute check draws a winner."
                    : `$${usd(remaining)} to go. The target is what it costs to buy one $${stats?.prizeUsd} card, fees included.`}
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="label text-haze">{label}</dt>
      <dd className="h-display num mt-1.5 text-5xl">{value}</dd>
      {hint && <dd className="mt-1 text-sm text-haze">{hint}</dd>}
    </div>
  );
}
