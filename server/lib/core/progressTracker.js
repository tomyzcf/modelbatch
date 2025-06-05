import fs from 'fs';
import path from 'path';
import Logger from '../utils/logger.js';
import FileHelper from '../utils/fileHelper.js';

class ProgressTracker {
  constructor(outputDir, taskName) {
    this.outputDir = outputDir;
    this.taskName = taskName;
    this.progressFile = path.join(outputDir, 'task_progress.json');
    this.errorFile = path.join(outputDir, 'error_records.csv');
    this.successFile = path.join(outputDir, 'processed_data.csv');
    this.rawResponseFile = path.join(outputDir, 'raw_responses.jsonl');
    
    // 内存中的进度状态
    this.progress = {
      taskName: taskName,
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
    
    // 确保输出目录存在
    FileHelper.ensureDir(outputDir);
    
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
      
      // 注意：成功数据文件的表头需要根据实际输出结构动态生成
      // 将在第一次写入数据时创建
      
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
      if (fs.existsSync(this.progressFile)) {
        const progressData = JSON.parse(fs.readFileSync(this.progressFile, 'utf8'));
        
        // 合并已有进度数据
        this.progress = {
          ...this.progress,
          ...progressData,
          lastUpdateTime: new Date().toISOString(),
          status: 'resuming'
        };
        
        Logger.info(`成功加载进度文件: 已处理 ${this.progress.processedRows}/${this.progress.totalRows} 行`);
        return true;
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
    Logger.info(`开始处理任务: ${totalRows} 行数据`);
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
      
      Logger.warning(`记录错误 [行${rowIndex}]: ${errorMessage}`);
      
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
    
    Logger.success(`任务完成! 成功: ${this.progress.successCount}, 失败: ${this.progress.errorCount}, 跳过: ${this.progress.skippedCount}`);
  }

  /**
   * 标记任务暂停
   */
  markPaused() {
    this.progress.status = 'paused';
    this.saveProgress();
    Logger.info('任务已暂停');
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
    Logger.error(`任务出错: ${errorMessage}`);
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
   * 清理临时文件
   */
  cleanup() {
    try {
      // 可选：清理某些临时文件，但保留重要的进度和结果文件
      Logger.info('进度跟踪器清理完成');
    } catch (error) {
      Logger.warning(`清理失败: ${error.message}`);
    }
  }
}

export default ProgressTracker; 