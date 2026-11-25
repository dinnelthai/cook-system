import { listProjects, getProject, createProject, appendProjectCommand, getProjectConfig, inspectProjectEvidence, listProjectArchive } from "./project-client.mjs";

const U64_MAX = 18446744073709551615n;
const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";
const commandId = () => globalThis.crypto?.randomUUID?.() ?? ("project-ui-" + Date.now() + "-" + Math.random().toString(36).slice(2));

export function mountProjectSetup(container, {
  initialProjectId = null, onActiveProjectId = () => {}, initialMessage = "",
  isActive = () => true, screenHeading, panel, note, table, esc, download,
  projectRegistry, record = () => {}, errorKind = error => error?.message ?? "UNKNOWN_ERROR"
} = {}) {
  let projects = [], config = null, activeProjectId = initialProjectId, message = initialMessage;
  let loading = true, loadError = "", viewVersion = 0;

  function setActive(id) {
    activeProjectId = id;
    onActiveProjectId(id);
  }
  async function append(project, type, payload) {
    const result = await appendProjectCommand(project.project_id, {
      command_id: commandId(), type, payload
    }, project.revision);
    return result.aggregate;
  }
  function renderLoading() {
    container.innerHTML = screenHeading("Project Setup / 项目准备", "统一项目主记录 · 本机 SQLite") +
      note(loadError ? "项目数据读取失败：" + loadError : "正在读取本机 Project 数据库…");
    if (loadError) {
      const button = document.createElement("button");
      button.textContent = "重新读取";
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
    const editable = !current || current.lifecycle.stage === "DRAFT";
    const lock = editable ? "" : " disabled";
    const projectRows = projects.map(x => [
      x.profile.name, x.profile.symbol,
      x.token.supply_base_units === null ? "未配置" : x.token.supply_base_units + " base units / " + x.token.decimals + " decimals",
      x.token.creator_wallet_address || "未分配钱包",
      x.lifecycle.stage + " · " + x.lifecycle.operational_status,
      x.token.issuance_status
    ]);
    const options = projects.map(x => '<option value="' + esc(x.project_id) + '"' +
      (x.project_id === activeProjectId ? " selected" : "") + '>' +
      esc(x.profile.name + " · " + x.profile.symbol + " · " + x.lifecycle.stage) + '</option>').join("");
    const issuanceOptions = projects.filter(x => ["READY", "LAUNCH_SUBMITTED"].includes(x.lifecycle.stage)).map(x => '<option value="' + esc(x.project_id) + '"' +
      '>' + esc(x.profile.name + " · " + x.profile.symbol + " · " + x.lifecycle.stage) + '</option>').join("");
    let legacyCount = 0;
    try { legacyCount = projectRegistry?.list?.().length ?? 0; } catch {}
    const currentSupply = !current || current.token.supply_base_units === null ? "1000000000" :
      (BigInt(current.token.supply_base_units) / (10n ** BigInt(current.token.decimals))).toString();
    const readyAllowed = Boolean(current && current.lifecycle.stage === "DRAFT" &&
      current.network.genesis_hash && current.token.supply_base_units && current.token.creator_wallet_address &&
      current.wallet_groups.some(g => g.purpose === "DEV" &&
        g.members.some(m => m.wallet_address === current.token.creator_wallet_address && m.enabled)));
    const launchSubmitAllowed = Boolean(current && current.lifecycle.stage === "READY" &&
      current.token.mint && current.token.issuance_signature);
    const issuanceRows = projects.filter(x => x.token.mint).map(x => [
      x.profile.name, x.token.mint, x.token.issuance_signature,
      x.token.issuance_status, x.token.verification_evidence_ref || "待链上核验"
    ]);

    container.innerHTML = screenHeading("Project Setup / 项目准备", "项目主记录 · Localnet 身份 · 生命周期证据") +
      note("Project 数据现已保存到本机 SQLite，不再写入浏览器 localStorage。此页面只管理项目配置和证据，不会创建 Token、签名或提交交易。执行权限固定关闭。") +
      panel("项目配置", '<form id="project-draft-form"><div class="grid">' +
        '<div><label>项目名称</label><input name="name" required maxlength="32" value="' + esc(current?.profile.name ?? "") + '" placeholder="Project name"' + lock + '></div>' +
        '<div><label>Token Symbol</label><input name="symbol" required maxlength="10" pattern="[A-Za-z0-9]{1,10}" value="' + esc(current?.profile.symbol ?? "") + '" placeholder="TOKEN"' + lock + '></div>' +
        '<div><label>总供应量（整币）</label><input name="supply" required inputmode="numeric" pattern="[0-9]{1,20}" value="' + esc(currentSupply) + '"' + lock + '></div>' +
        '<div><label>Decimals</label><input name="decimals" type="number" min="0" max="9" step="1" required value="' + esc(current?.token.decimals ?? 6) + '"' + lock + '></div>' +
        '<div><label>报价资产</label><input value="SOL" disabled><input type="hidden" name="quote_asset" value="SOL"></div>' +
        '<div><label>网络</label><input value="Localnet（本地验证）" disabled><input type="hidden" name="network" value="localnet"></div>' +
        '<div><label>本地 Genesis Hash</label><input value="' + esc(current?.network.genesis_hash ?? config?.network?.genesis_hash ?? "未配置") + '" disabled></div>' +
        '<div><label>项目主钱包 / Dev Wallet</label><select name="creator_wallet" id="project-wallet"' + lock + '><option value="">读取受管钱包中…</option></select></div>' +
        '<div><label>Website</label><input name="website" type="url" value="' + esc(current?.profile.website ?? "") + '" placeholder="https://"' + lock + '></div>' +
        '<div><label>Telegram</label><input name="telegram" type="url" value="' + esc(current?.profile.telegram ?? "") + '" placeholder="https://"' + lock + '></div>' +
        '<div><label>Twitter / X</label><input name="twitter" type="url" value="' + esc(current?.profile.twitter ?? "") + '" placeholder="https://"' + lock + '></div>' +
        '<div style="grid-column:1/-1"><label>项目描述</label><textarea name="description" maxlength="1000"' + lock + '>' + esc(current?.profile.description ?? "") + '</textarea></div>' +
        '</div><p class="muted">供应量按整币填写，系统按 decimals 转换为 base units 并检查 u64。Dev Wallet 只保存公钥地址，不保存私钥。</p>' +
        '<div class="row"><button type="submit" class="primary"' + (editable ? "" : " disabled") + '>保存项目配置</button><button type="button" id="project-new">新建项目</button></div></form>' +
        '<p id="project-wallet-status" class="muted" role="status">钱包列表尚未读取</p><p id="project-status" role="status" class="muted">' + esc(message) + '</p>') +
      panel("项目列表与状态", table(["项目", "Symbol", "供应量", "Dev Wallet", "生命周期 / 运行状态", "发行核验"], projectRows) +
        '<div class="row"><select id="project-open-select"><option value="">选择项目</option>' + options + '</select>' +
        '<button id="project-open" ' + (projects.length ? "" : "disabled") + '>打开项目</button>' +
        '<button id="project-export">导出服务器项目台账</button>' +
        '<button id="project-legacy-export" ' + (legacyCount ? "" : "disabled") + '>导出旧版浏览器台账 (' + legacyCount + ')</button></div>' +
        '<div class="row"><button id="project-mark-ready" ' + (readyAllowed ? "" : "disabled") + '>配置完成 → READY</button>' +
        '<button id="project-launch-submitted" ' + (launchSubmitAllowed ? "" : "disabled") + '>登记为已提交发行</button></div>') +
      panel("发行证据登记", '<form id="issuance-evidence-form"><label>所属项目</label><select name="project_id" required><option value="">选择项目</option>' + issuanceOptions + '</select>' +
        '<label>Token Mint 地址</label><input name="mint" required maxlength="44" placeholder="已发行 Token 的 Mint 地址">' +
        '<label>交易签名</label><input name="signature" required minlength="64" maxlength="88" placeholder="链上交易 Signature">' +
        '<div class="row"><button type="submit" ' + (projects.length ? "" : "disabled") + '>登记发行证据（UNVERIFIED）</button></div></form>' +
        '<p class="muted">手工登记只产生待核验记录。只有受信任的链上读取器完成核验，才能推进到 LAUNCHED。</p>') +
      panel("发行证据记录", table(["项目", "Mint", "交易签名", "状态", "核验证据"], issuanceRows) +
        '<div class="row"><button id="project-inspect-evidence"' + (current?.token.mint ? "" : " disabled") + '>只读核验当前项目发行证据</button></div><p id="project-evidence-result" role="status" class="muted">观察结果不自动推进生命周期。</p><div id="project-evidence-archive"></div>');
    async function loadEvidenceArchive(){
      if(!current)return;
      const target=container.querySelector("#project-evidence-archive");
      try{
        const records=await listProjectArchive(current.project_id);
        if(!isActive()||version!==viewVersion)return;
        target.innerHTML=table(["档案类型","Project Revision","记录时间","结果","状态"],records.map(r=>[r.kind,r.project_revision,new Date(r.recorded_at_ms).toISOString(),r.payload.status,r.stale?"旧版本":"当前版本"]))+
          '<button id="project-archive-export">导出证据档案 JSON</button>';
        target.querySelector("#project-archive-export").onclick=()=>download("project-evidence-archive.json",JSON.stringify(records,null,2));
      }catch(error){if(isActive()&&version===viewVersion)target.textContent="档案读取失败："+errorKind(error);}
    }
    loadEvidenceArchive();
    const inspectButton = container.querySelector("#project-inspect-evidence");
    inspectButton.onclick = async () => {
      inspectButton.disabled = true;
      const output = container.querySelector("#project-evidence-result");
      output.textContent = "读取已固定的本地 RPC…";
      try {
        const result = await inspectProjectEvidence(current.project_id);
        if (!isActive() || version !== viewVersion) return;
        output.textContent = result.status + " · " + result.checks.join(" / ") + " · 来源未独立认证；不会变更发行状态。" + (result.archive_id?" · 已归档":"");
        await loadEvidenceArchive();
      } catch (error) {
        if (isActive() && version === viewVersion) output.textContent = "读取失败：" + errorKind(error);
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
      walletSelect.replaceChildren(new Option("不指定钱包", ""));
      for (const wallet of body.wallets) walletSelect.add(new Option(wallet.address, wallet.address));
      if (current?.token.creator_wallet_address && !body.wallets.some(w => w.address === current.token.creator_wallet_address)) {
        walletSelect.add(new Option(current.token.creator_wallet_address + "（当前绑定）", current.token.creator_wallet_address));
      }
      if (current?.token.creator_wallet_address) walletSelect.value = current.token.creator_wallet_address;
      walletStatus.textContent = body.wallets.length ? "已读取 " + body.wallets.length + " 个本地受管钱包" : "暂无受管钱包，请先到钱包管理创建";
    }).catch(() => {
      if (!isActive() || version !== viewVersion) return;
      walletStatus.textContent = "钱包列表不可用；仍可保存未分配钱包的草稿";
      if (current?.token.creator_wallet_address) {
        walletSelect.add(new Option(current.token.creator_wallet_address + "（当前绑定）", current.token.creator_wallet_address));
        walletSelect.value = current.token.creator_wallet_address;
      }
    });

    container.querySelector("#project-draft-form").onsubmit = async event => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const input = Object.fromEntries(new FormData(event.currentTarget));
        const decimals = Number(input.decimals);
        if (!/^[0-9]{1,20}$/.test(input.supply) || !Number.isInteger(decimals) || decimals < 0 || decimals > 9) throw Error("INVALID_TOKEN_SUPPLY");
        const supplyBaseUnits = BigInt(input.supply) * (10n ** BigInt(decimals));
        if (supplyBaseUnits > U64_MAX) throw Error("TOKEN_SUPPLY_EXCEEDS_U64");
        const creator = input.creator_wallet || null;
        const profile = {
          name: input.name, symbol: input.symbol, description: input.description || "",
          website: input.website || null, telegram: input.telegram || null, twitter: input.twitter || null
        };
        const token = { supply_base_units: supplyBaseUnits.toString(), decimals, creator_wallet_address: creator };
        let project;
        const walletGroup = creator ? {
          group_id: "dev-wallets", name: "Dev Wallets", purpose: "DEV",
          members: [{ wallet_address: creator, role: "DEV", enabled: true, allocation_limit_base_units: null }]
        } : null;
        if (activeProjectId) {
          project = await getProject(activeProjectId);
          if (project.lifecycle.stage !== "DRAFT") throw Error("PROJECT_DRAFT_CONFIGURATION_LOCKED");
          if (project.token.creator_wallet_address && !creator) throw Error("PROJECT_DEV_WALLET_REQUIRED");
          const network = {
            ...project.network,
            genesis_hash: project.network.genesis_hash ?? config?.network?.genesis_hash ?? null
          };
          project = await append(project, "UPDATE_DRAFT_CONFIGURATION", { profile, network, token, wallet_group: walletGroup });
        } else {
          const network = config?.network ?? {
            chain_id: "solana", cluster: "localnet", genesis_hash: null, quote_mint: WRAPPED_SOL_MINT
          };
          project = await createProject({ profile, network, token, wallet_group: walletGroup });
        }
        projects = await listProjects();
        setActive(project.project_id);
        message = "项目配置已保存到本机 SQLite；当前状态：" + project.lifecycle.stage + "。";
        record("project.aggregate.saved", { project_id: project.project_id, revision: project.revision, stage: project.lifecycle.stage });
        render();
      } catch (error) {
        message = "项目未保存：" + errorKind(error);
        const status = container.querySelector("#project-status");
        if (status) status.textContent = message;
        button.disabled = false;
      }
    };
    container.querySelector("#project-new").onclick = () => { setActive(null); message = "新建 Project 草稿"; render(); };
    container.querySelector("#project-open").onclick = () => {
      const id = container.querySelector("#project-open-select").value;
      if (!id) return;
      setActive(id);
      const row = projects.find(x => x.project_id === id);
      message = "正在编辑 " + (row?.profile.name ?? id) + "。";
      record("project.aggregate.opened", { project_id: id });
      render();
    };
    container.querySelector("#project-export").onclick = () => download("cook-project-aggregates.json", JSON.stringify(projects, null, 2));
    container.querySelector("#project-legacy-export").onclick = () => {
      try { download("cook-legacy-browser-project-registry.json", JSON.stringify(projectRegistry.exportBundle(), null, 2)); }
      catch (error) { message = "旧版台账导出失败：" + errorKind(error); render(); }
    };
    container.querySelector("#project-mark-ready").onclick = async () => {
      if (!activeProjectId) return;
      const button = container.querySelector("#project-mark-ready"); button.disabled = true;
      try {
        const project = await getProject(activeProjectId);
        await append(project, "TRANSITION_LIFECYCLE", { to: "READY" });
        projects = await listProjects(); message = "项目配置已完成，状态进入 READY。"; render();
      } catch (error) {
        message = "状态推进失败：" + errorKind(error);
        const status = container.querySelector("#project-status"); if (status) status.textContent = message;
        button.disabled = false;
      }
    };
    container.querySelector("#project-launch-submitted").onclick = async () => {
      if (!activeProjectId) return;
      const button = container.querySelector("#project-launch-submitted"); button.disabled = true;
      try {
        const project = await getProject(activeProjectId);
        const evidence = {
          kind: "LAUNCH_TRANSACTION", source: "local_execution",
          verification: "SUBMITTED", reference: project.token.issuance_signature
        };
        await append(project, "TRANSITION_LIFECYCLE", { to: "LAUNCH_SUBMITTED", evidence });
        projects = await listProjects(); message = "发行交易已登记为 SUBMITTED，等待独立链上核验。"; render();
      } catch (error) {
        message = "发行状态未推进：" + errorKind(error);
        const status = container.querySelector("#project-status"); if (status) status.textContent = message;
        button.disabled = false;
      }
    };
    container.querySelector("#issuance-evidence-form").onsubmit = async event => {
      event.preventDefault();
      const input = Object.fromEntries(new FormData(event.currentTarget));
      try {
        const project = await getProject(input.project_id);
        await append(project, "RECORD_ISSUANCE_EVIDENCE", { mint: input.mint.trim(), signature: input.signature.trim() });
        projects = await listProjects(); setActive(project.project_id);
        message = "发行证据已登记为 UNVERIFIED，尚未完成链上核验。";
        record("project.issuance_evidence.recorded", { project_id: project.project_id, status: "UNVERIFIED" });
        render();
      } catch (error) {
        message = "发行证据未登记：" + errorKind(error);
        const status = container.querySelector("#project-status"); if (status) status.textContent = message;
      }
    };
  }

  renderLoading();
  load();
}
