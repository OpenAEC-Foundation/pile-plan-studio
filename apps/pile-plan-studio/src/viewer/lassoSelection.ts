export type LassoRectangle = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

export type ScreenPoint = {
  id: number;
  x: number;
  y: number;
};

type LassoInteractionInput = {
  lassoSelectionActive: boolean;
  shiftKey: boolean;
  targetIsInteractive: boolean;
  selectionAllowed: boolean;
  isEditingLoadPointLocks: boolean;
};

export type LassoSelectionOperation = "replace" | "add" | "lock";

export type LassoSelectionModeEvent =
  | { type: "toggle" | "dismiss" }
  | { type: "editing-context"; available: boolean };

export function getAdditiveSelectionModifier(input: {
  ctrlKey: boolean;
  metaKey: boolean;
}): boolean {
  return input.ctrlKey || input.metaKey;
}

export function transitionLassoSelectionMode(
  active: boolean,
  event: LassoSelectionModeEvent,
): boolean {
  if (event.type === "toggle") return !active;
  if (event.type === "editing-context") return event.available && active;
  return false;
}

export function shouldStartLassoInteraction(input: LassoInteractionInput): boolean {
  if (input.targetIsInteractive || !input.selectionAllowed) return false;
  if (input.isEditingLoadPointLocks) return input.shiftKey;
  return input.shiftKey || input.lassoSelectionActive;
}

export function getLassoSelectionOperation(input: {
  additiveKey: boolean;
  isEditingLoadPointLocks: boolean;
}): LassoSelectionOperation {
  if (input.isEditingLoadPointLocks) return "lock";
  return input.additiveKey ? "add" : "replace";
}

export function shouldClearViewerSelectionOnEscape(input: {
  lassoSelectionActive: boolean;
  isEditingLoadPointLocks: boolean;
  selectionAllowed: boolean;
}): boolean {
  return !input.lassoSelectionActive
    && !input.isEditingLoadPointLocks
    && input.selectionAllowed;
}

export function getPointIdsInRectangle(points: ScreenPoint[], rectangle: LassoRectangle): number[] {
  const minX = Math.min(rectangle.startX, rectangle.endX);
  const maxX = Math.max(rectangle.startX, rectangle.endX);
  const minY = Math.min(rectangle.startY, rectangle.endY);
  const maxY = Math.max(rectangle.startY, rectangle.endY);

  return points
    .filter((point) => point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY)
    .map((point) => point.id);
}
