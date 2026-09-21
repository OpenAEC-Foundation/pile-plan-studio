import {test} from "node:test";
import assert from "node:assert/strict";
import {ilpRequestForTest} from "../../../core/ilpOptimizationTestSupport.ts";
import {ilpCandidateCatalog,ilpCandidates,toggleIlpCandidate,ilpCandidateGroupState,toggleIlpCandidateGroup} from "./ilpCandidates.ts";

test("custom candidates preserve exact pairs independently of legend activation",()=>{
  const settings=ilpRequestForTest().input.settings;
  const a={pile_size_mm:290,pile_tip_level_mm:-18000},b={pile_size_mm:320,pile_tip_level_mm:-19000};
  const cross={pile_size_mm:290,pile_tip_level_mm:-19000};
  const catalog=[a,b,cross],plan={activePileSizes:[290],activePileTipLevelMms:[-19000]};
  assert.deepEqual(ilpCandidates({...settings,candidate_source:"all_available"},catalog,plan),catalog);
  assert.deepEqual(ilpCandidates({...settings,candidate_source:"active_legend"},catalog,plan),[cross]);
  assert.deepEqual(ilpCandidates({...settings,candidate_source:"custom",custom_configurations:[a,b]},catalog,plan),[a,b]);
  assert.deepEqual(ilpCandidates({...settings,candidate_source:"custom",custom_configurations:[]},catalog,plan),[]);
  const selected=[a];
  const added=toggleIlpCandidate(selected,b,true);
  assert.deepEqual(selected,[a]);
  assert.deepEqual(toggleIlpCandidate(added,a,false),[b]);
  assert.equal(toggleIlpCandidate(added,b,true).length,2);
});

test("candidate catalog lists each exact configuration once across load points",()=>{
  const options=ilpRequestForTest().input.optionsByLoadPoint;
  const catalog=ilpCandidateCatalog(options);
  assert.equal(catalog.length,new Set([...options.values()].flat().map(o=>JSON.stringify(o.configuration))).size);
  assert.ok(catalog.length>0);
});

test("row and column selection only adds catalog pairs and keeps other selections",()=>{
  const a={pile_size_mm:290,pile_tip_level_mm:-18000};
  const b={pile_size_mm:320,pile_tip_level_mm:-18000};
  const c={pile_size_mm:320,pile_tip_level_mm:-19000};
  const catalog=[a,b,c],selected=[c];
  const row=toggleIlpCandidateGroup(selected,catalog,"pile_tip_level_mm",-18000,true);
  assert.deepEqual(new Set(row.map(c=>JSON.stringify(c))),new Set([a,b,c].map(c=>JSON.stringify(c))));
  assert.deepEqual(selected,[c]);
  assert.deepEqual(toggleIlpCandidateGroup(row,catalog,"pile_tip_level_mm",-18000,false),[c]);
  const column=toggleIlpCandidateGroup([],catalog,"pile_size_mm",290,true);
  assert.deepEqual(column,[a]); // No invented 290 mm / -19 m combination.
  assert.equal(toggleIlpCandidateGroup(row,catalog,"pile_size_mm",320,true).length,3);
});

test("group checkboxes distinguish empty, partial and complete selections",()=>{
  const a={pile_size_mm:290,pile_tip_level_mm:-18000};
  const b={pile_size_mm:320,pile_tip_level_mm:-18000};
  const catalog=[a,b];
  assert.deepEqual(ilpCandidateGroupState([],catalog,"pile_tip_level_mm",-18000),{checked:false,indeterminate:false});
  assert.deepEqual(ilpCandidateGroupState([a],catalog,"pile_tip_level_mm",-18000),{checked:false,indeterminate:true});
  assert.deepEqual(ilpCandidateGroupState([a,b],catalog,"pile_tip_level_mm",-18000),{checked:true,indeterminate:false});
  assert.deepEqual(ilpCandidateGroupState([],catalog,"pile_tip_level_mm",-19000),{checked:false,indeterminate:false});
  const unavailable={pile_size_mm:400,pile_tip_level_mm:-20000};
  assert.deepEqual(toggleIlpCandidateGroup([a,unavailable],catalog,"pile_size_mm",400,false),[a]);
});
