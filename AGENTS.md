# AGENTS.md

本文档为 AI Agent 及开发者在维护和开发本项目时的核心指南，包含项目架构概览、开发规范、工具链命令及注意事项。

---

## 1. 项目概览与架构

本项目为 **LX Music 数据同步与 Web 播放器服务端**，已全面演进为 **全栈 Bun + TypeScript** 现代工程架构，并专注于 **Docker (Alpine)** 云端与私有化部署。

### 核心架构层级
- **后端服务 (`src/`)**：
  - 基于 **Bun** 高性能运行时驱动，结合 Express 与 WebSocket。
  - 提供多客户端音乐列表实时双向同步（支持快照、版本回滚）。
  - 内置兼容 **Subsonic 协议** 服务端接口，支持第三方客户端（如音流、Feishin 等）。
  - 内置 WebDAV 云端增量同步与定期全量备份机制。
  - 集成 `musicSdk` 动态音源解析体系与自定义用户 API 扩展。
- **前端工程 (`frontend/`)**：
  - 源码与产物严格分离，采用 **原生 Bun Bundler (`scripts/build-frontend.ts`)** 构建打包：
    - `frontend/admin/src/index.ts` ➡️ 输出至 `public/app.js`（管理后台）
    - `frontend/player/src/index.ts` ➡️ 输出至 `public/music/app.js`（Web 播放器）
  - 构建耗时仅需数十毫秒，实现极速打包与资源混淆压缩。
- **Docker 容器化 (`Dockerfile`)**：
  - 基于 `oven/bun:1-alpine` 的多阶段构建，内置原生音频库 `chromaprint` 与 `gcompat`，剔除一切桌面层冗余，专攻小体积与高启动性能。

### 目录指引
```text
lxserver/
├── src/                    # 服务端核心 TypeScript 源码
│   ├── server/             # HTTP 服务、WebSocket 同步、认证与路由
│   ├── modules/            # 核心业务模块、缓存、音源 SDK、Store
│   ├── common/             # 通用主题、工具函数、常量
│   └── index.ts            # 服务端主入口文件
├── frontend/               # 前端工程源码（禁止直接修改 public 压缩包）
│   ├── admin/src/          # 管理后台前端源码
│   └── player/src/         # Web 网页播放器前端源码
├── public/                 # 前端发布产物与静态资源托管目录
├── scripts/                # 构建与维护脚本（如 build-frontend.ts）
├── config.js               # 服务端默认与用户运行时配置
├── Dockerfile              # 生产级 Alpine + Bun 多阶段镜像配置
├── tsconfig.json           # 全局 TypeScript 编译器配置（TS 7.0+）
└── package.json            # 项目元信息、依赖与 npm/bun scripts
```

---

## 2. 核心原则与开发规范

### 核心原则
- **信息足够后立即行动**：明确需求后直接实施，不做无意义的重复调研。
- **不确定时明确说明**：基于实际代码和事实说话，不编造、不臆测。
- **直面判断**：发现逻辑矛盾或潜在安全风险时直接指出并纠正。
- **最小改动原则**：遵循现有代码风格和设计模式，优先复用现有函数与逻辑；严禁引入未通过评估的第三方依赖或冗余文件。

### Git 规范（强制要求）
- **每次改完代码并验证通过后，必须执行一次 `git commit`**。
- 提交信息必须规范清晰，遵循语义化格式（如 `feat:`, `fix:`, `refactor:`, `docs:` 等）。

### 工具链规范
- **统一使用 Bun**：本项目为纯 Bun 工程，**严禁**使用 `npm`, `yarn`, `pnpm` 或 `node` 执行安装与启动。
- **前端打包规范**：若修改了 `frontend/` 中的前端代码，**必须**运行 `bun run build:frontend` 同步编译生成 `public/` 静态产物。
- **类型安全规范**：全栈推进严格 TypeScript。每次代码改动后，需执行 `bun run tsc --noEmit` 确保 0 错误（当前使用 TypeScript 7.0+）。

---

## 3. 注意事项与避坑指南

### 1. 避免 `bun --watch` 触发死循环闪烁
- `bun run dev` 底层使用 `bun --watch`，会自动监听入口及所有动态 `require()` 过的文件。
- **禁忌**：严禁在服务端启动时无条件覆写被引用的配置文件（如 `config.js`），否则会诱发“启动 -> 改写依赖文件 -> 触发 watch 重启 -> 再次启动”的无限重启闪屏死循环。
- **处理方式**：任何写回配置的操作（如 `saveConfigToFile`）必须先比对内存内容与磁盘内容（如文本/MD5 检查），内容未变时严禁写盘。

### 2. 安全红线
- **目录穿越防护**：涉及本地文件返回与静态文件处理（如 `fileCache.ts`）必须对路径做严格边界检查（如基于 `path.resolve` 比对安全基准目录），防止 `../` 越界攻击。
- **管理端鉴权**：管理后台接口鉴权（如 `verifyAdminAuth`）必须强制校验密码存在且非空，禁止空密码等值绕过。
- **敏感信息脱敏**：严禁在日志中明文打印用户密码或敏感 Token。

### 3. Bun 模块兼容性
- Bun 原生支持 `tsconfig.json` 的 `paths` 别名映射，**严禁引入 `module-alias`**（会导致 Bun 内部模块报错）。
- 外部依赖若包含可选的动态依赖（如 `unzipper` 中的 `@aws-sdk/client-s3`），服务端打包时统一使用 `--packages=external`。
- 部分 CommonJS 模块（如 `log4js`）应采用 `const log4js: Log4js = require('log4js')` 方式导入以兼顾类型与运行时。

### 4. CI/CD 与镜像发布规范
- **CI 流水线 (`ci.yml`)**：仅在 `push` 到主分支时触发，自动执行依赖缓存、`bun test` 自动化测试、`bun run tsc --noEmit`、前端与服务端全量构建。
- **Docker 镜像发布 (`docker-publish.yml`)**：仅在推送版本标签（如 `git push origin v2.0.0`）时触发多架构构建（`linux/amd64`, `linux/arm64`）并自动发布至 `ghcr.io`，免第三方密钥。

---

## 4. 常用开发与构建命令

| 操作 | 命令 | 说明 |
| :--- | :--- | :--- |
| **安装依赖** | `bun install` | 安装项目依赖并更新 `bun.lock` |
| **自动化测试** | `bun test` | 运行 Bun 原生自动化单元测试套件 |
| **静态类型检查** | `bun run tsc --noEmit` | 验证全项目 TypeScript 类型正确性 |
| **前端开发热重载** | `bun run dev:frontend` | 监听前端源码改动并极速增量重编 |
| **前端编译打包** | `bun run build:frontend` | 使用 Bun Bundler 编译前端至 `public/` |
| **开发环境启动** | `bun run dev` | 启动开发服务，支持热重载与文件监听 |
| **生产环境启动** | `bun start` | 直接以生产模式运行服务端主入口 |
| **服务端独立打包** | `bun run build` | 打包服务端代码至 `./server/index.js` |
| **代码提交** | `git commit -m "<type>: <message>"` | 每次代码改动验证后必须执行提交 |
