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
        output: '{"result": "处理结果", "status": "处理状态"}',
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
                配置用于处理数据的提示词模板。使用JSON格式的结构化配置，可节省60-80%的token消耗。
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
                      💡 <strong>变量说明：</strong>使用 <code style={{ background: '#e6f7ff', padding: '2px 4px', borderRadius: 2 }}>{'{input_text}'}</code> 作为占位符，运行时会自动替换为实际的数据内容
                    </Text>
                  </div>
                  <TextArea
                    value={promptConfig.task || ''}
                    onChange={(e) => handleContentChange('task', e.target.value)}
                    placeholder="请基于以下信息进行分析：{input_text}"
                    rows={4}
                    style={{ marginTop: 4 }}
                  />
                  {/* 变量预览 */}
                  {promptConfig.task && promptConfig.task.includes('{input_text}') && (
                    <div style={{ marginTop: 8, padding: 8, background: '#f9f9f9', borderRadius: 4, fontSize: 12 }}>
                      <Text type="secondary">
                        <strong>预览示例：</strong>{promptConfig.task.replace('{input_text}', '张三,28,北京,工程师')}
                      </Text>
                    </div>
                  )}
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
                  <li><strong>Output：</strong>JSON输出格式</li>
                </ul>
              </div>
              <div>
                <Text strong>关键变量：</Text>
                <div style={{ marginTop: 4, padding: 6, background: '#f0f9ff', borderRadius: 4, fontSize: 12 }}>
                  <code>{'{input_text}'}</code> - 数据占位符<br/>
                  自定义变量在高级选项中配置
                </div>
              </div>
              <div>
                <Text strong>快速开始：</Text>
                <ul style={{ marginTop: 4, marginLeft: 16, color: '#666', fontSize: 12 }}>
                  <li>选择预设模板快速配置</li>
                  <li>或自定义System和Task内容</li>
                  <li>确保Output为有效JSON格式</li>
                </ul>
              </div>
              <Alert 
                message="💡 JSON格式可节省60-80%的token消耗" 
                type="info" 
                size="small" 
                showIcon={false}
                style={{ fontSize: 11, marginTop: 8 }}
              />
            </Space>
          </Card>
        </Col>

        {/* 预览模态框 */}
        <Modal
          title="提示词预览"
          open={previewVisible}
          onCancel={() => setPreviewVisible(false)}
          footer={[
            <Button key="copy" icon={<CopyOutlined />} onClick={() => {
              copyToClipboard(generatePreview())
              setPreviewVisible(false)
            }}>
              复制预览内容
            </Button>,
            <Button key="close" onClick={() => setPreviewVisible(false)}>
              关闭
            </Button>
          ]}
          width={800}
        >
          <div style={{ 
            background: '#f5f5f5', 
            padding: '16px', 
            borderRadius: '6px',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            maxHeight: '400px',
            overflow: 'auto'
          }}>
            {generatePreview()}
          </div>
        </Modal>
      </Row>
    </div>
  )
}

export default PromptConfig 