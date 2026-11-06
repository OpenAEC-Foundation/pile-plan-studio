import type { ComponentProps } from "react";
import { NumberInput } from "./NumberInput.tsx";

type Props = ComponentProps<typeof NumberInput> & { variant?: "blueprint" };

/** Compatibility adapter; all numeric controls now use the same stepper. */
export default function ThemedNumberInput({ variant: _variant, ...props }: Props) {
  return <NumberInput {...props} controlClassName="themed-number-input" />;
}
