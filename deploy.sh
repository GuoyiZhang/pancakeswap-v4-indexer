#!/bin/bash

# 部署脚本 - PancakeSwap V4 Indexer
# 用法: ./deploy.sh [环境] [版本]
# 例如: ./deploy.sh production v1.0.0

set -e

# 默认值
ENVIRONMENT=${1:-staging}
VERSION=${2:-latest}
DOCKER_REGISTRY="ghcr.io"
IMAGE_NAME="your-username/pancakeswap-v4-indexer"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查必要的工具
check_dependencies() {
    log_info "检查依赖..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose 未安装"
        exit 1
    fi
}

# 设置环境变量
setup_environment() {
    log_info "设置 $ENVIRONMENT 环境..."
    
    # 复制环境特定的配置
    if [ -f ".env.$ENVIRONMENT" ]; then
        cp ".env.$ENVIRONMENT" ".env"
        log_info "已加载 .env.$ENVIRONMENT"
    else
        log_warn "未找到 .env.$ENVIRONMENT，使用默认配置"
        if [ ! -f ".env" ]; then
            cp ".env.example" ".env"
        fi
    fi
}

# 拉取最新镜像
pull_images() {
    log_info "拉取最新镜像..."
    
    docker pull "$DOCKER_REGISTRY/$IMAGE_NAME:$VERSION"
    docker-compose pull
}

# 备份数据库
backup_database() {
    if [ "$ENVIRONMENT" = "production" ]; then
        log_info "备份生产数据库..."
        
        BACKUP_FILE="backup-$(date +%Y%m%d_%H%M%S).sql"
        docker-compose exec -T postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB > "backups/$BACKUP_FILE"
        
        log_info "数据库备份完成: $BACKUP_FILE"
    fi
}

# 部署应用
deploy_application() {
    log_info "部署应用..."
    
    # 设置镜像版本
    export IMAGE_TAG="$VERSION"
    
    # 停止现有服务
    docker-compose down
    
    # 启动新服务
    docker-compose up -d
    
    log_info "等待服务启动..."
    sleep 30
}

# 健康检查
health_check() {
    log_info "执行健康检查..."
    
    MAX_ATTEMPTS=10
    ATTEMPT=1
    
    while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
        if curl -f http://localhost:8080/health &> /dev/null; then
            log_info "健康检查通过"
            return 0
        fi
        
        log_warn "健康检查失败 (尝试 $ATTEMPT/$MAX_ATTEMPTS)"
        sleep 10
        ATTEMPT=$((ATTEMPT + 1))
    done
    
    log_error "健康检查失败，部署可能有问题"
    return 1
}

# 回滚函数
rollback() {
    log_error "部署失败，开始回滚..."
    
    # 这里可以添加回滚逻辑
    # 例如：恢复之前的镜像版本
    
    log_info "回滚完成"
}

# 清理旧镜像
cleanup() {
    log_info "清理旧镜像..."
    docker image prune -f
}

# 主函数
main() {
    log_info "开始部署 PancakeSwap V4 Indexer"
    log_info "环境: $ENVIRONMENT"
    log_info "版本: $VERSION"
    
    check_dependencies
    setup_environment
    
    # 创建备份目录
    mkdir -p backups
    
    if [ "$ENVIRONMENT" = "production" ]; then
        backup_database
    fi
    
    pull_images
    deploy_application
    
    if health_check; then
        log_info "部署成功完成！"
        cleanup
    else
        rollback
        exit 1
    fi
}

# 确保脚本可执行
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi 