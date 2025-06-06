import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import Logger from '../utils/logger.js';
import FileHelper from '../utils/fileHelper.js';

class TaskManager {
  constructor(baseDir = 'outputData') {
    this.baseDir = baseDir;
    this.tasksDir = path.join(baseDir, 'tasks');
    
    // 确保任务目录存在
    FileHelper.ensureDir(this.tasksDir);
  }

  /**
   * 生成唯一任务ID
   * @param {string} dataFilePath - 数据文件路径
   * @param {Object} configData - 配置数据
   * @returns {string} 任务ID
   */
  generateTaskId(dataFilePath, configData) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    
    // 基于数据文件和配置生成内容哈希
    const dataHash = this._getFileHash(dataFilePath);
    const configHash = this._getObjectHash(configData);
    
    return `task_${timestamp}_${random}_${dataHash.substring(0, 8)}_${configHash.substring(0, 8)}`;
  }

  /**
   * 创建新任务
   * @param {string} dataFilePath - 数据文件路径
   * @param {Object} configData - 配置数据
   * @param {Array} selectedFields - 选中的字段
   * @returns {Object} 任务信息
   */
  createTask(dataFilePath, configData, selectedFields = []) {
    const taskId = this.generateTaskId(dataFilePath, configData);
    const taskDir = path.join(this.tasksDir, taskId);
    
    // 创建任务专用目录
    FileHelper.ensureDir(taskDir);
    
    // 生成带任务标识的文件名
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
    const shortTaskId = taskId.split('_').slice(-2).join('_'); // 使用哈希部分作为短ID
    
    const taskInfo = {
      id: taskId,
      status: 'created',
      createdAt: new Date().toISOString(),
      dataFile: dataFilePath,
      configHash: this._getObjectHash(configData),
      selectedFields: selectedFields,
      taskDir: taskDir,
      progressFile: path.join(taskDir, 'progress.json'),
      errorFile: path.join(taskDir, `errors_${shortTaskId}_${timestamp}.csv`),
      successFile: path.join(taskDir, `results_${shortTaskId}_${timestamp}.csv`),
      rawResponseFile: path.join(taskDir, `raw_responses_${shortTaskId}_${timestamp}.jsonl`),
      metadataFile: path.join(taskDir, 'metadata.json')
    };

    // 保存任务元数据
    this._saveTaskMetadata(taskInfo, configData);
    
    Logger.info(`创建新任务: ${taskId}`);
    return taskInfo;
  }

  /**
   * 查找可恢复的任务
   * @param {string} dataFilePath - 数据文件路径
   * @param {Object} configData - 配置数据
   * @returns {Object|null} 可恢复的任务信息
   */
  findResumableTask(dataFilePath, configData) {
    try {
      const currentDataHash = this._getFileHash(dataFilePath);
      const currentConfigHash = this._getObjectHash(configData);
      
      // 扫描所有任务目录
      const taskDirs = fs.readdirSync(this.tasksDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      for (const taskDirName of taskDirs) {
        const metadataFile = path.join(this.tasksDir, taskDirName, 'metadata.json');
        
        if (fs.existsSync(metadataFile)) {
          const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
          
          // 检查数据文件和配置是否匹配
          if (metadata.dataFile === dataFilePath && 
              metadata.configHash === currentConfigHash &&
              metadata.status !== 'completed') {
            
            Logger.info(`找到可恢复的任务: ${taskDirName}`);
            return this._loadTaskInfo(taskDirName, metadata);
          }
        }
      }
      
      Logger.info('未找到可恢复的任务，将创建新任务');
      return null;
      
    } catch (error) {
      Logger.warning(`查找可恢复任务失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 获取任务进度
   * @param {string} taskId - 任务ID
   * @returns {Object|null} 进度信息
   */
  getTaskProgress(taskId) {
    try {
      const progressFile = path.join(this.tasksDir, taskId, 'progress.json');
      
      if (fs.existsSync(progressFile)) {
        const progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
        Logger.info(`加载任务进度: ${taskId} - 已处理 ${progress.processedRows}/${progress.totalRows} 行`);
        return progress;
      }
      
      return null;
    } catch (error) {
      Logger.warning(`加载任务进度失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 更新任务状态
   * @param {string} taskId - 任务ID
   * @param {string} status - 新状态
   */
  updateTaskStatus(taskId, status) {
    try {
      const metadataFile = path.join(this.tasksDir, taskId, 'metadata.json');
      
      if (fs.existsSync(metadataFile)) {
        const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
        metadata.status = status;
        metadata.updatedAt = new Date().toISOString();
        
        fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2), 'utf8');
        Logger.info(`更新任务状态: ${taskId} -> ${status}`);
      }
    } catch (error) {
      Logger.error(`更新任务状态失败: ${error.message}`);
    }
  }

  /**
   * 清理过期任务
   * @param {number} maxAgeDays - 最大保留天数（默认7天）
   */
  cleanupOldTasks(maxAgeDays = 7) {
    try {
      const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
      const cutoffTime = Date.now() - maxAge;
      
      const taskDirs = fs.readdirSync(this.tasksDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      let cleanedCount = 0;
      
      for (const taskDirName of taskDirs) {
        const taskDir = path.join(this.tasksDir, taskDirName);
        const metadataFile = path.join(taskDir, 'metadata.json');
        
        if (fs.existsSync(metadataFile)) {
          const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
          const taskTime = new Date(metadata.createdAt).getTime();
          
          if (taskTime < cutoffTime) {
            FileHelper.removeDir(taskDir);
            cleanedCount++;
            Logger.info(`清理过期任务: ${taskDirName}`);
          }
        }
      }
      
      Logger.info(`清理完成，删除了 ${cleanedCount} 个过期任务`);
      
    } catch (error) {
      Logger.error(`清理过期任务失败: ${error.message}`);
    }
  }

  /**
   * 列出所有任务
   * @returns {Array} 任务列表
   */
  listTasks() {
    try {
      const taskDirs = fs.readdirSync(this.tasksDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      const tasks = [];
      
      for (const taskDirName of taskDirs) {
        const metadataFile = path.join(this.tasksDir, taskDirName, 'metadata.json');
        
        if (fs.existsSync(metadataFile)) {
          const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
          tasks.push({
            id: taskDirName,
            status: metadata.status,
            createdAt: metadata.createdAt,
            dataFile: metadata.dataFile
          });
        }
      }
      
      // 按创建时间倒序排列
      return tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
    } catch (error) {
      Logger.error(`列出任务失败: ${error.message}`);
      return [];
    }
  }

  // 私有方法

  _getFileHash(filePath) {
    try {
      const stats = fs.statSync(filePath);
      const content = `${filePath}_${stats.size}_${stats.mtime.getTime()}`;
      return crypto.createHash('md5').update(content).digest('hex');
    } catch (error) {
      return crypto.createHash('md5').update(filePath).digest('hex');
    }
  }

  _getObjectHash(obj) {
    const content = JSON.stringify(obj, Object.keys(obj).sort());
    return crypto.createHash('md5').update(content).digest('hex');
  }

  _saveTaskMetadata(taskInfo, configData) {
    const metadata = {
      id: taskInfo.id,
      status: taskInfo.status,
      createdAt: taskInfo.createdAt,
      dataFile: taskInfo.dataFile,
      configHash: taskInfo.configHash,
      selectedFields: taskInfo.selectedFields,
      config: configData  // 保存完整配置用于调试
    };

    fs.writeFileSync(taskInfo.metadataFile, JSON.stringify(metadata, null, 2), 'utf8');
  }

  _loadTaskInfo(taskDirName, metadata) {
    const taskDir = path.join(this.tasksDir, taskDirName);
    
    return {
      id: taskDirName,
      status: metadata.status,
      createdAt: metadata.createdAt,
      dataFile: metadata.dataFile,
      configHash: metadata.configHash,
      selectedFields: metadata.selectedFields,
      taskDir: taskDir,
      progressFile: path.join(taskDir, 'progress.json'),
      errorFile: path.join(taskDir, 'errors.csv'),
      successFile: path.join(taskDir, 'results.csv'),
      rawResponseFile: path.join(taskDir, 'raw_responses.jsonl'),
      metadataFile: path.join(taskDir, 'metadata.json')
    };
  }
}

export default TaskManager; 