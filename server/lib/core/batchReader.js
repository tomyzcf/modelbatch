import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import * as XLSX from 'xlsx';
import { createReadStream } from 'fs';
import Logger from '../utils/logger.js';

class BatchReader {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.extension = path.extname(filePath).toLowerCase();
    this.batchSize = options.batchSize || 5;
    this.fields = options.fields || null; // 要处理的字段索引数组
    this.startPos = options.startPos || 0; // 开始位置（从0开始）
    this.endPos = options.endPos || null; // 结束位置（不包含）
    this.encoding = options.encoding || 'utf8';
  }

  /**
   * 生成器函数：按批次读取文件数据
   * @yields {Array<Object>} 每个批次的数据数组
   */
  async* readBatches() {
    try {
      switch (this.extension) {
        case '.csv':
          yield* this._readCSVBatches();
          break;
        case '.xlsx':
        case '.xls':
          yield* this._readExcelBatches();
          break;
        case '.json':
          yield* this._readJSONBatches();
          break;
        default:
          throw new Error(`不支持的文件格式: ${this.extension}`);
      }
    } catch (error) {
      Logger.error(`批次读取失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * CSV文件批次读取 - 修复为同步处理方式
   */
  async* _readCSVBatches() {
    const csvData = await this._readCSVData();
    
    if (csvData.length === 0) {
      return;
    }

    const headers = csvData.headers;
    const rows = csvData.rows;
    
    Logger.info(`CSV表头: ${headers.join(', ')}`);
    
    // 应用开始和结束位置
    let startIdx = Math.max(0, this.startPos);
    let endIdx = this.endPos ? Math.min(this.endPos, rows.length) : rows.length;
    
    const targetRows = rows.slice(startIdx, endIdx);
    
    Logger.info(`CSV数据范围: ${startIdx} 到 ${endIdx}，共 ${targetRows.length} 行`);

    // 按批次yield数据
    for (let i = 0; i < targetRows.length; i += this.batchSize) {
      const batchEnd = Math.min(i + this.batchSize, targetRows.length);
      const batchRows = targetRows.slice(i, batchEnd);
      
      const batch = batchRows.map(row => this._processRow(row, headers));
      
      Logger.info(`读取CSV批次: ${i + startIdx + 1}-${batchEnd + startIdx} 行，共 ${batch.length} 条记录`);
      yield batch;
    }
  }

  /**
   * 读取整个CSV文件数据
   */
  async _readCSVData() {
    return new Promise((resolve, reject) => {
      const rows = [];
      let headers = [];

      const stream = createReadStream(this.filePath, { encoding: this.encoding });
      
      stream
        .pipe(csv())
        .on('headers', (headerList) => {
          headers = headerList;
        })
        .on('data', (data) => {
          rows.push(data);
        })
        .on('end', () => {
          resolve({ headers, rows });
        })
        .on('error', (error) => {
          reject(new Error(`CSV文件读取失败: ${error.message}`));
        });
    });
  }

  /**
   * Excel文件批次读取
   */
  async* _readExcelBatches() {
    try {
      const workbook = XLSX.readFile(this.filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // 转换为JSON数组
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (jsonData.length === 0) {
        return;
      }

      const headers = jsonData[0] || [];
      Logger.info(`Excel表头: ${headers.join(', ')}`);
      
      // 计算实际的数据行（跳过表头）
      let dataRows = jsonData.slice(1);
      
      // 应用开始和结束位置
      let startIdx = Math.max(0, this.startPos);
      let endIdx = this.endPos ? Math.min(this.endPos, dataRows.length) : dataRows.length;
      
      dataRows = dataRows.slice(startIdx, endIdx);
      
      Logger.info(`Excel数据范围: ${startIdx} 到 ${endIdx}，共 ${dataRows.length} 行`);

      // 按批次yield数据
      for (let i = 0; i < dataRows.length; i += this.batchSize) {
        const batchEnd = Math.min(i + this.batchSize, dataRows.length);
        const batchRows = dataRows.slice(i, batchEnd);
        
        const batch = batchRows.map(row => this._processRow(row, headers));
        
        Logger.info(`读取Excel批次: ${i + startIdx + 1}-${batchEnd + startIdx} 行，共 ${batch.length} 条记录`);
        yield batch;
      }
    } catch (error) {
      throw new Error(`Excel批次读取失败: ${error.message}`);
    }
  }

  /**
   * JSON文件批次读取
   */
  async* _readJSONBatches() {
    try {
      const content = fs.readFileSync(this.filePath, this.encoding);
      const lines = content.trim().split('\n');
      let jsonData = [];

      if (lines.length === 1) {
        // JSON数组格式
        try {
          jsonData = JSON.parse(content);
          if (!Array.isArray(jsonData)) {
            jsonData = [jsonData];
          }
        } catch (error) {
          throw new Error('无效的JSON格式');
        }
      } else {
        // JSONL格式（每行一个JSON对象）
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

      // 应用开始和结束位置
      let startIdx = Math.max(0, this.startPos);
      let endIdx = this.endPos ? Math.min(this.endPos, jsonData.length) : jsonData.length;
      
      const targetData = jsonData.slice(startIdx, endIdx);
      
      Logger.info(`JSON数据范围: ${startIdx} 到 ${endIdx}，共 ${targetData.length} 条记录`);

      // 按批次yield数据
      for (let i = 0; i < targetData.length; i += this.batchSize) {
        const batchEnd = Math.min(i + this.batchSize, targetData.length);
        const batchData = targetData.slice(i, batchEnd);
        
        const batch = batchData.map(item => this._processRow(item));
        
        Logger.info(`读取JSON批次: ${i + startIdx + 1}-${batchEnd + startIdx} 行，共 ${batch.length} 条记录`);
        yield batch;
      }
    } catch (error) {
      throw new Error(`JSON批次读取失败: ${error.message}`);
    }
  }

  /**
   * 处理单行数据
   * @param {Object|Array} row - 行数据
   * @param {Array} headers - 表头（可选）
   * @returns {Object} 处理后的数据对象
   */
  _processRow(row, headers = null) {
    let values = [];

    if (Array.isArray(row)) {
      values = row;
    } else if (row && typeof row === 'object') {
      if (headers) {
        // 如果有表头，按表头顺序提取值
        values = headers.map(header => row[header] || '');
      } else {
        // 否则提取所有值
        values = Object.values(row);
      }
    } else {
      values = [row];
    }

    // 如果指定了字段，只提取指定字段
    if (this.fields && Array.isArray(this.fields)) {
      values = this.fields.map(fieldIndex => {
        return fieldIndex < values.length ? values[fieldIndex] : '';
      });
    }

    // 将所有值合并为文本内容
    const content = values
      .filter(val => val != null && val !== '')
      .map(val => String(val).trim())
      .filter(str => str.length > 0)
      .join(' ');

    return {
      content,
      originalData: row, // 保留原始数据以备需要
      processedFields: this.fields
    };
  }

  /**
   * 获取文件总行数（用于进度计算）
   * @returns {Promise<number>} 总行数
   */
  async getTotalRows() {
    try {
      switch (this.extension) {
        case '.csv':
          return this._getCSVTotalRows();
        case '.xlsx':
        case '.xls':
          return this._getExcelTotalRows();
        case '.json':
          return this._getJSONTotalRows();
        default:
          throw new Error(`不支持的文件格式: ${this.extension}`);
      }
    } catch (error) {
      Logger.error(`获取文件总行数失败: ${error.message}`);
      return 0;
    }
  }

  async _getCSVTotalRows() {
    return new Promise((resolve, reject) => {
      let count = 0;
      const stream = createReadStream(this.filePath, { encoding: this.encoding });
      
      stream
        .pipe(csv())
        .on('data', () => count++)
        .on('end', () => resolve(count))
        .on('error', reject);
    });
  }

  async _getExcelTotalRows() {
    const workbook = XLSX.readFile(this.filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    // 减去表头行
    return Math.max(0, jsonData.length - 1);
  }

  async _getJSONTotalRows() {
    const content = fs.readFileSync(this.filePath, this.encoding);
    const lines = content.trim().split('\n');
    
    if (lines.length === 1) {
      // JSON数组格式
      try {
        const jsonData = JSON.parse(content);
        return Array.isArray(jsonData) ? jsonData.length : 1;
      } catch (error) {
        return 0;
      }
    } else {
      // JSONL格式
      return lines.filter(line => line.trim()).length;
    }
  }
}

export default BatchReader; 