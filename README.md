# LLM批处理工具

> 🚀 基于React + Node.js的现代化LLM批量数据处理工具

## 📋 项目简介

这是一个功能强大的LLM批处理工具，支持大规模数据的自动化处理。通过友好的Web界面，用户可以轻松配置API、上传数据文件、设置提示词，并实时监控批处理进度。

### ✨ 核心特性

- 🎯 **多格式支持** - 支持CSV、Excel、JSON文件的批量处理
- 🔌 **多API兼容** - 支持OpenAI、DeepSeek、阿里云百炼等多种LLM API
- 📊 **实时监控** - WebSocket实时进度推送，处理状态一目了然
- 💾 **断点续传** - 支持任务中断后从断点位置继续执行
- 🛡️ **错误处理** - 完善的错误记录和重试机制
- 🎨 **现代界面** - 基于React + Ant Design的现代化用户界面
- ⚡ **高性能** - Node.js后端，支持大文件批量处理

## 🚀 快速开始

### 方式一：便携版使用（推荐）

**无需安装，开箱即用的便携版本：**

1. **获取便携版**
   - 运行 `build-portable.bat` 构建便携包
   - 或下载预构建的便携版文件夹

2. **使用方法**
   - 将 `dist/portable/` 文件夹复制到目标电脑
   - 双击 `启动工具.bat` 启动程序
   - 浏览器会自动打开工具界面

3. **系统要求**
   - Windows 10+
   - Node.js 16+ 已安装
   - 端口3001可用

### 方式二：开发环境

**用于开发和自定义的完整环境：**

#### 环境要求
- Node.js 16+
- npm 或 yarn
- 至少512MB内存

#### 安装与启动
```bash
# 1. 克隆项目
git clone <repository-url>
cd modelbatch

# 2. 安装依赖
npm install

# 3. 启动开发服务
npm run dev:full

# 或者分别启动
npm run server    # 仅启动后端服务
npm run dev       # 仅启动前端开发服务器
```

#### 访问应用
- 🌐 **开发界面**: http://localhost:5173
- 🔧 **后端API**: http://localhost:3001

### 方式三：服务器部署

**适用于生产环境的服务器部署：**

```bash
# 1. 构建生产版本
npm run build:production

# 2. 启动生产服务器
npm run server

# 3. 访问应用
# http://your-server:3001
```

详细部署说明请参考 [DEPLOYMENT.md](./DEPLOYMENT.md)

## 📁 项目结构

```
modelbatch/
├── src/                      # React前端源码
│   ├── components/           # 通用组件
│   ├── pages/               # 页面组件
│   ├── stores/              # 状态管理
│   ├── utils/               # 工具函数
│   └── templates/           # 提示词模板
├── server/                  # Node.js后端服务
│   ├── index.js            # 服务入口
│   └── lib/                # 核心业务逻辑
│       ├── core/           # 核心处理器
│       ├── providers/      # API提供商
│       └── utils/          # 工具类
├── testdata/               # 测试数据（被忽略）
├── temp/                   # 临时文件（被忽略）
├── outputData/             # 输出结果（被忽略）
└── docs/                   # 文档目录
```

## 🎯 使用流程

### 1. API配置
- 选择API类型（LLM通用接口 / 阿里云百炼Agent）
- 配置API地址、密钥、模型参数

### 2. 数据上传
- 支持拖拽上传，最大50MB
- 自动识别文件格式和编码
- 实时预览数据内容

### 3. 字段选择
- 可视化选择需要处理的数据字段
- 支持字段范围设置（如2-5列）
- 自定义处理行数范围

### 4. 提示词配置
- 内置多种模板（数据提取、内容生成、分类标注等）
- JSON格式配置，支持语法检查
- 实时预览和验证

### 5. 任务执行
- 一键启动批处理任务
- 实时进度监控和状态展示
- 支持暂停、恢复、停止操作

### 6. 结果下载
- 自动生成处理结果文件
- 包含成功数据、错误记录、统计信息
- 支持断点续传恢复

## 🏗️ 架构设计

### 前端架构
- **框架**: React 18 + Vite
- **UI组件**: Ant Design
- **状态管理**: Zustand
- **文件处理**: Papa Parse + SheetJS
- **实时通信**: WebSocket

### 后端架构
- **运行时**: Node.js + Express
- **核心模块**:
  - `BatchProcessor` - 批处理引擎
  - `ProgressTracker` - 进度跟踪器
  - `FileReader` - 文件读取器
  - `LLMProvider` - API提供商抽象层

### 数据流程
```
用户上传 → 文件解析 → 字段选择 → 提示词配置 → 批处理执行 → 结果输出
    ↓
实时进度推送 ← WebSocket ← 进度跟踪 ← API调用 ← 数据分批
```

## 🔌 支持的API

### LLM通用接口
- OpenAI GPT系列
- DeepSeek Chat
- 其他兼容OpenAI格式的API

### 阿里云百炼Agent
- 支持阿里云百炼专用API格式
- Agent应用模式调用
- 特殊参数和响应处理

## 📊 输出格式

每次处理完成后，会在`outputData`目录生成：

- `processed_data.csv` - 成功处理的数据
- `error_records.csv` - 错误记录文件
- `task_progress.json` - 进度和统计信息
- `raw_responses.jsonl` - 原始API响应（可选）

## 🛠️ 开发说明

### 本地开发

```bash
# 启动开发环境
npm run dev:full

# 仅启动后端服务
npm run server

# 仅启动前端
npm run dev
```

### 构建部署

```bash
# 构建前端
npm run build

# 生产环境预览
npm run preview

# 构建便携版（Windows）
npm run build:portable

# 生产版本构建
npm run build:production
```

### 目录说明

- `src/` - React前端源码
- `server/` - Node.js后端服务
- `dist/` - 前端构建产物
- `temp/` - 临时文件和配置
- `outputData/` - 处理结果输出

## 📖 更多文档

- [部署指南](./DEPLOYMENT.md) - 详细的部署说明
- [项目信息](./PROJECT_INFO.json) - 项目配置信息
- [Server文档](./server/README.md) - 后端开发文档
- [前端计划](./frontend_mvp_plan.md) - 前端开发说明

## 🤝 贡献

欢迎提交Issue和Pull Request来改进这个项目！

## 📄 许可证

本项目采用MIT许可证。

---

**注意**: 这是一个从Python版本完全重构的Node.js版本，保持了所有原有功能的同时，提供了更好的用户体验和性能表现。 