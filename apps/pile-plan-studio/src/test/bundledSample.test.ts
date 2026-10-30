import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("bundled sample contains real RFEM tension loads and explicitly fictional CPT resistances",()=>{
 const project=JSON.parse(readFileSync(new URL("../../../../sample_project/sample_project.ifcpp",import.meta.url),"utf8"));
 assert.equal(project.metadata.name,"Sample Project");
 assert.equal(project.inputs.load_points.filter(p=>p.tension?.state==="known"&&p.tension.value_kn>0).length,33);
 const tension=project.inputs.bearing_capacities.filter(r=>r.direction==="tension");
 assert.equal(tension.length,2208);assert.equal(new Set(tension.map(r=>r.cpt_id)).size,77);
 assert.match(project.metadata.description,/ficti/i);
 assert.equal(project.user_state.pile_plans.length,1);
 assert.equal(project.user_state.pile_plans[0].name,"Basisplan");
 assert.equal(project.settings.ilp_optimization.include_tension,true);
 for(const log of project.import_log)assert.doesNotMatch(log.source_file,/[a-z]:[\\/]/i);
});
