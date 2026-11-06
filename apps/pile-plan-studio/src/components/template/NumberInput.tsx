import { useTranslation } from "react-i18next";
import { NumberInput as BlueprintNumberInput, NumberField as BlueprintNumberField,
  type NumberInputProps, type NumberFieldProps } from "../../openaec/number-field-preview";
import "../../openaec/openaec-components.css";
import "./NumberInput.css";

export type { NumberInputProps, NumberFieldProps };

export function NumberInput(props: NumberInputProps) {
  const { t } = useTranslation("common");
  return <BlueprintNumberInput incrementLabel={t("numberInput.increment")} decrementLabel={t("numberInput.decrement")} {...props} />;
}
export function NumberField(props: NumberFieldProps) {
  const { t } = useTranslation("common");
  return <BlueprintNumberField incrementLabel={t("numberInput.increment")} decrementLabel={t("numberInput.decrement")} {...props} />;
}
