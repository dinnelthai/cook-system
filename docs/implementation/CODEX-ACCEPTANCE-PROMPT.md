# Codex task — unified Cook System acceptance

你现在负责对本地 `cook-system` 做一次完整、独立的工程验收。**本轮只检查和报告，不修改源码、不自动修复。**

1. 先读取 `docs/implementation/CODEX-ACCEPTANCE-PLAYBOOK.md`，严格遵守其中的安全边界。
2. 确认当前分支为 `master`，同步远程最新代码，记录 commit SHA、OS/WSL、Node/npm 版本。
3. 执行 `npm ci` 和 `npm run accept:all`，保存完整 JSON 验收报告。
4. 检查现有 Localnet / Pump Lab 环境。不得重置或重建 validator，不得请求 SOL，不得签名、转账、买卖或提交任何交易。
5. 对真实 Localnet 只做只读 RPC 预检；必须用独立确认的 private genesis pin。证据不足就标记 PARTIAL / UNKNOWN，不得补造数据。
6. 启动离线终端进行真实浏览器检查，三个 `COOK_LOCAL_*` 执行开关全部保持关闭。
7. 审查 playbook 指定的高风险代码，完成可安全执行的性能、恢复和安全检查。
8. 不要把 synthetic fixture 的通过解释为真实链上正确性、盈利能力、操纵检测准确率或生产就绪。

请输出：

- `.cook-system/acceptance/CODEX-ACCEPTANCE-REPORT.md`
- `.cook-system/acceptance/unified-acceptance-*.json`
- 必要的截图/浏览器 console/network 证据

每个问题必须包含 P0/P1/P2/P3 严重级别、文件和行号、复现步骤、实际影响、证据、建议回归测试。明确区分 confirmed defect、风险假设和缺失证据。不要改代码。

最后给出优先级最高的 10 个问题，以及哪些验收项由于环境或证据不足无法完成。完成后把报告交还给项目负责人，等待下一轮修复。
