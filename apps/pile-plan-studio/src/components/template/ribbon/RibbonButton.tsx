import type { ReactNode } from "react";
import { Button } from "../../../openaec/react/src/index";

interface RibbonButtonProps {
  icon: ReactNode;
  label: string;
  title?: string;
  ariaLabel?: string;
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
  ariaLabel,
  className,
  size = "large",
  active,
  disabled,
  wide,
  onClick,
}: RibbonButtonProps) {
  return (
    <Button kind="quiet"
      aria-pressed={active}
      className={`ribbon-btn${size === "small" ? " small" : ""}${size === "medium" ? " medium" : ""}${wide ? " wide" : ""}${active ? " active" : ""}${className ? ` ${className}` : ""}`}
      aria-label={ariaLabel}
      data-tooltip={title?.trim() && title.trim() !== label.trim() ? title : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="ribbon-btn-icon" aria-hidden="true">{icon}</span>
      <span className="ribbon-btn-label">{label}</span>
    </Button>
  );
}
