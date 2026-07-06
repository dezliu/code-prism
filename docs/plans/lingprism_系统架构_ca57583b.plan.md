---
name: LingPrism 系统架构
overview: 为灵镜 (LingPrism) 设计 pnpm monorepo + 多语言微服务架构：三个独立 Next.js 前端共享组件库，Node GraphQL 网关 + Go 核心业务 + Rust 索引 + Python AI/MCP，通过明确契约分层与 env 配置驱动初始化。
todos:
  - id: scaffold-monorepo
    content: 初始化 pnpm workspace：apps/admin|user|monitor + packages/ui|shared|graphql|graph-viz
    status: pending
  - id: scaffold-api
    content: 搭建 services/api：Apollo Server + Objection.js 分层骨架 + GraphQL Schema 域划分
    status: pending
  - id: scaffold-core
    content: 搭建 services/core Go 项目：domain/application/infrastructure/interfaces + gRPC proto
    status: pending
  - id: scaffold-indexer
    content: 搭建 services/indexer Rust 项目：tree-sitter 解析管道骨架
    status: pending
  - id: scaffold-mcp
    content: 搭建 services/mcp：MCP 2025 Streamable HTTP + tools/list + tools/call + 鉴权
    status: pending
  - id: scaffold-ai-worker
    content: 搭建 services/ai-worker：Celery + LangChain + Langfuse 骨架 + LLM 多厂商适配层
    status: pending
  - id: llm-provider-abstraction
    content: 实现 LLM/Embedding 多厂商适配（DeepSeek/千问/智谱/OpenAI），默认智谱，env 驱动 + 管理后台可配置
    status: pending
  - id: local-auth-minimal
    content: 实现本地账户最小认证：users 表 + bcrypt + JWT + login/logout GraphQL + 三前端登录页
    status: pending
  - id: sse-chat-stream
    content: 实现 SSE 流式问答：POST /api/chat/stream + /api/chat/stop + useChatSSE hook + 事件协议
    status: pending
  - id: qdrant-collection-naming
    content: 实现 Qdrant collection 命名 lingprism_v1_zhipu_{dim}，ai-worker 写入 + core 检索共用
    status: pending
  - id: infra-docker
    content: 编写 infra/docker/docker-compose.yml + Nginx 路由 + 各服务 Dockerfile
    status: pending
  - id: env-templates
    content: 生成根目录与各服务 .env.example 模板
    status: pending
  - id: phase1-p0
    content: Phase 1：实现 PRD P0 功能（代码源/问答/看板）
    status: pending
isProject: false
---

# 灵镜 (LingPrism) 整体系统架构设计

## 1. 架构总览

基于 [PRD](docs/PRD_业务需求文档_v1.0.md) 三大业务模块与 [AGENTS.md](AGENTS.md) 技术栈约束，采用 **「前端 Monorepo + 后端多语言服务 + 统一数据平面」** 架构。

```mermaid
flowchart TB
    subgraph clients [客户端]
        AdminApp[apps/admin 管理后台]
        UserApp[apps/user 用户平台]
        MonitorApp[apps/monitor 监控平台]
        ExtAgent[外部 AI Agent Cursor/Claude]
    end

    subgraph gateway [接入层]
        Nginx[Nginx 反向代理]
        GraphQL[api GraphQL 网关 Node]
    end

    subgraph core [核心服务]
        GoCore[core Go 业务编排]
        RustIdx[indexer Rust 代码解析]
        PyAI[ai-worker Python LangChain/Celery]
        PyMCP[mcp Python MCP 2025]
    end

    subgraph data [数据平面]
        MySQL[(MySQL 业务)]
        Neo4j[(Neo4j 代码图谱)]
        Qdrant[(Qdrant 向量)]
        OpenSearch[(OpenSearch 全文)]
        Redis[(Redis 缓存/队列)]
    end

    AdminApp --> Nginx
    UserApp --> Nginx
    MonitorApp --> Nginx
    ExtAgent --> PyMCP

    Nginx --> GraphQL
    Nginx --> PyMCP

    GraphQL --> GoCore
    GraphQL --> MySQL
    GraphQL --> Redis

    GoCore --> RustIdx
    GoCore --> Neo4j
    GoCore --> Qdrant
    GoCore --> OpenSearch
    GoCore --> Redis

    PyAI --> GoCore
    PyAI --> Qdrant
    PyAI --> Redis

    PyMCP --> GoCore
    PyMCP --> GraphQL
```

**核心设计原则（对齐 AGENTS.md）：**

- 各语言模块通过 **GraphQL Schema / REST / gRPC / 消息队列** 显式契约通信，禁止隐式耦合
- **业务规则在应用/领域层**，API/Resolver/MCP Handler 只做协议适配
- MCP 不重复实现 Go 已有逻辑，只做协议翻译 + 鉴权 + 审计

---

## 2. 服务职责划分（解决 Go vs Node 边界）

AGENTS.md 同时指定 **Go 核心后端** 与 **Apollo GraphQL + Objection.js**。推荐 **BFF + 领域服务** 模式：

| 服务 | 语言 | 职责 | 持久化 |
|------|------|------|--------|
| `services/api` | Node/TS | GraphQL 网关、鉴权上下文、DTO 映射、MySQL 事务性 CRUD（用户/会话/配置/审计） | MySQL (Objection.js) |
| `services/core` | Go | 代码源同步、索引编排、健康度/漂移计算、架构图生成 | Neo4j/Qdrant/OpenSearch + **写** MySQL 索引/图谱元数据表 |
| `services/indexer` | Rust | tree-sitter 解析、符号/依赖提取、图谱边构建 | 无状态，输出给 Go |
| `services/ai-worker` | Python | LangChain RAG 流水线、培训文档生成、Embedding、Celery 异步任务 | 经 Go/API 访问存储 |
| `services/mcp` | Python | MCP 2025 协议端点、tools 注册、调用 core/api | 无本地 DB |

**分工依据：**

- PRD 中 **管理后台 CRUD**（代码源配置、元数据、模板、预警规则）→ Node GraphQL + MySQL，开发效率高、与前端 Codegen 一体
- PRD 中 **重计算/流水线**（索引、健康度、架构漂移、语义检索编排）→ Go + Rust，性能与并发
- PRD 中 **流式问答/RAG**（4.2.1~4.2.4）→ Python ai-worker（LangChain + Langfuse），经 **SSE** 推流到前端（已确认，见 §5.2）

**跨服务调用约定：**

- 前端 **仅** 访问 `services/api`：GraphQL 负责 CRUD/查询；**SSE** 负责流式问答（`POST /api/chat/stream`）
- `api` → `core`：内部 gRPC（强类型契约）或 REST（简单场景）
- `core` → `indexer`：gRPC（同步小仓库）/ 消息队列（大批量索引）
- `ai-worker` ← Redis/Celery 任务 ← `core`/`api` 触发
- `mcp` → `core`/`api`：HTTP 内部 API，携带 Service Token + 调用方标识（供 MCP 监控看板 4.3.4）

### 2.1 MySQL 写权限边界（已确认）

**原则：按表归属单一写入方，禁止双写。**

| 写入方 | 表/域 | 说明 |
|--------|-------|------|
| **Node (`services/api`)** | `users`, `sessions`, `chat_messages`, `repos`（配置）, `repo_metadata`, `knowledge_docs`, `templates`, `alert_rules`, `audit_logs`, `llm_configs` | 管理 CRUD、用户会话、业务配置 |
| **Go (`services/core`)** | `index_jobs`, `index_job_events`, `repo_index_state`, `health_scores`, `arch_drift_records`, `graph_snapshots` | 索引流水线、健康度/漂移计算产出 |
| **只读共享** | Node 读 `index_jobs`/`health_scores` 供监控看板；Go 读 `repos`/`repo_metadata` 供索引 | 跨服务经 API/gRPC 查询，不跨语言直写 |

**冲突规避：** Go 不修改 `repos` 业务字段；索引状态字段（如 `index_status`）由 Go 写、`api` 只读展示；若需联动，Go 通过 gRPC 回调通知 `api` 刷新缓存。

---

## 3. Monorepo 目录结构（pnpm workspace）

```
code-prism/
├── apps/
│   ├── admin/                 # 管理后台 Next.js 14（4.1.x）
│   ├── user/                  # 用户平台 Next.js 14（4.2.x）
│   └── monitor/               # 监控平台 Next.js 14（4.3.x）
├── packages/
│   ├── ui/                    # 共享 Ant Design 组件（Layout、Table、Form、StatusBadge…）
│   ├── shared/                # 工具函数、常量、RBAC 类型、日期/格式化
│   ├── graphql/               # GraphQL Schema 片段 + Apollo Client + Codegen 输出
│   ├── graph-viz/             # D3.js + Sigma.js 图谱组件（架构图/调用链）
│   └── config-eslint/         # 共享 ESLint/TSConfig（可选）
├── services/
│   ├── api/                   # Apollo Server + Objection.js
│   ├── core/                  # Go 核心业务
│   ├── indexer/               # Rust tree-sitter
│   ├── ai-worker/             # Python Celery + LangChain
│   └── mcp/                   # Python MCP 2025 服务
├── infra/
│   ├── docker/                # docker-compose + 各服务 Dockerfile
│   ├── nginx/                 # 三前端 + API + MCP 路由
│   └── migrations/            # MySQL Knex 迁移（api 侧）
├── docs/                      # PRD、mockup（已有）
├── pnpm-workspace.yaml
├── package.json               # 根 scripts: dev/build/lint
├── .env.example               # 根级公共变量模板
└── AGENTS.md
```

**pnpm workspace 关键配置：**

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
  - "services/api"   # Node 服务纳入 workspace 便于共享 packages/graphql
```

**三前端独立构建、共享包引用：**

- 各 app 独立 `next.config.js`、`PORT`、品牌主题（参考 [docs/mockup/](docs/mockup/) 三套视觉）
- 共享依赖通过 `workspace:*` 引用：`@lingprism/ui`、`@lingprism/graphql`
- Turborepo（可选）编排 `build --filter=@lingprism/admin` 等独立 CI 流水线

**前端路由规划：**

| App | 端口（dev） | 核心路由 |
|-----|------------|----------|
| admin | 3001 | `/repos`, `/knowledge`, `/architecture`, `/templates`, `/alerts`, `/settings/llm` |
| user | 3000 | `/chat`, `/architecture`, `/search`, `/sessions` |
| monitor | 3002 | `/health`, `/compliance`, `/knowledge-quality`, `/mcp`, `/index-status` |

---

## 4. 各服务代码分层

### 4.1 前端（apps/* + packages/*）

```
apps/user/src/
├── app/                    # Next.js App Router 页面
├── features/               # 按 PRD 功能域划分
│   ├── chat/               # 4.2.1~4.2.4 问答/流式/上下文
│   ├── architecture/       # 4.2.5 架构图浏览
│   ├── search/             # 4.2.7 代码检索
│   └── sessions/           # 4.2.6 历史会话
├── hooks/                  # 共享业务 hooks
└── lib/                    # Apollo Provider、auth 上下文
```

**分层规则（对齐 [frontend.mdc](.cursor/rules/frontend.mdc)）：**

- **Page/Container**：数据获取（Apollo `useQuery`/`useMutation`）+ 三态处理
- **View 组件**（packages/ui）：纯展示 + Ant Design
- **graph-viz**：D3/Sigma 与 React 状态隔离，独立 cleanup
- 流式问答：**SSE**（`useChatSSE` hook + `EventSource`/`fetch` stream），发送/停止按钮状态机（PRD 4.2.3）；非 GraphQL Subscription

### 4.2 GraphQL API（services/api）

```
services/api/src/
├── graphql/
│   ├── schema/             # 按域拆分 typeDefs
│   ├── resolvers/          # 薄 Resolver，仅校验+鉴权+调用 UseCase
│   └── directives/         # @auth @audit
├── application/            # UseCase 编排
│   ├── repo/               # 代码源管理
│   ├── knowledge/          # 知识库
│   ├── chat/               # 会话 CRUD（流式走 HTTP SSE 路由）
│   └── monitor/            # 看板查询（委托 core）
├── domain/                 # 实体、值对象、DomainError
├── infrastructure/
│   ├── db/models/          # Objection.js Model
│   ├── db/repositories/
│   ├── clients/            # core gRPC、Redis、Langfuse
│   ├── auth/               # JWT 本地账户认证（Phase 0 最小实现）
│   └── http/               # ★ SSE 路由：POST /api/chat/stream、POST /api/chat/stop
└── index.ts                # Apollo Server + Express/Fastify HTTP 入口
```

**Resolver 禁止事项（[backend-api.mdc](.cursor/rules/backend-api.mdc)）：** 不写 SQL、不直接调 Qdrant/Neo4j、不编排多步业务。

### 4.3 Go 核心（services/core）

```
services/core/
├── cmd/server/main.go
├── internal/
│   ├── domain/             # Repository, Project, IndexJob, HealthScore…
│   ├── application/        # IndexRepo, DetectDrift, CalcHealth…
│   ├── infrastructure/
│   │   ├── mysql/          # 只读或共享写（索引状态）
│   │   ├── neo4j/
│   │   ├── qdrant/
│   │   ├── opensearch/
│   │   ├── redis/
│   │   └── git/            # 代码拉取
│   └── interfaces/
│       ├── grpc/           # 供 api 调用
│       └── http/           # 健康检查、内部 webhook
├── api/proto/              # gRPC 契约
└── go.mod
```

**与 PRD 映射：**

- 4.1.1~4.1.2 代码源/纳管 → `IndexRepoUseCase` + Celery 入队
- 4.1.4 架构图自动生成 → `GenerateArchDraft`（读 Neo4j → 输出图 JSON）
- 4.3.1~4.3.2 健康度/漂移 → `CalcHealthScore` / `DetectArchDrift`
- 4.3.5 索引状态 → `IndexJob` 聚合查询

### 4.4 Rust 索引器（services/indexer）

```
services/indexer/src/
├── parser/                 # tree-sitter 多语言解析
├── graph/                  # 符号、依赖、调用边
├── output/                 # 结构化输出（JSON/Protobuf）
└── main.rs                 # CLI + gRPC server
```

无业务逻辑，纯计算管道；参考 codeGraph 模式。

### 4.5 Python AI Worker（services/ai-worker）

```
services/ai-worker/
├── workers/                # Celery tasks
│   ├── index_embed.py      # 文档/代码 embedding → Qdrant
│   ├── gen_training_doc.py # 4.1.3 培训文档生成
│   └── health_batch.py
├── chains/                 # LangChain 流水线
│   ├── qa_router.py        # 意图识别 + 多源 RAG
│   ├── template_match.py   # 4.2.2 模板并行匹配
│   └── context_anchor.py   # 4.2.4 上下文锚点
├── infrastructure/
│   ├── llm/                # ★ LLM 多厂商适配层（见 §4.7）
│   │   ├── config.py       # resolve_llm_config() 读取 env/DB 配置
│   │   ├── factory.py      # create_chat_model() / create_embedding_model()
│   │   ├── providers/      # 各厂商 LangChain ChatModel/Embeddings 封装
│   │   └── streaming.py    # 统一流式输出 + cancel 支持（PRD 4.2.3）
│   ├── clients/            # Go/API/Qdrant/Langfuse clients
│   └── qdrant_collections.py  # collection 命名：lingprism_v1_{provider}_{dim}
│   └── langfuse_tracer.py  # 按 provider/model 打 Langfuse 埋点
└── celery_app.py
```

**Chains 不直接实例化 LLM**，统一通过 `factory.create_chat_model(scene="qa")` 获取，便于按场景切换模型、测试 Mock。

### 4.6 Python MCP 服务（services/mcp）

遵循 **MCP 2025-03-26 / Streamable HTTP** 规范：

```
services/mcp/
├── server/
│   ├── app.py              # FastAPI/Starlette HTTP 入口
│   ├── transport.py        # Streamable HTTP `/mcp` 端点
│   ├── handlers/
│   │   ├── initialize.py   # 声明 tools capability
│   │   ├── tools_list.py   # tools/list + 分页 cursor
│   │   └── tools_call.py   # tools/call 路由到 backend client
│   └── middleware/         # API Key 鉴权、traceId、审计日志
├── tools/                  # 工具定义（name, description, inputSchema）
│   ├── search_code.py      # 符号/语义检索
│   ├── search_knowledge.py # 知识库检索
│   ├── get_architecture.py # 架构图查询
│   └── ask_question.py     # 智能问答（委托 ai-worker）
├── clients/
│   └── lingprism_api.py    # 调用 core/api 内部 REST/gRPC
└── pyproject.toml
```

**MCP 协议要点：**

- 单一 HTTP 端点 `POST /mcp`，JSON-RPC 2.0
- `initialize` 响应声明 `capabilities.tools.listChanged: true`
- `tools/list` 支持 `cursor` 分页，返回 `tools[]` + `nextCursor`
- `tools/call` 接收 `{ name, arguments }`，返回 MCP `content[]`（text/image）
- 传输层 Header：`MCP-Protocol-Version: 2025-03-26`，支持 SSE 流式（长问答场景）
- 每次调用写入审计表，供监控看板 4.3.4 统计

**初始暴露 Tools（P0）：**

| Tool | 用途 | 后端 |
|------|------|------|
| `search_code` | 符号/语义代码检索 | core |
| `search_knowledge` | 知识库文档检索 | core + Qdrant |
| `get_architecture` | 获取官方架构图 | core |
| `ask_question` | 自然语言问答 | ai-worker |

### 4.7 LLM 多厂商适配（国产大模型支持）

**需求：** 智能问答、培训文档生成、模板匹配、Embedding 等 AI 能力须支持国产大模型，至少覆盖 **DeepSeek、通义千问、智谱 GLM**；同时保留 OpenAI 作为可选厂商，便于开发/对比。

**设计原则：**

- **OpenAI 兼容协议优先**：DeepSeek、千问（DashScope 兼容模式）、智谱均提供 OpenAI-compatible `/v1/chat/completions` 与 `/v1/embeddings`，统一走 LangChain `ChatOpenAI` / `OpenAIEmbeddings` + 自定义 `base_url`
- **配置驱动，零代码切换**：通过 `LLM_PROVIDER` / `EMBEDDING_PROVIDER` env 切换厂商；生产环境可由管理后台持久化到 MySQL（`llm_configs` 表），ai-worker 启动时或定时热加载
- **场景分流**：不同任务可选用不同模型（如意图识别用小模型、问答用大模型），通过 `LLM_SCENE_*` env 或 DB 配置覆盖
- **可观测性一致**：Langfuse 埋点须记录 `provider`、`model`、`latency`、`token_usage`，便于监控看板对比各厂商表现

```mermaid
flowchart LR
    subgraph chains [LangChain Chains]
        QA[qa_router]
        TM[template_match]
        TD[gen_training_doc]
        EM[index_embed]
    end

    subgraph factory [infrastructure/llm]
        F[factory.py]
        C[config.py]
    end

    subgraph providers [providers/]
        DS[deepseek]
        QW[qwen_dashscope]
        ZP[zhipu_glm]
        OAI[openai]
    end

    QA --> F
    TM --> F
    TD --> F
    EM --> F
    F --> C
    C --> DS
    C --> QW
    C --> ZP
    C --> OAI
```

**支持的厂商与默认端点：**

| Provider ID | 厂商 | Chat 默认模型 | Embedding 默认模型 | OpenAI 兼容 Base URL |
|-------------|------|---------------|-------------------|----------------------|
| `deepseek` | DeepSeek | `deepseek-chat` | `deepseek-embedding`（或同厂 embedding API） | `https://api.deepseek.com/v1` |
| `qwen` | 通义千问（阿里云百炼） | `qwen-max` | `text-embedding-v3` | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `zhipu` | 智谱 AI | `glm-4-plus` | `embedding-3` | `https://open.bigmodel.cn/api/paas/v4` |
| `openai` | OpenAI（可选） | `gpt-4o` | `text-embedding-3-small` | `https://api.openai.com/v1` |

**factory 接口（Python 伪代码）：**

```python
# infrastructure/llm/factory.py
def create_chat_model(scene: str = "qa") -> BaseChatModel:
    cfg = resolve_llm_config(scene)  # env > DB > default
    return ChatOpenAI(
        model=cfg.model,
        api_key=cfg.api_key,
        base_url=cfg.base_url,
        streaming=True,
        temperature=cfg.temperature,
    )

def create_embedding_model() -> Embeddings:
    cfg = resolve_embedding_config()
    return OpenAIEmbeddings(model=cfg.model, api_key=cfg.api_key, base_url=cfg.base_url)
```

**场景化模型配置（可选 env 覆盖）：**

| Scene | 用途 | 建议模型规模 |
|-------|------|-------------|
| `qa` | 智能问答主生成（4.2.1） | 大模型（默认 `glm-4-plus`） |
| `intent` | 意图识别、模板匹配（4.2.2） | 小模型（默认 `glm-4-flash`） |
| `doc_gen` | 培训文档一键生成（4.1.3） | 大模型（默认 `glm-4-plus`） |
| `embedding` | 代码/文档向量化 | 默认 `embedding-3`（智谱） |

**管理后台扩展（Phase 1+，对齐 PRD 4.1 管理类能力）：**

- 新增 **AI 模型配置** 页（`apps/admin` `/settings/llm`）：管理员选择默认 Chat/Embedding 厂商、填写 API Key（加密存 MySQL）、测试连通性
- GraphQL mutation `updateLlmConfig` → MySQL `llm_configs`；ai-worker 通过 internal API 拉取或 Redis pub/sub 通知热更新
- API Key **不入日志、不进 Git**；`.env.example` 仅留占位符

**流式与中断（PRD 4.2.3 兼容）：**

- 各国产模型均通过 LangChain `astream` / `astream_events` 统一抽象
- `streaming.py` 封装 cancel token（Redis key），DeepSeek/千问/智谱 streaming 均支持 client disconnect 终止
- 若某厂商 streaming 不稳定，factory 可降级为 chunk 模拟流式（配置 `LLM_STREAMING_FALLBACK=true`）

**MCP `ask_question` tool：** 复用同一 factory，不在 `services/mcp` 重复接 LLM；MCP 长回答同样走 **SSE**（Streamable HTTP 传输层）。

### 4.8 Qdrant Collection 命名（已确认）

**规则：** 按 **版本 + 厂商 + 向量维度** 隔离 collection，避免换 Embedding 模型时污染已有索引。

```
lingprism_v1_zhipu_{dim}
```

| 组成部分 | 含义 | 示例 |
|----------|------|------|
| `lingprism` | 产品前缀 | 固定 |
| `v1` | Schema/索引版本 | 字段结构变更时递增 `v2` |
| `zhipu` | Embedding 厂商 | 换厂商时变 `qwen`/`deepseek` |
| `{dim}` | 向量维度 | 智谱 `embedding-3` 实际维度（启动时探测或 env 配置） |

**实现约定：**

- `services/ai-worker/infrastructure/qdrant_collections.py` 提供 `resolve_collection_name(provider, dim) -> str`
- `services/core` 检索侧通过相同命名函数或 env `QDRANT_COLLECTION` 读取，**读写必须同一 collection**
- Phase 0 默认：`lingprism_v1_zhipu_1024`（维度以智谱 API 文档为准，env `ZHIPU_EMBEDDING_DIM` 可覆盖）
- 切换 Embedding 厂商/维度：**新建 collection**，旧 collection 保留至迁移完成，不原地覆盖

---

## 5. 核心数据流

### 5.1 代码索引流水线（PRD 4.1.1 → 4.3.5）

```mermaid
sequenceDiagram
    participant Admin as admin app
    participant API as api GraphQL
    participant Core as core Go
    participant Idx as indexer Rust
    participant Queue as Redis Celery
    participant Stores as Neo4j Qdrant OpenSearch

    Admin->>API: 勾选纳入检索库
    API->>Core: EnqueueIndex(repoId)
    Core->>Core: Git clone/pull
    Core->>Idx: Parse(repoPath)
    Idx-->>Core: symbols deps calls
    Core->>Stores: 写入图谱/向量/全文
    Core->>Queue: embed + health_calc tasks
    Core-->>API: IndexJob status
    API-->>Admin: 索引状态更新
```

### 5.2 智能问答流式 — SSE（PRD 4.2.1~4.2.3，已确认）

**选型：** 流式问答走 **HTTP SSE**，不走 GraphQL Subscription。理由：LLM token 流与 GraphQL 订阅栈耦合深、调试成本高；SSE 与 PRD 阶段状态推送、中断语义更直接。

**端点设计（`services/api`）：**

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/chat/stream` | 请求体 `{ sessionId?, message }`；响应 `Content-Type: text/event-stream` |
| `POST` | `/api/chat/stop` | 请求体 `{ streamId }`；终止 ai-worker 生成（PRD 中断 ≤2s） |

**SSE 事件类型：**

| event | data 示例 | 用途 |
|-------|-----------|------|
| `status` | `{ "phase": "understanding" }` | 阶段提示：理解问题 / 检索图谱 / 生成回答 |
| `token` | `{ "text": "支付" }` | 逐字/逐段正文 |
| `source` | `{ "type": "doc", "title": "..." }` | 可追溯来源（NFR-05） |
| `template_hint` | `{ "templateId", "name", "preview" }` | 4.2.2 模板推荐卡片 |
| `done` | `{ "messageId", "interrupted": false }` | 生成结束 |
| `error` | `{ "code", "message" }` | 错误 |

```mermaid
sequenceDiagram
    participant User as user app
    participant API as api HTTP_SSE
    participant AI as ai-worker
    participant Core as core Go

    User->>API: POST /api/chat/stream
    API->>API: JWT 校验 + 创建 streamId
    API->>AI: 并行 template_match + qa_router
    AI->>Core: 检索代码/文档/架构
    Core-->>AI: RAG context
    loop SSE events
        AI-->>API: token/status chunks
        API-->>User: event: token\ndata: ...
    end
    User->>API: POST /api/chat/stop
    API->>AI: cancel streamId via Redis
```

**前端（`packages/shared` 或 `apps/user/hooks`）：**

- `useChatSSE()`：管理 `streamId`、自动重连策略（不做）、手动上滚暂停自动滚动（PRD 4.2.3）
- GraphQL 仍负责：`createSession`、`listSessions`、历史消息持久化；**仅实时生成走 SSE**

**MCP 长回答：** `services/mcp` Streamable HTTP 传输层同样输出 SSE 事件，事件 schema 与上表对齐，便于监控统一解析。

---

## 6. 权限模型（RBAC）与本地认证

对齐 PRD 2.2 权限矩阵，在 `services/api` 统一实现。

### 6.1 本地账户认证（Phase 0 最小实现，已确认）

**范围：** 不做 SSO/OIDC，先实现可用的本地账号体系；SSO 作为后续 Phase 2+ 扩展点预留。

```mermaid
sequenceDiagram
    participant App as 三前端 apps
    participant API as services/api
    participant DB as MySQL users

    App->>API: mutation login email password
    API->>DB: 查 users + bcrypt 校验
    API-->>App: JWT accessToken + user role
    App->>API: 后续请求 Authorization Bearer
    API->>API: JWT 校验 + @auth directive
```

**最小能力清单：**

| 能力 | 实现 |
|------|------|
| 用户存储 | MySQL `users` 表：`id`, `email`, `password_hash`, `display_name`, `role`, `team_id`, `created_at` |
| 密码 | `bcrypt` 哈希（cost=12），禁止明文存储 |
| 会话 | 无状态 **JWT**（`JWT_SECRET` env），payload 含 `userId` + `role`；refresh token **Phase 1 可选** |
| GraphQL | `login(email, password)` → `{ token, user }`；`me` query；`logout`（客户端清 token，服务端可选黑名单 Phase 1） |
| 前端 | 三 app 共享 `@lingprism/ui/LoginForm`；token 存 `httpOnly cookie` 或 `localStorage`（Phase 0 用 localStorage + Apollo auth link） |
| 种子数据 | 迁移脚本插入 dev 账户：`admin@lingprism.local` / `employee@lingprism.local`，角色分别为 admin / employee |
| MCP | 不走用户 JWT，独立 **API Key** 鉴权（与用户体系分离） |

**Phase 0 明确不做：** 注册自助、邮箱验证、密码重置、OIDC/SAML、多因素认证。

### 6.2 RBAC

- **Role**：`employee` | `admin` | `leader` | `executive`（存 `users.role`）
- GraphQL `@auth(roles: [...])` directive + field-level 过滤（如监控看板团队范围 NFR-10）
- MCP 使用 **API Key + scoped permissions**（只暴露检索/问答，不含管理写操作）
- 会话隔离：MySQL `chat_sessions.user_id` 强制过滤（NFR-11）

---

## 7. 环境变量与配置管理

**策略：** 根目录 `.env.example` 列出全部变量；各服务目录可有自己的 `.env.example` 子集；运行时通过 Docker Compose / K8s Secret 注入。

**根级 `.env.example` 分组：**

```bash
# === 通用 ===
NODE_ENV=development
LOG_LEVEL=info
TRACE_ENABLED=true

# === 前端 ===
NEXT_PUBLIC_GRAPHQL_URL=http://localhost:4000/graphql
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000

# === API (Node) ===
API_PORT=4000
DATABASE_URL=mysql://lingprism:password@localhost:3306/lingprism
REDIS_URL=redis://localhost:6379/0
CORE_GRPC_ADDR=localhost:50051
JWT_SECRET=change-me
JWT_EXPIRES_IN=7d
# SSO/OIDC — Phase 2+ 预留，Phase 0 不使用
# OIDC_ISSUER=
# OIDC_CLIENT_ID=

# === Core (Go) ===
CORE_HTTP_PORT=8080
CORE_GRPC_PORT=50051
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=lingprism_v1_zhipu_1024
ZHIPU_EMBEDDING_DIM=1024
OPENSEARCH_URL=http://localhost:9200
INDEXER_GRPC_ADDR=localhost:50052

# === AI Worker (Python) — LLM 多厂商 ===
CELERY_BROKER_URL=redis://localhost:6379/1

# 默认 Chat 厂商：deepseek | qwen | zhipu | openai
LLM_PROVIDER=zhipu
# 默认 Embedding 厂商（Phase 0 与 Chat 同为智谱）
EMBEDDING_PROVIDER=zhipu

# DeepSeek（OpenAI 兼容）
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_EMBEDDING_MODEL=deepseek-embedding

# 通义千问 / 阿里云百炼（OpenAI 兼容模式）
QWEN_API_KEY=
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-max
QWEN_EMBEDDING_MODEL=text-embedding-v3

# 智谱 AI（OpenAI 兼容）
ZHIPU_API_KEY=
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4
ZHIPU_MODEL=glm-4-plus
ZHIPU_EMBEDDING_MODEL=embedding-3

# OpenAI（可选，开发/对比用）
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# 场景化模型覆盖（留空则使用智谱默认：qa/doc_gen=glm-4-plus, intent=glm-4-flash）
LLM_SCENE_QA_MODEL=
LLM_SCENE_INTENT_MODEL=glm-4-flash
LLM_SCENE_DOC_GEN_MODEL=

# Langfuse（按 provider/model 分维度统计）
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_HOST=

# === MCP (Python) ===
MCP_PORT=8090
MCP_API_KEYS=dev-key-1,dev-key-2
MCP_PROTOCOL_VERSION=2025-03-26
LINGPRISM_INTERNAL_API_URL=http://localhost:8080

# === 基础设施 ===
MYSQL_ROOT_PASSWORD=
```

`.gitignore` 已配置 `.env` 忽略、`.env.example` 保留（无需改动）。

---

## 8. 初始化交付物清单（确认计划后生成）

按 **最小可运行骨架（Phase 0）** 分批交付：

**Phase 0 — 仓库脚手架**

- `pnpm-workspace.yaml` + 根 `package.json` + Turborepo config
- `apps/admin|user|monitor` Next.js 14 空壳 + 共享 Layout
- `packages/ui`, `packages/shared`, `packages/graphql` 骨架
- `services/api` Apollo Server + Express HTTP + **SSE 路由** + Objection.js + 本地登录 JWT
- `packages/ui/LoginForm` 共享登录组件
- `services/core` Go HTTP health + gRPC stub
- `services/ai-worker` Celery + LangChain 骨架 + `infrastructure/llm/` 多厂商 factory（DeepSeek/千问/智谱）
- `infra/docker/docker-compose.yml`（MySQL, Redis, Neo4j, Qdrant, OpenSearch）
- 根 `.env.example` + 各服务 `.env.example`（含 LLM 多厂商配置段）
- `services/mcp` MCP `/mcp` 端点 + `tools/list`/`tools/call` 示例 tool
- `README.md` 本地启动指南

**Phase 1 — P0 业务闭环（按 PRD 附录 A 优先级）**

- 代码源管理 + 索引流水线
- 智能问答流式 + 架构图浏览
- 健康度/索引状态看板

---

## 9. 关键架构决策与权衡

| 决策 | 选择 | 理由 | 风险 |
|------|------|------|------|
| Go + Node 双后端 | Node GraphQL BFF + Go 领域服务 | 契合 AGENTS 技术栈，前端 Codegen 与 MySQL CRUD 高效 | 需维护 gRPC 契约，避免逻辑重复 |
| 三前端独立部署 | 三个 Next.js app | PRD 角色/权限/发布节奏不同，独立构建降低耦合 | 共享包版本需 workspace 约束 |
| MCP 独立 Python 服务 | 不嵌入 ai-worker | 对外可用性 NFR-08 99.9%，独立扩缩容 | 需严格禁止重复业务逻辑 |
| Celery 异步索引 | Redis 队列 | PRD NFR-13 增量更新 ≤4h，解耦长任务 | 任务幂等与失败重试设计 |
| Neo4j + Qdrant + OpenSearch 三引擎 | 各取所长 | 图谱/语义/全文各 PRD 能力依赖 | 运维复杂度，需统一 traceId |
| LLM OpenAI 兼容 + Factory | 统一 LangChain 适配层 | DeepSeek/千问/智谱均兼容 OpenAI API，切换成本低 | 各厂商 streaming/限流行为差异，需集成测试 |
| Chat 与 Embedding 可异厂商 | `LLM_PROVIDER` ≠ `EMBEDDING_PROVIDER`（可选） | 默认均为智谱；后续可按需拆分 | 向量维度变更须重建 Qdrant 索引 |
| 本地账户 JWT 认证 | email + bcrypt + JWT | Phase 0 最小闭环，无 SSO 依赖 | 后续接 OIDC 须兼容现有 `users.role` |
| MySQL 按表单写方 | Node 管 CRUD，Go 管索引产出 | 避免双写冲突（已确认） | 跨服务状态同步需 gRPC 回调或只读查询 |
| 默认 LLM 智谱 | Chat=`glm-4-plus`, Intent=`glm-4-flash`, Embed=`embedding-3` | 用户确认默认厂商 | 智谱 streaming 行为需在 Phase 0 集成验证 |
| 流式问答 SSE | `POST /api/chat/stream` + SSE 事件 | 用户确认；与 MCP Streamable HTTP 一致 | 需 Express/Fastify 与 Apollo 共存 |
| Qdrant 按维度隔离 | `lingprism_v1_zhipu_{dim}` | 换 Embedding 不污染旧索引 | 换厂商须新建 collection 并重建 |

---

## 10. 已确认决策

| 项 | 决策 |
|----|------|
| 身份认证 | **本地账户最小实现**（email/password + bcrypt + JWT），SSO 后续扩展 |
| Go 写 MySQL | **按表归属**：Node 写业务 CRUD，Go 写索引/健康度/漂移产出表（§2.1） |
| 默认 LLM | **智谱**：`LLM_PROVIDER=zhipu`，`EMBEDDING_PROVIDER=zhipu` |
| 流式问答 | **SSE**：`POST /api/chat/stream` + `POST /api/chat/stop`（§5.2）；GraphQL 仅负责会话 CRUD |
| Qdrant collection | **`lingprism_v1_zhipu_{dim}`** 按维度隔离（§4.8）；默认 `lingprism_v1_zhipu_1024` |

**计划已全部确认，可进入 Phase 0 执行。**

---

## 11. Todo 执行批次（13 项）

### 11.1 依赖关系总览

```mermaid
flowchart TB
    subgraph batch0 [Batch 0 地基]
        ENV[env-templates]
        MONO[scaffold-monorepo]
        INFRA[infra-docker 数据层]
    end

    subgraph batch1 [Batch 1 服务骨架 可并行]
        API[scaffold-api]
        CORE[scaffold-core]
        IDX[scaffold-indexer]
        MCP[scaffold-mcp]
        AI[scaffold-ai-worker]
    end

    subgraph batch2 [Batch 2 AI 基建]
        LLM[llm-provider-abstraction]
        QDRANT[qdrant-collection-naming]
    end

    subgraph batch3 [Batch 3 用户闭环]
        AUTH[local-auth-minimal]
        SSE[sse-chat-stream]
    end

    subgraph batch4 [Batch 4 集成交付]
        INFRA2[infra-docker Nginx+Dockerfile]
    end

    subgraph batch5 [Batch 5 业务 P0]
        P0[phase1-p0]
    end

    ENV --> API
    ENV --> CORE
    ENV --> AI
    ENV --> MCP
    MONO --> API
    MONO --> AUTH
    INFRA --> API
    INFRA --> CORE
    INFRA --> AI

    API --> AUTH
    API --> SSE
    AI --> LLM
    AI --> QDRANT
    CORE --> QDRANT
    LLM --> SSE
    AUTH --> SSE

    API --> INFRA2
    CORE --> INFRA2
    MCP --> INFRA2
    AI --> INFRA2
    SSE --> P0
    QDRANT --> P0
    INFRA2 --> P0
```

### 11.2 五批执行方案（推荐）

原则：**每批可独立验证、PR 可审查、尽量并行、避免返工**。

---

#### Batch 0 — 地基（串行，约 0.5~1 天）

| 顺序 | Todo | 说明 |
|------|------|------|
| 1 | `env-templates` | 先生成根 `.env.example` 与各服务子集，后续所有服务对齐变量名 |
| 2 | `scaffold-monorepo` | pnpm workspace + 三 app 空壳 + packages/ui/shared/graphql/graph-viz |
| 3 | `infra-docker`（**前半**） | 仅 `docker-compose.yml` 数据层：MySQL / Redis / Neo4j / Qdrant / OpenSearch |

**验收：** `pnpm install` 成功；`docker compose up -d` 五库健康；`.env.example` 齐全。

**为何 env 最先：** 避免 Batch 1 各服务各自发明变量名导致后期统一成本。

---

#### Batch 1 — 五服务骨架（**最大并行度**，约 1~2 天）

| 轨道 | Todo | 依赖 | 并行 |
|------|------|------|------|
| A | `scaffold-api` | Batch 0 | ✅ |
| B | `scaffold-core` | Batch 0 | ✅ |
| C | `scaffold-indexer` | Batch 0（无 DB 硬依赖） | ✅ |
| D | `scaffold-mcp` | Batch 0 | ✅ |
| E | `scaffold-ai-worker` | Batch 0（Redis） | ✅ |

**各轨道最小交付：**

| 服务 | 健康检查 | 骨架范围 |
|------|----------|----------|
| api | `GET /health` + GraphQL `{ __typename }` | Apollo + Express 挂载点（SSE 路由留空） |
| core | `GET /health` + gRPC stub | domain/application 目录 + proto 占位 |
| indexer | CLI `--version` 或 gRPC ping | tree-sitter 解析 hello-world |
| mcp | `tools/list` 返回 1 个 echo tool | Streamable HTTP `/mcp` |
| ai-worker | Celery worker 启动 + ping task | chains/ 空目录 + factory 占位 |

**验收：** 五服务各自独立启动通过；**此批不做** auth、LLM 真实调用、SSE 业务。

**PR 策略：** 可拆 2~3 个 PR（Node 轨 / Go+Rust 轨 / Python 轨），或单 PR「scaffold all services」便于一次性看全局结构。

---

#### Batch 2 — AI 基建（串行为主，约 1 天）

| 顺序 | Todo | 依赖 | 说明 |
|------|------|------|------|
| 1 | `llm-provider-abstraction` | ai-worker 骨架 | factory + 智谱默认 + DeepSeek/千问/OpenAI 切换 |
| 2 | `qdrant-collection-naming` | ai-worker + core | 共享 `resolve_collection_name()`，创建 `lingprism_v1_zhipu_1024` |

**验收：**
- `LLM_PROVIDER=zhipu` + API Key → 单次 chat completion 成功
- embedding 写入 Qdrant 测试 collection → core 侧检索 stub 可读

**为何在 auth/SSE 之前：** SSE 依赖真实 LLM 流式；Qdrant 命名越早统一，Phase 1 索引不会返工。

---

#### Batch 3 — 用户可感知闭环（约 1~2 天）

| 顺序 | Todo | 依赖 | 可并行 |
|------|------|------|--------|
| 1 | `local-auth-minimal` | api + monorepo/ui | — |
| 2 | `sse-chat-stream` | auth + llm + api | auth 与 llm 完成后 |

**`local-auth-minimal` 交付：** users 迁移 + seed + `login`/`me` + 三 app LoginForm + Apollo auth link。

**`sse-chat-stream` 交付：** `/api/chat/stream` + `/api/chat/stop` + `useChatSSE` + 智谱流式联通。

**验收（端到端 Demo）：**
1. 登录 `employee@lingprism.local`
2. 发送问题 → SSE 流式返回（可先用简化 RAG mock）
3. 点击停止 → 2s 内中断 + 「已中断」标记

**此批是 Phase 0 的「里程碑」** — 完成后可对外演示核心交互。

---

#### Batch 4 — 集成与部署（约 0.5~1 天）

| Todo | 范围 |
|------|------|
| `infra-docker`（**后半**） | 各服务 Dockerfile + Nginx 路由（三前端 + `/graphql` + `/api/chat/*` + `/mcp`）+ `README.md` 一键启动 |

**验收：** `docker compose up` 全栈启动；Nginx 路由正确；README 步骤新人可复现。

**为何放后面：** 服务入口与端口在 Batch 1~3 才稳定，过早写 Nginx 易反复改。

---

#### Batch 5 — Phase 1 业务 P0（约 2~4 周，再拆 3 子批）

`phase1-p0` 体量大，**必须在 Batch 0~4 完成后**再启动，建议内部再拆：

| 子批 | PRD 范围 | 依赖 Batch |
|------|----------|------------|
| **P0-A 数据接入** | 4.1.1~4.1.2 代码源 + 纳管 + 索引流水线 + 4.3.5 索引看板 | core + indexer + qdrant |
| **P0-B 智能问答** | 4.2.1~4.2.4 问答/RAG/模板/上下文 + 4.2.6 会话 | sse + llm + auth |
| **P0-C 架构与监控** | 4.1.4 架构图 + 4.2.5 浏览 + 4.3.1~4.3.2 健康/合规看板 | core + graph-viz |

```mermaid
gantt
    title 执行批次时间线示意
    dateFormat YYYY-MM-DD
    section Batch0
    env-templates           :b0a, 2026-07-07, 1d
    scaffold-monorepo       :b0b, after b0a, 1d
    infra-docker-data       :b0c, after b0a, 1d
    section Batch1
    scaffold-api            :b1a, after b0b, 2d
    scaffold-core           :b1b, after b0c, 2d
    scaffold-indexer        :b1c, after b0c, 2d
    scaffold-mcp            :b1d, after b0c, 1d
    scaffold-ai-worker      :b1e, after b0c, 2d
    section Batch2
    llm-provider            :b2a, after b1e, 1d
    qdrant-naming           :b2b, after b2a, 1d
    section Batch3
    local-auth              :b3a, after b1a, 1d
    sse-chat-stream         :b3b, after b2a b3a, 2d
    section Batch4
    infra-docker-full       :b4, after b3b, 1d
    section Batch5
    phase1-p0               :b5, after b4, 14d
```

### 11.3 并行 vs 串行决策表

| Todo | 建议 | 原因 |
|------|------|------|
| env-templates | **最先** | 零依赖，阻塞所有服务配置 |
| scaffold-monorepo | Batch 0 早期 | api 与三前端依赖 workspace |
| infra-docker | **拆两阶段** | 数据层 Batch 0；Nginx/Dockerfile Batch 4 |
| scaffold-api/core/indexer/mcp/ai-worker | **Batch 1 全并行** | 无交叉写库，契约用 proto/OpenAPI 占位 |
| llm-provider-abstraction | 等 ai-worker | 需 factory 挂载点 |
| qdrant-collection-naming | 等 ai-worker + core | 读写两侧须同一命名 |
| local-auth-minimal | 等 api + monorepo | 迁移在 api，LoginForm 在 ui |
| sse-chat-stream | 等 auth + llm | JWT 保护 SSE；流式需 LLM |
| phase1-p0 | **最后** | 依赖全栈骨架 + Demo 闭环 |

### 11.4 PR / 审查建议（对齐 change-control M 规模）

| 批次 | 建议 PR 数 | 规模 | 说明 |
|------|-----------|------|------|
| Batch 0 | 1 | S | 地基，宜原子提交 |
| Batch 1 | 2~3 | M | 按语言轨拆分，降低 review 负担 |
| Batch 2 | 1 | S~M | AI 基建紧密耦合 |
| Batch 3 | 1~2 | M | auth 与 SSE 可同 PR（用户故事连贯） |
| Batch 4 | 1 | S | 部署与文档 |
| Batch 5 | 3+ | L | 按 P0-A/B/C 拆分，每 PR 一个业务闭环 |

### 11.5 风险与规避

| 风险 | 规避 |
|------|------|
| Batch 1 五服务 proto/接口不一致 | Batch 0 末追加 `docs/api-contracts/` 占位（gRPC proto + SSE 事件 schema） |
| llm 与 sse 联调阻塞 Batch 3 | SSE 先接 mock provider，智谱联通作为 Batch 3 验收项 |
| qdrant 维度与智谱文档不符 | Batch 2 启动时用 API 探测实际 dim，写入 `ZHIPU_EMBEDDING_DIM` |
| phase1-p0 范围膨胀 | 严格按 PRD 附录 A P0 优先级，P1 功能不进 Batch 5 |
