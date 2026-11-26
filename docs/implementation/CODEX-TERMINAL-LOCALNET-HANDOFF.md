# Cook System — Codex 本地联调交接（2026-11-26）

## 责任分工

ChatGPT 负责代码、回归用例及任务清单，直接提交 main。Codex 负责本地真实环境的只读联调、测试执行和证据记录。当前文档不是已执行的验收报告；不能从 fixture 推断真实 Validator 已通过。保持操作台 UI/CSS/布局冻结，不修改交易执行权限，不部署或重置现有 validator，不请求空投、不签名、不提交链上交易、不导出密钥。

## 待联调任务

| ID | 本地验收内容 | 当前状态 |
|---|---|---|
| T01/T17 | 核对实际 RPC URL、转发、独立确认的 genesis pin；复现并定位 RPC Error | 待 Codex |
| T02/T03 | 对现有三个钱包逐一对比 SOL、SPL/Token-2022 的真实只读 RPC 结果；区分 0 与未知 | 待 Codex |
| T04 | Overview 的 SOL、不同 Token 数量、钱包数量；切换 Token、刷新、弹窗期间状态 | 待 Codex |
| T05 | 已注册 Token 的 getTokenSupply 与持仓百分比、精度、不同 mint/网络拒绝 | 待 Codex |
| T06 | Pump Lab 现有已注册 PumpSwap 池行情，1m/5m/15m/1h、范围、空数据、断线恢复和错误状态 | 待 Codex |
| T07 | Trades Log 只读绑定：finalized 且单一 PumpSwap 成交事件、真实用户报价字段、余额核对 PASS；普通转账、失败、混合或证据不足的收据不展示。使用已有历史收据检查筛选、排序、无证据状态 | 待 Codex |
| T08 | 历史已实现收益逐笔复核：净卖出收入减已分摊历史成本，与声明收益及现金账核对；缺失成本、重复、金额不符时不展示收益。验证正负收益与整数精度。近期收据不足以支持当前钱包 Profit 或未实现收益，不用历史报表冒充实时估值 | 待 Codex（历史核算） |
| T09 | Delete 的浏览器列表移除和 Restore，刷新持久化；确认密钥与链上余额未改变 | 待 Codex |
| T18 | npm test、现有 accept:all、只读浏览器验收与证据归档 | 待 Codex |

## 执行顺序

1. 记录当前 git 状态、分支、commit、Node/npm 版本；保护未提交本地修改。同步 main（不强制覆盖）。
2. npm ci；npm test；npm run accept:all。记录完整退出码、失败测试和日志，不能伪造通过。
3. 保持 COOK_LOCAL_FAUCET=0、COOK_LOCAL_TRANSFER=0、COOK_LOCAL_TRADING=0。确认本机既有服务与 COOK_LOCAL_RPC_URL、COOK_LOCAL_GENESIS_HASH 一致。Genesis 必须独立确认，不得直接把未知 RPC 返回值当成可信 pin。
4. 启动现有 terminal，执行 node scripts/diagnose-terminal-assets.mjs；非默认 4173 使用 COOK_TERMINAL_URL（loopback）。记录诊断 JSON，不打印私钥、API key 或完整请求凭证。
5. 仅在已有 Pump Lab 及独立确认 Localnet genesis、已注册且验证的 PumpSwap 市场可用时，配置 COOK_PUMP_LAB_URL 与 COOK_LOCAL_MARKET_READ=1；执行开关继续关闭。读取行情，不发送交易。Pump Lab 索引来源认证仍为 UNKNOWN，不当作完整链上历史。
6. 浏览器检查上述 T01–T06/T09，RPC 错误、缺失值和不支持的周期不得显示虚构数据。记录实际截图、网络响应状态和复现步骤。
7. 检查 /api/local-wallet/trade 仍然拒绝执行。不得为了通过验收移除网络、权限或请求边界。
8. 输出 .cook-system/acceptance/TERMINAL-LOCALNET-HANDOFF-REPORT.md，逐项 PASS/FAIL/PARTIAL/BLOCKED，附实际证据、严重级别和文件/行号。未完成项继续保留。不要改 UI；不要把验收任务变成新功能开发。

当前后端仅新增可独立启用的只读行情快照路径。T07 严格收据日志绑定已提交；覆盖有限（最近收据、单一且可核对的 PumpSwap 成交，不代表完整交易历史）。T08 已补历史已实现 PnL 算术核验与报表绑定；实时钱包 Profit 未接入，缺完整历史成本及独立估值证据时保持未知。T10–T16 仍属开发待办。未授权 Codex 自动执行本任务，由操作者在本地发起。
