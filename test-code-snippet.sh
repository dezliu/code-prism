#!/bin/bash
# 测试代码片段提取功能

set -e

echo "========================================="
echo "测试代码片段提取功能"
echo "========================================="
echo ""

# 1. 检查 Core 服务是否运行
echo "1. 检查 Core 服务状态..."
if curl -s http://localhost:8080/health | grep -q '"status":"ok"'; then
    echo "✅ Core 服务运行正常"
else
    echo "❌ Core 服务未运行，请先启动服务"
    exit 1
fi
echo ""

# 2. 检查是否有已索引的仓库
echo "2. 检查索引数据..."
OS_COUNT=$(curl -s "http://localhost:9201/lingprism_search/_count" | python3 -c "import sys,json; print(json.load(sys.stdin)['count'])")
QDRANT_COUNT=$(curl -s "http://localhost:6335/collections/lingprism_v1_zhipu_1024" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['points_count'])")

echo "   OpenSearch 文档数: $OS_COUNT"
echo "   Qdrant 向量点数: $QDRANT_COUNT"
echo ""

if [ "$OS_COUNT" -eq 0 ] && [ "$QDRANT_COUNT" -eq 0 ]; then
    echo "⚠️  警告：没有索引数据，需要先导入 demo 数据或添加仓库"
    echo ""
    echo "   选项 1: 导入 demo 数据"
    echo "   cd infra/docker && ./import-demo-data.sh --force"
    echo ""
    echo "   选项 2: 手动添加仓库并触发索引"
    echo "   通过管理后台添加仓库后，调用 EnqueueIndex API"
    echo ""
    exit 1
fi

# 3. 查看示例数据
echo "3. 查看索引中的代码符号示例..."
SAMPLE=$(curl -s "http://localhost:9201/lingprism_search/_search?q=type:code_symbol&size=1&pretty")
echo "$SAMPLE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if data['hits']['hits']:
    hit = data['hits']['hits'][0]['_source']
    print(f\"   仓库: {hit.get('repoName', 'N/A')}\")
    print(f\"   文件: {hit.get('filePath', 'N/A')}\")
    print(f\"   类名: {hit.get('className', 'N/A')}\")
    print(f\"   方法: {hit.get('methodName', 'N/A')}\")
    print(f\"   行数: {hit.get('startLine', 'N/A')}-{hit.get('endLine', 'N/A')}\")
else:
    print('   没有找到 code_symbol 类型的文档')
"
echo ""

# 4. 测试 GraphQL 查询（需要认证）
echo "4. 测试 resolveSymbols API..."
echo "   注意：此测试需要有效的 JWT Token"
echo "   你可以登录用户端获取 token，然后执行："
echo ""
echo "   TOKEN='your_jwt_token'"
echo "   curl http://localhost:4000/graphql \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -H \"Authorization: Bearer \$TOKEN\" \\"
echo "     -d '{\"query\":\"query { resolveSymbols(input: {query: \\\"test\\\", limit: 1}) { repoName className methodName startLine endLine codeSnippet } }\"}'"
echo ""

echo "========================================="
echo "测试完成！"
echo "========================================="
echo ""
echo "下一步："
echo "1. 确保有索引数据（运行 import-demo-data.sh）"
echo "2. 重启 Core 服务以加载新代码"
echo "3. 通过前端或 API 测试代码片段返回"
