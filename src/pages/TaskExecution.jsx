import React, { useState, useEffect, useRef } from 'react'
import { 
  Typography, 
  Card, 
  Space, 
  Button, 
  Progress, 
  Alert, 
  Row, 
  Col,
  Statistic,
  Tag,
  message,
  Result
} from 'antd'
import { 
  PlayCircleOutlined, 
  PauseCircleOutlined, 
  StopOutlined,
  DownloadOutlined,
  ReloadOutlined,
  FileExcelOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined
} from '@ant-design/icons'
import useAppStore from '../stores/appStore'
import apiService from '../utils/api'

const { Title, Text } = Typography

// 后端日志管理
let backendLogs = [];
const MAX_BACKEND_LOGS = 1000;

function TaskExecution() {
  const { 
    taskStatus, 
    validateCurrentStep,
    executeTask,
    pauseTask,
    resumeTask,
    stopTask,
    restartTask,
    initWebSocket,
    wsConnected,
    downloadResult,
    currentTaskId
  } = useAppStore()
  
  const [executing, setExecuting] = useState(false)
  
  // 初始化WebSocket连接
  useEffect(() => {
    if (!wsConnected) {
      initWebSocket()
    }
  }, [wsConnected, initWebSocket])
  
  // 监听后端日志
  useEffect(() => {
    if (wsConnected) {
      apiService.on('log', (data) => {
        // 检查重复日志：相同时间戳和消息内容
        const isDuplicate = backendLogs.some(log => 
          log.timestamp === data.timestamp && 
          log.message === data.message &&
          Math.abs(log.id - (Date.now() + Math.random())) < 100 // 100ms内的重复
        );
        
        if (!isDuplicate) {
          backendLogs.push({
            id: Date.now() + Math.random(),
            timestamp: data.timestamp,
            level: data.level,
            message: data.message,
            fullMessage: data.fullMessage
          });
          
          if (backendLogs.length > MAX_BACKEND_LOGS) {
            backendLogs = backendLogs.slice(-MAX_BACKEND_LOGS);
          }
          
          updateBackendLogsDisplay();
        }
      });
    }
  }, [wsConnected]);

  // 更新后端日志显示
  const updateBackendLogsDisplay = () => {
    const logElement = document.getElementById('backend-logs');
    if (logElement) {
      const logContent = backendLogs.map(log => {
        const color = {
          info: '#00ff00',
          warning: '#ffff00', 
          error: '#ff0000',
          success: '#00ffff'
        }[log.level] || '#00ff00';
        
        return `<div style="color: ${color}; margin-bottom: 2px;">${log.fullMessage}</div>`;
      }).join('');
      
      logElement.innerHTML = logContent || '<div>等待后端日志...</div>';
      logElement.scrollTop = logElement.scrollHeight;
    }
  };

  // 格式化持续时间
  const formatElapsedTime = () => {
    if (!taskStatus.startTime) return '-';
    
    const startTime = typeof taskStatus.startTime === 'string' ? 
      new Date(taskStatus.startTime) : taskStatus.startTime;
    
    // 如果任务已完成，使用结束时间
    const endTime = taskStatus.currentStatus === 'completed' && taskStatus.endTime ?
      (typeof taskStatus.endTime === 'string' ? new Date(taskStatus.endTime) : taskStatus.endTime) :
      new Date();
      
    const elapsedSeconds = Math.floor((endTime - startTime) / 1000);
    
    if (elapsedSeconds < 0) return '0秒';
    
    const hours = Math.floor(elapsedSeconds / 3600);
    const minutes = Math.floor((elapsedSeconds % 3600) / 60);
    const seconds = elapsedSeconds % 60;
    
    if (hours > 0) {
      return `${hours}小时${minutes}分钟${seconds}秒`;
    } else if (minutes > 0) {
      return `${minutes}分钟${seconds}秒`;
    } else {
      return `${seconds}秒`;
    }
  }

  // 获取状态颜色
  const getStatusColor = (status) => {
    switch (status) {
      case 'running': return 'processing'
      case 'completed': return 'success'
      case 'paused': return 'warning'
      case 'stopped': 
      case 'error': return 'error'
      default: return 'default'
    }
  }

  // 获取状态文本
  const getStatusText = (status) => {
    switch (status) {
      case 'idle': return '待执行'
      case 'running': return '执行中'
      case 'completed': return '已完成'
      case 'paused': return '已暂停'
      case 'stopped': return '已停止'
      case 'error': return '执行错误'
      default: return '未知状态'
    }
  }

  // 计算成功率
  const getSuccessRate = () => {
    if (taskStatus.processedCount === 0) return 0
    return Math.round((taskStatus.successCount / taskStatus.processedCount) * 100)
  }

  // 开始执行任务
  const handleStartTask = async () => {
    if (!validateCurrentStep()) {
      message.error('请先完成前面步骤的配置')
      return
    }

    setExecuting(true)
    try {
      await executeTask()
    } catch (error) {
      console.error('执行任务失败:', error)
      message.error('任务启动失败')
    } finally {
      setExecuting(false)
    }
  }

  // 暂停任务
  const handlePauseTask = async () => {
    try {
      await pauseTask()
      message.success('任务已暂停')
    } catch (error) {
      message.error('暂停任务失败')
    }
  }

  // 恢复任务
  const handleResumeTask = async () => {
    try {
      await resumeTask()
      message.success('任务已恢复')
    } catch (error) {
      message.error('恢复任务失败')
    }
  }

  // 停止任务
  const handleStopTask = async () => {
    try {
      await stopTask()
      message.success('任务已停止')
    } catch (error) {
      message.error('停止任务失败')
    }
  }

  // 重新执行任务
  const handleRestartTask = async () => {
    setExecuting(true)
    try {
      await restartTask()
    } catch (error) {
      console.error('重新执行任务失败:', error)
      message.error('重新执行失败')
    } finally {
      setExecuting(false)
    }
  }

  // 下载结果文件
  const handleDownload = () => {
      try {
      downloadResult()
      message.success('结果文件下载成功')
      } catch (error) {
        message.error('下载失败，请重试')
      }
  }



  // 根据任务状态确定页面阶段
  const getPagePhase = () => {
    if (taskStatus.currentStatus === 'completed') return 'completed'
    if (taskStatus.isRunning || taskStatus.currentStatus === 'running') return 'running'
    if (taskStatus.currentStatus === 'paused' || taskStatus.processedCount > 0) return 'running'
    return 'ready'
  }

  const pagePhase = getPagePhase()

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* 页面标题 */}
        <div>
          <Title level={4}>
            <PlayCircleOutlined style={{ marginRight: 8 }} />
            任务执行
          </Title>
            </div>
            
        {/* 任务控制 */}
        <Card>
          <Row gutter={24} align="middle">
            <Col flex="auto">
              <Space size="middle">
                {pagePhase === 'ready' && (
                  <Button 
                    type="primary" 
                    size="large"
                    icon={<PlayCircleOutlined />}
                    onClick={handleStartTask}
                    disabled={!validateCurrentStep() || executing}
                    loading={executing}
                  >
                    {executing ? '启动中...' : '开始执行'}
                  </Button>
                )}
                
                {pagePhase === 'running' && taskStatus.isRunning && (
                  <>
                    <Button 
                      size="large"
                      icon={<PauseCircleOutlined />}
                      onClick={handlePauseTask}
                    >
                      暂停
                    </Button>
                    <Button 
                      danger
                      size="large"
                      icon={<StopOutlined />}
                      onClick={handleStopTask}
                    >
                      停止
                    </Button>
                  </>
                )}
                
                {pagePhase === 'running' && taskStatus.currentStatus === 'paused' && (
                  <>
                    <Button 
                      type="primary"
                      size="large"
                      icon={<PlayCircleOutlined />}
                      onClick={handleResumeTask}
                    >
                      恢复
                    </Button>
                    <Button 
                      danger
                      size="large"
                      icon={<StopOutlined />}
                      onClick={handleStopTask}
                    >
                      停止
                    </Button>
                  </>
                )}
                
                {(pagePhase === 'completed' || taskStatus.currentStatus === 'stopped') && (
                  <Button 
                    size="large"
                    icon={<ReloadOutlined />}
                    onClick={handleRestartTask}
                    disabled={executing}
                    loading={executing}
                  >
                    重新执行
                  </Button>
                )}
              </Space>
            </Col>
            <Col>
              <Tag color={getStatusColor(taskStatus.currentStatus)} style={{ fontSize: 14, padding: '4px 12px' }}>
                {getStatusText(taskStatus.currentStatus)}
              </Tag>
            </Col>
          </Row>
        </Card>

        {/* 执行进度（仅在运行时显示） */}
        {pagePhase === 'running' && (
          <Card title="执行进度">
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              {/* 进度条 */}
              <div>
                <div style={{ marginBottom: 8 }}>
                  <Text strong>处理进度</Text>
                  <Text style={{ float: 'right' }}>
                    {taskStatus.processedCount} / {taskStatus.totalCount} 
                    ({taskStatus.progress}%)
                  </Text>
                </div>
                <Progress 
                  percent={taskStatus.progress} 
                  status={taskStatus.currentStatus === 'error' ? 'exception' : 'active'}
                  strokeColor={{
                    '0%': '#108ee9',
                    '100%': '#87d068',
                  }}
                />
              </div>

              {/* 统计信息 */}
              <Row gutter={16}>
                <Col span={6}>
                  <Statistic 
                    title="已处理" 
                    value={taskStatus.processedCount} 
                    suffix={`/ ${taskStatus.totalCount}`}
                  />
                </Col>
                <Col span={6}>
                  <Statistic 
                    title="成功" 
                    value={taskStatus.successCount} 
                    valueStyle={{ color: '#3f8600' }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic 
                    title="失败" 
                    value={taskStatus.errorCount} 
                    valueStyle={{ color: '#cf1322' }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic 
                    title="处理速度" 
                    value={taskStatus.speed} 
                    suffix="条/分钟"
                  />
                </Col>
              </Row>

              {/* 时间信息 */}
              {taskStatus.startTime && (
                <div>
                  <Text type="secondary">
                    开始时间: {new Date(taskStatus.startTime).toLocaleString()} | 
                    已执行: {formatElapsedTime()}
                  </Text>
                </div>
              )}
            </Space>
          </Card>
        )}

        {/* 任务完成结果 */}
        {pagePhase === 'completed' && (
          <Card>
      <Result
        status="success"
        title="数据处理完成！"
              subTitle={`成功处理 ${taskStatus.successCount} 条数据，失败 ${taskStatus.errorCount} 条，总耗时 ${formatElapsedTime()}`}
        extra={[
          <Button 
            type="primary" 
            icon={<DownloadOutlined />} 
            onClick={handleDownload} 
                  disabled={!taskStatus.successFile && !taskStatus.resultFilePath}
                  key="download"
          >
            下载结果文件
          </Button>
        ]}
      />
        </Card>
      )}

        {/* 实时日志（调试模式） */}
        <Card title="后端实时日志">
          <div 
            id="backend-logs" 
            style={{ 
              maxHeight: 300, 
              overflow: 'auto', 
              backgroundColor: '#000', 
              color: '#00ff00', 
              fontFamily: 'Consolas, monospace', 
              fontSize: '12px',
              padding: '10px',
              borderRadius: '4px'
            }}
          >
            <div>等待后端日志...</div>
              </div>
            </Card>

        {/* 错误信息 */}
        {taskStatus.currentStatus === 'error' && (
          <Alert
            type="error"
            message="任务执行失败"
            description="任务执行过程中发生错误，请检查后端日志并重新配置后重试。"
            showIcon
          />
        )}


      </Space>
    </div>
  )
}

export default TaskExecution 