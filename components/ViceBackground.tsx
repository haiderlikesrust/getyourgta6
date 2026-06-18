export function ViceBackground({ withSun = true }: { withSun?: boolean }) {
  return (
    <div className="sunset-bg" aria-hidden>
      {withSun && <div className="vice-sun" />}

      <div
        className="cloud"
        style={{ top: "18%", width: 260, height: 60, animationDuration: "32s" }}
      />
      <div
        className="cloud"
        style={{
          top: "30%",
          width: 200,
          height: 44,
          animationDuration: "24s",
          animationDelay: "6s",
        }}
      />

      {/* original beach / palm silhouette */}
      <div className="skyline">
        <svg
          viewBox="0 0 1440 320"
          preserveAspectRatio="xMidYMax slice"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g fill="#08070b">
            {/* ground */}
            <path d="M0 280 Q 720 250 1440 280 L1440 320 L0 320 Z" />

            {/* left palm */}
            <g transform="translate(150 300)">
              <rect x="-6" y="-150" width="12" height="150" rx="6" />
              <path d="M0 -150 q -55 -18 -98 -2 q 50 -28 98 -16 q -40 -36 -86 -44 q 52 -2 86 30 q -8 -52 8 -86 q 16 34 8 86 q 34 -32 86 -30 q -46 8 -86 44 q 48 -12 98 16 q -43 -16 -98 2 z" />
            </g>

            {/* right palm */}
            <g transform="translate(1290 300)">
              <rect x="-6" y="-170" width="12" height="170" rx="6" />
              <path d="M0 -170 q -55 -18 -98 -2 q 50 -28 98 -16 q -40 -36 -86 -44 q 52 -2 86 30 q -8 -52 8 -86 q 16 34 8 86 q 34 -32 86 -30 q -46 8 -86 44 q 48 -12 98 16 q -43 -16 -98 2 z" />
            </g>

            {/* simple downtown skyline */}
            <g transform="translate(560 300)">
              <rect x="0" y="-110" width="40" height="110" />
              <rect x="48" y="-150" width="32" height="150" />
              <rect x="86" y="-90" width="46" height="90" />
              <rect x="140" y="-180" width="28" height="180" />
              <rect x="176" y="-120" width="40" height="120" />
              <rect x="224" y="-200" width="34" height="200" />
              <rect x="266" y="-100" width="44" height="100" />
            </g>
          </g>
        </svg>
      </div>

      <div className="scene-fade" />
    </div>
  );
}
