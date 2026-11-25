import {createHash} from "node:crypto";
/** Domain-separated deterministic QA randomness. Not cryptographic key generation,
 * empirical independence, or a calibrated behavioral distribution. */
export function createFixtureRandomStream(seed,domain,identity=""){
 if(!Number.isSafeInteger(seed)||typeof domain!=="string"||!domain||typeof identity!=="string")throw Error("INVALID_FIXTURE_RANDOM_STREAM");
 let counter=0;
 return ()=>{
  const data=JSON.stringify([seed,domain,identity,counter++]);
  return createHash("sha256").update(data,"utf8").digest().readUInt32BE(0)/4294967296;
 };
}
export function shuffledFixtureRound(items,next){
 const out=[...items];
 for(let i=out.length-1;i>0;i--){const j=Math.floor(next()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
 return out;
}
