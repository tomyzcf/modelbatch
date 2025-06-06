import React, { useState, useEffect } from 'react'
import { 
  Typography, 
  Card, 
  Space, 
  Radio, 
  Input, 
  Button, 
  Alert, 
  Row, 
  Col,
  Select,
  message,
  Tooltip,
  Modal,
  Collapse
} from 'antd'
import { 
  EditOutlined, 
  FileTextOutlined, 
  BulbOutlined, 
  EyeOutlined,
  CopyOutlined,
  CheckCircleOutlined
} from '@ant-design/icons'
import useAppStore from '../stores/appStore'

// 导入模板
import dataExtractionTemplate from '../templates/dataExtraction.json'
import contentGenerationTemplate from '../templates/contentGeneration.json'
import classificationTemplate from '../templates/classification.json'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input
const { Option } = Select

// 预设模板
const PROMPT_TEMPLATES = {
  dataExtraction: dataExtractionTemplate,
  contentGeneration: contentGenerationTemplate,
  classification: classificationTemplate
}

function PromptConfig() {
  const { 
    promptConfig, 
    setPromptConfig,
    fileData,
    fieldSelection,
    setCurrentStep 
  } = useAppStore()
  
  const [jsonError, setJsonError] = useState('')
  const [previewVisible, setPreviewVisible] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(null)

  // 初始化默认值
  useEffect(() => {
    if (!promptConfig.system && !promptConfig.task) {
      setPromptConfig({
        system: '你是一个专业的AI助手，能够准确理解和处理用户的数据请求。',
        task: '请处理以下数据：\n\n{input_text}',
        output: '{\n  "result": "处理结果",\n  "status": "处理状态"\n}',
        variables: '',
        examples: ''
      })
    }
  }, [promptConfig, setPromptConfig])

  // 处理JSON内容更改
  const handleContentChange = (field, value) => {
    const newConfig = { ...promptConfig }
    newConfig[field] = value
    
    // 验证JSON格式
    if (field === 'output' || field === 'variables') {
      if (value.trim()) {
        try {
          JSON.parse(value)
          setJsonError('')
        } catch (error) {
          setJsonError(`${field === 'output' ? '输出格式' : '变量定义'}必须是有效的JSON格式`)
        }
      } else {
        setJsonError('')
      }
    }
    
    setPromptConfig(newConfig)
  }

  // 应用模板
  const handleApplyTemplate = (templateKey) => {
    const template = PROMPT_TEMPLATES[templateKey]
    if (template) {
      setPromptConfig({
        system: template.content.system,
        task: template.content.task,
        output: JSON.stringify(template.content.output, null, 2),
        variables: template.content.variables ? JSON.stringify(template.content.variables, null, 2) : '',
        examples: template.content.examples || ''
      })
      setSelectedTemplate(template.name)
      setJsonError('')
      message.success(`已应用模板：${template.name}`)
    }
  }

  // 验证提示词配置
  const validatePromptConfig = () => {
    const { system, task, output } = promptConfig
    if (!system || !task || !output) {
      return { valid: false, message: '请填写系统角色、任务描述和输出格式' }
    }
    if (jsonError) {
      return { valid: false, message: jsonError }
    }
    
    // 验证输出格式是否为有效JSON
    try {
      JSON.parse(output)
    } catch (error) {
      return { valid: false, message: '输出格式必须是有效的JSON格式' }
    }
    
    return { valid: true }
  }

  // 复制到剪贴板
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      message.success('已复制到剪贴板')
    }).catch(() => {
      message.error('复制失败')
    })
  }

  // 生成预览内容
  const generatePreview = () => {
    const { system, task, variables } = promptConfig
    let preview = `System: ${system}\n\nTask: ${task}`
    
    if (variables && variables.trim()) {
      try {
        const varsObj = JSON.parse(variables)
        preview += `\n\nVariables: ${JSON.stringify(varsObj, null, 2)}`
      } catch (error) {
        preview += `\n\nVariables: ${variables}`
      }
    }
    
    // 模拟变量替换
    preview = preview.replace('{input_text}', '[这里将显示实际的数据字段内容]')
    
    return preview
  }

  // 生成完整的API请求预览
  const generateFullApiPreview = () => {
    const { system, task, output, variables, examples } = promptConfig
    
    // 获取选中的字段数据 - 使用正确的fieldSelection
    const selectedFields = fileData.headers?.filter((_, index) => 
      fieldSelection.selectedFields?.includes(index)
    ) || []
    
    // 构建第一行数据示例（只包含选中的字段）
    const firstRowData = selectedFields.length > 0 && fileData.previewData && fileData.previewData[0] 
      ? selectedFields.map((field, index) => {
          const columnIndex = fileData.headers?.indexOf(field) || index
          return fileData.previewData[0][columnIndex] || ''
        }).join(',')
      : '张三,28,北京,工程师'
    
    // 构建完整的提示词内容（使用实际换行而不是转义字符）
    let fullPrompt = `System: ${system || '你是一个专业的AI助手，能够准确理解和处理用户的数据请求。'}\n\n`
    fullPrompt += `Task: ${(task || '请处理以下数据：{input_text}').replace('{input_text}', firstRowData)}\n\n`
    fullPrompt += `Output: ${output || '{ "result": "处理结果", "status": "处理状态" }'}\n\n`
    
    if (variables && variables.trim()) {
      fullPrompt += `Variables: ${variables}\n\n`
    }
    
    if (examples && examples.trim()) {
      fullPrompt += `Examples: ${examples}\n\n`
    }
    
    // Token预估（简单估算，大约4个字符=1个token）
    const estimatedTokens = Math.ceil(fullPrompt.length / 4)
    
    return {
      fullPrompt,
      firstRowData,
      selectedFields,
      estimatedTokens
    }
  }

  const validation = validatePromptConfig()
  const isValid = validation.valid

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Row gutter={24}>
        {/* 左侧主要内容 */}
        <Col span={18}>
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {/* 页面标题和说明 */}
            <div>
              <Title level={4}>
                <EditOutlined style={{ marginRight: 8 }} />
                提示词配置
              </Title>
              <Paragraph type="secondary">
                配置用于处理数据的提示词模板。
              </Paragraph>
            </div>

            {/* 数据文件信息 */}
            {fileData.fileName && (
              <Card size="small">
                <Space>
                  <Text type="secondary">当前文件：</Text>
                  <Text strong>{fileData.fileName}</Text>
                  <Text type="secondary">({fileData.totalRows} 行数据)</Text>
                </Space>
              </Card>
            )}

            {/* 预设模板选择 */}
            <Card title="预设模板" size="small">
              <div style={{ marginBottom: 12, fontSize: 12, color: '#666' }}>
                选择适合的模板快速开始，或跳过使用自定义配置
              </div>
              <Row gutter={[12, 12]}>
                {Object.entries(PROMPT_TEMPLATES).map(([key, template]) => (
                  <Col span={8} key={key}>
                    <Card 
                      size="small"
                      hoverable
                      onClick={() => handleApplyTemplate(key)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div style={{ textAlign: 'center' }}>
                        <Text strong>{template.name}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {template.description}
                        </Text>
                      </div>
                    </Card>
                  </Col>
                ))}
              </Row>
            </Card>

            {/* JSON格式配置 */}
            <Card title="提示词配置" extra={
              <Space>
                <Button 
                  size="small" 
                  icon={<EyeOutlined />}
                  onClick={() => setPreviewVisible(true)}
                >
                  预览
                </Button>
                <Button 
                  size="small" 
                  icon={<CopyOutlined />}
                  onClick={() => copyToClipboard(JSON.stringify(promptConfig, null, 2))}
                >
                  复制JSON
                </Button>
              </Space>
            }>
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                {/* System字段 */}
                <div>
                  <Text strong>System * <Text type="secondary">(系统角色描述)</Text></Text>
                  <TextArea
                    value={promptConfig.system || ''}
                    onChange={(e) => handleContentChange('system', e.target.value)}
                    placeholder="定义AI助手的身份和基本规则..."
                    rows={3}
                    style={{ marginTop: 8 }}
                  />
                </div>

                {/* Task字段 */}
                <div>
                  <Text strong>Task * <Text type="secondary">(任务描述)</Text></Text>
                  <div style={{ marginTop: 8, marginBottom: 8, padding: 8, background: '#f0f9ff', borderRadius: 4, fontSize: 12 }}>
                    <Text type="secondary">
                      💡 <strong>描述您希望对数据进行什么处理</strong>，系统会自动将数据内容填入您的指令中
                    </Text>
                  </div>
                  <TextArea
                    value={promptConfig.task ? promptConfig.task.replace('{input_text}', '').replace('请处理以下数据：\n\n', '').trim() : ''}
                    onChange={(e) => {
                      // 后台自动添加{input_text}占位符，用户只需填写处理需求
                      const userInput = e.target.value.trim()
                      const taskContent = userInput ? `请处理以下数据：\n\n{input_text}\n\n${userInput}` : `请处理以下数据：\n\n{input_text}`
                      handleContentChange('task', taskContent)
                    }}
                    placeholder="例如：分析这些数据的特征并分类归纳"
                    rows={4}
                    style={{ marginTop: 4 }}
                  />
                </div>

                {/* Output字段 */}
                <div>
                  <Text strong>Output * <Text type="secondary">(输出格式定义)</Text></Text>
                  <TextArea
                    value={promptConfig.output || ''}
                    onChange={(e) => handleContentChange('output', e.target.value)}
                    placeholder='{"result": "处理结果", "status": "状态"}'
                    rows={6}
                    style={{ marginTop: 8 }}
                    status={jsonError && jsonError.includes('输出格式') ? 'error' : ''}
                  />
                </div>

                {/* 高级选项 */}
                <Collapse 
                  ghost
                  items={[
                    {
                      key: 'advanced',
                      label: <Text type="secondary">高级选项 (Variables & Examples)</Text>,
                      children: (
                        <Space direction="vertical" style={{ width: '100%' }} size="middle">
                          {/* Variables字段（可选） */}
                          <div>
                            <Text strong>Variables <Text type="secondary">(变量定义，可选)</Text></Text>
                            <div style={{ marginTop: 4, marginBottom: 8, padding: 8, background: '#f6ffed', borderRadius: 4, fontSize: 12 }}>
                              <Text type="secondary">
                                💡 <strong>用法：</strong>定义可复用变量，如 <code>{'"language": "中文"'}</code>，在Task中用 <code>{'{language}'}</code> 引用
                              </Text>
                            </div>
                            <TextArea
                              value={promptConfig.variables || ''}
                              onChange={(e) => handleContentChange('variables', e.target.value)}
                              placeholder='{"language": "中文", "style": "正式"}'
                              rows={3}
                              style={{ marginTop: 4 }}
                              status={jsonError && jsonError.includes('变量定义') ? 'error' : ''}
                            />
                          </div>

                          {/* Examples字段（可选） */}
                          <div>
                            <Text strong>Examples <Text type="secondary">(示例数据，可选)</Text></Text>
                            <div style={{ marginTop: 4, marginBottom: 8, padding: 8, background: '#fff7e6', borderRadius: 4, fontSize: 12 }}>
                              <Text type="secondary">
                                💡 <strong>作用：</strong>提供输入输出示例，帮助AI更好理解任务要求，提高处理质量
                              </Text>
                            </div>
                            <TextArea
                              value={promptConfig.examples || ''}
                              onChange={(e) => handleContentChange('examples', e.target.value)}
                              placeholder="输入示例：产品名称：智能手表&#10;输出示例：{&quot;category&quot;: &quot;电子产品&quot;, &quot;type&quot;: &quot;可穿戴设备&quot;}"
                              rows={4}
                              style={{ marginTop: 4 }}
                            />
                          </div>
                        </Space>
                      )
                    }
                  ]}
                />
              </Space>
            </Card>

            {/* 错误提示 */}
            {!isValid && (
              <Alert
                type="error"
                message="配置验证失败"
                description={validation.message}
                showIcon
              />
            )}

            {/* 配置有效提示 */}
            {isValid && (
              <Alert
                type="success"
                message="提示词配置有效"
                description="配置格式正确，可以进行下一步"
                icon={<CheckCircleOutlined />}
                showIcon
                action={
                  <Button 
                    type="primary" 
                    onClick={() => setCurrentStep(4)}
                  >
                    下一步：任务执行
                  </Button>
                }
              />
            )}
          </Space>
        </Col>

        {/* 右侧配置说明 */}
        <Col span={6}>
          <Card title="快速指南" size="small" style={{ position: 'sticky', top: 24 }}>
            <Space direction="vertical" size="small">
              <div>
                <Text strong>必填字段：</Text>
                <ul style={{ marginTop: 4, marginLeft: 16, color: '#666', fontSize: 12 }}>
                  <li><strong>System：</strong>AI角色定义</li>
                  <li><strong>Task：</strong>处理任务描述</li>
                  <li><strong>Output：</strong>输出格式</li>
                </ul>
              </div>
              <div>
                <Text strong>快速开始：</Text>
                <ul style={{ marginTop: 4, marginLeft: 16, color: '#666', fontSize: 12 }}>
                  <li>选择预设模板快速配置</li>
                  <li>或自定义System和Task内容</li>
                  <li>确保Output为有效JSON格式</li>
                </ul>
              </div>
              
              {/* 完整预览按钮 */}
              <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12, marginTop: 12 }}>
                <Button 
                  type="primary" 
                  block 
                  icon={<EyeOutlined />}
                  onClick={() => setPreviewVisible(true)}
                  size="small"
                >
                  完整提示词预览
                </Button>
                <div style={{ marginTop: 8, fontSize: 11, color: '#999', textAlign: 'center' }}>
                  查看发送给API的完整内容
                </div>
              </div>
            </Space>
          </Card>
        </Col>

        {/* 预览模态框 */}
        <Modal
          title={
            <Space>
              <EyeOutlined />
              <span>完整提示词预览</span>
              <span style={{ fontSize: 12, color: '#999', fontWeight: 'normal' }}>
                (发送给API的实际内容)
              </span>
            </Space>
          }
          open={previewVisible}
          onCancel={() => setPreviewVisible(false)}
          footer={[
            <Button key="copy" icon={<CopyOutlined />} onClick={() => {
              const preview = generateFullApiPreview()
              copyToClipboard(preview.fullPrompt)
              setPreviewVisible(false)
            }}>
              复制完整内容
            </Button>,
            <Button key="close" onClick={() => setPreviewVisible(false)}>
              关闭
            </Button>
          ]}
          width={900}
        >
          {(() => {
            const preview = generateFullApiPreview()
            return (
              <div>
                {/* 统计信息 */}
                <div style={{ 
                  marginBottom: 16, 
                  padding: 12, 
                  background: '#f8f9fa', 
                  borderRadius: 6,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <Text strong>选中字段：</Text>
                    <Text style={{ marginLeft: 8 }}>
                      {preview.selectedFields.length > 0 
                        ? preview.selectedFields.join(', ') 
                        : '姓名, 年龄, 城市, 职业'
                      }
                    </Text>
                  </div>
                  <div>
                    <Text strong>预估Token：</Text>
                    <Text style={{ marginLeft: 8, color: '#1890ff' }}>~{preview.estimatedTokens}</Text>
                  </div>
                </div>
                
                {/* 示例数据 */}
                <div style={{ 
                  marginBottom: 16, 
                  padding: 8, 
                  background: '#e6f7ff', 
                  borderRadius: 4, 
                  fontSize: 12 
                }}>
                  <Text strong>第一条数据示例：</Text>
                  <br />
                  <code>{preview.firstRowData}</code>
                </div>
                
                {/* 完整提示词内容 */}
                <div style={{ 
                  background: '#f5f5f5', 
                  padding: '16px', 
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  maxHeight: '500px',
                  overflow: 'auto',
                  fontSize: '13px',
                  lineHeight: '1.6'
                }}>
                  {preview.fullPrompt}
                </div>
              </div>
            )
          })()}
        </Modal>
      </Row>
    </div>
  )
}

export default PromptConfig 