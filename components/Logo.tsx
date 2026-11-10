import { BRAND } from "@/lib/brand";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 40 40" className="h-8 w-8 shrink-0" aria-hidden>
        <defs>
          <linearGradient id="logo-sun" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffd45e" />
            <stop offset="0.55" stopColor="#ff8a3d" />
            <stop offset="1" stopColor="#ff2d8e" />
          </linearGradient>
          <clipPath id="logo-clip">
            <rect width="40" height="21" />
            <rect y="23.5" width="40" height="3" />
            <rect y="29" width="40" height="2.6" />
            <rect y="34" width="40" height="2" />
          </clipPath>
        </defs>
        <circle cx="20" cy="20" r="17" fill="url(#logo-sun)" clipPath="url(#logo-clip)" />
      </svg>
      <span className="font-display text-[1.45rem] font-black italic uppercase leading-none tracking-tight">
        {BRAND.wordmark[0]} <span className="text-sunset">{BRAND.wordmark[1]}</span>
      </span>
    </span>
  );
}
