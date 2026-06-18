import Link from "next/link";

export function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-vice-black/50 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <Link
          href="/"
          className="font-display text-xl tracking-[0.15em] text-white transition hover:opacity-80"
        >
          GTA<span className="logo-gradient">VI</span>
        </Link>

        <div className="flex items-center gap-5">
          <div className="hidden items-center gap-3 md:flex">
            <span className="text-xs uppercase tracking-[0.2em] text-vice-muted">
              Pre-order on June 25
            </span>
            <span className="btn-platform">PlayStation 5</span>
            <span className="btn-platform">Xbox Series X|S</span>
          </div>
          <Link href="/claim" className="btn-primary px-5 py-2.5 text-xs">
            Claim
          </Link>
        </div>
      </div>
    </header>
  );
}
