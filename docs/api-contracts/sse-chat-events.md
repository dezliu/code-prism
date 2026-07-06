# SSE 聊天流事件协议（Batch 3 + QA Workflow）

## 端点

- `POST /api/chat/stream` — `Content-Type: text/event-stream`
- `POST /api/chat/stop` — 中断生成
- `POST /internal/mcp/ask` — MCP 服务令牌鉴权，走同一编排链路

## 事件类型

| event | data 字段 | 说明 |
|-------|-----------|------|
| `status` | `{ "phase": "security" \| "understanding" \| "routing" \| "retrieving" \| "generating" \| "grounding" \| "formatting" }` | 阶段状态 |
| `step` | `{ "node": string, "label": string }` | 工作流节点进度 |
| `token` | `{ "text": string }` | 流式正文 |
| `source` | `{ "type": string, "title": string, "ref"?: string }` | 来源引用 |
| `template_hint` | `{ "templateId": string, "name": string, "preview": string, "score"?: number }` | 模板推荐 |
| `done` | `{ "messageId": string, "interrupted": boolean, "anchor"?: object, "ragScore"?: number, "workflowNode"?: string }` | 结束 |
| `error` | `{ "code": string, "message": string }` | 错误 |

## 示例

```
event: status
data: {"phase":"understanding"}

event: step
data: {"node":"intent_classify","label":"理解问题意图"}

event: token
data: {"text":"支付服务"}

event: done
data: {"messageId":"msg_123","interrupted":false,"ragScore":0.42,"workflowNode":"generate_answer"}
```
