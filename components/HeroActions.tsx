"use client";

import Link from "next/link";
import { usd } from "@/lib/format";
import { useEntry, useStats } from "./site-data";
import { useWallet } from "./wallet";

/** Live status pill above the hero headline. */
export function HeroKicker() {
  const { stats } = useStats();
  return (
    <p className="chip rise rise-1">
      <span className="dot-live" />
      {stats
        ? stats.progressPercent >= 100
          ? "Pot is full · drawing now"
          : `Pot at $${usd(stats.availableUsd, 0)} of $${usd(stats.threshold, 0)}`
        : "Live on Solana"}
    </p>
  );
}

/** Primary hero buttons; they follow the wallet's state. */
export function HeroActions() {
  const { stats } = useStats();
  const { address, openModal } = useWallet();
  const { standing, entering, enter } = useEntry();
  const multiplier = stats?.rules.boostMultiplier ?? 10;
  const buyUrl = stats?.site.buyUrl;
  const won = (standing?.unclaimedRewards ?? 0) > 0;

  let primary: React.ReactNode;
  if (won) {
    primary = (
      <Link href="/claim" className="btn btn-gold">
        You won — claim it
      </Link>
    );
  } else if (!address) {
    primary = (
      <button type="button" onClick={openModal} className="btn btn-hot">
        Enter free
      </button>
    );
  } else if (standing && !standing.entered && !standing.excluded) {
    primary = (
      <button type="button" onClick={() => void enter()} disabled={entering} className="btn btn-hot">
        {entering ? "Check your wallet…" : "Sign & enter"}
      </button>
    );
  } else {
    primary = (
      <a href="#pot" className="btn btn-hot">
        {standing?.entered ? "You're in · watch the pot" : "Watch the pot"}
      </a>
    );
  }

  return (
    <div className="rise rise-4 mt-9 flex flex-wrap items-center gap-4">
      {primary}
      {buyUrl ? (
        <a href={buyUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
          Get {multiplier}× odds
        </a>
      ) : (
        <a href="#enter" className="btn btn-ghost">
          Get {multiplier}× odds
        </a>
      )}
    </div>
  );
}

/** Small facts row under the buttons. */
export function HeroFacts() {
  const { stats } = useStats();
  const prize = stats?.prizeUsd ?? 100;
  const boost = stats?.rules.boostPercent ?? 0.1;
  const multiplier = stats?.rules.boostMultiplier ?? 10;

  const facts = [
    { k: `$${prize}`, v: "PS5 or Xbox gift card" },
    { k: "$0", v: "to enter, ever" },
    { k: `${multiplier}×`, v: `tickets if you hold ${boost}%` },
  ];

  return (
    <dl className="rise rise-5 mt-12 flex flex-wrap gap-x-10 gap-y-5">
      {facts.map((f) => (
        <div key={f.v} className="flex items-baseline gap-3">
          <dt className="h-display text-4xl text-sunset">{f.k}</dt>
          <dd className="max-w-[9rem] text-sm leading-snug text-cream/80">{f.v}</dd>
        </div>
      ))}
    </dl>
  );
}
