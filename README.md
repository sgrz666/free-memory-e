# 自由回忆实验室（Free Recall Experiment）

一个面向认知心理学实验的前端应用，用于执行和分析**自由回忆（Free Recall）**与**再认（Recognition）**任务。

本项目支持中英文词表、可配置呈现参数、干扰任务、实验历史记录，并提供多种可视化分析，便于观察首因效应、近因效应和语义组织策略。

## 核心功能

- 自由回忆与再认双模式实验流程
- 支持中文/英文词表
- 词表类型支持：随机词表、分类词表、DRM（错误记忆）词表
- 可选 AI 生成词表（基于 Gemini）
- 可配置参数：词数、呈现节奏、显示时长、延迟时长、干扰模式
- 本地历史记录（LocalStorage）与结果回顾
- 多维度可视化分析：
	- 系列位置与回忆表现统计
	- 回忆顺序与原始位置映射（Sankey）
	- 语义类别转换结构（Chord）
	- 词项关系网络与错误记忆节点（Network）

## 技术栈

- React 19 + TypeScript
- Vite 6
- Tailwind CSS 4
- D3 / d3-sankey / Recharts
- motion（动画）
- lucide-react（图标）

## 目录结构

```text
.
├─ src/
│  ├─ App.tsx
│  ├─ constants.ts
│  └─ components/
│     ├─ MemoryNetwork.tsx
│     ├─ MemorySankey.tsx
│     └─ MemoryChord.tsx
├─ index.html
├─ vite.config.ts
└─ package.json
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量（可选）

如果你希望启用 AI 自动生成词表，请在项目根目录创建 `.env` 文件：

```bash
GEMINI_API_KEY=你的_Gemini_API_Key
```

未配置时，项目仍可使用内置词表运行。

### 3. 启动开发环境

```bash
npm run dev
```

默认地址：<http://localhost:3000>

## 构建与预览

### 常规构建

```bash
npm run build
```

输出目录：`dist/`

### 单文件构建（便于分发）

```bash
npm run build:single
```

输出目录：`dist-single/`（可直接打开 HTML 文件）

### 本地预览

```bash
npm run preview
```

## 质量检查

```bash
npm run lint
```

说明：当前 `lint` 脚本执行 TypeScript 类型检查（`tsc --noEmit`）。

## 实验流程简介

1. 设置实验参数（词数、时间、模式、语言、词表类型等）
2. 展示词表（逐词呈现）
3. 可选延迟/干扰阶段
4. 进入回忆或再认任务
5. 查看结果与可视化分析
6. 历史记录可用于多轮实验比较

## 数据与隐私

- 实验历史默认保存在浏览器本地存储（LocalStorage）
- 未配置 Gemini API Key 时不会发起 AI 请求
- 配置后，仅在启用 AI 词表生成时请求模型接口

## 适用场景

- 课堂教学中的记忆实验演示
- 认知心理学课程作业与项目原型
- 快速探索首因/近因、语义聚类与错误记忆现象

## 许可证

项目代码包含 Apache-2.0 许可声明，请结合仓库实际许可文件使用。

