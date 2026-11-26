# Trade 多钱包交易开发任务书

## 目标与范围

实现 Smithii Pro Trade 参考流程：选择当前项目和市场 → 选择项目钱包 → 设置每个钱包的买入金额或卖出比例 → 交易预览 → 用户明确执行 → 每钱包独立结果及链上核对。必须有可运行的 Localnet 端到端链路，而非只有静态 UI 或历史复核。第一阶段以 Solana Localnet + 项目已绑定的 PumpSwap 市场为目标；不要宣称支持主网、devnet、其他 DEX、真正的 Jito bundle、原子多钱包交易或自动做市。项目需兼容后续扩展，但不以这些扩展代替第一阶段交付。

## 当前代码事实

- `web/app.mjs` 的 Meme Trade 主要挂载 `web/historical-direction-review.mjs`，其中交易按钮禁用；历史数据不能冒充实时报价或成交。
- `scripts/serve-offline-mvp.mjs` 的 `/api/local-wallet/trade` 无条件返回 `PROJECT_EXECUTION_DISABLED`；已有测试要求该无项目绑定入口保持关闭。
- `src/inner-market/local-trading.mjs` 有 Localnet PumpSwap 逐钱包执行原型，依赖本地 RPC、固定 genesis 和 Pump Lab 市场；仅支持相同金额买入或全额卖出，不校验项目绑定。`local-trade-batch.mjs` 对 UNKNOWN 停止后续钱包。
- `project-aggregate.mjs` 保存项目网络、mint、钱包组、市场和限制；`normalizeExecutionPolicy` 当前只接受 DISABLED。项目的交易授权模型必须显式设计并迁移，不能通过 UI 或环境变量单独绕过它。
- 钱包登记不等于本地拥有签名权。项目钱包还需与本地受管钱包交叉验证。当前代码不证明真实交易已通过或数据可用于财务结算。

## 任务与依赖顺序

### T1：确认项目授权与执行范围

1. 为 Localnet 项目设计明确的交易启用、暂停、撤销和风险审批模型，与现有 aggregate 验证、事件和版本检查一致。默认关闭；旧数据安全迁移，不默默启用。定义谁、何时、通过哪个操作授权，禁止只靠浏览器传入 `enabled`。
2. 明确可交易生命周期、operational status、项目/单笔/钱包限额，以及缺失、未知和过期证据如何处理。限制及余额无法核验时拒绝执行，不能把 null 当零或无限制。
3. 编写安全回归测试，证明未授权、非 Localnet、错误 genesis、停止或过期状态无法进入签名。保留旧无绑定交易入口的 403 测试。

### T2：项目、钱包和市场的服务端绑定

1. 新增项目上下文的交易服务/接口，服务端从可信项目存储按 `project_id` 和预期 revision 读取数据，不信任客户端声明的 mint、池、钱包归属或授权状态。
2. 每个钱包必须属于该项目、成员 enabled，且存在于本地受管钱包；去重并设置批次上限。校验当前项目网络、RPC genesis、market id、池地址、program、base/quote mint 和市场证据；不匹配即拒绝。
3. 明确市场从当前 Pump Lab 获取还是注册池直接读取；若两者同时使用必须一致。禁止将 Pump Lab 默认 mint 自动当作当前项目的 mint。所有金额用整数 base units/BigInt，不能使用浮点数计算资产。
4. 保留 Localnet 网络约束，私钥只在受控服务端签名时加载，不进入 API 响应、日志或浏览器。

### T3：钱包资产与批量设置

1. Trade 的钱包表显示项目登记且可操作的钱包、选择状态、SOL 余额、当前 mint 的 Token 余额；未知和读取失败显示未知并阻止依赖该数据的操作。清楚区分未登记、未受管、未启用和无余额。
2. 支持全选/单选、每钱包编辑：买入 SOL 金额；卖出比例或明确 token 数量。支持统一金额及 25/50/75/100% 快捷项。百分比按执行前可验证余额计算并向下取整；展示最终单位和余额时间。
3. 首版至少支持不同钱包不同买入金额和卖出比例。随机金额可后置，不能把 UI 标为已实现。
4. 切换项目或 mint 清除选择和预览，防止跨项目复用；异步返回必须校验当前上下文，过时响应不覆盖新状态。

### T4：预览与确认

1. 创建不签名、不广播的 preview。固定 project id/revision、market identity、网络、钱包、方向、每笔金额、滑点及有效时间，返回服务端生成的 preview id/摘要。
2. 基于最新可用池状态分别给出每笔预估收入/支出、最小接收或最大支出、网络费、账户租金及其他费用；无法准确获取的值标未知并说明。逐笔执行会改变池状态，因此须说明报价仅为预估，执行前每笔重新计算和模拟。
3. 前端展示钱包/交易数、总额、每笔明细、滑点、费用、顺序执行和非原子性；明确要求用户确认。余额不足、项目变更、报价过期或任何关键校验失败不能执行。
4. 不展示无来源的实时 PnL 或预计利润；历史盈亏与当前资产分开展示。

### T5：执行与结果

1. 独立 execute 接口只接受有效 preview 标识及幂等请求标识，服务端重读项目和授权，校验 preview 未过期/未使用，锁定批次防止重复执行或并发竞争。并发、重放和进程重启后均不得重复广播已提交交易。
2. Localnet 顺序逐钱包：刷新状态、检查余额/限额、构造、模拟、签名、提交、确认，再处理下一钱包。模拟不能替代成交确认。明确失败策略；UNKNOWN 必须停止后续钱包，不自动重试、不自动重新签名。
3. 逐笔持久化 `NOT_ATTEMPTED / PREPARING / SUBMITTED / CONFIRMED / FAILED / REJECTED / UNKNOWN`、项目/市场/钱包、方向、计划量、签名、原因和时间；提交与持久化之间可能崩溃，设计恢复和幂等机制，不能把提交超时当失败。密钥和敏感 RPC 配置不得写入记录。
4. 恢复/查询接口根据签名查询链上状态；没有足够证据时保持 UNKNOWN。显示成功、失败、未执行和待核对，每笔附签名及 Localnet 浏览器可用时的链接。不得自动重试 UNKNOWN。
5. 买卖结果刷新余额；链上实际金额、手续费及盈亏仅在可核实的来源和口径齐全时显示，否则显示未知。不得将历史数据当实时资产。

### T6：Trade 界面

1. 在现有 Meme Trade 区域接入以上链路：项目/市场状态、钱包表、批量买入/卖出配置、预览、确认、执行进度、逐笔日志与错误恢复。
2. 明确标注 Localnet、逐笔非原子执行；支持 sell percentage 的快捷设置。Dump/Exit 如提供，需明确范围、数量和预览并复用同一执行链路，不能绕过授权。
3. 已有历史复核保留并标记为历史；不可实现的 Jito、MEV、延迟、速度档位等控件隐藏或明确不可用，不能放看似有效的假控件。
4. 无项目、无可用市场、无钱包、未配置 RPC、服务不可用和中途切换项目均有清晰状态。桌面和窄屏基本可操作，按钮禁用原因可见。

### T7：测试和交付

1. 单元/集成覆盖：跨项目钱包、禁用成员、未受管钱包、错误 mint/池/genesis、暂停与无授权、项目版本变化、金额精度和范围、余额不足、预览过期和篡改、重复请求、并发、部分失败、提交结果 UNKNOWN、重启恢复、敏感信息不泄露。
2. 浏览器流程覆盖选钱包、设置不同金额和比例、预览、确认、结果及项目切换；用 mock 验证禁止签名场景。
3. 在实际隔离 Localnet、测试 SOL 和测试 Token 上完成至少两钱包买入、卖出、部分失败及 UNKNOWN/恢复核验；逐笔比对签名、钱包余额和链上结果。真实环境不可用时明确标记未验收，不用 mock/单元测试冒充链上验收。
4. 运行相关测试、既有全量测试及必要构建检查；报告提交/工作区状态、启动配置名称（不输出值或密钥）、测试结果、未完成项和剩余限制。

## 验收标准

- 可在已授权且匹配的 Localnet 项目中，从 UI 完成多钱包预览、确认、顺序买入和卖出，并逐笔看到可核对结果。
- 任意未授权、项目不匹配、错误网络或过期预览都无法签名；旧无绑定接口仍关闭。
- 同一批次重复提交不会重复交易；结果不明会阻止后续交易并可核查。
- UI 显示的余额、报价和结果有明确来源与状态，未知不伪装为 0 或成功；不声称原子 bundle、主网或完整财务对账已实现。

## 当前实现状态（2026-11-26）

已实现项目绑定的 Localnet 执行链路：

- 项目执行策略新增 `LOCALNET_AUTHORIZED`，必须通过显式授权命令启用；HALTED、REVIEW_REQUIRED、钱包/限额/市场/生命周期变更会撤销授权。
- Preview 持久化绑定项目 revision、Genesis、Mint、验证过的 PumpSwap market、钱包、整数数量、1% 滑点策略、预计收取量、滑点上下限和费用估算。
- Execute 只接受 `preview_id + idempotency_key + confirm=true`，逐钱包刷新 Genesis、市场、余额和 SDK state，模拟后签名，先持久化签名再广播，并等待确认。
- 每钱包记录 `NOT_ATTEMPTED / PREPARING / SUBMITTED / CONFIRMED / FAILED / REJECTED / UNKNOWN`。UNKNOWN 停止后续钱包；reconcile 只查询已持久化签名，不重新签名或重播。
- 项目级 SQLite 锁和幂等键阻止并发/重复广播；交易 journal 纳入数据库完整性和备份 schema 检查。
- 右侧 Bundle Buy、Bundle Sell、Dump It 已连接项目 Preview/Confirm/Execute/Reconcile，并在执行后刷新资产与 receipt log。
- `/api/local-wallet/trade` 继续保持 403；真实执行仅通过项目级路由。

启用真实 Localnet 执行需要同时满足：

1. 服务端 `COOK_LOCAL_TRADING=1`，loopback RPC、私有 Pump Lab 与预期 Genesis 配置有效；
2. 项目为 `PUMPSWAP_ACTIVE + ACTIVE`，市场已验证且 program identity 为 canonical PumpSwap；
3. 执行钱包为项目中启用的 `OPERATOR` 或 `EXECUTOR`，并存在于本地受管 keystore；
4. 项目总预算、单笔限额、钱包暴露限额和成员 allocation limit 已配置；
5. 在 Trade 面板显式 Authorize Localnet Execution。

本轮未向任何 RPC 广播真实交易。单元和集成测试使用 mock connection/executor；真实隔离 Localnet 的两钱包 Buy/Sell/Dump、部分失败和 UNKNOWN/reconcile 仍需单独联调验收。

## 给开发 agent 的执行要求

先检查当前工作树和相关测试，保留既有改动与本地数据；按任务依赖实现，不要仅交设计或只做 UI。若发现现有模型无法安全表达授权、限额或恢复，先完成必要模型与数据兼容改造，再接执行。不要提交真实交易，除非是在明确配置的隔离 Localnet 测试环境；不要修改远程仓库或部署。最终给出代码路径、测试证据及链上实际验收范围。
