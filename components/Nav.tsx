"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BRAND } from "@/lib/brand";
import { Logo } from "./Logo";
import { useEntry } from "./site-data";
import { WalletButton } from "./wallet";

const LINKS = [
  { href: "/#enter", label: "Get in" },
  { href: "/#pot", label: "The pot" },
  { href: "/#how", label: "How it works" },
  { href: "/#winners", label: "Winners" },
  { href: "/#faq", label: "FAQ" },
];

export function Nav() {
  const [solid, setSolid] = useState(false);
  const [menu, setMenu] = useState(false);
  const { standing } = useEntry();
  const hasWin = (standing?.unclaimedRewards ?? 0) > 0;

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background,box-shadow,backdrop-filter] duration-300 ${
        solid || menu
          ? "bg-ink/80 shadow-[0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-[var(--nav-h)] max-w-[1320px] items-center gap-6 px-5 sm:px-8">
        <Link href="/" aria-label={`${BRAND.name} — home`} className="shrink-0">
          <Logo />
        </Link>

        <nav className="ml-auto hidden items-center gap-7 lg:flex" aria-label="Sections">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="label text-cream/75 transition hover:text-gold"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 lg:ml-0">
          <Link
            href="/claim"
            className={`label hidden rounded-full px-3.5 py-2 transition sm:inline-flex ${
              hasWin
                ? "bg-gold text-ink"
                : "text-cream/75 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22)] hover:text-gold"
            }`}
          >
            {hasWin ? "You won — claim" : "Claim"}
          </Link>
          <WalletButton />
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full bg-white/10 lg:hidden"
            aria-label="Menu"
            aria-expanded={menu}
            onClick={() => setMenu((v) => !v)}
          >
            <span className="relative block h-3 w-5">
              <span
                className={`absolute inset-x-0 top-0 h-0.5 bg-cream transition ${menu ? "translate-y-[5px] rotate-45" : ""}`}
              />
              <span
                className={`absolute inset-x-0 bottom-0 h-0.5 bg-cream transition ${menu ? "-translate-y-[5px] -rotate-45" : ""}`}
              />
            </span>
          </button>
        </div>
      </div>

      {menu && (
        <nav className="border-t border-white/10 px-5 pb-6 pt-2 lg:hidden" aria-label="Sections">
          {[...LINKS, { href: "/claim", label: "Claim a win" }].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenu(false)}
              className="h-display block border-b border-white/[0.07] py-3 text-3xl"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
