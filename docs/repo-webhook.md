# Git 仓库 Webhook（预留）

> **状态**：未实现。v1 使用 Core 轮询（`REPO_SYNC_INTERVAL_MINUTES`，默认 5 分钟）感知远端 commit 变动并自动 pull。

## 规划端点

```
POST /internal/repos/webhook/{repoId}
Header: X-Webhook-Secret: <REPO_WEBHOOK_SECRET>
```

收到 GitLab / GitHub push 事件后，触发与轮询相同的 `git.Client.Sync` 逻辑，更新 `remote_commit_hash` / `local_commit_hash`，并在 `indexed_commit_hash != remote_commit_hash` 时在代码源管理页提示「有新 commit」。

## 配置项（后续）

| 环境变量 | 说明 |
|----------|------|
| `REPO_WEBHOOK_SECRET` | Webhook 校验密钥 |
| `REPO_SYNC_INTERVAL_MINUTES` | 轮询间隔（已实现） |

## 管理端展示（后续）

在代码源详情中展示 webhook URL，供管理员配置到 Git 平台。
