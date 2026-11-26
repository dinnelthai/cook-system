import {formatDeclaredSupply,parseDeclaredSupply,preserveDraftRegistration} from "./project-integrity-view.mjs";
import {lifecycleLabel,operationalLabel,limitFields,budgetInputValue,parseBudgetDeclaration,projectWalletRegistrationRows} from "./project-operator-view.mjs";
import {createProjectRequestRecovery} from "./project-request-recovery.mjs";
import { lookupCreateRequest, listProjects, getProject, createProject, appendProjectCommand, getProjectConfig, inspectProjectEvidence, listProjectArchive, inspectProjectMarket, listProjectReportCandidates, linkProjectReport } from "./project-client.mjs";

const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";
const commandId = () => globalThis.crypto?.randomUUID?.() ?? ("project-ui-" + Date.now() + "-" + Math.random().toString(36).slice(2));

export function mountProjectSetup(container, {
  initialProjectId = null, onActiveProjectId = () => {}, initialMessage = "", terminalMode = false,
  isActive = () => true, screenHeading, panel, note, table, esc, download,
  projectRegistry, record = () => {}, errorKind = error => error?.message ?? "UNKNOWN_ERROR"
} = {}) {
  let projects = [], config = null, activeProjectId = initialProjectId, message = initialMessage;
  let loading = true, loadError = "", viewVersion = 0;
  // Retry the same immutable request after an uncertain acknowledgement.
  // Bound this cache to the current mounted view; do not retry automatically.
  const pendingCommands=new Map();
  let pendingCreate=null,recovery=null,recoveryId=null,recoveryError="";
  try{
    recovery=createProjectRequestRecovery(globalThis.sessionStorage);
    recoveryId=recovery.read();
  }catch{recoveryError="PROJECT_RECOVERY_STORAGE_UNAVAILABLE";}

  function setActive(id) {
    activeProjectId = id;
    onActiveProjectId(id);
  }
  async function append(project, type, payload) {
    const key=JSON.stringify([project.project_id,project.revision,type,payload]);
    if(!pendingCommands.has(key)){
      if(pendingCommands.size>=64)throw Error("PROJECT_PENDING_REQUEST_LIMIT");
      pendingCommands.set(key,commandId());
    }
    const result = await appendProjectCommand(project.project_id, {
      command_id: pendingCommands.get(key), type, payload
    }, project.revision);
    pendingCommands.delete(key);
    return result.aggregate;
  }
  function renderLoading() {
    container.innerHTML = screenHeading("项目配置", "项目登记 · 本地 SQLite") +
      note(loadError ? "项目读取失败：" + loadError : "正在加载本地项目登记…");
    if (loadError) {
      const button = document.createElement("button");
      button.textContent = "重试";
      button.onclick = load;
      container.append(button);
    }
  }
  async function load() {
    loading = true; loadError = ""; renderLoading();
    try {
      const [nextProjects, nextConfig] = await Promise.all([listProjects(), getProjectConfig()]);
      if (!isActive()) return;
      projects = nextProjects; config = nextConfig; loading = false; render();
    } catch (error) {
      if (!isActive()) return;
      loading = false; loadError = errorKind(error); renderLoading();
    }
  }
  function render() {
    if (!isActive()) return;
    if (loading) { renderLoading(); return; }
    const version = ++viewVersion;
    const current = activeProjectId ? projects.find(x => x.project_id === activeProjectId) : null;
    const missingSelection=Boolean(activeProjectId&&!current);
    const editable = !missingSelection && (!current || current.lifecycle.stage === "DRAFT");
    const lock = editable ? "" : " disabled";
    const projectRows = projects.map(x => [
      x.profile.name, x.profile.symbol,
      x.token.supply_base_units === null ? "未配置" : x.token.supply_base_units + " 基础单位 / " + x.token.decimals + " decimals",
      x.token.creator_wallet_address || "未分配钱包",
      lifecycleLabel(x.lifecycle.stage) + " · " + operationalLabel(x.lifecycle.operational_status),
      x.token.issuance_status
    ]);
    const options = projects.map(x => '<option value="' + esc(x.project_id) + '"' +
      (x.project_id === activeProjectId ? " selected" : "") + '>' +
      esc(x.profile.name + " · " + x.profile.symbol + " · " + x.lifecycle.stage) + '</option>').join("");
    const issuanceOptions = projects.filter(x => ["READY", "LAUNCH_SUBMITTED"].includes(x.lifecycle.stage)).map(x => '<option value="' + esc(x.project_id) + '"' +
      '>' + esc(x.profile.name + " · " + x.profile.symbol + " · " + x.lifecycle.stage) + '</option>').join("");
    let legacyCount = 0;
    try { legacyCount = projectRegistry?.list?.().length ?? 0; } catch {}
    const currentSupply = current ? formatDeclaredSupply(current.token.supply_base_units,current.token.decimals) : "1000000000";
    const readyAllowed = Boolean(current && current.lifecycle.stage === "DRAFT" &&
      current.network.genesis_hash && current.token.supply_base_units && current.token.creator_wallet_address &&
      current.wallet_groups.some(g => g.purpose === "DEV" &&
        g.members.some(m => m.wallet_address === current.token.creator_wallet_address && m.enabled)));
    const launchSubmitAllowed = Boolean(current && current.lifecycle.stage === "READY" &&
      current.token.mint && current.token.issuance_signature);
    const issuanceRows = projects.filter(x => x.token.mint).map(x => [
      x.profile.name, x.token.mint, x.token.issuance_signature,
      x.token.issuance_status, x.token.verification_evidence_ref || "等待链上验证"
    ]);

    container.innerHTML = screenHeading("发行准备", terminalMode?"配置代币与创建者钱包":"项目配置 · 风险声明 · 历史证据") +
      note(terminalMode?"保存 Localnet 草稿，保存不会发行代币。":"本地项目资料 · 发行记录") +
      (recoveryId||recoveryError?panel("恢复保存请求",'<p id="project-recovery-status" role="status" class="muted">'+esc(recoveryError||"存在未确认的创建请求，请查询保存结果，不要自动重发。")+'</p><button id="project-recovery-check"'+(recoveryError?" disabled":"")+'>检查上次保存</button>'):"")+
      (missingSelection?note("此前选择的项目不存在，请打开现有项目或新建草稿。"):"")+
      '<div class="setup-workspace"><div class="setup-primary">'+
      panel("项目配置", '<form id="project-draft-form"><h4 class="form-section-title">代币详情与供应量</h4><div class="grid form-section">' +
        '<div><label for="draft-name">项目名称</label><input id="draft-name" name="name" required maxlength="32" value="' + esc(current?.profile.name ?? "") + '" placeholder="项目名称"' + lock + '></div>' +
        '<div><label for="draft-symbol">代币符号</label><input id="draft-symbol" name="symbol" required maxlength="10" pattern="[A-Za-z0-9]{1,10}" value="' + esc(current?.profile.symbol ?? "") + '" placeholder="TOKEN"' + lock + '></div>' +
        '<div><label for="draft-supply">总供应量（代币）</label><input id="draft-supply" name="supply" inputmode="decimal" maxlength="30" value="' + esc(currentSupply) + '"' + lock + '></div>' +
        '<div><label for="draft-decimals">小数位</label><input id="draft-decimals" name="decimals" type="number" min="0" max="9" step="1" value="' + esc(current ? current.token.decimals??"" : 6) + '"' + lock + '></div>' +
        '</div><h4 class="form-section-title">网络与已登记钱包</h4><div class="grid form-section">'+
        '<div><label for="draft-quote">报价资产</label><input id="draft-quote" value="SOL" disabled><input type="hidden" name="quote_asset" value="SOL"></div>' +
        '<div><label for="draft-network">网络</label><input id="draft-network" value="Localnet (Local verification)" disabled><input type="hidden" name="network" value="localnet"></div>' +
        '<div><label for="draft-genesis">本地创世哈希</label><input id="draft-genesis" value="' + esc(current?.network.genesis_hash ?? config?.network?.genesis_hash ?? "未配置") + '" disabled></div>' +
        '<div><label for="project-wallet">创建者钱包</label><select name="creator_wallet" id="project-wallet"' + lock + '><option value="">正在加载已管理钱包…</option></select></div>' +
        '</div><details class="profile-optional"><summary>公开资料与描述（可选）</summary><div class="grid form-section">'+
        '<div><label for="draft-website">网站</label><input id="draft-website" name="website" type="url" value="' + esc(current?.profile.website ?? "") + '" placeholder="https://"' + lock + '></div>' +
        '<div><label for="draft-telegram">Telegram</label><input id="draft-telegram" name="telegram" type="url" value="' + esc(current?.profile.telegram ?? "") + '" placeholder="https://"' + lock + '></div>' +
        '<div><label for="draft-twitter">Twitter / X</label><input id="draft-twitter" name="twitter" type="url" value="' + esc(current?.profile.twitter ?? "") + '" placeholder="https://"' + lock + '></div>' +
        '<div style="grid-column:1/-1"><label for="draft-description">描述</label><textarea id="draft-description" name="description" maxlength="1000"' + lock + '>' + esc(current?.profile.description ?? "") + '</textarea></div>' +
        '</div></details><p class="muted">Supply is converted exactly to base units. Leave supply and decimals blank if unknown. Only public wallet addresses are stored.</p>' +
        '<div class="row"><button type="submit" class="primary"' + (editable ? "" : " disabled") + '>Save Configuration</button><button type="button" id="project-new">新建项目</button></div></form>' +
        '<p id="project-wallet-status" class="muted" role="status">钱包列表未加载</p><p id="project-status" role="status" class="muted">' + esc(message) + '</p>') +
      '</div><aside class="setup-secondary">'+
      panel("项目选择与状态", '<div class="setup-summary">'+esc(current?current.profile.name+" · "+current.profile.symbol+" · v"+current.revision:"未选择项目")+'</div>'+note(current?lifecycleLabel(current.lifecycle.stage)+" · "+operationalLabel(current.lifecycle.operational_status):"选择现有项目或新建草稿。") +
        '<div class="row"><select id="project-open-select"><option value="">选择项目</option>' + options + '</select>' +
        '<button id="project-open" ' + (projects.length ? "" : "disabled") + '>打开项目</button>' +
        '<button id="project-export">导出项目登记</button>' +
        '<button id="project-legacy-export" ' + (legacyCount ? "" : "disabled") + '>Export Legacy Browser Registry (' + legacyCount + ')</button></div>' +
        '<div class="row"><button id="project-mark-ready" ' + (readyAllowed ? "" : "disabled") + '>标记配置就绪</button>' +
        '<button id="project-launch-submitted" ' + (launchSubmitAllowed ? "" : "disabled") + '>Record Issuance Submission</button></div><details><summary>All Projects（'+projects.length+'）</summary>'+table(["Project", "Symbol", "Supply", "开发者钱包", "生命周期 / 运营状态", "发行验证"], projectRows)+'</details>') +
      (current?panel("项目风险限额",note("Declared limits only; not funds, permission or risk approval. Blank means unset; zero means an explicit zero limit. Changes create a new revision.")+
        '<form id="project-budget-form"><div class="grid">'+limitFields.map(([k,label])=>'<label>'+esc(label)+'<input name="'+k+'" inputmode="decimal" maxlength="30" value="'+esc(budgetInputValue(current.limits[k]))+'"></label>').join("")+
        '<label>Maximum Drawdown (bps; 100 bps = 1%)<input name="max_drawdown_bps" inputmode="numeric" maxlength="5" value="'+esc(current.limits.max_drawdown_bps??"")+'"></label></div><button type="submit">保存风险限额</button><p id="project-budget-status" role="status"></p></form>')+
        panel("已登记项目钱包",table(["Group","Purpose","Address","Role","登记状态","声明限额","归属证据"],projectWalletRegistrationRows(current))+note("Registration only; not evidence of balances, ownership or reserved funds.")):"")+
      '</aside></div><details class="panel setup-evidence"><summary>发行、市场与报告证据</summary><div class="setup-evidence-grid">'+
      panel("记录发行证据", '<form id="issuance-evidence-form"><label for="issuance-project">项目</label><select id="issuance-project" name="project_id" required><option value="">选择项目</option>' + issuanceOptions + '</select>' +
        '<label for="issuance-mint">代币 Mint 地址</label><input id="issuance-mint" name="mint" required maxlength="44" placeholder="Issued token mint address">' +
        '<label for="issuance-signature">交易签名</label><input id="issuance-signature" name="signature" required minlength="64" maxlength="88" placeholder="On-chain transaction signature">' +
        '<div class="row"><button type="submit" ' + (projects.length ? "" : "disabled") + '>记录证据（未验证）</button></div></form>' +
        '<p class="muted">Manual records remain unverified. Trusted on-chain verification is required for LAUNCHED.</p>') +
      panel("发行证据记录", table(["Project", "Mint", "交易签名", "Status", "验证证据"], issuanceRows) +
        '<div class="row"><button id="project-inspect-evidence"' + (current?.token.mint ? "" : " disabled") + '>Verify Issuance Evidence (Read-only)</button></div><p id="project-evidence-result" role="status" class="muted">Observations do not automatically advance lifecycle.</p><div id="project-evidence-archive"></div>')+
      panel("市场账户观测",table(["市场 ID","交易场所","Account","登记状态"],(current?.markets??[]).map(m=>[m.market_id,m.venue,m.market_account,m.verification_status]))+
        '<select id="project-market-select">'+(current?.markets??[]).map(m=>'<option value="'+esc(m.market_id)+'">'+esc(m.market_id+" · "+m.venue)+'</option>').join("")+'</select><button id="project-market-inspect"'+(current?.markets?.length?"":" disabled")+'>Verify & Archive (Read-only)</button><p id="project-market-result" role="status" class="muted">Checks registered market identity only; source is not attested.</p>')+
      panel("关联历史报告",'<button id="project-report-candidates"'+(current?"":" disabled")+'>查找匹配报告</button><select id="project-report-select" disabled></select><button id="project-report-link" disabled>关联选中报告</button><p id="project-report-result" role="status" class="muted">Only saved reports with matching declared identity can be linked.</p>')+'</div></details>';
    if(terminalMode)mountLaunchSteps(container.querySelector("#project-draft-form"));
    // Native validation must reveal a collapsed optional field before trying to focus it.
    container.querySelector("#project-draft-form").addEventListener("invalid",event=>{
      const section=event.target.closest("details");
      if(section&&!section.open)section.open=true;
    },true);
    const recoveryButton=container.querySelector("#project-recovery-check");
    if(recoveryButton)recoveryButton.onclick=async()=>{
      if(!recoveryId||recoveryError)return;
      const id=recoveryId,target=container.querySelector("#project-recovery-status");
      recoveryButton.disabled=true;
      try{
        const r=await lookupCreateRequest(id);
        if(!isActive()||version!==viewVersion)return;
        if(r.status==="NOT_OBSERVED"){target.textContent="No save record observed. Original request may still complete; check again.";return;}
        recovery.clear(id);recoveryId=null;pendingCreate=null;
        projects=[...projects.filter(p=>p.project_id!==r.project.project_id),r.project];
        setActive(r.project.project_id);message="Previous saved project found; no request was resubmitted.";render();
      }catch(error){if(isActive()&&version===viewVersion)target.textContent=errorKind(error);}
      finally{if(isActive()&&version===viewVersion)recoveryButton.disabled=false;}
    };
    const marketButton=container.querySelector("#project-market-inspect");
    marketButton.onclick=async()=>{
      marketButton.disabled=true;
      const target=container.querySelector("#project-market-result");
      try{
        const result=await inspectProjectMarket(current.project_id,container.querySelector("#project-market-select").value,current.revision);
        if(!isActive()||version!==viewVersion)return;
        target.textContent=result.observation.status+" · "+result.observation.checks.join(" / ")+" · Archived; not independently verified.";
        await loadEvidenceArchive();
      }catch(error){if(isActive()&&version===viewVersion)target.textContent=errorKind(error);}
      finally{if(isActive()&&version===viewVersion)marketButton.disabled=false;}
    };
    let candidates=null;
    const candidateButton=container.querySelector("#project-report-candidates"),reportSelect=container.querySelector("#project-report-select"),linkButton=container.querySelector("#project-report-link"),reportResult=container.querySelector("#project-report-result");
    candidateButton.onclick=async()=>{
      candidateButton.disabled=true;linkButton.disabled=true;reportSelect.disabled=true;candidates=null;reportSelect.replaceChildren();
      try{
        const result=await listProjectReportCandidates(current.project_id);
        if(!isActive()||version!==viewVersion)return;
        if(result.project_revision!==current.revision)throw Error("PROJECT_REVISION_CONFLICT");
        candidates=result;
        for(const row of result.records)reportSelect.add(new Option(row.openingCutoff+" → "+row.closingCutoff+" · "+row.audit_status,row.key));
        reportSelect.disabled=!result.records.length;linkButton.disabled=!result.records.length;
        reportResult.textContent="Workspace revision "+result.workspace_revision+" · "+result.records.length+" matching declared-identity reports.";
      }catch(error){if(isActive()&&version===viewVersion)reportResult.textContent=errorKind(error);}
      finally{if(isActive()&&version===viewVersion)candidateButton.disabled=false;}
    };
    linkButton.onclick=async()=>{
      if(!candidates||!reportSelect.value)return;
      linkButton.disabled=true;candidateButton.disabled=true;reportSelect.disabled=true;
      try{
        await linkProjectReport(current.project_id,candidates.workspace_revision,reportSelect.value,current.revision);
        if(!isActive()||version!==viewVersion)return;
        reportResult.textContent="Link archived · Not live data; source not independently attested.";
        await loadEvidenceArchive();
      }catch(error){if(isActive()&&version===viewVersion)reportResult.textContent=errorKind(error);}
      finally{if(isActive()&&version===viewVersion){linkButton.disabled=false;candidateButton.disabled=false;reportSelect.disabled=false;}}
    };
    async function loadEvidenceArchive(){
      if(!current)return;
      const target=container.querySelector("#project-evidence-archive");
      try{
        const records=await listProjectArchive(current.project_id);
        if(!isActive()||version!==viewVersion)return;
        target.innerHTML=table(["归档类型","项目版本","记录时间","结果","Status"],records.map(r=>[r.kind,r.project_revision,new Date(r.recorded_at_ms).toISOString(),r.payload.status,r.stale?"较早版本":"当前版本"]))+
          '<button id="project-archive-export">导出证据 JSON</button>';
        target.querySelector("#project-archive-export").onclick=()=>download("project-evidence-archive.json",JSON.stringify(records,null,2));
      }catch(error){if(isActive()&&version===viewVersion)target.textContent="Archive read failed: "+errorKind(error);}
    }
    loadEvidenceArchive();
    const inspectButton = container.querySelector("#project-inspect-evidence");
    inspectButton.onclick = async () => {
      inspectButton.disabled = true;
      const output = container.querySelector("#project-evidence-result");
      output.textContent = "Reading pinned Localnet RPC…";
      try {
        const result = await inspectProjectEvidence(current.project_id);
        if (!isActive() || version !== viewVersion) return;
        output.textContent = result.status + " · " + result.checks.join(" / ") + " · Source not independently attested; issuance status unchanged." + (result.archive_id?" · Archived":"");
        await loadEvidenceArchive();
      } catch (error) {
        if (isActive() && version === viewVersion) output.textContent = "Read failed: " + errorKind(error);
      } finally { if (isActive() && version === viewVersion) inspectButton.disabled = false; }
    };

    const walletSelect = container.querySelector("#project-wallet");
    const walletStatus = container.querySelector("#project-wallet-status");
    fetch("/api/local-wallet/list", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", cache: "no-store"
    }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw Error(body.code || "WALLET_UNAVAILABLE");
      if (!isActive() || version !== viewVersion) return;
      walletSelect.replaceChildren(new Option("未分配钱包", ""));
      for (const wallet of body.wallets) walletSelect.add(new Option(wallet.address, wallet.address));
      if (current?.token.creator_wallet_address && !body.wallets.some(w => w.address === current.token.creator_wallet_address)) {
        walletSelect.add(new Option(current.token.creator_wallet_address + " (Current binding)", current.token.creator_wallet_address));
      }
      if (current?.token.creator_wallet_address) walletSelect.value = current.token.creator_wallet_address;
      walletStatus.textContent = body.wallets.length ? "Loaded " + body.wallets.length + " managed Localnet wallets" : "No managed wallets. Create one in Wallet Management.";
    }).catch(() => {
      if (!isActive() || version !== viewVersion) return;
      walletStatus.textContent = "Wallet list unavailable; an unassigned draft can still be saved.";
      if (current?.token.creator_wallet_address) {
        walletSelect.add(new Option(current.token.creator_wallet_address + " (Current binding)", current.token.creator_wallet_address));
        walletSelect.value = current.token.creator_wallet_address;
      }
    });

    container.querySelector("#project-draft-form").onsubmit = async event => {
      event.preventDefault();
      if(!editable)return;
      const button = event.currentTarget.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const input = Object.fromEntries(new FormData(event.currentTarget));
        const supply=parseDeclaredSupply(input.supply,input.decimals);
        const creator = input.creator_wallet || null;
        const profile = {
          name: input.name, symbol: input.symbol, description: input.description || "",
          website: input.website || null, telegram: input.telegram || null, twitter: input.twitter || null
        };
        const token = {...supply, creator_wallet_address: creator };
        let project;
        const walletGroup = creator ? {
          group_id: "dev-wallets", name: "开发者钱包", purpose: "DEV",
          members: [{ wallet_address: creator, role: "DEV", enabled: true, allocation_limit_base_units: null }]
        } : null;
        if (activeProjectId) {
          // Use the displayed revision, not a newly fetched revision paired with stale form values.
          project = current;
          if(!project||project.project_id!==activeProjectId)throw Error("PROJECT_REVISION_CONFLICT");
          if (project.lifecycle.stage !== "DRAFT") throw Error("PROJECT_DRAFT_CONFIGURATION_LOCKED");
          if (project.token.creator_wallet_address && !creator) throw Error("PROJECT_DEV_WALLET_REQUIRED");
          const network = {
            ...project.network,
            genesis_hash: project.network.genesis_hash ?? config?.network?.genesis_hash ?? null
          };
          project = await append(project, "UPDATE_DRAFT_CONFIGURATION", { profile, network, token, wallet_group: preserveDraftRegistration(project,creator,walletGroup) });
        } else {
          const network = config?.network ?? {
            chain_id: "solana", cluster: "localnet", genesis_hash: null, quote_mint: WRAPPED_SOL_MINT
          };
          const draft={profile,network,token,wallet_group:walletGroup};
          const key=JSON.stringify(draft);
          if(pendingCreate&&pendingCreate.key!==key)throw Error("PROJECT_CREATE_UNCONFIRMED_RELOAD_REQUIRED");
          if(recoveryError)throw Error(recoveryError);
          if(recoveryId&&!pendingCreate)throw Error("PROJECT_CREATE_UNCONFIRMED_RELOAD_REQUIRED");
          pendingCreate??={key,id:commandId()};
          recovery.remember(pendingCreate.id);
          recoveryId=pendingCreate.id;
          try{project = await createProject({...draft,create_request_id:pendingCreate.id});}
          catch(error){
            // A validated HTTP 400 rejection did not commit a new record.
            if(error.httpStatus===400){recovery.clear(pendingCreate.id);recoveryId=null;pendingCreate=null;}
            throw error;
          }
          recovery.clear(pendingCreate.id);recoveryId=null;pendingCreate=null;
        }
        // The mutation succeeded. A subsequent list failure must not invite a duplicate create.
        if (!isActive() || version !== viewVersion) return;
        projects=[...projects.filter(p=>p.project_id!==project.project_id),project];
        setActive(project.project_id);
        message = "配置已保存至本地 SQLite，状态：" + project.lifecycle.stage + ".";
        record("project.aggregate.saved", { project_id: project.project_id, revision: project.revision, stage: project.lifecycle.stage });
        render();
      } catch (error) {
        if (!isActive() || version !== viewVersion) return;
        message = "保存未确认，请重新加载项目：" + errorKind(error);
        const status = container.querySelector("#project-status");
        if (status) status.textContent = message;
        button.disabled = false;
      }
    };
    const budgetForm=container.querySelector("#project-budget-form");
    if(budgetForm)budgetForm.onsubmit=async event=>{
      event.preventDefault();
      if(!current||current.project_id!==activeProjectId)return;
      const status=container.querySelector("#project-budget-status");
      let limits;
      try{limits=parseBudgetDeclaration(Object.fromEntries(new FormData(budgetForm)));}
      catch(error){status.textContent="配置无效："+errorKind(error);return;}
      if(JSON.stringify(limits)===JSON.stringify(current.limits)){status.textContent="配置未变更。";return;}
      if(!window.confirm("Save risk limits? This creates a new project revision without enabling execution."))return;
      const button=budgetForm.querySelector("button");button.disabled=true;
      try{
        const updated=await append(current,"SET_BUDGET_LIMITS",{limits});
        if(!isActive()||version!==viewVersion)return;
        projects=projects.map(p=>p.project_id===updated.project_id?updated:p);
        message="Risk limits saved; execution remains disabled.";render();
      }catch(error){
        if(!isActive()||version!==viewVersion)return;
        status.textContent="Save unconfirmed. Reload project: "+errorKind(error);
        button.disabled=false;
      }
    };
    container.querySelector("#project-new").onclick = () => {
      if(pendingCreate||recoveryId){message="Previous creation is unconfirmed. Retry the original form or reload the project list.";const status=container.querySelector("#project-status");if(status)status.textContent=message;return;}
      setActive(null); message = "新建项目草稿"; render();
    };
    container.querySelector("#project-open").onclick = () => {
      const id = container.querySelector("#project-open-select").value;
      if (!id) return;
      setActive(id);
      const row = projects.find(x => x.project_id === id);
      message = "Editing " + (row?.profile.name ?? id) + ".";
      record("project.aggregate.opened", { project_id: id });
      render();
    };
    container.querySelector("#project-export").onclick = () => download("cook-project-aggregates.json", JSON.stringify(projects, null, 2));
    container.querySelector("#project-legacy-export").onclick = () => {
      try { download("cook-legacy-browser-project-registry.json", JSON.stringify(projectRegistry.exportBundle(), null, 2)); }
      catch (error) { message = "Legacy registry export failed: " + errorKind(error); render(); }
    };
    container.querySelector("#project-mark-ready").onclick = async () => {
      if (!activeProjectId) return;
      const button = container.querySelector("#project-mark-ready"); button.disabled = true;
      try {
        const project = current;
        if(!project||project.project_id!==activeProjectId)throw Error("PROJECT_REVISION_CONFLICT");
        await append(project, "TRANSITION_LIFECYCLE", { to: "READY" });
        const updated=await listProjects(); if(!isActive()||version!==viewVersion)return; projects=updated; message = "Configuration complete. Status: READY."; render();
      } catch (error) {
        if(!isActive()||version!==viewVersion)return;
        message = "状态更新失败：" + errorKind(error);
        const status = container.querySelector("#project-status"); if (status) status.textContent = message;
        button.disabled = false;
      }
    };
    container.querySelector("#project-launch-submitted").onclick = async () => {
      if (!activeProjectId) return;
      const button = container.querySelector("#project-launch-submitted"); button.disabled = true;
      try {
        const project = current;
        if(!project||project.project_id!==activeProjectId)throw Error("PROJECT_REVISION_CONFLICT");
        const evidence = {
          kind: "LAUNCH_TRANSACTION", source: "local_execution",
          verification: "SUBMITTED", reference: project.token.issuance_signature
        };
        await append(project, "TRANSITION_LIFECYCLE", { to: "LAUNCH_SUBMITTED", evidence });
        const updated=await listProjects(); if(!isActive()||version!==viewVersion)return; projects=updated; message = "Issuance recorded as SUBMITTED; awaiting independent on-chain verification."; render();
      } catch (error) {
        if(!isActive()||version!==viewVersion)return;
        message = "发行状态未改变：" + errorKind(error);
        const status = container.querySelector("#project-status"); if (status) status.textContent = message;
        button.disabled = false;
      }
    };
    container.querySelector("#issuance-evidence-form").onsubmit = async event => {
      event.preventDefault();
      const input = Object.fromEntries(new FormData(event.currentTarget));
      try {
        const project = current;
        if(!project||project.project_id!==input.project_id||project.project_id!==activeProjectId)throw Error("PROJECT_REVISION_CONFLICT");
        await append(project, "RECORD_ISSUANCE_EVIDENCE", { mint: input.mint.trim(), signature: input.signature.trim() });
        const updated=await listProjects(); if(!isActive()||version!==viewVersion)return; projects=updated; setActive(project.project_id);
        message = "Issuance evidence recorded as UNVERIFIED; on-chain verification pending.";
        record("project.issuance_evidence.recorded", { project_id: project.project_id, status: "UNVERIFIED" });
        render();
      } catch (error) {
        if(!isActive()||version!==viewVersion)return;
        message = "未记录发行证据：" + errorKind(error);
        const status = container.querySelector("#project-status"); if (status) status.textContent = message;
      }
    };
  }

  renderLoading();
  load();
}

// Keep the existing form and FormData contract. Only presentation changes.
export function mountLaunchSteps(form){
 const doc=form.ownerDocument,children=[...form.children],heads=children.filter(el=>el.matches("h4.form-section-title")),groups=children.filter(el=>el.matches(".grid.form-section")),social=children.find(el=>el.matches("details.profile-optional")),actions=children.find(el=>el.matches(".row"));
 if(heads.length!==2||groups.length!==2||!social||!actions)return;
 const tabs=doc.createElement("div");tabs.className="launch-step-tabs";tabs.setAttribute("role","group");tabs.setAttribute("aria-label","发行准备步骤");
 const sections=["代币","社交资料","钱包"].map((label,i)=>{const section=doc.createElement("section");section.className="launch-step";section.dataset.launchStep=String(i);const button=doc.createElement("button");button.type="button";button.textContent=(i+1)+". "+label;tabs.append(button);return section});
 sections[0].append(heads[0],groups[0]);social.open=true;sections[1].append(social);sections[2].append(heads[1],groups[1]);form.prepend(tabs,...sections);
 const nav=doc.createElement("div");nav.className="row launch-step-nav";
 const back=doc.createElement("button"),next=doc.createElement("button");back.type=next.type="button";back.textContent="上一步";next.textContent="下一步";nav.append(back,next);actions.before(nav);
 let current=0;
 function show(i){current=i;sections.forEach((s,j)=>s.hidden=j!==i);[...tabs.children].forEach((b,j)=>b.setAttribute("aria-pressed",String(j===i)));back.disabled=i===0;next.hidden=i===2;actions.hidden=i!==2;}
 function valid(i){for(const input of sections[i].querySelectorAll("input,textarea,select"))if(!input.disabled&&!input.checkValidity()){input.reportValidity();return false}return true;}
 function move(i){if(i>current){for(let j=current;j<i;j++){show(j);if(!valid(j))return}}show(i);}
 [...tabs.children].forEach((b,i)=>b.onclick=()=>move(i));back.onclick=()=>move(Math.max(0,current-1));next.onclick=()=>move(Math.min(2,current+1));
 form.addEventListener("invalid",e=>{const section=e.target.closest("[data-launch-step]");if(section)show(Number(section.dataset.launchStep));},true);
 show(0);
}
