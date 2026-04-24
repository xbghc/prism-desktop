# CLAUDE.md

给 Claude Code agents 的项目指引。

## 项目概述

Prism 桌面客户端（Windows-only）。Electron + Vue 3 + TypeScript。
把视频（YouTube 为主）折射成文字、大纲、文章、播客。相对 Web 版的价值：yt-dlp 在用户机器上执行，不依赖后端代理。

## 目录约定

```
src/
├── shared/                 # 主进程 + 渲染进程共用
│   ├── types.ts           # Workspace / Settings / 事件契约
│   ├── ipc-channels.ts    # IPC channel 常量
│   └── errors.ts          # PrismError 层级 + 序列化
├── main/                   # 主进程（Node）
│   ├── index.ts           # 入口 + 窗口 + 生命周期
│   ├── paths.ts           # 数据目录 / 临时目录 / bin 目录
│   ├── logger.ts          # 结构化日志（stdout + 文件）
│   ├── settings.ts        # 配置读写 + effectiveProxy()
│   ├── workspace-store.ts # 工作区 CRUD（JSON 持久化 + in-memory Map）
│   ├── events.ts          # 主 → 渲染广播（webContents.send）
│   ├── pipeline.ts        # 下载→转录流水线编排
│   ├── ipc/               # IPC handler 注册（workspace/settings/system/content）
│   ├── services/          # 外部能力（downloader/transcribe/llm/tts）
│   └── platform/          # Windows 原生集成（待 Platform worker 创建）
└── preload/                # 桥接主 ↔ 渲染，只通过 contextBridge 暴露 `window.prism`
```

## 职责划分（Agent Team）

| Agent | 允许改的文件 | 不能改 |
|-------|------------|--------|
| **Downloader** | `src/main/services/downloader.ts`, `scripts/fetch-bin.ts`, `resources/bin/**`, 相关测试 | 其他 service、ipc、shared、preload、renderer |
| **External APIs** | `src/main/services/{transcribe,llm,tts}.ts`, `resources/prompts/**`, 相关测试 | 其他 service、ipc、shared、preload、renderer |
| **Renderer/UI** | `src/renderer/**`, `index.html` | 主进程、shared（除非加字段需协商） |
| **Win Platform** | `src/main/platform/**`（自己新建）、在 `src/main/index.ts` 的生命周期 hook 加调用 | 不要改 service、ipc、shared |
| **Release/CI** | `.github/workflows/**`, `electron-builder.yml`, `package.json`（仅 scripts 区域） | 源代码 |

## 契约不可改

以下文件是 Phase 0 架构师产出，worker **不要改**（需要补字段走 PR 单独讨论）：
- `src/shared/types.ts`
- `src/shared/ipc-channels.ts`
- `src/shared/errors.ts`
- `src/preload/index.ts`（对外 API 形状定好了）
- `src/main/ipc/index.ts`（handler 注册入口）
- `src/main/pipeline.ts`（流水线编排骨架）

Service 模块（`downloader.ts` 等）的**函数签名**是契约，worker 可以改实现但不要改签名。要改签名必须 PR 里明确说明并同步改 pipeline.ts。

## Git 约定

1. 每个 worker 在独立 feature 分支工作：`feat/downloader`、`feat/external-apis`、`feat/renderer-ui`、`feat/win-platform`、`feat/release-ci`
2. Commit 消息中文，遵循 Conventional Commits: `feat(downloader): ...`、`fix(...)`、`chore(ci): ...`
3. 每次 commit 至少包含：完整变更 + 能单独过 typecheck
4. 开 PR 时 body 写：
   - 做了什么
   - 怎么测（或为什么没法测）
   - 对其他 worker 的影响（通常应是「无」）
5. PR 由 2 个 reviewer 双签，Reviewer-B 最终 merge

## 开发命令

```bash
pnpm install           # 首次安装（Electron 二进制 ~200MB）
pnpm dev               # 启动（Windows / 本地 X11 才能看到窗口）
pnpm typecheck         # 类型检查
pnpm lint              # ESLint
pnpm format            # Prettier
pnpm build             # 生产构建（typecheck + bundle）
pnpm build:win         # 打 Windows 安装包（NSIS）
```

## 平台约束

- **Windows-only**：构建、打包目标只有 win x64 NSIS。代码里可以用 `process.platform === 'win32'` 假设。不需要 mac / linux 兼容代码
- **尽情使用 Windows 原生特性**：任务栏进度条、Toast、Jump List、协议处理器、全局热键、系统托盘、`prism://` 深链等

## 外部依赖策略

- 首选 Electron 自带 API（`app`、`BrowserWindow`、`shell`、`Notification`、`Tray`、`globalShortcut` 等）
- 次选 `@electron-toolkit/*`（已装）
- 第三方 npm 包：能 pure JS 就不上 native（node-gyp 编译坑多）。必须上 native 的请 PR 里说明
- 禁用：不要引入 Python / WASM / C++ addon

## 错误处理

- 所有主进程抛 `PrismError` 子类（见 `src/shared/errors.ts`）
- IPC 边界上用 `serializeError()` 序列化后 throw（让渲染层接到结构化错误）
- 渲染层 catch 后 toast 或 inline 展示
