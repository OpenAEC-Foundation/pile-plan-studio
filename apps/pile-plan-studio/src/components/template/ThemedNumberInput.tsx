import { useEffect, useRef, type InputHTMLAttributes, type PointerEvent, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { stepNumericDraft } from "./themedNumberInputModel.ts";
import "./ThemedNumberInput.css";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type" | "value"> & {
  inputRef?: RefObject<HTMLInputElement | null>;
  onValueChange: (value: string) => void;
  value: string;
};

export default function ThemedNumberInput({ inputRef, onValueChange, value, ...inputProps }: Props) {
  const { t } = useTranslation("common");
  const internalRef = useRef<HTMLInputElement | null>(null);
  const repeatDelayRef = useRef<number | null>(null);
  const repeatIntervalRef = useRef<number | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const setInputRef = (node: HTMLInputElement | null) => {
    internalRef.current = node;
    if (inputRef) inputRef.current = node;
  };

  const stepValue = (direction: 1 | -1) => {
    const input = internalRef.current;
    if (!input || input.disabled) return;
    const nextValue = stepNumericDraft(valueRef.current, direction, inputProps);
    valueRef.current = nextValue;
    onValueChange(nextValue);
    input.focus({ preventScroll: true });
  };

  const stopRepeating = () => {
    if (repeatDelayRef.current !== null) window.clearTimeout(repeatDelayRef.current);
    if (repeatIntervalRef.current !== null) window.clearInterval(repeatIntervalRef.current);
    repeatDelayRef.current = null;
    repeatIntervalRef.current = null;
  };

  const startRepeating = (direction: 1 | -1, event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || inputProps.disabled) return;
    event.preventDefault();
    stopRepeating();
    stepValue(direction);
    repeatDelayRef.current = window.setTimeout(() => {
      repeatIntervalRef.current = window.setInterval(() => stepValue(direction), 80);
    }, 350);
  };

  useEffect(() => stopRepeating, []);

  return (
    <span className="themed-number-input">
      <input
        {...inputProps}
        ref={setInputRef}
        type="number"
        value={value}
        onChange={(event) => onValueChange(event.currentTarget.value)}
      />
      <span className="themed-number-stepper">
        <button
          aria-label={t("numberInput.increment")}
          disabled={inputProps.disabled}
          tabIndex={-1}
          type="button"
          onPointerDown={(event) => startRepeating(1, event)}
          onPointerUp={stopRepeating}
          onPointerCancel={stopRepeating}
          onPointerLeave={stopRepeating}
        >
          <span className="themed-number-arrow is-up" aria-hidden="true" />
        </button>
        <button
          aria-label={t("numberInput.decrement")}
          disabled={inputProps.disabled}
          tabIndex={-1}
          type="button"
          onPointerDown={(event) => startRepeating(-1, event)}
          onPointerUp={stopRepeating}
          onPointerCancel={stopRepeating}
          onPointerLeave={stopRepeating}
        >
          <span className="themed-number-arrow is-down" aria-hidden="true" />
        </button>
      </span>
    </span>
  );
}
