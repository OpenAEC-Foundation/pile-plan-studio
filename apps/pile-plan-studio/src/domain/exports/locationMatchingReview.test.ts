import {test} from "node:test";
import assert from "node:assert/strict";
import {withLocationChoice,nextPendingSelection} from "./locationMatchingReview.ts";
import type {MatchingResult} from "../../core/exportRevisionContract.ts";

test("taking an occupied old location releases both former edges without marking either point removed or added",()=>{
  const before={links:[{new_id:9,old_id:1},{new_id:10,old_id:2}],added:[11],removed:[3]};
  const after=withLocationChoice(before,10,1);
  assert.deepEqual(after,{links:[{new_id:10,old_id:1}],added:[11],removed:[3]});
  assert.deepEqual(before.links,[{new_id:9,old_id:1},{new_id:10,old_id:2}]);
});
test("choosing a previously added or removed point clears its explicit disposition",()=>{
  assert.deepEqual(withLocationChoice({links:[],added:[9],removed:[1]},9,1),{links:[{new_id:9,old_id:1}],added:[],removed:[]});
});
test("clearing a choice leaves it unresolved while added is an explicit decision",()=>{
  const before={links:[{new_id:9,old_id:1}],added:[],removed:[]};
  assert.deepEqual(withLocationChoice(before,9,null),{links:[],added:[],removed:[]});
  assert.deepEqual(withLocationChoice(before,9,"added"),{links:[],added:[9],removed:[]});
});
test("the review continues with pending new points, then old points, and completes without selecting a linked point",()=>{
  const result:MatchingResult={links:[],added:[],removed:[],proposals:[],unmatched_new:[9,11],unmatched_old:[1,2],complete:false};
  assert.deepEqual(nextPendingSelection(result),{side:"new",id:9});
  assert.deepEqual(nextPendingSelection(result,{side:"new",id:10}),{side:"new",id:11});
  assert.deepEqual(nextPendingSelection({...result,unmatched_new:[]}),{side:"old",id:1});
  assert.equal(nextPendingSelection({...result,unmatched_new:[],unmatched_old:[],complete:true}),null);
});
