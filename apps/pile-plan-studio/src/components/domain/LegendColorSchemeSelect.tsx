import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  getLegendColorSchemePreview,
  LEGEND_COLOR_SCHEMES,
  type LegendColorScheme,
} from "../../viewer/legendColors.ts";

type Props = {
  value: LegendColorScheme;
  label: string;
  getSchemeLabel: (scheme: LegendColorScheme) => string;
  onChange: (scheme: LegendColorScheme) => void;
};

export default function LegendColorSchemeSelect({ value, label, getSchemeLabel, onChange }: Props) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => LEGEND_COLOR_SCHEMES.indexOf(value));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return (
    <div className="legend-scheme-select" ref={rootRef}>
      <button
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="legend-scheme-trigger"
        type="button"
        onClick={() => {
          setActiveIndex(LEGEND_COLOR_SCHEMES.indexOf(value));
          setOpen((current) => !current);
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{getSchemeLabel(value)}</span>
        <PalettePreview scheme={value} />
        <span aria-hidden="true" className="legend-picker-chevron" />
      </button>
      {open ? (
        <div
          aria-activedescendant={`${listboxId}-${activeIndex}`}
          aria-label={label}
          className="legend-scheme-options"
          id={listboxId}
          role="listbox"
          tabIndex={0}
          onKeyDown={handleListKeyDown}
        >
          {LEGEND_COLOR_SCHEMES.map((scheme, index) => (
            <button
              aria-selected={value === scheme}
              className={index === activeIndex ? "is-active" : ""}
              id={`${listboxId}-${index}`}
              key={scheme}
              role="option"
              type="button"
              onClick={() => selectScheme(scheme)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <span>{getSchemeLabel(scheme)}</span>
              <PalettePreview scheme={scheme} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(LEGEND_COLOR_SCHEMES.indexOf(value));
      requestAnimationFrame(() => document.getElementById(listboxId)?.focus());
    }
  }

  function handleListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const offset = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => (current + offset + LEGEND_COLOR_SCHEMES.length) % LEGEND_COLOR_SCHEMES.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      selectScheme(LEGEND_COLOR_SCHEMES[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  }

  function selectScheme(scheme: LegendColorScheme) {
    onChange(scheme);
    setOpen(false);
  }
}

function PalettePreview({ scheme }: { scheme: LegendColorScheme }) {
  return (
    <span aria-hidden="true" className="legend-palette-preview">
      {getLegendColorSchemePreview(scheme).map((color, index) => (
        <span key={`${color}-${index}`} style={{ backgroundColor: color }} />
      ))}
    </span>
  );
}
