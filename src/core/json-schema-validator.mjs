import {readFile,readdir} from "node:fs/promises";
import {join,basename} from "node:path";
const META=new Set(["$schema","$id","title","description","default","examples","deprecated","readOnly","writeOnly"]);
const SUPPORTED=new Set(["$ref","type","const","enum","required","properties","additionalProperties","items","pattern","minLength","maxLength","minimum","maximum","allOf","anyOf","oneOf","if","then"]);
const stable=value=>value===null||typeof value!=="object"?JSON.stringify(value):Array.isArray(value)?"["+value.map(stable).join(",")+"]":"{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+stable(value[k])).join(",")+"}";
const typeMatches=(value,type)=>(Array.isArray(type)?type:[type]).some(t=>t==="null"?value===null:t==="array"?Array.isArray(value):t==="object"?value!==null&&typeof value==="object"&&!Array.isArray(value):t==="integer"?typeof value==="number"&&Number.isInteger(value):t==="number"?typeof value==="number"&&Number.isFinite(value):t==="string"?typeof value==="string":t==="boolean"?typeof value==="boolean":false);
export async function loadSchemaRegistry(directory){
 const names=(await readdir(directory)).filter(n=>n.endsWith(".schema.json")).sort(),registry=new Map();
 for(const name of names)registry.set(name,JSON.parse(await readFile(join(directory,name),"utf8")));
 return registry;
}
const object=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const TYPES=new Set(["null","array","object","integer","number","string","boolean"]);
/** Check the entire supported schema subset before inspecting instance data.
 * Unsupported rules, malformed keyword values and reference cycles are errors
 * even in branches not visited by this particular instance. */
export function inspectSchemaContract(schema,registry){
 const errors=[],active=new Set(),checked=new Set();
 const add=(path,code,detail)=>{if(errors.length<100)errors.push({path,code,detail});};
 function visit(s,path,depth){
  if(depth>64){add(path,"MAX_SCHEMA_DEPTH","schema recursion limit exceeded");return;}
  if(!object(s)){add(path,"INVALID_SCHEMA","schema node must be an object");return;}
  if(active.has(s)){add(path,"SCHEMA_REFERENCE_CYCLE","recursive schemas are unsupported");return;}
  if(checked.has(s))return;
  active.add(s);
  for(const key of Object.keys(s))if(!META.has(key)&&!SUPPORTED.has(key))add(path,"UNSUPPORTED_SCHEMA_KEYWORD",key);
  if(Object.hasOwn(s,"$ref")){
   const ref=s.$ref;
   if(typeof ref!=="string"||!/^[a-zA-Z0-9_-]+\.schema\.json$/.test(ref))add(path,"INVALID_SCHEMA_REF",String(ref));
   else if(!registry?.has(ref))add(path,"UNRESOLVED_SCHEMA_REF",ref);
   else visit(registry.get(ref),path+".$ref",depth+1);
   if(Object.keys(s).some(k=>k!=="$ref"&&!META.has(k)))add(path,"UNSUPPORTED_REF_SIBLING","reference siblings are unsupported");
  }
  if(Object.hasOwn(s,"type")){
   const types=Array.isArray(s.type)?s.type:[s.type];
   if(!types.length||new Set(types).size!==types.length||types.some(t=>!TYPES.has(t)))add(path,"INVALID_SCHEMA_TYPE","invalid type");
  }
  if(Object.hasOwn(s,"enum")&&(!Array.isArray(s.enum)||!s.enum.length))add(path,"INVALID_SCHEMA_ENUM","nonempty enum required");
  if(Object.hasOwn(s,"required")&&(!Array.isArray(s.required)||s.required.some(k=>typeof k!=="string")||new Set(s.required).size!==s.required.length))add(path,"INVALID_SCHEMA_REQUIRED","unique strings required");
  if(Object.hasOwn(s,"minLength")&&(!Number.isSafeInteger(s.minLength)||s.minLength<0))add(path,"INVALID_SCHEMA_MIN_LENGTH","nonnegative integer required");
  if(Object.hasOwn(s,"maxLength")&&(!Number.isSafeInteger(s.maxLength)||s.maxLength<0))add(path,"INVALID_SCHEMA_MAX_LENGTH","nonnegative integer required");
  for(const k of ["minimum","maximum"])if(Object.hasOwn(s,k)&&(typeof s[k]!=="number"||!Number.isFinite(s[k])))add(path,"INVALID_SCHEMA_BOUND",k);
  if(Object.hasOwn(s,"pattern")){try{if(typeof s.pattern!=="string")throw Error();new RegExp(s.pattern);}catch{add(path,"INVALID_PATTERN","invalid pattern");}}
  if(Object.hasOwn(s,"properties")){
   if(!object(s.properties))add(path,"INVALID_SCHEMA_PROPERTIES","object required");
   else for(const [k,v] of Object.entries(s.properties))visit(v,path+".properties."+k,depth+1);
  }
  if(Object.hasOwn(s,"additionalProperties")&&typeof s.additionalProperties!=="boolean")visit(s.additionalProperties,path+".additionalProperties",depth+1);
  for(const k of ["items","if","then"])if(Object.hasOwn(s,k))visit(s[k],path+"."+k,depth+1);
  for(const keyword of ["allOf","anyOf","oneOf"]){if(Object.hasOwn(s,keyword)){
   if(!Array.isArray(s[keyword])||!s[keyword].length)add(path,"INVALID_SCHEMA_"+keyword.toUpperCase(),"nonempty array required");
   else s[keyword].forEach((v,i)=>visit(v,path+"."+keyword+"["+i+"]",depth+1));
  }}
  active.delete(s);checked.add(s);
 }
 visit(schema,"$",0);return {valid:errors.length===0,errors};
}
export function validateJsonSchema(value,schema,registry,{maxErrors=100}={}){
 if(!Number.isSafeInteger(maxErrors)||maxErrors<1||maxErrors>1000)throw Error("INVALID_SCHEMA_ERROR_LIMIT");
 const contract=inspectSchemaContract(schema,registry);if(!contract.valid)return {valid:false,errors:contract.errors.slice(0,maxErrors)};
 const errors=[],add=(path,code,detail)=>{if(errors.length<maxErrors)errors.push({path,code,detail});};
 const visit=(v,s,path,depth)=>{
  if(errors.length>=maxErrors)return;
  if(depth>64){add(path,"MAX_SCHEMA_DEPTH","schema recursion limit exceeded");return;}
  if(!s||typeof s!=="object"||Array.isArray(s)){add(path,"INVALID_SCHEMA","schema node must be an object");return;}
  for(const key of Object.keys(s))if(!META.has(key)&&!SUPPORTED.has(key))add(path,"UNSUPPORTED_SCHEMA_KEYWORD",key);
  if(s.$ref!==undefined){
   if(typeof s.$ref!=="string"||s.$ref.includes("..")||s.$ref.includes("/")||!s.$ref.endsWith(".schema.json")){add(path,"INVALID_SCHEMA_REF",String(s.$ref));return;}
   const target=registry.get(basename(s.$ref));if(!target){add(path,"UNRESOLVED_SCHEMA_REF",s.$ref);return;}visit(v,target,path,depth+1);return;
  }
  if(s.type!==undefined&&!typeMatches(v,s.type)){add(path,"TYPE_MISMATCH",JSON.stringify(s.type));return;}
  if(Object.hasOwn(s,"const")&&stable(v)!==stable(s.const))add(path,"CONST_MISMATCH",String(s.const));
  if(Array.isArray(s.enum)&&!s.enum.some(item=>stable(item)===stable(v)))add(path,"ENUM_MISMATCH","value is not in enum");
  if(typeof v==="string"){
   if(Number.isInteger(s.minLength)&&[...v].length<s.minLength)add(path,"MIN_LENGTH","minimum length "+s.minLength);
   if(Number.isInteger(s.maxLength)&&[...v].length>s.maxLength)add(path,"MAX_LENGTH","maximum length "+s.maxLength);
   if(typeof s.pattern==="string"){let re;try{re=new RegExp(s.pattern);}catch{add(path,"INVALID_PATTERN",s.pattern);}if(re&&!re.test(v))add(path,"PATTERN_MISMATCH",s.pattern);}
  }
  if(typeof v==="number"){
   if(typeof s.minimum==="number"&&v<s.minimum)add(path,"MINIMUM","minimum "+s.minimum);
   if(typeof s.maximum==="number"&&v>s.maximum)add(path,"MAXIMUM","maximum "+s.maximum);
  }
  if(v!==null&&typeof v==="object"&&!Array.isArray(v)){
   if(Array.isArray(s.required))for(const key of s.required)if(!Object.hasOwn(v,key))add(path,"REQUIRED_PROPERTY_MISSING",key);
   const props=s.properties??{};
   for(const [key,child] of Object.entries(props))if(Object.hasOwn(v,key))visit(v[key],child,path+"."+key,depth+1);
   for(const [key,child] of Object.entries(v))if(!Object.hasOwn(props,key)){
    if(s.additionalProperties===false)add(path+"."+key,"ADDITIONAL_PROPERTY","property is not allowed");
    else if(s.additionalProperties&&typeof s.additionalProperties==="object")visit(child,s.additionalProperties,path+"."+key,depth+1);
   }
  }
  if(Array.isArray(v)&&s.items!==undefined)for(let i=0;i<v.length;i++)visit(v[i],s.items,path+"["+i+"]",depth+1);
  if(Array.isArray(s.allOf))for(const child of s.allOf)visit(v,child,path,depth+1);
  for(const keyword of ["anyOf","oneOf"]){if(Array.isArray(s[keyword])){const matches=s[keyword].map(child=>{const before=errors.length;visit(v,child,path,depth+1);const ok=errors.length===before;if(!ok)errors.splice(before);return ok});const valid=keyword==="oneOf"?matches.filter(Boolean).length===1:matches.some(Boolean);if(!valid)add(path,keyword==="oneOf"?"ONE_OF_MISMATCH":"ANY_OF_MISMATCH","schema branch mismatch")}}
  if(s.if!==undefined){const before=errors.length;visit(v,s.if,path,depth+1);const matches=errors.length===before;if(!matches)errors.splice(before);else if(s.then!==undefined)visit(v,s.then,path,depth+1);}
 };
 visit(value,schema,"$",0);return {valid:errors.length===0,errors};
}
