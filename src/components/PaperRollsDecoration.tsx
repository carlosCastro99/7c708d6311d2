// Decorative illustration of stacked/piled paper rolls, viewed end-on.
// Original artwork, not any real company's logo or trademark -- just a
// generic warehouse/paper-industry motif for a paper-manufacturing customer.
export default function PaperRollsDecoration() {
  return (
    <svg
      className="paper-rolls-decoration"
      width="140"
      height="100"
      viewBox="0 0 140 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* bottom-left roll */}
      <circle cx="34" cy="70" r="28" fill="#E4C79A" stroke="#B8935C" strokeWidth="2" />
      <circle cx="34" cy="70" r="10" fill="#B8935C" />
      {/* bottom-right roll */}
      <circle cx="106" cy="70" r="28" fill="#D8B98A" stroke="#B8935C" strokeWidth="2" />
      <circle cx="106" cy="70" r="10" fill="#B8935C" />
      {/* top-left roll, nested in the gap */}
      <circle cx="52" cy="34" r="24" fill="#F1DDB5" stroke="#B8935C" strokeWidth="2" />
      <circle cx="52" cy="34" r="8" fill="#B8935C" />
      {/* top-right roll */}
      <circle cx="98" cy="30" r="20" fill="#EAD3A3" stroke="#B8935C" strokeWidth="2" />
      <circle cx="98" cy="30" r="7" fill="#B8935C" />
    </svg>
  )
}
