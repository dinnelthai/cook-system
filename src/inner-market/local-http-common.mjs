/** Transport helpers only. Authorization remains at the loopback boundary. */
export function sendJson(res,status,body){
 const json=JSON.stringify(body);
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
 res.end(json);
}
export async function readRequestJson(req,maxBytes){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>128*1024*1024)throw Error("INVALID_BODY_LIMIT");
 const chunks=[];let total=0,tooLarge=false;
 for await(const part of req){
  if(tooLarge)continue;
  const chunk=Buffer.isBuffer(part)?part:Buffer.from(part);
  if(chunk.length>maxBytes-total){tooLarge=true;chunks.length=0;continue;}
  total+=chunk.length;chunks.push(chunk);
 }
 if(tooLarge)throw Error("BODY_TOO_LARGE");
 try{return new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks,total));}catch{throw Error("INVALID_BODY_ENCODING");}
}
