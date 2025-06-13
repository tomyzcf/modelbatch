# LLM批处理工具 (Windows专用)

[![GitHub release](https://img.shields.io/github/release/tomyzcf/modelbatch.svg)](https://github.com/tomyzcf/modelbatch/releases)
[![GitHub stars](https://img.shields.io/github/stars/tomyzcf/modelbatch.svg)](https://github.com/tomyzcf/modelbatch/stargazers)
[![License](https://img.shields.io/badge/license-Personal%20%26%20Non--Commercial-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2B-blue.svg)]()

> 🚀 基于React + Node.js的现代化LLM批量数据处理工具，专为Windows环境设计，支持免安装版一键使用

## 📥 直接下载免安装版

<div align="center">

### 🎯 想要最简单的使用方式？

**👇 点击下载最新免安装版，解压即用！**

[![下载免安装版](https://img.shields.io/badge/下载免安装版-最新版本-brightgreen?style=for-the-badge&logo=download)](https://github.com/tomyzcf/modelbatch/releases/latest)

**✨ 无需环境配置 | 🚀 解压即用 | 💻 Windows 10+ 专用**

</div>

---

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

### 🎯 方式一：免安装版（推荐，最简单）

**无需环境配置，解压即用：**

1. **📥 获取免安装版**
   - 🔗 **[点击下载最新免安装版](https://github.com/tomyzcf/modelbatch/releases/latest)** 
   - 下载 `LLM批处理工具-免安装版-v*.zip` 文件

2. **💻 系统要求**
   - **操作系统**：Windows 10+ （仅支持Windows）
   - **内存**：建议8GB以上
   - **端口**：3001端口可用
   - **磁盘空间**：至少1GB可用空间

3. **🚀 使用方法**
   ```
   1. 解压下载的ZIP文件到任意目录
   2. 双击 "启动工具.bat" 启动程序
   3. 浏览器会自动打开工具界面
   4. 关闭窗口即可停止服务
   ```

### 💾 方式二：开发环境（用于自定义开发）

```bash
# 1. 克隆项目
git clone <repository-url>
cd modelbatch

# 2. 安装依赖
npm install

# 3. 启动开发服务
npm run dev:full
```

访问地址：
- 🌐 **开发界面**: http://localhost:5173
- 🔧 **后端API**: http://localhost:3001

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

## 🔌 支持的API

### LLM通用接口
- OpenAI GPT系列
- DeepSeek Chat
- 其他兼容OpenAI格式的API

### 阿里云百炼Agent
- 支持阿里云百炼专用API格式
- Agent应用模式调用

## 📊 输出格式

每次处理完成后，会在`outputData`目录生成：

- `processed_data.csv` - 成功处理的数据
- `error_records.csv` - 错误记录文件
- `task_progress.json` - 进度和统计信息
- `raw_responses.jsonl` - 原始API响应（可选）

## 🛠️ 开发相关

### 本地开发
```bash
npm run dev:full    # 启动完整开发环境
npm run server      # 仅启动后端服务
npm run dev         # 仅启动前端
```

### 构建命令
```bash
npm run build                # 构建前端
npm run build:portable       # 构建免安装版
npm run build:production     # 生产环境构建
```

## 📁 项目结构

```
modelbatch/
├── src/                      # React前端源码
├── server/                   # Node.js后端服务
├── dist/                     # 构建产物
├── temp/                     # 临时文件
└── outputData/               # 处理结果输出
```

## 📄 许可证

本项目基于 **个人和非商业使用许可证** 开源。详见 [LICENSE](./LICENSE) 文件。

**⚠️ 商业使用需要单独授权，请联系作者获得许可。**

## 📞 技术支持

- 🐛 [GitHub Issues](https://github.com/tomyzcf/modelbatch/issues) - 报告问题
- 💬 [GitHub Discussions](https://github.com/tomyzcf/modelbatch/discussions) - 交流讨论

## 📥 下载免安装版

**💡 想要开箱即用的免安装版？**

👉 **[点击下载最新免安装版](https://github.com/tomyzcf/modelbatch/releases/latest)** 

1. 下载 `LLM批处理工具-免安装版-v*.zip` 文件
2. 解压到任意目录
3. 双击 `启动工具.bat` 即可使用
4. 无需安装依赖，Windows 10+ 即可运行

---

*感谢使用LLM批处理工具！欢迎Star⭐、Fork🍴和贡献🤝！* 