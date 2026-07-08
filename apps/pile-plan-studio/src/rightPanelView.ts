import type { RightPanelMode } from "./selectionState";

export type RightPanelView = RightPanelMode;

export function getRightPanelView(input: { rightPanelMode: RightPanelMode }): RightPanelView {
  return input.rightPanelMode;
}
