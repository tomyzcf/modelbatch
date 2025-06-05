# LLM批处理工具 - Server端开发文档

## 重构进展状态

**当前阶段：第6阶段 - 完整功能验证**

### 已完成阶段
- ✅ **阶段一**：基础设施准备 - 创建了utils工具类（logger、fileHelper、config）
- ✅ **阶段二**：API提供商重构 - 实现了LLMProvider和AliyunProvider
- ✅ **阶段三**：文件处理重构 - 完成了FileReader和BatchReader核心功能
- ✅ **阶段四**：核心处理器重构 - 完成了ProgressTracker和BatchProcessor
  - ✅ 步骤4.1：实现进度跟踪器（ProgressTracker）- 支持断点续传、错误记录、进度统计
  - ✅ 步骤4.2：实现批处理引擎（BatchProcessor）- 整合所有模块的主控制器
- ✅ **阶段五**：API接口适配和WebSocket集成
  - ✅ 步骤5.1：新增任务执行API接口 - execute-task从Python迁移到Node.js
  - ✅ 步骤5.2：集成WebSocket实时通信 - 任务进度、状态变化实时推送
  - ✅ 步骤5.3：前端接口兼容性验证 - 支持promptPath参数格式

### 当前阶段（正在进行）
- 🔄 **阶段六**：完整功能验证 - 功能对比测试和清理优化
  - 步骤6.1：功能对比测试
  - 步骤6.2：清理和优化

## 架构概述

Server端负责处理LLM批量任务执行，采用Node.js + Express架构，支持多种API提供商和文件格式。

## 目录结构

```
server/
├── index.js                 # 主服务入口，Express服务器
├── routes/                  # API路由定义
├── lib/                     # 核心业务逻辑模块
│   ├── utils/              # 基础工具类 ✅
│   │   ├── logger.js       # 日志管理（控制台+文件）
│   │   ├── fileHelper.js   # 文件操作工具
│   │   └── config.js       # 配置管理（JSON格式）
│   ├── providers/          # API提供商模块 ✅
│   │   ├── llmProvider.js  # 通用LLM API调用
│   │   └── aliyunProvider.js # 阿里云百炼Agent API
│   └── core/               # 核心处理器 ⚡ 当前重构中
│       ├── fileReader.js   # 文件读取（CSV/Excel/JSON）✅
│       ├── batchReader.js  # 批次数据处理 ✅
│       ├── progressTracker.js # 进度跟踪和断点续传 🔄
│       └── batchProcessor.js # 批处理引擎 🔄
└── temp/                   # 临时文件和测试数据
```

## 核心模块

### 1. 基础工具类 (lib/utils/)

**Logger** - 统一日志管理
- 支持INFO/WARNING/ERROR/SUCCESS四种级别
- 同时输出到控制台和文件
- 中文时间格式，便于调试

**FileHelper** - 文件操作封装
- JSON读写、目录创建、文件检查
- 支持备份功能
- 统一错误处理

**ConfigManager** - 配置管理
- 从前端JSON配置创建
- 配置验证（API密钥、模型参数等）
- 提示词构建（变量替换、示例添加）

### 2. API提供商 (lib/providers/)

**LLMProvider** - 通用LLM API调用
- 支持DeepSeek、GPT等标准API格式
- 统一的请求/响应处理
- 错误重试和异常处理

**AliyunProvider** - 阿里云百炼Agent
- 专用于阿里云百炼API格式
- Agent应用模式调用
- 特殊的参数和响应处理

### 3. 核心处理器 (lib/core/)

**FileReader** - 文件读取器
- 支持CSV、Excel、JSON三种格式
- 自动编码识别
- 字段选择和数据预览

**BatchReader** - 批次处理器
- 生成器模式按批次读取数据
- 支持起始和结束行设置
- 内存优化的大文件处理

**ProgressTracker** - 进度跟踪器 ✅
- 实时保存处理进度到JSON文件
- 支持断点续传功能
- 错误记录和统计信息
- CSV文件输出（成功数据、错误记录）
- 内存状态管理和文件持久化

**BatchProcessor** - 批处理引擎 ✅
- 整合所有模块的主控制器
- 支持任务生命周期管理
- 错误重试和异常处理
- 资源清理和状态控制
- Mock测试完成，集成测试通过

## 重构设计原则

### 功能优先
确保所有现有功能都能正常工作，包括：
- 断点续传功能
- 错误记录和恢复
- 实时进度推送
- 多种文件格式支持

### 渐进迁移
- 分模块逐步替换，降低风险
- 每一步操作都可独立验证
- 保留Python版本作为对比基准

### 平衡设计
- 去除过度设计，保持代码简洁
- 保留必要的扩展性
- 优化用户体验，前端尽量无感知迁移

## 数据流程

1. **前端上传** → Express文件上传中间件 → 本地存储
2. **配置生成** → 前端配置 → ConfigManager验证 → JSON保存
3. **任务执行** → BatchProcessor → FileReader → BatchReader → Provider API → 结果收集
4. **进度跟踪** → ProgressTracker → WebSocket推送 → 前端实时更新
5. **结果输出** → 成功数据CSV + 错误记录CSV + 进度JSON

## 关键特性

### 断点续传
- 进度文件记录当前处理位置和统计信息
- 重启后自动从中断位置继续
- 错误数据单独记录，不影响整体进度

### 错误处理
- 三种状态：成功、失败、跳过
- 失败条目记录原始数据和错误信息
- 支持重试机制（最多5次）

### 实时通信
- WebSocket连接保持处理状态同步
- 进度百分比、处理速度、错误统计
- 前端可实时查看处理详情

## API接口

### 主要接口
- `POST /api/upload` - 文件上传
- `POST /api/generate-config` - 生成配置文件
- `POST /api/execute-task` - 执行批处理任务
- `WebSocket /` - 实时通信

### 配置格式
```json
{
  "apiConfig": {
    "api_type": "llm|aliyun_agent",
    "api_url": "API地址",
    "api_key": "API密钥",
    "model": "模型名称（LLM类型）",
    "app_id": "应用ID（阿里云类型）"
  },
  "promptConfig": {
    "system": "系统提示词",
    "task": "任务模板（包含{input_text}占位符）",
    "output": "输出格式说明",
    "variables": "变量配置（可选）",
    "examples": "示例说明（可选）"
  }
}
```

## 开发说明

### 当前开发重点
1. **ProgressTracker实现**：确保断点续传功能完整
2. **BatchProcessor集成**：整合所有模块的主控制器
3. **WebSocket进度推送**：实时状态更新
4. **错误处理优化**：完善异常处理机制

### 测试验证
- 使用 `testdata/` 目录中的真实数据进行测试
- 每个模块都有对应的测试文件
- 运行 `node server/lib/test-utils.js` 进行基础功能测试

### 模块扩展
- Provider模块：实现统一接口，添加新的API提供商
- FileReader：根据需要添加新的文件格式支持
- 配置验证：在ConfigManager中添加新的验证规则

### 注意事项
- 所有文件操作使用同步方式，避免异步竞争问题
- 日志记录详细，便于问题排查
- 配置验证严格，确保参数完整性
- 错误处理完整，避免程序崩溃

## 第5阶段成果总结

### API接口重构完成
- **execute-task API重构**：完全移除Python调用，使用Node.js BatchProcessor
  - 保持与前端的完全兼容性
  - 支持所有原有参数（inputFile、configPath、promptPath、fields、startPos、endPos）
  - 异步任务执行模式，立即返回taskId
  - 新增任务管理API（pause、resume、stop、status查询）

- **配置格式兼容**：支持多种配置文件格式
  - 传统configPath（JSON配置文件）
  - 新增promptPath（YAML/JSON提示词文件）
  - 自动格式检测和转换
  - 阿里云Agent特殊参数支持

### WebSocket实时通信
- **进度推送机制**：
  - 任务开始、进度更新、完成、失败状态实时推送
  - 详细进度信息（处理行数、成功率、错误率、预计剩余时间）
  - 支持多客户端并发监听
  - 断线重连兼容性

- **任务生命周期管理**：
  - 任务启动确认和ID分配
  - 实时状态查询（运行中、暂停、完成、错误）
  - 任务控制操作（暂停、恢复、强制停止）

### 错误处理和重试机制
- **API调用重试**：最多3次重试，指数退避延迟
- **异常分类处理**：网络错误、API错误、配置错误分别处理
- **错误记录完整**：原始数据、错误信息、重试次数、时间戳记录
- **任务恢复能力**：支持从任意中断点恢复执行

### 输出格式一致性
- **文件输出**：与Python版本保持完全一致
  - processed_data.csv：成功处理的数据
  - error_records.csv：错误记录文件
  - task_progress.json：进度和统计信息
  - raw_responses.jsonl：原始API响应（可选）
- **输出目录**：统一使用outputData目录，与前端期望一致

### 性能优化特性
- **内存管理**：批次处理避免大文件内存溢出
- **并发控制**：可配置的批次大小和处理速度
- **资源清理**：任务完成后自动清理内存资源
- **日志记录**：详细的操作日志便于调试和监控

### 测试验证完成
- **单元测试**：所有核心模块独立功能验证
- **集成测试**：完整工作流程端到端验证
- **兼容性测试**：前端API调用格式兼容性验证
- **Mock测试**：使用模拟API验证错误处理和重试机制
- **性能测试**：6行测试数据，100%成功率，实时WebSocket推送正常

## 第6阶段计划

### 步骤6.1：功能对比测试
- 使用真实测试数据对比Python版本和Node.js版本的输出结果
- 验证断点续传功能的一致性
- 测试不同文件格式（CSV、Excel、JSON）的处理效果
- 验证阿里云Agent API的特殊处理逻辑

### 步骤6.2：清理和优化
- 移除Python依赖调用的相关代码
- 优化错误消息的中文显示
- 更新前端如有必要（保持API兼容性前提下）
- 创建最终的使用文档和部署说明 