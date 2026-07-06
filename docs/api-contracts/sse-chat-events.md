# SSE 聊天流事件协议（Batch 3 实现）

## 端点

- `POST /api/chat/stream` — `Content-Type: text/event-stream`
- `POST /api/chat/stop` — 中断生成

## 事件类型

| event | data 字段 | 说明 |
|-------|-----------|------|
| `status` | `{ "phase": "understanding" \| "retrieving" \| "generating" \| "formatting" }` | 阶段状态 |
| `token` | `{ "text": string }` | 流式正文 |
| `source` | `{ "type": string, "title": string, "url"?: string }` | 来源引用 |
| `template_hint` | `{ "templateId": string, "name": string, "preview": string }` | 模板推荐 |
| `done` | `{ "messageId": string, "interrupted": boolean }` | 结束 |
| `error` | `{ "code": string, "message": string }` | 错误 |

## 示例

```
event: status
data: {"phase":"understanding"}

event: token
data: {"text":"支付服务"}

event: done
data: {"messageId":"msg_123","interrupted":false}
```
