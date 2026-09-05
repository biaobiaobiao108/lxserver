# syntax=docker/dockerfile:1.10
# Multi-stage Dockerfile for LX Music Sync Server (Ultra-slim Bun Architecture)

ARG BUN_VERSION=1.4.2

# Stage 1: Build Frontend, Server bundle and assets on host platform
FROM --platform=$BUILDPLATFORM oven/bun:${BUN_VERSION}-alpine AS builder
WORKDIR /app

# 安装构建原生 C++ 模块所需的编译链与依赖
RUN apk add --no-cache \
  g++ \
  make \
  python3 \
  py3-pip

# 利用 BuildKit 缓存挂载加速依赖安装
COPY package.json bun.lock tsconfig.json ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
  bun install --frozen-lockfile

COPY . .

# 1. 使用 Bun 原生 Bundler 极速构建前端资源
RUN bun run build:frontend

# 2. 将服务端核心源码编译打包为单文件 (外部依赖保留 external)
RUN bun run build

# Stage 2: Ultra-slim Production Runner
FROM oven/bun:${BUN_VERSION}-alpine AS runner
WORKDIR /server

RUN apk add --no-cache \
  chromaprint \
  gcompat \
  libstdc++

# 仅复制编译打包产物、运行时配置与必要依赖，彻底剔除 src/ 源码
COPY --from=builder /app/package.json ./
COPY --from=builder /app/bun.lock ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server ./server
COPY --from=builder /app/public ./public
COPY --from=builder /app/config.js ./config.js
COPY --from=builder /app/scripts ./scripts

# 将系统 chromaprint (fpcalc) 直接软链接至播放器二进制目录，免去容器内外部下载
RUN mkdir -p /server/public/music/bin && ln -sf /usr/bin/fpcalc /server/public/music/bin/fpcalc

VOLUME /server/data
ENV DATA_PATH='/server/data'
ENV LOG_PATH='/server/data/logs'
ENV NODE_ENV='production'
ENV PORT=9527
ENV BIND_IP='0.0.0.0'

EXPOSE 9527

# 容器原生健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:9527/hello').then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD [ "bun", "server/index.js" ]
