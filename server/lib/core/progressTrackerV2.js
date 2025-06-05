import fs from 'fs';
import path from 'path';
import Logger from '../utils/logger.js';

class ProgressTrackerV2 {
  constructor(taskInfo) {
    this.taskInfo = taskInfo;
    this.taskId = taskInfo.id;
    this.taskDir = taskInfo.taskDir;
    this.progressFile = taskInfo.progressFile;
    this.errorFile = taskInfo.errorFile;
    this.successFile = taskInfo.successFile;
    this.rawResponseFile = taskInfo.rawResponseFile;
    
    // 内存中的进度状态
    this.progress = {
      taskId: this.taskId,
      startTime: new Date().toISOString(),
      lastUpdateTime: new Date().toISOString(),
      totalRows: 0,
      processedRows: 0,
      successCount: 0,
      errorCount: 0,
      skippedCount: 0,
      currentPosition: 0,
      status: 'initializing', // initializing, processing, paused, completed, error
      averageTimePerRow: 0,
      estimatedTimeRemaining: 0,
      errorRate: 0
    };
    
    // 初始化CSV文件头
    this._initializeCSVFiles();
  }

  /**
   * 初始化CSV文件的表头
   */
  _initializeCSVFiles() {
    try {
      // 初始化错误记录文件
      if (!fs.existsSync(this.errorFile)) {
        const errorHeader = 'row_index,original_content,error_message,timestamp,retry_count\n';
        fs.writeFileSync(this.errorFile, errorHeader, 'utf8');
        Logger.info(`初始化错误记录文件: ${this.errorFile}`);
      }
      
    } catch (error) {
      Logger.error(`初始化CSV文件失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 加载已有的进度文件（断点续传）
   * @returns {boolean} 是否成功加载了进度
   */
  loadProgress() {
    try {
      Logger.info(`检查任务进度文件: ${this.progressFile}`);
      
      if (fs.existsSync(this.progressFile)) {
        const progressData = JSON.parse(fs.readFileSync(this.progressFile, 'utf8'));
        
        // 验证任务ID匹配
        if (progressData.taskId !== this.taskId) {
          Logger.warning(`任务ID不匹配，忽略进度文件。期望: ${this.taskId}, 实际: ${progressData.taskId}`);
          return false;
        }
        
        // 合并已有进度数据
        this.progress = {
          ...this.progress,
          ...progressData,
          lastUpdateTime: new Date().toISOString(),
          status: 'resuming'
        };
        
        Logger.info(`成功加载任务进度: ${this.taskId} - 已处理 ${this.progress.processedRows}/${this.progress.totalRows} 行`);
        return true;
      } else {
        Logger.info(`任务进度文件不存在: ${this.taskId}，将从头开始处理`);
      }
    } catch (error) {
      Logger.warning(`加载进度文件失败: ${error.message}，将从头开始处理`);
    }
    
    return false;
  }

  /**
   * 保存当前进度到文件
   */
  saveProgress() {
    try {
      // 更新时间戳和计算统计信息
      this.progress.lastUpdateTime = new Date().toISOString();
      this._calculateStats();
      
      // 写入进度文件
      fs.writeFileSync(this.progressFile, JSON.stringify(this.progress, null, 2), 'utf8');
      
    } catch (error) {
      Logger.error(`保存进度失败: ${error.message}`);
    }
  }

  /**
   * 设置总行数（开始处理时调用）
   * @param {number} totalRows 总行数
   */
  setTotalRows(totalRows) {
    this.progress.totalRows = totalRows;
    this.progress.status = 'processing';
    this.saveProgress();
    Logger.info(`任务 ${this.taskId} 开始处理: ${totalRows} 行数据`);
  }

  /**
   * 更新当前处理位置
   * @param {number} position 当前位置
   */
  updatePosition(position) {
    this.progress.currentPosition = position;
    this.progress.processedRows = position;
    this.saveProgress();
  }

  /**
   * 记录成功处理的数据
   * @param {Array<Object>} results 处理结果数组
   */
  recordSuccess(results) {
    try {
      if (!results || results.length === 0) return;
      
      this.progress.successCount += results.length;
      
      // 写入成功数据到CSV文件
      this._writeSuccessData(results);
      
      // 保存原始API响应（可选）
      if (this.rawResponseFile) {
        this._writeRawResponses(results);
      }
      
      this.saveProgress();
      
    } catch (error) {
      Logger.error(`记录成功数据失败: ${error.message}`);
    }
  }

  /**
   * 记录处理失败的条目
   * @param {number} rowIndex 行索引
   * @param {string} originalContent 原始内容
   * @param {string} errorMessage 错误信息
   * @param {number} retryCount 重试次数
   */
  recordError(rowIndex, originalContent, errorMessage, retryCount = 0) {
    try {
      this.progress.errorCount++;
      
      // 记录到错误CSV文件
      const timestamp = new Date().toISOString();
      const escapedContent = this._escapeCSV(originalContent);
      const escapedError = this._escapeCSV(errorMessage);
      
      const errorLine = `${rowIndex},"${escapedContent}","${escapedError}","${timestamp}",${retryCount}\n`;
      fs.appendFileSync(this.errorFile, errorLine, 'utf8');
      
      this.saveProgress();
      
      Logger.warning(`任务 ${this.taskId} 记录错误 [行${rowIndex}]: ${errorMessage}`);
      
    } catch (error) {
      Logger.error(`记录错误数据失败: ${error.message}`);
    }
  }

  /**
   * 记录跳过的条目
   * @param {number} count 跳过的数量
   */
  recordSkipped(count = 1) {
    this.progress.skippedCount += count;
    this.saveProgress();
  }

  /**
   * 标记任务完成
   */
  markCompleted() {
    this.progress.status = 'completed';
    this.progress.endTime = new Date().toISOString();
    this.saveProgress();
    
    Logger.success(`任务 ${this.taskId} 完成! 成功: ${this.progress.successCount}, 失败: ${this.progress.errorCount}, 跳过: ${this.progress.skippedCount}`);
  }

  /**
   * 标记任务暂停
   */
  markPaused() {
    this.progress.status = 'paused';
    this.saveProgress();
    Logger.info(`任务 ${this.taskId} 已暂停`);
  }

  /**
   * 标记任务错误
   * @param {string} errorMessage 错误信息
   */
  markError(errorMessage) {
    this.progress.status = 'error';
    this.progress.lastError = errorMessage;
    this.progress.errorTime = new Date().toISOString();
    this.saveProgress();
    Logger.error(`任务 ${this.taskId} 出错: ${errorMessage}`);
  }

  /**
   * 获取当前进度信息
   * @returns {Object} 进度信息
   */
  getProgress() {
    this._calculateStats();
    return { ...this.progress };
  }

  /**
   * 计算统计信息（处理速度、剩余时间等）
   */
  _calculateStats() {
    if (this.progress.processedRows > 0 && this.progress.startTime) {
      const startTime = new Date(this.progress.startTime);
      const currentTime = new Date();
      const elapsedTime = (currentTime - startTime) / 1000; // 秒
      
      // 平均每行处理时间
      this.progress.averageTimePerRow = elapsedTime / this.progress.processedRows;
      
      // 估计剩余时间
      const remainingRows = this.progress.totalRows - this.progress.processedRows;
      this.progress.estimatedTimeRemaining = remainingRows * this.progress.averageTimePerRow;
      
      // 错误率
      this.progress.errorRate = this.progress.processedRows > 0 ? 
        (this.progress.errorCount / this.progress.processedRows) * 100 : 0;
    }
  }

  /**
   * 写入成功数据到CSV文件
   * @param {Array<Object>} results 结果数组
   */
  _writeSuccessData(results) {
    try {
      if (!results || results.length === 0) return;
      
      // 检查是否需要创建表头
      const needHeader = !fs.existsSync(this.successFile);
      
      if (needHeader && results.length > 0) {
        // 从第一个结果推断CSV结构
        const headers = Object.keys(results[0]);
        const headerLine = headers.join(',') + '\n';
        fs.writeFileSync(this.successFile, headerLine, 'utf8');
      }
      
      // 写入数据行
      const dataLines = results.map(result => {
        const values = Object.values(result).map(val => 
          typeof val === 'string' ? `"${this._escapeCSV(val)}"` : val
        );
        return values.join(',');
      }).join('\n') + '\n';
      
      fs.appendFileSync(this.successFile, dataLines, 'utf8');
      
    } catch (error) {
      Logger.error(`写入成功数据失败: ${error.message}`);
    }
  }

  /**
   * 写入原始API响应
   * @param {Array<Object>} results 结果数组  
   */
  _writeRawResponses(results) {
    try {
      const lines = results
        .filter(result => result.rawResponse)
        .map(result => JSON.stringify({
          taskId: this.taskId,
          timestamp: new Date().toISOString(),
          position: result.position || 0,
          rawResponse: result.rawResponse
        }))
        .join('\n') + '\n';
      
      if (lines.trim()) {
        fs.appendFileSync(this.rawResponseFile, lines, 'utf8');
      }
      
    } catch (error) {
      Logger.error(`写入原始响应失败: ${error.message}`);
    }
  }

  /**
   * CSV字符串转义
   * @param {string} str 待转义字符串
   * @returns {string} 转义后的字符串
   */
  _escapeCSV(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/"/g, '""');
  }

  /**
   * 获取任务输出文件路径
   * @returns {Object} 文件路径对象
   */
  getOutputFiles() {
    return {
      taskDir: this.taskDir,
      successFile: this.successFile,
      errorFile: this.errorFile,
      progressFile: this.progressFile,
      rawResponseFile: this.rawResponseFile
    };
  }
}

export default ProgressTrackerV2; 