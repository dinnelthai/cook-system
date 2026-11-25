# 独立工程验收报告（部分完成）

结论：**REVIEW_REQUIRED**。自动化代码检查在允许监听本机端口后通过，但本次没有完成完整工程验收，尤其缺少私有链、Windows/WSL、Pump Lab、实际链上财务对账、全面代码审查及性能恢复的证据。不能据此确认系统适合实际交易或生产使用。

## 基线与边界

- 时间：2026-11-25（曼谷时间）；目标远程 master `6f5521a3748faf6d122987143765bc8d17a4ae99`。
- 已 `git fetch origin master`。原工作区 master 有预存修改：`.env.local` 已暂存删除、`web/local-market.mjs` 修改、`.gitignore` 未跟踪；为保护这些内容，在 `/private/tmp/cook-acceptance-git` 的独立 detached checkout 验收最新提交。**原工作区没有更新到最新 master**。JSON 的 branch 为空是 detached checkout 的结果，commit 正确，运行前工作树干净。
- macOS Darwin 25.6.0 x86_64，Node 23.11.0，npm 10.9.2；本机非 Windows/WSL。没有重置或启动 validator，没有申请 SOL、签名或提交交易。三个执行开关均关闭。
- 完整读过 `docs/implementation/CODEX-ACCEPTANCE-PROMPT.md` 和 `docs/implementation/CODEX-ACCEPTANCE-PLAYBOOK.md`。验收基准是远程代码，原工作区修改没有作为受测代码。

## 自动化结果

- `npm ci`：退出 0，安装 85 个包，postinstall 修改隔离副本内依赖的 Pump SDK interop；没有修改项目源码。
- `npm run accept:all`：首次在受限沙箱中退出 1，334 项中 333 通过、1 失败；`test/terminal-server.test.mjs:11` 因 `listen EPERM` 无法监听 loopback。提升本机监听权限后原命令重新运行退出 0：334 通过、0 失败、0 跳过；12 项检查通过，8 个 operator gate 未完成。两份原始 JSON 均保留。首次故障为环境限制证据，不认定为产品缺陷。
- 单独 `npm test`（允许监听后）：退出 0，334/334 通过，无跳过；日志 `npm-test.log`。`npm run validate:schemas` 退出 0，13 个 schema 有效。
- 模块语法 161 个通过；当前树高置信度凭据扫描 237 个文本文件未发现问题。扫描不证明历史安全或密钥已轮换。
- `npm audit --omit=dev --json`：0 漏洞；依赖全部是 devDependencies，该结果不覆盖开发依赖及其供应链风险。
- held-out 12 个合成样例通过，仅证明合成回归，不证明真实市场准确率。

## 环境与浏览器

- 本机监听清单没有 127.0.0.1:8899。无法仅凭此推断远端 validator 状态。此前交接记录包含由操作者提供且曾比对成功的 genesis pin；本次实时 RPC 请求超时，且没有已确认的封闭区间、receipt 或预期 mint/pool，因此没有配置只读链上 preflight；网络身份、健康、slot、保留范围、receipt 和链上账务一致性均 UNKNOWN。Windows/WSL 和 Pump Lab 的 API/WS 可达性未验证。
- 离线服务使用 playbook 指定 fixture 和关闭的执行开关启动，真实浏览器初查：操作台行情不可用时显示未知且交易按钮禁用；复盘页标识 SYNTHETIC、历史证据 UNAVAILABLE、来源 UNKNOWN；风险页明确合成；设置页可打开。已访问页面未观察到 console error/warn。
- 钱包页显示已有浏览器状态中的地址，但没有新建钱包、注资或更改选择。钱包页充值和转账入口仍可见；实际防护需结合有效输入和接口检查，不能凭外观证明。跨源 Origin 请求报告接口返回 403；空交易请求返回 TRADE_DISABLED；空水龙头请求先返回 INVALID_PUBLIC_KEY，尚未验证有效地址的禁用响应。没有发送任何交易。
- 项目档案、钱包选择器联动、键盘和窄屏、网络请求完整清单、静态路径逃逸、各种错误和矛盾数据界面未完成；未采集截图，不能宣称完整浏览器验收通过。

## 审查观察与优先事项

以下为证据缺口或风险假设，**不是已确认产品缺陷**。当前证据不足以虚构十个真实缺陷；优先级代表补证顺序，行号为相关代码入口，不暗示该行必有 bug。

1. **P1 / 缺失证据：私有链身份与历史收据** — `src/inner-market/local-read-acceptance.mjs`；复现：在没有独立 pin、范围和收据的环境运行 `npm run accept:all`，localnet preflight 为 NOT_RUN。影响：不能证明链身份与历史覆盖。建议：由操作者提供独立 pin、已关闭区间及真实收据后运行只读 preflight，并测试错误 pin 拒绝。
2. **P1 / 缺失证据：真实交易确认与财务一致性** — `src/inner-market/local-transfer.mjs:25`，`src/inner-market/local-trading.mjs:59`；只读基线未提交交易。无法验证真实收据、费用、库存、成本和 NAV 的闭环。建议下一轮在单独授权的 disposable private localnet 测试并核对 receipt、超时及重复提交边界。
3. **P1 / 缺失证据：Windows/WSL 与 Pump Lab** — `scripts/start-localnet.mjs:5`；本机为 macOS 且未发现 loopback 8899。无法判断远端环境健康、转发、mint/pool 身份。建议在现有环境只读核对，禁止重建或重置。
4. **P1 / 审查未完成：密钥保管** — `src/inner-market/local-wallet-store.mjs`；本次未审完权限、符号链接和并发竞态，也未创建测试钱包。建议在隔离目录核查文件权限及 API 输出，保证密钥不泄露。
5. **P1 / 审查未完成：交易开关及限额** — `scripts/serve-offline-mvp.mjs:27`；仅检查空交易输入被禁用，其他有效输入及并发聚合边界未独立覆盖。建议用 mock 和有效公开地址验证三开关关闭且不产生 RPC 交易调用。
6. **P1 / 审查未完成：Pump/Raydium 回放与解码** — `src/adapters/pump/`、`src/adapters/raydium/`；合成测试不足以确认真实 IDL、手续费、分页和迁移边界。建议以独立确认的私有链收据逐项交叉核对。
7. **P2 / 缺失证据：完整浏览器与钱包选择器** — `web/local-faucet.mjs`、`web/app.mjs`；未完成两个选择器互不影响的复现，也未检查所有页面及响应式。建议保留非敏感截图、console/network 并验证选择器与目标字段独立性。
8. **P2 / 缺失证据：风险与数据矛盾抑制** — `src/risk/quote-risk-gate.mjs`、`src/inner-market/terminal-state.mjs`；自动测试通过但未完成完整独立代码及浏览器对抗检查。建议构造缺失、过期、冲突输入并核对 fail-closed。
9. **P2 / 缺失证据：性能与恢复** — `scripts/serve-offline-mvp.mjs:19`；未测大中小报告、索引重建、日志增长、慢请求、重启或峰值内存。建议在隔离数据副本记录尺寸、耗时、RSS、上限和恢复结果，勿清理现有锁。
10. **P2 / 缺失证据：服务边界** — `scripts/serve-offline-mvp.mjs:33`、`:71`；跨源拒绝已观察，超大/慢请求和静态路径逃逸未独立实测。建议增加安全测试并核验内存及超时。

代码阅读中确认转账实现将提交异常、过期和超时表示为 UNKNOWN，发送设置 `maxRetries:0`（`src/inner-market/local-transfer.mjs:28-41`）；这是静态观察和测试结果，不证明真实链确认正确。所有上述缺口不等于已发现漏洞；无经充分复现的 P0–P3 产品缺陷可报告。

## 下一步

优先在已有 Windows/WSL 环境提供可访问的私有 endpoint、独立 genesis pin、已关闭的区间和确认收据，完成只读 preflight 及真实账务对账；随后完成浏览器、钱包保管、代码、性能和恢复检查。交易测试需要单独授权，基线禁止提交。待这些证据补齐后重新判定；本轮不进行修复。

## 2026-11-25 补充：既有远程访问通道

此前结论遗漏了已有远程连接记录，现予更正：`docs/implementation/terminal-v0.7-local-acceptance-2026-11-24.md:37` 记录了用户提供的另一台电脑上的私有 RPC 和由操作者提供的 genesis pin；当时 RPC、WS 和 Pump Lab 可访问。旧记录不能作为当前状态的证明。

本次按原有私有地址进行只读探测：RPC 的 getGenesisHash、getHealth、getVersion、getSlot、getFirstAvailableBlock、minimumLedgerSlot 均在 5 秒内超时；使用既有本地配置的只读凭据访问 Pump Lab indexer 也超时（重复探测一致）。本机 Wi-Fi 接口具有同网段地址，但这不能证明对端在线或路由、防火墙正常。故本次仍无法验证当前 pin 匹配、slot、保留范围或 Pump Lab 状态；不是没有历史授权或没有已知通道。未输出凭据、未提交交易。请检查另一台电脑和服务是否在线及私有网络连通后重试。

### 之后重试

用户要求再次尝试后，以 7 秒超时并发重试此前授权的私有 RPC：getGenesisHash、getHealth、getSlot、getFirstAvailableBlock、minimumLedgerSlot 返回 ECONNRESET，getVersion 超时；Pump Lab indexer 也超时。未获得响应，因此当前 genesis、健康和 slot 状态仍为 UNKNOWN。未提交交易。连接重置不能单独确定原因。

### 再次重试：远程服务已响应

本次只读重试成功：RPC HTTP 200，getHealth 为 ok，Solana core 4.4.1；genesis 与此前操作者独立提供的 pin 一致。finalized slot 111941，first available block 110167，minimum ledger slot 110166（均为当次快照）。RPC WebSocket 收到 slot notification。Pump Lab indexer HTTP 200，slot 111972，indexed 28、events 33、trades 23、candles 73、decoder failures 0；其 ledger 标识与 pin 一致。默认 token 与其配置一致，stage 为 pumpswap，pool 字段存在；行情 WebSocket 返回 5 根 candle、14 条 trade。尚未独立确认默认 mint/pool 是否为操作者预期或进行链上池账户比对。

连接期间一次 ui-config 请求超时，随后重试成功，表明本次连接并不稳定；不能据此归因。尚未核验已关闭区间与真实 receipt，未建立财务或历史完整性证据，自动化 preflight 未重新运行，整体仍 REVIEW_REQUIRED。本次没有签名、申请 SOL 或提交交易。
