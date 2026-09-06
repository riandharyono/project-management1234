import logoMark from "../assets/logo-mark.png";

export function BrandMark({ size = 28, className = "" }) {
  return (
    <img
      src={logoMark}
      alt=""
      aria-hidden="true"
      className={`ns-mark ${className}`}
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius: size * 0.22, objectFit: "cover" }}
    />
  );
}
