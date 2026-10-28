import {test} from "node:test";
import assert from "node:assert/strict";
import {defaultExportColumns,localizeExportColumns,DEFAULT_COLUMN_HEADERS,nextExportColumnCaption} from "./exportColumns.ts";
import {normalizeExportOptions} from "./exportPreferences.ts";
test("export preferences restore rules and normalize invalid or absent values",()=>{
  const result=normalizeExportOptions({mark:{enabled:true,start:13,rule:{axis:"x",x_direction:"descending",y_direction:"ascending",tolerance_mm:20}},tip_code:{enabled:true,sequence:"numbers",direction:"ascending"}});
  assert.equal(result.mark.start,13);assert.equal(result.mark.rule.axis,"x");assert.equal(result.tip_code.direction,"ascending");
  const invalid=normalizeExportOptions({mark:{start:0,rule:{tolerance_mm:-1}},tip_code:{sequence:"custom"}});
  assert.equal(invalid.mark.start,1);assert.equal(invalid.mark.rule.tolerance_mm,1);assert.equal(invalid.tip_code.sequence,"letters");
  assert.equal(normalizeExportOptions(undefined).mark.enabled,false);
});
test("column choices keep their order, custom captions and formatting after reloading preferences",()=>{
  const columns=[{key:"size",field:"pile_size",header:"Eigen maat",enabled:true,size_format:"custom",template:"Paal {size}"},
    {key:"id",field:"load_point_id",header:"Knoop",enabled:false}];
  const result=normalizeExportOptions({columns});
  assert.deepEqual(result.columns,columns);
});

test("default captions follow language while custom captions and source names stay unchanged",()=>{
  const options={...normalizeExportOptions(undefined),tip_code:{enabled:true,sequence:"letters" as const,direction:"descending" as const}};
  const nl=defaultExportColumns(options,"numeric",{...DEFAULT_COLUMN_HEADERS,tip_code:"Inheicode"});
  const en=defaultExportColumns({...options,columns:nl},"numeric");
  assert.equal(en.find(c=>c.field==="tip_code")?.header,"Tip code");
  const custom=nl.map(c=>c.field==="tip_code"?{...c,header:"My code",use_default_header:false}:c);
  assert.equal(defaultExportColumns({...options,columns:custom},"numeric").find(c=>c.field==="tip_code")?.header,"My code");
  assert.equal(localizeExportColumns([{key:"source:0",field:"tip_code",header:"Inheicode",enabled:true,source_index:0}],DEFAULT_COLUMN_HEADERS)[0].header,"Inheicode");
});

test("default coordinate and level captions reflect the selected output unit",()=>{
  const columns=localizeExportColumns([{key:"x",field:"x",header:"X [mm]",enabled:true,use_default_header:true,unit:"m"},{key:"tip",field:"tip_level",header:"Pile Tip Level [m]",enabled:true,use_default_header:true,unit:"mm"}],DEFAULT_COLUMN_HEADERS);
  assert.deepEqual(columns.map(c=>c.header),["X [m]","Pile Tip Level [mm]"]);
});

test("revision renumbering is remembered without changing the default retention mode",()=>{
  assert.equal(normalizeExportOptions({mark:{revision_mode:"renumber"}}).mark.revision_mode,"renumber");
  assert.equal(normalizeExportOptions({mark:{revision_mode:"unknown"}}).mark.revision_mode,undefined);
});

test("added column captions receive the next free number and localize without losing it",()=>{
  const base={key:"one",field:"literal" as const,header:"Extra column 1",enabled:true,use_default_header:true,header_number:1};
  const next=nextExportColumnCaption("Extra column",[{...base,key:"unnumbered",header:" Extra COLUMN "},base,{...base,key:"two",header:" extra COLUMN 2 "}]);
  assert.deepEqual(next,{header:"Extra column 3",header_number:3});
  assert.equal(localizeExportColumns([base],{literal:"Extra kolom"})[0].header,"Extra kolom 1");
  assert.equal(normalizeExportOptions({columns:[base]}).columns?.[0].header_number,1);
});


test("a free column caption needs no numeric suffix and still follows the language",()=>{
  const caption=nextExportColumnCaption("Mark",[]);
  assert.deepEqual(caption,{header:"Mark"});
  const column={key:"mark",field:"mark" as const,enabled:true,use_default_header:true,...caption};
  assert.equal(localizeExportColumns([column],{mark:"Paalnummer"})[0].header,"Paalnummer");
});

test("a colliding caption gets a free suffix regardless of field, casing or whitespace",()=>{
  const existing={key:"source:0",field:"source" as const,header:" mark ",enabled:true};
  assert.deepEqual(nextExportColumnCaption("Mark",[existing]),{header:"Mark 1",header_number:1});
});
