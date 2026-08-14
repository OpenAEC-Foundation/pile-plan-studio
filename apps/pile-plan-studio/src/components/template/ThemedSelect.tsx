import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { elementLayoutScale, screenToLocal } from "../../domain/uiBaseline.ts";

interface Option {
  value: string;
  label: string;
  disabled?: boolean;
}

interface ThemedSelectProps {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  style?: React.CSSProperties;
  ariaLabel?: string;
  className?: string;
}

export default function ThemedSelect({ value, options, onChange, style, ariaLabel, className }: ThemedSelectProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({ visibility: "hidden" });
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const positionMenu = useCallback(() => {
    const trigger = ref.current;
    if (!trigger) return;

    const triggerButton = trigger.querySelector<HTMLElement>(".themed-select-trigger");
    const triggerFont = getComputedStyle(triggerButton ?? trigger);
    const rect = trigger.getBoundingClientRect();
    const scale = elementLayoutScale(trigger);
    const menuHeight = menuRef.current?.getBoundingClientRect().height ?? 0;
    const opensAbove = menuHeight > 0 && rect.bottom + menuHeight > window.innerHeight && rect.top > menuHeight;
    setMenuStyle({
      left: screenToLocal(rect.left, scale),
      top: screenToLocal(opensAbove ? rect.top - menuHeight - 1 : rect.bottom + 1, scale),
      width: screenToLocal(rect.width, scale),
      fontFamily: triggerFont.fontFamily,
      fontSize: triggerFont.fontSize,
      fontWeight: triggerFont.fontWeight,
      lineHeight: triggerFont.lineHeight,
      visibility: "visible",
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    positionMenu();
    const frame = requestAnimationFrame(positionMenu);
    return () => cancelAnimationFrame(frame);
  }, [open, positionMenu]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const handleViewportChange = () => positionMenu();
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, positionMenu]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className={`themed-select${className ? ` ${className}` : ""}`} ref={ref} style={style}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="themed-select-trigger"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <span className="themed-select-label">{selected?.label ?? value}</span>
        <svg className="themed-select-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2.5 4L5 6.5L7.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && createPortal((
        <div
          aria-label={ariaLabel}
          className="themed-select-menu"
          ref={menuRef}
          role="listbox"
          style={menuStyle}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              aria-selected={value === opt.value}
              className={`themed-select-item${value === opt.value ? " active" : ""}`}
              disabled={opt.disabled}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              role="option"
              type="button"
            >
              {opt.label}
            </button>
          ))}
        </div>
      ), document.body)}
    </div>
  );
}
