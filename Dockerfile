# 使用官方Node.js镜像作为基础镜像
FROM node:20-alpine AS base

# 安装pnpm
RUN npm install -g pnpm

# 设置工作目录
WORKDIR /app

# 复制package.json和lock文件
COPY package.json pnpm-lock.yaml ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 生成代码
RUN pnpm run codegen

# 构建项目
RUN pnpm run build

# 生产阶段
FROM node:20-alpine AS production

# 安装pnpm
RUN npm install -g pnpm

WORKDIR /app

# 复制package.json和lock文件
COPY package.json pnpm-lock.yaml ./

# 只安装生产依赖
RUN pnpm install --frozen-lockfile --prod

# 从构建阶段复制构建产物和源代码
COPY --from=base /app/generated ./generated
COPY --from=base /app/dist ./dist
COPY --from=base /app/src ./src
COPY --from=base /app/config.yaml ./config.yaml
COPY --from=base /app/schema.graphql ./schema.graphql
COPY --from=base /app/abi ./abi
COPY --from=base /app/tokenMetadata.json ./tokenMetadata.json

# 暴露端口
EXPOSE 8080

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/healthz || exit 1

# 启动命令
CMD ["pnpm", "envio", "start"] 