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

## 发布流程

本仓库使用 GitHub Actions + electron-builder 自动发版，客户端集成了
electron-updater，用户侧可自动升级。

发布新版本：

```bash
# 1. 在 package.json 升版本号（手动改 version 或 pnpm version）
# 2. 打 tag 并推送
git tag v0.1.0
git push origin v0.1.0
```

推送 `v*` tag 会触发 `.github/workflows/release.yml`：

- 在 `windows-latest` 上 `pnpm install && pnpm release:win`
- electron-builder 把 NSIS 安装包和 `latest.yml` 上传到对应 tag 的
  GitHub Release

客户端启动后调用 `setupAutoUpdater()`：

- 启动时立即向 `https://github.com/xbghc/prism-desktop/releases/latest`
  查询 `latest.yml`
- 发现新版后自动下载，下次退出时安装
- 运行中每 6 小时轮询一次

本地开发环境（未打包）会读取 `dev-app-update.yml` 作为 feed 配置，因此开发
模式下也能走一次更新检查的链路。

## 相关仓库

- [v2t](../v2t) — Web 后端、Web 前端、共享 SDK
