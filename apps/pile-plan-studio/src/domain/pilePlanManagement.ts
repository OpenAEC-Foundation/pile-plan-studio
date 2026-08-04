import type { PilePlanData } from "../core/projectFile.ts";

export type PilePlanLanguage = "nl" | "en";
export type GeneratedPilePlanKind = "variant" | "duplicate" | "optimization";

export type PilePlanTransition = {
  pilePlans: PilePlanData[];
  activePilePlanId: string;
  selectedPileOptionKeysByLoadPoint: Map<number, string>;
};

type ActivePilePlanInput = PilePlanTransition;

export function synchronizeActivePilePlan(
  pilePlans: PilePlanData[],
  activePilePlanId: string,
  selectedPileOptionKeysByLoadPoint: Map<number, string>,
): PilePlanData[] {
  return pilePlans.map((plan) => plan.id === activePilePlanId ? ({
    ...plan,
    selectedPileOptionKeysByLoadPoint: new Map(selectedPileOptionKeysByLoadPoint),
  }) : plan);
}

export function switchPilePlan(
  input: ActivePilePlanInput & { targetPilePlanId: string },
): PilePlanTransition {
  const pilePlans = synchronizeActivePilePlan(
    input.pilePlans,
    input.activePilePlanId,
    input.selectedPileOptionKeysByLoadPoint,
  );
  const target = pilePlans.find((plan) => plan.id === input.targetPilePlanId);
  if (!target) return { ...input, pilePlans };

  return transitionToPlan(pilePlans, target);
}

export function nextPilePlanId(pilePlans: PilePlanData[]): string {
  const usedIds = new Set(pilePlans.map(({ id }) => id));
  let index = 1;
  while (usedIds.has(`pile-plan-${index}`)) index += 1;
  return `pile-plan-${index}`;
}

export function generatedPilePlanName(
  pilePlans: PilePlanData[],
  kind: GeneratedPilePlanKind,
  language: PilePlanLanguage,
  sourceName?: string,
): string {
  const existingNames = new Set(pilePlans.map(({ name }) => name));
  if (kind === "duplicate") {
    const base = `${sourceName ?? "Pile plan"} - ${language === "nl" ? "kopie" : "copy"}`;
    if (!existingNames.has(base)) return base;
    return numberedName(base, existingNames, 2, " ");
  }

  const base = kind === "variant"
    ? "Variant"
    : language === "nl" ? "Optimalisatie" : "Optimization";
  return numberedName(base, existingNames, 1, " ");
}

export function duplicatePilePlan(
  input: ActivePilePlanInput & {
    sourcePilePlanId: string;
    language: PilePlanLanguage;
  },
): PilePlanTransition {
  const pilePlans = synchronizeActivePilePlan(
    input.pilePlans,
    input.activePilePlanId,
    input.selectedPileOptionKeysByLoadPoint,
  );
  const source = pilePlans.find((plan) => plan.id === input.sourcePilePlanId);
  if (!source) return { ...input, pilePlans };

  const copy: PilePlanData = {
    ...source,
    id: nextPilePlanId(pilePlans),
    name: generatedPilePlanName(pilePlans, "duplicate", input.language, source.name),
    selectedPileOptionKeysByLoadPoint: new Map(source.selectedPileOptionKeysByLoadPoint),
    externalReferencesByLoadPoint: cloneReferenceMap(source.externalReferencesByLoadPoint),
    lockedLoadPointIds: [...source.lockedLoadPointIds],
  };
  const nextPlans = [...pilePlans, copy];
  return transitionToPlan(nextPlans, copy);
}

export function createPilePlan(
  input: ActivePilePlanInput & {
    choices: Map<number, string>;
    kind: "variant" | "optimization";
    language: PilePlanLanguage;
  },
): PilePlanTransition {
  const pilePlans = synchronizeActivePilePlan(
    input.pilePlans,
    input.activePilePlanId,
    input.selectedPileOptionKeysByLoadPoint,
  );
  const created: PilePlanData = {
    id: nextPilePlanId(pilePlans),
    name: generatedPilePlanName(pilePlans, input.kind, input.language),
    selectedPileOptionKeysByLoadPoint: new Map(input.choices),
    externalReferencesByLoadPoint: new Map(),
    lockedLoadPointIds: [],
  };
  const nextPlans = [...pilePlans, created];
  return transitionToPlan(nextPlans, created);
}

export function createOptimizationPilePlan(
  input: ActivePilePlanInput & {
    optimizedChoices: Map<number, string>;
    language: PilePlanLanguage;
  },
): PilePlanTransition {
  const pilePlans = synchronizeActivePilePlan(
    input.pilePlans,
    input.activePilePlanId,
    input.selectedPileOptionKeysByLoadPoint,
  );
  const source = pilePlans.find((plan) => plan.id === input.activePilePlanId) ?? pilePlans[0];
  const externalReferencesByLoadPoint = new Map(
    [...source.externalReferencesByLoadPoint]
      .filter(([loadPointId]) => source.selectedPileOptionKeysByLoadPoint.get(loadPointId)
        === input.optimizedChoices.get(loadPointId))
      .map(([loadPointId, references]) => [loadPointId, [...references]]),
  );
  const created: PilePlanData = {
    id: nextPilePlanId(pilePlans),
    name: generatedPilePlanName(pilePlans, "optimization", input.language),
    selectedPileOptionKeysByLoadPoint: new Map(input.optimizedChoices),
    externalReferencesByLoadPoint,
    lockedLoadPointIds: [...source.lockedLoadPointIds],
  };
  return transitionToPlan([...pilePlans, created], created);
}

export function renamePilePlan(
  pilePlans: PilePlanData[],
  pilePlanId: string,
  requestedName: string,
): PilePlanData[] {
  const name = requestedName.trim();
  if (!name) return pilePlans;
  return pilePlans.map((plan) => plan.id === pilePlanId ? { ...plan, name } : plan);
}

export function deletePilePlan(
  input: ActivePilePlanInput & { pilePlanId: string },
): PilePlanTransition {
  const pilePlans = synchronizeActivePilePlan(
    input.pilePlans,
    input.activePilePlanId,
    input.selectedPileOptionKeysByLoadPoint,
  );
  if (pilePlans.length <= 1) {
    const active = pilePlans.find((plan) => plan.id === input.activePilePlanId) ?? pilePlans[0];
    return transitionToPlan(pilePlans, active);
  }

  const deleteIndex = pilePlans.findIndex((plan) => plan.id === input.pilePlanId);
  if (deleteIndex < 0) return { ...input, pilePlans };
  const remaining = pilePlans.filter((plan) => plan.id !== input.pilePlanId);
  if (input.activePilePlanId !== input.pilePlanId) {
    const active = remaining.find((plan) => plan.id === input.activePilePlanId) ?? remaining[0];
    return transitionToPlan(remaining, active);
  }

  const nextActive = remaining[Math.max(0, deleteIndex - 1)];
  return transitionToPlan(remaining, nextActive);
}

function transitionToPlan(pilePlans: PilePlanData[], plan: PilePlanData): PilePlanTransition {
  return {
    pilePlans,
    activePilePlanId: plan.id,
    selectedPileOptionKeysByLoadPoint: new Map(plan.selectedPileOptionKeysByLoadPoint),
  };
}

function numberedName(
  base: string,
  existingNames: Set<string>,
  firstIndex: number,
  separator: string,
): string {
  let index = firstIndex;
  while (existingNames.has(`${base}${separator}${index}`)) index += 1;
  return `${base}${separator}${index}`;
}

function cloneReferenceMap(
  references: Map<number, unknown[]>,
): Map<number, unknown[]> {
  return new Map([...references].map(([loadPointId, values]) => [loadPointId, [...values]]));
}
