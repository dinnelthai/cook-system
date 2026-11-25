/** Read-only saved revision viewer. DOM textContent for all imported values.
 * A superseded request cannot render into the new selection or page. */
export function mountSavedProjectReview(root,{query,revision}){
 const doc=root.ownerDocument;
 const create=(tag,text,parent=root)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=String(text);parent.append(el);return el;};
 const show=v=>v==null?"未知":typeof v==="object"?JSON.stringify(v):String(v);
 const table=(parent,headers,rows)=>{const wrap=create("div",undefined,parent);wrap.className="scroll";const t=create("table",undefined,wrap),head=create("thead",undefined,t),hr=create("tr",undefined,head);for(const h of headers)create("th",h,hr);const body=create("tbody",undefined,t);for(const row of rows){const tr=create("tr",undefined,body);for(const cell of row)create("td",show(cell),tr);}return t;};
 const label=create("p","仅查看指定数据库版本，不包含未保存的会话修改；不会改变操作台或钱包。");
 label.className="muted";
 if(revision===null){create("p","请先读取或保存数据库工作区。");return;}
 create("p","固定版本 V"+revision);
 const load=create("button","查询已保存项目"),status=create("p","尚未查询");status.setAttribute("role","status");
 const projectSelect=create("select");projectSelect.setAttribute("aria-label","已保存项目");projectSelect.disabled=true;
 const recordSelect=create("select");recordSelect.setAttribute("aria-label","已保存历史区间");recordSelect.disabled=true;
 const body=create("div"),evidence=create("div");
 let ticket=0,projects=[],records=[],digest;
 const current=n=>n===ticket&&root.isConnected;
 const reset=(select)=>{select.replaceChildren();create("option","请选择",select).value="";select.value="";select.disabled=true;};
 const fill=(select,rows,format)=>{reset(select);rows.forEach((x,i)=>{create("option",format(x),select).value=String(i);});select.disabled=!rows.length;};
 const request=async(options)=>{const result=await query({revision,...options});if(result.revision!==revision)throw Error("REVISION_MISMATCH");if(options.kind==="projects")digest=result.digest;else if(result.digest!==digest)throw Error("REVISION_DIGEST_MISMATCH");return result;};
 const fail=n=>{if(current(n))status.textContent="查询未完成，请重新选择或查询；未确认数据不显示。";};
 load.onclick=async()=>{const n=++ticket;load.disabled=true;reset(projectSelect);reset(recordSelect);body.replaceChildren();evidence.replaceChildren();status.textContent="查询中";
  try{const result=await request({kind:"projects"});if(!current(n))return;projects=result.projects;fill(projectSelect,projects,p=>p.project_id+" · "+p.source_mode+" · "+p.identity_status);status.textContent=projects.length?"请选择项目":"该版本没有项目";}
  catch{fail(n);}finally{if(current(n))load.disabled=false;}
 };
 projectSelect.onchange=async()=>{const n=++ticket;reset(recordSelect);body.replaceChildren();evidence.replaceChildren();if(projectSelect.value===""){status.textContent="请选择项目";return;}const project=projects[Number(projectSelect.value)];status.textContent="查询区间";
  try{const result=await request({kind:"project",projectKey:project.key});if(!current(n))return;if(result.project.key!==project.key)throw Error("PROJECT_MISMATCH");records=result.records;fill(recordSelect,records,r=>r.openingCutoff+" → "+r.closingCutoff+" · "+r.audit_status);status.textContent="请选择历史区间";}
  catch{fail(n);}
 };
 recordSelect.onchange=async()=>{const n=++ticket;body.replaceChildren();evidence.replaceChildren();if(recordSelect.value===""){status.textContent="请选择历史区间";return;}const project=projects[Number(projectSelect.value)],record=records[Number(recordSelect.value)],keys={projectKey:project.key,recordKey:record.key};status.textContent="查询历史报告";
  try{const result=await request({kind:"record",...keys});if(!current(n))return;if(result.project_key!==keys.projectKey||result.record_key!==keys.recordKey)throw Error("RECORD_MISMATCH");
   create("h3","历史财务与审计",body);
   table(body,["状态","结果"],[["内部审计",result.status],["来源认证",result.source_attestation],["证据完整性",result.trust.dimensions.evidence_completeness],["结算","不可执行"]]);
   table(body,["财务指标（原始单位）","数值"],Object.entries(result.accounting));
   table(body,["检查","状态","证据"],result.checks.map(c=>[c.id,c.status,c.evidence]));
   table(body,["风险","级别","原因"],result.risk.alerts.map(a=>[a.label,a.severity,a.reason]));
   status.textContent="报告已读取 · V"+revision;
   const next=create("button","读取事件证据",body);let offset=0;
   next.onclick=async()=>{if(!current(n))return;next.disabled=true;
    try{const page=await request({kind:"events",...keys,offset,limit:50});if(!current(n))return;if(page.record.record_key!==keys.recordKey||page.record.project_key!==keys.projectKey||page.offset!==offset)throw Error("EVENT_PAGE_MISMATCH");
     evidence.replaceChildren();table(evidence,["证据状态","事件数","工作区跨报告审计"],[[page.record.status,page.record.event_count,page.workspace_archive_status]]);
     table(evidence,["事件","类别","库存引用","现金引用"],page.events.map(e=>[e.event_id,e.event_kind,e.inventory_journal_reference,e.cash_posting_references.map(x=>x.posting_id).join(", ")]));
     status.textContent="事件证据 · 偏移 "+offset+" · V"+revision;
     if(page.next_offset!==null){offset=page.next_offset;next.textContent="下一页";next.disabled=false;}else{next.textContent="已到末页";}
    }catch{if(current(n)){evidence.replaceChildren();fail(n);next.disabled=false;}}
   };
  }catch{if(current(n)){body.replaceChildren();evidence.replaceChildren();fail(n);}}
 };
}
