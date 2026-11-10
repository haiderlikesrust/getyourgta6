"use client";

import { Reveal } from "./Reveal";
import { useStats } from "./site-data";

export function Faq() {
  const { stats } = useStats();
  const multiplier = stats?.rules.boostMultiplier ?? 10;
  const boost = stats?.rules.boostPercent ?? 0.1;
  const prize = stats?.prizeUsd ?? 100;
  const autoEnter = stats?.rules.holdersAutoEnter ?? true;

  const items: Array<{ q: string; a: React.ReactNode }> = [
    {
      q: "Do I have to buy anything to enter?",
      a: "No. Connect a Solana wallet, sign one free message, and you hold one ticket in every draw from then on. Buying the coin is optional and only changes how many tickets you get.",
    },
    {
      q: `What exactly gets me ${multiplier}× odds?`,
      a: `Holding at least ${boost}% of the coin's total supply in a single wallet at the moment of the draw. That wallet gets ${multiplier} tickets instead of 1. It's a flat tier: holding more than ${boost}% doesn't add more tickets, and dropping below it puts you back to a walk-in ticket (if you opted in).`,
    },
    {
      q: "Do holders need to opt in too?",
      a: autoEnter
        ? `No. Any wallet above the ${boost}% line is entered automatically at every draw. Connecting just lets you see your tickets and odds.`
        : "Yes. Connect and sign once; after that you are in every draw while you hold.",
    },
    {
      q: "How is the winner picked?",
      a: "At draw time the server snapshots token balances, adds everyone who opted in, gives each wallet its tickets, and pulls one ticket with a cryptographically secure random number. The winning wallet, its tier and its odds are published on the guest list.",
    },
    {
      q: "What do I win, and how do I get it?",
      a: `A $${prize} PlayStation Store or Xbox digital gift card (US region) — enough to cover a standard pre-order. Open the Claim page, pick your console, and prove the wallet is yours with a tiny verification transfer that is sent straight back. The code is shown once, so save it.`,
    },
    {
      q: "Where does the prize money come from?",
      a: "From the coin's creator rewards. They are paid out as TTWO tokenized stock, swapped to SOL on Jupiter, and collected in the treasury wallet shown on this page. Nothing comes out of entrants' pockets.",
    },
    {
      q: "Can I enter with more than one wallet?",
      a: "Walk-in entries are one per wallet, and wallets that look like throwaways can be filtered out at draw time. The reliable way to raise your odds is the holder tier.",
    },
    {
      q: "Is this an official Rockstar thing?",
      a: "No. This is an unofficial, fan-run giveaway. It is not affiliated with, endorsed by or connected to Rockstar Games, Take-Two Interactive, Sony or Microsoft. The coin is a memecoin with no claim on any company and no promise of value.",
    },
  ];

  return (
    <section id="faq" className="relative border-t border-white/[0.07] bg-night px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto grid max-w-[1320px] gap-12 lg:grid-cols-[0.8fr_1.4fr]">
        <Reveal>
          <p className="label text-gold">FAQ</p>
          <h2 className="h-section mt-3">
            Straight
            <br />
            <span className="text-sunset">answers.</span>
          </h2>
        </Reveal>

        <Reveal delay={100}>
          <div className="divide-y divide-white/10 border-y border-white/10">
            {items.map((item) => (
              <details key={item.q} className="faq group">
                <summary className="flex items-center justify-between gap-6 py-5">
                  <span className="font-display text-2xl font-extrabold uppercase italic leading-tight tracking-wide transition group-hover:text-gold sm:text-[1.7rem]">
                    {item.q}
                  </span>
                  <span className="faq__plus grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-2xl leading-none">
                    +
                  </span>
                </summary>
                <p className="max-w-2xl pb-6 text-[1.02rem] leading-relaxed text-haze">{item.a}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
