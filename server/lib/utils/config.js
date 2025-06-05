import FileHelper from './fileHelper.js';
import Logger from './logger.js';

class ConfigManager {
  constructor(configData = null) {
    this.config = configData || {};
  }

  /**
   * 从JSON文件加载配置
   * @param {string} configPath - 配置文件路径
   * @returns {ConfigManager} 配置管理器实例
   */
  static fromFile(configPath) {
    try {
      const configData = FileHelper.readJSON(configPath);
      Logger.info(`成功加载配置文件: ${configPath}`);
      return new ConfigManager(configData);
    } catch (error) {
      Logger.error(`加载配置文件失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 从前端传入的对象创建配置
   * @param {object} apiConfig - API配置
   * @param {object} promptConfig - 提示词配置
   * @returns {ConfigManager} 配置管理器实例
   */
  static fromFrontend(apiConfig, promptConfig) {
    const configData = {
      apiConfig,
      promptConfig,
      timestamp: new Date().toISOString()
    };
    Logger.info('从前端数据创建配置');
    return new ConfigManager(configData);
  }

  /**
   * 获取API配置
   * @returns {object} API配置对象
   */
  getApiConfig() {
    // 支持新格式：从api_providers中获取默认provider的配置
    if (this.config.api_providers && this.config.default_provider) {
      const defaultProviderConfig = this.config.api_providers[this.config.default_provider];
      if (defaultProviderConfig) {
        // 字段名映射：base_url -> api_url
        return {
          ...defaultProviderConfig,
          api_url: defaultProviderConfig.base_url || defaultProviderConfig.api_url
        };
      }
    }
    
    // 兼容旧格式
    return this.config.apiConfig || {};
  }

  /**
   * 获取提示词配置
   * @returns {object} 提示词配置对象
   */
  getPromptConfig() {
    return this.config.promptConfig || {};
  }

  /**
   * 验证配置完整性
   * @returns {object} 验证结果
   */
  validate() {
    const result = {
      isValid: true,
      errors: []
    };

    const apiConfig = this.getApiConfig();
    const promptConfig = this.getPromptConfig();

    // 验证API配置
    if (!apiConfig.api_key) {
      result.errors.push('缺少API密钥');
    }
    if (!apiConfig.api_url && !apiConfig.base_url) {
      result.errors.push('缺少API地址');
    }
    if (!apiConfig.api_type) {
      result.errors.push('缺少API类型');
    }

    // 对于LLM类型，需要model参数
    if (apiConfig.api_type === 'llm' && !apiConfig.model) {
      result.errors.push('LLM类型需要指定模型');
    }

    // 对于阿里云Agent类型，需要app_id参数
    if (apiConfig.api_type === 'aliyun_agent' && !apiConfig.app_id) {
      result.errors.push('阿里云Agent类型需要指定app_id');
    }

    // 验证提示词配置
    if (!promptConfig.system) {
      result.errors.push('缺少系统提示词');
    }
    if (!promptConfig.task) {
      result.errors.push('缺少任务提示词');
    }
    if (!promptConfig.output) {
      result.errors.push('缺少输出格式');
    }

    result.isValid = result.errors.length === 0;
    return result;
  }

  /**
   * 构建完整的提示词内容
   * @param {string} inputText - 输入文本
   * @returns {object} 包含system和user提示词的对象
   */
  buildPrompt(inputText) {
    const promptConfig = this.getPromptConfig();
    
    // 确保task存在，提供默认值
    const task = promptConfig.task || '{input_text}';
    
    // 构建用户提示词，替换输入文本
    let userPrompt = task.replace('{input_text}', inputText || '');
    
    // 如果有变量配置，添加到提示词中
    if (promptConfig.variables) {
      userPrompt += '\n\n变量配置：\n' + promptConfig.variables;
    }
    
    // 如果有示例，添加到提示词中
    if (promptConfig.examples) {
      userPrompt += '\n\n参考示例：\n' + promptConfig.examples;
    }
    
    // 添加输出格式要求
    if (promptConfig.output) {
      userPrompt += '\n\n请按照以下格式输出：\n' + promptConfig.output;
    }

    return {
      system: promptConfig.system || '你是一个专业的助手。',
      user: userPrompt
    };
  }

  /**
   * 获取处理配置（默认值）
   * @returns {object} 处理配置
   */
  getProcessConfig() {
    return {
      batchSize: 5,
      maxRetries: 5,
      retryInterval: 0.5,
      concurrentLimit: 5
    };
  }

  /**
   * 保存配置到文件
   * @param {string} filePath - 保存路径
   */
  saveToFile(filePath) {
    try {
      FileHelper.writeJSON(filePath, this.config);
      Logger.info(`配置已保存到: ${filePath}`);
    } catch (error) {
      Logger.error(`保存配置失败: ${error.message}`);
      throw error;
    }
  }
}

export default ConfigManager; 