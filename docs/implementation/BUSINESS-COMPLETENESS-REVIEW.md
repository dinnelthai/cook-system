# Cook System — 业务完整度复审与产品基准

> 文档状态：业务基准冻结（待按验收结果迭代）
> 
> 审查日期：2026-11-25
> 
> 审查分支：`master`
> 
> 审查基线：`2194f4db1c532021059dac80b9b61a660d729165`
> 
> 目的：统一产品目标、业务边界、当前能力判断、目标业务模型和下一阶段验收标准。本文不是“已完成模块清单”，也不代表生产环境或主网能力已经验收。

---

## 0. 结论先行

**当前 Cook System 尚不是一套完整的 Pump.fun Dev 项目运营与 Market Making 系统。**

当前代码更准确的定位是：

1. 有一定成熟度的 Pump / PumpSwap / 部分 Raydium 历史数据读取、解码、重放和审计能力；
2. 有离线市场质量分析、风险计算和参与者仿真研究模块；
3. 有 Localnet 钱包、资金转账、钱包余额读取和 PumpSwap 批量交易原型；
4. 有历史财务复核、Creator Fee 子账、Graduation 复核和项目档案能力；
5. 但这些能力还没有统一到一个真实项目实体、一个订单与事件账本、一个风险控制链和一个退出结算流程中。

因此，现阶段不应以“代码模块很多”“测试通过很多”作为业务完整度结论。应以一个项目能否从准备、发行、内盘、毕业、外盘、退出到结算完整运行并可审计作为判断标准。

### 产品目标

Cook System 的目标是：

**面向 Pump.fun 项目运营者的项目生命周期操作系统，覆盖项目准备、发行证据、资金与钱包、Bonding Curve 阶段、Graduation、PumpSwap 阶段、市场质量监测、风险控制、退出和财务复盘。**

Market Making 指透明、可审计的流动性与库存管理、报价和执行质量管理；Market Quality 指对市场状态、真实成交证据、流动性、价格冲击、参与者集中度和异常行为进行监测。产品不以虚假成交量、自成交、洗售、隐瞒关联关系、误导性 K 线或诱导他人接盘作为功能目标。

### 本轮冻结的三个架构决策

1. **Project 是唯一业务主实体。** Token、市场、钱包组、订单、持仓、资金流水、风险状态、生命周期事件和复盘记录必须关联同一个 `project_id`。
2. **订单、链上事件和财务账本必须统一。** 任何一次交易都应能从操作意图追溯到签名、确认状态、实际余额变化、库存变化和财务分录。
3. **风控必须位于执行路径之前。** 风控结果不能只是页面上的提示；未通过硬性检查的操作必须被执行服务拒绝。

---

## 1. 审查范围与判断口径

### 1.1 审查对象

本轮检查的是 `master` 分支上述基线中的 README、页面入口、项目注册表、Localnet 钱包与交易服务、市场质量引擎、参与者仿真、风险引擎、项目生命周期复核、历史工作区和财务复核模块。

重点检查：

- 功能是否真实存在于代码；
- 功能是否有可运行的调用路径；
- 是否有持久化数据；
- 是否与 Project 形成业务关联；
- 是否有明确的成功、失败、未知和恢复状态；
- 是否有真实数据证据；
- 是否有完整业务验收，而不只是单元测试。

### 1.2 状态定义

| 状态 | 定义 |
|---|---|
| 已实现（限定范围） | 有代码和调用路径，但必须同时注明 Localnet、历史数据、离线或只读等限制 |
| 部分实现 | 有局部能力，但缺少持久化、业务关联、自动化或闭环 |
| 缺失 | 尚无可运行的核心业务路径 |
| 未验收 | 代码存在，但没有足够的集成证据证明业务可用 |

“代码存在”不等于“业务完成”；“Localnet 可运行”不等于“主网可用”；“历史账目内部一致”不等于“真实资金已到账”。

---

## 2. 当前业务完整度

### 2.1 业务能力盘点

| 业务域 | 当前状态 | 当前实际能力与限制 |
|---|---|---|
| 项目准备 | 部分实现 | 可保存项目草稿、Token 基础资料、供应量、SOL 报价资产、Localnet 网络和 Dev Wallet |
| Token 发行 | 缺失 | 当前只能登记 Mint 和 Signature；登记状态为 UNVERIFIED，不执行创建、签名或链上核验 |
| 项目持久化 | 部分实现 | 项目注册表使用浏览器 localStorage；历史工作区另有可选 SQLite 服务，两者不是统一项目数据库 |
| 钱包管理 | 已实现（Localnet） | 本地密钥文件创建、读取和受控访问；不代表生产钱包托管能力 |
| 钱包资产读取 | 部分实现 | 可读取本地受管钱包 SOL、Token Account 和有限近期交易；数据可能部分或未知 |
| 钱包组 | 缺失 | 没有持久化的项目钱包组、钱包角色、预算分配和归属关系 |
| 资金转账 | 已实现（Localnet） | 有 Localnet 转账原型；未形成项目资金账本和自动对账 |
| Pump Bonding Curve 交易 | 缺失 | 当前交易执行路径没有完整的 Bonding Curve 买卖适配器 |
| PumpSwap 交易 | 部分实现 | 有 Localnet PumpSwap SDK 买卖和顺序批次执行；市场从 Pump Lab 默认配置读取，不是 Project 绑定的市场 |
| 订单管理 | 缺失 | 没有持久化订单、订单状态机、重启恢复和项目级订单查询 |
| 市场数据 | 部分实现 | 有历史事件重放、OHLCV 和 Pump Lab 行情快照；当前 WebSocket 读取是单次请求后关闭，不是持续订阅服务 |
| 市场质量 | 部分实现 | 有成交流、集中度、库存归属证据和 OHLCV 分析；不能把代理指标解释成独立需求或操纵事实 |
| 参与者仿真 | 部分实现 | 有多角色离线仿真，但当前模型未校准，部分声明参数未被实际使用 |
| 库存管理 | 部分实现 | 有历史项目库存成本和本地钱包资产快照；没有统一的项目级逐钱包实时库存账本 |
| 流动性管理 | 缺失 / 未验收 | 有历史储备和池状态复核；没有完整的项目级流动性运营、交易前深度和退出执行闭环 |
| 风险引擎 | 部分实现 | 有组合风险、Paper Quote Planner 和 Emergency Halt；尚未接入真实交易前置门禁 |
| Graduation | 部分实现 | 有历史迁移和 PumpSwap Pool 复核；没有实时自动发现、项目状态推进和自动核对 |
| Treasury | 部分实现 | 有历史资金流、NAV、成本和收益复核；没有统一实时项目账本 |
| Creator Fee | 部分实现 | 有历史 Creator Fee 子账；协议 Fee Bucket、应收和钱包实际到账必须继续区分 |
| 退出与结算 | 缺失 | 有历史财务复核，不等于真实退出、资产回收、余额核对和最终结算 |
| 项目归档 | 已实现（历史复核范围） | 有历史报告归档、版本和重新审计；不是完整的运营项目状态存储 |

### 2.2 当前七个一级页面

保留现有七个一级页面，不通过不断增加一级菜单来掩盖业务模型问题：

1. 操作台；
2. 项目准备与发行台账；
3. 钱包管理；
4. 项目档案；
5. 复盘分析；
6. 市场风险实验；
7. 系统设置。

Treasury、订单、库存、市场质量、风险和结算应优先作为操作台内的工作区或标签，不另行扩张一级导航。

### 2.3 已发现的关键代码级业务断点

以下是本轮需要优先处理的具体问题：

**A. Project Registry 与历史 Workspace 是两套系统**

- `web/project-registry.mjs` 使用 localStorage 保存项目草稿和发行证据。
- `historical-project-workspace` 使用可选的本地 SQLite 保存历史复核工作区。
- 二者没有共享统一的 Project 主记录、项目状态和业务关系。
- 刷新、换浏览器或换设备时，项目草稿和历史工作区的持久化行为不同。

**B. 操作台交易对象不是当前 Project**

- `src/inner-market/local-trading.mjs` 通过 Pump Lab 的 `/ui-config` 读取 `defaultMint`，再读取对应 Token 和 Pool。
- 操作台的交易表单没有将当前 Project ID、项目 Mint、项目钱包组和项目预算作为统一执行上下文。
- 因此项目准备页保存的 Token 项目与实际交易对象不能保证一致。

**C. 当前 Localnet 交易只覆盖 PumpSwap 路径**

- 当前 SDK 路径使用 PumpSwap 交易能力。
- 不能把它描述为 Pump Bonding Curve 的完整买卖能力。
- 内盘与外盘需要明确的 Venue Adapter 和独立市场状态。

**D. 批量交易结果没有进入持久化订单账本**

- `runTradeBatch` 按钱包顺序执行，遇到 UNKNOWN 会停止后续钱包。
- 这是一项有价值的防重复提交保护，但批次、订单、签名、成交、余额变化和恢复状态没有形成持久化关联。
- 服务重启后不能仅凭该批次函数恢复完整业务状态。

**E. 风控引擎没有形成执行前强制门禁**

- `portfolio-risk-engine` 和 `quote-risk-gate` 是独立评估能力。
- 当前 Localnet 交易执行路径没有把统一 Project Risk Decision 作为每笔交易的强制前置条件。
- Emergency Halt 的存在不等于已经覆盖所有交易入口。

**F. 市场行情不是持续实时服务**

- Pump Lab WebSocket 快照读取完成后即关闭连接。
- 缺少持续订阅、事件缓冲、断线重连、缺口补齐、时间戳校验和市场状态持久化。
- 不能把一次 K 线响应描述为实时 Market Intelligence。

**G. Treasury 页面存在重复分支**

- `web/app.mjs` 中 `page === "wallet"` 的第一个分支渲染钱包管理。
- 后面另一个同样的 `page === "wallet"` 分支试图渲染 Treasury。
- 后一个分支不可达；且当前七个一级页面没有独立 Treasury 页面入口。
- 应把资金管理能力整合进操作台项目账本，而不是继续增加菜单。

**H. 仿真模型还不能作为真实市场预测器**

- `participant-model-contract.mjs` 明确记录了固定轮询调度、简化恒定乘积市场模型、共享随机流和未使用参数。
- 历史校准尚未完成，真实套利和 MEV 行为也未被验证。
- 仿真只能用于可重复的离线压力测试，不能当作真实参与者行为预测。

**I. 生命周期复盘依赖手动导入**

- `project-lifecycle-review-view.mjs` 需要导入财务输入 JSON 和 Pump 历史回放 JSON。
- 复核器能够按显式身份关联证据，但尚未从当前 Project 自动收集全部数据。
- 它是历史复核能力，不是实时生命周期编排器。

---

## 3. 目标业务模型

### 3.1 Project 是唯一业务聚合根

每个项目必须有唯一且稳定的 `project_id`。以下对象必须归属于它：

| 实体 | 关键关系 |
|---|---|
| Project | 项目名称、Symbol、网络、生命周期阶段、状态和策略版本 |
| Token | Mint、供应量、Decimals、发行交易和发行核验状态 |
| Market | Venue、Program、Curve Account、Pool、Quote Mint、市场阶段 |
| Wallet | 钱包地址、受管状态、用途和归属证据 |
| Wallet Group | 项目钱包组、成员、角色、预算和启停状态 |
| Order Intent | 项目、市场、钱包、方向、数量、限价/滑点约束和风险快照 |
| Execution | 签名、Slot、确认状态、实际成交、手续费和失败原因 |
| Inventory Lot | 钱包级 Token 数量、成本、来源和变动事件 |
| Treasury Entry | SOL/Token 资金流、费用、资本流入/流出和对账状态 |
| Risk Assessment | 风险策略版本、输入快照、发现项和 ALLOW/BLOCK/UNKNOWN 决策 |
| Lifecycle Event | 发行、曲线状态、毕业、迁移、池创建、退出和归档事件 |
| Project Archive | 原始证据、审计快照、版本和可重复复核结果 |

私钥不得进入 Project JSON、浏览器 localStorage、导出档案或普通 API 响应。钱包密钥存储继续独立隔离；Project 只保存钱包地址和受控引用。

### 3.2 Project 生命周期状态机

生命周期阶段与运行状态必须分离。

生命周期阶段建议：

`DRAFT → READY → LAUNCH_SUBMITTED → LAUNCHED → BONDING_CURVE_ACTIVE → GRADUATION_PENDING → PUMPSWAP_ACTIVE → EXIT_IN_PROGRESS → SETTLEMENT_PENDING → CLOSED → ARCHIVED`

规则：

- 每次阶段推进必须有对应的链上证据或明确标记为人工待核验。
- 不能仅凭 UI 点击把项目标记为已发行、已毕业或已结算。
- `HALTED` 是执行控制状态，不是生命周期阶段。
- `REVIEW_REQUIRED` 是证据或对账状态，不是市场阶段。
- 未知状态不能自动推断为成功。
- 阶段切换必须记录触发事件、证据来源、时间和操作者。

### 3.3 统一订单与事件状态

订单状态建议：

`CREATED → RISK_CHECKED → APPROVED → SUBMITTED → CONFIRMED`

异常分支：

- `REJECTED`：本地校验或风控拒绝；
- `FAILED`：链上明确失败；
- `UNKNOWN`：提交结果无法确认；
- `RECONCILED`：回执和实际账户变化完成核对；
- `CANCELLED`：尚未提交的订单意图被取消。

核心原则：

- UNKNOWN 不能自动重发。
- 已提交交易不能因为 UI 超时而当作失败。
- 确认交易不能只写入订单状态，必须同时进入事件账本和财务核对队列。
- 所有重试必须基于签名状态、区块高度和链上查询结果。

### 3.4 统一事件账本

建立不可静默覆盖的项目事件流，至少记录：

- Project Created / Updated；
- Wallet Added / Removed / Group Changed；
- Launch Intent / Launch Submitted / Launch Confirmed；
- Market Snapshot / Market Phase Changed；
- Order Created / Submitted / Confirmed / Failed / Unknown；
- Token Balance Changed / SOL Balance Changed；
- Inventory Lot Created / Updated / Closed；
- Fee Accrued / Fee Received；
- Graduation Detected / Migration Verified / Pool Verified；
- Risk Block / Emergency Halt / Resume；
- Exit Started / Exit Confirmed；
- Financial Reconciliation / Settlement Closed；
- Archive Created。

每个事件应包含 `event_id`、`project_id`、事件类型、发生时间、记录时间、来源、网络、市场身份、原始证据引用和校验状态。原始链上事实不可被派生分析覆盖；更正通过追加修正事件完成。

---

## 4. 八个业务引擎及职责边界

### 4.1 Project Engine

负责项目创建、配置、状态机、Token 身份、市场身份、钱包组关联、预算和生命周期编排。

不负责直接签名或执行交易。

### 4.2 Market Intelligence Engine

负责持续读取市场事件、曲线和池状态、交易回执、账户变化、价格和储备快照。

必须支持断线恢复、数据缺口识别、时间顺序和来源标记。

### 4.3 Market Quality Engine

负责市场质量描述和防御性异常检测：

- 价格和成交连续性；
- 买卖资金流代理指标；
- 交易规模分布和参与者广度；
- 可验证钱包集中度；
- 库存变化和潜在卖压；
- 交易前可用深度、滑点和价格冲击；
- 数据完整性、延迟和未知项。

不能把地址数量直接等同于独立参与者数量，也不能把集中度指标直接等同于操纵结论。

### 4.4 Inventory Engine

负责项目级、钱包级 Token/SOL 库存、成本批次、来源、可用余额和余额对账。

必须区分：

- 链上实际余额；
- 已提交但未确认的余额变化；
- 历史成本；
- 当前估值；
- 按可用深度估算的可兑现价值。

### 4.5 Treasury Engine

负责项目投入、回收、转账、手续费、Creator Fee、资本流入/流出、现金余额和 NAV。

至少分开显示：

- 已实现收益；
- 未实现估值变化；
- 实际到账；
- 应收费用；
- 预计退出回收；
- 实际退出回收。

### 4.6 Execution Engine

负责受控的发行、买卖和转账执行适配器，统一订单状态、签名、回执和恢复。

Venue Adapter 必须明确区分 Pump Bonding Curve 与 PumpSwap。不能用 PumpSwap SDK 路径冒充内盘执行能力。

### 4.7 Risk Engine

在交易提交前读取统一 Project、Wallet、Market、Inventory 和 Treasury 快照，输出明确决策：

- ALLOW；
- BLOCK；
- UNKNOWN（数据不足时默认不执行）。

至少覆盖项目预算、单钱包预算、总敞口、单市场集中度、回撤、数据新鲜度、滑点、可用深度、余额、交易状态不确定性和 Emergency Halt。

### 4.8 Simulation & Optimization Engine

负责离线、可重复、可校准的压力测试和策略评估。

在完成历史数据校准前，仿真结果必须标记为合成数据或未校准模型，不得用于宣称真实市场预测准确率。仿真环境不得连接真实签名或主网交易执行。

---

## 5. 操作台目标

操作台是一个 Project 的唯一主要运营入口。页面应先选择或创建 Project，再显示该 Project 的所有状态和操作。

### 顶部项目状态

- Project ID、Token Mint、当前 Venue 和生命周期阶段；
- 当前网络和数据来源；
- 当前钱包组；
- 执行开关、Emergency Halt 和数据完整度。

### 核心指标

- 累计实际投入；
- 累计实际回收；
- 项目现金余额；
- Token 总库存及逐钱包分布；
- 已实现收益；
- 未实现估值；
- 当前 NAV；
- 估算可兑现价值；
- 最大回撤；
- 风险状态。

### 市场区

- 实时或明确标记为历史的 K 线；
- 买卖成交与资金流；
- Bonding Curve / Pool 储备；
- 市场参与者和集中度证据；
- 当前深度、滑点和退出冲击估算；
- 数据时间、来源、覆盖率和缺口。

### 交易区

- 明确显示当前 Project、Mint、Venue 和钱包组；
- 单钱包及受控钱包组操作；
- 交易前模拟和风险门禁；
- 交易提交、确认、失败和 UNKNOWN 状态；
- 每笔交易关联签名、实际成交、余额和账本。

### 底部工作区

保留订单、资金流水、库存、流动性、财务结算、Creator Fee、风险审计和运行日志等标签。所有数据必须来自当前 Project，禁止混入默认 Token 或其他项目数据。

---

## 6. 下一阶段实施优先级

### P0 — 统一业务闭环基础

P0 的目标不是增加功能数量，而是让一个 Localnet 项目能形成可审计的端到端路径。

1. 建立统一 Project 数据模型和持久化存储。
2. 将项目草稿、历史工作区、钱包地址、Token Mint、市场身份统一关联。
3. 修复重复 `page === "wallet"` 分支造成的不可达 Treasury 页面代码，并把 Treasury 能力收敛到 Project 操作台。
4. 建立项目钱包组、角色、预算和启停状态。
5. 建立持久化 Order Intent、Execution、Event Ledger 和幂等键。
6. 将当前 PumpSwap Localnet 交易适配器接入 Project、订单和账本。
7. 实现 Pump Bonding Curve Localnet 交易适配器；若当前测试环境不支持，应先验证可用协议接口，不得以 PumpSwap 路径替代。
8. 建立交易前统一风险门禁，UNKNOWN 默认阻断。
9. 建立成交回执、钱包余额、Token 库存和 SOL 流水对账。
10. 完成一个项目从准备、Localnet 发行验证、内盘测试、毕业证据导入、PumpSwap 测试、退出和归档的端到端验收。

P0 不要求主网交易。先在本地验证环境完成业务完整性、故障恢复和账本一致性。

### P1 — 市场质量与生命周期自动化

1. 持续市场事件订阅、断线重连和缺口补齐。
2. 实时市场状态和数据完整度看板。
3. 项目级逐钱包库存和资金变化。
4. 交易前深度、价格冲击和退出回收估算。
5. Graduation 事件检测、迁移和 Pool 身份核验。
6. Creator Fee 从协议事件、应收、Bucket 到钱包到账的证据关联。
7. 风险告警、审计记录和操作员确认流程。

### P2 — 模型校准与高级运营

1. 参与者模型基于历史样本校准。
2. 仿真模型加入独立随机流、真实延迟分布和更合理的市场机制。
3. 对历史样本进行训练/验证/留出集分离。
4. 压力测试、极端行情、RPC 中断、交易 UNKNOWN 和服务重启恢复。
5. 更深入的流动性策略和执行质量优化。

### 当前明确不做

- 不新增一级导航页面；
- 不重复建设 Validator；
- 不把历史复核继续扩展成孤立页面；
- 不在 P0 扩展其他 DEX；
- 不重新设计已完成的基础数学模型；
- 不先做复杂动态 LP 仓位优化；
- 不把未校准仿真结果作为实时市场预测；
- 不实现洗售、自成交、虚假成交量、隐瞒关联钱包或误导性 K 线功能。

---

## 7. P0 端到端业务验收标准

只有以下场景全部通过，才能宣布“Localnet MVP 业务闭环完成”。

### 场景 A：创建项目

- 创建唯一 Project ID；
- 配置 Token 基本信息、网络、报价资产和 Dev Wallet；
- 配置项目钱包组；
- 刷新服务后项目仍存在；
- 不能出现 Project A 的钱包、Mint 或预算被 Project B 误用。

### 场景 B：发行与市场身份

- 发行或导入发行交易；
- 通过 Localnet RPC 核验签名、Mint、Program、Slot 和交易成功状态；
- 只有核验通过才能将项目推进到已发行；
- 市场身份必须明确区分 Bonding Curve 与 PumpSwap Pool。

### 场景 C：交易与订单

- 每次交易必须创建持久化订单；
- 提交前通过风险门禁；
- 交易结果可区分 CONFIRMED、FAILED、UNKNOWN；
- UNKNOWN 不自动重发；
- 服务重启后能恢复未完成订单状态；
- 订单能关联链上签名和实际成交。

### 场景 D：库存和资金

- 交易后读取钱包 SOL 和 Token 余额；
- 将余额变化与成交、费用和转账核对；
- 生成逐钱包库存和项目总库存；
- 无法核对时显示 UNKNOWN / REVIEW_REQUIRED，不得伪造完整数据。

### 场景 E：市场质量与风险

- 市场数据带来源、时间和完整度；
- 数据过期或身份不匹配时阻断交易；
- 超出项目预算、钱包预算或风险限制时阻断交易；
- Emergency Halt 能阻断所有执行入口；
- 恢复执行需要明确的操作员确认和审计记录。

### 场景 F：退出与结算

- 退出前显示可卖数量、估算价格冲击和费用；
- 退出后以链上确认成交和实际到账为准；
- 逐钱包核对剩余 Token 和 SOL；
- 应收费用与实际到账分开；
- 最终项目状态只有在所有待处理订单、资产和账本差异得到处理后才能 CLOSED。

### 场景 G：归档与复盘

- 导出 Project 原始事件、订单、执行、账本、库存和风险证据；
- 导入归档后从原始输入重新计算派生报告；
- 归档保留网络、Mint、Venue、时间区间和数据来源；
- 不把合成数据或人工登记证据标记成链上已验证事实。

---

## 8. 业务数据完整性原则

1. **单一项目上下文：** 页面、API、订单、钱包组和报表都必须显式携带 `project_id`。
2. **市场身份完整：** 至少包含 chain、network、token mint、quote mint、venue/program、curve/pool 和 lifecycle phase。
3. **原始事实优先：** 链上交易、签名和账户变化不可被 UI 计算结果覆盖。
4. **状态不确定时保守处理：** UNKNOWN 不是 FAILED，也不是 SUCCESS。
5. **估值与现金分离：** Token 账面价值不等于可兑现 SOL；应收不等于到账。
6. **钱包归属透明：** 只记录有证据的归属；未知或推断关系必须标记为未知或推断。
7. **数据来源可追溯：** Synthetic、Localnet、Observed Chain、Imported Report 必须清晰区分。
8. **策略版本可追溯：** 每笔交易记录当时使用的风险策略和参数版本。
9. **审计不可静默修改：** 对账修正通过追加事件和冲正分录完成。
10. **权限和密钥隔离：** 私钥不进入浏览器、普通 API、项目归档或日志。

---

## 9. 本轮交付与下一步

本文件冻结业务判断和实施验收标准，不代表本轮已经完成代码修复。

下一步按以下顺序推进：

1. 先根据本文件建立 Project Aggregate、生命周期状态机和统一事件/订单/账本的数据契约；
2. 再把现有 Localnet 钱包和 PumpSwap 执行路径接入统一 Project；
3. 再补 Pump Bonding Curve Localnet 执行路径；
4. 再接入风险门禁、余额核对、库存和 Treasury；
5. 最后完成端到端 Localnet 验收。

**后续开发的完成标准不是“页面做出来了”或“函数写出来了”，而是对应业务场景的输入、执行、状态、资金变化、异常恢复和审计证据全部闭环。**

---

## 10. Implementation progress update — 2026-11-25

The first Project Aggregate foundation and the Project Setup integration have now been implemented on master. See [Project Aggregate & Event Store — V1](project-aggregate-v1.md).

Completed in this slice:

- canonical Project aggregate with profile, Solana network identity, token parameters, Dev wallet group, market bindings, limits and lifecycle;
- atomic draft configuration command and optimistic revision checks;
- private local SQLite snapshot store with idempotent commands and append-only hash-chained audit events;
- loopback Project HTTP API for create, list, read, commands, event history and integrity verification;
- Project Setup page now reads and writes the canonical SQLite-backed API; legacy browser registry is retained only for export;
- terminal now displays the selected Project context and verified-market count;
- removed the unbound Pump Lab market/trading mounts from the terminal; execution remains disabled until Project-bound market identity, Venue Adapter, order ledger and Risk Gate are implemented.

Still incomplete:

- chain-backed verification of issuance and market accounts;
- Project-bound live market subscriptions and market adapters;
- Bonding Curve and PumpSwap execution bound to the selected Project;
- persistent orders, execution recovery, inventory, Treasury and settlement;
- browser-level operator acceptance and full Localnet end-to-end acceptance.

The current GitHub Actions result is a code-level gate only. It does not constitute a live Localnet launch, funded wallet transaction, mainnet execution or production acceptance.
