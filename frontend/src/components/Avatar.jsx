import { initials, avatarColor, fileUrl } from "../lib/api";

export function Avatar({ id, name, photo, className = "", style, ...rest }) {
  if (photo) {
    return <img className={`avatar ${className}`} src={fileUrl(photo)} alt={name || ""} style={style} {...rest} />;
  }
  return (
    <span className={`avatar ${className}`} style={{ background: avatarColor(id), ...style }} {...rest}>
      {initials(name)}
    </span>
  );
}
