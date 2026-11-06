import { useEffect, useId, useImperativeHandle, useRef, type InputHTMLAttributes, type PointerEvent, type Ref } from "react";
import { cx } from "./base";
import { Button, type TextFieldProps } from "./controls";
import { stepNumberDraft } from "./numberStep";

export interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type"> {
  value: string;
  onValueChange: (value: string) => void;
  /** Use text for intermediate/decimal-comma drafts; number keeps native validation. */
  type?: "number" | "text";
  compact?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  controlClassName?: string;
  incrementLabel?: string;
  decrementLabel?: string;
}

/** Controlled number input. Parsing and committing application state stay with the caller. */
export function NumberInput({ value, onValueChange, type = "number", compact, inputRef, controlClassName,
  incrementLabel = "Verhogen", decrementLabel = "Verlagen", className, ...props }: NumberInputProps) {
  const input = useRef<HTMLInputElement | null>(null);
  useImperativeHandle(inputRef, () => input.current!, []);
  const latest = useRef({ value, onValueChange, props });
  latest.current = { value, onValueChange, props };
  const delay = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  function stop() {
    if (delay.current !== null) clearTimeout(delay.current);
    if (interval.current !== null) clearInterval(interval.current);
    delay.current = interval.current = null;
  }
  function step(direction: 1 | -1): boolean {
    const state = latest.current, node = input.current;
    if (!node || node.matches(":disabled") || state.props.readOnly) { stop(); return false; }
    const next = stepNumberDraft(state.value, direction, state.props);
    latest.current = { ...state, value: next };
    state.onValueChange(next);
    node.focus({ preventScroll: true });
    return true;
  }
  function start(direction: 1 | -1, event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || props.disabled || props.readOnly) return;
    event.preventDefault(); stop();
    if (!step(direction)) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    delay.current = setTimeout(() => { interval.current = setInterval(() => step(direction), 80); }, 350);
  }
  useEffect(() => {
    const hide = () => { if (document.hidden) stop(); };
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", hide);
    return () => { stop(); window.removeEventListener("blur", stop); document.removeEventListener("visibilitychange", hide); };
  }, []);
  useEffect(() => { if (props.disabled || props.readOnly) stop(); }, [props.disabled, props.readOnly]);
  return <span className={cx("oa-number-input", compact && "oa-number-input--compact", controlClassName)}>
    <input {...props} type={type} inputMode={props.inputMode ?? "decimal"}
      className={cx("oa-field", "oa-number", compact && "oa-field--compact", className)} value={value}
      ref={input}
      onChange={event => onValueChange(event.currentTarget.value)}
      onKeyDown={event => {
        props.onKeyDown?.(event);
        if (!event.defaultPrevented && !event.altKey && !event.ctrlKey && !event.metaKey
          && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
          event.preventDefault(); step(event.key === "ArrowUp" ? 1 : -1);
        }
      }} />
    <span className="oa-number-stepper">
      {([1, -1] as const).map(direction => <Button key={direction} compact kind="quiet" tabIndex={-1}
        aria-label={direction === 1 ? incrementLabel : decrementLabel} disabled={props.disabled || props.readOnly}
        onPointerDown={event => start(direction, event)} onPointerUp={stop} onPointerCancel={stop}
        onPointerLeave={stop} onLostPointerCapture={stop}
        onClick={event => { if (event.detail === 0) step(direction); }}>
        <span className={cx("oa-number-arrow", direction === 1 ? "oa-number-arrow--up" : "oa-number-arrow--down")} aria-hidden="true" />
      </Button>)}
    </span>
  </span>;
}

export type NumberFieldProps = NumberInputProps & Pick<TextFieldProps, "label" | "error" | "help">;

/** Label, help/error association and the same number input used in compact compositions. */
export function NumberField({ label, error, help, id, ...props }: NumberFieldProps) {
  const own = useId(), key = id ?? own;
  return <div className="oa-label">
    <label htmlFor={key}>{label}</label>
    <NumberInput id={key} aria-invalid={error ? true : undefined}
      aria-describedby={error || help ? `${key}-message` : undefined} {...props} />
    {error ? <div className="oa-field-message" id={`${key}-message`}>{error}</div>
      : help ? <div className="oa-secondary" id={`${key}-message`}>{help}</div> : null}
  </div>;
}
