import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import * as XLSX from 'xlsx';
import { createReadStream } from 'fs';
import Logger from '../utils/logger.js';
import FileHelper from '../utils/fileHelper.js';

class FileReader {
  constructor() {
    this.supportedExtensions = ['.csv', '.xlsx', '.xls', '.json'];
  }

  /**
   * 获取支持的文件列表
   * @param {string} inputPath - 输入路径（文件或目录）
   * @returns {Array<string>} 支持的文件路径列表
   */
  getSupportedFiles(inputPath) {
    const files = [];
    
    try {
      const stats = fs.statSync(inputPath);
      
      if (stats.isDirectory()) {
        // 目录：搜索所有支持的文件
        const dirFiles = fs.readdirSync(inputPath);
        for (const file of dirFiles) {
          const filePath = path.join(inputPath, file);
          const ext = path.extname(file).toLowerCase();
          if (this.supportedExtensions.includes(ext)) {
            files.push(filePath);
          }
        }
      } else if (stats.isFile()) {
        // 文件：检查是否为支持的格式
        const ext = path.extname(inputPath).toLowerCase();
        if (this.supportedExtensions.includes(ext)) {
          files.push(inputPath);
        }
      }
    } catch (error) {
      Logger.error(`获取文件列表失败: ${error.message}`);
    }
    
    return files.sort();
  }

  /**
   * 获取文件信息（行数、列数、大小等）
   * @param {string} filePath - 文件路径
   * @returns {Promise<Object>} 文件信息
   */
  async getFileInfo(filePath) {
    try {
      const ext = path.extname(filePath).toLowerCase();
      const stats = fs.statSync(filePath);
      
      const info = {
        path: filePath,
        name: path.basename(filePath),
        extension: ext,
        size: stats.size,
        lastModified: stats.mtime,
        totalRows: 0,
        columns: [],
        encoding: 'utf-8'
      };

      switch (ext) {
        case '.csv':
          return await this._getCSVInfo(filePath, info);
        case '.xlsx':
        case '.xls':
          return await this._getExcelInfo(filePath, info);
        case '.json':
          return await this._getJSONInfo(filePath, info);
        default:
          throw new Error(`不支持的文件格式: ${ext}`);
      }
    } catch (error) {
      Logger.error(`获取文件信息失败: ${error.message}`);
      throw error;
    }
  }

  async _getCSVInfo(filePath, info) {
    return new Promise((resolve, reject) => {
      const results = [];
      let rowCount = 0;
      let headers = [];
      
      // 尝试不同编码
      const encodings = ['utf8', 'utf16le', 'latin1'];
      let currentEncodingIndex = 0;
      
      const tryEncoding = (encoding) => {
        const stream = createReadStream(filePath, { encoding });
        
        stream
          .pipe(csv())
          .on('headers', (headerList) => {
            headers = headerList;
          })
          .on('data', (data) => {
            if (rowCount < 5) { // 只收集前5行作为预览
              results.push(data);
            }
            rowCount++;
          })
          .on('end', () => {
            info.totalRows = rowCount;
            info.columns = headers.map((header, index) => ({
              index,
              name: header,
              type: 'string'
            }));
            info.preview = results;
            info.encoding = encoding;
            resolve(info);
          })
          .on('error', (error) => {
            if (currentEncodingIndex < encodings.length - 1) {
              currentEncodingIndex++;
              tryEncoding(encodings[currentEncodingIndex]);
            } else {
              reject(new Error(`CSV文件读取失败: ${error.message}`));
            }
          });
      };
      
      tryEncoding(encodings[currentEncodingIndex]);
    });
  }

  async _getExcelInfo(filePath, info) {
    try {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0]; // 使用第一个工作表
      const worksheet = workbook.Sheets[sheetName];
      
      // 转换为JSON格式以便分析
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (jsonData.length === 0) {
        info.totalRows = 0;
        info.columns = [];
        info.preview = [];
        return info;
      }
      
      // 获取表头
      const headers = jsonData[0] || [];
      info.columns = headers.map((header, index) => ({
        index,
        name: header || `Column${index + 1}`,
        type: 'string'
      }));
      
      // 计算总行数（不包括表头）
      info.totalRows = Math.max(0, jsonData.length - 1);
      
      // 获取预览数据（前5行）
      info.preview = jsonData.slice(1, 6).map(row => {
        const obj = {};
        headers.forEach((header, index) => {
          obj[header || `Column${index + 1}`] = row[index] || '';
        });
        return obj;
      });
      
      return info;
    } catch (error) {
      throw new Error(`Excel文件读取失败: ${error.message}`);
    }
  }

  async _getJSONInfo(filePath, info) {
    try {
      // 尝试不同编码读取
      const encodings = ['utf8', 'utf16le', 'latin1'];
      let content = '';
      let encoding = 'utf8';
      
      for (const enc of encodings) {
        try {
          content = fs.readFileSync(filePath, enc);
          encoding = enc;
          break;
        } catch (error) {
          if (enc === encodings[encodings.length - 1]) {
            throw error;
          }
        }
      }
      
      info.encoding = encoding;
      
      // 判断是JSONL还是JSON数组
      const lines = content.trim().split('\n');
      let jsonData = [];
      
      if (lines.length === 1) {
        // 单行：可能是JSON数组
        try {
          jsonData = JSON.parse(content);
          if (!Array.isArray(jsonData)) {
            jsonData = [jsonData];
          }
        } catch (error) {
          throw new Error('无效的JSON格式');
        }
      } else {
        // 多行：JSONL格式
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line) {
            try {
              jsonData.push(JSON.parse(line));
            } catch (error) {
              Logger.warning(`第${i + 1}行JSON解析失败，跳过: ${line.substring(0, 50)}...`);
            }
          }
        }
      }
      
      info.totalRows = jsonData.length;
      
      // 分析字段结构（基于前几条记录）
      if (jsonData.length > 0) {
        const sampleData = jsonData.slice(0, Math.min(10, jsonData.length));
        const allKeys = new Set();
        
        sampleData.forEach(item => {
          if (typeof item === 'object' && item !== null) {
            Object.keys(item).forEach(key => allKeys.add(key));
          }
        });
        
        info.columns = Array.from(allKeys).map((key, index) => ({
          index,
          name: key,
          type: 'string'
        }));
      } else {
        info.columns = [];
      }
      
      // 预览数据（前5条）
      info.preview = jsonData.slice(0, 5);
      
      return info;
    } catch (error) {
      throw new Error(`JSON文件读取失败: ${error.message}`);
    }
  }

  /**
   * 检查文件是否存在且可读
   * @param {string} filePath - 文件路径
   * @returns {boolean} 文件是否可用
   */
  validateFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return false;
      }
      
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) {
        return false;
      }
      
      const ext = path.extname(filePath).toLowerCase();
      return this.supportedExtensions.includes(ext);
    } catch (error) {
      Logger.error(`文件验证失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 获取支持的文件扩展名
   * @returns {Array<string>} 支持的扩展名列表
   */
  getSupportedExtensions() {
    return [...this.supportedExtensions];
  }
}

export default FileReader; 