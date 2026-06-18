const ITEMS = [
  "VICE CITY REWARDS",
  "PLAYSTATION 5",
  "GTA VI PRE-ORDER",
  "XBOX SERIES X|S",
  "POWERED BY SOLANA",
  "RANDOM HOLDER DROPS",
];

export function Marquee() {
  const track = (
    <div className="marquee__track">
      {ITEMS.map((item, i) => (
        <span
          key={i}
          className="flex items-center gap-10 font-display text-xl uppercase tracking-widest text-white/80"
        >
          {item}
          <span className="text-vice-pink">✦</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="border-y border-white/10 bg-vice-black/60 py-4 backdrop-blur-sm">
      <div className="marquee">
        {track}
        {track}
      </div>
    </div>
  );
}
