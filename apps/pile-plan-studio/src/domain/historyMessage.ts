import type { HistoryAction } from "./historyAction.ts";
import type { HistoryResult } from "./projectHistoryReducer.ts";

export type HistoryTranslator = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export function describeHistoryAction(
  translate: HistoryTranslator,
  action: HistoryAction,
): string {
  return translate(`history.actions.${action.kind}`, {
    ...(action.count === undefined ? {} : { count: action.count }),
    ...(action.pilePlanName === undefined ? {} : { pilePlanName: action.pilePlanName }),
  });
}

export function describeHistoryResult(
  translate: HistoryTranslator,
  result: HistoryResult,
): string {
  return translate(`history.result.${result.direction}`, {
    action: describeHistoryAction(translate, result.action),
  });
}
