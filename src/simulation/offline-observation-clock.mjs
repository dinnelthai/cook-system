/** Bounded deterministic event queue for offline observation delivery only.
 * Entries contain an observation index, not a transaction or executable action. */
export function createOfflineObservationClock({maxEvents=12000}={}){
 if(!Number.isSafeInteger(maxEvents)||maxEvents<1||maxEvents>12000)throw Error("INVALID_OBSERVATION_CLOCK_LIMIT");
 const heap=[],seen=new Set();let now=0,advanced=false,sequence=0;
 const timeValid=t=>Number.isSafeInteger(t)&&t>=0;
 const before=(a,b)=>a.at_ms<b.at_ms||a.at_ms===b.at_ms&&a.sequence<b.sequence;
 function schedule(atMs,index){
  if(!timeValid(atMs)||atMs<now||advanced&&atMs===now)throw Error("OBSERVATION_CLOCK_PAST_EVENT");
  if(!Number.isSafeInteger(index)||index<0||seen.has(index))throw Error("INVALID_OR_DUPLICATE_OBSERVATION_INDEX");
  if(sequence>=maxEvents)throw Error("OBSERVATION_CLOCK_CAPACITY");
  const item={at_ms:atMs,index,sequence:sequence++};seen.add(index);
  heap.push(item);let i=heap.length-1;
  while(i>0){const parent=(i-1)>>1;if(!before(heap[i],heap[parent]))break;[heap[i],heap[parent]]=[heap[parent],heap[i]];i=parent;}
 }
 function pop(){
  const first=heap[0],last=heap.pop();
  if(heap.length){heap[0]=last;let i=0;
   while(true){const l=i*2+1,r=l+1;let best=i;
    if(l<heap.length&&before(heap[l],heap[best]))best=l;
    if(r<heap.length&&before(heap[r],heap[best]))best=r;
    if(best===i)break;[heap[i],heap[best]]=[heap[best],heap[i]];i=best;
   }
  }
  return first;
 }
 function advanceTo(time){
  if(!timeValid(time)||time<now)throw Error("OBSERVATION_CLOCK_REWIND");
  const due=[];while(heap.length&&heap[0].at_ms<=time)due.push(pop());
  now=time;advanced=true;return due;
 }
 return {schedule,advanceTo,status:()=>({now_ms:now,pending_count:heap.length,scheduled_count:sequence,execution_enabled:false})};
}
