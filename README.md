# 灵镜 (LingPrism)

企业知识与代码智能平台 — Monorepo 脚手架。

## 技术栈

- **前端**：Next.js 14 + React 18 + Ant Design（三独立 app）
- **API**：Node GraphQL + SSE（Batch 1）
- **核心**：Go + Rust indexer + Python AI/MCP

详见 [AGENTS.md](./AGENTS.md) 与 [docs/PRD_业务需求文档_v1.0.md](./docs/PRD_业务需求文档_v1.0.md)。

## 快速开始（Batch 0）

### 1. 环境要求

- Node.js >= 20
- pnpm >= 9
- Docker & Docker Compose

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置环境变量

```bash
cp .env.example .env
# 按需填入 ZHIPU_API_KEY 等（Batch 2 起需要）
```

### 4. 启动数据层

```bash
cd infra/docker
cp .env.example .env   # 宿主机端口冲突时修改 MYSQL_HOST_PORT 等
docker compose up -d
docker compose ps      # 确认五服务 healthy
```

**默认端口映射**（可在 `infra/docker/.env` 覆盖）：

| 服务 | 默认宿主机端口 |
|------|----------------|
| MySQL | 3306（冲突示例：13306） |
| Redis | 6379（冲突示例：6380） |
| Neo4j | 7474 / 7687 |
| Qdrant | 6333（冲突示例：6335） |
| OpenSearch | 9200（冲突示例：9201） |

使用非默认端口时，请同步修改根目录 `.env` 中的 `DATABASE_URL`、`QDRANT_URL` 等连接串。

### 5. 启动前端（开发）

```bash
# 用户平台 http://localhost:3000
pnpm dev:user

# 管理后台 http://localhost:3001
pnpm dev:admin

# 监控平台 http://localhost:3002
pnpm dev:monitor
```

## 目录结构

```
apps/
  user/      # 用户前端平台 :3000
  admin/     # 管理后台     :3001
  monitor/   # 监控平台     :3002
packages/
  ui/        # 共享 Ant Design 组件
  shared/    # 工具与类型
  graphql/   # GraphQL client（Batch 1）
  graph-viz/ # 图谱可视化（Phase 1）
services/    # 后端服务（Batch 1 起）
infra/docker # docker-compose 数据层
```

## 端口一览

| 服务 | 端口 |
|------|------|
| user | 3000 |
| admin | 3001 |
| monitor | 3002 |
| api (GraphQL/SSE) | 4000 |
| core (Go) | 8080 / 50051 gRPC |
| mcp | 8090 |
| MySQL | 3306 |
| Redis | 6379 |
| Neo4j | 7474 / 7687 |
| Qdrant | 6333 |
| OpenSearch | 9200 |

## 开发批次

当前完成：**Batch 0**（env + monorepo + docker 数据层）

下一步：**Batch 1** — 五服务骨架并行搭建
