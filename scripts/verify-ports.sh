#!/bin/bash
# 灵镜项目端口配置验证脚本

set -e

echo "=========================================="
echo "灵镜项目端口配置验证"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_port() {
    local service=$1
    local port=$2
    local url=$3
    
    if curl -s --connect-timeout 2 "$url" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $service (端口 $port) - 正常"
        return 0
    else
        echo -e "${RED}✗${NC} $service (端口 $port) - 无法连接"
        return 1
    fi
}

echo "📊 检查 Docker 数据层服务..."
echo "----------------------------------------"

# 检查 Docker 数据层
DOCKER_RUNNING=$(docker compose ps 2>/dev/null | grep -c "Up" || true)
if [ "$DOCKER_RUNNING" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} Docker Compose 数据层正在运行 ($DOCKER_RUNNING 个服务)"
else
    echo -e "${YELLOW}⚠${NC} Docker Compose 数据层未运行"
    echo "   启动命令: cd infra/docker && docker compose up -d"
fi
echo ""

echo "🔍 检查数据层端口连通性..."
echo "----------------------------------------"
check_port "MySQL" "13306" "http://localhost:13306" || true
check_port "Redis" "6380" "http://localhost:6380" || true
check_port "Neo4j HTTP" "7474" "http://localhost:7474" || true
check_port "Qdrant" "6335" "http://localhost:6335/healthz" || true
check_port "OpenSearch" "9201" "http://localhost:9201" || true
echo ""

echo "🚀 检查应用服务..."
echo "----------------------------------------"
check_port "Core (HTTP)" "8080" "http://localhost:8080/health" || true
check_port "API Server" "4000" "http://localhost:4000/health" || true
echo ""

echo "📝 环境变量配置检查..."
echo "----------------------------------------"

# 检查根目录 .env
if [ -f ".env" ]; then
    QDRANT_URL=$(grep "^QDRANT_URL=" .env | cut -d'=' -f2)
    OPENSEARCH_URL=$(grep "^OPENSEARCH_URL=" .env | cut -d'=' -f2)
    
    if [ "$QDRANT_URL" = "http://localhost:6335" ]; then
        echo -e "${GREEN}✓${NC} QDRANT_URL 配置正确: $QDRANT_URL"
    else
        echo -e "${RED}✗${NC} QDRANT_URL 配置错误: $QDRANT_URL (应该是 http://localhost:6335)"
    fi
    
    if [ "$OPENSEARCH_URL" = "http://localhost:9201" ]; then
        echo -e "${GREEN}✓${NC} OPENSEARCH_URL 配置正确: $OPENSEARCH_URL"
    else
        echo -e "${RED}✗${NC} OPENSEARCH_URL 配置错误: $OPENSEARCH_URL (应该是 http://localhost:9201)"
    fi
else
    echo -e "${RED}✗${NC} .env 文件不存在"
fi
echo ""

# 检查 infra/docker/.env
if [ -f "infra/docker/.env" ]; then
    QDRANT_HOST_PORT=$(grep "^QDRANT_HOST_PORT=" infra/docker/.env | cut -d'=' -f2)
    OPENSEARCH_HOST_PORT=$(grep "^OPENSEARCH_HOST_PORT=" infra/docker/.env | cut -d'=' -f2)
    
    if [ "$QDRANT_HOST_PORT" = "6335" ]; then
        echo -e "${GREEN}✓${NC} Docker QDRANT_HOST_PORT 配置正确: $QDRANT_HOST_PORT"
    else
        echo -e "${YELLOW}⚠${NC} Docker QDRANT_HOST_PORT: $QDRANT_HOST_PORT (默认是 6335)"
    fi
    
    if [ "$OPENSEARCH_HOST_PORT" = "9201" ]; then
        echo -e "${GREEN}✓${NC} Docker OPENSEARCH_HOST_PORT 配置正确: $OPENSEARCH_HOST_PORT"
    else
        echo -e "${YELLOW}⚠${NC} Docker OPENSEARCH_HOST_PORT: $OPENSEARCH_HOST_PORT (默认是 9201)"
    fi
else
    echo -e "${YELLOW}⚠${NC} infra/docker/.env 文件不存在（使用默认值）"
fi
echo ""

echo "=========================================="
echo "✅ 验证完成"
echo "=========================================="
echo ""
echo "💡 提示："
echo "  - 本地开发：确保 Docker 数据层运行 + 根目录 .env 配置正确"
echo "  - Docker 部署：使用 infra/docker/.env 配置端口映射"
echo "  - 修改端口后需重启对应服务"
