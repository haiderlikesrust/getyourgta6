import Link from "next/link";
import { Band } from "@/components/Band";
import { EntryTicket } from "@/components/EntryTicket";
import { Faq } from "@/components/Faq";
import { Footer } from "@/components/Footer";
import { HeroActions, HeroFacts, HeroKicker } from "@/components/HeroActions";
import { HowItWorks } from "@/components/HowItWorks";
import { Nav } from "@/components/Nav";
import { Pot } from "@/components/Pot";
import { Reveal } from "@/components/Reveal";
import { SunsetScene } from "@/components/SunsetScene";
import { TestModeTicker } from "@/components/TestModeTicker";
import { WaysIn } from "@/components/WaysIn";
import { Winners } from "@/components/Winners";
import { DRAW_INTERVAL_MINUTES } from "@/lib/brand";

export default function HomePage() {
  return (
    <>
      <Nav />

      <main>
        {/* ------------------------------ hero ------------------------------ */}
        <section className="relative flex min-h-[100svh] items-center overflow-hidden pb-24 pt-[calc(var(--nav-h)+2.5rem)]">
          <SunsetScene />

          <div className="relative z-10 mx-auto grid w-full max-w-[1320px] items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <HeroKicker />

              <h1 className="h-display rise rise-2 mt-6 text-[clamp(3.7rem,8.6vw,8rem)] drop-shadow-[0_6px_30px_rgba(10,5,18,0.55)]">
                <span className="block whitespace-nowrap">Your GTA&nbsp;6.</span>
                <span className="relative block whitespace-nowrap">
                  <span className="text-sunset">On the</span>{" "}
                  <span className="script neon-pink relative -top-[0.04em] inline-block -rotate-6 text-[0.92em] leading-none">
                    house
                  </span>
                </span>
              </h1>

              <p className="rise rise-3 mt-7 max-w-xl text-lg leading-relaxed text-cream/85 sm:text-xl">
                The pot is checked every {DRAW_INTERVAL_MINUTES} minutes. The
                moment it can cover a $100 PlayStation or Xbox gift card, one
                wallet walks away with it. Entering is free. Holding the coin
                stacks the odds.
              </p>

              <HeroActions />
              <HeroFacts />
            </div>

            <div className="rise rise-4 flex justify-center lg:justify-end">
              <div className="w-full max-w-[430px] lg:rotate-2">
                <EntryTicket />
              </div>
            </div>
          </div>
        </section>

        <Band />
        <WaysIn />
        <Pot />
        <HowItWorks />
        <Winners />
        <Faq />

        {/* ------------------------------ closer ------------------------------ */}
        <section className="relative overflow-hidden px-5 py-32 sm:px-8 sm:py-44">
          <SunsetScene id="closer" shade={false} />
          <div className="absolute inset-0 bg-ink/45" aria-hidden />
          <Reveal className="relative z-10 mx-auto max-w-4xl text-center">
            <p className="script neon-pink -rotate-3 text-5xl sm:text-6xl">wish you were here</p>
            <h2 className="h-display mt-4 text-[clamp(3.4rem,10vw,8rem)] drop-shadow-[0_6px_30px_rgba(10,5,18,0.6)]">
              The next name
              <br />
              could be <span className="text-sunset">yours.</span>
            </h2>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <a href="#enter" className="btn btn-hot">
                Get your ticket
              </a>
              <Link href="/claim" className="btn btn-ghost">
                Already won? Claim
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      <Footer />
      <TestModeTicker />
    </>
  );
}
