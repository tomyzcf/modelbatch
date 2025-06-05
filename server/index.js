import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'
import YAML from 'yaml'
import spawn from 'cross-spawn'

// 导入新的批处理器
import BatchProcessor from './lib/core/batchProcessor.js'
import Logger from './lib/utils/logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server })

// 中间件
app.use(cors())
app.use(express.json())
app.use(express.static('dist'))

// 文件上传配置
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../temp/uploads')
    try {
      await fs.mkdir(uploadDir, { recursive: true })
      cb(null, uploadDir)
    } catch (error) {
      cb(error)
    }
  },
  filename: (req, file, cb) => {
    // 保持原文件名，添加时间戳避免冲突
    const timestamp = Date.now()
    const ext = path.extname(file.originalname)
    const name = path.basename(file.originalname, ext)
    cb(null, `${name}_${timestamp}${ext}`)
  }
})

const upload = multer({ 
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB限制
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.xlsx', '.xls', '.json']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowedTypes.includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error('不支持的文件格式'))
    }
  }
})

// WebSocket连接管理
const clients = new Set()

wss.on('connection', (ws) => {
  clients.add(ws)
  console.log('WebSocket客户端连接')
  
  ws.on('close', () => {
    clients.delete(ws)
    console.log('WebSocket客户端断开')
  })
})

// 广播消息给所有客户端
function broadcast(message) {
  const data = JSON.stringify(message)
  clients.forEach(client => {
    if (client.readyState === client.OPEN) {
      client.send(data)
    }
  })
}

// 当前运行的任务管理
const activeTasks = new Map()

// API路由

// 文件上传
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' })
    }

    const fileInfo = {
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      path: req.file.path,
      mimetype: req.file.mimetype
    }

    res.json({
      success: true,
      file: fileInfo
    })
  } catch (error) {
    console.error('文件上传错误:', error)
    res.status(500).json({ error: error.message })
  }
})

// 生成配置文件
app.post('/api/generate-config', async (req, res) => {
  try {
    const { apiConfig, promptConfig } = req.body

    // 创建配置目录
    const configDir = path.join(__dirname, '../../temp/config')
    await fs.mkdir(configDir, { recursive: true })

    // 生成API配置文件 (符合Python期望的YAML格式)
    const yamlConfig = {
      // 设置默认提供商
      default_provider: 'frontend_generated',
      
      // API提供商配置
      api_providers: {
        frontend_generated: {
          api_type: apiConfig.api_type === 'llm' ? 'llm_compatible' : apiConfig.api_type,
          api_key: apiConfig.api_key,
          base_url: apiConfig.api_url,
          concurrent_limit: 5
        }
      },
      
      // 输出配置
      output: {
        format: "csv",
        save_raw_response: true,
        encoding: "utf-8-sig"
      },
      
      // 处理配置
      process: {
        batch_size: 5,
        max_retries: 5,
        retry_interval: 0.5,
        max_memory_percent: 80
      }
    }

    // 根据API类型添加特定配置
    if (apiConfig.api_type === 'llm' || apiConfig.api_type === 'llm_compatible') {
      yamlConfig.api_providers.frontend_generated.model = apiConfig.model || 'deepseek-chat'
      yamlConfig.api_providers.frontend_generated.model_params = {
        temperature: 0.7,
        top_p: 0.8,
        max_tokens: 2000
      }
    } else if (apiConfig.api_type === 'aliyun_agent') {
      yamlConfig.api_providers.frontend_generated.app_id = apiConfig.app_id
    }

    const configPath = path.join(configDir, 'config.json')
    await fs.writeFile(configPath, JSON.stringify(yamlConfig, null, 2))

    // 生成提示词文件
    const promptPath = path.join(configDir, 'prompt.json')
    await fs.writeFile(promptPath, JSON.stringify(promptConfig, null, 2))

    console.log('生成配置文件:', configPath)
    console.log('配置内容:', yamlConfig)

    res.json({
      success: true,
      configPath,
      promptPath
    })
  } catch (error) {
    console.error('配置生成错误:', error)
    res.status(500).json({ error: error.message })
  }
})

// 执行批处理任务 - 重构版本
app.post('/api/execute-task', async (req, res) => {
  try {
    const { 
      inputFile, 
      configPath, 
      promptPath, 
      fields, 
      startPos, 
      endPos 
    } = req.body

    // 验证必要参数
    if (!inputFile || !promptPath) {
      return res.status(400).json({ 
        error: '缺少必要参数: inputFile 和 promptPath' 
      })
    }

    // 构建文件路径
    const inputFilePath = path.resolve(inputFile)
    
    // 读取API配置和提示词配置
    const promptConfig = JSON.parse(await fs.readFile(promptPath, 'utf8'))
    const apiConfig = configPath ? 
      JSON.parse(await fs.readFile(configPath, 'utf8')).api_providers.frontend_generated :
      null

    if (!apiConfig) {
      return res.status(400).json({ 
        error: '无法从配置文件中读取API配置' 
      })
    }

    // 解析字段索引（转换为基于0的索引）
    const selectedFields = fields ? fields.map(f => parseInt(f) - 1) : [0]
    
    // 生成任务ID
    const taskId = `task_${Date.now()}`
    
    console.log('开始执行批处理任务:', {
      inputFile: inputFilePath,
      selectedFields,
      apiConfig: { ...apiConfig, api_key: apiConfig.api_key ? 'sk-***' : 'missing' },
      promptConfig
    })

    // 创建批处理器实例
    const batchProcessor = new BatchProcessor()
    
    // 存储活动任务，以便后续管理
    activeTasks.set(taskId, batchProcessor)

    // 异步执行任务
    executeTaskAsync(taskId, batchProcessor, inputFilePath, selectedFields, apiConfig, promptConfig)
      .catch(error => {
        console.error(`任务 ${taskId} 执行失败:`, error)
        broadcast({
          type: 'failed',
          taskId: taskId,
          message: '任务执行失败: ' + error.message,
          error: error.message
        })
      })
      .finally(() => {
        // 清理任务记录
        activeTasks.delete(taskId)
      })

    // 立即返回成功响应
    res.json({
      success: true,
      message: '任务已启动',
      taskId: taskId
    })

  } catch (error) {
    console.error('任务启动错误:', error)
    res.status(500).json({ error: error.message })
  }
})

// 异步执行任务的函数
async function executeTaskAsync(taskId, batchProcessor, dataFilePath, selectedFields, apiConfig, promptConfig) {
  try {
    // 广播任务开始
    broadcast({
      type: 'started',
      taskId: taskId,
      message: '任务开始执行...'
    })

    // 执行批处理任务
    const result = await batchProcessor.startProcessing(dataFilePath, selectedFields, apiConfig, promptConfig)
    
    // 广播任务完成
    broadcast({
      type: 'completed',
      taskId: taskId,
      message: '任务执行完成',
      result: {
        totalRows: result.totalRows,
        processedRows: result.processedRows,
        successCount: result.successCount,
        errorCount: result.errorCount,
        taskId: result.taskId,
        outputFiles: result.outputFiles
      }
    })

    Logger.success(`任务 ${taskId} 执行完成`)

  } catch (error) {
    Logger.error(`任务 ${taskId} 执行失败: ${error.message}`)
    throw error
  }
}

// 任务管理API
app.get('/api/task/:taskId/status', (req, res) => {
  const taskId = req.params.taskId
  const task = activeTasks.get(taskId)
  
  if (task) {
    const progress = task.getProgress()
    res.json({
      success: true,
      taskId: taskId,
      status: 'running',
      progress: progress
    })
  } else {
    res.json({
      success: true,
      taskId: taskId,
      status: 'not_found'
    })
  }
})

app.post('/api/task/:taskId/pause', (req, res) => {
  const taskId = req.params.taskId
  const task = activeTasks.get(taskId)
  
  if (task) {
    task.pauseProcessing()
    res.json({ success: true, message: '任务已暂停' })
  } else {
    res.status(404).json({ error: '任务不存在' })
  }
})

app.post('/api/task/:taskId/stop', (req, res) => {
  const taskId = req.params.taskId
  const task = activeTasks.get(taskId)
  
  if (task) {
    task.stopProcessing()
    res.json({ success: true, message: '任务已停止' })
  } else {
    res.status(404).json({ error: '任务不存在' })
  }
})

// 获取任务列表
app.get('/api/tasks', (req, res) => {
  try {
    const taskProcessor = new BatchProcessor()
    const taskList = taskProcessor.getTaskList()
    
    res.json({
      success: true,
      tasks: taskList
    })
  } catch (error) {
    console.error('获取任务列表失败:', error)
    res.status(500).json({ error: error.message })
  }
})

// 清理过期任务
app.post('/api/tasks/cleanup', (req, res) => {
  try {
    const { maxAgeDays = 7 } = req.body
    const taskProcessor = new BatchProcessor()
    taskProcessor.cleanupOldTasks(maxAgeDays)
    
    res.json({
      success: true,
      message: `已清理 ${maxAgeDays} 天前的任务`
    })
  } catch (error) {
    console.error('清理任务失败:', error)
    res.status(500).json({ error: error.message })
  }
})

// 下载结果文件
app.get('/api/download/:filename', async (req, res) => {
  try {
    const filename = req.params.filename
    const filePath = path.join(__dirname, '../../outputData', filename)
    
    // 检查文件是否存在
    await fs.access(filePath)
    
    res.download(filePath, filename)
  } catch (error) {
    console.error('文件下载错误:', error)
    res.status(404).json({ error: '文件不存在' })
  }
})

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 启动服务器
const PORT = process.env.PORT || 3001

server.listen(PORT, () => {
  console.log(`后端服务器启动在端口 ${PORT}`)
  console.log(`WebSocket服务器启动在端口 ${PORT}`)
})

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，正在关闭服务器...')
  server.close(() => {
    console.log('服务器已关闭')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('收到SIGINT信号，正在关闭服务器...')
  server.close(() => {
    console.log('服务器已关闭')
    process.exit(0)
  })
}) 