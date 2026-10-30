import {test} from "node:test";
import assert from "node:assert/strict";
import {directionalOption,directionalLoad} from "./loadDirection.ts";
test("mode projects core facts without changing joint assessment or source",()=>{
 const o={configuration:{pile_size_mm:320,pile_tip_level_mm:-18000},pile_size_mm:320,pile_tip_level_m:-18,isOption:false,governing_cpt_id:12,governing_frd_kn:650,utilization:.9,missing_cpt_ids:[],technicalStatus:"insufficient_capacity" as const,tension:{demand_kn:90,governing_cpt_id:11,governing_frd_kn:80,utilization:1.125,missing_cpt_ids:[],status:"insufficient_capacity" as const}};
 assert.equal(directionalOption(o,"tension").utilization,1.125);assert.equal(o.utilization,.9);
 const p={id:1,name:"A",x_mm:0,y_mm:0,design_load_kn:600,tension:{state:"known" as const,value_kn:90}};
 assert.equal(directionalLoad(p,"tension"),90);assert.equal(p.design_load_kn,600);
 assert.equal(directionalLoad({...p,tension:{state:"not_imported"}},"tension"),null);
});

test("directional source and status copy is complete in Dutch and English",async()=>{
 const fs=await import("node:fs");
 for(const language of ["nl","en"]){const messages=JSON.parse(fs.readFileSync(new URL(`../../i18n/locales/${language}/common.json`,import.meta.url),"utf8"));for(const key of ["compression","tension","importTension","includeTension","pressureOnly","designResistanceHelp"]){assert.equal(typeof messages.loadDirection[key],"string");}for(const status of ["not_assessed","no_load","missing_demand"]){assert.ok(messages.loadDirection.status[status]);}}
});

test("zero load uses the passing label in both languages",async()=>{
 const fs=await import("node:fs");
 for(const language of ["nl","en"]){
  const {loadDirection}=JSON.parse(fs.readFileSync(new URL(`../../i18n/locales/${language}/common.json`,import.meta.url),"utf8"));
  assert.equal(loadDirection.combined.no_load,loadDirection.combined.valid);
  assert.equal(loadDirection.status.no_load,loadDirection.combined.valid);
  assert.equal(loadDirection.combined.valid,"OK");
  assert.equal(loadDirection.combined.insufficient_capacity,language==="nl"?"Niet OK":"Not OK");
  assert.deepEqual(Object.keys(loadDirection.combinedHelp).sort(),Object.keys(loadDirection.combined).sort());
 }
});
