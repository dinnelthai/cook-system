import test from "node:test";
import assert from "node:assert/strict";
import {U64_MAX,U128_MAX,parseBaseUnits,formatBaseUnits,checkedAddU64,checkedAddU128,checkedSubU64,mulDivFloor,mulDivCeil} from "../src/core/integer.mjs";
test("exact integer parsing and formatting preserve range boundaries",()=>{
 for(const max of [0n,9n,100n,U64_MAX,U128_MAX]){
  assert.equal(parseBaseUnits(max.toString(),{max}),max);
  assert.equal(formatBaseUnits(max,{max}),max.toString());
  assert.throws(()=>parseBaseUnits((max+1n).toString(),{max}),RangeError);
 }
 assert.throws(()=>parseBaseUnits("9".repeat(100000)),RangeError);
 for(const v of ["01","-1","1.0","1e3"," 1",null,1])assert.throws(()=>parseBaseUnits(v),TypeError);
});
test("checked arithmetic refuses overflow and underflow",()=>{
 assert.equal(checkedAddU64(U64_MAX-1n,1n),U64_MAX);
 assert.equal(checkedAddU128(U128_MAX-1n,1n),U128_MAX);
 assert.throws(()=>checkedAddU64(U64_MAX,1n),RangeError);
 assert.throws(()=>checkedAddU128(U128_MAX,1n),RangeError);
 assert.throws(()=>checkedSubU64(0n,1n),RangeError);
 assert.throws(()=>mulDivFloor(1n,1n,0n),RangeError);
 assert.throws(()=>mulDivCeil(1n,1n,0n),RangeError);
});
test("floor and ceiling satisfy independent integer interval identities",()=>{
 const values=[0n,1n,2n,7n,9007199254740993n,U64_MAX,U128_MAX];
 for(const a of values)for(const b of values)for(const d of values.filter(x=>x>0n)){
  const product=a*b;
  if(product>U128_MAX*d){assert.throws(()=>mulDivCeil(a,b,d),RangeError);if(product>=(U128_MAX+1n)*d)assert.throws(()=>mulDivFloor(a,b,d),RangeError);else assert.equal(mulDivFloor(a,b,d),U128_MAX);continue;}
  const lo=mulDivFloor(a,b,d),hi=mulDivCeil(a,b,d);
  assert.ok(lo*d<=product&&product<(lo+1n)*d);
  assert.ok((hi-1n)*d<product&&product<=hi*d);
  assert.ok(hi===lo||hi===lo+1n);
 }
});
