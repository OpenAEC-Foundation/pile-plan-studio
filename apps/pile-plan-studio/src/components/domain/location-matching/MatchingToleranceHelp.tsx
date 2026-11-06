import {useTranslation} from "react-i18next";
import {IconButton} from "../../../openaec/react/src/index";

export default function MatchingToleranceHelp(){
  const {t}=useTranslation("common");const text=t("matchingEditor.toleranceHelp");
  return <span className="matching-help"><IconButton small icon="ui.about" className="matching-help-trigger" label={text}
    data-oa-tip={undefined} data-tooltip={text}/></span>;
}
