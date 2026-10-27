import initWasm, {
  evaluate_pile_cap_proposals,
} from "./wasm/pile-plan-wasm/pile_plan_wasm.js";
import {
  initializeWasm,
  invokeDesktop,
  isTauriRuntime,
} from "./coreTransport.ts";
import {
  toBrowserProjectDocumentDraft,
  toDesktopProjectDocumentDraft,
  type ProjectDocumentDraft,
} from "./projectDocumentContract.ts";
import type {
  PileCapProposalEdit,
  PileCapProposalResult,
} from "./pileCapProposalTypes.ts";

export async function evaluatePileCapProposalsCore(
  draft: ProjectDocumentDraft,
  edit: PileCapProposalEdit | null = null,
): Promise<PileCapProposalResult> {
  const request = {
    draft: isTauriRuntime()
      ? toDesktopProjectDocumentDraft(draft)
      : toBrowserProjectDocumentDraft(draft),
    edit,
  };
  let raw: PileCapProposalResult;
  if (isTauriRuntime())
    raw = await invokeDesktop<PileCapProposalResult>(
      "evaluate_pile_cap_proposals",
      { request },
    );
  else {
    await initializeWasm(() => initWasm());
    raw = evaluate_pile_cap_proposals(request) as PileCapProposalResult;
  }
  return pileCapProposalResultFromCore(raw);
}

export function pileCapProposalResultFromCore(
  raw: PileCapProposalResult,
): PileCapProposalResult {
  return {
    plans: raw.plans.map((plan) => ({
      ...plan,
      previews: plan.previews.map((preview) => ({
        ...preview,
        total_load_kn: preview.total_load_kn ?? null,
        load_per_pile_kn: preview.load_per_pile_kn ?? null,
        proposal: {
          ...preview.proposal,
          configuration: preview.proposal.configuration ?? null,
        },
        options: preview.options.map((option) => {
          const wire = (
            option instanceof Map ? Object.fromEntries(option) : option
          ) as typeof option & {
            is_option: boolean;
            technical_status: typeof option.technicalStatus;
          };
          return {
            ...wire,
            isOption: wire.is_option,
            technicalStatus: wire.technical_status,
            governing_cpt_id: wire.governing_cpt_id ?? null,
            governing_frd_kn: wire.governing_frd_kn ?? null,
            utilization: wire.utilization ?? null,
            cost_per_pile: wire.cost_per_pile ?? null,
            total_cost: wire.total_cost ?? null,
          };
        }),
      })),
      proposals: plan.proposals.map((p) => ({
        ...p,
        configuration: p.configuration ?? null,
      })),
    })),
  };
}
