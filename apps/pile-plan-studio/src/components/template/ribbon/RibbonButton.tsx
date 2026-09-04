interface RibbonButtonProps {
  icon: string;
  label: string;
  title?: string;
  className?: string;
  size?: "large" | "small" | "medium";
  active?: boolean;
  disabled?: boolean;
  wide?: boolean;
  onClick?: () => void;
}

export default function RibbonButton({
  icon,
  label,
  title,
  className,
  size = "large",
  active,
  disabled,
  wide,
  onClick,
}: RibbonButtonProps) {
  return (
    <button
      aria-pressed={active}
      className={`ribbon-btn${size === "small" ? " small" : ""}${size === "medium" ? " medium" : ""}${wide ? " wide" : ""}${active ? " active" : ""}${className ? ` ${className}` : ""}`}
      title={title || label}
      disabled={disabled}
      onClick={onClick}
    >
      <div
        className="ribbon-btn-icon"
        dangerouslySetInnerHTML={{ __html: icon }}
      />
      <span className="ribbon-btn-label">{label}</span>
    </button>
  );
}
