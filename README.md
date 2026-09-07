# LX Music Sync Server

<div align="center">

<svg aria-hidden="true" viewBox="0 0 447.942 447.943" width="96" height="96" xmlns="http://www.w3.org/2000/svg">
  <path style="fill: #34d399" d="M203.806.482c-19.668-3.346-35.76 11.139-35.76 31.086v206.166c-11.642-4.271-24.165-6.725-37.281-6.725-59.905 0-108.469 48.566-108.469 108.473 0 59.903 48.564 108.461 108.469 108.461 34.141 0 64.54-15.82 84.406-40.482l-49.658-49.664c-15.116-15.112-11.708-28.901-9.542-34.14 2.166-5.233 9.514-17.4 30.883-17.4h18.082v-56.885c0-21.132 14.617-38.862 34.266-43.745.032-44.373.032-81.808.032-81.808 140.147 0 131.724 83.974 115.325 132.196-6.42 18.884-2.601 22.05 10.893 7.354C536.473 77.106 298.38 16.566 203.806.482z" />
  <path style="fill: #059669" d="M301.061 223.876h-50.994c-3.911 0-7.574.95-10.889 2.523-8.616 4.09-14.615 12.798-14.615 22.973v76.51h-37.708c-14.082 0-17.428 8.071-7.466 18.029l46.893 46.898 31.25 31.246a25.424 25.424 0 0 0 18.033 7.474c6.523 0 13.052-2.484 18.029-7.474l78.152-78.145c9.951-9.958 6.608-18.029-7.47-18.029h-37.71v-76.51c.001-14.078-11.42-25.495-25.505-25.495z" />
</svg>

### 现代高性能 LX Music 列表实时同步服务端 · Web 音乐播放器 · Subsonic 流媒体中心

[![Bun Version](https://img.shields.io/badge/Bun-1.1%2B-black?logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0%2B-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Database](https://img.shields.io/badge/SQLite-WAL%20Mode-003B57?logo=sqlite)](https://bun.sh/docs/api/sqlite)
[![Docker Support](https://img.shields.io/badge/Docker-Alpine%20Slim-2496ED?logo=docker)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-Apache--2.0-green)](./LICENSE)

[在线特性演示页 (GitHub Pages)](https://biaobiaobiao108.github.io/lxserver/) · [快速开始](#-快速开始--docker-部署) · [环境变量参考](#-环境变量完整速查表) · [Subsonic 接入](#-subsonic-流媒体与第三方客户端接入) · [客户端配置](#-多端客户端连接指南)

</div>

---

## 📖 项目简介

**LX Music Sync Server** 是专为 **[洛雪音乐助手 (LX Music)](https://github.com/lyswhut/lx-music-desktop)** 设计的私有化数据同步与多功能音乐中枢服务。

本项目经历全面现代重构，基于全栈 **原生 Bun (1.1+) + TypeScript 7.0+** 架构，彻底移除了传统的 Express 框架与重型运行时依赖，提供毫秒级冷启动响应与极低的内存占用（生产镜像运行时内存仅约几十兆）。服务集成了 **实时双向 WebSocket 同步**、**功能完备的现代桌面级 Web 网页播放器**、**Subsonic / OpenSubsonic 协议音频流兼容** 以及 **全网音源在线回退检索** 等众多特性，是个人与家庭私有音乐库的理想底座。

---

## ✨ 核心特性

- ⚡ **全栈原生极速引擎**：
  - 基于 `Bun.serve` 与 Web 标准 `Request` / `Response` 构建的高性能洋葱模型中间件路由，零外部 Web 框架开销。
  - 原生支持 HTTP Keep-Alive 与大文件流式快速传输。
- 🔄 **毫秒级实时数据同步**：
  - 基于 Bun 原生 WebSocket 驱动，支持多端歌单双向秒级同步、防并发冲突仲裁与自动心跳保活。
  - 完善的歌单版本控制与快照机制，支持自定义快照备份上限与一键版本回滚。
- 🎵 **现代化 Web 网页播放器**：
  - 访问 `/music` 即可使用的桌面级 Web 播放器，原生支持 PWA（可离线安装至手机与桌面）。
  - 内置逐字歌词动态滚动、双语翻译与罗马音对照、音频音高升降调节（Pitch Shift）、Web Audio 均衡器、实时声学频谱跳动。
  - 支持多端歌单直接在线管理、歌曲批量迁移、封面自动获取与本地缓存索引。
- 📻 **Subsonic 协议兼容与全网在线搜索**：
  - 原生提供 `/rest/` 接口，无缝对接 **Symfonium**、**Feishin**、**Amperfy**、**DSub**、**音鲸** 等各大流行第三方音频客户端。
  - 内置全网音源在线回退（`fallback`）与聚合合并（`merge`）检索能力，使本地库中不存在的歌曲也能通过 Subsonic 在线即点即播。
- 💾 **严苛的数据安全与持久化**：
  - 核心数据采用原生 **`bun:sqlite`** 引擎存储，启用 **WAL（Write-Ahead Logging）** 高并发写入模式与完整外键完整性约束。
  - 数据目录物理隔离（支持路径权限模式），杜绝未授权跨租户读取。
  - 集成 **WebDAV** 增量同步与全量定时自动冷备机制，避免单点故障丢失珍贵歌单。
- 🛡️ **生产级安全基线**：
  - 严格的主机与目录穿越检测，强制禁止弱口令/默认示例口令启动，全方位保护管理接口与播放器访问权限。

---

## 🚀 快速开始 / Docker 部署

官方推荐使用 **Docker** 或 **Docker Compose** 容器化部署，生产镜像基于轻量级 `Alpine Linux` 构建，并内置了用于音频指纹提取的 `chromaprint (fpcalc)` 工具。

### 方式一：使用 Docker Compose 部署（推荐）

在项目根目录或部署服务器上创建 `docker-compose.yml` 文件：

```yaml
version: '3.8'

services:
  lx-sync-server:
    image: ghcr.io/biaobiaobiao108/lxserver:latest
    container_name: lx-sync-server
    restart: always
    ports:
      - "9527:9527"
    volumes:
      # 持久化数据目录（包含数据库、歌单快照、本地音乐缓存与配置）
      - ./data:/server/data
    environment:
      - NODE_ENV=production
      # 【必须设置】管理后台登录密码，禁止使用 123456 等示例弱口令！
      - FRONTEND_PASSWORD=YourStrongAdminPassword123!
      # 服务端同步账户配置，格式为 LX_USER_<用户名>=<密码>
      - LX_USER_admin=UserPassword456!
      # 启用 Web 播放器密码鉴权（可选）
      - ENABLE_WEBPLAYER_AUTH=true
      - WEBPLAYER_PASSWORD=PlayerPassword789!
      # 开启 Subsonic 协议流媒体支持
      - SUBSONIC_ENABLE=true
```

启动容器：
```bash
docker compose up -d
```

查看容器日志：
```bash
docker compose logs -f lx-sync-server
```

---

### 方式二：使用 `docker run` 命令

```bash
docker run -d \
  --name lx-sync-server \
  --restart always \
  -p 9527:9527 \
  -v $(pwd)/data:/server/data \
  -e NODE_ENV=production \
  -e FRONTEND_PASSWORD=YourStrongAdminPassword123! \
  -e LX_USER_admin=UserPassword456! \
  -e ENABLE_WEBPLAYER_AUTH=false \
  -e SUBSONIC_ENABLE=true \
  ghcr.io/biaobiaobiao108/lxserver:latest
```

---

### 方式三：从源码本地构建 Docker 镜像

如果您直接克隆了本代码仓库，可直接基于源码构建极简的多阶段生产镜像：

```bash
# 1. 克隆本仓库
git clone https://github.com/biaobiaobiao108/lxserver.git
cd lxserver

# 2. 修改 docker-compose.yml（配置你的安全密码）

# 3. 本地构建并运行
docker compose up -d --build
```

---

## 🔑 访问地址与默认路径

服务启动后，默认监听 `9527` 端口：

| 模块 | 访问路径 | 说明 |
| :--- | :--- | :--- |
| **管理后台** | `http://<服务器IP>:9527/` | 系统监控、用户管理、快照管理、自定义音源管理（需要 `FRONTEND_PASSWORD`） |
| **Web 网页播放器** | `http://<服务器IP>:9527/music` | 现代 PWA 网页播放器（若开启鉴权需输入 `WEBPLAYER_PASSWORD`） |
| **Subsonic 接口** | `http://<服务器IP>:9527/rest/` | 兼容 Subsonic / OpenSubsonic API，可直接填入第三方客户端 |
| **WebSocket 同步** | `ws://<服务器IP>:9527/` | 用于客户端连接实时同步 |
| **在线交互演示页** | [https://biaobiaobiao108.github.io/lxserver/](https://biaobiaobiao108.github.io/lxserver/) | GitHub Pages 在线访问，或本地浏览器直接打开 `docs/index.html` |

> [!CAUTION]
> **安全红线警告**：
> 服务启动时会自动执行安全校验。如果 `FRONTEND_PASSWORD` 未配置或设置为默认示例弱密码（如 `123456`），服务端将**拒绝启动**并退出。在公网暴露服务时，请务必设置高强度密码！

---

## ⚙️ 环境变量完整速查表

通过环境变量配置的选项优先级**高于** `config.js` 文件，修改环境变量后重启容器即可生效。

### 1. 基础网络与系统参数
| 环境变量名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `PORT` | Number | `9527` | 服务监听端口 |
| `BIND_IP` | String | `0.0.0.0` | 绑定的 IP 地址 |
| `DATA_PATH` | String | `/server/data` | 数据持久化存放目录 |
| `SERVER_NAME` | String | `lxserver` | 同步服务器名称标识 |
| `NODE_ENV` | String | `production` | 运行环境模式 |
| `DISABLE_TELEMETRY` | Boolean | `false` | 是否禁用匿名数据遥测 |

### 2. 安全与账户认证
| 环境变量名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `FRONTEND_PASSWORD` | String | **无 (必填)** | **管理后台管理员登录密码**（禁止使用空值或弱密码） |
| `LX_USER_<username>` | String | 无 | 创建同步用户，例如 `LX_USER_tom=pwd123` |
| `ENABLE_WEBPLAYER_AUTH` | Boolean | `false` | 是否对 Web 网页播放器启用访问鉴权 |
| `WEBPLAYER_PASSWORD` | String | 无 | Web 网页播放器访问密码（启用鉴权时必填） |
| `USER_ENABLE_PATH` | Boolean | `true` | 是否启用用户路径模式（支持多租户路径隔离） |
| `USER_ENABLE_ROOT` | Boolean | `false` | 是否允许根路径模式 |

### 3. 访问路径自定义
| 环境变量名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `ADMIN_PATH` | String | `""` | 管理后台相对路径（默认为根路径 `/`） |
| `PLAYER_PATH` | String | `/music` | Web 网页播放器相对路径 |
| `SUBSONIC_PATH` | String | `/rest` | Subsonic 服务 API 相对路径 |

### 4. Subsonic 与音源检索
| 环境变量名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `SUBSONIC_ENABLE` | Boolean | `true` | 是否启用 Subsonic API 支持 |
| `SINGER_SOURCE_PRIORITY` | String | `tx,wy` | 歌手信息与音源优先级，支持 `tx` (企鹅) 与 `wy` (云音乐) |

### 5. 权限与资源限制
| 环境变量名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `ENABLE_PUBLIC_USER_RESTRICTION` | Boolean | `true` | 是否开启公开用户权限边界限制 |
| `ENABLE_PUBLIC_FAVORITES` | Boolean | `false` | 是否开启公共收藏歌单 |
| `ENABLE_CACHE_SIZE_LIMIT` | Boolean | `false` | 是否开启音频缓存空间上限限制 |
| `CACHE_SIZE_LIMIT` | Number | `2000` | 缓存空间上限限制大小（单位：MB） |
| `MAX_SNAPSHOT_NUM` | Number | `10` | 歌单最大快照保存数量 |

### 6. WebDAV 备份与增量同步
| 环境变量名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `WEBDAV_ENABLE` | Boolean | `false` | 是否启用 WebDAV 远程备份 |
| `WEBDAV_URL` | String | `""` | WebDAV 服务端完整 URL 地址 |
| `WEBDAV_USERNAME` | String | `""` | WebDAV 账户名 |
| `WEBDAV_PASSWORD` | String | `""` | WebDAV 密码 |
| `WEBDAV_SYNC_PATH` | String | `/lx-sync` | 增量同步远程目录 |
| `WEBDAV_BACKUP_PATH` | String | `/lx-sync-backups`| 全量备份远程归档目录 |
| `SYNC_INTERVAL` | Number | `60` | 增量同步周期（分钟） |
| `BACKUP_INTERVAL` | Number | `24` | 全量备份周期（小时） |

---

## 🌐 Nginx 反向代理配置（含 HTTPS 与 WebSocket）

若您使用 Nginx 暴露域名并在前端启用 SSL/TLS，**必须**正确转发 WebSocket 升级头及真实客户端 IP，以确保实时同步和在线流媒体稳定运作。以下是推荐的 Nginx 虚拟主机配置：

```nginx
server {
    listen 443 ssl http2;
    server_name music.yourdomain.com;

    ssl_certificate     /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # 允许上传自定义音源或备份文件的最大体积极限
    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:9527;

        # 核心：必须配置 WebSocket 协议升级握手支持
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # 客户端真实真实 IP 及 Host 头透传
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 关闭代理缓冲，保证音频流式播放与长连接保活低延迟
        proxy_buffering off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

---

## 📱 多端客户端连接指南

### 1. LX Music 官方客户端（桌面端 / Android 移动端）
1. 打开 LX Music 设置 ➡️ **数据同步** ➡️ 启用 **同步功能**。
2. 同步模式选择：`服务端模式` 或 `自定义服务端`。
3. **服务端地址**：填写 `http://<服务器IP或域名>:9527`（若启用了 HTTPS 则填 `https://...`）。
4. **连接密码**：填写在环境变量或管理后台配置的用户密码（即 `LX_USER_<用户名>` 的密码）。
5. 点击 **连接测试**，提示成功后即可开启实时同步或手动创建快照。

### 2. Subsonic 流媒体客户端（Symfonium / Feishin / Amperfy 等）
1. 打开 Subsonic 客户端，添加新的服务端类型选择 **Subsonic**。
2. **服务器地址**：`http://<你的域名或IP>:9527`（部分客户端需填写完整路径 `http://<域名>:9527/rest`）。
3. **用户名与密码**：输入服务端配置的任一系统用户账户与对应密码。
4. 连接成功后，客户端不仅能加载你在服务端同步的歌单与本地缓存音乐，还可通过客户端顶部的全局搜索框直接检索并流式播放全网海量音源。

---

## 🛠️ 本地开发与贡献指南

本项目采用纯粹的 **Bun** 工具链构建，无需安装 Node.js、Webpack 或 Python。

### 依赖环境
- **Bun** >= 1.1（推荐使用最新版 Bun，可执行 `bun upgrade` 升级）

### 常用命令

```bash
# 1. 安装项目纯净依赖
bun install

# 2. 启动前端源码热重载监听（开发 Web 播放器或后台）
bun run dev:frontend

# 3. 启动服务端源码开发模式（支持自动热重载）
bun run dev

# 4. 执行全栈静态类型检查（严格 0 错误）
bun run tsc --noEmit

# 5. 执行基于 bun:test 的单元与集成自动化测试套件
bun test

# 6. 打包前端产物至 public/
bun run build:frontend

# 7. 编译服务端单文件生产包至 ./server/
bun run build
```

---

## 📄 开源许可证

本项目基于 [Apache-2.0 License](./LICENSE) 协议分发。
