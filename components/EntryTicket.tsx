"use client";

import Link from "next/link";
import { compact, oneIn, percent, shortAddress, usd } from "@/lib/format";
import { useEntry, useStats } from "./site-data";
import { useWallet } from "./wallet";

/**
 * The hero ticket: top half is the live pot, the stub below the tear line
 * is the visitor's own place in the next draw.
 */
export function EntryTicket() {
  const { stats } = useStats();
  const { address, openModal, connecting } = useWallet();
  const { standing, loading, entering, error, enter } = useEntry();

  const multiplier = stats?.rules.boostMultiplier ?? 10;
  const boostPercent = stats?.rules.boostPercent ?? 0.1;
  const drawNumber = (stats?.totalRewards ?? 0) + 1;
  const buyUrl = stats?.site.buyUrl ?? null;
  const symbol = stats?.site.symbol ?? null;

  return (
    <div
      className="ticket ticket-dark w-full max-w-[430px] backdrop-blur-md"
      style={{ "--split": "364px" } as React.CSSProperties}
    >
      <div className="ticket__tear" />

      {/* ---------------- top: the pot ---------------- */}
      <div className="flex h-[364px] flex-col px-7 pb-6 pt-6">
        <div className="flex items-center justify-between">
          <span className="label text-gold">Admit one · Draw Nº {String(drawNumber).padStart(3, "0")}</span>
          <span className="label flex items-center gap-2 text-teal">
            <span className="dot-live" />
            Live
          </span>
        </div>

        <p className="label mt-6 text-haze">In the pot right now</p>
        <p className="h-display num mt-1 text-[4.4rem] leading-none">
          {stats ? (
            <>
              <span className="text-haze">$</span>
              {usd(stats.availableUsd)}
            </>
          ) : (
            <span className="skeleton inline-block">$000.00</span>
          )}
        </p>

        <div className="mt-4">
          <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(stats?.progressPercent ?? 0)}>
            <div className="meter__fill" style={{ width: `${Math.max(3, stats?.progressPercent ?? 0)}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-sm text-haze">
            <span className="num">{stats ? `${stats.progressPercent.toFixed(0)}% to the next draw` : " "}</span>
            <span className="num">{stats ? `draws at $${usd(stats.threshold, 0)}` : ""}</span>
          </div>
        </div>

        <dl className="mt-auto grid grid-cols-3 gap-3 pt-5">
          <Fact label="Prize" value={stats ? `$${stats.prizeUsd}` : "—"} sub="PS5 or Xbox" />
          <Fact label="Tickets in" value={stats ? compact(stats.pool.totalTickets) : "—"} sub={stats ? `${compact(stats.pool.holderEntrants + stats.pool.openEntrants)} wallets` : ""} />
          <Fact label="Paid out" value={stats ? `$${compact(stats.totalDistributedUsd)}` : "—"} sub={stats ? `${stats.totalClaimed} claimed` : ""} />
        </dl>
      </div>

      {/* ---------------- stub: you ---------------- */}
      <div className="flex min-h-[188px] flex-col justify-center px-7 pb-7 pt-7">
        {!address && (
          <>
            <p className="h-display text-3xl">You&apos;re not in yet.</p>
            <p className="mt-1.5 text-sm text-haze">
              Free entry. One signature, no transaction, no gas.
            </p>
            <button type="button" onClick={openModal} disabled={connecting} className="btn btn-hot mt-4 w-full">
              {connecting ? "Connecting…" : "Connect wallet to enter"}
            </button>
          </>
        )}

        {address && !standing && (
          <>
            <p className="label text-haze">{shortAddress(address)}</p>
            <p className="h-display mt-1 text-3xl">
              {loading ? <span className="skeleton">Checking wallet</span> : "Wallet connected"}
            </p>
            {error && <p className="mt-2 text-sm text-rose">{error}</p>}
          </>
        )}

        {address && standing && (standing.unclaimedRewards ?? 0) > 0 && (
          <>
            <p className="label text-gold">{shortAddress(address)}</p>
            <p className="h-display mt-1 text-4xl text-sunset">You won.</p>
            <Link href="/claim" className="btn btn-gold mt-4 w-full">
              Claim your gift card
            </Link>
          </>
        )}

        {address && standing && !(standing.unclaimedRewards ?? 0) && standing.excluded && (
          <>
            <p className="label text-haze">{shortAddress(address)}</p>
            <p className="h-display mt-1 text-3xl">Team wallet</p>
            <p className="mt-1.5 text-sm text-haze">This wallet is excluded from the draw.</p>
          </>
        )}

        {address && standing && !(standing.unclaimedRewards ?? 0) && !standing.excluded && standing.entered && (
          <>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="label text-teal">
                  {shortAddress(address)} · you&apos;re in
                </p>
                <p className="h-display mt-1 text-[2.6rem]">
                  {standing.tier === "holder" ? (
                    <span className="text-sunset">{standing.tickets} tickets</span>
                  ) : (
                    "1 ticket"
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="label text-haze">Your odds</p>
                <p className="font-display num text-2xl font-extrabold italic">
                  {oneIn(standing.odds) ?? "—"}
                </p>
              </div>
            </div>
            {standing.tier === "holder" ? (
              <p className="mt-2 text-sm text-haze">
                High roller: you hold{" "}
                <span className="text-cream">{percent(standing.holdingPercent ?? 0)}</span> of
                supply. You stay in every draw while you hold.
              </p>
            ) : (
              <p className="mt-2 text-sm text-haze">
                {standing.tokensToBoost
                  ? `Hold ${compact(standing.tokensToBoost)} more ${symbol ?? "tokens"} for ${multiplier}× the tickets.`
                  : `Hold ${boostPercent}% of supply for ${multiplier}× the tickets.`}{" "}
                {buyUrl && (
                  <a href={buyUrl} target="_blank" rel="noopener noreferrer" className="text-gold underline-offset-4 hover:underline">
                    Get the coin →
                  </a>
                )}
              </p>
            )}
          </>
        )}

        {address && standing && !(standing.unclaimedRewards ?? 0) && !standing.excluded && !standing.entered && (
          <>
            <p className="label text-haze">{shortAddress(address)} · not entered</p>
            <button type="button" onClick={() => void enter()} disabled={entering} className="btn btn-hot mt-3 w-full">
              {entering
                ? "Check your wallet…"
                : standing.boosted
                  ? `Sign & enter · ${multiplier} tickets`
                  : "Sign & enter · 1 ticket"}
            </button>
            <p className="mt-2.5 text-sm text-haze">
              {error ? (
                <span className="text-rose">{error}</span>
              ) : standing.boosted ? (
                `You hold ${percent(standing.holdingPercent ?? 0)} — that's the ${multiplier}× tier.`
              ) : (
                "Free signature. It can't move funds."
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="label text-[0.68rem] text-haze">{label}</dt>
      <dd className="font-display num mt-0.5 text-2xl font-extrabold italic leading-none">{value}</dd>
      {sub && <dd className="mt-1 text-xs text-haze">{sub}</dd>}
    </div>
  );
}
