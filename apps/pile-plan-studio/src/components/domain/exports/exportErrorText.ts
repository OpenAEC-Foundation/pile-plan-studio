import type {TFunction} from "i18next";

export function exportErrorText(reason:unknown,t:TFunction):string{
  const code=reason instanceof Error?reason.message:typeof reason==="string"?reason:"";
  const key=`exportTools.errors.${code}`;
  return t(key,{defaultValue:t("exportTools.error")});
}
