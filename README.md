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

## 一键启动（Docker 全栈，推荐）

无需本地安装 Node / Go / Python，一条命令启动全部服务，统一从 **http://localhost:8080** 访问。

### 首次准备（一次性）

```bash
# 1. 克隆后安装前端 monorepo 依赖（仅开发改代码时需要；纯 Docker 跑 Demo 可跳过）
pnpm install

# 2. 复制环境变量
cp .env.example .env
cd infra/docker && cp .env.example .env && cd ../..

# 3. （可选）编辑 infra/docker/.env，填入 ZHIPU_API_KEY 以启用真实 LLM 流式问答
```

### 启动

```bash
cd infra/docker
docker compose --profile app up -d --build
```

首次启动会自动执行 **MySQL 迁移 + 种子数据**（`migrate` 一次性任务）。等待约 1–2 分钟，确认服务健康：

```bash
docker compose --profile app ps          # 各服务应为 Up / healthy
curl http://localhost:8080/api/health    # 应返回 {"status":"ok","service":"api",...}
```

### 访问页面

| 地址 | 用途 |
|------|------|
| **http://localhost:8080/login** | 用户平台登录（主入口，推荐） |
| http://localhost:8080 | 用户平台首页（登录后） |
| http://admin.localhost:8080 | 管理后台 |
| http://monitor.localhost:8080 | 监控平台 |
| http://localhost:8080/graphql | GraphQL API（开发调试） |

开发账户（密码均为 **`lingprism123`**）：

| 邮箱 | 角色 |
|------|------|
| `employee@lingprism.local` | employee（普通用户，测问答） |
| `admin@lingprism.local` | admin（管理员） |

**推荐体验路径：**

1. 打开 http://localhost:8080/login
2. 登录 `employee@lingprism.local` / `lingprism123`
3. 在对话区发送问题 → 观察 SSE 流式回答
4. （可选）访问 http://admin.localhost:8080 、http://monitor.localhost:8080

> **LLM 说明：** 未配置 `ZHIPU_API_KEY` 时，问答会返回 `LLM_NOT_CONFIGURED` 错误提示。在 `infra/docker/.env` 填入密钥后执行 `docker compose --profile app up -d ai-worker` 重启即可。

### 停止

```bash
cd infra/docker
docker compose --profile app down        # 停止全部容器，保留数据
# docker compose --profile app down -v   # 停止并删除数据卷（清空数据库）
```

若曾本地手动启动过 `go run`、`lingprism-ai-http`、`pnpm dev` 等，也需在各终端 `Ctrl+C` 结束，避免占用端口。

### 重启（不重新构建镜像）

```bash
cd infra/docker
docker compose --profile app up -d
```

---

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

> **端口说明：** 数据层端口以 `infra/docker/.env.example` 为准（示例：`MYSQL_HOST_PORT=13306`、`REDIS_HOST_PORT=6380`）。`services/api` 与 `services/core` 启动时会自动读取根目录 `.env` 与 `infra/docker/.env`，并据此推导 MySQL / Redis / Qdrant 等连接地址。也可在根 `.env` 显式设置 `DATABASE_URL`、`MYSQL_DSN`、`REDIS_URL` 等覆盖。

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
# Go core（本地 HTTP 默认 :18080，见下方「端口一览」）
cd services/core && go run ./cmd/server

# MCP
cd services/mcp && pip install -e ".[dev]" && lingprism-mcp

# Celery worker
cd services/ai-worker && celery -A celery_app worker --loglevel=info
```

> **并行 Docker 全栈时：** Nginx 已占用宿主机 `8080`，本地 `core` 会自动回退到 `18080`；MySQL 请连 Docker 映射端口 `13306`（勿用 `3306`）。健康检查：`curl http://localhost:18080/health`。

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
3. 在对话区发送问题 → 观察 SSE 流式回答（本地需启动 `services/api` + `services/ai-worker`；LLM 需在 `services/ai-worker/.env` 或根 `.env` 配置 `ZHIPU_API_KEY`）
4. 点击「停止」可中断生成

## 一键全栈部署（Docker Compose）

> **与上文「一键启动」相同。** 本节保留构建细节与进阶说明。

Batch 4 提供 **Nginx 统一入口 + 各服务 Dockerfile**，无需本地安装 Node/Go/Python 即可运行 Demo。

### 前置条件

- Docker Desktop / OrbStack 已安装并运行
- 可选：在 `infra/docker/.env` 中设置 `ZHIPU_API_KEY`（流式问答需真实 LLM）

### 启动命令

与「一键启动」相同：

```bash
cd infra/docker
cp .env.example .env   # 首次
docker compose --profile app up -d --build
docker compose --profile app ps
```

### 访问入口（Nginx :8080）

完整页面列表见上文 **「一键启动 → 访问页面」**。常用地址：

| 地址 | 说明 |
|------|------|
| http://localhost:8080 | 用户平台（默认路由） |
| http://localhost:8080/graphql | GraphQL API |
| http://localhost:8080/api/chat/stream | SSE 流式问答 |
| http://localhost:8080/mcp | MCP 2025 端点 |
| http://user.localhost:8080 | 用户平台（子域） |
| http://admin.localhost:8080 | 管理后台 |
| http://monitor.localhost:8080 | 监控平台 |
| http://api.localhost:8080/graphql | API 专用子域 |

健康检查：

```bash
curl http://localhost:8080/api/health
```

### 全栈端到端验证

1. 打开 http://localhost:8080/login
2. 登录 `employee@lingprism.local` / `lingprism123`
3. 发送问题 → 观察 SSE 流式回答（需在 `infra/docker/.env` 配置 `ZHIPU_API_KEY`；未配置时返回 `LLM_NOT_CONFIGURED` 错误事件，而非真实回答）
4. MCP 探活（需 Header `MCP-Protocol-Version: 2025-03-26` 与 API Key）：

```bash
curl -s http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-03-26" \
  -H "Authorization: Bearer dev-key-1" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

### 仅启动数据层

与 Batch 0 行为一致，不构建应用镜像：

```bash
cd infra/docker
docker compose up -d
```

### 停止与清理

与「一键启动 → 停止」相同：

```bash
cd infra/docker
docker compose --profile app down        # 停止容器，保留数据卷
docker compose --profile app down -v     # 停止并删除数据卷
```

### Dockerfile 清单

| 文件 | 服务 |
|------|------|
| `infra/docker/Dockerfile.api` | GraphQL + SSE 网关 |
| `infra/docker/Dockerfile.core` | Go 核心业务 |
| `infra/docker/Dockerfile.indexer` | Rust 索引器（CLI） |
| `infra/docker/Dockerfile.mcp` | MCP 2025 服务 |
| `infra/docker/Dockerfile.ai-worker` | AI Worker HTTP + Celery |
| `infra/docker/Dockerfile.frontend` | Next.js 三前端（build-arg `APP`） |
| `infra/docker/Dockerfile.migrate` | 一次性 DB 迁移 |

Nginx 配置位于 `infra/nginx/`。

### 基础设施测试

```bash
cd infra/docker/tests
npm install
npm test
```

覆盖 Nginx 路由断言、`docker-compose.yml` 结构校验、`nginx -t` 语法检查。

### Go 模块代理（core 镜像构建）

Docker 构建 `core` 时默认使用 `GOPROXY=https://goproxy.cn,direct`（见 `infra/docker/.env.example`）。若出现 `proxy.golang.org ... i/o timeout`：

```bash
# infra/docker/.env
GOPROXY=https://goproxy.cn,direct
```

海外网络可改为 `GOPROXY=https://proxy.golang.org,direct`，然后重新构建：

```bash
cd infra/docker
docker compose --profile app build core
```

## 端口一览

### 本地开发（`pnpm dev` / `go run`，数据层用 Docker）

| 服务 | 宿主机端口 | 说明 |
|------|------------|------|
| user | 3000 | 用户平台 |
| admin | 3001 | 管理后台 |
| monitor | 3002 | 监控平台 |
| api | 4000 | GraphQL `POST /graphql` · SSE `POST /api/chat/*` |
| ai-worker HTTP | 8001 | 内部 LLM 流式 `POST /internal/chat/stream`（api 代理） |
| core HTTP | **18080**† | Go 内部 HTTP `/health`、内部 API |
| core gRPC | 50051 | Go 核心业务 gRPC |
| mcp | 8090 | MCP 2025 端点 |
| MySQL | 13306 | Docker 映射（容器内 3306） |
| Redis | 6380‡ | Docker 映射（容器内 6379） |
| Neo4j | 7474 / 7687 | HTTP / Bolt |
| Qdrant | 6335 | REST（gRPC 6334） |
| OpenSearch | 9201 | REST |

† **core HTTP：** 若宿主机 `8080` 空闲则使用 `8080`；当 Docker Nginx 全栈已启动占用 `8080` 时，自动回退到 `18080`。本地其他服务连 core 时请设 `CORE_GRPC_ADDR=localhost:50051`；若用 HTTP 则指向 `http://localhost:18080`。

‡ 若 `infra/docker/.env` 中 `REDIS_HOST_PORT` 与上表不一致，以该文件为准。

### Docker 全栈（`docker compose --profile app`，Nginx 统一入口）

| 对外地址 | 容器内上游 | 说明 |
|----------|------------|------|
| http://localhost:8080 | user:3000 | 用户平台（默认路由） |
| http://localhost:8080/graphql | api:4000 | GraphQL |
| http://localhost:8080/api/chat/stream | api:4000 | SSE 流式问答 |
| http://localhost:8080/api/health | api:4000 | API 健康检查 |
| http://localhost:8080/mcp | mcp:8090 | MCP 2025 |
| user/admin/monitor/api.localhost:8080 | 各前端 / api | 子域入口（见上文访问表） |

容器内服务（**不**映射到宿主机，仅 Docker 网络内访问）：

| 服务 | 容器端口 | 说明 |
|------|----------|------|
| api | 4000 | GraphQL + SSE 网关 |
| core HTTP / gRPC | 8080 / 50051 | Go 核心业务 |
| ai-worker HTTP | 8001 | LLM 流式 |
| mcp | 8090 | MCP 服务 |
| nginx | 80 → 宿主机 8080 | 反向代理 |

数据层宿主机端口与「本地开发」表相同（见 `infra/docker/.env.example`）。

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
  docker/     # docker-compose + 各服务 Dockerfile
  nginx/      # Nginx 反向代理（三前端 + API + MCP）
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

### `go run ./cmd/server` 报 `address already in use`（8080）

Docker 全栈 Nginx 已占用宿主机 `8080`。本地 core 会自动回退到 `18080`；验证：`curl http://localhost:18080/health`。若需固定端口，在根 `.env` 设置 `CORE_HTTP_PORT=18080`。

### core 报 `mysql unavailable` / 连接 `localhost:3306` 失败

根 `.env` 中 `MYSQL_DSN` 可能仍指向 `3306`，而 Docker MySQL 映射在 `13306`。任选其一：

1. 在 `infra/docker/.env` 设置 `MYSQL_HOST_PORT=13306`（core 会优先采用）
2. 或将根 `.env` 的 `MYSQL_DSN` 改为 `...@tcp(localhost:13306)/...`

### SSE 返回 `LLM_NOT_CONFIGURED` 或 `[placeholder:...]`

在 `infra/docker/.env` 配置 `ZHIPU_API_KEY` 后重启 ai-worker：

```bash
cd infra/docker && docker compose --profile app up -d ai-worker
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

### Docker 构建 `core` 时 `go mod download` 超时

`proxy.golang.org` 在国内网络常不可达。确认 `infra/docker/.env` 含 `GOPROXY=https://goproxy.cn,direct` 后重建：

```bash
cd infra/docker && docker compose --profile app build core
```

## 开发批次进度

| 批次 | 内容 | 状态 |
|------|------|------|
| Batch 0 | env 模板 · monorepo · docker 数据层 | ✅ |
| Batch 1 | 五服务骨架（api/core/indexer/mcp/ai-worker） | ✅ |
| Batch 2 | LLM 多厂商适配 · Qdrant collection 命名 | ✅ |
| Batch 3 | 本地认证 · SSE 流式问答 · 三端 LoginForm | ✅ |
| Batch 4 | Dockerfile · Nginx 全栈部署 | ✅ |
| Batch 5 | Phase 1 P0 业务闭环 | ✅ |

## 测试

```bash
# 基础设施（Batch 4）
cd infra/docker/tests && npm install && npm test

# API
cd services/api && pnpm test

# ai-worker
cd services/ai-worker && source .venv/bin/activate && pytest -v

# core（需 Go）
cd services/core && go test ./...

# indexer
cd services/indexer && cargo test
```
