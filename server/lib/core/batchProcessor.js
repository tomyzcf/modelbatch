import path from 'path';
import Logger from '../utils/logger.js';
import FileHelper from '../utils/fileHelper.js';
import ConfigManager from '../utils/config.js';
import { LLMProvider, AliyunProvider } from '../providers/index.js';
import { FileReader, BatchReader } from './index.js';
import ProgressTracker from './progressTracker.js';
import fs from 'fs/promises';
import YAML from 'yaml';

class BatchProcessor {
  constructor(wsClients = null) {
    this.wsClients = wsClients; // WebSocket客户端用于实时推送
    this.isRunning = false;
    this.isPaused = false;
    this.shouldStop = false;
    
    // 配置对象
    this.config = null;
    this.provider = null;
    this.progressTracker = null;
    this.batchReader = null;
    
    // 处理参数
    this.maxRetries = 3;
    this.retryDelay = 1000; // 毫秒
    this.batchSize = 5;
    this.concurrentLimit = 1; // 暂时不支持并发，避免API限制
  }

  /**
   * 执行批处理任务
   * @param {Object} params 任务参数
   */
  async executeTask(params) {
    try {
      Logger.info('开始执行批处理任务');
      this.isRunning = true;
      this.shouldStop = false;
      
      // 1. 初始化配置和组件
      await this._initializeTask(params);
      
      // 2. 检查断点续传
      const hasProgress = this.progressTracker.loadProgress();
      if (hasProgress) {
        Logger.info('检测到进度文件，将从断点续传');
      }
      
      // 3. 获取文件信息和设置总行数
      const fileInfo = await this._getFileInfo(params.filePath);
      let totalRows = this._calculateTotalRows(fileInfo, params);
      this.progressTracker.setTotalRows(totalRows);
      
      // 4. 创建批次读取器
      this._createBatchReader(params);
      
      // 5. 执行批处理
      await this._processBatches();
      
      // 6. 完成处理
      this.progressTracker.markCompleted();
      this._broadcastProgress();
      
      Logger.success('批处理任务执行完成');
      return this._getTaskSummary();
      
    } catch (error) {
      Logger.error(`批处理任务执行失败: ${error.message}`);
      this.progressTracker?.markError(error.message);
      this._broadcastProgress();
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 暂停任务
   */
  pauseTask() {
    if (this.isRunning) {
      this.isPaused = true;
      this.progressTracker?.markPaused();
      Logger.info('任务已暂停');
      this._broadcastProgress();
    }
  }

  /**
   * 恢复任务
   */
  resumeTask() {
    if (this.isPaused) {
      this.isPaused = false;
      Logger.info('任务已恢复');
    }
  }

  /**
   * 停止任务
   */
  stopTask() {
    this.shouldStop = true;
    this.isPaused = false;
    Logger.info('任务停止信号已发送');
  }

  /**
   * 获取当前进度
   */
  getProgress() {
    return this.progressTracker?.getProgress() || null;
  }

  /**
   * 初始化任务配置和组件
   */
  async _initializeTask(params) {
    // 验证参数
    this._validateParams(params);
    
    // 创建配置管理器 - 兼容两种参数格式
    if (params.configPath) {
      // 使用传统的配置文件路径
      this.config = ConfigManager.fromFile(params.configPath);
    } else if (params.promptPath) {
      // 使用前端API格式，从promptPath加载配置
      this.config = await this._createConfigFromPromptPath(params.promptPath);
    } else {
      throw new Error('必须提供 configPath 或 promptPath 参数');
    }
    
    // 创建API提供商
    this.provider = this._createProvider();
    
    // 创建进度跟踪器
    const outputDir = params.outputDir || path.join(path.dirname(params.filePath), 'output');
    const taskName = params.taskName || `task_${Date.now()}`;
    this.progressTracker = new ProgressTracker(outputDir, taskName);
    
    Logger.info('任务初始化完成');
  }

  /**
   * 验证输入参数
   */
  _validateParams(params) {
    if (!params.filePath) {
      throw new Error('缺少文件路径参数');
    }
    
    if (!params.configPath && !params.promptPath) {
      throw new Error('缺少配置文件路径参数或提示词文件路径参数');
    }
    
    if (!FileHelper.fileExists(params.filePath)) {
      throw new Error(`输入文件不存在: ${params.filePath}`);
    }
    
    // 验证配置文件或提示词文件存在
    const configFile = params.configPath || params.promptPath;
    if (!FileHelper.fileExists(configFile)) {
      throw new Error(`配置文件不存在: ${configFile}`);
    }
  }

  /**
   * 从提示词文件创建配置对象
   * @param {string} promptPath 提示词文件路径
   */
  async _createConfigFromPromptPath(promptPath) {
    try {
      // 读取提示词文件内容
      const promptContent = await fs.readFile(promptPath, 'utf8');
      let promptData;
      
      try {
        // 尝试解析为JSON
        promptData = JSON.parse(promptContent);
      } catch (jsonError) {
        // 如果不是JSON，尝试解析为YAML
        try {
          promptData = YAML.parse(promptContent);
        } catch (yamlError) {
          throw new Error(`提示词文件格式不支持，必须是JSON或YAML格式: ${promptPath}`);
        }
      }
      
      // 转换为标准配置格式
      const config = this._convertPromptDataToConfig(promptData);
      
      // 创建ConfigManager实例
      return new ConfigManager(config);
      
    } catch (error) {
      throw new Error(`读取提示词文件失败: ${error.message}`);
    }
  }

  /**
   * 将提示词数据转换为标准配置格式
   * @param {Object} promptData 提示词数据
   */
  _convertPromptDataToConfig(promptData) {
    // 如果已经是标准格式，直接返回
    if (promptData.apiConfig && promptData.promptConfig) {
      return promptData;
    }
    
    // 如果是简单的提示词格式，构建默认配置
    const config = {
      apiConfig: {
        api_type: promptData.api_type || 'llm',
        api_url: promptData.api_url || 'https://api.deepseek.com/v1/chat/completions',
        api_key: promptData.api_key || 'default_key',
        model: promptData.model || 'deepseek-chat'
      },
      promptConfig: {
        system: promptData.system || '你是一个专业的助手。',
        task: promptData.task || promptData.prompt || '{input_text}',
        output: promptData.output || '请提供相关回复',
        variables: promptData.variables || '',
        examples: promptData.examples || ''
      }
    };
    
    // 处理阿里云Agent特殊配置
    if (promptData.api_type === 'aliyun_agent') {
      config.apiConfig.app_id = promptData.app_id || promptData.application_id || '';
    }
    
    return config;
  }

  /**
   * 创建API提供商
   */
  _createProvider() {
    const apiConfig = this.config.getApiConfig();
    
    switch (apiConfig.api_type) {
      case 'aliyun_agent':
        return new AliyunProvider(apiConfig);
      case 'llm':
      default:
        return new LLMProvider(apiConfig);
    }
  }

  /**
   * 获取文件信息
   */
  async _getFileInfo(filePath) {
    const fileReader = new FileReader();
    return await fileReader.getFileInfo(filePath);
  }

  /**
   * 计算总行数（考虑起始和结束位置）
   */
  _calculateTotalRows(fileInfo, params) {
    let totalRows = fileInfo.totalRows;
    
    if (params.startRow !== undefined && params.endRow !== undefined) {
      totalRows = Math.max(0, params.endRow - params.startRow);
    } else if (params.startRow !== undefined) {
      totalRows = Math.max(0, totalRows - params.startRow);
    } else if (params.endRow !== undefined) {
      totalRows = Math.min(totalRows, params.endRow);
    }
    
    return totalRows;
  }

  /**
   * 创建批次读取器
   */
  _createBatchReader(params) {
    const options = {
      batchSize: params.batchSize || this.batchSize,
      fields: params.selectedFields, // 选中的字段索引数组
      startPos: params.startRow || 0,
      endPos: params.endRow,
      encoding: params.encoding || 'utf8'
    };
    
    this.batchReader = new BatchReader(params.filePath, options);
  }

  /**
   * 处理所有批次
   */
  async _processBatches() {
    const progress = this.progressTracker.getProgress();
    let processedCount = progress.processedRows || 0;
    
    // 如果是断点续传，跳过已处理的批次
    let skipBatches = Math.floor(processedCount / this.batchSize);
    let skippedCount = 0;
    
    for await (const batch of this.batchReader.readBatches()) {
      // 检查是否需要停止
      if (this.shouldStop) {
        Logger.info('收到停止信号，任务中断');
        break;
      }
      
      // 检查是否暂停
      while (this.isPaused && !this.shouldStop) {
        await this._sleep(1000);
      }
      
      // 跳过已处理的批次（断点续传）
      if (skipBatches > 0) {
        skipBatches--;
        skippedCount += batch.length;
        continue;
      }
      
      try {
        // 处理当前批次
        const results = await this._processBatch(batch, processedCount);
        
        // 记录成功的结果
        if (results.length > 0) {
          this.progressTracker.recordSuccess(results);
        }
        
        // 更新进度
        processedCount += batch.length;
        this.progressTracker.updatePosition(processedCount);
        
        // 广播进度更新
        this._broadcastProgress();
        
        // 适当延迟，避免API过载
        await this._sleep(200);
        
      } catch (error) {
        Logger.error(`批次处理失败: ${error.message}`);
        
        // 将整个批次记录为错误
        batch.forEach((item, index) => {
          this.progressTracker.recordError(
            processedCount + index,
            item.content,
            error.message,
            0
          );
        });
        
        processedCount += batch.length;
      }
    }
    
    if (skippedCount > 0) {
      Logger.info(`跳过已处理的 ${skippedCount} 条记录`);
    }
  }

  /**
   * 处理单个批次
   */
  async _processBatch(batch, startIndex) {
    const results = [];
    const promptConfig = this.config.getPromptConfig();
    
    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      const currentIndex = startIndex + i;
      
      try {
        // 检查停止信号
        if (this.shouldStop) break;
        
        // 构建提示词
        const prompt = this.config.buildPrompt(item.content);
        
        // 调用API（带重试机制）
        const response = await this._callAPIWithRetry(prompt, currentIndex);
        
        if (response) {
          results.push({
            row_index: currentIndex,
            input_content: item.content,
            output_result: response.content || response.result || '',
            processing_time: response.processingTime || 0,
            position: currentIndex,
            rawResponse: response.raw
          });
        }
        
      } catch (error) {
        // 记录单个条目的错误
        this.progressTracker.recordError(
          currentIndex,
          item.content,
          error.message,
          0
        );
      }
    }
    
    return results;
  }

  /**
   * 带重试机制的API调用
   */
  async _callAPIWithRetry(prompt, rowIndex) {
    let lastError = null;
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const startTime = Date.now();
        const response = await this.provider.makeRequest(prompt);
        const processingTime = Date.now() - startTime;
        
        if (response && response.content) {
          return {
            content: response.content,
            processingTime,
            raw: response
          };
        } else {
          throw new Error('API返回内容为空');
        }
        
      } catch (error) {
        lastError = error;
        Logger.warning(`API调用失败 [行${rowIndex}] 尝试 ${attempt + 1}/${this.maxRetries}: ${error.message}`);
        
        if (attempt < this.maxRetries - 1) {
          // 等待后重试
          await this._sleep(this.retryDelay * (attempt + 1));
        }
      }
    }
    
    // 所有重试都失败
    throw new Error(`API调用最终失败: ${lastError.message}`);
  }

  /**
   * 广播进度更新到WebSocket客户端
   */
  _broadcastProgress() {
    if (this.wsClients && this.progressTracker) {
      const progress = this.progressTracker.getProgress();
      const message = JSON.stringify({
        type: 'progress_update',
        data: progress
      });
      
      this.wsClients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(message);
        }
      });
    }
  }

  /**
   * 获取任务摘要
   */
  _getTaskSummary() {
    const progress = this.progressTracker.getProgress();
    
    return {
      taskName: progress.taskName,
      status: progress.status,
      totalRows: progress.totalRows,
      processedRows: progress.processedRows,
      successCount: progress.successCount,
      errorCount: progress.errorCount,
      skippedCount: progress.skippedCount,
      errorRate: progress.errorRate,
      startTime: progress.startTime,
      endTime: progress.endTime,
      outputFiles: {
        successFile: this.progressTracker.successFile,
        errorFile: this.progressTracker.errorFile,
        progressFile: this.progressTracker.progressFile,
        rawResponseFile: this.progressTracker.rawResponseFile
      }
    };
  }

  /**
   * 工具方法：延迟
   */
  async _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 清理资源
   */
  cleanup() {
    this.isRunning = false;
    this.progressTracker?.cleanup();
    Logger.info('批处理器资源清理完成');
  }
}

export default BatchProcessor; 