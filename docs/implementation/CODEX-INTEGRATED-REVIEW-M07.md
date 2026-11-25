# M07 整体集成验收 — Codex 操作者清单

基线 cf15b3cf618b2a902e851ad3e00bb84f17b92c4b，GitHub Actions 45552430582，Node 22/24 各 433 tests、0 failures，8 operator gates pending。此基线不是实际环境验收结果。

## 范围与约束

保留原始工作区所有本地修改；使用独立 checkout，记录实际 commit、Node、npm、工作区状态。仅检查已有历史数据与离线合成报告，不开启执行开关，不创建钱包或 Token，不进行交易、不重置 validator 或修改数据库。保护原始回执、凭据和私有数据。没有证据的项目标记 UNKNOWN 或 NOT_TESTED，不补造历史。

## 验收矩阵

| ID | 检查 | 预期证据 |
|---|---|---|
| M07-01 | npm ci / npm run accept:all | 实际退出码、测试数量、失败、跳过、JSON 报告 |
| M07-02 | 项目档案页面 | 两份不同区间记录、重复和冲突记录、网络/Genesis 区分、导出原始输入、刷新清空；不改变操作台或钱包 |
| M07-03 | 历史数据身份 | 不同曲线、报价资产、网络、合成 seed/version 错配应拒绝或 REVIEW；缺失来源认证仍 UNKNOWN |
| M07-04 | 已有合成报告 | 全报告账簿复算、逐账户差额、重复事件、缺失期初拒绝；模型未校准状态保留 |
| M07-05 | 批量 CLI 核验 | 独立 scenario ID；重复 ID 双方拒绝；对冲差额不抵消；异常数量、未知与未评估分列 |
| M07-06 | 浏览器批量复盘 | 导入原始报告数组，比较 CLI 同份输入的状态、计数和检查矩阵；异常 JSON、派生报告拒绝；失败后不能导出旧结果 |
| M07-07 | 浏览器账簿复盘 | 导入 ledger_input；比较 CLI 逐账户差额；缺失账户及异常展示；导出结果不可作为输入 |
| M07-08 | 六页导航与数据隔离 | 实际浏览器截图、console、页面切换、历史与合成标签、原始和派生报告分离 |
| M07-09 | 已保留历史证据复核 | 仅复核现有回执与数据库记录；区分源认证、算术一致、覆盖完整、费用归属；缺失则 UNKNOWN |
| M07-10 | 功能差距复核 | 明确实际发行、自动新币发现、独立竞争者交易、真实市场校准、持久化项目生命周期尚未实现或未验收；不扩大此验收范围 |

已有报告的复核命令（输出路径必须是新文件）：

```sh
node scripts/review-synthetic-simulation-ledger.mjs <existing-report.json> <new-ledger-input.json>
node scripts/review-synthetic-report-batch.mjs <existing-report-array.json> <new-batch-audit.json>
```

CLI 批量输入上限 32 MiB / 100 份；浏览器批量和账簿文件上限 4 MiB；项目档案会话最多 8 份和 16 Mi 字符总量。输入不兼容应如实记录，不将缺失样本算作通过。

## 交付

输出 .cook-system/acceptance/CODEX-INTEGRATED-REVIEW-M07-RESULT.md，包含每项 PASS / FAIL / PARTIAL / UNKNOWN / NOT_TESTED、实际结果、证据路径、复现步骤、确认的缺陷与证据缺口。保存脱敏截图和 JSON；不得提交含凭据或私有原始回执的文件。代码检查通过不等于真实市场、Localnet 交易或生产验收。本文仅为清单，不是验收结果。

## M07-R1 — fixed QA inputs for missing-file acceptance gaps

Operator report: PARTIAL, 433/433, six pages opened; no new confirmed defect. The fixtures under `fixtures/synthetic/m07/` are hand-authored accounting QA inputs (not reconstructed history or calibrated market paths). Their expected results are tested in `test/m07-acceptance-fixtures.test.mjs`.

```sh
node scripts/review-synthetic-simulation-ledger.mjs fixtures/synthetic/m07/report-single.json /tmp/m07-ledger-new.json
node scripts/review-synthetic-report-batch.mjs fixtures/synthetic/m07/report-array-pass.json /tmp/m07-pass-new.json
node scripts/review-synthetic-report-batch.mjs fixtures/synthetic/m07/report-array-mixed.json /tmp/m07-mixed-new.json
```

Use unused output paths. Expected CLI exit codes 0, 0, 2 respectively. Mixed batch: 1 internally consistent, 2 review required, 1 rejected. Two opposite account differences +1 and -1 remain separate. Import the exact same inputs and generated ledger into browser using the operator's permitted file chooser; do not bypass permission restrictions. For catalogue, add the existing inner-market-mvp sample, import catalogue-second.json, reimport the original, then import catalogue-conflict.json. Expect two records, duplicate idempotence, and conflict rejection. Verify no change to terminal/wallet state. Capture screenshots manually when automation is blocked. These fixture checks are not independent chain evidence, real market calibration, live competitor behavior or complete browser acceptance.
