import {constants} from "node:fs";
import {lstat,open} from "node:fs/promises";
/** Read at most limit+1 bytes from a single opened regular file. Reject a leaf
 * symlink, special file, oversized file, or a detected concurrent modification.
 * Parent directory ownership and trust remain an operator responsibility. */
export async function readBoundedRegularFile(path,limit=16*1024*1024){
 if(typeof path!=="string"||!path||!Number.isSafeInteger(limit)||limit<1||limit>128*1024*1024)throw Error("INVALID_FILE_READ_INPUT");
 const before=await lstat(path);
 if(!before.isFile()||before.isSymbolicLink()||before.size>limit)throw Error("FILE_INVALID_OR_TOO_LARGE");
 const flags=constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0);
 const f=await open(path,flags);
 try{
  const first=await f.stat();
  if(!first.isFile()||first.size>limit||first.dev!==before.dev||first.ino!==before.ino)throw Error("FILE_INVALID_OR_TOO_LARGE");
  const parts=[];let total=0;
  while(total<=limit){
   const part=Buffer.allocUnsafe(Math.min(65536,limit+1-total));
   const {bytesRead}=await f.read(part,0,part.length,null);
   if(bytesRead===0)break;
   total+=bytesRead;if(total>limit)throw Error("FILE_TOO_LARGE");
   parts.push(part.subarray(0,bytesRead));
  }
  const last=await f.stat();
  if(last.size!==first.size||last.mtimeMs!==first.mtimeMs||last.ctimeMs!==first.ctimeMs||total!==first.size)throw Error("FILE_CHANGED_DURING_READ");
  return Buffer.concat(parts,total);
 }finally{await f.close();}
}
