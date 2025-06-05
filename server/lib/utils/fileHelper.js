import fs from 'fs';
import path from 'path';

class FileHelper {
  /**
   * 确保目录存在，如果不存在则创建
   * @param {string} dirPath - 目录路径
   */
  static ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * 检查文件是否存在
   * @param {string} filePath - 文件路径
   * @returns {boolean}
   */
  static fileExists(filePath) {
    return fs.existsSync(filePath);
  }

  /**
   * 获取文件大小
   * @param {string} filePath - 文件路径
   * @returns {number} 文件大小（字节）
   */
  static getFileSize(filePath) {
    if (!fs.existsSync(filePath)) {
      return 0;
    }
    return fs.statSync(filePath).size;
  }

  /**
   * 读取JSON文件
   * @param {string} filePath - 文件路径
   * @returns {object} 解析后的JSON对象
   */
  static readJSON(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  }

  /**
   * 写入JSON文件
   * @param {string} filePath - 文件路径
   * @param {object} data - 要写入的数据
   */
  static writeJSON(filePath, data) {
    const dir = path.dirname(filePath);
    FileHelper.ensureDir(dir);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  /**
   * 追加写入文件
   * @param {string} filePath - 文件路径
   * @param {string} content - 要写入的内容
   */
  static appendFile(filePath, content) {
    const dir = path.dirname(filePath);
    FileHelper.ensureDir(dir);
    fs.appendFileSync(filePath, content, 'utf8');
  }

  /**
   * 获取文件扩展名
   * @param {string} filePath - 文件路径
   * @returns {string} 扩展名（包含点号）
   */
  static getExtension(filePath) {
    return path.extname(filePath).toLowerCase();
  }

  /**
   * 获取文件名（不含扩展名）
   * @param {string} filePath - 文件路径
   * @returns {string} 文件名
   */
  static getBaseName(filePath) {
    return path.basename(filePath, path.extname(filePath));
  }

  /**
   * 创建备份文件
   * @param {string} originalPath - 原文件路径
   * @returns {string} 备份文件路径
   */
  static createBackup(originalPath) {
    if (!fs.existsSync(originalPath)) {
      return null;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = path.dirname(originalPath);
    const ext = path.extname(originalPath);
    const basename = path.basename(originalPath, ext);
    const backupPath = path.join(dir, 'backups', `${basename}_${timestamp}${ext}`);
    
    FileHelper.ensureDir(path.dirname(backupPath));
    fs.copyFileSync(originalPath, backupPath);
    
    return backupPath;
  }
}

export default FileHelper; 