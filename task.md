# Markdown 桌面阅读与编辑器开发规格书（V2）

> 项目定位：轻量、本地优先的 Markdown 阅读与编辑工具
>
> 技术栈：Electron + Vite + React + TypeScript
>
> 开发路线：Markdown Viewer → Workspace → Editor → 完整桌面应用
>
> 首期目标：3 天内完成可实际使用的 Markdown Viewer。

# 一、项目目标

开发一款类似 Typora 的 Markdown 桌面应用，主要用于阅读技术文档、项目 README、CLAUDE.md、CTF 笔记和日常 Markdown 文件。

## 1.1 核心定位

- 轻量：不追求复杂的知识库管理功能。
- 本地优先：文件保存在用户本地，不依赖云端。
- 阅读优先：优先保证 Markdown 文档阅读体验。
- 易扩展：为后续源码编辑、实时预览和文件管理预留架构。

## 1.2 最终产品目标

1. 支持本地 Markdown 文件打开与阅读。
2. 支持 GFM 和常见 Markdown 扩展语法。
3. 支持代码高亮和本地图片。
4. 支持文件夹工作区、目录树和文档大纲。
5. 支持跨文档链接及章节定位。
6. 支持双栏源码编辑与实时预览。
7. 支持文件保存、外部修改检测和冲突处理。
8. 支持 Windows 安装包和便携版。

## 1.3 开发原则

- 先完成可用的 Viewer，不一开始就挑战 Typora 式输入即渲染。
- 主进程、Preload、Renderer 职责分离。
- 文件操作统一由主进程处理。
- Markdown 解析、代码高亮、文件管理独立封装。
- 每个阶段完成后进行实际使用和验收。
- 不为了未来可能出现的功能过度设计。

# 二、技术选型

| 技术            | 选择             | 用途             |
| --------------- | ---------------- | ---------------- |
| 桌面框架        | Electron         | 桌面运行环境     |
| 构建工具        | Vite             | 开发和构建       |
| 前端框架        | React            | UI 组件开发      |
| 开发语言        | TypeScript       | 类型安全         |
| Markdown 解析   | markdown-it      | Markdown 转 HTML |
| Markdown 编辑器 | CodeMirror 6     | 后续源码编辑     |
| 代码高亮        | Shiki            | 代码块高亮       |
| HTML 安全       | DOMPurify        | HTML 安全净化    |
| 状态管理        | Zustand          | 全局状态管理     |
| 样式方案        | CSS Variables    | 主题和样式管理   |
| 应用打包        | electron-builder | Windows 安装包   |

## 2.1 技术选择说明

### Electron

负责桌面应用运行、窗口管理、系统菜单、文件操作、文件关联和托盘等功能。

采用 Electron 而非 Tauri，主要考虑：

- 当前开发环境以 Node.js 为主。
- 不需要额外搭建 Rust/MSVC 构建环境。
- 本地文件处理能力完善。
- 前端开发和调试方便。
- 生态成熟，便于后续扩展。

### React + TypeScript

负责渲染进程 UI，采用组件化方式组织界面。

### markdown-it

负责 Markdown 解析，使用插件扩展 GFM、脚注等功能。

### Shiki

负责代码高亮。

采用按需加载语言的方式，避免将全部语言语法包打入首屏资源。

### DOMPurify

负责对最终生成的 HTML 进行安全净化。

### CodeMirror 6

第二阶段之后引入，负责 Markdown 源码编辑。

第一版不实现复杂的所见即所得编辑模式。

# 三、核心架构设计

## 3.1 三层架构

```
┌──────────────────────────────────────┐
│              Electron                │
│                                      │
│  ┌────────────────────────────────┐  │
│  │           Main                 │  │
│  │                                │  │
│  │  文件管理 / IPC / 窗口管理      │  │
│  │  工作区管理 / 文件监听          │  │
│  └────────────────────────────────┘  │
│                  │                   │
│             Preload API              │
│                  │                   │
│  ┌────────────────────────────────┐  │
│  │          Renderer              │  │
│  │                                │  │
│  │  React UI                      │  │
│  │  Markdown Preview              │  │
│  │  CodeMirror Editor             │  │
│  │  Sidebar / Outline             │  │
│  │                                │  │
│  │  Markdown Rendering            │  │
│  │  ├── markdown-it               │  │
│  │  ├── Shiki                     │  │
│  │  └── DOMPurify                 │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

## 3.2 文件操作原则

所有文件操作由 Electron Main 负责。

Renderer 不直接访问 Node.js API，而是通过 Preload 暴露的有限接口调用 IPC。

示例：

```
interface DesktopAPI {
  openFile(): Promise<FileInfo | null>;

  readFile(path: string): Promise<FileContent>;

  saveFile(
    path: string,
    content: string
  ): Promise<boolean>;

  readDirectory(path: string): Promise<FileNode[]>;

  watchFile(path: string): Promise<void>;

  stopWatching(path: string): Promise<void>;
}
```

具体接口以实际业务为准。

要求：

- 不暴露完整 fs 模块。
- 不允许 Renderer 任意执行 Node.js 操作。
- IPC 使用固定通道白名单。
- 主进程验证路径、参数类型和调用来源。
- 文件操作错误需要返回明确的错误信息。

## 3.3 共享类型

Main、Preload、Renderer 使用同一份共享类型定义。

建议在脚手架提供的源码结构中建立：

```
shared/
├── types.ts
├── ipc.ts
└── constants.ts
```

示例：

```
export interface FileInfo {
  path: string;
  name: string;
  extension: string;
}

export interface FileContent {
  content: string;
  encoding: string;
  lineEnding: "LF" | "CRLF";
  hasBOM: boolean;
}

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
}
```

IPC 通道名称、请求参数和返回值应有单一来源，避免三层代码重复定义。

# 四、Markdown 渲染架构

## 4.1 渲染流程

```
Markdown 文件
      │
      ▼
读取文件内容
      │
      ▼
markdown-it 解析
      │
      ▼
Token 插件处理
      │
      ├── GFM
      ├── 脚注
      ├── 代码高亮
      ├── 图片路径
      └── 源码行号映射
      │
      ▼
生成 HTML
      │
      ▼
DOMPurify 安全净化
      │
      ▼
Markdown Preview
```

## 4.2 Markdown 功能

支持：

- 标题 H1-H6。
- 段落。
- 粗体和斜体。
- 删除线。
- 有序列表和无序列表。
- 引用块。
- 水平分割线。
- 链接。
- 图片。
- 表格。
- 任务列表。
- 脚注。
- 行内代码。
- 代码块。

## 4.3 代码高亮

采用 Shiki。

要求：

- 使用可按需加载语言的入口。
- 优先加载常见语言。
- 其他语言通过动态导入加载。
- 高亮器实例复用。
- 避免每次输入都重新初始化。
- 支持深色和浅色主题。
- 未指定语言时降级为普通代码显示。
- 高亮任务不得阻塞主交互线程。

## 4.4 HTML 安全处理

建议统一采用：

1. markdown-it 解析 Markdown。
2. Shiki 完成代码高亮。
3. DOMPurify 净化最终 HTML。
4. 将净化后的 HTML 插入预览区域。

需要明确配置 DOMPurify：

- 只放行必要的 HTML 标签和属性。
- 对 style 属性采用受控白名单策略。
- 保留 Shiki 生成的必要代码高亮样式。
- 禁止危险 URL 协议。
- 限制 iframe、script 等危险元素。
- 不信任用户 Markdown 中的原始 HTML。

如果未来采用独立 CSS class 的高亮方案，可以减少对内联 style 的依赖。

# 五、本地文件与资源处理

## 5.1 文件编码

不能仅支持 UTF-8。

需要考虑：

- UTF-8。
- UTF-8 BOM。
- UTF-16 LE / BE。
- GBK。
- GB18030。

建议采用 BOM 检测、编码探测和必要的人工指定相结合的方式。

可以评估 `chardet` 等编码检测库，但不能将启发式检测结果视为绝对准确。

打开文件时记录原始文件元信息：

```
interface DocumentMetadata {
  path: string;
  encoding: string;
  lineEnding: "LF" | "CRLF";
  hasBOM: boolean;
}
```

保存文件时：

- 尽可能保留原编码。
- 尽可能保留原换行符。
- 尽可能保留 BOM 状态。
- 不要因为修改少量文字就改变整份文件的编码格式。

## 5.2 本地图片路径

例如：

```
![图片](./assets/demo.png)
```

图片相对路径应基于当前 Markdown 文件所在目录解析。

不建议简单拼接未经校验的 `file://` 路径。

采用 Electron 自定义资源协议：

```
protocol.handle("md-asset", handler);
```

资源访问规则：

1. 只允许读取当前授权工作区内的资源。
2. 将资源路径规范化。
3. 使用 `path.relative()` 检查访问路径。
4. 拒绝 `..` 路径穿越。
5. 拒绝访问未授权目录。
6. 对符号链接进行额外校验，避免绕过工作区限制。
7. 不允许通过资源协议读取任意本地文件。

注意：需要在窗口加载前完成协议注册，并按照 Electron 当前版本的协议处理要求配置安全特性。

## 5.3 跨文档链接

必须支持 Markdown 文件之间的相对链接。

例如：

```
[查看附录](./appendix.md)

[查看指定章节](./appendix.md#installation)
```

要求：

- 点击其他 Markdown 文件时在应用内打开。
- 不默认交给外部浏览器。
- 支持相对路径解析。
- 支持标题锚点定位。
- 支持中文文件名和中文标题。
- 防止路径穿越。
- 对外部 HTTP/HTTPS 链接使用系统浏览器打开。
- 对不受支持的协议进行拦截。

# 六、开发阶段规划

## Phase 0：项目初始化

目标：建立稳定的 Electron 开发环境。

### 开发任务

- 使用 Electron + Vite + React + TypeScript 脚手架创建项目。
- 熟悉实际生成的 Main、Preload、Renderer 结构。
- 配置 IPC 通信。
- 建立共享类型定义。
- 配置开发环境和 HMR。
- 配置 Electron DevTools。
- 配置基础窗口。
- 建立基础样式和主题变量。

### 安全基线

```
webPreferences: {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true
}
```

其他要求：

- 配置 CSP。
- 限制导航。
- 限制新窗口创建。
- 不暴露完整 Node.js API。
- 不允许 Preload 直接使用 fs。
- 文件操作全部通过 IPC 转发。
- 对 IPC 参数进行验证。

特别注意：

`sandbox: true` 时，Preload 运行在受限环境中，不能像普通 Node.js 模块一样直接调用 `require("fs")`。

文件系统操作必须由 Main 处理。

### 验收标准

- 应用正常启动。
- Vite HMR 正常。
- Preload 可以正常暴露 API。
- Renderer 能够调用 IPC。
- 安全配置生效。
- 可以读取指定文件。

## Phase 1：Markdown Viewer

目标：三天内完成第一个可实际使用的 Markdown 阅读器。

第一阶段严格控制范围，不提前实现复杂的阅读设置和文件管理功能。

### 1. 文件打开

- 通过菜单打开文件。
- 支持 Ctrl + O。
- 支持拖拽 Markdown 文件进入窗口。
- 支持命令行参数打开文件。
- 支持常见编码识别。
- 支持 UTF-8、GBK、GB18030。
- 支持文件打开失败提示。

### 2. Markdown 渲染

- 标题。
- 段落。
- 粗体和斜体。
- 删除线。
- 列表。
- 引用块。
- 链接。
- 图片。
- 表格。
- 任务列表。
- 脚注。
- 行内代码。
- 代码块。

### 3. 代码高亮

- 集成 Shiki。
- 常见语言按需加载。
- 代码块复制。
- 深色代码主题。
- 浅色代码主题。

### 4. 本地图片

- 图片相对路径解析。
- 自定义资源协议。
- 工作区路径限制。
- 图片加载失败提示。

### 5. 基础阅读界面

- Markdown 内容居中显示。
- 深色主题。
- 浅色主题。
- 基础标题层级样式。
- 基础代码块样式。

### 6. 文档大纲

- 自动提取标题。
- 显示 H1-H6 层级。
- 点击标题跳转。
- 滚动位置联动。
- 当前章节高亮。

### 第一阶段不做

- 字体选择。
- 字号调整。
- 行间距调节。
- 内容宽度自定义。
- 阅读进度条。
- 图片复杂预览。
- 文件夹工作区。
- CodeMirror 编辑器。
- 多标签页。

### 验收标准

- 可以打开电脑中的 Markdown 文件。
- 常见 GFM 语法渲染正常。
- 中文内容没有乱码。
- 本地图片正常显示。
- 代码高亮正常。
- 深浅色切换正常。
- 大纲导航正常。
- 能够稳定阅读自己的 README.md、CLAUDE.md 和 CTF 笔记。

## Phase 2：Workspace

目标：从单文件阅读器扩展为文件夹工作区。

### 2.1 工作区管理

- 打开文件夹作为工作区。
- 左侧目录树。
- 文件夹展开和折叠。
- 子目录懒加载。
- 默认展示 Markdown 文件。
- 支持刷新目录。
- 支持文件切换。
- 支持最近打开文件。
- 支持最近打开工作区。

### 2.2 阅读体验

- 字号调节。
- 字体选择。
- 行间距调节。
- 内容宽度调节。
- 图片点击放大。
- 表格横向滚动。
- 阅读进度条。
- 代码块复制按钮。
- 阅读位置恢复。

### 2.3 主题系统

定义统一主题接口：

```
interface MarkdownTheme {
  name: string;
  colorScheme: "light" | "dark";

  background: string;
  foreground: string;
  accent: string;

  fontFamily: string;
  codeFontFamily: string;

  contentWidth: string;
  lineHeight: number;
}
```

预留以下主题：

- GitHub 风格。
- Typora 风格。
- Obsidian 风格。
- 自定义 CSS 主题。

代码高亮主题需要与界面明暗主题保持一致。

### 2.4 文件变化监听

- 监听当前打开文件。
- 文件外部修改后提示刷新。
- 监听目录变化。
- 目录树自动更新。
- 监听事件防抖。
- 避免重复注册监听器。

不要默认递归监听整个磁盘。

### 验收标准

- 可以打开完整文件夹。
- 目录树正常浏览。
- 文件切换正常。
- 最近打开记录正常。
- 阅读设置正常。
- 文件外部变化可以正确检测。

## Phase 3：Markdown Editor

目标：增加源码编辑和双栏实时预览。

### 3.1 CodeMirror 6

- 集成 CodeMirror 6。
- Markdown 语法高亮。
- 行号。
- 自动缩进。
- 常用快捷键。
- 撤销和重做。
- 查找和替换。

### 3.2 双栏布局

```
┌───────────────────────────────────────┐
│                Toolbar                │
├──────────────────┬────────────────────┤
│                  │                    │
│ Markdown Source  │ Markdown Preview   │
│                  │                    │
│ # Title          │ Title              │
│                  │                    │
│ **Hello**        │ Hello              │
│                  │                    │
└──────────────────┴────────────────────┘
```

- 左侧源码编辑。
- 右侧实时预览。
- 编辑后实时更新。
- 两栏宽度可调。
- 支持单栏阅读模式。

### 3.3 滚动同步

采用源码行号与预览 DOM 节点映射。

```
interface MarkdownBlock {
  startLine: number;
  endLine: number;
  elementId: string;
}
```

markdown-it Token 的 `map` 属性可以用于记录块级元素对应的源码行范围。

要求：

- 源码滚动带动预览。
- 预览滚动带动源码。
- 防止双向同步循环。
- 考虑图片加载后的布局变化。
- 考虑长代码块和表格。
- 不采用简单百分比映射。

### 3.4 保存功能

- Ctrl + S 保存。
- 脏状态标记。
- 标题栏显示未保存标识。
- 切换文件时提示未保存内容。
- 关闭窗口时提示未保存内容。
- 保存时保留原编码。
- 保存时保留原换行符。
- 使用原子写入。

### 3.5 外部修改冲突

文件监听发现外部修改后：

1. 检查当前文件是否存在未保存修改。
2. 对比磁盘文件和编辑器状态。
3. 如果没有本地修改，可以提示重新加载。
4. 如果有本地修改，提供重新加载和保留当前内容的选择。
5. 不允许静默覆盖。

### 3.6 图片拖拽

- 支持图片拖入编辑器。
- 自动复制图片到 assets 目录。
- 自动生成相对路径。
- 自动插入 Markdown 图片语法。

### 验收标准

- 可以正常编辑 Markdown。
- 预览实时更新。
- 滚动同步基本准确。
- 文件保存正确。
- 原编码和换行符得到保留。
- 外部修改不会导致内容丢失。
- 图片拖拽正常。

## Phase 4：增强功能

### 4.1 搜索

- 当前文档 Ctrl + F。
- 查找和替换。
- 工作区全文搜索。
- 搜索结果定位。
- 搜索关键词高亮。

### 4.2 文件管理

- 最近打开文件。
- 最近打开工作区。
- 会话恢复。
- 多标签页。
- 文件树刷新。
- 文件和文件夹基础操作。

### 4.3 文件关联

- Windows Markdown 文件关联。
- 双击 .md 文件打开。
- 单实例运行。
- 文件参数转发到已有窗口。

### 4.4 导出

- 导出 HTML。
- 导出 PDF。
- 保留代码高亮。
- 保留图片。
- 打印样式优化。

PDF 使用 Electron `printToPDF`。

### 4.5 高级 Markdown

- Mermaid 图表。
- KaTeX 数学公式。
- 自定义 CSS。
- Markdown 插件扩展。

## Phase 5：打包与发布

目标：生成可以独立运行的 Windows 应用。

### 开发任务

- 配置 electron-builder。
- 生成 Windows NSIS 安装包。
- 生成绿色便携版。
- 设置应用名称。
- 设置应用图标。
- 设置版本号。
- 测试安装和卸载。
- 测试文件关联。
- 测试单实例。
- 测试不同 Windows 环境。

### 可选功能

- 自动更新。
- electron-updater。
- 版本更新提示。
- 更新日志。

### 最终验收

- 不依赖开发环境运行。
- 不需要单独安装 Node.js。
- Markdown 文件关联正常。
- 本地文件访问正常。
- 安装包正常安装和卸载。
- 绿色便携版可以独立运行。

# 七、性能与质量要求

性能指标需要在明确的测试环境和测试文档上测量，不能仅凭主观感受验收。

## 7.1 首期性能基线

| 测试项目                     | 目标                 |
| ---------------------------- | -------------------- |
| 1MB 纯文本 Markdown 首屏渲染 | 小于 500ms           |
| 常见 Markdown 语法解析       | 无明显卡顿           |
| 代码高亮                     | 按需加载，不阻塞交互 |
| 文档滚动                     | 目标 60 FPS          |
| 目录树                       | 懒加载               |
| 图片加载                     | 不阻塞文本首屏显示   |
| 文件打开                     | 有明确加载状态       |

注：

- 首屏时间从文件内容读取完成到主要文档内容可见计算。
- Shiki 首次加载时间单独统计。
- 图片下载和解码单独统计。
- 滚动帧率在固定测试设备上测量。
- 复杂文档和大量代码块应单独建立压力测试样本。

## 7.2 测试样本

建议建立专门的 Markdown 测试目录：

```
test-documents/
├── basic.md
├── chinese.md
├── gbk.md
├── gfm.md
├── code-highlight.md
├── images.md
├── links.md
├── long-document.md
└── large-document.md
```

测试内容应覆盖：

- 中文内容。
- 不同文件编码。
- 多级标题。
- 表格。
- 任务列表。
- 多语言代码块。
- 本地图片。
- 跨文档链接。
- 长文档。
- 大文件。

# 八、第二版可选功能

以下功能不纳入第一版开发范围。

| 功能         | 技术方向                 |
| ------------ | ------------------------ |
| 输入即渲染   | CodeMirror 6 Decorations |
| Mermaid      | Mermaid.js               |
| 数学公式     | KaTeX                    |
| 多标签页     | React 状态管理           |
| 自定义 CSS   | CSS 动态加载             |
| 插件系统     | 插件接口                 |
| 图片粘贴     | Clipboard API            |
| 自动保存     | 文件服务层               |
| 高级表格编辑 | CodeMirror 扩展          |

特别说明：

Typora 式输入即渲染是复杂功能，涉及：

- 编辑器状态。
- 光标定位。
- 选区管理。
- Markdown 语法解析。
- DOM 映射。
- 实时渲染性能。

不建议第一版实现。

# 九、项目开发约束

1. 第一阶段只实现 Viewer，不擅自增加编辑器功能。
2. 每个 Phase 完成后先验收，再进入下一阶段。
3. 不允许 Renderer 直接访问 Node.js 文件系统。
4. 不允许向 Renderer 暴露完整 fs API。
5. 不允许未经校验地读取本地文件。
6. 不允许静默覆盖外部修改。
7. 不允许忽略原文件编码和换行符。
8. 不允许使用不安全的 HTML 渲染方式。
9. 不允许为了增加功能而牺牲基础阅读性能。
10. 所有跨进程数据结构必须使用共享类型。

# 十、第一阶段实际执行清单

正式开始开发时，只执行以下任务：

## Day 1：项目初始化与文件读取

- 创建 Electron + Vite + React + TypeScript 项目。
- 熟悉脚手架目录结构。
- 配置 Main、Preload、Renderer。
- 建立共享类型。
- 建立 IPC 通信。
- 实现文件选择。
- 实现文件读取。
- 实现基础 Markdown 页面。

## Day 2：Markdown 渲染

- 集成 markdown-it。
- 支持 GFM。
- 集成 Shiki。
- 集成 DOMPurify。
- 实现代码块复制。
- 实现本地图片相对路径。
- 完成深色和浅色主题。

## Day 3：大纲与测试

- 实现文档大纲。
- 实现标题跳转。
- 实现滚动联动。
- 测试中文文件。
- 测试 GBK / GB18030 文件。
- 测试代码块。
- 测试本地图片。
- 测试较长 Markdown 文档。
- 修复主要问题。

## 第一阶段最终目标

制作出一个能够独立运行的 Windows Markdown Viewer。

能够打开本地 Markdown 文件，正确渲染文字、标题、列表、表格、代码块和本地图片，并且拥有基本的大纲导航和深浅色主题。

完成后立即用自己的 README.md、CLAUDE.md 和 CTF 笔记进行日常使用。

# 十一、最终产品愿景

打造一款轻量、快速、本地优先的 Markdown 阅读与编辑工具。

不追求成为复杂的知识管理系统，也不急于完整复刻 Typora。

第一步做好 Markdown 阅读体验，第二步做好文件管理，第三步做好源码编辑和实时预览。

最终开发路线：

**Markdown Viewer → Markdown Workspace → Markdown Editor → 完整桌面应用。**

核心原则：

**先做一个自己每天愿意使用的 Markdown 阅读器，再逐步把它变成编辑器。**