# Markdown 桌面阅读与编辑器开发方案

> 项目定位：基于 Electron 的轻量级、本地优先 Markdown 阅读与编辑工具
> 技术栈：Electron + Vite + React + TypeScript
> 开发策略：先实现 Markdown Viewer，再逐步扩展为双栏编辑器，暂不挑战 Typora 式输入即渲染。

## 一、项目目标

开发一款类似 Typora 的 Markdown 桌面应用，主要面向技术文档、项目 README、开发笔记和 Markdown 文件的阅读与编辑。

### 核心目标

1. 支持本地 Markdown 文件打开和阅读。
2. 支持 Markdown 常见语法及 GFM 扩展。
3. 支持代码高亮、图片显示和相对路径解析。
4. 支持文件夹工作区、目录树和文档大纲。
5. 提供简洁、舒适的阅读体验。
6. 后续扩展双栏编辑、文件管理和导出能力。

### 产品定位

- 轻量：不追求复杂的知识库管理功能。
- 本地优先：文件保存在用户本地，不依赖云端。
- 阅读优先：优先保证 Markdown 文档的阅读体验。
- 易扩展：为后续编辑器、插件和主题系统预留架构。

## 二、技术选型

| 技术            | 选择                | 用途                   |
| --------------- | ------------------- | ---------------------- |
| 桌面框架        | Electron            | 桌面应用及本地文件访问 |
| 构建工具        | Vite                | 开发环境和构建         |
| 前端框架        | React               | UI 组件开发            |
| 开发语言        | TypeScript          | 类型安全               |
| Markdown 编辑器 | CodeMirror 6        | 后续源码编辑           |
| Markdown 解析   | markdown-it         | Markdown 转 HTML       |
| 代码高亮        | Shiki               | 代码块语法高亮         |
| HTML 安全       | DOMPurify           | HTML 内容净化          |
| 状态管理        | Zustand             | 全局状态管理           |
| 样式方案        | CSS / CSS Variables | 主题和界面样式         |
| 应用打包        | electron-builder    | Windows 安装包及便携版 |

### 技术选型说明

**Electron**

负责桌面应用运行、窗口管理、系统菜单、文件操作、文件关联和托盘等功能。

**React + TypeScript**

负责渲染进程 UI 开发，采用组件化结构组织侧边栏、预览区、编辑器和工具栏。

**CodeMirror 6**

用于后续实现 Markdown 源码编辑。第一版不引入复杂的所见即所得编辑模式。

**markdown-it**

负责 Markdown 解析，通过插件扩展 GFM、脚注等语法。

**Shiki**

负责代码块高亮，采用复用的高亮实例，避免每次渲染重复初始化。

**DOMPurify**

对最终生成的 HTML 进行安全净化，防止不可信 Markdown 中的恶意 HTML 执行。

## 三、项目目录结构

建议采用主进程、预加载脚本、渲染进程三层架构。

```
markdown-desktop/
│
├── electron/
│   ├── main/
│   │   ├── index.ts
│   │   ├── ipc/
│   │   │   ├── file.ipc.ts
│   │   │   ├── window.ipc.ts
│   │   │   └── system.ipc.ts
│   │   │
│   │   └── services/
│   │       ├── file.service.ts
│   │       ├── workspace.service.ts
│   │       └── watcher.service.ts
│   │
│   └── preload/
│       └── index.ts
│
├── src/
│   ├── components/
│   │   ├── layout/
│   │   ├── sidebar/
│   │   ├── editor/
│   │   ├── preview/
│   │   └── toolbar/
│   │
│   ├── editor/
│   │   └── codemirror/
│   │
│   ├── markdown/
│   │   ├── parser.ts
│   │   ├── renderer.ts
│   │   ├── plugins.ts
│   │   └── highlighter.ts
│   │
│   ├── stores/
│   │   ├── app.store.ts
│   │   ├── editor.store.ts
│   │   └── workspace.store.ts
│   │
│   ├── hooks/
│   ├── services/
│   ├── themes/
│   ├── styles/
│   ├── types/
│   ├── utils/
│   ├── App.tsx
│   └── main.tsx
│
├── public/
├── package.json
├── tsconfig.json
└── vite.config.ts
```

说明：具体目录以所选 Electron + Vite 脚手架实际生成结构为准，不需要为了完全匹配上述目录而强行修改脚手架。

## 四、核心架构设计

### 4.1 应用整体架构

```
┌─────────────────────────────────────────┐
│               Electron                  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │             Main                  │  │
│  │                                   │  │
│  │  文件管理 / 窗口管理 / IPC         │  │
│  │  工作区管理 / 文件监听             │  │
│  └───────────────────────────────────┘  │
│                    │                    │
│              Preload API                │
│                    │                    │
│  ┌───────────────────────────────────┐  │
│  │            Renderer               │  │
│  │                                   │  │
│  │  React UI                         │  │
│  │  ├── Sidebar                      │  │
│  │  ├── Markdown Preview              │  │
│  │  ├── CodeMirror Editor             │  │
│  │  ├── Outline                      │  │
│  │  └── Toolbar                      │  │
│  │                                   │  │
│  │  Markdown Rendering Pipeline      │  │
│  │  ├── markdown-it                  │  │
│  │  ├── Shiki                        │  │
│  │  └── DOMPurify                    │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### 4.2 文件操作架构

所有文件操作由 Electron 主进程负责。

Renderer 不直接访问 Node.js API，而是通过 Preload 暴露的有限接口调用 IPC。

建议接口：

```
interface DesktopAPI {
  openFile(): Promise<FileInfo | null>;

  readFile(path: string): Promise<string>;

  saveFile(
    path: string,
    content: string
  ): Promise<boolean>;

  readDirectory(path: string): Promise<FileNode[]>;

  watchFile(path: string): Promise<void>;

  stopWatching(path: string): Promise<void>;
}
```

实际实现需要在主进程进行参数校验、路径授权和调用来源检查。

### 4.3 Markdown 渲染流程

```
Markdown 文件
      │
      ▼
读取 Markdown 内容
      │
      ▼
markdown-it 解析
      │
      ▼
插件处理
      │
      ├── GFM
      ├── 脚注
      ├── 代码高亮
      ├── 数学公式（后续）
      └── 图片路径处理
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

注意：

- 图片相对路径必须基于当前 Markdown 文件所在目录解析。
- 图片资源访问需要受控，防止路径穿越。
- 禁止不安全的外部协议。
- 原始 HTML 是否支持需要明确配置。
- Shiki 应复用高亮器实例，并考虑异步处理和缓存。

# 五、开发阶段规划

## Phase 0：项目初始化

目标：搭建可运行的 Electron + React 开发环境。

### 开发任务

- 

  创建 Electron + Vite + React + TypeScript 项目。

- 

  配置主进程、Preload、Renderer。

- 

  配置 TypeScript。

- 

  配置 Vite HMR。

- 

  配置 ESLint。

- 

  建立 IPC 通信。

- 

  建立基础窗口。

- 

  配置开发环境 DevTools。

- 

  建立基础项目目录结构。

### 安全配置

```
webPreferences: {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true
}
```

其他要求：

- 启用 webSecurity。
- 配置合理的 CSP。
- 不向 Renderer 暴露完整 Node.js API。
- IPC 使用明确的白名单接口。
- 限制文件访问范围。

### 验收标准

- 

  应用能够正常启动。

- 

  Vite HMR 正常。

- 

  DevTools 可以正常打开。

- 

  Renderer 可以通过 Preload 调用 IPC。

- 

  文件读取接口能够正常工作。

## Phase 1：Markdown 阅读器

目标：完成第一个真正可用的 Markdown Viewer。

### 1. 文件打开

- 

  通过菜单打开文件。

- 

  支持 Ctrl + O。

- 

  支持拖拽 Markdown 文件进入窗口。

- 

  支持通过命令行参数打开文件。

- 

  支持 UTF-8 文件读取。

- 

  支持文件打开失败提示。

### 2. Markdown 渲染

- 

  标题 H1-H6。

- 

  段落和换行。

- 

  粗体和斜体。

- 

  删除线。

- 

  无序列表。

- 

  有序列表。

- 

  引用块。

- 

  水平分割线。

- 

  链接。

- 

  图片。

- 

  表格。

- 

  任务列表。

- 

  脚注。

- 

  行内代码。

- 

  代码块。

### 3. 代码高亮

- 

  集成 Shiki。

- 

  支持常见编程语言。

- 

  支持代码块复制。

- 

  支持深色和浅色代码主题。

- 

  未指定语言时提供合理的降级显示。

### 4. 图片处理

- 

  支持本地图片。

- 

  支持相对路径。

- 

  支持绝对路径的合理处理。

- 

  图片加载失败提示。

- 

  图片点击放大。

- 

  限制本地资源访问范围。

### 5. 阅读界面

- 

  深色主题。

- 

  浅色主题。

- 

  字体大小调节。

- 

  内容宽度调节。

- 

  行间距调节。

- 

  阅读进度条。

### 6. 文档大纲

- 

  自动提取标题。

- 

  支持 H1-H6 层级。

- 

  点击标题跳转。

- 

  滚动位置联动。

- 

  当前阅读章节高亮。

### 验收标准

- 

  可以打开常见 Markdown 文档。

- 

  GFM 常用语法渲染正确。

- 

  本地图片能够正常显示。

- 

  代码块高亮正确。

- 

  大纲跳转正常。

- 

  深浅色切换正常。

- 

  能够稳定阅读较长的技术文档。

## Phase 2：文件管理与阅读体验

目标：从单文件 Viewer 扩展为工作区阅读工具。

### 1. 工作区管理

- 

  打开文件夹作为工作区。

- 

  左侧文件目录树。

- 

  文件夹展开和折叠。

- 

  懒加载子目录。

- 

  默认显示 Markdown 文件。

- 

  支持刷新目录。

- 

  支持文件切换。

- 

  支持最近打开文件。

### 2. 阅读体验优化

- 

  代码块复制按钮。

- 

  图片放大预览。

- 

  表格横向滚动。

- 

  阅读宽度调整。

- 

  字体选择。

- 

  字号调整。

- 

  行间距调整。

- 

  标题样式优化。

- 

  目录平滑跳转。

- 

  阅读进度显示。

### 3. 主题系统

设计统一的主题配置：

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

后续可扩展：

- GitHub 风格。
- Typora 风格。
- Obsidian 风格。
- 自定义 CSS 主题。

### 验收标准

- 

  能够打开一个完整文件夹。

- 

  目录树可以正常浏览。

- 

  可以快速切换 Markdown 文件。

- 

  阅读设置能够正常调整。

- 

  主题切换后样式保持一致。

## Phase 3：双栏编辑器

目标：增加 Markdown 源码编辑能力。

### 1. CodeMirror 6 集成

- 

  集成 CodeMirror 6。

- 

  支持 Markdown 语法高亮。

- 

  支持自动缩进。

- 

  支持常用快捷键。

- 

  支持行号。

- 

  支持撤销和重做。

- 

  支持查找和替换。

### 2. 双栏布局

```
┌─────────────────────────────────────────┐
│                Toolbar                  │
├───────────────────┬─────────────────────┤
│                   │                     │
│   Markdown Source │   Markdown Preview  │
│                   │                     │
│   # Title         │   Title             │
│                   │                     │
│   **Hello**       │   Hello             │
│                   │                     │
│   ```python       │   Code Block        │
│                   │                     │
└───────────────────┴─────────────────────┘
```

- 

  左侧源码编辑。

- 

  右侧实时预览。

- 

  编辑内容变化后更新预览。

- 

  支持调整两栏宽度。

- 

  支持单栏阅读模式。

### 3. 滚动同步

采用 Markdown 源码行号与预览 DOM 节点映射。

```
interface MarkdownBlock {
  startLine: number;
  endLine: number;
  elementId: string;
}
```

渲染后的块级元素保留源码行号信息。

实现要求：

- 

  源码滚动带动预览。

- 

  预览滚动带动源码。

- 

  避免双向滚动循环。

- 

  考虑图片加载后的布局变化。

- 

  考虑长代码块和表格。

- 

  不采用简单百分比映射。

### 4. 文件保存

- 

  Ctrl + S 保存。

- 

  编辑状态标记。

- 

  标题栏显示未保存标识。

- 

  切换文件时提示未保存内容。

- 

  关闭窗口时提示未保存内容。

- 

  外部文件修改检测。

- 

  文件冲突处理。

- 

  原子写入，避免异常中断导致文件损坏。

### 5. 图片拖拽

- 

  支持图片拖入编辑器。

- 

  自动复制图片到 assets 目录。

- 

  自动生成相对路径。

- 

  自动插入 Markdown 图片语法。

### 验收标准

- 

  可以正常编辑 Markdown。

- 

  预览能够实时更新。

- 

  滚动同步基本准确。

- 

  保存后文件内容正确。

- 

  外部修改不会静默覆盖用户编辑内容。

- 

  图片拖拽插入正常。

## Phase 4：体验增强

### 1. 搜索

- 

  当前文档 Ctrl + F。

- 

  当前文档查找和替换。

- 

  工作区全文搜索。

- 

  搜索结果定位。

- 

  搜索关键词高亮。

### 2. 最近打开和会话恢复

- 

  最近打开文件列表。

- 

  最近打开工作区。

- 

  恢复上次打开状态。

- 

  恢复侧边栏状态。

- 

  记住阅读位置。

### 3. 文件关联

- 

  注册 Windows Markdown 文件关联。

- 

  支持双击 .md 文件打开。

- 

  支持单实例运行。

- 

  新文件通过 IPC 转发到已有窗口。

### 4. 导出

- 

  导出 HTML。

- 

  导出 PDF。

- 

  支持保留代码高亮。

- 

  支持保留图片。

- 

  支持打印样式。

PDF 优先使用 Electron 的 printToPDF。

### 5. 表格辅助

- 

  Tab 自动跳转下一个单元格。

- 

  支持自动补全表格分隔行。

- 

  支持表格对齐。

- 

  支持插入表格。

## Phase 5：打包与分发

目标：生成可以在 Windows 上独立运行的桌面应用。

### 开发任务

- 

  配置 electron-builder。

- 

  生成 Windows NSIS 安装包。

- 

  生成绿色便携版。

- 

  设置应用名称。

- 

  设置应用图标。

- 

  设置应用版本号。

- 

  配置应用元信息。

- 

  测试安装和卸载。

- 

  测试文件关联。

- 

  测试单实例。

- 

  测试不同 Windows 环境。

### 可选功能

- 

  自动更新 electron-updater。

- 

  版本更新提示。

- 

  更新日志。

### 最终验收

- 

  不依赖开发环境运行。

- 

  不需要单独安装 Node.js。

- 

  Markdown 文件关联正常。

- 

  本地文件访问正常。

- 

  安装包可以正常安装和卸载。

- 

  便携版能够独立运行。

## 六、第二版可选功能

以下功能不纳入第一版开发范围，待基础功能稳定后再考虑。

| 功能              | 技术方向                 | 优先级 |
| ----------------- | ------------------------ | ------ |
| 输入即渲染        | CodeMirror 6 Decorations | 低     |
| Mermaid 图表      | Mermaid.js               | 中     |
| 数学公式          | KaTeX                    | 中     |
| 多标签页          | React 状态管理           | 中     |
| 自定义 CSS        | CSS 动态加载             | 中     |
| Markdown 插件系统 | 插件接口设计             | 低     |
| 图片粘贴          | Clipboard API            | 中     |
| 自动保存          | 文件服务层               | 中     |
| 文件树文件操作    | Node.js fs               | 中     |

特别说明：输入即渲染是复杂功能，涉及编辑器状态、光标定位、选区、语法解析和 DOM 映射，不建议在第一版实现。

## 七、关键技术难点

### 1. 本地图片路径解析

Markdown 图片路径通常相对于 Markdown 文件所在目录。

例如：

```
![图片](./assets/demo.png)
```

需要根据当前文档路径正确解析图片地址。

应采用受控的本地资源协议，不能简单拼接未经校验的 file:// 路径。

### 2. 大型 Markdown 文档性能

可能出现：

- 文档内容过长。
- 代码块数量较多。
- 图片数量较多。
- 频繁更新预览。
- Shiki 高亮耗时。

优化方向：

- 高亮器实例复用。
- 渲染防抖。
- 合理缓存。
- 避免不必要的 React 重渲染。
- 必要时将 Markdown 解析和高亮任务移出主交互线程。

### 3. 文件外部修改冲突

文件监听发现外部修改后，不应该直接覆盖编辑器中的内容。

应比较磁盘文件和当前编辑状态，并提供重新加载或保留当前修改的选择。

### 4. HTML 安全

Markdown 可能包含原始 HTML 和恶意链接。

应使用 DOMPurify 净化最终 HTML，同时限制危险 URL 协议、外部导航和本地资源访问。

### 5. 编辑器滚动同步

通过 Markdown Token 的源码行号映射预览 DOM 节点，实现双向滚动同步。

应考虑动态布局变化和双向事件循环。

## 八、开发优先级

| 优先级 | 功能              | 说明         |
| ------ | ----------------- | ------------ |
| P0     | Electron 基础架构 | 项目运行基础 |
| P0     | Markdown 文件打开 | 核心功能     |
| P0     | Markdown 渲染     | 核心功能     |
| P0     | 代码高亮          | 技术文档阅读 |
| P0     | 本地图片显示      | 技术文档阅读 |
| P1     | 大纲导航          | 阅读体验     |
| P1     | 文件夹工作区      | 文件管理     |
| P1     | 深浅色主题        | 阅读体验     |
| P1     | 阅读设置          | 阅读体验     |
| P2     | CodeMirror 编辑器 | 编辑能力     |
| P2     | 双栏实时预览      | 编辑能力     |
| P2     | 文件保存          | 编辑能力     |
| P2     | 全文搜索          | 效率功能     |
| P3     | 文件关联          | 系统集成     |
| P3     | PDF 导出          | 扩展功能     |
| P3     | 自动更新          | 发布能力     |
| P4     | 输入即渲染        | 第二版功能   |

## 九、项目开发原则

1. **先保证可用，再追求完善。** 不要一开始就开发所有功能。
2. **主进程与渲染进程职责分离。** 文件操作统一由主进程负责。
3. **组件化开发。** 避免将全部功能堆积在 App.tsx。
4. **TypeScript 优先。** 为核心数据结构定义明确类型。
5. **安全优先。** 不关闭 Electron 安全机制来换取开发便利。
6. **模块化设计。** Markdown 渲染、文件管理、主题、编辑器分别维护。
7. **每个阶段独立验收。** 前一阶段稳定后再进入下一阶段。
8. **不要过度设计。** 暂时不需要复杂插件系统和知识库功能。

## 十、第一阶段实际开发任务

正式开始开发时，先只完成以下内容：

- 

  初始化 Electron + Vite + React + TypeScript。

- 

  配置 Main、Preload、Renderer。

- 

  建立安全 IPC 接口。

- 

  实现文件选择。

- 

  实现 Markdown 文件读取。

- 

  集成 markdown-it。

- 

  集成 Shiki。

- 

  集成 DOMPurify。

- 

  实现 Markdown 预览页面。

- 

  实现本地图片相对路径。

- 

  实现深浅色主题。

- 

  完成第一轮测试。

**第一阶段的最终目标：**

制作出一个能够独立运行的 Windows Markdown Viewer，可以打开电脑中的 Markdown 文件，正确渲染文字、标题、列表、表格、代码块和本地图片，拥有简洁舒适的阅读界面。

完成这一阶段后，再逐步增加文件夹工作区和双栏编辑功能。

## 十一、最终产品愿景

打造一款轻量、快速、本地优先的 Markdown 阅读与编辑工具。

它不追求成为一个复杂的知识管理系统，也不急于复刻 Typora 的全部功能。

第一步做好 Markdown 阅读体验，第二步做好文件管理，第三步做好源码编辑和实时预览。

最终形成一款适合日常阅读技术文档、管理 Markdown 文件和编写开发笔记的 Windows 桌面应用。

**开发路线：Markdown Viewer → Markdown Workspace → Markdown Editor → 完整桌面应用。**