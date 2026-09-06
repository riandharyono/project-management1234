export function BrandMark({ size = 28, className = "" }) {
  return (
    <svg className={`ns-mark ${className}`} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="currentColor" opacity="0.12" />
      <path d="M14 10.5L5 19.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.18" />
      <path d="M16.5 11L7 22.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.32" />
      <path d="M19 12L9 24" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.5" />
      <path fill="currentColor" d="M21 3.6l1.1 4.2 4.3 1.2-4.3 1.2-1.1 4.2-1.1-4.2-4.3-1.2 4.3-1.2z" />
    </svg>
  );
}
