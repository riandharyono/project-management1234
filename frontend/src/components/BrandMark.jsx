import { useId } from "react";

export function BrandMark({ size = 28, className = "" }) {
  const uid = useId();
  const gradId = `fs-grad-${uid}`;
  const bgId = `fs-bg-${uid}`;
  const glowId = `fs-glow-${uid}`;
  return (
    <svg className={`ns-mark ${className}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="50" y1="8" x2="50" y2="84" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6FF0FF" />
          <stop offset="0.5" stopColor="#8C9DFF" />
          <stop offset="1" stopColor="#B24BFF" />
        </linearGradient>
        <linearGradient id={bgId} x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#141A3D" />
          <stop offset="1" stopColor="#0A0E24" />
        </linearGradient>
        <filter id={glowId} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="3.2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect width="100" height="100" rx="22" fill={`url(#${bgId})`} />
      <g transform="translate(50 50) scale(0.86) translate(-50 -50)">
        <polygon
          points="50,8 59.40,37.06 89.95,37.02 65.22,54.94 74.69,83.98 50,66 25.31,83.98 34.78,54.94 10.05,37.02 40.60,37.06"
          fill={`url(#${gradId})`} filter={`url(#${glowId})`} />
        <path d="M50 8 L50 66" stroke="#F1FBFF" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
      </g>
    </svg>
  );
}
