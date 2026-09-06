# LX Music Sync Server (Enhanced Edition)

![lxserver](https://socialify.git.ci/XCQ0607/lxserver/image?description=1&forks=0&issues=0&logo=https://raw.githubusercontent.com/XCQ0607/lxserver/refs/heads/main/public/icon.svg&owner=1&pulls=0&stargazers=0&theme=Auto)

<div align="center">
  <p>
    <img src="https://img.shields.io/badge/build-passing-brightgreen?style=flat-square" alt="Build Status">
    <img src="https://img.shields.io/badge/version-v2.0.0-blue?style=flat-square" alt="Version">
    <img src="https://img.shields.io/badge/runtime-Bun%201.1+-black?style=flat-square&logo=bun" alt="Bun Version">
    <img src="https://img.shields.io/badge/database-bun:sqlite-003B57?style=flat-square&logo=sqlite" alt="SQLite">
    <img src="https://img.shields.io/badge/docker-ready-2496ED?style=flat-square&logo=docker" alt="Docker">
    <img src="https://img.shields.io/badge/typescript-v7-3178C6?style=flat-square&logo=typescript" alt="TypeScript">
    <img src="https://img.shields.io/github/license/XCQ0607/lxserver?style=flat-square" alt="License">
    <br>
    <br>
    <a href="https://github.com/XCQ0607/lxserver/stargazers"><img src="https://img.shields.io/github/stars/XCQ0607/lxserver?style=flat-square&color=ffe16b" alt="GitHub stars"></a>
    <a href="https://github.com/XCQ0607/lxserver/network/members"><img src="https://img.shields.io/github/forks/XCQ0607/lxserver?style=flat-square" alt="GitHub forks"></a>
    <a href="https://github.com/XCQ0607/lxserver/issues"><img src="https://img.shields.io/github/issues/XCQ0607/lxserver?style=flat-square&color=red" alt="GitHub issues"></a>
    <a href="https://github.com/XCQ0607/lxserver/commits/main"><img src="https://img.shields.io/github/last-commit/XCQ0607/lxserver?style=flat-square&color=blueviolet" alt="Last Commit"></a>
  </p>
</div>

[帮助文档](https://xcq0607.github.io/lxserver/) | [同步服务端说明](md/lxserver.md) | [更新日志](changelog.md)

---

本项目是 **LX Music 数据同步与 Web 播放器服务端** 的全面现代化增强重构版。
服务端核心已全面升级为 **全栈 Bun (1.1+) + TypeScript 7.0+** 原生架构，底层彻底剔除遗留的 Express 依赖，完全由 **`Bun.serve`** 提供统一的 Web 标准 HTTP 路由与原生 WebSocket 驱动；结构化数据持久层全面迁移至 **`bun:sqlite` (WAL 模式)**，前端采用 **原生 Bun Bundler** 毫秒级打包编译，专为云端容器与私有化极速部署设计。

---

## ✨ Web 播放器与服务核心特性

### 1. 现代化响应式界面
采用清爽现代的 UI 设计，内置深色/浅色自适应模式，移动端全面适配，支持如原生 App 般的流畅触控体验。

<p align="center">
  <img src="md/player.png" width="800" alt="Web Player Interface">
</p>

### 2. 全聚合搜索与多源解析
- 聚合搜索各主流音乐平台在线资源，支持歌曲名、歌手、专辑多维度搜索。
- 支持单曲试听、批量加入队列、音质自动切换与回退。

<p align="center">
  <img src="md/search.png" width="800" alt="Search Interface">
</p>

### 3. 内容、歌单与播放队列管理
- **多平台歌单**：浏览、搜索各平台热门歌单，直观展示封面、作者与详情简介。
- **播放队列**：支持拖拽排序、批量删除、一键清空及当前播放快速居中定位。

<p align="center">
  <img src="md/musiclist.png" width="800" alt="歌单浏览">
</p>
<p align="center">
  <img src="md/musiclist-detail.png" width="400" alt="歌单详情">
  <img src="md/playlist.png" width="400" alt="播放队列管理">
</p>

### 4. 细粒度播放控制与逐字歌词
- 支持列表循环、单曲循环、随机播放等多种模式，支持倍速播放与睡眠定时器。
- 支持双语歌词对照、罗马音注音以及桌面端级别的逐字动态歌词显示。

<p align="center">
  <img src="md/controller.png" width="800" alt="Controller">
</p>

### 5. 智能化全自动化缓存系统
- **自动缓存**：支持歌曲音频、歌词文件的自动拉取与服务器本地落盘。
- **元数据与标签内嵌**：下载或缓存音频时自动嵌入 USLT 歌词、ID3v2 音频元数据。
- **缓存控制面板**：提供颗粒化缓存管理面板与按 LRU 容量自动清理机制。

<p align="center">
  <img src="md/cache.png" width="800" alt="缓存自动化管理">
</p>

### 6. 精美歌词卡片分享
支持多比例（竖版/横版/方版）与多种色彩风格（深色/浅色/专辑提取色），自由选择多行歌词一键导出高清分享海报。

<p align="center">
  <img src="md/share.png" width="800" alt="歌词卡片社交分享">
</p>

### 7. 主题定制与全局设置
提供森之韵、深海鲨、暖阳意、绯红月等多套现代化色彩主题；支持外发代理网络配置、在线歌单定期同步与配置自动备份。

<p align="center">
  <img src="md/theme.png" width="400" alt="现代化主题切换">
  <img src="md/settings.png" width="400" alt="全方位系统配置">
</p>

### 8. 自定义音源扩展
支持导入/管理自定义音源脚本扩展音源解析能力，配备严格的运行隔离机制与管理权限隔离。

<p align="center">
  <img src="md/source.png" width="800" alt="Source Management">
</p>

### 9. 专辑与歌手搜索与收藏
支持搜索专辑与歌手主页，支持一键收藏常听歌手或整张专辑，随时快速回听。

<p align="center">
  <img src="md/album.png" width="400" alt="专辑展示">
  <img src="md/singer.png" width="400" alt="歌手展示">
</p>

### 10. Subsonic 协议与全网在线检索
全面原生兼容 Subsonic 协议规范，可直接连接各类第三方客户端（如 **音流 (Stream)**、**Feishin**、**DSub**、**Symfonium** 等）：
- 支持指定平台前缀（如 `wy:`, `kg:`, `tx:`, `kw:`, `mg:`）进行精准平台检索。
- 支持 `online:` 与 `local:` 前缀强制指定在线全网搜索或本地音乐检索。

<p align="center">
  <img src="md/subsonic.png" width="400" alt="Subsonic 支持">
  <img src="md/subsonic-search.png" width="400" alt="Subsonic 在线全网搜索">
</p>

### 11. 公共曲库与跨用户共享收藏
开启系统配置中的“开启公共收藏和歌曲”后，各独立账号或未登录访客均可共享公共曲库与公开歌单。

<p align="center">
  <img src="md/_open_song.png" width="800" alt="公共曲库与共享收藏">
</p>

---

## 🔒 访问控制与权限管理

为了保障数据安全与隐私，Web 播放器和管理后台均提供严格的安全控制：

### 1. Web 播放器独立访问鉴权
- **环境变量控制**：
  - `ENABLE_WEBPLAYER_AUTH=true`：开启播放器访问认证
  - `WEBPLAYER_PASSWORD=yourpassword`：设置播放器访问密码
- **后台界面控制**：
  - 在管理后台（默认端口 9527）“系统配置”中勾选“启用 Web 播放器访问密码”并设置密码。

### 2. 权限与公开源限制矩阵 (当开启 `user.enablePublicRestriction` 时)

| 用户类型 | 查看列表 | 使用/切换(仅个人) | 修改默认音质 | 上传/导入公开源 | 删除/修改公开源 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **管理员** | ✅ 允许 | ✅ 允许 | ✅ 允许 | ✅ 允许 | ✅ 允许 |
| **已登录用户** | ✅ 允许 | ✅ 允许 | ✅ 允许 | ❌ 禁止 | ❌ 禁止 |
| **未登录访客** | ❌ 隐藏 | ❌ 禁止 | ❌ 禁止 | ❌ 禁止 | ❌ 禁止 |

---

## 🏗️ 现代化工程架构说明

本项目经过全面深度架构演进，形成了 **全栈 Bun + TypeScript 纯净原生体系**：

```text
┌─────────────────────────────────────────────────────────────┐
│                    Web 客户端 / 第三方应用                   │
│      (LX 桌面端 / 移动端、Web 网页播放器、Subsonic 音流等)     │
└──────────────────────────────┬──────────────────────────────┘
                               │
               HTTP / WebSocket (统一 9527 端口)
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    Bun.serve 运行时核心                      │
│   ├── 原生 Bun WebSocket 驱动 (实时双向列表同步 / 快照管理)  │
│   ├── Web 标准 Request/Response 洋葱模型分发 (Router)        │
│   └── 业务领域子路由 (Auth, Music, Cache, Subsonic, Static) │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
┌──────────────▼──────────────┐ ┌──────────────▼──────────────┐
│   结构化持久化 (bun:sqlite)  │ │      文件系统与媒体缓存      │
│  - users / devices (设备)   │ │  - 音频文件 / 封面 / .lrc   │
│  - snapshots (歌单快照)     │ │  - USLT 歌词与元数据内嵌    │
│  - user_settings / 索引      │ │  - WebDAV 增量及全量备份    │
└─────────────────────────────┘ └─────────────────────────────┘
```

1. **核心网络层全面基于 `Bun.serve`**：彻底剥离遗留的 Express 与 Node.js HTTP 桥接层，全程采用 Web 标准 Request/Response 和高性能洋葱模型路由，吞吐能力大幅提升。
2. **结构化存储迁移至 `bun:sqlite`**：用户凭证、连接设备密钥、多版本列表快照、用户设置全面采用原生 SQLite 数据库存储（开启 WAL 模式与外键级联），保证高并发读写事务安全。
3. **前端极速构建**：基于原生 `Bun.build` 构建工具链，无 Webpack / Vite 庞大依赖，数十毫秒内完成管理后台与播放器代码混淆压缩。
4. **极致轻量 Docker**：基于 `oven/bun:1-alpine` 构建，去除所有 TypeScript 编译器与开发依赖，内置 Alpine 原生 `chromaprint`，冷启动速度极快。

---

## 🚀 快速启动

### 方式一：使用 Docker 部署（推荐）

本项目提供预构建官方多架构镜像（支持 `linux/amd64` 与 `linux/arm64`）：

- **GitHub Packages**: `ghcr.io/biaobiaobiao108/lxserver:latest`

#### 1. Docker Run 方式
首次启动必须显式设置一个管理员密码：
```bash
export FRONTEND_PASSWORD='请替换为强随机密码'

docker run -d \
  -p 9527:9527 \
  -e FRONTEND_PASSWORD="$FRONTEND_PASSWORD" \
  -v $(pwd)/data:/server/data \
  -v $(pwd)/logs:/server/logs \
  -v $(pwd)/cache:/server/cache \
  -v $(pwd)/music:/server/music \
  --name lx-sync-server \
  --restart unless-stopped \
  ghcr.io/biaobiaobiao108/lxserver:latest
```

#### 2. Docker Compose 方式
创建 `docker-compose.yml`：
```yaml
version: '3'
services:
  lx-sync-server:
    image: ghcr.io/biaobiaobiao108/lxserver:latest
    container_name: lx-sync-server
    restart: unless-stopped
    ports:
      - "9527:9527"
    volumes:
      - ./data:/server/data
      - ./logs:/server/logs
      - ./cache:/server/cache
      - ./music:/server/music
    environment:
      - NODE_ENV=production
      - FRONTEND_PASSWORD=${FRONTEND_PASSWORD:?请先在 .env 中设置 FRONTEND_PASSWORD}
      # - ENABLE_WEBPLAYER_AUTH=true
      # - WEBPLAYER_PASSWORD=your_player_password
      # - ADMIN_PATH=
      # - PLAYER_PATH=/music
```
启动容器：
```bash
docker compose up -d
```

---

### 方式二：使用 Bun 源码运行 (开发者模式)

环境要求：安装 [Bun](https://bun.sh/)（版本 >= 1.1）。

```bash
# 1. 克隆代码仓库
git clone https://github.com/biaobiaobiao108/lxserver.git && cd lxserver

# 2. 安装依赖
bun install

# 3. 构建前端静态资源
bun run build:frontend

# 4. 启动服务
# 开发环境 (带代码监听与热重载):
bun run dev

# 生产源码启动:
bun start
```

### 访问说明
- **Web 网页播放器**: `http://你的IP:9527/music` (默认路径，可通过 `PLAYER_PATH` 自定义)
- **同步管理后台**: `http://你的IP:9527/` (默认根路径，密码必须在启动时显式设置)

---

## 🛠️ 配置说明与环境变量

可以直接编辑根目录 `config.js`，也可以通过环境变量覆盖（环境变量具有最高优先级）：

| 环境变量 | 对应配置项 | 说明 | 默认值 |
| :--- | :--- | :--- | :--- |
| `PORT` | `port` | 服务监听端口 | `9527` |
| `BIND_IP` | `bindIP` | 监听 IP (`0.0.0.0` 监听所有网卡) | `0.0.0.0` |
| `ADMIN_PATH` | `admin.path` | 后台管理访问路径（默认为空，即根路径 `/`） | `""` |
| `PLAYER_PATH` | `player.path` | Web 播放器访问路径 | `"/music"` |
| `FRONTEND_PASSWORD` | `frontend.password` | 管理后台登录密码（必填，不接受默认示例密码） | 无，必须显式设置 |
| `ENABLE_WEBPLAYER_AUTH` | `player.enableAuth` | 是否启用 Web 播放器访问认证 | `false` |
| `WEBPLAYER_PASSWORD` | `player.password` | Web 播放器访问密码 | `"123456"` |
| `SUBSONIC_ENABLE` | `subsonic.enable` | 是否启用 Subsonic 协议接口 | `true` |
| `SUBSONIC_PATH` | `subsonic.path` | Subsonic 服务挂载路径 | `"/rest"` |
| `SERVER_NAME` | `serverName` | 同步服务名称 | `"lxserver"` |
| `MAX_SNAPSHOT_NUM` | `maxSnapshotNum` | 每个用户保留的歌单历史快照上限 | `10` |
| `DATA_PATH` | - | 数据存储目录（包含 SQLite 数据库 `lxserver.db`） | `./data` |
| `LOG_PATH` | - | 日志输出目录 | `./logs` |
| `PROXY_HEADER` | `proxy.header` | 反向代理真实客户端 IP 请求头（如 `x-real-ip`） | - |
| `USER_ENABLE_ROOT` | `user.enableRoot` | 启用根路径同步连接（连接 URL 为 `ip:port`） | `false` |
| `USER_ENABLE_PATH` | `user.enablePath` | 启用用户路径连接（连接 URL 为 `ip:port/用户名`） | `true` |
| `WEBDAV_ENABLE` | `webdav.enable` | 是否启用 WebDAV 远端同步与定期备份 | `false` |
| `WEBDAV_URL` | `webdav.url` | WebDAV 服务器地址 | - |
| `WEBDAV_USERNAME` | `webdav.username` | WebDAV 登录账号 | - |
| `WEBDAV_PASSWORD` | `webdav.password` | WebDAV 登录密码 | - |
| `WEBDAV_SYNC_PATH` | `webdav.syncPath` | WebDAV 增量同步远端路径 | `"/lx-sync"` |
| `WEBDAV_BACKUP_PATH` | `webdav.backupPath` | WebDAV 全量备份远端存储路径 | `"/lx-sync-backups"` |
| `DISABLE_TELEMETRY` | `disableTelemetry` | 是否禁用匿名版本检查与系统公告提示 | `false` |
| `ENABLE_CACHE_SIZE_LIMIT`| `user.enableCacheSizeLimit` | 是否开启缓存空间容量限制 | `false` |
| `CACHE_SIZE_LIMIT` | `user.cacheSizeLimit` | 缓存容量上限 (MB)，超出按 LRU 自动清理 | `2000` |
| `PROXY_ALL_ENABLED` | `proxy.all.enabled` | 是否为外发请求（音源抓取）启用代理 | `false` |
| `PROXY_ALL_ADDRESS` | `proxy.all.address` | 代理地址（支持 `http://` 或 `socks5://`） | - |
| `LX_USER_<用户名>` | `users` 数组 | 环境变量快速创建用户（如 `LX_USER_tom=pwd123`） | - |

---

## 🛡️ 数据收集与隐私声明

为了及时向管理员提示新版本发布与紧急维护公告，系统集成了轻量级的版本检查机制：
- **统计信息严格脱敏**：绝不收集任何真实 IP 地址、用户名、密码、个人歌单或媒体内容。
- **一键关闭**：通过设置环境变量 `DISABLE_TELEMETRY=true` 即可完全禁用所有检查。

---

## 🤝 致谢与开源协议

- 数据同步基础源于 [lyswhut/lx-music-sync-server](https://github.com/lyswhut/lx-music-sync-server)。
- Web 播放器核心理念参考 [lx-music-desktop](https://github.com/lyswhut/lx-music-desktop)。
- 音源解析能力依托于开源社区维护的 `musicSdk` 机制。

本项目基于 **Apache License 2.0** 许可证发行，仅用于技术研究与个人学习交流，请严格遵守当地法律法规。
