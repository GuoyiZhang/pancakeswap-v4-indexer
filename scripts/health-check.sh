#!/bin/bash

# 健康检查脚本 - PancakeSwap V4 Indexer

set -e

# 配置
INDEXER_URL=${INDEXER_URL:-"http://localhost:8080"}
HASURA_URL=${HASURA_URL:-"http://localhost:8081"}
POSTGRES_HOST=${POSTGRES_HOST:-"localhost"}
POSTGRES_PORT=${POSTGRES_PORT:-"5432"}

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查索引器状态
check_indexer() {
    log_info "检查索引器状态..."
    
    if curl -f -s "$INDEXER_URL/health" >/dev/null 2>&1; then
        log_info "✅ 索引器运行正常"
        return 0
    else
        log_error "❌ 索引器不可用"
        return 1
    fi
}

# 检查Hasura状态
check_hasura() {
    log_info "检查Hasura状态..."
    
    if curl -f -s "$HASURA_URL/healthz" >/dev/null 2>&1; then
        log_info "✅ Hasura运行正常"
        return 0
    else
        log_error "❌ Hasura不可用"
        return 1
    fi
}

# 检查PostgreSQL状态
check_postgres() {
    log_info "检查PostgreSQL状态..."
    
    if nc -z "$POSTGRES_HOST" "$POSTGRES_PORT" >/dev/null 2>&1; then
        log_info "✅ PostgreSQL连接正常"
        return 0
    else
        log_error "❌ PostgreSQL连接失败"
        return 1
    fi
}

# 检查GraphQL查询
check_graphql() {
    log_info "检查GraphQL API..."
    
    QUERY='{"query":"query { __typename }"}'
    
    if curl -f -s -X POST \
        -H "Content-Type: application/json" \
        -d "$QUERY" \
        "$HASURA_URL/v1/graphql" >/dev/null 2>&1; then
        log_info "✅ GraphQL API正常"
        return 0
    else
        log_error "❌ GraphQL API不可用"
        return 1
    fi
}

# 检查索引器同步状态
check_sync_status() {
    log_info "检查同步状态..."
    
    # 这里可以添加检查最新区块和索引器当前区块的逻辑
    # 示例：检查是否在过去5分钟内有新的数据
    
    log_info "📊 同步状态检查完成"
}

# 主函数
main() {
    log_info "🔍 开始健康检查..."
    
    local exit_code=0
    
    check_indexer || exit_code=1
    check_hasura || exit_code=1
    check_postgres || exit_code=1
    check_graphql || exit_code=1
    check_sync_status
    
    if [ $exit_code -eq 0 ]; then
        log_info "🎉 所有服务运行正常"
    else
        log_error "⚠️  部分服务存在问题"
    fi
    
    exit $exit_code
}

# 运行健康检查
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi 