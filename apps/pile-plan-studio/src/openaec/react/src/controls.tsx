import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cx, Icon } from "./base";

export type ButtonKind = "primary" | "secondary" | "quiet" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  kind?: ButtonKind;
  /** 24 px instead of 28 px, for panels and the property grid. */
  compact?: boolean;
  /** B2 icon id before the label. */
  icon?: string;
}

/** An app button of 28 px (24 px compact). Dark text on amber for the primary one. */
export function Button({ kind = "secondary", compact, icon, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={cx("oa-button", kind !== "secondary" && `oa-button--${kind}`, compact && "oa-button--compact", className)} {...rest}>
      {icon && <Icon id={icon} />}
      {children}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: string;
  /** Required: the accessible name and the tooltip; an icon alone is no name. */
  label: string;
  /** Shortcut as shown, such as "Ctrl+Z"; also given to assistive technology. */
  keys?: string;
  /** A toggle: true or false makes it aria-pressed. */
  pressed?: boolean;
  small?: boolean;
}

/** A square icon button with a tooltip that also shows on keyboard focus. */
export function IconButton({ icon, label, keys, pressed, small, className, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      className={cx("oa-icon-button", small && "oa-icon-button--small", className)}
      aria-label={label}
      aria-pressed={pressed}
      aria-keyshortcuts={keys?.replace(/Ctrl/g, "Control").replace(/\s/g, "")}
      data-oa-tip={rest.disabled ? undefined : label}
      data-oa-keys={rest.disabled ? undefined : keys}
      {...rest}
    >
      <Icon id={icon} />
    </button>
  );
}

interface FieldFrame {
  label: ReactNode;
  /** An error message under the field; it marks the field invalid. */
  error?: ReactNode;
  /** Help text under the field. */
  help?: ReactNode;
  compact?: boolean;
}

function Frame({ id, label, error, help, children }: FieldFrame & { id: string; children: ReactNode }) {
  return (
    <div className="oa-label">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <div className="oa-field-message" id={`${id}-message`}>{error}</div> : help ? <div className="oa-secondary" id={`${id}-message`}>{help}</div> : null}
    </div>
  );
}

function fieldProps(id: string, frame: FieldFrame, className?: string) {
  return {
    id,
    className: cx("oa-field", frame.compact && "oa-field--compact", className),
    "aria-invalid": frame.error ? true : undefined,
    "aria-describedby": frame.error || frame.help ? `${id}-message` : undefined,
  };
}

export type TextFieldProps = FieldFrame & Omit<InputHTMLAttributes<HTMLInputElement>, "children">;

/** A text field with its label and an optional error or help text under it. */
export function TextField({ label, error, help, compact, id, className, ...rest }: TextFieldProps) {
  const own = useId();
  const key = id ?? own;
  return (
    <Frame id={key} label={label} error={error} help={help}>
      <input {...fieldProps(key, { label, error, help, compact }, className)} {...rest} />
    </Frame>
  );
}

export type TextAreaProps = FieldFrame & TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextArea({ label, error, help, compact, id, className, ...rest }: TextAreaProps) {
  const own = useId();
  const key = id ?? own;
  return (
    <Frame id={key} label={label} error={error} help={help}>
      <textarea {...fieldProps(key, { label, error, help, compact }, className)} {...rest} />
    </Frame>
  );
}

export interface Option {
  value: string;
  label: string;
}

export type SelectProps = FieldFrame & Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & { options: (string | Option)[] };

/** A native list box, so keyboard and screen readers work as everywhere. */
export function Select({ label, error, help, compact, id, className, options, ...rest }: SelectProps) {
  const own = useId();
  const key = id ?? own;
  return (
    <Frame id={key} label={label} error={error} help={help}>
      <select {...fieldProps(key, { label, error, help, compact }, className)} {...rest}>
        {options.map((o) => (typeof o === "string" ? { value: o, label: o } : o)).map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Frame>
  );
}

type Choice = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> & { label: ReactNode };

export function Checkbox({ label, className, ...rest }: Choice) {
  return <label className={cx("oa-check", className)}><input type="checkbox" {...rest} /> {label}</label>;
}

export function Radio({ label, className, ...rest }: Choice) {
  return <label className={cx("oa-check", className)}><input type="radio" {...rest} /> {label}</label>;
}

/** An on/off switch: a checkbox with role switch, so it reads as "aan" or "uit". */
export function Switch({ label, className, ...rest }: Choice) {
  return <label className={cx("oa-switch", className)}><input type="checkbox" role="switch" {...rest} /> {label}</label>;
}

export function Slider({ label, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string }) {
  return <input type="range" className={cx("oa-slider", className)} aria-label={label} {...rest} />;
}

/** A progress bar; without `value` it is indeterminate. */
export function Progress({ label, value, max = 100, className }: { label: string; value?: number; max?: number; className?: string }) {
  const width = value === undefined ? undefined : `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
  return (
    <div className={cx("oa-progress", className)} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <span style={{ width }} />
    </div>
  );
}
