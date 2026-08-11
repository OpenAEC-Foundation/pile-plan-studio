import { useState, useRef, useEffect } from "react";

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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

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
      {open && (
        <div aria-label={ariaLabel} className="themed-select-menu" role="listbox">
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
      )}
    </div>
  );
}
