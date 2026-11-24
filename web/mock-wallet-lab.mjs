import {newLab,addWallet,previewRows,applyExercise,totals,UNIT_PRICE,MOCK_FEE} from "../src/inner-market/mock-wallet-lab.mjs";
let lab=addWallet(addWallet(addWallet(newLab())));
export function mountMockLab(host,{escape,table,metrics,record,download,runStress}){
 let pending=null;
 host.innerHTML='<div class="terminal-heading"><div><h3>虚拟钱包实验台</h3><small>虚构积分与 Token · 固定 10 积分/Token · 每笔固定费用 1 积分 · 无链上执行</small></div><div class="row"><button data-add>＋ 虚拟钱包</button><button data-pause></button><button data-reset>重置</button></div></div><div data-summary></div><div class="terminal-grid"><div><div data-wallets></div><p class="muted">选中钱包并输入整数 Token 数量；仅生成独立的本地记账练习。</p></div><div><label>方向 <select data-side><option>BUY</option><option>SELL</option></select></label><div class="row"><button data-preview>预览</button><button data-apply class="primary" disabled>确认模拟记账</button></div><div data-result role="status"></div></div></div><details><summary>模拟流水</summary><div data-events></div><button data-export>导出模拟日志</button></details><hr><h3>市场参与者风险实验</h3><p class="muted">复用固定合成压力场景；不生成参与者交易、攻击动作或真实概率。</p><div class="row"><label>随机种子 <input data-seed type="number" min="0" max="4294967295" value="42"></label><label>每类次数 <input data-runs type="number" min="1" max="1000" value="100"></label><button data-stress>运行风险实验</button></div><div data-stress-result role="status"></div>';
 const q=s=>host.querySelector(s);
 function invalidate(){pending=null;q("[data-apply]").disabled=true;q("[data-result]").textContent="";}
 function refresh(){
  invalidate();const t=totals(lab);
  q("[data-summary]").innerHTML=metrics([["虚拟钱包",lab.wallets.length],["积分余额",t.cash],["Token 库存",t.token],["模拟净值",t.nav],["模拟损益",t.pnl],["累计模拟费用",t.fees]]);
  q("[data-wallets]").innerHTML='<div class="scroll"><table><thead><tr><th>选择</th><th>钱包</th><th>积分</th><th>库存</th><th>数量</th></tr></thead><tbody>'+lab.wallets.map(w=>'<tr><td><input type="checkbox" aria-label="选择 '+escape(w.id)+'" data-id="'+escape(w.id)+'"></td><td>'+escape(w.id)+'</td><td>'+w.cash+'</td><td>'+w.token+'</td><td><input aria-label="'+escape(w.id)+' 数量" data-qty="'+escape(w.id)+'" type="number" min="1" max="1000000" step="1" value="1"></td></tr>').join("")+'</tbody></table></div>';
  q("[data-events]").innerHTML=table(["序号","钱包","方向","数量","积分变化","费用","状态"],lab.events.slice(-50).reverse().map(e=>[e.sequence,e.id,e.side,e.quantity,e.cashDelta,e.fee,e.status]));
  q("[data-pause]").textContent=lab.paused?"恢复实验":"暂停实验";q("[data-preview]").disabled=lab.paused;
 }
 q("[data-wallets]").addEventListener("input",invalidate);q("[data-wallets]").addEventListener("change",invalidate);q("[data-side]").onchange=invalidate;
 q("[data-add]").onclick=()=>{try{lab=addWallet(lab);refresh();record("mock.wallet.added",{count:lab.wallets.length});}catch(e){q("[data-result]").textContent=e.message}};
 q("[data-pause]").onclick=()=>{lab={...lab,paused:!lab.paused};refresh()};
 q("[data-reset]").onclick=()=>{if(confirm("重置全部虚拟钱包和实验流水？")){lab=addWallet(addWallet(addWallet(newLab())));refresh()}};
 q("[data-preview]").onclick=()=>{invalidate();try{const side=q("[data-side]").value,requests=[...host.querySelectorAll("[data-id]:checked")].map(el=>({id:el.dataset.id,quantity:Number(host.querySelector('[data-qty="'+el.dataset.id+'"]').value)}));const rows=previewRows(lab,side,requests);pending={side,requests};q("[data-result]").innerHTML=table(["钱包","积分变化","Token变化","费用"],rows.map(r=>[r.id,r.cashDelta,r.tokenDelta,r.fee]));q("[data-apply]").disabled=false;}catch(e){q("[data-result]").textContent=e.message}};
 q("[data-apply]").onclick=()=>{if(!pending)return;try{lab=applyExercise(lab,pending.side,pending.requests);refresh();q("[data-result]").textContent="模拟记账完成；未发送任何交易。";record("mock.exercise.completed",{event_count:lab.events.length})}catch(e){invalidate();q("[data-result]").textContent=e.message}};
 q("[data-export]").onclick=()=>download("cook-mock-wallet-lab.json",JSON.stringify({source:"SYNTHETIC",execution_enabled:false,...lab,totals:totals(lab)},null,2));
 q("[data-stress]").onclick=()=>{const out=q("[data-stress-result]");try{const result=runStress(Number(q("[data-seed]").value),Number(q("[data-runs]").value));out.innerHTML=metrics([["总实验数",result.total_trials],["预期匹配",result.total_matches]])+table(["角色","实验数","扰动次数","需复核","匹配"],result.summaries.map(r=>[r.role,r.runs,r.stress_trials,r.review_required,r.expected_outcome_matches]));record("mock.stress.completed",{trial_count:result.total_trials,match_count:result.total_matches})}catch(e){out.textContent=e.message}};
 refresh();
}
