import type { PileConfigurationOption } from "../core/projectTypes";

export function aggregatePileOptionsForLoadPoints(
  optionsByLoadPoint: PileConfigurationOption[][],
): PileConfigurationOption[] {
  const optionKeys = new Set<string>();
  const firstOptions = optionsByLoadPoint[0] ?? [];

  firstOptions.forEach((option) => optionKeys.add(optionKey(option)));
  optionsByLoadPoint.slice(1).forEach((options) => {
    options.forEach((option) => optionKeys.add(optionKey(option)));
  });

  return [...optionKeys]
    .flatMap((key): PileConfigurationOption[] => {
      const matchingOptions = optionsByLoadPoint.map((options) =>
        options.find((option) => optionKey(option) === key) ?? null,
      );
      const template = matchingOptions.find((option) => option !== null);

      if (!template) {
        return [];
      }
      const availableOptions = matchingOptions.filter(
        (option): option is PileConfigurationOption => option !== null,
      );
      const governingOption = availableOptions
        .filter((option) => option.governing_frd_kn !== null)
        .sort((left, right) => (left.governing_frd_kn ?? Infinity) - (right.governing_frd_kn ?? Infinity))[0];
      const utilizationValues = availableOptions.flatMap((option) =>
        option.utilization === null ? [] : [option.utilization],
      );
      const averageUtilization = utilizationValues.length
        ? utilizationValues.reduce((sum, value) => sum + value, 0) / utilizationValues.length
        : null;
      const missingSelectionIndices = matchingOptions.flatMap((option, index) => (option === null ? [index] : []));

      return [
        {
          pile_size_mm: template.pile_size_mm,
          pile_tip_level_m: template.pile_tip_level_m,
          isOption: matchingOptions.length > 0 && matchingOptions.every((option) => option?.isOption === true),
          governing_cpt_id: governingOption?.governing_cpt_id ?? null,
          governing_frd_kn: governingOption?.governing_frd_kn ?? null,
          utilization: averageUtilization,
          missing_cpt_ids: missingSelectionIndices,
        },
      ];
    })
    .sort(
      (left, right) =>
        left.pile_size_mm - right.pile_size_mm || right.pile_tip_level_m - left.pile_tip_level_m,
    );
}

function optionKey(option: Pick<PileConfigurationOption, "pile_size_mm" | "pile_tip_level_m">): string {
  return `${option.pile_size_mm}|${option.pile_tip_level_m}`;
}
