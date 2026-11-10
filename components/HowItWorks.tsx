"use client";

import { Reveal } from "./Reveal";
import { useStats } from "./site-data";

export function HowItWorks() {
  const { stats } = useStats();
  const multiplier = stats?.rules.boostMultiplier ?? 10;
  const boost = stats?.rules.boostPercent ?? 0.1;
  const prize = stats?.prizeUsd ?? 100;

  const steps = [
    {
      title: "Trades pay rent",
      body: "Every buy and sell of the coin throws off creator rewards. They arrive as TTWO — tokenized shares of the studio's parent company.",
    },
    {
      title: "Stock becomes cash",
      body: "Every five minutes the rewards are claimed and swapped to SOL through Jupiter. Each swap is logged with its transaction.",
    },
    {
      title: "The pot fills",
      body: `One public treasury wallet, checked every 5 minutes. The moment it holds enough to buy a $${prize} card, a draw fires.`,
    },
    {
      title: "The hat gets shaken",
      body: `Walk-ins get 1 ticket, wallets holding ${boost}%+ get ${multiplier}. One ticket is pulled with a cryptographic random number.`,
    },
    {
      title: "Winner picks a console",
      body: `The winner proves the wallet is theirs, picks PlayStation or Xbox, and a $${prize} store code is bought and revealed on the spot.`,
    },
  ];

  return (
    <section id="how" className="relative border-y border-white/[0.07] bg-night px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-[1320px]">
        <Reveal className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="label text-gold">How it works</p>
            <h2 className="h-section mt-3">
              From a trade
              <br />
              to a <span className="text-sunset">pre-order.</span>
            </h2>
          </div>
          <p className="max-w-md text-lg text-haze">
            No team picking favourites and nothing to trust: the wallet, the
            swaps and the payouts are all public.
          </p>
        </Reveal>

        <ol className="mt-16 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((step, i) => (
            <Reveal as="li" key={step.title} delay={i * 80} className="relative">
              <div className="horizon-rule mb-6" />
              <span className="outline-num block text-[5.5rem]">0{i + 1}</span>
              <h3 className="h-display mt-4 text-3xl">{step.title}</h3>
              <p className="mt-3 text-[0.98rem] leading-relaxed text-haze">{step.body}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
