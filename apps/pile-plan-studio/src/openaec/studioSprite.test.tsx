import { render } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import manifest from "./manifest.json";
import BlueprintIcon from "../components/template/BlueprintIcon.tsx";
import Legend from "../components/domain/pile-plans/Legend.tsx";
import { projectFixture } from "../test/projectFixture.ts";

test("custom and shared icons change their resource URL when the generated sprite changes", () => {
  const hash = manifest.generated.find(file => file.path === "icons/studio.svg")!.sha256;
  const view = render(<><BlueprintIcon id="file.save" />
    <Legend state={projectFixture()} onStateChange={vi.fn()} onEdit={vi.fn()} tipLevelRegionStatus="idle" /></>);
  const references = [...view.container.querySelectorAll("use")].map(use => new URL(use.getAttribute("href")!, location.href));
  expect(references).toHaveLength(3);
  const upstream = references.filter(reference => reference.pathname.endsWith("/studio.svg"));
  expect(upstream).toHaveLength(2);
  for (const reference of upstream) expect(reference.searchParams.get("v")).toBe(hash);
  expect(references[2].searchParams.get("v")).toBeTruthy();
  expect(references[2].protocol).not.toBe("data:");
  expect(references.map(reference => reference.hash)).toEqual([
    "#i16-file.save", "#i16-pile.legend-used", "#i16-local.edit",
  ]);
});
