"use client";

import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { ContractAddress, XIcon } from "./ContractAddress";
import { Logo } from "./Logo";
import { useStats } from "./site-data";

export function Footer() {
  const { stats } = useStats();
  const site = stats?.site;

  return (
    <footer className="relative bg-ink px-5 pb-10 pt-16 sm:px-8">
      <div className="horizon-rule absolute inset-x-0 top-0" />
      <div className="mx-auto max-w-[1320px]">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="max-w-md">
            <Logo />
            <p className="mt-5 text-sm leading-relaxed text-haze">
              Unofficial fan-run giveaway. Not affiliated with, endorsed by or
              connected to Rockstar Games, Take-Two Interactive, Sony Interactive
              Entertainment, Microsoft or any gift card retailer. All trademarks
              belong to their owners and are used only to describe the prize.
            </p>
          </div>

          <div className="flex gap-14">
            <div className="flex flex-col gap-2.5">
              <p className="label text-gold">Site</p>
              <FooterLink href="/#enter">Get in</FooterLink>
              <FooterLink href="/#pot">The pot</FooterLink>
              <FooterLink href="/#winners">Winners</FooterLink>
              <FooterLink href="/claim">Claim a win</FooterLink>
            </div>
            <div className="flex flex-col gap-2.5">
              <p className="label text-gold">Coin</p>
              <a
                href={BRAND.xUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-cream/80 transition hover:text-gold"
              >
                <XIcon className="h-3.5 w-3.5" />
                {BRAND.xHandle}
              </a>
              {site?.buyUrl && (
                <FooterLink href={site.buyUrl} external>
                  Buy {site.symbol ?? "the coin"}
                </FooterLink>
              )}
            </div>
          </div>
        </div>

        <ContractAddress variant="plain" className="mt-10" />

        <div className="mt-12 flex flex-col gap-3 border-t border-white/[0.07] pt-6 text-xs leading-relaxed text-haze md:flex-row md:justify-between">
          <p className="max-w-3xl">
            No purchase necessary to enter. Free entry and holder entry are drawn
            from the same pool. Void where prohibited; you are responsible for
            your local rules and taxes. Memecoins are highly volatile and can go
            to zero — nothing here is financial advice.
          </p>
          <p className="shrink-0">© {new Date().getFullYear()} {BRAND.name}</p>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({
  href,
  external,
  children,
}: {
  href: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  const cls = "text-sm text-cream/80 transition hover:text-gold";
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {children}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}
