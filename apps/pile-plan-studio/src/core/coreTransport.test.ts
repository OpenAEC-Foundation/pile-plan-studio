import {test} from "node:test";
import assert from "node:assert/strict";
import {initializeWasm} from "./coreTransport.ts";
test("each reloaded WASM module is initialized once independently of the previous module",async()=>{
 let firstCalls=0,nextCalls=0;
 const first=async()=>{firstCalls++},next=async()=>{nextCalls++};
 await Promise.all([initializeWasm(first),initializeWasm(first)]);
 await Promise.all([initializeWasm(next),initializeWasm(next)]);
 assert.equal(firstCalls,1);assert.equal(nextCalls,1);
});
test("a failed module initialization can be retried",async()=>{
 let calls=0;const init=async()=>{if(++calls===1)throw new Error('not ready')};
 await assert.rejects(initializeWasm(init),/not ready/);await initializeWasm(init);assert.equal(calls,2);
});
