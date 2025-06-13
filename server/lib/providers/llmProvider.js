import Logger from '../utils/logger.js';

class LLMProvider {
  constructor(config) {
    this.apiKey = config.api_key;
    
    // 支持多种URL字段名
    const apiUrl = config.api_url || config.base_url || 'https://api.deepseek.com';
    this.baseUrl = apiUrl.replace(/\/$/, '').replace(/\/v1\/chat\/completions$/, '');
    
    this.model = config.model || 'deepseek-chat';
    this.modelParams = config.model_params || {};
    
    // 调试日志：检查API密钥
    Logger.info(`API密钥长度: ${this.apiKey ? this.apiKey.length : 'undefined'}`);
    Logger.info(`API密钥前缀: ${this.apiKey ? this.apiKey.substring(0, 10) + '...' : 'undefined'}`);
    Logger.info(`API URL: ${apiUrl}`);
    
    // 重试配置
    this.maxRetries = config.max_retries || 5;
    this.retryInterval = config.retry_interval || 0.5;
    
    // 并发限制
    this.concurrentLimit = config.concurrent_limit || 10;
    this.semaphore = new Array(this.concurrentLimit).fill(true);
    
    // 自动检测API端点路径
    this.endpointPath = config.endpoint_path || this._detectEndpointPath();
    
    Logger.info(`LLM Provider 初始化完成: ${this.baseUrl}${this.endpointPath}`);
  }

  _detectEndpointPath() {
    const baseUrlLower = this.baseUrl.toLowerCase();
    
    if (baseUrlLower.includes('dashscope.aliyuncs.com')) {
      return '/chat/completions';
    } else if (baseUrlLower.includes('volces.com')) {
      return '/api/v3/chat/completions';
    } else {
      // DeepSeek, OpenAI 等标准格式
      return '/v1/chat/completions';
    }
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
      // 构建请求数据
      const requestData = {
        model: this.model,
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: userContent }
        ],
        ...this.modelParams
      };

      const url = `${this.baseUrl}${this.endpointPath}`;
      Logger.info(`发送API请求: ${url}`);
      
              // 调试日志：不显示API密钥信息以保护隐私

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
      Logger.error(`API请求异常: ${error.message}`);
      return await this._handleRetry(systemContent, userContent, retryCount, error.message);
    } finally {
      this._releaseSemaphore();
    }
  }

  async _handleResponse(response, systemContent, userContent, retryCount) {
    if (response.ok) {
      const result = await response.json();
      return this._parseSuccessResponse(result);
    } 
    
    if ([429, 503, 502, 504].includes(response.status)) {
      // 可重试的错误
      const errorText = await response.text();
      Logger.warning(`API请求失败 [状态码:${response.status}] - ${errorText}`);
      return await this._handleRetry(
        systemContent, 
        userContent, 
        retryCount, 
        `HTTP ${response.status}`
      );
    } 
    
    // 不可重试的错误
    const errorText = await response.text();
    Logger.error(`API请求失败 [状态码:${response.status}] - ${errorText}`);
    return null;
  }

  _parseSuccessResponse(result) {
    try {
      // 检查响应格式
      if (!result.choices || result.choices.length === 0) {
        Logger.error('API返回无效响应：缺少choices字段');
        return null;
      }

      // 提取LLM返回的内容
      const content = result.choices[0].message.content;

      // 首先尝试检查是否是Markdown代码块格式
      const jsonPattern = /```(?:json)?\s*(.*?)\s*```/s;
      const mdJsonMatch = content.match(jsonPattern);

      if (mdJsonMatch) {
        // 如果是Markdown代码块，提取其中的JSON内容
        const jsonContent = mdJsonMatch[1].trim();
        try {
          return JSON.parse(jsonContent);
        } catch (error) {
          Logger.error(`Markdown代码块中的JSON解析失败: ${error.message}`);
          Logger.error(`代码块内容: ${jsonContent.substring(0, 200)}...`);
          return null;
        }
      }

      // 然后尝试直接解析为JSON
      try {
        return JSON.parse(content);
      } catch (error) {
        Logger.error(`JSON解析失败: ${error.message}`);
        Logger.error(`原始响应内容: ${content.substring(0, 200)}...`);
        return null;
      }

    } catch (error) {
      Logger.error(`处理返回内容时出错: ${error.message}`);
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
      type: 'llm',
      baseUrl: this.baseUrl,
      model: this.model,
      maxRetries: this.maxRetries,
      concurrentLimit: this.concurrentLimit
    };
  }
}

export default LLMProvider; 