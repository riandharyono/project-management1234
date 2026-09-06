export function BrandMark({ size = 28, className = "" }) {
  return (
    <svg className={`ns-mark ${className}`} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="currentColor" opacity="0.12" />
      <path fill="currentColor" d="M16 3.2l2.1 8.4 8.7 2.4-8.7 2.4-2.1 8.4-2.1-8.4-8.7-2.4 8.7-2.4z" />
    </svg>
  );
}
