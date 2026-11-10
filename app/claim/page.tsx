"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { useStats } from "@/components/site-data";
import { useWallet } from "@/components/wallet";
import { shortAddress } from "@/lib/format";

type ClaimStep = "enter" | "verify" | "complete" | "error";

interface ClaimStartResponse {
  claimId: string;
  claimToken: string;
  tempPubkey: string;
  verifyAmountSol: number;
  verifyAmountLamports: number;
  expiresAt: string;
  status: string;
  platform?: string;
  reward: { amountUsd: number; platformLabel: string };
}

interface ClaimStatusResponse {
  status: string;
  message?: string;
  verifiedTxSig?: string;
  refundTxSig?: string;
  reward?: {
    brand: string;
    platformLabel?: string;
    amountUsd: number;
    code?: string;
    pin?: string;
    link?: string;
    instructions?: string;
  };
}

const SESSION_KEY = "gta6fund:claim-session";

const PLATFORMS: Record<string, { label: string; sub: string }> = {
  playstation: { label: "PlayStation", sub: "PS Store · US" },
  xbox: { label: "Xbox", sub: "Microsoft Store · US" },
};

function saveClaimSession(wallet: string, data: ClaimStartResponse) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ wallet, ...data }));
  } catch {
    // storage unavailable
  }
}

function loadClaimSession(wallet: string): ClaimStartResponse | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClaimStartResponse & { wallet: string };
    return parsed.wallet === wallet ? parsed : null;
  } catch {
    return null;
  }
}

const STEPS = ["Wallet", "Console", "Verify", "Code"];

export default function ClaimPage() {
  const { stats } = useStats();
  const { address, openModal } = useWallet();
  const brands = (stats?.brands ?? ["playstation", "xbox"]).filter((b) => PLATFORMS[b]);

  const [wallet, setWallet] = useState("");
  const [platform, setPlatform] = useState<string>("playstation");
  const [step, setStep] = useState<ClaimStep>("enter");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claim, setClaim] = useState<ClaimStartResponse | null>(null);
  const [statusData, setStatusData] = useState<ClaimStatusResponse | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Prefill from the connected wallet (still editable).
  useEffect(() => {
    if (address && !wallet) setWallet(address);
  }, [address, wallet]);

  useEffect(() => {
    if (brands.length > 0 && !brands.includes(platform)) setPlatform(brands[0]);
  }, [brands, platform]);

  const pollStatus = useCallback(async (claimId: string, token: string) => {
    try {
      const res = await fetch("/api/claim/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId, claimToken: token }),
      });
      const data = (await res.json()) as ClaimStatusResponse;
      setStatusData(data);

      if (data.status === "COMPLETE") {
        setStep("complete");
        try {
          sessionStorage.removeItem(SESSION_KEY);
        } catch {
          // storage unavailable
        }
        return true;
      }
      if (data.status === "EXPIRED") {
        setStep("error");
        setError(data.message ?? "This claim expired. Start again.");
        return true;
      }
    } catch {
      // transient network error: keep polling
    }
    return false;
  }, []);

  useEffect(() => {
    if (step !== "verify" || !claim) return;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      const done = await pollStatus(claim.claimId, claim.claimToken);
      if (done) stopped = true;
    };
    void tick();
    const interval = setInterval(tick, 5000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [step, claim, pollStatus]);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const trimmed = wallet.trim();
      const saved = loadClaimSession(trimmed);

      const res = await fetch("/api/claim/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: trimmed,
          claimToken: saved?.claimToken,
          platform: saved?.platform ?? platform,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start claim");

      const claimData = data as ClaimStartResponse;
      saveClaimSession(trimmed, claimData);
      setClaim(claimData);
      setStatusData(null);
      setStep("verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("error");
    } finally {
      setLoading(false);
    }
  }

  function copy(text: string, key: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  const activeStep = step === "complete" ? 3 : step === "verify" ? 2 : wallet.trim() ? 1 : 0;
  const processing =
    step === "verify" && !!statusData?.status && statusData.status !== "PENDING";

  return (
    <>
      <Nav />

      <main className="relative min-h-[100svh] overflow-hidden px-5 pb-28 pt-[calc(var(--nav-h)+3.5rem)] sm:px-8">
        <div
          className="pointer-events-none absolute -right-40 -top-40 h-[640px] w-[640px] rounded-full opacity-45 blur-[130px]"
          style={{ background: "radial-gradient(circle,#ff8a3d,#ff2d8e 45%,transparent 70%)" }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -left-56 bottom-0 h-[520px] w-[520px] rounded-full opacity-30 blur-[130px]"
          style={{ background: "radial-gradient(circle,#a445ff,transparent 65%)" }}
          aria-hidden
        />

        <div className="relative mx-auto grid max-w-[1180px] gap-14 lg:grid-cols-[1fr_1.05fr]">
          {/* ---------------- left: story ---------------- */}
          <div className="rise rise-1">
            <p className="label text-gold">Winners only</p>
            <h1 className="h-display mt-3 text-[clamp(3.6rem,9vw,7rem)]">
              Claim your
              <br />
              <span className="text-sunset">gift card.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg text-haze">
              If your wallet was drawn, this is where you pick a console and
              collect the code. It takes about two minutes.
            </p>

            <ol className="mt-10 space-y-1">
              {STEPS.map((label, i) => (
                <li key={label} className="flex items-center gap-4 py-2">
                  <span
                    className={`font-display grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg font-black italic transition ${
                      i < activeStep
                        ? "bg-teal text-ink"
                        : i === activeStep
                          ? "bg-gold text-ink"
                          : "bg-white/10 text-haze"
                    }`}
                  >
                    {i < activeStep ? "✓" : i + 1}
                  </span>
                  <span
                    className={`font-display text-2xl font-extrabold uppercase italic tracking-wide ${
                      i <= activeStep ? "text-cream" : "text-haze/70"
                    }`}
                  >
                    {label}
                  </span>
                </li>
              ))}
            </ol>

            <p className="mt-10 max-w-md text-sm leading-relaxed text-haze">
              Verification is a {claim?.verifyAmountSol ?? 0.01} SOL transfer from the
              winning wallet. It proves the wallet is yours and is sent straight
              back, minus the network fee. We never ask for a seed phrase.
            </p>
          </div>

          {/* ---------------- right: flow ---------------- */}
          <div className="rise rise-3">
            {step === "enter" && (
              <form onSubmit={handleStart} className="panel p-7 sm:p-9">
                <label htmlFor="wallet" className="label text-haze">
                  Winning wallet address
                </label>
                <input
                  id="wallet"
                  type="text"
                  value={wallet}
                  onChange={(e) => setWallet(e.target.value)}
                  placeholder="Solana address"
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-3 w-full rounded-xl bg-ink/70 px-4 py-3.5 font-mono text-sm text-cream shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)] outline-none transition placeholder:text-haze/50 focus:shadow-[inset_0_0_0_2px_var(--color-gold)]"
                  required
                />
                {!address && (
                  <button type="button" onClick={openModal} className="link-arrow mt-3 text-sm">
                    or connect a wallet to fill it in →
                  </button>
                )}

                <p className="label mt-8 text-haze">Pick your console</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {brands.map((brand) => {
                    const selected = platform === brand;
                    return (
                      <button
                        key={brand}
                        type="button"
                        onClick={() => setPlatform(brand)}
                        aria-pressed={selected}
                        className={`rounded-xl px-5 py-5 text-left transition ${
                          selected
                            ? "bg-gold text-ink"
                            : "bg-white/[0.06] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)] hover:bg-white/[0.11]"
                        }`}
                      >
                        <span className="h-display block text-3xl">{PLATFORMS[brand].label}</span>
                        <span className={`mt-1 block text-sm ${selected ? "text-ink/70" : "text-haze"}`}>
                          {PLATFORMS[brand].sub}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <button type="submit" disabled={loading || !wallet.trim()} className="btn btn-hot mt-8 w-full">
                  {loading ? "Checking the guest list…" : "Start my claim"}
                </button>
              </form>
            )}

            {step === "verify" && claim && (
              <div className="panel overflow-hidden">
                <div className="px-7 py-6 text-ink sm:px-9" style={{ background: "var(--sunset-gradient)" }}>
                  <p className="label">You won</p>
                  <p className="h-display mt-1 text-5xl">
                    ${claim.reward.amountUsd} {claim.reward.platformLabel}
                  </p>
                </div>
                <div className="space-y-6 p-7 sm:p-9">
                  {processing ? (
                    <div>
                      <p className="h-display text-4xl">Verified.</p>
                      <p className="mt-2 text-haze">
                        {statusData?.message ?? "Buying your gift card now. Keep this tab open."}
                      </p>
                      <div className="meter mt-5">
                        <div className="meter__fill" style={{ width: "100%" }} />
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-lg">
                        Send exactly{" "}
                        <strong className="text-gold">{claim.verifyAmountSol} SOL</strong> from{" "}
                        <span className="font-mono text-base">{shortAddress(wallet.trim(), 5)}</span> to
                        this one-time address:
                      </p>
                      <div className="flex items-stretch gap-2">
                        <code className="flex-1 break-all rounded-xl bg-ink/70 px-4 py-3 font-mono text-sm text-teal shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]">
                          {claim.tempPubkey}
                        </code>
                        <button
                          type="button"
                          onClick={() => copy(claim.tempPubkey, "addr")}
                          className="btn btn-ghost btn-sm h-auto shrink-0"
                        >
                          {copied === "addr" ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <p className="flex items-center gap-3 text-haze">
                        <span className="dot-live" />
                        Watching the chain for your transfer…
                      </p>
                    </>
                  )}
                  <p className="text-sm text-haze">
                    This claim expires {new Date(claim.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.
                    It must come from the winning wallet, not an exchange.
                  </p>
                </div>
              </div>
            )}

            {step === "complete" && statusData?.reward && (
              <div className="panel overflow-hidden">
                <div className="px-7 py-6 text-ink sm:px-9" style={{ background: "var(--sunset-gradient)" }}>
                  <p className="label">Enjoy the game</p>
                  <p className="h-display mt-1 text-5xl">
                    ${statusData.reward.amountUsd}{" "}
                    {statusData.reward.platformLabel ?? statusData.reward.brand}
                  </p>
                </div>
                <div className="space-y-6 p-7 sm:p-9">
                  {statusData.reward.code ? (
                    <>
                      <p className="rounded-xl bg-magenta/15 px-4 py-3 text-sm text-rose">
                        Save this now. For your security the code is shown only once.
                      </p>
                      <div>
                        <p className="label text-haze">Gift card code</p>
                        <div className="mt-2 flex items-stretch gap-2">
                          <code className="flex-1 break-all rounded-xl bg-ink/70 px-4 py-3.5 font-mono text-xl text-gold shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]">
                            {statusData.reward.code}
                          </code>
                          <button
                            type="button"
                            onClick={() => copy(statusData.reward!.code!, "code")}
                            className="btn btn-gold btn-sm h-auto shrink-0"
                          >
                            {copied === "code" ? "Copied" : "Copy"}
                          </button>
                        </div>
                      </div>
                      {statusData.reward.pin && (
                        <div>
                          <p className="label text-haze">PIN</p>
                          <code className="mt-1 block font-mono text-xl text-gold">{statusData.reward.pin}</code>
                        </div>
                      )}
                      {statusData.reward.link && (
                        <div>
                          <p className="label text-haze">Redemption link</p>
                          <a
                            href={statusData.reward.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 block break-all font-mono text-sm text-teal underline-offset-4 hover:underline"
                          >
                            {statusData.reward.link}
                          </a>
                        </div>
                      )}
                      {statusData.reward.instructions && (
                        <div>
                          <p className="label text-haze">How to redeem</p>
                          <p className="mt-1 text-sm leading-relaxed text-cream/85">
                            {statusData.reward.instructions}
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-haze">
                      {statusData.message ??
                        "This gift card was already revealed on your first confirmation screen."}
                    </p>
                  )}

                  {statusData.refundTxSig && (
                    <p className="text-sm text-haze">
                      Verification SOL refunded ·{" "}
                      <a
                        href={`https://solscan.io/tx/${statusData.refundTxSig}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal underline-offset-4 hover:underline"
                      >
                        view transaction
                      </a>
                    </p>
                  )}
                </div>
              </div>
            )}

            {step === "error" && (
              <div className="panel p-7 sm:p-9">
                <p className="h-display text-4xl">Not this time.</p>
                <p className="mt-3 text-haze">{error}</p>
                <p className="mt-3 text-sm text-haze">
                  Only a wallet that was drawn can claim, and each win can be
                  claimed once. Check the guest list on the home page.
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setStep("enter");
                      setError(null);
                      setClaim(null);
                      setStatusData(null);
                    }}
                    className="btn btn-hot btn-sm"
                  >
                    Try another wallet
                  </button>
                  <Link href="/#winners" className="btn btn-ghost btn-sm">
                    See winners
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
