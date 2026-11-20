# MD Viewer

轻量、本地优先的 Markdown 阅读工具，自建 Typora 替代方案，边用边开发中。

基于 Electron + React + TypeScript 构建，专注本地文档的舒适阅读体验：正确的编码处理、朴素的排版、柔和的深色主题。

## 当前功能

- **Markdown 渲染**：GFM 表格、任务列表、脚注、内嵌 HTML（经安全清洗）
- **语法高亮**：Shiki 按需加载语言，支持常见 30+ 种语言，代码块一键复制
- **编码探测**：UTF-8（BOM / 无 BOM）、UTF-16、GBK / GB18030，中文文档不乱码
- **本地图片**：通过 `md-asset` 自定义协议加载，限定在文档所在目录，支持相对路径
- **侧栏双选项卡**：
  - 大纲——随滚动高亮跟随，点击跳转
  - 文件——当前文档所在目录的树，文件夹展开、Markdown 文档点击即开
- **主题**：浅色 / 深色（GitHub Light / Dark Dimmed 风格），柔和滚动条
- **文档互链**：相对路径 `.md` 链接在应用内打开，外部链接交给系统浏览器

## 安全设计

- `contextIsolation` + `sandbox` + 禁用 `nodeIntegration`
- 渲染进程 CSP 限制资源加载，图片只允许 `self`/`data:`/`md-asset:`
- Markdown 输出经 DOMPurify 清洗（移除 script、style、iframe 及事件属性）
- IPC 调用校验来源，目录读取限定在当前文档所在目录内

## 开发

```bash
npm install        # 安装依赖
npm run dev        # 开发模式（带热更新）
npm run build      # 类型检查 + 构建
npm test           # 单元测试
```

若 `npm install` 时 Electron 二进制下载失败（国内网络常见），改用镜像：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
node node_modules/electron/install.js
```

## 运行与打包

```bash
npx electron .                      # 运行构建产物（先 npm run build）
npx electron . path\to\note.md      # 直接打开指定文档
npm run pack                        # 打包为免安装目录（release/win-unpacked）
npm run dist                        # 打包 portable exe + NSIS 安装包（release/）
```

## 项目结构

```
src/
├── main/        # 主进程：窗口、IPC、文件读取、md-asset 协议
├── preload/     # contextBridge 暴露的窄 API
├── renderer/    # React 界面：渲染管线、侧栏、预览
└── shared/      # 主进程与渲染进程共享的类型和 IPC 通道
tests/           # 渲染管线单元测试（vitest + jsdom）
```

## 路线图

- [x] Phase 1：单文件 Markdown 阅读器
- [ ] Phase 2：文件夹工作区
- [ ] Phase 3：双栏编辑

详细规划见 [task.md](task.md)（开发规格书）。

## License

MIT
