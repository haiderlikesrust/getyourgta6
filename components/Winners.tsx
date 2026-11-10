"use client";

import { oneIn, timeAgo, usd } from "@/lib/format";
import type { TreasuryEventRow, WinnerRow } from "@/lib/types";
import { Reveal } from "./Reveal";
import { useStats } from "./site-data";

const PLATFORM: Record<string, string> = {
  playstation: "PlayStation",
  xbox: "Xbox",
  pending: "PS5 / Xbox",
};

const EVENT_LABEL: Record<string, string> = {
  swap: "Swapped on Jupiter",
  prize_paid: "Gift card bought",
  fee_claim: "Rewards claimed",
};

export function Winners() {
  const { stats } = useStats();
  const winners = stats?.recentWinners ?? [];
  const events = stats?.events ?? [];

  return (
    <section id="winners" className="relative px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto grid max-w-[1320px] gap-14 lg:grid-cols-[1.45fr_1fr]">
        <div>
          <Reveal>
            <p className="label text-gold">Winners</p>
            <h2 className="h-section mt-3">
              The <span className="text-sunset">guest list.</span>
            </h2>
          </Reveal>

          <Reveal className="mt-10">
            {!stats && <div className="panel skeleton h-48" />}

            {stats && winners.length === 0 && (
              <div className="panel p-9">
                <p className="h-display text-4xl">Nobody yet.</p>
                <p className="mt-2 max-w-md text-haze">
                  The first name goes on the list the moment the pot fills.
                  Being early is the whole point.
                </p>
              </div>
            )}

            {winners.length > 0 && (
              <ul className="divide-y divide-white/[0.07] overflow-hidden rounded-[18px] bg-white/[0.035] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
                {winners.map((w, i) => (
                  <WinnerItem key={w.id} winner={w} index={stats!.totalRewards - i} />
                ))}
              </ul>
            )}
          </Reveal>
        </div>

        <div>
          <Reveal>
            <p className="label text-gold">Paper trail</p>
            <h2 className="h-display mt-3 text-5xl">Follow the money.</h2>
            <p className="mt-3 text-haze">
              Every swap and every gift card payment, with the transaction to prove it.
            </p>
          </Reveal>

          <Reveal className="mt-8" delay={100}>
            {stats && events.length === 0 && (
              <div className="panel p-7 text-haze">
                No treasury moves yet. They show up here as they happen.
              </div>
            )}
            {events.length > 0 && (
              <ul className="space-y-2.5">
                {events.map((e) => (
                  <EventItem key={e.id} event={e} />
                ))}
              </ul>
            )}
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function WinnerItem({ winner, index }: { winner: WinnerRow; index: number }) {
  const holder = winner.tier === "holder";
  const odds = winner.poolTickets > 0 ? winner.tickets / winner.poolTickets : null;
  const claimed = winner.status === "CLAIMED";

  return (
    <li className="grid grid-cols-[auto_1fr_auto] items-center gap-x-5 gap-y-1 px-5 py-4 transition hover:bg-white/[0.04] sm:px-7">
      <span className="outline-num num text-4xl">{String(Math.max(1, index)).padStart(2, "0")}</span>
      <div className="min-w-0">
        <p className="truncate font-mono text-[0.95rem]">{winner.wallet}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-haze">
          <span
            className={`label rounded-full px-2.5 py-0.5 text-[0.66rem] ${
              holder ? "bg-gold text-ink" : "bg-white/10 text-cream"
            }`}
          >
            {holder ? `High roller · ${winner.tickets}×` : "Walk-in"}
          </span>
          {odds !== null && <span className="num">won at {oneIn(odds)}</span>}
          <span>{timeAgo(winner.createdAt)}</span>
        </p>
      </div>
      <div className="text-right">
        <p className="h-display num text-3xl">${usd(winner.amountUsd, 0)}</p>
        <p className={`label text-[0.66rem] ${claimed ? "text-teal" : "text-gold"}`}>
          {claimed ? (PLATFORM[winner.brand] ?? winner.brand) : "Unclaimed"}
        </p>
      </div>
    </li>
  );
}

function EventItem({ event }: { event: TreasuryEventRow }) {
  const label = EVENT_LABEL[event.kind] ?? event.kind;
  const detail =
    event.kind === "swap"
      ? `${event.from ?? "rewards"} → ${event.to ?? "SOL"}`
      : event.kind === "prize_paid"
        ? `paid in ${event.asset ?? "SOL"}`
        : "";

  const body = (
    <>
      <span
        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${event.kind === "prize_paid" ? "bg-gold" : "bg-teal"}`}
      />
      <span className="min-w-0 flex-1">
        <span className="font-display block text-lg font-bold uppercase leading-tight tracking-wide">
          {label}
        </span>
        <span className="block truncate text-sm text-haze">
          {detail && `${detail} · `}
          {timeAgo(event.createdAt)}
        </span>
      </span>
      <span className="h-display num text-2xl">${usd(event.usdValue)}</span>
    </>
  );

  const cls =
    "flex items-start gap-3.5 rounded-xl bg-white/[0.045] px-4 py-3.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]";

  return (
    <li>
      {event.txSig ? (
        <a
          href={`https://solscan.io/tx/${event.txSig}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`${cls} transition hover:bg-white/[0.09]`}
        >
          {body}
        </a>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}
