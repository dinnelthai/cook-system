// Only the opaque creation request identifier survives a tab refresh.
// Never retain project input, wallet material, or signed transactions here.
const KEY="cook.project.create.pending.v1";
const valid=id=>typeof id==="string"&&/^[A-Za-z0-9-]{1,128}$/.test(id);
export function createProjectRequestRecovery(storage){
 return {
  read(){
   const id=storage.getItem(KEY);
   if(id===null)return null;
   if(!valid(id))throw Error("PROJECT_RECOVERY_RECORD_INVALID");
   return id;
  },
  remember(id){
   if(!valid(id))throw Error("INVALID_PROJECT_CREATE_REQUEST_ID");
   const existing=this.read();
   if(existing!==null&&existing!==id)throw Error("PROJECT_CREATE_UNCONFIRMED_RELOAD_REQUIRED");
   storage.setItem(KEY,id);
   if(this.read()!==id)throw Error("PROJECT_RECOVERY_STORAGE_UNAVAILABLE");
  },
  clear(id){
   if(this.read()===id)storage.removeItem(KEY);
  }
 };
}
