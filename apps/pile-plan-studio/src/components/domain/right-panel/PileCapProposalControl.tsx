import { MAX_PILE_CAP_COUNT } from "../../../core/pileCapProposalTypes.ts";
import { useTranslation } from "react-i18next";
import type {
  PileCapPreview,
  PileCapProposal,
} from "../../../core/pileCapProposalTypes.ts";
import type { ProjectState } from "../../../domain/project/projectState.ts";
import { pileConfigurationToken } from "../../../core/pileConfigurationKey.ts";
import "./pileCapProposalControl.css";

export default function PileCapProposalControl({
  state,
  ids,
  proposal,
  preview,
  pending,
  onEdit,
}: {
  state: ProjectState;
  ids: number[];
  proposal: PileCapProposal | null;
  preview: PileCapPreview | null;
  pending: boolean;
  onEdit: (proposal: PileCapProposal, remove?: boolean) => void;
}) {
  const { t, i18n } = useTranslation("rightPanel");
  const count = proposal?.pile_count ?? ids.length;
  const change = (next: number) => {
    const choices = ids.map((id) =>
      state.selectedPileConfigurationsByLoadPoint.get(id),
    );
    const first = choices[0];
    const common =
      first &&
      choices.every(
        (c) => c && pileConfigurationToken(c) === pileConfigurationToken(first),
      )
        ? first
        : null;
    onEdit({
      ...proposal,
      load_point_ids: [...ids],
      pile_count: next,
      quarter_turns: proposal?.quarter_turns ?? 0,
      configuration: proposal?.configuration ?? common,
    });
  };
  const force = (value: number | null | undefined) =>
    value == null
      ? "—"
      : value.toLocaleString(i18n.language, { maximumFractionDigits: 1 });
  return (
    <div className="pile-cap-proposal-control" aria-label={t("pileCap.title")}>
      <div className="pile-cap-proposal-bar">
        <span className="pile-cap-mode" data-proposal-label={t("pileCap.proposal")}>
          <span>{t(proposal ? "pileCap.proposal" : "pileCap.title")}</span>
        </span>
        <div className="pile-cap-adjustment">
          <button
            type="button"
            disabled={pending || count <= 1}
            aria-label={t("pileCap.decrease")}
            onClick={() => change(Math.min(MAX_PILE_CAP_COUNT, count - 1))}
          >
            −
          </button>
          <span className="pile-cap-count" data-count-label={t("pileCap.count", { count: Math.max(MAX_PILE_CAP_COUNT, ids.length) })} aria-live="polite">
            <span>{t("pileCap.count", { count })}</span>
          </span>
          <button
            type="button"
            disabled={pending || count >= MAX_PILE_CAP_COUNT}
            aria-label={t("pileCap.increase")}
            onClick={() => change(count + 1)}
          >
            +
          </button>
        </div>
        <button
          type="button"
          disabled={pending || !proposal}
          aria-label={t("pileCap.rotate")}
          title={t("pileCap.rotate")}
          onClick={() =>
            proposal &&
            onEdit({
              ...proposal,
              quarter_turns: (proposal.quarter_turns + 1) % 4,
            })
          }
        >
          ↻ 90°
        </button>
        <button
          type="button"
          disabled={pending || !proposal}
          aria-label={t("pileCap.reset")}
          title={t("pileCap.reset")}
          onClick={() => proposal && onEdit(proposal, true)}
        >
          {t("pileCap.resetLabel")}
        </button>
        {proposal ? (
          <span className="pile-cap-original">
            {t("pileCap.original", { count: ids.length })}
          </span>
        ) : null}
      </div>
      {proposal ? (
        <div className="pile-cap-proposal-facts">
          <span>
            {state.cptSelectionEditDraft || state.loadPointLockDraft
              ? t("pileCap.sourceEditing")
              : pending
                ? t("pileCap.calculating")
                : t("pileCap.forces", {
                    total: force(preview?.total_load_kn),
                    each: force(preview?.load_per_pile_kn),
                  })}
          </span>
          <span>{t("pileCap.assumptions")}</span>
        </div>
      ) : null}
    </div>
  );
}
