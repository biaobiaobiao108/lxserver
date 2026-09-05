FROM oven/bun:1-alpine AS builder
WORKDIR /app

# 安装构建原生 C++ 模块所需的编译链与依赖
RUN apk add --no-cache \
  g++ \
  make \
  python3 \
  py3-pip

COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile

COPY . .

# 使用 Bun 原生 Bundler 构建前端资源
RUN bun run build:frontend

FROM oven/bun:1-alpine AS runner
WORKDIR /server

RUN apk add --no-cache \
  chromaprint \
  gcompat \
  libstdc++

COPY --from=builder /app/package.json ./
COPY --from=builder /app/bun.lock ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public
COPY --from=builder /app/config.js ./config.js
COPY --from=builder /app/scripts ./scripts

VOLUME /server/data
ENV DATA_PATH='/server/data'
ENV LOG_PATH='/server/data/logs'
ENV NODE_ENV='production'
ENV PORT=9527
ENV BIND_IP='0.0.0.0'

EXPOSE 9527

CMD [ "bun", "run", "src/index.ts" ]
