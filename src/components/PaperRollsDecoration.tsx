// Decorative illustration of stacked/piled paper rolls, viewed end-on, with
// radial-gradient shading, highlights, and a drop shadow for a 3D look.
// Original artwork, not any real company's logo or trademark -- just a
// generic warehouse/paper-industry motif for a paper-manufacturing customer.
export default function PaperRollsDecoration() {
  return (
    <svg
      className="paper-rolls-decoration"
      width="150"
      height="110"
      viewBox="0 0 150 110"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="rollShadeA" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#F6E7C8" />
          <stop offset="60%" stopColor="#DEB980" />
          <stop offset="100%" stopColor="#A97B3F" />
        </radialGradient>
        <radialGradient id="rollShadeB" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#F1DDB1" />
          <stop offset="60%" stopColor="#D2A868" />
          <stop offset="100%" stopColor="#9C7038" />
        </radialGradient>
        <radialGradient id="rollShadeC" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#FBF1DA" />
          <stop offset="60%" stopColor="#E8CB98" />
          <stop offset="100%" stopColor="#B68B4C" />
        </radialGradient>
        <radialGradient id="coreShade" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#C99A5C" />
          <stop offset="100%" stopColor="#8A6230" />
        </radialGradient>
        <filter id="rollDropShadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#4a3216" floodOpacity="0.35" />
        </filter>
      </defs>

      <g filter="url(#rollDropShadow)">
        {/* bottom-left roll */}
        <circle cx="36" cy="74" r="30" fill="url(#rollShadeA)" stroke="#8A6230" strokeWidth="1.5" />
        <circle cx="36" cy="74" r="11" fill="url(#coreShade)" />
        <ellipse cx="26" cy="62" rx="9" ry="5" fill="#FFFFFF" opacity="0.35" />

        {/* bottom-right roll */}
        <circle cx="112" cy="74" r="30" fill="url(#rollShadeB)" stroke="#8A6230" strokeWidth="1.5" />
        <circle cx="112" cy="74" r="11" fill="url(#coreShade)" />
        <ellipse cx="102" cy="62" rx="9" ry="5" fill="#FFFFFF" opacity="0.3" />

        {/* top-left roll, nested in the gap */}
        <circle cx="55" cy="36" r="25" fill="url(#rollShadeC)" stroke="#8A6230" strokeWidth="1.5" />
        <circle cx="55" cy="36" r="9" fill="url(#coreShade)" />
        <ellipse cx="47" cy="26" rx="7" ry="4" fill="#FFFFFF" opacity="0.4" />

        {/* top-right roll */}
        <circle cx="100" cy="32" r="21" fill="url(#rollShadeA)" stroke="#8A6230" strokeWidth="1.5" />
        <circle cx="100" cy="32" r="7" fill="url(#coreShade)" />
        <ellipse cx="93" cy="24" rx="6" ry="3.5" fill="#FFFFFF" opacity="0.4" />
      </g>
    </svg>
  )
}
