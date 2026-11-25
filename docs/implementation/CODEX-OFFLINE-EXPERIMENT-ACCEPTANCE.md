# Codex 离线实验验收（C08–C10）

仅验收已有离线合成报告与历史账务，不连接实时市场、不提交交易、不更改本地 validator 或数据库。不要把合成结果称为真实竞争者行为。保护现有 dirty worktree，使用独立 checkout；记录实际 commit、Node 版本和命令退出码。

## 验收范围

1. npm ci、npm run accept:all，保存真实测试结果。
2. 对已有合成报告运行 scripts/review-synthetic-simulation-ledger.mjs，核对逐账户差额；没有期初记录的旧报告应拒绝。不得补造缺失记录。
3. 对已有多个不同 scenario_id 的报告数组运行 scripts/review-synthetic-report-batch.mjs。检查一致、需复核、拒绝数量；重复 scenario_id 的所有记录应拒绝；不同实验的差额不得抵消。输入上限 100 份/32 MiB（CLI 文件）。
4. 打开市场风险实验页，导入上一步第 2 项生成的 ledger_input JSON；比较逐账户结果与 CLI。固定样本、异常 JSON、缺失账户、导出结果均应验证；浏览器输入上限 4 MiB。
5. 使用测试中的合成反例确认异常结果可见，保留脱敏截图及实际 console 观察。

## 结果

输出 PASS、FAIL、PARTIAL、NOT_TESTED，列出真实差额、证据位置、复现步骤和源码路径。不要将单个合成模板的多次重复计为独立市场路径。真实历史回执、费用归属及实际市场行为不属于本次离线核验；尚未验证则注明。不得开启执行开关、创建钱包、发币或进行交易。将脱敏验收报告提交到 master 前检查不含凭据及私有原始数据。
