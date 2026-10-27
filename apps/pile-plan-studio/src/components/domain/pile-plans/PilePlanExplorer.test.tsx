import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import i18n from "../../../i18n/config.ts";
import { projectFixture } from "../../../test/projectFixture.ts";
import PilePlanExplorer from "./PilePlanExplorer.tsx";

test.each(["nl", "en"])("explorer counts cap changes rather than hypothetical piles (%s)", async language => {
  await i18n.changeLanguage(language);
  const state = projectFixture();
  const plan = { ...state.pilePlans[0], lockedLoadPointIds: [15, 43], pileCapProposals: [
    { load_point_ids: [15, 43], pile_count: 3, quarter_turns: 0, configuration: null },
    { load_point_ids: [50], pile_count: 5, quarter_turns: 0, configuration: null },
  ] };
  render(<PilePlanExplorer
    projectName="Project" isDirty={false} pilePlans={[plan]} activePilePlanId={plan.id}
    costSummaries={new Map([[plan.id, { includesProposals: true, pileCount: 329, totalCost: 218143, missingCount: 0 }]])}
    currencyCode="EUR" inputSources={[]} activeSourceKind={null} inputSourcesExpanded={false} pilePlansExpanded
    onActivate={vi.fn()} onCreate={vi.fn()} onRename={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()}
    onSourceActivate={vi.fn()} onExpansionChange={vi.fn()}
  />);
  const row = screen.getByRole("option");
  expect(row.textContent).toContain(language === "nl" ? "2 poerwijzigingen" : "2 cap changes");
  expect(row.textContent).toContain(language === "nl" ? "2 vergrendeld" : "2 locked");
  expect(row.textContent).not.toContain("329");
});
