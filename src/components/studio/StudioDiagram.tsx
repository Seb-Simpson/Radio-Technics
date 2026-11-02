/**
 * Simplified, illustrative studio drawing used while real photographs are
 * unavailable. It is NOT a depiction of the real studio. Coordinates match
 * the 1600×900 placeholder hotspots in src/data/hotspots.ts.
 */
export function StudioDiagram({ className }: { className?: string }) {
  const line = "stroke-ink-500";
  const panel = "fill-ink-750";
  return (
    <svg
      viewBox="0 0 1600 900"
      className={className}
      role="img"
      aria-label="Illustrative studio layout (not the real studio)"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="rt-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141a1e" />
          <stop offset="1" stopColor="#10151a" />
        </linearGradient>
        <linearGradient id="rt-desk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#222b31" />
          <stop offset="1" stopColor="#161c20" />
        </linearGradient>
        <pattern id="rt-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="#1b2328" strokeWidth="1" />
        </pattern>
      </defs>

      {/* Wall and floor */}
      <rect width="1600" height="900" fill="url(#rt-wall)" />
      <rect width="1600" height="600" fill="url(#rt-grid)" opacity="0.6" />

      {/* Camera on wall bracket */}
      <g>
        <rect x="790" y="40" width="20" height="40" className={panel} />
        <rect x="745" y="78" width="110" height="70" rx="12" className={`${panel} ${line}`} strokeWidth="3" />
        <circle cx="800" cy="113" r="24" className="fill-ink-900 stroke-ink-400" strokeWidth="3" />
        <circle cx="800" cy="113" r="10" className="fill-ink-700" />
        <circle cx="840" cy="92" r="4" className="fill-alert-400" opacity="0.8" />
      </g>

      {/* Speakers on stands */}
      {[200, 1170].map((x) => (
        <g key={x}>
          <rect x={x + 50} y="440" width="10" height="160" className="fill-ink-700" />
          <rect x={x} y="250" width="110" height="190" rx="10" className={`${panel} ${line}`} strokeWidth="3" />
          <circle cx={x + 55} cy="300" r="20" className="fill-ink-850 stroke-ink-500" strokeWidth="3" />
          <circle cx={x + 55} cy="380" r="38" className="fill-ink-850 stroke-ink-500" strokeWidth="3" />
          <circle cx={x + 55} cy="380" r="14" className="fill-ink-700" />
        </g>
      ))}

      {/* Screen A — playout (stylised list) */}
      <g>
        <rect x="595" y="420" width="20" height="60" className="fill-ink-700" />
        <rect x="470" y="230" width="270" height="190" rx="8" className="fill-ink-850 stroke-ink-500" strokeWidth="3" />
        <rect x="485" y="246" width="240" height="22" rx="3" className="fill-signal-900" />
        <rect x="492" y="253" width="120" height="8" rx="2" className="fill-signal-400" opacity="0.8" />
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <rect x="485" y={280 + i * 26} width="240" height="18" rx="3" className="fill-ink-750" />
            <rect x="492" y={286 + i * 26} width={150 - i * 14} height="6" rx="2" className="fill-ink-500" />
          </g>
        ))}
      </g>

      {/* Screen B — computer */}
      <g>
        <rect x="885" y="420" width="20" height="60" className="fill-ink-700" />
        <rect x="765" y="230" width="270" height="190" rx="8" className="fill-ink-850 stroke-ink-500" strokeWidth="3" />
        <rect x="781" y="246" width="238" height="158" rx="3" className="fill-ink-800" />
        <rect x="795" y="262" width="90" height="60" rx="3" className="fill-ink-700" />
        <rect x="895" y="262" width="110" height="10" rx="2" className="fill-ink-600" />
        <rect x="895" y="280" width="80" height="10" rx="2" className="fill-ink-600" />
      </g>

      {/* Level meters */}
      <g>
        <rect x="1058" y="250" width="84" height="170" rx="6" className="fill-ink-850 stroke-ink-500" strokeWidth="3" />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect x={1072 + i * 22} y="266" width="12" height="140" rx="2" className="fill-ink-750" />
            <rect x={1072 + i * 22} y={306 + i * 18} width="12" height={100 - i * 18} rx="2" className="fill-signal-500" opacity="0.85" />
            <rect x={1072 + i * 22} y={296 + i * 18} width="12" height="8" rx="2" className="fill-caution-400" opacity="0.8" />
          </g>
        ))}
      </g>

      {/* Desk */}
      <path d="M40 600 H1360 L1400 900 H0 Z" fill="url(#rt-desk)" />
      <path d="M40 600 H1360" className="stroke-ink-600" strokeWidth="3" />

      {/* Presenter mic on arm */}
      <g>
        <path d="M300 600 L320 520 L395 470" fill="none" className="stroke-ink-600" strokeWidth="8" strokeLinecap="round" />
        <rect x="360" y="405" width="64" height="120" rx="30" transform="rotate(-20 392 465)" className="fill-ink-700 stroke-ink-400" strokeWidth="3" />
        <path d="M368 430 h52 M366 448 h52 M364 466 h52" className="stroke-ink-500" strokeWidth="3" transform="rotate(-20 392 465)" />
      </g>

      {/* Guest mic on arm */}
      <g>
        <path d="M1180 600 L1160 560 L1100 530" fill="none" className="stroke-ink-600" strokeWidth="8" strokeLinecap="round" />
        <rect x="1058" y="458" width="64" height="120" rx="30" transform="rotate(20 1090 518)" className="fill-ink-700 stroke-ink-400" strokeWidth="3" />
        <path d="M1062 482 h56 M1062 500 h56 M1062 518 h56" className="stroke-ink-500" strokeWidth="3" transform="rotate(20 1090 518)" />
      </g>

      {/* Mixing console */}
      <g>
        <path d="M490 625 H1010 L1025 800 H475 Z" className="fill-ink-800 stroke-ink-500" strokeWidth="3" />
        {Array.from({ length: 12 }, (_, i) => (
          <g key={i}>
            <circle cx={520 + i * 42} cy="652" r="8" className="fill-ink-700 stroke-ink-500" strokeWidth="2" />
            <circle cx={520 + i * 42} cy="680" r="8" className="fill-ink-700 stroke-ink-500" strokeWidth="2" />
            <rect x={516 + i * 42} y="705" width="8" height="78" rx="3" className="fill-ink-900" />
            <rect x={508 + i * 42} y={740 - ((i * 37) % 30)} width="24" height="14" rx="3" className="fill-ink-300" />
          </g>
        ))}
      </g>

      {/* Green button */}
      <g>
        <rect x="1080" y="672" width="80" height="62" rx="10" className="fill-ink-800 stroke-ink-500" strokeWidth="3" />
        <circle cx="1120" cy="700" r="22" fill="#3a9d5d" stroke="#5cc282" strokeWidth="3" />
      </g>

      {/* Headphones */}
      <g>
        <path d="M245 735 C245 655 365 655 365 735" fill="none" className="stroke-ink-500" strokeWidth="10" strokeLinecap="round" />
        <rect x="228" y="712" width="40" height="64" rx="14" className="fill-ink-700 stroke-ink-400" strokeWidth="3" />
        <rect x="342" y="712" width="40" height="64" rx="14" className="fill-ink-700 stroke-ink-400" strokeWidth="3" />
      </g>

      {/* Equipment rack */}
      <g>
        <rect x="1380" y="180" width="180" height="700" rx="6" className="fill-ink-850 stroke-ink-500" strokeWidth="3" />
        {Array.from({ length: 9 }, (_, i) => (
          <g key={i}>
            <rect x="1394" y={198 + i * 74} width="152" height="58" rx="3" className="fill-ink-750 stroke-ink-600" strokeWidth="2" />
            <circle cx="1410" cy={227 + i * 74} r="4" className={i % 3 === 0 ? "fill-signal-400" : "fill-ink-500"} />
            <rect x="1424" y={222 + i * 74} width={60 + ((i * 23) % 50)} height="8" rx="2" className="fill-ink-600" />
          </g>
        ))}
      </g>
    </svg>
  );
}
