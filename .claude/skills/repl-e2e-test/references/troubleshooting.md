# Troubleshooting

## PTY runner 超时，找不到 `You> `

可能原因与处理：

- REPL 启动阶段卡在 MCP 初始化  
  - 确认测试使用的是 PTY runner（`repl-pty-runner.mjs`）而不是直接用 Bun 跑 PTY。
  - 若 MCP 配置导致阻塞，优先检查 `mcp_servers.json` 或网络依赖。

- 输出被终端控制序列打断  
  - PTY runner 只做输出流字符串匹配，确保断言使用简单的字符串。

## `posix_spawnp failed`

通常是 `node-pty` 的 `spawn-helper` 没有执行权限：

- 路径：`node_modules/node-pty/prebuilds/<platform-arch>/spawn-helper`
- 解决：确保可执行位（测试 runner 会自动 chmod，但如果失败可手动处理）

## Mock SSE 没有被命中

- 确认测试里设置了 `ANTHROPIC_BASE_URL` 指向本地 mock server。
- 确认 `tests/e2e/helpers/anthropic-mock.ts` 正在返回 `/v1/messages` 的 SSE 事件。

## 回复文本不匹配

- 断言文本与 mock server 的 `replyText` 必须一致。
- 若要更新回复文本，需同时改：
  - `tests/e2e/repl-pty.test.ts` 里的 `REPL_REPLY_TEXT`
  - `tests/e2e/helpers/anthropic-mock.ts` 的默认回复或测试传参
