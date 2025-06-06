import fs from 'fs';
import path from 'path';

class Logger {
  constructor() {
    this.logFile = null;
    this.enableConsole = true;
    this.broadcastCallback = null;
  }

  static setLogFile(filePath) {
    Logger.instance = Logger.instance || new Logger();
    Logger.instance.logFile = filePath;
  }

  static setBroadcastCallback(callback) {
    Logger.instance = Logger.instance || new Logger();
    Logger.instance.broadcastCallback = callback;
  }

  static info(message) {
    Logger._log('INFO', message);
  }

  static warning(message) {
    Logger._log('WARNING', message);
  }

  static error(message) {
    Logger._log('ERROR', message);
  }

  static success(message) {
    Logger._log('SUCCESS', message);
  }

  static _log(level, message) {
    const timestamp = new Date().toLocaleString('zh-CN');
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    
    // 控制台输出
    if (Logger.instance?.enableConsole !== false) {
      console.log(logMessage);
    }

    // WebSocket广播日志
    if (Logger.instance?.broadcastCallback) {
      try {
        Logger.instance.broadcastCallback({
          type: 'log',
          level: level.toLowerCase(),
          message: message,
          timestamp: timestamp,
          fullMessage: logMessage
        });
      } catch (error) {
        console.error('WebSocket广播日志失败:', error.message);
      }
    }

    // 文件输出（如果设置了日志文件）
    if (Logger.instance?.logFile) {
      try {
        // 确保目录存在
        const logDir = path.dirname(Logger.instance.logFile);
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }

        // 同步写入日志文件
        fs.appendFileSync(Logger.instance.logFile, logMessage + '\n', 'utf8');
      } catch (error) {
        console.error('日志文件写入失败:', error.message);
      }
    }
  }

  static disableConsole() {
    Logger.instance = Logger.instance || new Logger();
    Logger.instance.enableConsole = false;
  }

  static enableConsole() {
    Logger.instance = Logger.instance || new Logger();
    Logger.instance.enableConsole = true;
  }
}

export default Logger; 