# prism-desktop

Prism 桌面客户端。把视频折射成文字、大纲、文章与播客。

桌面端的存在价值：
- **本地网络**：yt-dlp 跑在用户机器上，不用服务器代理
- **本地存储**：视频、音频、转录文件不经过中转

## 技术栈

- Electron 39 + Vue 3 + TypeScript
- electron-vite（构建）、electron-builder（打包）
- 共用 `@v2t/shared` 类型（在 v2t 仓库的 `packages/shared`）

## 开发

```bash
pnpm install
pnpm dev
```

## 构建

```bash
pnpm build:linux   # / :mac / :win
```

## 相关仓库

- [v2t](../v2t) — Web 后端、Web 前端、共享 SDK
