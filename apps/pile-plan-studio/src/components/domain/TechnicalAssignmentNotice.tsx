import { useTranslation } from "react-i18next";

import type { ProjectState } from "../../domain/projectState.ts";
import { selectLoadPoint } from "../../domain/selectionState.ts";
import { getTechnicalAssignmentNotice } from "../../domain/technicalAssignmentNotice.ts";
import type { TechnicalAssignmentSnapshot } from "./technicalAssignmentController.ts";

type Props = {
  state: ProjectState;
  assessment: TechnicalAssignmentSnapshot;
  onStateChange: (state: ProjectState) => void;
};

export default function TechnicalAssignmentNotice({ state, assessment, onStateChange }: Props) {
  const { t } = useTranslation("rightPanel");
  if (assessment.status === "unavailable") {
    return (
      <div className="panel-message technical-assignment-notice is-neutral" role="status">
        <strong>{t("technicalNotice.unavailableTitle")}</strong>
        <span>{t("technicalNotice.unavailableExplanation")}</span>
      </div>
    );
  }

  const model = getTechnicalAssignmentNotice({
    selectedLoadPointIds: state.selectedLoadPointIds,
    assessmentStatus: assessment.status,
    issuesByLoadPointId: assessment.issuesByLoadPointId,
  });
  if (!model) return null;

  return (
    <div className={`panel-message technical-assignment-notice ${model.status === "missing_capacity_data" ? "is-warning" : "is-error"}`}>
      <span>{renderCause()}</span>
      <span>{t(`technicalNotice.explanation.${model.status}`)}</span>
      {model.hasMissingCapacityData
        ? <span>{t("technicalNotice.explanation.alsoMissing")}</span>
        : null}
    </div>
  );

  function renderCause() {
    if (!model) return null;
    if (model.cause === "no_valid_option") {
      return <>{t("technicalNotice.location")} {renderIds([model.loadPointId])} {t("technicalNotice.noValidOption", { count: 1 })}</>;
    }
    if (model.cause === "group_member_without_valid_option") {
      return <>
        {t("technicalNotice.groupLocations")} {renderIds(model.loadPointIds)} {t("technicalNotice.mustShareConfiguration")}{" "}
        {t("technicalNotice.blockingLocations", { count: model.blockingLoadPointIds.length })} {renderIds(model.blockingLoadPointIds)} {t("technicalNotice.noValidOption", { count: model.blockingLoadPointIds.length })}
      </>;
    }
    return <>
      {t("technicalNotice.groupLocations")} {renderIds(model.loadPointIds)} {t("technicalNotice.noCommonValidConfiguration")}
    </>;
  }

  function renderIds(ids: number[]) {
    return ids.map((loadPointId, index) => (
      <span key={loadPointId}>
        {index > 0 ? (index === ids.length - 1 ? ` ${t("technicalNotice.and")} ` : ", ") : null}
        <button
          className="optimization-load-point-link"
          type="button"
          onClick={() => onStateChange({ ...state, ...selectLoadPoint(state, loadPointId) })}
        >{loadPointId}</button>
      </span>
    ));
  }
}
