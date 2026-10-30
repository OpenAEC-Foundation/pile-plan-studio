import {test,expect,vi} from "vitest";
import {render,screen} from "@testing-library/react";
import PilePlanImportPanel from "./PilePlanImportPanel.tsx";
import i18n from "../../../i18n/config.ts";
vi.mock("../../../app/import/usePilePlanImportPreview.ts",()=>({usePilePlanImportPreview:()=>({preview:vi.fn()})}));
test("pile plan import shows settings only after selecting a file",()=>{
 render(<PilePlanImportPanel loadPoints={[]} cpts={[]} availablePileConfigurations={[]} onImportPilePlan={()=>{}}/>);
 expect(screen.queryByText(i18n.t("pilePlanImport.profile",{ns:"backstage"}))).toBeNull();
 expect(screen.queryByText(i18n.t("pilePlanImport.tolerance",{ns:"backstage"}))).toBeNull();
 expect(screen.getByText(i18n.t("pilePlanImport.choose",{ns:"backstage"}))).toBeTruthy();
});
