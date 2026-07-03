/** Inline Proto Trading Online wordmark — no network request, never crops. */
export default function ProtoLogoWordmark({ height = 44, className = '' }) {
  const width = Math.round(height * (320 / 56));

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 320 56"
      width={width}
      height={height}
      role="img"
      aria-label="Proto Trading Online"
      className={className}
    >
      <defs>
        <linearGradient id="protoLogoRed" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#b91c1c" />
        </linearGradient>
      </defs>
      <rect x="0" y="4" width="48" height="48" rx="10" fill="url(#protoLogoRed)" />
      <text
        x="24"
        y="36"
        textAnchor="middle"
        fill="#050505"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="28"
        fontWeight="700"
      >
        &#937;
      </text>
      <text
        x="62"
        y="24"
        fill="#ffffff"
        fontFamily="Outfit, Arial, sans-serif"
        fontSize="22"
        fontWeight="800"
        letterSpacing="0.5"
      >
        PROTO
      </text>
      <text
        x="138"
        y="24"
        fill="#ef4444"
        fontFamily="Outfit, Arial, sans-serif"
        fontSize="22"
        fontWeight="800"
        letterSpacing="0.5"
      >
        TRADING
      </text>
      <line x1="62" y1="38" x2="92" y2="38" stroke="#c9a227" strokeWidth="1" />
      <text
        x="152"
        y="38"
        fill="#c9a227"
        fontFamily="Outfit, Arial, sans-serif"
        fontSize="10"
        fontWeight="700"
        letterSpacing="2.4"
      >
        ONLINE
      </text>
      <line x1="212" y1="38" x2="242" y2="38" stroke="#c9a227" strokeWidth="1" />
    </svg>
  );
}
