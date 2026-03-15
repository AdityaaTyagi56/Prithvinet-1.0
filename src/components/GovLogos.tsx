import React from 'react';

/** Mission LiFE (Lifestyle for Environment) logo — inline SVG */
export function MissionLifeLogo({ className = '', height = 48 }: { className?: string; height?: number }) {
  return (
    <svg
      viewBox="0 0 110 70"
      height={height}
      width="auto"
      className={className}
      aria-label="Mission LiFE — Lifestyle for Environment"
      role="img"
    >
      {/* Outer circle — earth globe */}
      <circle cx="35" cy="35" r="30" fill="url(#lifeGlobe)" stroke="#1a7a3c" strokeWidth="2" />

      {/* Globe lines */}
      <ellipse cx="35" cy="35" rx="14" ry="30" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
      <line x1="5" y1="35" x2="65" y2="35" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
      <line x1="9" y1="20" x2="61" y2="20" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
      <line x1="9" y1="50" x2="61" y2="50" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />

      {/* Leaf inside globe */}
      <path d="M26 42 Q35 16 44 28 Q38 44 26 42Z" fill="#4ade80" opacity="0.85" />
      <path d="M35 42 L35 28" stroke="#166534" strokeWidth="1" />

      {/* "LiFE" text beside */}
      <text x="70" y="28" fontFamily="Arial, sans-serif" fontSize="16" fontWeight="900" fill="#14532d">Li</text>
      <text x="88" y="28" fontFamily="Arial, sans-serif" fontSize="16" fontWeight="900" fill="#FF9933">F</text>
      <text x="97" y="28" fontFamily="Arial, sans-serif" fontSize="16" fontWeight="900" fill="#14532d">E</text>
      <text x="68" y="40" fontFamily="Arial, sans-serif" fontSize="6" fill="#555" fontWeight="600">Lifestyle for</text>
      <text x="68" y="49" fontFamily="Arial, sans-serif" fontSize="6" fill="#555" fontWeight="600">Environment</text>

      <defs>
        <radialGradient id="lifeGlobe" cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#4fa8d5" />
          <stop offset="50%" stopColor="#1d6fa4" />
          <stop offset="100%" stopColor="#0d4a72" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/** Azadi Ka Amrit Mahotsav logo — inline SVG */
export function AzadiLogo({ className = '', height = 56 }: { className?: string; height?: number }) {
  return (
    <svg
      viewBox="0 0 110 72"
      height={height}
      width="auto"
      className={className}
      aria-label="Azadi Ka Amrit Mahotsav — India @ 75"
      role="img"
    >
      {/* Tricolor background shield */}
      <path d="M55 4 L100 18 L100 52 Q100 66 55 70 Q10 66 10 52 L10 18 Z" fill="#fff" stroke="#ccc" strokeWidth="0.5" />

      {/* Tricolor stripes inside shield */}
      <clipPath id="shieldClip">
        <path d="M55 4 L100 18 L100 52 Q100 66 55 70 Q10 66 10 52 L10 18 Z" />
      </clipPath>
      <rect x="10" y="4" width="90" height="22" fill="#FF9933" clipPath="url(#shieldClip)" />
      <rect x="10" y="26" width="90" height="22" fill="#fff" clipPath="url(#shieldClip)" />
      <rect x="10" y="48" width="90" height="22" fill="#138808" clipPath="url(#shieldClip)" />

      {/* Outer shield border */}
      <path d="M55 4 L100 18 L100 52 Q100 66 55 70 Q10 66 10 52 L10 18 Z" fill="none" stroke="#FF9933" strokeWidth="2" />

      {/* "75" big number in center */}
      <text x="55" y="43" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="22" fontWeight="900"
        fill="#14532d" opacity="0.92">75</text>

      {/* Top text */}
      <text x="55" y="15" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="5.5" fontWeight="700"
        fill="#7a3800" letterSpacing="0.5">AZADI KA AMRIT</text>

      {/* Bottom text */}
      <text x="55" y="61" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="5.5" fontWeight="700"
        fill="#166534" letterSpacing="0.3">MAHOTSAV</text>

      {/* Ashoka Chakra hint */}
      <circle cx="55" cy="35" r="5" fill="none" stroke="#000080" strokeWidth="0.8" opacity="0.4" />
      <circle cx="55" cy="35" r="1" fill="#000080" opacity="0.4" />
    </svg>
  );
}
