import LLMProvider from './llmProvider.js';
import AliyunProvider from './aliyunProvider.js';
import Logger from '../utils/logger.js';

class ProviderFactory {
  /**
   * 根据API配置创建Provider实例
   * @param {Object} apiConfig - API配置对象
   * @returns {LLMProvider|AliyunProvider} Provider实例
   */
  static createProvider(apiConfig) {
    const apiType = apiConfig.api_type;
    
    Logger.info(`创建API Provider: ${apiType}`);
    
    switch (apiType) {
      case 'llm':
        return new LLMProvider(apiConfig);
        
      case 'aliyun_agent':
        return new AliyunProvider(apiConfig);
        
      default:
        throw new Error(`不支持的API类型: ${apiType}`);
    }
  }

  /**
   * 验证API配置的完整性
   * @param {Object} apiConfig - API配置对象
   * @returns {Object} 验证结果 {isValid: boolean, errors: string[]}
   */
  static validateApiConfig(apiConfig) {
    const result = {
      isValid: true,
      errors: []
    };

    // 基础字段验证
    if (!apiConfig.api_type) {
      result.errors.push('缺少API类型 (api_type)');
    }
    if (!apiConfig.api_key) {
      result.errors.push('缺少API密钥 (api_key)');
    }
    if (!apiConfig.api_url && !apiConfig.base_url) {
      result.errors.push('缺少API地址 (api_url 或 base_url)');
    }

    // 根据API类型进行特定验证
    switch (apiConfig.api_type) {
      case 'llm':
        if (!apiConfig.model) {
          result.errors.push('LLM类型需要指定模型 (model)');
        }
        break;
        
      case 'aliyun_agent':
        if (!apiConfig.app_id) {
          result.errors.push('阿里云Agent类型需要指定应用ID (app_id)');
        }
        break;
        
      default:
        result.errors.push(`不支持的API类型: ${apiConfig.api_type}`);
    }

    result.isValid = result.errors.length === 0;
    return result;
  }

  /**
   * 获取支持的API类型列表
   * @returns {Array} 支持的API类型
   */
  static getSupportedTypes() {
    return ['llm', 'aliyun_agent'];
  }
}

export default ProviderFactory; 