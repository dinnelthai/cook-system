import {readFile,readdir} from "node:fs/promises";
import {join,basename} from "node:path";
const META=new Set(["$schema","$id","title","description","default","examples","deprecated","readOnly","writeOnly"]);
const SUPPORTED=new Set(["$ref","type","const","enum","required","properties","additionalProperties","items","pattern","minLength","minimum","maximum","allOf","if","then"]);
const stable=value=>value===null||typeof value!=="object"?JSON.stringify(value):Array.isArray(value)?"["+value.map(stable).join(",")+"]":"{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+stable(value[k])).join(",")+"}";
const typeMatches=(value,type)=>(Array.isArray(type)?type:[type]).some(t=>t==="null"?value===null:t==="array"?Array.isArray(value):t==="object"?value!==null&&typeof value==="object"&&!Array.isArray(value):t==="integer"?typeof value==="number"&&Number.isInteger(value):t==="number"?typeof value==="number"&&Number.isFinite(value):t==="string"?typeof value==="string":t==="boolean"?typeof value==="boolean":false);
export async function loadSchemaRegistry(directory){
 const names=(await readdir(directory)).filter(n=>n.endsWith(".schema.json")).sort(),registry=new Map();
 for(const name of names)registry.set(name,JSON.parse(await readFile(join(directory,name),"utf8")));
 return registry;
}
export function validateJsonSchema(value,schema,registry,{maxErrors=100}={}){
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
  if(s.if!==undefined){const before=errors.length;visit(v,s.if,path,depth+1);const matches=errors.length===before;if(!matches)errors.splice(before);else if(s.then!==undefined)visit(v,s.then,path,depth+1);}
 };
 visit(value,schema,"$",0);return {valid:errors.length===0,errors};
}
