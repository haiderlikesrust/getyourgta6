"use client";

import { compact, oneIn } from "@/lib/format";
import { Reveal } from "./Reveal";
import { useEntry, useStats } from "./site-data";
import { useWallet } from "./wallet";

/** "Two ways in": the free walk-in ticket vs the boosted holder ticket. */
export function WaysIn() {
  const { stats } = useStats();
  const { address, openModal } = useWallet();
  const { standing, entering, enter } = useEntry();

  const multiplier = stats?.rules.boostMultiplier ?? 10;
  const boostPercent = stats?.rules.boostPercent ?? 0.1;
  const autoEnter = stats?.rules.holdersAutoEnter ?? true;
  const symbol = stats?.site.symbol;
  const buyUrl = stats?.site.buyUrl;
  const pool = stats?.pool;

  const total = pool?.totalTickets ?? 0;
  // What a fresh ticket would be worth right now.
  const openOdds = total + 1 > 0 ? 1 / (total + 1) : null;
  const holderOdds = multiplier / (total + multiplier);

  const walkInAction = () => {
    if (!address) openModal();
    else if (!standing?.entered) void enter();
  };

  return (
    <section id="enter" className="relative px-5 pb-24 pt-28 sm:px-8 sm:pt-36">
      <div className="mx-auto max-w-[1320px]">
        <Reveal className="max-w-3xl">
          <p className="label text-gold">Get in</p>
          <h2 className="h-section mt-3">
            Two ways in.
            <br />
            One pays <span className="text-sunset">{multiplier}×.</span>
          </h2>
          <p className="mt-5 max-w-xl text-lg text-haze">
            Everyone gets a shot for free. Hold {boostPercent}% of the supply and
            your wallet goes into the hat {multiplier} times instead of once.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-8 lg:grid-cols-2 lg:gap-10">
          {/* ------------ walk-in ------------ */}
          <Reveal>
            <article
              className="ticket ticket-paper h-full -rotate-1 transition-transform duration-500 hover:rotate-0"
              style={{ "--split": "calc(100% - 132px)" } as React.CSSProperties}
            >
              <div className="ticket__tear" />
              <div className="px-7 pb-[164px] pt-7 sm:px-9 sm:pt-9">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="label opacity-60">Ticket A · free</p>
                    <h3 className="h-display mt-2 text-6xl sm:text-7xl">Walk-in</h3>
                  </div>
                  <span className="h-display text-7xl opacity-90 sm:text-8xl">1×</span>
                </div>
                <ol className="mt-7 space-y-3 text-[1.05rem] font-medium">
                  <Step n="1">Connect any Solana wallet.</Step>
                  <Step n="2">Sign one message to opt in. No gas, no transaction.</Step>
                  <Step n="3">You&apos;re in every draw from now on. No coin required.</Step>
                </ol>
              </div>
              <div className="absolute inset-x-0 bottom-0 flex h-[132px] items-center justify-between gap-4 px-7 sm:px-9">
                <div>
                  <p className="label opacity-60">A new ticket today</p>
                  <p className="font-display num text-3xl font-black italic">
                    {stats ? (oneIn(openOdds) ?? "—") : "—"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={walkInAction}
                  disabled={entering || !!standing?.entered}
                  className="btn btn-sm bg-ink text-cream"
                >
                  {standing?.entered
                    ? "You're in"
                    : entering
                      ? "Check wallet…"
                      : address
                        ? "Sign & enter"
                        : "Connect & enter"}
                </button>
              </div>
            </article>
          </Reveal>

          {/* ------------ high roller ------------ */}
          <Reveal delay={120}>
            <article
              className="ticket ticket-gold h-full rotate-1 transition-transform duration-500 hover:rotate-0"
              style={{ "--split": "calc(100% - 132px)" } as React.CSSProperties}
            >
              <div className="ticket__tear" />
              <div className="px-7 pb-[164px] pt-7 sm:px-9 sm:pt-9">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="label opacity-70">Ticket B · holders</p>
                    <h3 className="h-display mt-2 text-6xl sm:text-7xl">High roller</h3>
                  </div>
                  <span className="h-display text-7xl sm:text-8xl">{multiplier}×</span>
                </div>
                <ol className="mt-7 space-y-3 text-[1.05rem] font-medium">
                  <Step n="1">
                    Hold at least {boostPercent}% of the {symbol ?? "coin"} supply in one wallet.
                  </Step>
                  <Step n="2">
                    {autoEnter
                      ? "That's it. Qualifying wallets are entered automatically, every draw."
                      : "Connect and sign once to opt in."}
                  </Step>
                  <Step n="3">
                    {multiplier} tickets per draw for as long as you stay above the line.
                  </Step>
                </ol>
              </div>
              <div className="absolute inset-x-0 bottom-0 flex h-[132px] items-center justify-between gap-4 px-7 sm:px-9">
                <div>
                  <p className="label opacity-70">A new holder today</p>
                  <p className="font-display num text-3xl font-black italic">
                    {stats ? (oneIn(holderOdds) ?? "—") : "—"}
                  </p>
                </div>
                {buyUrl ? (
                  <a href={buyUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm bg-ink text-cream">
                    Get {symbol ?? "the coin"}
                  </a>
                ) : (
                  <span className="label opacity-70">Coin link soon</span>
                )}
              </div>
            </article>
          </Reveal>
        </div>

        {/* ------------ the hat ------------ */}
        <Reveal className="panel mt-12 grid gap-8 p-7 sm:p-9 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <p className="label text-gold">What&apos;s in the hat right now</p>
            <div className="mt-4 flex flex-wrap items-end gap-x-10 gap-y-4">
              <Count value={pool ? compact(pool.openEntrants) : "—"} label="walk-ins · 1 ticket each" />
              <Count value={pool ? compact(pool.holderEntrants) : "—"} label={`high rollers · ${multiplier} each`} accent />
              <Count value={pool ? compact(pool.totalTickets) : "—"} label="tickets in total" />
            </div>
            {pool && !pool.live && (
              <p className="mt-4 text-sm text-haze">
                Holder snapshot is warming up — showing opt-ins only for now.
              </p>
            )}
          </div>
          <TicketStack multiplier={multiplier} />
        </Reveal>
      </div>
    </section>
  );
}

function Step({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span className="font-display mt-px grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink/90 text-sm font-black italic text-cream">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

function Count({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div>
      <p className={`h-display num text-6xl ${accent ? "text-sunset" : ""}`}>{value}</p>
      <p className="mt-1 text-sm text-haze">{label}</p>
    </div>
  );
}

/** Visual weight comparison: one plain ticket next to a fan of gold ones. */
function TicketStack({ multiplier }: { multiplier: number }) {
  const shown = Math.min(multiplier, 10);
  return (
    <div className="flex items-end justify-between gap-6" aria-hidden>
      <div className="text-center">
        <div className="mx-auto h-[74px] w-[46px] rounded-md bg-sand shadow-lg" />
        <p className="label mt-3 text-haze">Walk-in</p>
      </div>
      <p className="h-display pb-9 text-4xl text-haze">vs</p>
      <div className="text-center">
        <div className="relative mx-auto h-[74px]" style={{ width: 46 + (shown - 1) * 17 }}>
          {Array.from({ length: shown }, (_, i) => (
            <div
              key={i}
              className="absolute top-0 h-[74px] w-[46px] rounded-md shadow-lg"
              style={{
                left: i * 17,
                background: "linear-gradient(150deg,#ffe28a,#ffc53d 45%,#ff8a3d)",
                transform: `rotate(${(i - (shown - 1) / 2) * 2.2}deg)`,
                boxShadow: "-4px 0 10px -4px rgba(0,0,0,0.5)",
              }}
            />
          ))}
        </div>
        <p className="label mt-3 text-gold">High roller · {multiplier}×</p>
      </div>
    </div>
  );
}
