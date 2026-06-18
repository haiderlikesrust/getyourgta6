import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Marquee } from "@/components/Marquee";
import { RecentWinners, StatsPanel } from "@/components/StatsPanel";
import { TestModeTicker } from "@/components/TestModeTicker";
import { ViceBackground } from "@/components/ViceBackground";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <Header />

      <main>
        {/* ---------- HERO ---------- */}
        <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-24 text-center">
          <ViceBackground />

          <div className="relative z-10 max-w-5xl pb-24">
            <p className="eyebrow rise rise-1 mx-auto mb-6 w-fit">
              Holder Rewards Program
            </p>

            <h1 className="rise rise-2 font-display leading-[0.8] tracking-wide text-white">
              <span className="block text-3xl sm:text-4xl">GRAND THEFT AUTO</span>
              <span className="logo-gradient block text-8xl sm:text-[12rem] md:text-[15rem]">
                VI
              </span>
            </h1>

            <p className="rise rise-3 mt-2 font-display text-3xl tracking-wide text-white sm:text-5xl">
              VICE CITY, <span className="gradient-text">USA.</span>
            </p>

            <p className="rise rise-3 mx-auto mt-7 max-w-2xl text-base leading-relaxed text-white/80 sm:text-lg">
              Every hour the reward wallet is checked. When{" "}
              <span className="text-white">$100+ in SOL</span> accumulates, a random
              pump.fun token holder wins a{" "}
              <span className="text-white">GTA 6 pre-order gift card</span> —
              PlayStation 5 or Xbox Series X|S.
            </p>

            <div className="rise rise-4 mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/claim" className="btn-primary">
                Claim Your Reward
              </Link>
              <a href="#how-it-works" className="btn-secondary">
                How It Works
              </a>
            </div>
          </div>

          <div className="bob absolute bottom-8 left-1/2 z-10 -translate-x-1/2 text-xs uppercase tracking-[0.3em] text-white/80">
            Scroll for more content
          </div>
        </section>

        <Marquee />

        {/* ---------- LIVE POOL ---------- */}
        <section id="pool" className="relative overflow-hidden px-6 py-28">
          <div
            className="warm-glow"
            style={{
              top: "10%",
              left: "12%",
              width: 360,
              height: 360,
              background: "rgba(255, 122, 24, 0.2)",
            }}
          />
          <div className="relative z-10 mx-auto max-w-4xl">
            <div className="mb-12 text-center">
              <p className="eyebrow mx-auto mb-4 w-fit">Live On Chain</p>
              <h2 className="font-display text-4xl tracking-wide text-white sm:text-6xl">
                THE <span className="gradient-text">REWARD POOL</span>
              </h2>
            </div>
            <StatsPanel />
          </div>
        </section>

        {/* ---------- HOW IT WORKS ---------- */}
        <section
          id="how-it-works"
          className="relative overflow-hidden border-y border-white/5 bg-vice-dark px-6 py-28"
        >
          <div className="relative z-10 mx-auto max-w-5xl">
            <div className="mb-16 text-center">
              <p className="eyebrow mx-auto mb-4 w-fit">The Mechanics</p>
              <h2 className="font-display text-4xl tracking-wide text-white sm:text-6xl">
                HOW IT <span className="gradient-text">WORKS</span>
              </h2>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              <StepCard
                number="01"
                title="The Pool Grows"
                description="Trading fees and contributions flow into the reward wallet. Every hour we check if the available balance reaches $100 USD in SOL."
              />
              <StepCard
                number="02"
                title="Random Winner"
                description="When the threshold is met, we snapshot all token holders via Helius and pick a random eligible wallet."
              />
              <StepCard
                number="03"
                title="Claim & Choose"
                description="Winners pick PlayStation or Xbox, send 0.01 SOL to verify their wallet, get refunded, and receive their gift card."
              />
            </div>
          </div>
        </section>

        {/* ---------- RECENT WINNERS ---------- */}
        <section className="relative overflow-hidden px-6 py-28">
          <div className="relative z-10 mx-auto max-w-4xl">
            <div className="mb-12 text-center">
              <p className="eyebrow mx-auto mb-4 w-fit">Hall Of Fame</p>
              <h2 className="font-display text-4xl tracking-wide text-white sm:text-6xl">
                RECENT <span className="gradient-text">WINNERS</span>
              </h2>
            </div>
            <RecentWinners />
          </div>
        </section>

        {/* ---------- CTA ---------- */}
        <section className="relative overflow-hidden px-6 py-28">
          <ViceBackground withSun={false} />
          <div className="relative z-10 mx-auto max-w-2xl text-center">
            <h2 className="font-display text-5xl tracking-wide text-white sm:text-7xl">
              GOT A <span className="gradient-text">WIN?</span>
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-lg text-vice-muted">
              If your wallet was selected, head to the claim page to verify
              ownership and reveal your GTA 6 pre-order gift card.
            </p>
            <Link href="/claim" className="btn-primary mt-10 inline-flex">
              Go To Claim Page
            </Link>
          </div>
        </section>
      </main>

      <Footer />
      <TestModeTicker />
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="card-glass card-neon group rounded-2xl p-8 transition-transform duration-300 hover:-translate-y-2">
      <p className="font-display text-5xl gradient-text">{number}</p>
      <h3 className="mt-5 font-display text-xl tracking-wide text-white">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-vice-muted">
        {description}
      </p>
    </div>
  );
}
