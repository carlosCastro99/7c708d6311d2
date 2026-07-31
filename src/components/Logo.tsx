interface LogoProps {
  size?: number
}

// A simple clipboard-with-checkmark mark -- inventory/checklist themed,
// drawn from scratch (not any real company's branding). Uses currentColor
// so it inherits whatever text color its container sets.
export default function Logo({ size = 28 }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="2" fill="currentColor" opacity="0.18" />
      <rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="1.4" width="6" height="3" rx="1" fill="currentColor" />
      <path d="M8.5 12.5L10.5 14.5L15.5 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
