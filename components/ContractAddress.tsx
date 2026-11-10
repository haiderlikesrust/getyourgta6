"use client";

import { useState } from "react";
import { shortAddress } from "@/lib/format";
import { useStats } from "./site-data";

/**
 * The coin's contract address (the `CA` env variable) with one-tap copy.
 * Renders nothing until a real address is configured.
 */
export function ContractAddress({
  variant = "chip",
  className = "",
}: {
  variant?: "chip" | "plain";
  className?: string;
}) {
  const { stats } = useStats();
  const [copied, setCopied] = useState(false);
  const ca = stats?.tokenMint;
  if (!ca) return null;

  const copy = () => {
    navigator.clipboard?.writeText(ca).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  if (variant === "plain") {
    return (
      <button
        type="button"
        onClick={copy}
        title="Copy contract address"
        className={`group block max-w-full text-left ${className}`}
      >
        <span className="label block text-gold">Contract address</span>
        <span className="mt-2 block break-all font-mono text-sm text-cream/80 transition group-hover:text-cream">
          {ca}
        </span>
        <span className="label mt-1.5 block text-[0.66rem] text-haze">
          {copied ? "Copied" : "Tap to copy"}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy contract address"
      aria-label={`Contract address ${ca}. Copy.`}
      className={`group inline-flex max-w-full items-center gap-3 rounded-full bg-ink/60 py-1.5 pl-1.5 pr-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)] backdrop-blur-md transition hover:bg-ink/80 ${className}`}
    >
      <span className="label rounded-full bg-gold px-2.5 py-1 text-[0.7rem] text-ink">
        CA
      </span>
      <span className="truncate font-mono text-sm text-cream">
        <span className="hidden xl:inline">{ca}</span>
        <span className="xl:hidden">{shortAddress(ca, 8)}</span>
      </span>
      <span className="label shrink-0 text-[0.68rem] text-gold transition group-hover:text-cream">
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}

/** X logo mark. */
export function XIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
