# 灵镜 (LingPrism)

企业知识与代码智能平台 — pnpm monorepo + 多语言微服务。

## 能力概览

| 模块 | 能力 |
|------|------|
| **用户平台** | JWT 登录 · SSE 流式问答 · 模板推荐 · 历史会话 · 架构图浏览 |
| **管理后台** | 代码源 CRUD/元数据 · 知识库 · 架构草稿 · **问答模板** · **预警配置**（单页侧栏切换） |
| **监控平台** | 健康度 · 架构漂移处理 · 索引任务看板 |
| **索引流水线** | Git clone → Rust tree-sitter → Qdrant 向量 + Neo4j 图谱 |
| **MCP 对外** | `search_code` / `search_knowledge` / `get_architecture` / `ask_question` |
| **LLM** | 智谱/DeepSeek/千问/OpenAI 多厂商 factory（env 驱动） |

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
- **Go** >= 1.22（core，索引/RAG 需启动）
- **Rust**（indexer CLI；Docker 全栈已含 indexer 镜像）
- **git**（core 索引流水线 clone 仓库）
- **Docker** & Docker Compose

## 开发模式选择

改代码快速迭代 → **本地全栈**；跑 Demo / 给他人看 → **Docker 全栈**。两套配置**不可混用**。

| | 本地全栈（推荐改代码） | Docker 全栈（推荐演示） |
|---|---|---|
| 用户端 | http://localhost:3000 | http://localhost:8080 或 http://user.localhost:8080 |
| 管理端 | http://localhost:3001 | http://admin.localhost:8080 |
| 监控端 | http://localhost:3002 | http://monitor.localhost:8080 |
| GraphQL | http://localhost:4000/graphql | http://localhost:8080/graphql（同源，无 CORS） |
| 配置文件 | 根目录 [`.env`](.env.example) | [`infra/docker/.env`](infra/docker/.env.example) |
| 改代码后 | 多数服务自动热重载 | 需 `--build` 重建对应容器 |
| 终端数 | 3 个后端 + 按需开前端 | 1 条命令 |

> **`.env` 警告：** 根 `.env` 面向本地 dev（4000 / 3000–3002）；`infra/docker/.env` 面向 Docker（8080）。**不要把根 `.env` 的 GraphQL / CORS 配置复制进 `infra/docker/.env`**，否则浏览器从 8080 访问时会跨域失败。

---

## 快速开始（本地开发，推荐改代码）

### 首次准备（一次性）

```bash
pnpm install
cp .env.example .env                              # 本地 dev 专用
cd infra/docker && cp .env.example .env && cd ../..  # 数据层端口/凭证
cd infra/docker && docker compose up -d           # 仅数据层，不加 --profile app
cd infra/migrations && npm install && npm run migrate && npm run seed
```

> **端口说明：** 数据层端口以 `infra/docker/.env.example` 为准（示例：`MYSQL_HOST_PORT=13306`）。`services/api` 启动时会读取根 `.env` 与 `infra/docker/.env` 推导连接地址。

| 服务 | 默认宿主机端口 |
|------|----------------|
| MySQL | 13306 |
| Redis | 6380 |
| Neo4j | 7474 / 7687 |
| Qdrant | 6335 |
| OpenSearch | 9201 |

开发账户（密码均为 **`lingprism123`**）：

| 邮箱 | 角色 |
|------|------|
| `employee@lingprism.local` | employee（用户端问答） |
| `admin@lingprism.local` | admin（管理端） |

### 日常启动

**后端（三端共用，固定 3 终端）：**

| 终端 | 命令 | 端口 |
|------|------|------|
| T1 | `cd infra/docker && docker compose up -d` | 13306 等（数据层，长期运行） |
| T2 | `cd services/api && pnpm dev` | 4000（`tsx watch` 自动重载） |
| T3 | `cd services/ai-worker && source .venv/bin/activate && lingprism-ai-http` | 8001 |
| **T4（推荐）** | `cd services/core && go run ./cmd/server` | 8080 或 18080† |

† 代码源连接测试、索引、RAG、架构草稿等依赖 Core。未启动时 GraphQL 返回 `CORE_UNAVAILABLE`。API 会自动尝试 `8080` 与 `18080`。

AI Worker 首次需安装：`python3 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"`

按需额外：

```bash
cd services/core && go run ./cmd/server          # 见上表 T4（本地 dev 建议常驻）
cd services/indexer && cargo build --release     # 可选：本地编译 indexer；或确保 PATH 有 lingprism-indexer
cd services/ai-worker && celery -A celery_app worker --loglevel=info
cd services/mcp && pip install -e ".[dev]" && lingprism-mcp
```

**前端（改哪个 app 就启哪个，可开多个终端）：**

| 端 | 命令 | 地址 | 典型页面 |
|----|------|------|----------|
| 用户端 | `pnpm dev:user` | http://localhost:3000 | `/login` `/` 或 `/chat` 问答 · `/sessions` · `/architecture` |
| 管理端 | `pnpm dev:admin` | http://localhost:3001 | 首页侧栏切换：`?module=repos` 代码源 · `knowledge` 知识库 · `architecture` 架构 · `templates` 问答模板 · `alerts` 预警 |
| 监控端 | `pnpm dev:monitor` | http://localhost:3002 | `/` 概览 · `/health` 健康/合规 · `/index-status` 索引 |

验证：

```bash
curl http://localhost:4000/health
# 浏览器：http://localhost:3000/login  /  :3001/login  /  :3002/login
```

### 改代码后要不要重启

| 改了什么 | 要不要重启 | 怎么做 |
|----------|-----------|--------|
| `apps/user` 前端 | 否 | Next.js HMR；`pnpm dev:user` |
| `apps/admin` 前端 | 否 | Next.js HMR；`pnpm dev:admin` |
| `apps/monitor` 前端 | 否 | Next.js HMR；`pnpm dev:monitor` |
| `services/api` TS | 否 | `tsx watch` 自动重启（T2 终端） |
| 根 `.env` | 是 | T2 `Ctrl+C` → 重新 `pnpm dev` |
| 数据库 Schema | 是 | `cd infra/migrations && npm run migrate`，再重启 api |
| `services/ai-worker` Python | 是 | T3 `Ctrl+C` → 重新 `lingprism-ai-http` |
| `services/core` Go | 是 | 重启 `go run` 进程 |
| Docker 数据层配置 | 是 | `cd infra/docker && docker compose up -d`，再重启 api |

### 与 Docker 全栈并存时

- 建议**二选一**，避免混淆端口与 `.env`
- 若 Docker 全栈已在跑（占 8080），本地 dev 仍可用：前端走 **3000/3001/3002**，api 走 **4000**
- 本地 core 在 Docker Nginx 占用 8080 时会自动回退到 **18080**

### 端到端验证

1. 用户端：http://localhost:3000/login → `employee@lingprism.local` / `lingprism123` → 发送问题观察 SSE（含模板推荐卡片；模板来自管理端「问答模板」配置）
2. 管理端：http://localhost:3001/login → `admin@lingprism.local` / `lingprism123` → 侧栏选择模块；代码源「重测连接」需 **Core 已启动**
3. 监控端：http://localhost:3002/login → `/health` 查看健康度与漂移处理
4. LLM 需在根 `.env` 配置 `ZHIPU_API_KEY`；未配置时返回 placeholder 文本
5. 完整索引需 **core + git + indexer**；本地可 `export INDEXER_BINARY=$(pwd)/services/indexer/target/release/lingprism-indexer`
6. 新增迁移后执行：`cd infra/migrations && npm run migrate`（含 `qa_templates`、`alert_rules` 等表）

---

## Docker 全栈（演示 / 验收）

无需本地安装 Node / Go / Python，统一从 **http://localhost:8080** 访问。

### 首次准备（一次性）

```bash
pnpm install   # 可选，纯 Docker 跑 Demo 可跳过
cp .env.example .env
cd infra/docker && cp .env.example .env && cd ../..
# 编辑 infra/docker/.env：填入 ZHIPU_API_KEY（可选）
```

### 启动

```bash
cd infra/docker
docker compose --profile app up -d --build
```

首次启动自动执行 **MySQL 迁移 + 种子数据**。等待约 1–2 分钟：

```bash
docker compose --profile app ps
curl http://localhost:8080/api/health
```

### 访问页面

| 地址 | 用途 |
|------|------|
| http://localhost:8080/login | 用户平台（主入口） |
| http://admin.localhost:8080/login | 管理后台 |
| http://monitor.localhost:8080/login | 监控平台 |
| http://localhost:8080/graphql | GraphQL API |

开发账户（密码 **`lingprism123`**）：`employee@lingprism.local`（用户）· `admin@lingprism.local`（管理）

> **LLM：** 未配置 `ZHIPU_API_KEY` 时问答返回 `LLM_NOT_CONFIGURED`。填入密钥后：`docker compose --profile app up -d ai-worker`

### 停止

```bash
cd infra/docker
docker compose --profile app down        # 保留数据
# docker compose --profile app down -v  # 清空数据库
```

若曾本地手动启动过 `pnpm dev`、`services/api` 等，也需 `Ctrl+C` 结束，避免占端口。

### 重启与重建

| 场景 | 命令 |
|------|------|
| 仅重启容器（未改代码/镜像） | `docker compose --profile app up -d` |
| 改了 `services/api` | `docker compose --profile app up -d --build api` |
| 改了 `apps/user` | `docker compose --profile app up -d --build user` |
| 改了 `apps/admin` | `docker compose --profile app up -d --build admin` |
| 改了 `apps/monitor` | `docker compose --profile app up -d --build monitor` |
| 改了多个前端 / 不确定 | `docker compose --profile app up -d --build user admin monitor` |
| 改了 `infra/docker/.env` 运行时变量（JWT、CORS、LLM key） | `docker compose --profile app up -d api ai-worker` |
| 改了 Nginx 配置 | `docker compose --profile app up -d nginx` |
| 改了数据库迁移 | `docker compose --profile app up migrate` |
| 全量重建 | `docker compose --profile app up -d --build` |

验证：

```bash
curl http://localhost:8080/api/health
curl -X POST http://localhost:8080/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}'
```

### `infra/docker/.env` 关键项（Docker 专用）

```
NEXT_PUBLIC_GRAPHQL_URL=http://localhost:8080/graphql
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
CORS_ORIGINS=http://localhost:8080,http://127.0.0.1:8080,http://user.localhost:8080,http://admin.localhost:8080,http://monitor.localhost:8080
```

**不要**设为 `localhost:4000` 或 `3000/3001/3002`——浏览器从 8080 访问时会跨域失败。前端 `NEXT_PUBLIC_*` 在**构建时**注入，修改后必须 `--build` 对应前端容器。

---

## Docker 进阶

### 仅启动数据层（本地 dev 共用）

```bash
cd infra/docker
docker compose up -d    # 不加 --profile app
```

### MCP 探活

```bash
curl -s http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-03-26" \
  -H "Authorization: Bearer dev-key-1" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

可用工具：`echo` · `search_code` · `search_knowledge` · `get_architecture` · `ask_question`

### Dockerfile 清单

| 文件 | 服务 |
|------|------|
| `infra/docker/Dockerfile.api` | GraphQL + SSE 网关 |
| `infra/docker/Dockerfile.core` | Go 核心业务 |
| `infra/docker/Dockerfile.indexer` | Rust 索引器（CLI，compose `--profile app` 已纳入） |
| `infra/docker/Dockerfile.mcp` | MCP 2025 服务 |
| `infra/docker/Dockerfile.ai-worker` | AI Worker HTTP + Celery |
| `infra/docker/Dockerfile.frontend` | Next.js 三前端（build-arg `APP`） |
| `infra/docker/Dockerfile.migrate` | 一次性 DB 迁移 |

Nginx 配置位于 `infra/nginx/`。

### 基础设施测试

```bash
cd infra/docker/tests && npm install && npm test
```

### Go 模块代理（core 镜像构建）

国内网络在 `infra/docker/.env` 设置 `GOPROXY=https://goproxy.cn,direct`，然后：

```bash
cd infra/docker && docker compose --profile app build core
```

---

## 端口一览

> 先确认当前模式，见上文 **「开发模式选择」**。

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
  user/       # 用户前端 · 问答 /chat · 会话 /sessions · 架构 /architecture
  admin/      # 管理后台 · 单页侧栏 ?module= repos/knowledge/architecture/templates/alerts
  monitor/    # 监控平台 · 概览 / · 健康 /health · 索引 /index-status
packages/
  ui/         # 共享组件（AppShell、LoginForm）
  shared/     # 工具、RBAC 类型、auth token
  graphql/    # Apollo Client、useChatSSE、login API
  graph-viz/  # D3 force-directed 架构图谱
services/
  api/        # GraphQL 网关 + JWT 认证 + SSE
  core/       # Go 核心业务（索引、RAG 检索、架构草稿、gRPC Ping）
  indexer/    # Rust tree-sitter CLI
  ai-worker/  # Celery + LangChain + LLM factory + Langfuse 埋点
  mcp/        # MCP 2025 对外服务（四业务 tool + 审计）
infra/
  docker/     # docker-compose + 各服务 Dockerfile
  nginx/      # Nginx 反向代理（三前端 + API + MCP）
  migrations/ # MySQL Knex 迁移与 seed
docs/         # PRD、架构计划、API 契约
```

## 关键 API

| 类型 | 路径 | 说明 |
|------|------|------|
| GraphQL | `POST /graphql` | `login` / `me` / 业务查询；管理端 `qaTemplates` / `alertRules` CRUD |
| SSE | `POST /api/chat/stream` | 流式问答（需 JWT）；事件含 `template_hint` |
| SSE | `POST /api/chat/stop` | 中断生成 |
| MCP | `POST /mcp` | JSON-RPC 2.0；需 `X-API-Key` + `MCP-Protocol-Version: 2025-03-26` |

SSE 事件协议见 [docs/api-contracts/sse-chat-events.md](./docs/api-contracts/sse-chat-events.md)。  
系统架构见 [docs/plans/lingprism_系统架构_ca57583b.plan.md](./docs/plans/lingprism_系统架构_ca57583b.plan.md) §12 实现状态。

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

按当前模式排查：

**本地 dev（前端 3000/3001/3002 → api 4000）：**

1. 确认 api 已启动：`curl http://localhost:4000/health`
2. 确认根 `.env` 中 `CORS_ORIGINS` 包含 `http://localhost:3000,3001,3002`（及 `127.0.0.1` 别名）
3. 改 `.env` 后重启 `services/api`

**Docker 全栈（浏览器 8080）：**

1. 确认 `infra/docker/.env` 中 `NEXT_PUBLIC_GRAPHQL_URL=http://localhost:8080/graphql`（**不是** 4000）
2. 确认 `CORS_ORIGINS` 包含 `http://localhost:8080`（及子域）
3. 改 `.env` 后：`docker compose --profile app up -d api`；改 `NEXT_PUBLIC_*` 后需 `--build user admin monitor`
4. 浏览器应访问 **8080**，GraphQL 走 **8080/graphql**（同源，无跨域）

`Status code: (null)` 通常表示 api 未启动或地址/port 错误，而非缺少 CORS 头。

### `testRepoConnection` 报 `fetch failed` 或 `CORE_UNAVAILABLE`

1. 启动 Core：`cd services/core && go run ./cmd/server`（日志出现 `core http server started`）
2. 确认健康：`curl http://localhost:8080/health` 或 `curl http://localhost:18080/health`
3. API 默认依次尝试 `8080`、`18080`；也可在根 `.env` 或 `services/api/.env` 设置 `CORE_HTTP_URL=http://localhost:18080`
4. 无 Core 的纯前端联调可设 `CORE_HTTP_STUB=true`（返回 mock 数据）

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
| Batch 2 | LLM 多厂商适配 · Qdrant collection 命名 · core 向量检索 | ✅ |
| Batch 3 | 本地认证 · SSE 流式问答 · template_hint | ✅ |
| Batch 4 | Dockerfile · Nginx 全栈部署 · indexer compose | ✅ |
| Batch 5 | Phase 1 P0 业务闭环 + 遗漏项补全 | ✅ |

**Phase 2+ 待办（摘要）：** OpenSearch 全文索引 · admin LLM 热配置 · GraphQL `@auth` directive · `/search` 代码检索 · SSO

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
