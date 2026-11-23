# MD Viewer

轻量、本地优先的 Markdown 阅读与编辑工具，自建 Typora 替代方案。

基于 Electron + React + TypeScript 构建，专注本地文档的舒适读写体验：正确的编码处理、Typora 式的就地渲染编辑、柔和的三套配色主题。

## 下载

前往 [Releases](https://github.com/lee945/md-viewer/releases) 下载 Windows 版本：

- `MD-Viewer-x.x.x-portable.exe`——免安装，双击即用
- `MD-Viewer-x.x.x-setup.exe`——NSIS 安装包，可创建桌面与开始菜单快捷方式

> 未配置代码签名，首次运行时 Windows SmartScreen 可能提示"未知发布者"，选择"仍要运行"即可。

## 功能

### 编辑（Typora 式三模式）

- **即时渲染（默认，Ctrl+1）**：当前行显示 Markdown 源码标记，其余行隐藏标记直接呈现排版；任务列表勾选框可点击
- **所见即所得（Ctrl+2）**：标记恒隐藏，纯渲染态编辑
- **分屏预览（Ctrl+3）**：左侧源码 + 右侧实时预览，分隔条可拖拽调比例，双向滚动同步
- 基于 CodeMirror 6：撤销/重做、查找替换、自动补全、软换行
- 编辑器侧语法树大纲，随光标/滚动高亮当前标题，点击跳转

### 保存与文件

- **保留原始格式**：保存时沿用文件原有的编码（UTF-8 / UTF-8 BOM / UTF-16LE / UTF-16BE / GBK / GB18030）与换行符（LF / CRLF），逐字节无损
- **原子写**：临时文件 + rename，避免写到一半损坏
- **脏状态保护**：切换文件、关闭窗口时询问"保存 / 不保存 / 取消"
- **外部修改检测**：文件被其他程序改动或删除时顶部提示
- **文件变化监听**：目录内增删文件自动刷新文件树

### 阅读

- **Markdown 渲染**：GFM 表格、任务列表、脚注、内嵌 HTML（经安全清洗）；Shiki 语法高亮 + 代码块一键复制
- **编码探测**：UTF-8（BOM / 无 BOM）、UTF-16、GBK / GB18030，中文文档不乱码
- **本地图片**：通过 `md-asset` 自定义协议加载，限定在文档所在目录，点击放大
- **工作区**：打开文件夹作为工作区、最近文件 / 最近工作区；当前文件永远位于工作区内
- **侧栏双选项卡**：大纲（滚动跟随、点击跳转）/ 文件树（文件夹展开、点击即开）
- **阅读设置**：字号、字体（默认 / 宋体 / 楷体）、行距、内容宽度四组预设
- **阅读记忆**：按文件恢复滚动位置，顶部阅读进度条

### 主题

- 三套风格 × 深浅色：GitHub / Typora / Obsidian，代码高亮随风格与明暗联动切换

### 链接

- **Ctrl / Cmd + 左键**单击链接：内部锚点滚到对应标题，外部链接交给系统浏览器，相对路径 `.md` 在应用内打开
- 普通单击保持定位光标，不触发跳转

## 安全设计

- `contextIsolation` + `sandbox` + 禁用 `nodeIntegration`
- 渲染进程 CSP 限制资源加载，图片只允许 `self` / `data:` / `md-asset:`
- Markdown 输出经 DOMPurify 清洗（移除 script、style、iframe 及事件属性）
- IPC 调用校验来源与参数，目录访问限定在当前文档 / 工作区内

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

打包同样需要镜像环境变量：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
npm run dist
```

## 项目结构

```
src/
├── main/        # 主进程：窗口、菜单、IPC、文件读写、监听、md-asset 协议
├── preload/     # contextBridge 暴露的窄 API
├── renderer/    # React 界面：编辑器、预览、侧栏、主题、渲染管线
└── shared/      # 主进程与渲染进程共享的类型、IPC 通道、主题与阅读设置
tests/           # 渲染管线与文件读写单元测试（vitest + jsdom）
```

## 路线图

- [x] Phase 1：单文件 Markdown 阅读器
- [x] Phase 2：文件夹工作区、阅读体验、主题系统、文件变化监听
- [x] Phase 3：Markdown 编辑器（三模式 + 分屏滚动同步 + 编码无损保存）
- [ ] 后续：图片拖拽入稿、保存冲突细化等

详细规划见 [task.md](task.md)（开发规格书）。

## License

MIT
