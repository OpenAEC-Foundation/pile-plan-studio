import { useTranslation } from "react-i18next";

import type { ProjectState } from "../../domain/projectState.ts";
import { selectLoadPoint } from "../../domain/selectionState.ts";
import {
  getAnalysisFailureNotice,
  getMultiSelectionAssignmentSummary,
  getNeutralUnassignedNotice,
  getOptimizerUnassignedNotices,
  getTechnicalAssignmentNotice,
} from "../../domain/technicalAssignmentNotice.ts";
import type { TechnicalAssignmentSnapshot } from "./technicalAssignmentController.ts";

type Props = {
  state: ProjectState;
  assessment: TechnicalAssignmentSnapshot;
  onStateChange: (state: ProjectState) => void;
};

export default function TechnicalAssignmentNotice({ state, assessment, onStateChange }: Props) {
  const { t } = useTranslation("rightPanel");
  const failureModel = getAnalysisFailureNotice({
    assessmentStatus: assessment.status,
    error: assessment.error,
  });
  if (failureModel) {
    return (
      <div className="panel-message technical-assignment-notice is-error" role="alert">
        <strong>{t("technicalNotice.neutral.analysis-error.title")}</strong>
        <span>
          {failureModel.detail
            ? t("technicalNotice.analysisErrorExplanation", { error: failureModel.detail })
            : t("technicalNotice.neutral.analysis-error.explanation")}
        </span>
      </div>
    );
  }
  if (assessment.status === "unavailable") {
    return (
      <div className="panel-message technical-assignment-notice is-neutral" role="status">
        <strong>{t("technicalNotice.unavailableTitle")}</strong>
        <span>{t("technicalNotice.unavailableExplanation")}</span>
      </div>
    );
  }

  const activePilePlan = state.pilePlans.find(({ id }) => id === state.activePilePlanId)
    ?? state.pilePlans[0];
  const assignedLoadPointIds = new Set(state.selectedPileConfigurationsByLoadPoint.keys());
  const multiSelectionSummary = getMultiSelectionAssignmentSummary({
    selectedLoadPointIds: state.selectedLoadPointIds,
    assignedLoadPointIds,
    assessmentStatus: assessment.status,
    issuesByLoadPointId: assessment.issuesByLoadPointId,
    optimizerReasonsByLoadPointId: activePilePlan?.optimizationUnassignedByLoadPoint ?? new Map(),
  });
  if (multiSelectionSummary) {
    const categorySummary = multiSelectionSummary.categories
      .map(({ kind, count }) => t(`technicalNotice.multi.${kind}`, { count }))
      .join("; ");
    return (
      <div className="panel-message technical-assignment-notice is-neutral" role="status">
        <strong>{t("technicalNotice.multi.title", {
          count: multiSelectionSummary.unassignedCount,
          selectedCount: multiSelectionSummary.selectedCount,
        })}</strong>
        <span>{categorySummary}.</span>
      </div>
    );
  }

  const model = getTechnicalAssignmentNotice({
    selectedLoadPointIds: state.selectedLoadPointIds,
    assessmentStatus: assessment.status,
    issuesByLoadPointId: assessment.issuesByLoadPointId,
  });
  if (!model) {
    const optimizerModels = getOptimizerUnassignedNotices({
      selectedLoadPointIds: state.selectedLoadPointIds,
      assignedLoadPointIds,
      assessmentStatus: assessment.status,
      reasonsByLoadPointId: activePilePlan?.optimizationUnassignedByLoadPoint ?? new Map(),
    });
    const neutralModel = getNeutralUnassignedNotice({
      selectedLoadPointIds: state.selectedLoadPointIds,
      assignedLoadPointIds,
      assessmentStatus: assessment.status,
      technicalIssueLoadPointIds: new Set(assessment.issuesByLoadPointId.keys()),
      optimizerUnassignedLoadPointIds: new Set(
        activePilePlan?.optimizationUnassignedByLoadPoint.keys() ?? [],
      ),
    });
    if (optimizerModels.length === 0 && !neutralModel) return null;

    return (
      <>
        {optimizerModels.map((optimizerModel) => (
          <div
            className="panel-message technical-assignment-notice is-neutral"
            key={optimizerModel.reason}
            role="status"
          >
            <strong>{t(`technicalNotice.optimizer.${optimizerModel.reason}.title`)}</strong>
            <span>{t(`technicalNotice.optimizer.${optimizerModel.reason}.explanation`, {
              count: optimizerModel.loadPointIds.length,
            })}</span>
          </div>
        ))}
        {neutralModel ? (
          <div className="panel-message technical-assignment-notice is-neutral" role="status">
            <strong>{t(`technicalNotice.neutral.${neutralModel.kind}.title`)}</strong>
            <span>
              {t(`technicalNotice.neutral.${neutralModel.kind}.explanation`, {
                count: neutralModel.loadPointIds.length,
              })}
            </span>
          </div>
        ) : null}
      </>
    );
  }

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
      return <>{t("technicalNotice.thisLocation")} {t("technicalNotice.noValidOption", { count: 1 })}</>;
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
