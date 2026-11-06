import {useLoadDirection} from "../../../app/derived-state/LoadDirectionContext.tsx";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectState } from "../../../domain/project/projectState.ts";
import { switchRightPanelMode, type RightPanelMode } from "../../../domain/workspace/selectionState.ts";
import { infoIcon } from "../../template/ribbon/icons.ts";
import ThemedNumberInput from "../../template/ThemedNumberInput.tsx";
import { commitNumberDraft } from "./numberInputModel.ts";
import { Button, Heading } from "../../../openaec/react/src/index";
import { NumberField } from "../../template/NumberInput.tsx";

import "./panelControls.css";

export function SettingsGroup({ title, muted = false, variant, children }: {
  title: string;
  muted?: boolean;
  variant?: "blueprint";
  children: ReactNode;
}) {
  return (
    <section className={`${variant === "blueprint" ? "blueprint-settings-group" : "settings-group"}${muted ? " is-muted" : ""}`}>
      {variant === "blueprint" ? <Heading>{title}</Heading> : <h3>{title}</h3>}
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
  variant,
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
  variant?: "blueprint";
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

  if (variant === "blueprint") {
    return (
      <div className="blueprint-settings-number">
        <NumberField
          label={label}
          aria-label={ariaLabel}
          type="number"
          className="oa-number"
          disabled={disabled}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          value={draft}
          help={helpText}
          onValueChange={setDraft}
          onBlur={commit}
          onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}
        />
        <span className="blueprint-number-unit oa-secondary">{suffix}</span>
      </div>
    );
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

export function PanelTab({ active, label, mode, state, onActivate, onStateChange }: {
  active: boolean;
  label: string;
  mode: RightPanelMode;
  state: ProjectState;
  onActivate: () => void;
  onStateChange: (nextState: ProjectState) => void;
}) {
  return (
    <Button compact
      className={`right-panel-tab${active && state.rightPanelMode === mode ? " is-active" : ""}`}
      aria-pressed={active && state.rightPanelMode === mode}
      onClick={() => {
        onActivate();
        onStateChange({ ...state, ...switchRightPanelMode(state, mode) });
      }}
    >
      {label}
    </Button>
  );
}



export function ResistanceLabel({ qualifier }: { qualifier?: string }) {
  const {mode}=useLoadDirection();
  return <span className="resistance-label"><i>R</i><sub>{mode==="tension"?"t;d":"c;net;d"}</sub>{qualifier ? " " + qualifier : ""}</span>;
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
  if(column==="Used by"||column==="Governing for"){
    const count=value.match(/^(\d+)\s*\/\s*(\d+)\s+load points$/i);
    if(count)return t(column==="Used by"?"cpts.usedByValue":"cpts.governingForValue",{used:Number(count[1]),total:Number(count[2])});
  }
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
