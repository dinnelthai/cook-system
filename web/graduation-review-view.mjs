import {reviewGraduationHistory} from "../src/inner-market/graduation-history-review.mjs";
const MAX_BYTES=16*1024*1024;
export function mountGraduationReview(host,{download,initial=null,onReview=()=>{}}={}){
 const doc=host.ownerDocument;
 host.innerHTML='<p class="muted">导入已有 Pump 历史回放 JSON（1.1.0），仅独立离线复核。不会切换操作台 Token、关联钱包或触发交易。来源认证与资金归属均未知。</p><label>历史回放文件<input type="file" accept=".json" data-file></label><div class="row"><button data-export disabled>导出审阅结果</button><button data-clear>清除本次审阅</button></div><p data-status role="status"></p><div data-results></div>';
 const q=s=>host.querySelector(s),result=q("[data-results]"),status=q("[data-status]"),exp=q("[data-export]");
 let review=initial,ticket=0;
 function table(title,headers,rows){
  const h=doc.createElement("h4");h.textContent=title;result.append(h);
  const wrap=doc.createElement("div");wrap.className="scroll";const t=doc.createElement("table"),head=doc.createElement("thead"),tr=doc.createElement("tr"),body=doc.createElement("tbody");
  for(const v of headers){const e=doc.createElement("th");e.textContent=v;tr.append(e);}head.append(tr);
  for(const row of rows){const r=doc.createElement("tr");for(const v of row){const e=doc.createElement("td");e.textContent=String(v??"未知");r.append(e);}body.append(r);}t.append(head,body);wrap.append(t);result.append(wrap);
 }
 function show(){
  result.replaceChildren();exp.disabled=!review;status.textContent=review?review.status+" · 来源未独立核验 · 不允许结算":"尚未导入回放文件";
  if(!review)return;
  const l=review.lifecycle;
  table("记录身份",["字段","值"],Object.entries(review.scope));
  table("毕业证据",["阶段","事件","签名","Slot"],[["创建",l.creation?.event_id,l.creation?.signature,l.creation?.slot],["内盘完成",l.completion?.event_id,l.completion?.signature,l.completion?.slot],["迁移",l.migration?.event_id,l.migration?.signature,l.migration?.slot]]);
  table("迁移输入（原始单位，非到账凭证）",["字段","值"],[["生命周期证据",l.phase],["池地址",l.migration_pool_address],["交易关联",l.transaction_link],...Object.entries(l.declared_amounts??{})]);
  table("外盘历史核对",["池地址","迁移关联","声明覆盖","重放","账户对账","Slot"],review.pools.map(p=>[p.pool_address,p.linked_to_migration?"声明匹配":"未核验",p.reported_coverage,p.replay_status,p.snapshot_status,p.snapshot_slot]));
  for(const p of review.pools)if(p.metrics)table("历史池快照 · "+p.pool_address,["字段","值"],Object.entries(p.metrics));
  table("待复核事项",["等级","事项","池地址"],review.issues.map(i=>[i.level,i.code,i.pool_address]));
 }
 q("[data-file]").onchange=async e=>{const n=++ticket,f=e.target.files?.[0];if(!f)return;try{if(f.size>MAX_BYTES)throw Error("FILE_TOO_LARGE");const next=reviewGraduationHistory(JSON.parse(await f.text()));if(n!==ticket||!host.isConnected)return;review=next;onReview(review);show();}catch(err){if(n===ticket&&host.isConnected)status.textContent="未载入新文件："+String(err.message).slice(0,160)+"；原审阅保留";}};
 q("[data-clear]").onclick=()=>{ticket++;review=null;q("[data-file]").value="";onReview(null);show();};
 exp.onclick=()=>{if(review)download("graduation-history-review.json",JSON.stringify(review,null,2));};
 show();
}
