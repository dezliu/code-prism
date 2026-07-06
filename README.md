# 灵镜 (LingPrism)

企业知识与代码智能平台 — pnpm monorepo + 多语言微服务。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 14 + React 18 + Ant Design（三独立 app） |
| API | Node GraphQL + SSE 流式问答 |
| 核心 | Go + Rust indexer + Python AI/MCP |
| 数据 | MySQL · Redis · Neo4j · Qdrant · OpenSearch |

详见 [AGENTS.md](./AGENTS.md) 与 [docs/PRD_业务需求文档_v1.0.md](./docs/PRD_业务需求文档_v1.0.md)。

## 环境要求

- **Node.js** >= 20 · **pnpm** >= 9
- **Python** >= 3.11（ai-worker / mcp）
- **Go** >= 1.22（core，可选）
- **Rust**（indexer，可选）
- **Docker** & Docker Compose

## 快速开始（本地开发）

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
cd infra/docker && cp .env.example .env && cd ../..
```

> **端口说明：** 若 `infra/docker/.env` 使用非默认端口（示例：`MYSQL_HOST_PORT=13306`、`REDIS_HOST_PORT=6380`），`services/api` 会自动读取 `infra/docker/.env` 并推导连接地址。也可在根 `.env` 显式设置 `DATABASE_URL` / `REDIS_URL`。

### 3. 启动数据层

```bash
cd infra/docker
docker compose up -d
docker compose ps   # 确认 MySQL / Redis 等 healthy
```

| 服务 | 默认宿主机端口（`.env.example`） |
|------|----------------------------------|
| MySQL | 13306 |
| Redis | 6380 |
| Neo4j | 7474 / 7687 |
| Qdrant | 6335 |
| OpenSearch | 9201 |

### 4. 数据库迁移与种子数据

```bash
cd infra/migrations
npm install
npm run migrate
npm run seed
```

开发账户（密码均为 **`lingprism123`**）：

| 邮箱 | 角色 |
|------|------|
| `admin@lingprism.local` | admin |
| `employee@lingprism.local` | employee |

### 5. 启动后端服务

**API 网关（GraphQL + SSE，:4000）**

```bash
cd services/api
pnpm dev
```

**AI Worker HTTP（LLM 流式，:8001）**

```bash
cd services/ai-worker
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
lingprism-ai-http
# 或：AI_WORKER_HTTP_PORT=8001 python -m internal_http.server
```

**其他服务（Batch 1 骨架，按需启动）**

```bash
# Go core
cd services/core && go run ./cmd/server

# MCP
cd services/mcp && pip install -e ".[dev]" && lingprism-mcp

# Celery worker
cd services/ai-worker && celery -A celery_app worker --loglevel=info
```

### 6. 启动前端

```bash
# 用户平台   http://localhost:3000
pnpm dev:user

# 管理后台   http://localhost:3001
pnpm dev:admin

# 监控平台   http://localhost:3002
pnpm dev:monitor
```

### 7. 端到端验证（Batch 3 Demo）

1. 打开 http://localhost:3000/login
2. 使用 `employee@lingprism.local` / `lingprism123` 登录
3. 在对话区发送问题 → 观察 SSE 流式回答
4. 点击「停止」可中断生成

## 端口一览

| 服务 | 端口 | 说明 |
|------|------|------|
| user | 3000 | 用户平台 |
| admin | 3001 | 管理后台 |
| monitor | 3002 | 监控平台 |
| api | 4000 | GraphQL `/graphql` · SSE `/api/chat/*` |
| ai-worker HTTP | 8001 | 内部 LLM 流式 `/internal/chat/stream` |
| core HTTP / gRPC | 8080 / 50051 | Go 核心业务 |
| mcp | 8090 | MCP 2025 端点 |
| MySQL | 13306* | *docker 示例端口 |
| Redis | 6380* | *docker 示例端口 |

## 目录结构

```
apps/
  user/       # 用户前端 · 智能问答 /login
  admin/      # 管理后台
  monitor/    # 监控平台
packages/
  ui/         # 共享组件（AppShell、LoginForm）
  shared/     # 工具、RBAC 类型、auth token
  graphql/    # Apollo Client、useChatSSE、login API
  graph-viz/  # 图谱可视化（Phase 1）
services/
  api/        # GraphQL 网关 + JWT 认证 + SSE
  core/       # Go 核心业务
  indexer/    # Rust tree-sitter
  ai-worker/  # Celery + LangChain + LLM factory
  mcp/        # MCP 2025 对外服务
infra/
  docker/     # docker-compose 数据层
  migrations/ # MySQL Knex 迁移与 seed
docs/         # PRD、API 契约
```

## 关键 API

| 类型 | 路径 | 说明 |
|------|------|------|
| GraphQL | `POST /graphql` | `login` / `me` / 业务查询 |
| SSE | `POST /api/chat/stream` | 流式问答（需 JWT） |
| SSE | `POST /api/chat/stop` | 中断生成 |

SSE 事件协议见 [docs/api-contracts/sse-chat-events.md](./docs/api-contracts/sse-chat-events.md)。

## 常见问题

### `turbo: command not found`

根目录依赖未安装完整，执行：

```bash
pnpm install
```

### CORS 跨域错误

确认 `services/api` 已启动且 `CORS_ORIGINS` 包含前端源（默认 3000/3001/3002）。

### GraphQL `login` 报 `ECONNREFUSED`

1. 确认 MySQL 容器运行：`docker compose ps`
2. 确认已执行迁移：`cd infra/migrations && npm run migrate && npm run seed`
3. 确认 `infra/docker/.env` 中 `MYSQL_HOST_PORT` 与 API 连接一致（或设置根 `.env` 的 `DATABASE_URL`）
4. **重启** `services/api` 使配置生效

### 迁移 `Failed to load ts-node/register`

`infra/migrations` 已使用 `tsx` 加载 TypeScript，请在该目录执行 `npm install` 后再 `npm run migrate`。

### `EMFILE: too many open files`（Next.js）

```bash
ulimit -n 10240
pnpm dev:user
```

## 开发批次进度

| 批次 | 内容 | 状态 |
|------|------|------|
| Batch 0 | env 模板 · monorepo · docker 数据层 | ✅ |
| Batch 1 | 五服务骨架（api/core/indexer/mcp/ai-worker） | ✅ |
| Batch 2 | LLM 多厂商适配 · Qdrant collection 命名 | ✅ |
| Batch 3 | 本地认证 · SSE 流式问答 · 三端 LoginForm | ✅ |
| Batch 4 | Dockerfile · Nginx 全栈部署 | 待实现 |
| Batch 5 | Phase 1 P0 业务闭环 | 待实现 |

## 测试

```bash
# API
cd services/api && pnpm test

# ai-worker
cd services/ai-worker && source .venv/bin/activate && pytest -v

# core（需 Go）
cd services/core && go test ./...

# indexer
cd services/indexer && cargo test
```
