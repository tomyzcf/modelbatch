import Logger from '../utils/logger.js';

class AliyunProvider {
  constructor(config) {
    this.apiKey = config.api_key;
    this.baseUrl = config.api_url || config.base_url;
    this.appId = config.app_id;
    
    // 为了兼容性，添加model属性
    this.model = `bailian-app-${this.appId}`;
    
    // 重试配置
    this.maxRetries = config.max_retries || 5;
    this.retryInterval = config.retry_interval || 0.5;
    
    // 并发限制（阿里云建议较小的并发数）
    this.concurrentLimit = config.concurrent_limit || 5;
    this.semaphore = new Array(this.concurrentLimit).fill(true);
    
    Logger.info(`阿里云百炼 Provider 初始化完成: ${this.baseUrl}, App ID: ${this.appId}`);
  }

  async _acquireSemaphore() {
    while (this.semaphore.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    this.semaphore.pop();
  }

  _releaseSemaphore() {
    this.semaphore.push(true);
  }

  /**
   * 处理单个API请求
   * @param {string} systemContent - 系统提示词
   * @param {string} userContent - 用户输入内容
   * @param {number} retryCount - 当前重试次数
   * @returns {Object|null} API响应结果或null
   */
  async makeRequest(systemContent, userContent, retryCount = 0) {
    await this._acquireSemaphore();
    
    try {
      // 构造阿里云百炼API请求数据格式
      const requestData = {
        input: {
          prompt: userContent
        },
        parameters: {
          system_prompt: systemContent
        }
      };

      const url = `${this.baseUrl}/api/v1/apps/${this.appId}/completion`;
      Logger.info(`发送阿里云百炼API请求: ${url}`);

      // 发送HTTP请求
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
      });

      return await this._handleResponse(response, systemContent, userContent, retryCount);

    } catch (error) {
      Logger.error(`阿里云百炼API请求异常: ${error.message}`);
      return await this._handleRetry(systemContent, userContent, retryCount, error.message);
    } finally {
      this._releaseSemaphore();
    }
  }

  async _handleResponse(response, systemContent, userContent, retryCount) {
    if (response.ok) {
      const result = await response.json();
      Logger.info(`收到阿里云百炼响应: ${JSON.stringify(result).substring(0, 200)}...`);
      return this._parseResponse(result);
    } 
    
    if ([429, 503].includes(response.status)) {
      // 可重试的错误（限流或服务暂时不可用）
      const errorText = await response.text();
      Logger.warning(`阿里云百炼API请求失败 [状态码:${response.status}] - ${errorText}`);
      return await this._handleRetry(
        systemContent, 
        userContent, 
        retryCount, 
        `HTTP ${response.status}`
      );
    } 
    
    // 不可重试的错误
    const errorText = await response.text();
    Logger.error(`阿里云百炼API请求失败 [状态码:${response.status}] - ${errorText}`);
    return null;
  }

  _parseResponse(response) {
    try {
      // 检查是否出错
      if ('code' in response && response.code !== 200) {
        Logger.error(`阿里云百炼API请求失败：${response.message || '未知错误'}`);
        return null;
      }

      // 解析output内容
      const output = response.output || {};
      const text = output.text || '';

      // 尝试从文本中提取JSON
      try {
        // 如果文本看起来是JSON格式，尝试解析
        if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
          const jsonObj = JSON.parse(text);
          return jsonObj;
        }
      } catch (jsonError) {
        // 如果不是有效的JSON，继续处理为普通文本
        Logger.info('阿里云百炼返回的不是JSON格式，将作为文本处理');
      }

      // 构建结果
      const result = { content: text };

      // 添加usage信息（如果有）
      const usage = response.usage || {};
      if (Object.keys(usage).length > 0) {
        result.usage = {
          input_tokens: usage.input_tokens || 0,
          output_tokens: usage.output_tokens || 0,
          total_tokens: usage.total_tokens || 0
        };
      }

      return result;

    } catch (error) {
      Logger.error(`阿里云百炼响应解析异常: ${error.message}`);
      return null;
    }
  }

  async _handleRetry(systemContent, userContent, retryCount, errorMsg) {
    if (retryCount < this.maxRetries) {
      const retryDelay = Math.min(Math.pow(2, retryCount) * this.retryInterval * 1000, 10000);
      Logger.warning(`请求失败：${errorMsg}，${retryDelay/1000}秒后重试第${retryCount + 1}次`);
      
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return await this.makeRequest(systemContent, userContent, retryCount + 1);
    } else {
      Logger.error(`达到最大重试次数，请求失败：${errorMsg}`);
      return null;
    }
  }

  /**
   * 获取提供商信息
   * @returns {Object} 提供商信息
   */
  getInfo() {
    return {
      type: 'aliyun_agent',
      baseUrl: this.baseUrl,
      appId: this.appId,
      model: this.model,
      maxRetries: this.maxRetries,
      concurrentLimit: this.concurrentLimit
    };
  }
}

export default AliyunProvider; 