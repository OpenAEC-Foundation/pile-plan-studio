import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectState } from "../../../domain/projectState.ts";
import { switchRightPanelMode, type RightPanelMode } from "../../../domain/selectionState.ts";
import { infoIcon } from "../../template/ribbon/icons.ts";
import ThemedNumberInput from "../../template/ThemedNumberInput.tsx";
import { commitNumberDraft } from "../numberInputModel.ts";

export function SettingsGroup({ title, muted = false, children }: {
  title: string;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`settings-group${muted ? " is-muted" : ""}`}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function DraftNumberField({
  ariaLabel,
  disabled = false,
  emptyValue,
  helpText,
  label,
  max,
  min,
  onCommit,
  placeholder,
  step,
  suffix,
  value,
}: {
  ariaLabel: string;
  disabled?: boolean;
  emptyValue: number;
  helpText?: string;
  label: string;
  max?: number;
  min?: number;
  onCommit: (value: number) => void;
  placeholder?: string;
  step: number;
  suffix: string;
  value: number | null;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));

  useEffect(() => {
    setDraft(value === null ? "" : String(value));
  }, [value]);

  function commit() {
    const committed = commitNumberDraft(draft, value, { emptyValue, max, min });
    if (committed === null) {
      setDraft("");
      return;
    }

    setDraft(String(committed));
    if (committed !== value) onCommit(committed);
  }

  return (
    <label className={`settings-number-row${disabled ? " is-muted" : ""}`}>
      <span className="settings-number-label">
        <span>{label}</span>
        {helpText ? (
          <span
            aria-label={helpText}
            className="settings-number-help"
            role="img"
            title={helpText}
            dangerouslySetInnerHTML={{ __html: infoIcon }}
          />
        ) : null}
      </span>
      <ThemedNumberInput
        aria-label={ariaLabel}
        disabled={disabled}
        max={max}
        min={min}
        placeholder={placeholder}
        step={step}
        value={draft}
        onBlur={commit}
        onValueChange={setDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <span className="settings-number-unit">{suffix}</span>
    </label>
  );
}

export function AlgorithmOption({ active, label, sketch, onClick }: {
  active: boolean;
  label: string;
  sketch: "quadrants" | "maximum-angle";
  onClick: () => void;
}) {
  return (
    <button className={`algorithm-option${active ? " is-selected" : ""}`} type="button" aria-pressed={active} onClick={onClick}>
      {sketch === "quadrants" ? <QuadrantSketch /> : <MaximumAngleSketch />}
      <span>{label}</span>
    </button>
  );
}

function QuadrantSketch() {
  return (
    <svg className="algorithm-sketch" viewBox="0 0 120 80" aria-hidden="true">
      <line x1="60" y1="8" x2="60" y2="72" /><line x1="18" y1="40" x2="102" y2="40" />
      <circle className="sketch-load" cx="60" cy="40" r="4" />
      <circle cx="84" cy="18" r="5" /><circle cx="88" cy="62" r="5" />
      <circle cx="34" cy="20" r="5" /><circle cx="30" cy="60" r="5" />
    </svg>
  );
}

function MaximumAngleSketch() {
  return (
    <svg className="algorithm-sketch" viewBox="0 0 120 80" aria-hidden="true">
      <path className="sketch-arc" d="M 76 24 A 24 24 0 0 1 76 56" />
      <line x1="60" y1="40" x2="96" y2="40" /><line x1="60" y1="40" x2="78" y2="15" />
      <line x1="60" y1="40" x2="78" y2="65" /><circle className="sketch-load" cx="60" cy="40" r="4" />
      <circle cx="96" cy="40" r="5" /><circle cx="78" cy="15" r="5" /><circle cx="78" cy="65" r="5" />
    </svg>
  );
}

export function PanelTab({ active, label, mode, state, onActivate, onStateChange }: {
  active: boolean;
  label: string;
  mode: RightPanelMode;
  state: ProjectState;
  onActivate: () => void;
  onStateChange: (nextState: ProjectState) => void;
}) {
  return (
    <button
      className={`right-panel-tab${active && state.rightPanelMode === mode ? " is-active" : ""}`}
      type="button"
      onClick={() => {
        onActivate();
        onStateChange({ ...state, ...switchRightPanelMode(state, mode) });
      }}
    >
      {label}
    </button>
  );
}



export function ResistanceLabel({ qualifier }: { qualifier?: string }) {
  return <span className="resistance-label"><i>R</i><sub>c;net;d</sub>{qualifier ? " " + qualifier : ""}</span>;
}

export function InactiveLabel() {
  const { t } = useTranslation("rightPanel");
  return <span className="pile-option-inactive-label">{t("pileOptions.inactive")}</span>;
}

export function localizeLoadPointName(name: string, t: ReturnType<typeof useTranslation>["t"]): string {
  const match = name.match(/^Load point\s+(.+)$/i);
  return match ? t("loadPoints.name", { id: match[1] }) : name;
}

export function localizeCptName(name: string, t: ReturnType<typeof useTranslation>["t"]): string {
  const match = name.match(/^CPT\s+(.+)$/i);
  return match ? t("cpts.name") + " " + match[1] : name;
}

export function localizeCptTableValue(column: string, value: string, t: ReturnType<typeof useTranslation>["t"]): string {
  if (column === "Selection") {
    const selectionKeys: Record<string, string> = {
      "upper right": "selection.upperRight", "lower right": "selection.lowerRight",
      "upper left": "selection.upperLeft", "lower left": "selection.lowerLeft",
    };
    const key = selectionKeys[value.toLowerCase()];
    if (key) return t(key);
    const angle = value.match(/^angle(.*)$/i);
    if (angle) return t("selection.angle", { suffix: angle[1] });
    if (value.toLowerCase() === "nearest") return t("selection.nearest");
    const manual = value.match(/^manual(?:\s*(\d+))?$/i);
    if (manual) return t("selection.manual", { suffix: manual[1] ? " " + manual[1] : "" });
  }
  return value;
}
