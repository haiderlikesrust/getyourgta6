"use client";

import { useStats } from "./site-data";

export function Band() {
  const { stats } = useStats();
  const multiplier = stats?.rules.boostMultiplier ?? 10;
  const boost = stats?.rules.boostPercent ?? 0.1;
  const prize = stats?.prizeUsd ?? 100;

  const items = [
    "Free to enter",
    `Hold ${boost}% = ${multiplier}× odds`,
    `$${prize} PS5 or Xbox card`,
    "Pot checked every 5 minutes",
    "No purchase needed",
    "Every payout on-chain",
  ];

  const track = (hidden: boolean) => (
    <div className="band__track" aria-hidden={hidden}>
      {items.map((item) => (
        <span key={item} className="flex items-center gap-[2.2rem]">
          <span className="font-display text-xl font-black italic uppercase tracking-wide sm:text-2xl">
            {item}
          </span>
          <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
            <path
              d="M10 0l2.6 7.4L20 10l-7.4 2.6L10 20l-2.6-7.4L0 10l7.4-2.6z"
              fill="currentColor"
            />
          </svg>
        </span>
      ))}
    </div>
  );

  return (
    <div className="band">
      <div className="band__inner">
        {track(false)}
        {track(true)}
        {track(true)}
      </div>
    </div>
  );
}
