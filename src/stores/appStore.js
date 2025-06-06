import { create } from 'zustand'
import apiService from '../utils/api'

const useAppStore = create((set, get) => ({
  // 当前步骤
  currentStep: 1,
  
  // 已完成的步骤
  completedSteps: [],
  
  // API配置
  apiConfig: {
    api_type: 'llm', // 默认选择LLM类型
    provider: 'deepseek', // 默认选择DeepSeek
    api_url: 'https://api.deepseek.com',
    api_key: '',
    model: 'deepseek-chat', // 默认选择V3模型
    app_id: '' // 阿里百炼Agent专用
  },
  
  // 文件数据
  fileData: {
    fileName: '',
    fileSize: 0,
    totalRows: 0,
    totalColumns: 0,
    previewData: [],
    headers: [],
    uploadedFile: null // 后端返回的文件信息
  },
  
  // 字段选择
  fieldSelection: {
    selectedFields: [],
    selectedFieldNames: [],
    startRow: 1,
    endRow: null
  },
  
  // 提示词配置
  promptConfig: {
    system: '',
    task: '',
    output: '',
    variables: '',
    examples: ''
  },
  
  // 任务状态
  taskStatus: {
    isRunning: false,
    isCompleted: false,
    currentStatus: 'idle', // idle/running/completed/paused/stopped/error
    startTime: null,
    endTime: null,
    totalCount: 0,
    processedCount: 0,
    successCount: 0,
    errorCount: 0,
    progress: 0,
    speed: 0,
    estimatedTimeLeft: 0,
    logs: [],
    errorLogs: [],
    resultFilePath: null,
    successFile: null,
    errorFile: null,
    lastUpdateTime: null
  },

  // 当前任务ID
  currentTaskId: null,

  // WebSocket连接状态
  wsConnected: false,

  // Actions
  setCurrentStep: (step) => {
    const targetStep = Math.max(1, Math.min(step, 4))
    set((state) => {
      // 更新已完成的步骤
      const newCompletedSteps = [...state.completedSteps]
      
      // 检查并更新所有应该被标记为已完成的步骤
      for (let i = 1; i <= Math.max(state.currentStep, targetStep); i++) {
        if (get().validateStep(i) && !newCompletedSteps.includes(i)) {
          newCompletedSteps.push(i)
        }
      }
      
      return {
        ...state,
        currentStep: targetStep,
        completedSteps: newCompletedSteps
      }
    })
  },
  
  setApiConfig: (config) => set((state) => ({
    apiConfig: { ...state.apiConfig, ...config }
  })),
  
  setFileData: (data) => set((state) => ({
    fileData: { ...state.fileData, ...data }
  })),
  
  setFieldSelection: (selection) => set((state) => ({
    fieldSelection: { ...state.fieldSelection, ...selection }
  })),
  
  setPromptConfig: (config) => set((state) => ({
    promptConfig: { ...state.promptConfig, ...config }
  })),
  
  setTaskStatus: (status) => set((state) => ({
    taskStatus: { ...state.taskStatus, ...status }
  })),

  // 添加任务日志
  addTaskLog: (log) => set((state) => ({
    taskStatus: {
      ...state.taskStatus,
      logs: [...state.taskStatus.logs, {
        id: Date.now() + Math.random(),
        timestamp: new Date().toLocaleTimeString(),
        ...log
      }]
    }
  })),

  // 添加错误日志
  addErrorLog: (error) => set((state) => ({
    taskStatus: {
      ...state.taskStatus,
      errorLogs: [...state.taskStatus.errorLogs, {
        id: Date.now() + Math.random(),
        timestamp: new Date().toLocaleTimeString(),
        ...error
      }]
    }
  })),

  // 初始化WebSocket连接
  initWebSocket: async () => {
    try {
      await apiService.connectWebSocket()
      set({ wsConnected: true })

      // 监听WebSocket事件
      apiService.on('log', (data) => {
        get().addTaskLog({
          message: data.message,
          type: 'info'
        })
      })

      apiService.on('error', (data) => {
        get().addErrorLog({
          message: data.message,
          type: 'error'
        })
      })

      apiService.on('progress', (data) => {
        set((state) => ({
          taskStatus: {
            ...state.taskStatus,
            processedCount: data.progress.processedRows,
            totalCount: data.progress.totalRows,
            successCount: data.progress.successCount,
            errorCount: data.progress.errorCount,
            progress: data.progress.progress,
            speed: data.progress.speed,
            currentStatus: 'running',
            lastUpdateTime: data.progress.lastUpdateTime
          }
        }))
      })

      apiService.on('completed', (data) => {
        set((state) => ({
          taskStatus: {
            ...state.taskStatus,
            isRunning: false,
            isCompleted: true,
            currentStatus: 'completed',
            endTime: new Date(),
            processedCount: data.result.processedRows,
            totalCount: data.result.totalRows,
            successCount: data.result.successCount,
            errorCount: data.result.errorCount,
            progress: 100,
            resultFilePath: data.result.resultFilePath,
            successFile: data.result.successFile,
            errorFile: data.result.errorFile
          }
        }))
        
        get().addTaskLog({
          message: data.message,
          type: 'success'
        })
      })

      apiService.on('failed', (data) => {
        set((state) => ({
          taskStatus: {
            ...state.taskStatus,
            isRunning: false,
            currentStatus: 'error',
            endTime: new Date()
          }
        }))
        
        get().addErrorLog({
          message: data.message,
          type: 'error'
        })
      })

    } catch (error) {
      console.error('WebSocket连接失败:', error)
      set({ wsConnected: false })
    }
  },

  // 上传文件
  uploadFile: async (file) => {
    try {
      const result = await apiService.uploadFile(file)
      
      if (result.success) {
        set((state) => ({
          fileData: {
            ...state.fileData,
            uploadedFile: result.file
          }
        }))
        return result.file
      } else {
        throw new Error(result.error || '上传失败')
      }
    } catch (error) {
      console.error('文件上传失败:', error)
      throw error
    }
  },

  // 执行批处理任务
  executeTask: async () => {
    const state = get()
    
    try {
      // 确保WebSocket连接
      if (!state.wsConnected) {
        await state.initWebSocket()
      }

      // 生成配置文件
      const configResult = await apiService.generateConfig(
        state.apiConfig,
        state.promptConfig
      )

      if (!configResult.success) {
        throw new Error('配置文件生成失败')
      }

      // 将字段索引转换为从1开始（后端期望从1开始的索引）
      const fieldIndices = state.fieldSelection.selectedFields.map(index => index + 1)

      // 准备任务参数
      const taskParams = {
        inputFile: state.fileData.uploadedFile.path,
        configPath: configResult.configPath,
        promptPath: configResult.promptPath,
        fields: fieldIndices,  // 使用从1开始的字段索引
        startPos: state.fieldSelection.startRow || 1,
        endPos: state.fieldSelection.endRow || state.fileData.totalRows
      }

      console.log('字段选择状态:', state.fieldSelection)
      console.log('执行任务参数:', taskParams)  // 调试日志

      // 启动任务
      const taskResult = await apiService.executeTask(taskParams)
      
      if (taskResult.success) {
        // 保存任务ID
        set({ currentTaskId: taskResult.taskId })
        
        // 设置任务开始状态
        set((state) => ({
          taskStatus: {
            ...state.taskStatus,
            isRunning: true,
            isCompleted: false,
            currentStatus: 'running',
            startTime: new Date().toISOString(), // 使用ISO字符串
            endTime: null,
            totalCount: state.fieldSelection.endRow ? 
              (state.fieldSelection.endRow - state.fieldSelection.startRow + 1) : 
              state.fileData.totalRows,
            processedCount: 0,
            progress: 0,
            successCount: 0,
            errorCount: 0,
            speed: 0,
            logs: [{
              message: `任务 ${taskResult.taskId} 已启动，正在处理数据...`,
              type: 'info',
              timestamp: new Date().toISOString()
            }],
            errorLogs: []
          }
        }))
        
        return taskResult
      } else {
        throw new Error(taskResult.error || '任务启动失败')
      }
    } catch (error) {
      console.error('任务执行失败:', error)
      
      set((state) => ({
        taskStatus: {
          ...state.taskStatus,
          isRunning: false,
          currentStatus: 'error'
        }
      }))

      get().addErrorLog({
        message: `任务执行失败: ${error.message}`,
        type: 'error'
      })

      throw error
    }
  },

  // 暂停任务
  pauseTask: async () => {
    const state = get()
    if (!state.currentTaskId) {
      throw new Error('没有正在运行的任务')
    }

    try {
      const result = await apiService.pauseTask(state.currentTaskId)
      if (result.success) {
        set((state) => ({
          taskStatus: {
            ...state.taskStatus,
            isRunning: false,
            currentStatus: 'paused'
          }
        }))

        get().addTaskLog({
          message: '任务已暂停',
          type: 'warning'
        })
      }
      return result
    } catch (error) {
      get().addErrorLog({
        message: `任务暂停失败: ${error.message}`,
        type: 'error'
      })
      throw error
    }
  },

  // 恢复任务
  resumeTask: async () => {
    const state = get()
    if (!state.currentTaskId) {
      throw new Error('没有可恢复的任务')
    }

    try {
      const result = await apiService.resumeTask(state.currentTaskId)
      if (result.success) {
        set((state) => ({
          taskStatus: {
            ...state.taskStatus,
            isRunning: true,
            currentStatus: 'running'
          }
        }))

        get().addTaskLog({
          message: '任务已恢复',
          type: 'info'
        })
      }
      return result
    } catch (error) {
      get().addErrorLog({
        message: `任务恢复失败: ${error.message}`,
        type: 'error'
      })
      throw error
    }
  },

  // 停止任务
  stopTask: async () => {
    const state = get()
    if (!state.currentTaskId) {
      throw new Error('没有正在运行的任务')
    }

    try {
      const result = await apiService.stopTask(state.currentTaskId)
      if (result.success) {
        set((state) => ({
          taskStatus: {
            ...state.taskStatus,
            isRunning: false,
            currentStatus: 'stopped',
            endTime: new Date()
          }
        }))

        get().addTaskLog({
          message: '任务已停止',
          type: 'error'
        })
      }
      return result
    } catch (error) {
      get().addErrorLog({
        message: `任务停止失败: ${error.message}`,
        type: 'error'
      })
      throw error
    }
  },

  // 重新开始任务
  restartTask: async () => {
    const state = get()
    try {
      // 如果有正在运行的任务，先停止它
      if (state.currentTaskId && state.taskStatus.isRunning) {
        await get().stopTask()
        // 等待一秒后重新开始
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      
      // 重新执行任务
      return await get().executeTask()
    } catch (error) {
      get().addErrorLog({
        message: `任务重启失败: ${error.message}`,
        type: 'error'
      })
      throw error
    }
  },

  // 下载结果文件
  downloadResult: () => {
    const state = get()
    if (state.taskStatus.successFile) {
      // 使用successFile而不是resultFilePath
      apiService.downloadResult(state.taskStatus.successFile)
    } else if (state.taskStatus.resultFilePath) {
      const filename = state.taskStatus.resultFilePath.split('/').pop()
      apiService.downloadResult(filename)
    }
  },
  
  // 验证指定步骤
  validateStep: (stepNumber) => {
    const state = get()
    
    const stepValidations = {
      1: () => {
        // 数据准备验证（文件上传 + 字段选择）
        return state.fileData.fileName && 
               state.fileData.headers.length > 0 && 
               state.fieldSelection.selectedFields.length > 0
      },
      2: () => {
        // API配置验证
        return state.apiConfig.api_key && 
               state.apiConfig.api_url && 
               state.apiConfig.model
      },
      3: () => {
        // 提示词配置验证
        return state.promptConfig.system && 
               state.promptConfig.task && 
               state.promptConfig.output
      },
      4: () => {
        // 任务执行页面（只要前面步骤都完成就可以）
        return get().validateStep(1) && 
               get().validateStep(2) && 
               get().validateStep(3)
      }
    }
    
    return stepValidations[stepNumber] ? stepValidations[stepNumber]() : false
  },
  
  // 验证当前步骤
  validateCurrentStep: () => {
    const state = get()
    return get().validateStep(state.currentStep)
  },
  
  // 获取配置摘要
  getConfigSummary: () => {
    const state = get()
    
    return {
      api: {
        type: state.apiConfig.api_type === 'llm' ? '通用LLM' : '阿里百炼Agent',
        url: state.apiConfig.api_url,
        model: state.apiConfig.model || state.apiConfig.app_id
      },
      file: {
        name: state.fileData.fileName,
        size: state.fileData.fileSize > 1024 * 1024 
          ? `${(state.fileData.fileSize / 1024 / 1024).toFixed(1)}MB`
          : `${(state.fileData.fileSize / 1024).toFixed(1)}KB`,
        rows: state.fileData.totalRows,
        columns: state.fileData.totalColumns
      },
      fields: {
        selection: state.fieldSelection.selectedFieldNames.length > 0 
          ? state.fieldSelection.selectedFieldNames.join(', ')
          : `第${state.fieldSelection.selectedFields.join(', ')}列`,
        range: state.fieldSelection.endRow 
          ? `${state.fieldSelection.startRow}-${state.fieldSelection.endRow}`
          : `${state.fieldSelection.startRow}-${state.fileData.totalRows}`
      },
      prompt: {
        format: 'JSON',
        template: state.promptConfig.system ? '自定义模板' : '默认模板'
      }
    }
  },
  
  // 重置所有状态
  reset: () => set({
    currentStep: 1,
    completedSteps: [],
    currentTaskId: null,
    apiConfig: {
      api_type: 'llm',
      provider: 'deepseek',
      api_url: 'https://api.deepseek.com',
      api_key: '',
      model: 'deepseek-chat',
      app_id: ''
    },
    fileData: {
      fileName: '',
      fileSize: 0,
      totalRows: 0,
      totalColumns: 0,
      previewData: [],
      headers: [],
      uploadedFile: null
    },
    fieldSelection: {
      selectedFields: [],
      selectedFieldNames: [],
      startRow: 1,
      endRow: null
    },
    promptConfig: {
      system: '',
      task: '',
      output: '',
      variables: '',
      examples: ''
    },
    taskStatus: {
      isRunning: false,
      isCompleted: false,
      currentStatus: 'idle',
      startTime: null,
      endTime: null,
      totalCount: 0,
      processedCount: 0,
      successCount: 0,
      errorCount: 0,
      progress: 0,
      speed: 0,
      estimatedTimeLeft: 0,
      logs: [],
      errorLogs: [],
      resultFilePath: null,
      successFile: null,
      errorFile: null,
      lastUpdateTime: null
    }
  }),

  // 导出配置文件
  exportConfig: () => {
    const state = get()
    
    const config = {
      version: "1.0",
      timestamp: new Date().toISOString(),
      apiConfig: {
        api_type: state.apiConfig.api_type,
        provider: state.apiConfig.provider,
        api_url: state.apiConfig.api_url,
        api_key: state.apiConfig.api_key, // 注意：实际生产环境可能需要考虑安全性
        model: state.apiConfig.model,
        app_id: state.apiConfig.app_id
      },
      promptConfig: {
        system: state.promptConfig.system,
        task: state.promptConfig.task,
        output: state.promptConfig.output,
        variables: state.promptConfig.variables,
        examples: state.promptConfig.examples
      },
      metadata: {
        description: "LLM批处理工具配置文件",
        exportTime: new Date().toLocaleString('zh-CN')
      }
    }
    
    // 创建下载链接
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `llm-batch-config-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    
    return config
  },

  // 导入配置文件
  importConfig: async (file) => {
    try {
      const text = await file.text()
      const config = JSON.parse(text)
      
      // 验证配置文件格式
      if (!config.apiConfig || !config.promptConfig) {
        throw new Error('配置文件格式不正确，缺少必要的配置项')
      }
      
      const state = get()
      
      // 应用API配置
      if (config.apiConfig) {
        set({
          apiConfig: {
            ...state.apiConfig,
            ...config.apiConfig
          }
        })
      }
      
      // 应用提示词配置
      if (config.promptConfig) {
        set({
          promptConfig: {
            ...state.promptConfig,
            ...config.promptConfig
          }
        })
      }
      
      // 更新完成状态
      const newCompletedSteps = [...state.completedSteps]
      
      // 如果数据准备已完成，且导入了有效配置，则标记步骤2和3为完成
      if (get().validateStep(1)) {
        if (!newCompletedSteps.includes(1)) newCompletedSteps.push(1)
        if (get().validateStep(2) && !newCompletedSteps.includes(2)) newCompletedSteps.push(2)
        if (get().validateStep(3) && !newCompletedSteps.includes(3)) newCompletedSteps.push(3)
      }
      
      set({
        completedSteps: newCompletedSteps
      })
      
      return {
        success: true,
        message: '配置文件导入成功！API配置和提示词配置已自动填充。',
        config: config
      }
      
    } catch (error) {
      console.error('配置导入失败:', error)
      return {
        success: false,
        message: `配置导入失败: ${error.message}`,
        error: error
      }
    }
  },

  // 验证配置完整性
  validateConfigIntegrity: () => {
    const state = get()
    
    const validation = {
      isValid: true,
      missingItems: [],
      warnings: []
    }
    
    // 检查数据准备
    if (!get().validateStep(1)) {
      validation.isValid = false
      validation.missingItems.push('数据准备未完成')
    }
    
    // 检查API配置
    if (!get().validateStep(2)) {
      validation.isValid = false
      validation.missingItems.push('API配置未完成')
    }
    
    // 检查提示词配置
    if (!get().validateStep(3)) {
      validation.isValid = false
      validation.missingItems.push('提示词配置未完成')
    }
    
    // 检查API密钥是否为测试密钥
    if (state.apiConfig.api_key && state.apiConfig.api_key.startsWith('test-')) {
      validation.warnings.push('当前使用测试API密钥，请确保在生产环境中使用真实密钥')
    }
    
    return validation
  }
}))

export default useAppStore 