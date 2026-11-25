# M15 — 业务完整度复审与验收缺口

审查基线：main `95d058c58be69085f2984d389fb544fd3e56d9af`，2026-11-25。此文档更新业务判断，不替代原始 M10 基线。
CI: [45580257777](https://github.com/dinnelthai/cook-system/actions/runs/45580257777)。Node 22/24 各 558 项测试、0 失败，12 项自动验收通过，8 项 operator gates pending。Git tree 非截断，367 个 blob，test/ 下 97 个文件。审查采用目录清单、重点源码与 CI 日志，不声称逐行审查所有文件或实际浏览器/Localnet 验收。

## 结论

已形成 Project 级历史证据、资金审计、订单回执和风险复核体系，尚不是生产级做市交易系统。历史审计与实时运营不是同一业务闭环。交易执行在 Project 模型和 HTTP 边界保持关闭；不以虚假交易量、关联钱包隐瞒或误导性行情作为目标。

| 业务域 | 主观评分 / 100 | 当前能力 |
|---|---:|---|
| Project | 85 | 持久化、配置、事件、版本隔离 |
| 历史数据重放 | 75 | 多协议历史适配器、回放与样本测试 |
| 财务库存审计 | 75 | 历史区间核算与证据归档 |
| 市场质量分析 | 65 | 历史成交、K 线、储备证据审计 |
| 生命周期 | 50 | 状态模型与历史里程碑，未形成真实闭环 |
| 订单管理 | 45 | 历史回执级审计，非生产 OMS |
| 风险控制 | 45 | 证据风险聚合，非实时执行门禁 |
| 钱包资产 | 45 | 独立 Localnet 工具和历史财务证据 |
| 仿真 | 35 | 未校准合成模型 |
| 流动性管理 | 15 | 历史储备证据，不提供运营闭环 |
| 交易执行 | 10 | Project 执行关闭 |
| 生产运维 | 10 | 自动 CI，实际运行能力未验收 |

等权均值约 46/100，主观判断，不是性能或生产验收指标；此前重构实施进度不能等同业务完整度。

## 优先发现项

| ID | 优先级 | 证据位置（基线） | 缺口和验收要求 |
|---|---|---|---|
| M15-F01 | P0 | src/inner-market/project-store.mjs:108-125 | Snapshot hash 与事件链分别校验，未验证快照由事件语义重建一致。设计兼容旧事件的重放/差异检测或显式不可重放标记；加入有效 hash 但内容不一致的回归。 |
| M15-F02 | P0 | src/inner-market/project-aggregate.mjs:221-224; src/inner-market/project-http.mjs:6-19; scripts/serve-offline-mvp.mjs:70 | Project 执行关闭；公共接口不能推进需要可信证据的阶段。不能用本地回执或修改标记冒充生产交易能力。保持关闭并记录能力矩阵。 |
| M15-F03 | P1 | scripts/serve-offline-mvp.mjs:71-77 | 独立 Localnet 钱包转账/airdrop 工具并非 Project 财务事件。默认关闭，独立记录实验环境，不将余额推定为项目资金。 |
| M15-F04 | P1 | web/project-setup-view.mjs:112-125 | 仅可观察已登记市场，未见市场登记 UI 调用 BIND_MARKET。验收应覆盖只读市场身份登记、冲突提示、版本隔离。 |
| M15-F05 | P1 | src/inner-market/project-evidence-reader.mjs; project-lifecycle-evidence.mjs | 观察结果不构成独立认证；旧版档案不能自动满足当前阶段。实际私有 Localnet 只读对比待验。 |
| M15-F06 | P1 | web/app.mjs:160-312 | 已有切换保护，但实际异步竞争、空报告、失败恢复、窄屏和导出尚未浏览器验收。 |
| M15-F07 | P1 | src/inner-market/project-treasury-review.mjs; project-close-evidence.mjs | 单区间账目不等于全项目资产；缺独立账户归属、余额、成本、估值和原始报告保留验收。 |
| M15-F08 | P1 | src/inner-market/project-risk-review.mjs; project-market-evidence-review.mjs | 风险仅为回顾性证据，实时资产、市场数据与深度未知。不得把 UNKNOWN 改成安全或交易许可。 |
| M15-F09 | P2 | web/project-registry.mjs; web/project-setup-view.mjs | 旧 localStorage 已保留为旧记录导出用途，不再是主实体；明确迁移说明和退役条件。 |
| M15-F10 | P2 | src/simulation/participant-model-contract.mjs:6-19 | 固定轮询、简化市场、共享随机流、未用参数及未校准；仅可作防御性合成压力测试，不代表真实行为或收益。 |
| M15-F11 | P1 | docs/implementation/final-engineering-acceptance-2026-11-25.md | 仍记录旧 master SHA 和 334 项测试；历史基线保留但不能当作当前验收。README 指向本复审。 |

## 下一阶段优先验收

1. 数据一致性：快照/事件链语义核验、损坏检测、归档完整性与恢复。
2. API 和界面：市场身份登记、报告引用、错误状态、版本隔离；浏览器可重复验收。
3. 真实数据：独立确认私有 genesis，使用现有 Localnet 的闭区间只读证据和独立账目对比；不启动、重置 validator 或提交交易。
4. 稳定性：并发读写、容量上限、延迟与恢复实测；本机密钥权限及历史凭据审查。
5. 重新评级：按可复现结果记录 PASS/FAIL/NOT_RUN，未知不得自动升级。

当前明确未完成：真实浏览器、Localnet 只读数据验证、独立财务认证、真实归档回执适配器对比、密钥权限/凭据历史、负载与恢复。未进行实际环境测试，不能声称生产就绪。
