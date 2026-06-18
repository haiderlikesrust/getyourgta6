import Link from "next/link";

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-vice-black py-16">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-vice-pink to-transparent" />
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-md">
            <p className="font-display text-2xl tracking-[0.2em] text-white">
              GTA<span className="logo-gradient">VI</span>
            </p>
            <p className="mt-4 text-sm leading-relaxed text-vice-muted">
              Unofficial fan project. Not affiliated with Rockstar Games, Take-Two
              Interactive, PlayStation, Xbox, or Bitrefill. All trademarks belong
              to their respective owners.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-xs uppercase tracking-widest text-vice-muted">
              Navigate
            </p>
            <Link
              href="/claim"
              className="text-sm text-white/80 transition hover:text-vice-teal"
            >
              Claim Reward
            </Link>
            <Link
              href="/#pool"
              className="text-sm text-white/80 transition hover:text-vice-teal"
            >
              Reward Pool
            </Link>
            <Link
              href="/#how-it-works"
              className="text-sm text-white/80 transition hover:text-vice-teal"
            >
              How It Works
            </Link>
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-white/5 pt-6 text-xs text-vice-muted sm:flex-row sm:items-center sm:justify-between">
          <p>Vice City vibes. Holder rewards powered by Solana.</p>
          <p>© {new Date().getFullYear()} GTA VI Holder Rewards</p>
        </div>
      </div>
    </footer>
  );
}
