# LLM批处理工具 v2.0

## 📋 项目简介

这是一个完全重构的Node.js版本LLM批处理工具，提供了强大的批量数据处理能力。

## 🚀 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 启动服务
```bash
# 仅启动后端服务
npm run server

# 仅启动前端
npm run dev

# 同时启动前后端（推荐）
npm run dev:full
```

### 3. 访问应用
- 前端界面: http://localhost:5173
- 后端API: http://localhost:3001

## 🔧 核心功能

- ✅ 支持CSV、Excel、JSON文件批量处理
- ✅ LLM通用接口和阿里云Agent专用接口  
- ✅ 断点续传功能，支持任务中断恢复
- ✅ 完善的错误处理和重试机制
- ✅ 实时WebSocket进度推送
- ✅ 灵活的字段选择和数据处理

## 📂 项目结构

```
frontend/
├── src/                    # React前端源码
├── server/                 # Node.js后端服务
│   ├── index.js           # 服务入口
│   └── lib/               # 核心业务逻辑
│       ├── core/          # 核心处理器
│       ├── providers/     # API提供商
│       └── utils/         # 工具类
├── testdata/              # 测试数据
├── package.json           # 项目配置
└── README.md             # 项目文档
```

## 📋 部署要求

- Node.js 16+
- 内存: 至少512MB
- 端口: 3001(后端), 5173(前端开发), 3000(前端生产)

## 🎯 使用指南

1. 准备数据文件（CSV/Excel/JSON格式）
2. 配置API提供商信息
3. 设置处理参数和提示词
4. 开始批量处理
5. 实时监控进度
6. 下载处理结果

更多详细信息请参考 PROJECT_INFO.json 文件。
