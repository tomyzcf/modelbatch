import fs from 'fs';
import path from 'path';
import Logger from '../utils/logger.js';
import BatchReader from './batchReader.js';
import TaskManager from './taskManager.js';
import ProgressTrackerV2 from './progressTrackerV2.js';
import ConfigManager from '../utils/config.js';
import ProviderFactory from '../providers/providerFactory.js';

class BatchProcessor {
  constructor() {
    this.provider = null;
    this.progressTracker = null;
    this.taskManager = new TaskManager();
    this.isProcessing = false;
    this.isPaused = false;
    this.currentTask = null;
    this.progressCallback = null; // 进度回调函数
  }

  /**
   * 设置进度回调函数
   * @param {Function} callback - 进度更新回调
   */
  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  /**
   * 触发进度更新
   */
  _notifyProgress() {
    if (this.progressCallback && this.progressTracker) {
      const progress = this.progressTracker.getProgress();
      this.progressCallback({
        type: 'progress',
        taskId: this.currentTask?.id,
        progress: {
          totalRows: progress.totalRows,
          processedRows: progress.processedRows,
          successCount: progress.successCount,
          errorCount: progress.errorCount,
          skippedCount: progress.skippedCount,
          progress: progress.totalRows > 0 ? Math.round((progress.processedRows / progress.totalRows) * 100) : 0,
          speed: this._calculateSpeed(progress),
          status: progress.status,
          startTime: progress.startTime,
          lastUpdateTime: progress.lastUpdateTime
        }
      });
    }
  }

  /**
   * 计算处理速度（条/分钟）
   */
  _calculateSpeed(progress) {
    if (!progress.startTime || progress.processedRows <= 0) return 0;
    
    const startTime = new Date(progress.startTime);
    const currentTime = new Date();
    const elapsedMinutes = (currentTime - startTime) / (1000 * 60);
    
    return elapsedMinutes > 0 ? Math.round(progress.processedRows / elapsedMinutes) : 0;
  }

  /**
   * 开始批量处理任务
   * @param {string} dataFilePath - 数据文件路径
   * @param {Array<number>} selectedFields - 选中的字段索引
   * @param {object} apiConfig - API配置
   * @param {object} promptConfig - 提示词配置
   * @returns {Promise<object>} 处理结果
   */
  async startProcessing(dataFilePath, selectedFields, apiConfig, promptConfig) {
    if (this.isProcessing) {
      throw new Error('已有任务在处理中，请等待完成或先暂停');
    }

    try {
      this.isProcessing = true;
      this.isPaused = false;

      Logger.info('开始批量处理任务');
      Logger.info(`数据文件: ${dataFilePath}`);
      Logger.info(`选中字段: ${selectedFields}`);

      // 1. 验证数据文件
      if (!fs.existsSync(dataFilePath)) {
        throw new Error(`数据文件不存在: ${dataFilePath}`);
      }

      // 2. 创建配置管理器并验证
      const configData = { apiConfig, promptConfig };
      const configManager = ConfigManager.fromFrontend(apiConfig, promptConfig);
      const validation = configManager.validate();
      
      if (!validation.isValid) {
        throw new Error(`配置验证失败: ${validation.errors.join(', ')}`);
      }

      // 3. 查找可恢复的任务或创建新任务
      let taskInfo = this.taskManager.findResumableTask(dataFilePath, configData);
      const isResuming = !!taskInfo;
      
      if (!taskInfo) {
        taskInfo = this.taskManager.createTask(dataFilePath, configData, selectedFields);
        Logger.info(`创建新任务: ${taskInfo.id}`);
      } else {
        Logger.info(`恢复任务: ${taskInfo.id}`);
      }

      this.currentTask = taskInfo;

      // 4. 初始化进度跟踪器
      this.progressTracker = new ProgressTrackerV2(taskInfo);
      
      // 5. 加载进度（如果是恢复任务）
      const hasProgress = this.progressTracker.loadProgress();
      let startPosition = 0;
      
      if (hasProgress) {
        startPosition = this.progressTracker.progress.processedRows;
        Logger.info(`从第 ${startPosition + 1} 行开始恢复处理`);
      }

      // 6. 初始化API提供商
      this.provider = ProviderFactory.createProvider(configManager.getApiConfig());
      
      // 7. 读取CSV数据
      const batchReader = new BatchReader(dataFilePath);
      const csvData = await this._readCSVData(batchReader);
      if (!csvData || csvData.length === 0) {
        throw new Error('CSV文件为空或读取失败');
      }

      // 8. 验证字段索引
      const maxFieldIndex = Math.max(...selectedFields);
      if (maxFieldIndex >= csvData[0].length) {
        throw new Error(`字段索引超出范围: ${maxFieldIndex}, 最大可用索引: ${csvData[0].length - 1}`);
      }

      // 9. 开始处理
      if (!hasProgress) {
        this.progressTracker.setTotalRows(csvData.length);
        this.taskManager.updateTaskStatus(taskInfo.id, 'processing');
        
        // 发送初始进度
        this._notifyProgress();
      }

      const result = await this._processData(csvData, selectedFields, configManager, startPosition);

      // 10. 标记任务完成
      this.progressTracker.markCompleted();
      this.taskManager.updateTaskStatus(taskInfo.id, 'completed');

      Logger.success('批量处理任务完成');
      return result;

    } catch (error) {
      Logger.error(`批量处理失败: ${error.message}`);
      
      if (this.progressTracker) {
        this.progressTracker.markError(error.message);
      }
      
      if (this.currentTask) {
        this.taskManager.updateTaskStatus(this.currentTask.id, 'error');
      }
      
      throw error;
    } finally {
      this.isProcessing = false;
      this.currentTask = null;
    }
  }

  /**
   * 暂停当前处理
   */
  pauseProcessing() {
    if (!this.isProcessing) {
      Logger.warning('当前没有正在处理的任务');
      return;
    }

    this.isPaused = true;
    Logger.info('正在暂停处理...');
    
    if (this.progressTracker) {
      this.progressTracker.markPaused();
    }
    
    if (this.currentTask) {
      this.taskManager.updateTaskStatus(this.currentTask.id, 'paused');
    }
  }

  /**
   * 停止当前处理
   */
  stopProcessing() {
    this.isPaused = true;
    Logger.info('正在停止处理...');
  }

  /**
   * 获取当前处理进度
   * @returns {object|null} 进度信息
   */
  getProgress() {
    if (!this.progressTracker) {
      return null;
    }
    
    return {
      ...this.progressTracker.getProgress(),
      isProcessing: this.isProcessing,
      isPaused: this.isPaused,
      taskId: this.currentTask?.id || null
    };
  }

  /**
   * 获取任务列表
   * @returns {Array} 任务列表
   */
  getTaskList() {
    return this.taskManager.listTasks();
  }

  /**
   * 清理过期任务
   * @param {number} maxAgeDays - 最大保留天数
   */
  cleanupOldTasks(maxAgeDays = 7) {
    this.taskManager.cleanupOldTasks(maxAgeDays);
  }

  // 私有方法

  /**
   * 读取CSV数据并转换为数组格式
   * @param {BatchReader} batchReader - BatchReader实例
   * @returns {Promise<Array<Array<string>>>} CSV数据数组
   */
  async _readCSVData(batchReader) {
    try {
      // 使用 BatchReader 的内部方法读取CSV数据
      const csvData = await batchReader._readCSVData();
      
      if (!csvData || !csvData.headers || !csvData.rows) {
        throw new Error('CSV数据格式错误');
      }

      const results = [];
      // **不要将表头作为第一行添加到数据中，表头仅用于字段映射**
      
      // 将每行数据转换为数组格式
      csvData.rows.forEach(row => {
        const rowArray = csvData.headers.map(header => row[header] || '');
        results.push(rowArray);
      });
      
      Logger.info(`成功读取CSV文件，共 ${results.length} 行数据（已排除表头）`);
      return results;
      
    } catch (error) {
      Logger.error(`CSV文件读取失败: ${error.message}`);
      throw new Error(`CSV文件读取失败: ${error.message}`);
    }
  }

  /**
   * 处理CSV数据
   * @param {Array<Array<string>>} csvData - CSV数据
   * @param {Array<number>} selectedFields - 选中的字段索引
   * @param {ConfigManager} configManager - 配置管理器
   * @param {number} startPosition - 开始位置
   * @returns {Promise<object>} 处理结果
   */
  async _processData(csvData, selectedFields, configManager, startPosition = 0) {
    const processConfig = configManager.getProcessConfig();
    
    let successCount = 0;
    let errorCount = 0;
    let position = startPosition;

    Logger.info(`开始处理数据，总计 ${csvData.length} 行，从第 ${position + 1} 行开始`);

    // 分批处理
    while (position < csvData.length && !this.isPaused) {
      const batchEnd = Math.min(position + processConfig.batchSize, csvData.length);
      const batch = csvData.slice(position, batchEnd);
      
      Logger.info(`处理批次: ${position + 1}-${batchEnd} / ${csvData.length}`);

      try {
        const batchResults = await this._processBatch(batch, selectedFields, configManager, position);
        
        // 记录成功结果
        const successResults = batchResults.filter(r => r.success);
        const errorResults = batchResults.filter(r => !r.success);
        
        if (successResults.length > 0) {
          this.progressTracker.recordSuccess(successResults.map(r => r.data));
          successCount += successResults.length;
        }
        
        // 记录错误
        errorResults.forEach(r => {
          this.progressTracker.recordError(r.position, r.originalData, r.error);
          errorCount++;
        });

        position = batchEnd;
        this.progressTracker.updatePosition(position);

        // 发送进度更新
        this._notifyProgress();

        // 批次间隔延迟
        if (position < csvData.length && processConfig.retryInterval > 0) {
          await new Promise(resolve => setTimeout(resolve, processConfig.retryInterval * 1000));
        }

      } catch (error) {
        Logger.error(`批次处理失败: ${error.message}`);
        
        // 记录整个批次的错误
        for (let i = position; i < batchEnd; i++) {
          this.progressTracker.recordError(i, csvData[i].join(','), error.message);
          errorCount++;
        }
        
        position = batchEnd;
        this.progressTracker.updatePosition(position);

        // 发送进度更新（包括错误情况）
        this._notifyProgress();
      }
    }

    const finalProgress = this.progressTracker.getProgress();
    const outputFiles = this.progressTracker.getOutputFiles();

    return {
      totalRows: csvData.length,
      processedRows: position,
      successCount: finalProgress.successCount,
      errorCount: finalProgress.errorCount,
      skippedCount: finalProgress.skippedCount,
      isPaused: this.isPaused,
      taskId: this.currentTask?.id,
      outputFiles: outputFiles
    };
  }

  /**
   * 处理单个批次
   * @param {Array<Array<string>>} batch - 批次数据
   * @param {Array<number>} selectedFields - 选中的字段索引
   * @param {ConfigManager} configManager - 配置管理器
   * @param {number} basePosition - 基础位置
   * @returns {Promise<Array<object>>} 批次处理结果
   */
  async _processBatch(batch, selectedFields, configManager, basePosition) {
    const promises = batch.map(async (row, index) => {
      const position = basePosition + index;
      
      try {
        // 提取选中字段的内容
        const selectedContent = selectedFields.map(fieldIndex => row[fieldIndex] || '').join(' ');
        
        if (!selectedContent.trim()) {
          return {
            success: false,
            position: position,
            originalData: row.join(','),
            error: '选中字段内容为空'
          };
        }

        // 使用ConfigManager构建完整提示词，传入实际的输入内容
        const promptTemplate = configManager.buildPrompt(selectedContent);
        
        // 调用API
        const apiResult = await this.provider.makeRequest(promptTemplate.system, promptTemplate.user);
        
        if (!apiResult) {
          return {
            success: false,
            position: position,
            originalData: row.join(','),
            error: 'API调用失败或返回空结果'
          };
        }

        // 构建输出数据
        const outputData = {
          position: position + 1,
          input: selectedContent,
          output: typeof apiResult === 'string' ? apiResult : JSON.stringify(apiResult),
          ...apiResult
        };

        return {
          success: true,
          position: position,
          data: outputData,
          rawResponse: apiResult
        };

      } catch (error) {
        return {
          success: false,
          position: position,
          originalData: row.join(','),
          error: error.message
        };
      }
    });

    return await Promise.all(promises);
  }
}

export default BatchProcessor; 