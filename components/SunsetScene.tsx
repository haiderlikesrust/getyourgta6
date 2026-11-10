/**
 * Original golden-hour coastline, drawn entirely in SVG: sky, sun, haze,
 * two skyline layers with lit windows, water with a shimmering sun path,
 * and feathered palm silhouettes. Deterministic (no Math.random) so the
 * server and client render identical markup.
 */

const W = 1600;
const H = 900;
const HORIZON = 610;

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Small deterministic PRNG so the skyline is stable between renders. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Building {
  x: number;
  w: number;
  h: number;
  /** stepped crown / antenna */
  top: 0 | 1 | 2;
}

function skyline(seed: number, minH: number, maxH: number, gap: number): Building[] {
  const rand = seeded(seed);
  const out: Building[] = [];
  let x = -20;
  while (x < W + 20) {
    const w = 26 + rand() * 54;
    // keep the middle low so the sun sits in a gap between two districts
    const centre = Math.abs(x + w / 2 - W / 2) / (W / 2);
    const lift = Math.min(1, Math.max(0.12, (centre - 0.14) * 1.9));
    const h = minH + rand() * (maxH - minH) * lift;
    const roll = rand();
    out.push({ x: r1(x), w: r1(w), h: r1(h), top: roll > 0.82 ? 2 : roll > 0.55 ? 1 : 0 });
    x += w + rand() * gap;
  }
  return out;
}

const FAR = skyline(7, 26, 150, 10);
const NEAR = skyline(41, 34, 235, 22);

function buildingPath(b: Building): string {
  const y = HORIZON - b.h;
  if (b.top === 1) {
    const inset = b.w * 0.22;
    return `M${b.x},${HORIZON}V${r1(y + 14)}H${r1(b.x + inset)}V${r1(y)}H${r1(b.x + b.w - inset)}V${r1(y + 14)}H${r1(b.x + b.w)}V${HORIZON}Z`;
  }
  if (b.top === 2) {
    const mid = b.x + b.w / 2;
    return `M${b.x},${HORIZON}V${r1(y)}H${r1(mid - 2)}V${r1(y - 26)}H${r1(mid + 2)}V${r1(y)}H${r1(b.x + b.w)}V${HORIZON}Z`;
  }
  return `M${b.x},${HORIZON}V${r1(y)}H${r1(b.x + b.w)}V${HORIZON}Z`;
}

const FAR_PATH = FAR.map(buildingPath).join("");
const NEAR_PATH = NEAR.map(buildingPath).join("");

/* ------------------------------ palms ------------------------------ */

interface Frond {
  spine: string;
  leaves: string;
}

/** One feathered frond: a drooping spine with tapered leaflets on both sides. */
function frond(angleDeg: number, length: number, droop: number, leaf: number): Frond {
  const a = (angleDeg * Math.PI) / 180;
  const ex = Math.cos(a) * length;
  const ey = Math.sin(a) * length + droop;
  const cx = Math.cos(a) * length * 0.52;
  const cy = Math.sin(a) * length * 0.52 - length * 0.2;

  let leaves = "";
  for (let t = 0.07; t <= 1.0001; t += 0.034) {
    const u = 1 - t;
    const x = 2 * u * t * cx + t * t * ex;
    const y = 2 * u * t * cy + t * t * ey;
    const dx = 2 * (1 - 2 * t) * cx + 2 * t * ex;
    const dy = 2 * (1 - 2 * t) * cy + 2 * t * ey;
    const len = Math.hypot(dx, dy) || 1;
    const tx = dx / len;
    const ty = dy / len;
    const nx = -ty;
    const ny = tx;
    const size = leaf * Math.min(1, t * 5) * Math.pow(1 - t, 0.55) + 3;
    const sweep = size * 0.55;
    const sag = size * 0.42;
    leaves +=
      `M${r1(x + nx * size + tx * sweep)},${r1(y + ny * size + ty * sweep + sag)}` +
      `L${r1(x)},${r1(y)}` +
      `L${r1(x - nx * size + tx * sweep)},${r1(y - ny * size + ty * sweep + sag)}`;
  }

  return { spine: `M0,0Q${r1(cx)},${r1(cy)} ${r1(ex)},${r1(ey)}`, leaves };
}

const CROWN: Array<[number, number, number]> = [
  // angle, length, droop
  [-196, 150, 74],
  [-170, 172, 52],
  [-146, 168, 26],
  [-120, 150, 8],
  [-96, 138, 0],
  [-72, 150, 6],
  [-46, 170, 24],
  [-20, 176, 50],
  [8, 152, 72],
  [-232, 96, 70],
  [46, 96, 66],
];

const FRONDS = CROWN.map(([angle, length, droop]) => frond(angle, length, droop, 30));
const FROND_SPINES = FRONDS.map((f) => f.spine).join("");
const FROND_LEAVES = FRONDS.map((f) => f.leaves).join("");

function Palm({
  x,
  y,
  height,
  lean,
  scale = 1,
  delay = 0,
}: {
  x: number;
  y: number;
  height: number;
  lean: number;
  scale?: number;
  delay?: number;
}) {
  const h = height;
  const trunk =
    `M-9,0C-8,${r1(-h * 0.38)} ${r1(lean * 0.5 - 9)},${r1(-h * 0.72)} ${r1(lean - 5)},${-h}` +
    `L${r1(lean + 5)},${-h}C${r1(lean * 0.5 + 8)},${r1(-h * 0.72)} 11,${r1(-h * 0.38)} 11,0Z`;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d={trunk} />
      <g transform={`translate(${lean} ${-h})`}>
        <g className="palm-crown" style={{ animationDelay: `${delay}s` }}>
          <circle r="9" />
          <path d={FROND_SPINES} fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
          <path d={FROND_LEAVES} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>
    </g>
  );
}

/* ------------------------------ scene ------------------------------ */

const SHIMMER = Array.from({ length: 15 }, (_, i) => {
  const y = HORIZON + 10 + i * i * 0.95 + i * 6;
  const w = 250 - i * 9 + (i % 3) * 26;
  return { y: r1(y), w: r1(w), h: r1(2.6 + i * 0.5), o: r1(0.95 - i * 0.045) };
});

const STARS = (() => {
  const rand = seeded(99);
  return Array.from({ length: 46 }, () => ({
    x: r1(rand() * W),
    y: r1(rand() * 250),
    r: r1(0.6 + rand() * 1.2),
    o: r1(0.25 + rand() * 0.6),
  }));
})();

export function SunsetScene({
  shade = true,
  id = "hero",
}: {
  /** darken the left side for legible headline text */
  shade?: boolean;
  /** unique prefix so several scenes can share a page */
  id?: string;
}) {
  const u = (name: string) => `${id}-${name}`;
  const ref = (name: string) => `url(#${u(name)})`;

  return (
    <div className="scene" aria-hidden>
      <svg
        className="scene__svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMax slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={u("sky")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0d0524" />
            <stop offset="0.24" stopColor="#2c0f57" />
            <stop offset="0.48" stopColor="#8a1c7c" />
            <stop offset="0.68" stopColor="#e63f6f" />
            <stop offset="0.86" stopColor="#ff8a3d" />
            <stop offset="1" stopColor="#ffd98a" />
          </linearGradient>
          <radialGradient id={u("glow")} cx={W / 2} cy={HORIZON - 10} r="620" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff3c9" stopOpacity="0.95" />
            <stop offset="0.2" stopColor="#ffc861" stopOpacity="0.6" />
            <stop offset="0.55" stopColor="#ff5f8f" stopOpacity="0.2" />
            <stop offset="1" stopColor="#ff5f8f" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={u("sun")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fffbe6" />
            <stop offset="0.5" stopColor="#ffdc73" />
            <stop offset="1" stopColor="#ff9a4a" />
          </linearGradient>
          <linearGradient id={u("water")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ff9d5c" />
            <stop offset="0.1" stopColor="#e2476f" />
            <stop offset="0.36" stopColor="#6d1a70" />
            <stop offset="0.7" stopColor="#1f0e38" />
            <stop offset="1" stopColor="#0a0512" />
          </linearGradient>
          <linearGradient id={u("far")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7a2a86" />
            <stop offset="1" stopColor="#c2456f" />
          </linearGradient>
          <linearGradient id={u("near")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1c0a36" />
            <stop offset="1" stopColor="#4a1552" />
          </linearGradient>
          <pattern id={u("windows")} width="14" height="18" patternUnits="userSpaceOnUse">
            <rect x="2" y="3" width="2.2" height="3.2" fill="#ffd98a" opacity="0.9" />
            <rect x="9" y="11" width="2.2" height="3.2" fill="#ffb3d6" opacity="0.6" />
            <rect x="9" y="3" width="2.2" height="3.2" fill="#ffd98a" opacity="0.25" />
          </pattern>
          <clipPath id={u("above")}>
            <rect width={W} height={HORIZON} />
          </clipPath>
          <clipPath id={u("near-clip")}>
            <path d={NEAR_PATH} />
          </clipPath>
          <filter id={u("soft")} x="-20%" y="-60%" width="140%" height="220%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
          <filter id={u("haze")} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
        </defs>

        {/* sky */}
        <rect width={W} height={HORIZON + 2} fill={ref("sky")} />
        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.o} />
        ))}
        <rect className="sun-pulse" width={W} height={HORIZON + 2} fill={ref("glow")} />

        {/* streak clouds, lit from below */}
        <g filter={ref("soft")}>
          <g className="cloud-drift">
            <ellipse cx="360" cy="250" rx="330" ry="15" fill="#ff7fa8" opacity="0.5" />
            <ellipse cx="470" cy="278" rx="230" ry="10" fill="#ffb07a" opacity="0.5" />
            <ellipse cx="1270" cy="330" rx="300" ry="13" fill="#ff8f8f" opacity="0.5" />
          </g>
          <g className="cloud-drift slow">
            <ellipse cx="1120" cy="190" rx="360" ry="16" fill="#c04aa0" opacity="0.5" />
            <ellipse cx="230" cy="400" rx="280" ry="11" fill="#ffb47a" opacity="0.55" />
            <ellipse cx="900" cy="440" rx="420" ry="9" fill="#ffd08a" opacity="0.55" />
            <ellipse cx="1430" cy="470" rx="250" ry="9" fill="#ffc07a" opacity="0.5" />
          </g>
        </g>

        {/* sun */}
        <g clipPath={ref("above")}>
          <circle cx={W / 2} cy={HORIZON - 24} r="150" fill={ref("sun")} />
        </g>

        {/* skyline */}
        <path d={FAR_PATH} fill={ref("far")} opacity="0.62" filter={ref("haze")} />
        <path d={NEAR_PATH} fill={ref("near")} />
        <rect
          width={W}
          height={HORIZON}
          fill={ref("windows")}
          clipPath={ref("near-clip")}
          opacity="0.75"
        />

        {/* water */}
        <rect y={HORIZON} width={W} height={H - HORIZON} fill={ref("water")} />
        <g transform={`translate(0 ${2 * HORIZON}) scale(1 -1)`} opacity="0.26">
          <path d={NEAR_PATH} fill="#12062b" />
        </g>
        <rect y={HORIZON - 1} width={W} height="2.5" fill="#ffe6ae" opacity="0.7" />
        <g className="shimmer" fill="#ffe6ae">
          {SHIMMER.map((s, i) => (
            <rect
              key={i}
              x={r1(W / 2 - s.w / 2)}
              y={s.y}
              width={s.w}
              height={s.h}
              rx={s.h / 2}
              opacity={s.o}
            />
          ))}
        </g>

        {/* foreground */}
        <g fill="#0a0512" color="#0a0512">
          <path d={`M0,${H}V806C180,772 330,800 470,838C560,862 640,884 700,${H}Z`} />
          <path d={`M${W},${H}V792C1440,760 1290,792 1150,834C1070,858 1000,884 950,${H}Z`} />
          <Palm x={150} y={820} height={420} lean={56} scale={1.18} />
          <Palm x={318} y={846} height={300} lean={-34} scale={0.92} delay={-2.5} />
          <Palm x={52} y={850} height={250} lean={-20} scale={0.8} delay={-4} />
          <Palm x={1462} y={812} height={440} lean={-62} scale={1.22} delay={-1.2} />
          <Palm x={1300} y={846} height={290} lean={38} scale={0.9} delay={-3.4} />
          <Palm x={1566} y={850} height={240} lean={18} scale={0.78} delay={-5} />
        </g>
      </svg>

      {shade && <div className="scene__shade" />}
      <div className="scene__grain" />
      <div className="scene__fade" />
    </div>
  );
}
