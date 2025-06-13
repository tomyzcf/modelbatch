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

// 静态文件服务配置 - 支持便携版打包
const isDev = process.env.NODE_ENV === 'development'

// 在便携版中，尝试多个可能的静态文件路径
const possiblePaths = isDev ? 
  [path.join(__dirname, '../dist')] :
  [
    path.join(process.cwd(), 'dist'),           // ./dist (相对于当前工作目录)
    path.join(__dirname, '../dist'),           // ../dist (相对于server目录)
    path.resolve('./dist')                     // 绝对路径解析
  ]

let staticPath = null
let staticConfigured = false

// 尝试找到存在的静态文件路径
for (const testPath of possiblePaths) {
try {
    await fs.access(testPath)
    await fs.access(path.join(testPath, 'index.html'))
    staticPath = testPath
  app.use(express.static(staticPath))
  console.log('静态文件服务路径:', staticPath)
    staticConfigured = true
    break
} catch (error) {
    console.log('尝试路径失败:', testPath)
  }
}

if (!staticConfigured) {
  console.error('无法找到静态文件目录，尝试的路径:', possiblePaths)
}

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
    
    // 解析数据处理范围参数
    const processOptions = {
      startPos: startPos ? parseInt(startPos) - 1 : 0, // 转换为基于0的索引
      endPos: endPos ? parseInt(endPos) : null  // endPos在BatchReader中会被正确处理
    }
    
    // 生成任务ID
    const taskId = `task_${Date.now()}`
    
    console.log('开始执行批处理任务:', {
      inputFile: inputFilePath,
      selectedFields,
      processOptions,
      apiConfig: { ...apiConfig, api_key: apiConfig.api_key ? 'sk-***' : 'missing' },
      promptConfig
    })

    // 创建批处理器实例
    const batchProcessor = new BatchProcessor()
    
    // 设置进度回调
    batchProcessor.setProgressCallback((data) => {
      broadcast(data);
    });
    
    // 存储活动任务，以便后续管理
    activeTasks.set(taskId, batchProcessor)

    // 异步执行任务
    executeTaskAsync(taskId, batchProcessor, inputFilePath, selectedFields, apiConfig, promptConfig, processOptions)
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
async function executeTaskAsync(taskId, batchProcessor, dataFilePath, selectedFields, apiConfig, promptConfig, processOptions = {}) {
  try {
    // 广播任务开始
    broadcast({
      type: 'started',
      taskId: taskId,
      message: '任务开始执行...'
    })

    // 执行批处理任务
    const result = await batchProcessor.startProcessing(dataFilePath, selectedFields, apiConfig, promptConfig, processOptions)
    
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
        skippedCount: result.skippedCount,
        taskId: result.taskId,
        outputFiles: result.outputFiles,
        successFile: result.outputFiles?.successFile ? path.basename(result.outputFiles.successFile) : null,
        errorFile: result.outputFiles?.errorFile ? path.basename(result.outputFiles.errorFile) : null,
        resultFilePath: result.outputFiles?.successFile || null
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
    console.log(`请求下载文件: ${filename}`)
    
    // 直接在tasks目录中查找文件，使用与TaskManager一致的路径
    const tasksDir = path.join(process.cwd(), 'outputData/tasks')
    let filePath = null
    
    try {
      const taskDirs = await fs.readdir(tasksDir)
      console.log(`在tasks目录中查找，发现 ${taskDirs.length} 个任务目录`)
      
      for (const taskDir of taskDirs) {
        const taskFilePath = path.join(tasksDir, taskDir, filename)
        const exists = await fs.access(taskFilePath).then(() => true).catch(() => false)
        if (exists) {
          filePath = taskFilePath
          console.log(`找到文件: ${filePath}`)
          break
        }
      }
    } catch (error) {
      console.log('查找tasks目录时出错:', error.message)
      return res.status(404).json({ error: 'tasks目录不存在或无法访问' })
    }
    
    if (!filePath) {
      console.log(`文件 ${filename} 未找到`)
      return res.status(404).json({ error: '文件不存在' })
    }
    
    // 确保文件存在
    await fs.access(filePath)
    
    console.log(`准备下载文件: ${filePath}`)
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

// 捕获所有非API路由，用于SPA路由
app.get('*', (req, res) => {
  // 跳过API路由
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API路由不存在' })
  }
  
  // 为SPA提供index.html
  const indexPath = path.join(staticPath, 'index.html')
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('发送index.html失败:', err)
      res.status(500).send('服务器内部错误')
    }
  })
})

// 初始化必要目录
async function initializeDirectories() {
  const dirs = [
    path.join(process.cwd(), 'temp'),
    path.join(process.cwd(), 'temp/uploads'),
    path.join(process.cwd(), 'temp/config'),
    path.join(process.cwd(), 'outputData'),
    path.join(process.cwd(), 'outputData/tasks')
  ]
  
  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true })
      console.log(`目录已创建: ${dir}`)
    } catch (error) {
      console.warn(`目录创建失败: ${dir}`, error.message)
    }
  }
}

// 启动服务器 - 支持动态端口选择
const DEFAULT_PORT = 3001
const PORT = parseInt(process.env.PORT) || DEFAULT_PORT

// 设置Logger的WebSocket广播回调
Logger.setBroadcastCallback(broadcast);

// 尝试启动服务器，如果端口被占用则尝试其他端口
function startServer(port) {
  const serverInstance = server.listen(port, async () => {
    console.log(`后端服务器启动在端口 ${port}`)
    console.log(`WebSocket服务器启动在端口 ${port}`)
    console.log(`访问地址: http://localhost:${port}`)
  
  // 初始化目录
  await initializeDirectories()
  
    // 自动打开浏览器（便携版和EXE模式下）
    // 检测多种便携版条件：环境变量、pkg打包、目录包含portable、或者存在start-tool.bat启动脚本
    const isPortable = process.env.PORTABLE_MODE === 'true' || 
                      process.pkg || 
                      process.cwd().includes('portable') ||
                      process.cwd().includes('LLM') ||  // GitHub构建版本包含LLM
                      await Promise.all([
                        fs.access('start-tool.bat').then(() => true).catch(() => false),
                        fs.access('../start-tool.bat').then(() => true).catch(() => false),
                        fs.access('../../start-tool.bat').then(() => true).catch(() => false)
                      ]).then(results => results.some(Boolean))
    
    if (isPortable) {
      console.log('检测到便携版环境，准备打开浏览器...')
      try {
        // 延迟3秒让服务器完全启动
        await new Promise(resolve => setTimeout(resolve, 3000))
        try {
          const { spawn } = await import('child_process')
          const url = `http://localhost:${port}`
          
          // Windows
          if (process.platform === 'win32') {
            spawn('cmd', ['/c', 'start', url], { detached: true, stdio: 'ignore' })
            console.log(`已打开浏览器访问: ${url}`)
          }
        } catch (err) {
          console.log(`自动打开浏览器失败: ${err.message}`)
          console.log(`请手动访问: http://localhost:${port}`)
        }
      } catch (error) {
        console.warn('自动打开浏览器失败:', error.message)
        console.log(`请手动访问: http://localhost:${port}`)
      }
    } else {
      console.log('未检测到便携版环境，跳过浏览器自动打开')
      console.log(`请手动访问: http://localhost:${port}`)
    }
})
  
  serverInstance.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      if (port < DEFAULT_PORT + 10) {
        console.log(`端口 ${port} 被占用，尝试端口 ${port + 1}...`)
        startServer(port + 1)
      } else {
        console.error(`无法找到可用端口 (尝试了 ${DEFAULT_PORT}-${port})`)
        console.error('请手动停止占用端口的服务或设置环境变量 PORT 指定其他端口')
        process.exit(1)
      }
    } else {
      console.error('服务器启动失败:', err)
      process.exit(1)
    }
  })
}

startServer(PORT)

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