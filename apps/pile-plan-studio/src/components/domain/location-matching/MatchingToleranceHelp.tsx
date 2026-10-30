import {useTranslation} from "react-i18next";

export default function MatchingToleranceHelp(){
  const {t}=useTranslation("common");const text=t("matchingEditor.toleranceHelp");
  return <span className="matching-help"><button type="button" className="matching-help-trigger" aria-label={text} data-tooltip={text}>
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
      <circle cx="8" cy="8" r="6"/><path d="M8 7v4"/><circle cx="8" cy="4.5" r=".6" fill="currentColor" stroke="none"/>
    </svg>
  </button></span>;
}
