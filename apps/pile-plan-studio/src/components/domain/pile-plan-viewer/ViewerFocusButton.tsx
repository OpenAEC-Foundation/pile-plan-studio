import { useTranslation } from "react-i18next";
import { Button } from "../../../openaec/react/src/index";
import "../../../openaec/openaec-components.css";
import "./ViewerFocusButton.css";

export default function ViewerFocusButton({disabled,onFocusSelection}:{disabled:boolean;onFocusSelection:()=>void}){
  const {t}=useTranslation();
  return <Button className="viewer-focus-selection" disabled={disabled}
    aria-label={t("viewer.focusSelection")} data-tooltip={t("viewer.focusSelection")}
    onKeyDown={event=>event.stopPropagation()} onMouseDown={event=>event.stopPropagation()}
    onClick={event=>{event.stopPropagation();onFocusSelection();}}>
    {t("viewer.focusSelectionLabel")}
  </Button>;
}
