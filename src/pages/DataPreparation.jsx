import React, { useState, useCallback, useEffect } from 'react'
import { 
  Typography, 
  Card, 
  Upload, 
  Button, 
  Table, 
  Alert, 
  Space, 
  Statistic, 
  Row, 
  Col,
  Progress,
  message,
  Spin,
  Checkbox,
  InputNumber,
  Tag,
  Collapse,
  Steps,
  Divider
} from 'antd'
import { 
  InboxOutlined, 
  FileExcelOutlined, 
  DeleteOutlined,
  EyeOutlined,
  UploadOutlined,
  TableOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  SettingOutlined
} from '@ant-design/icons'
import useAppStore from '../stores/appStore'
import { parseFile } from '../utils/fileParser'

const { Title, Text, Paragraph } = Typography
const { Dragger } = Upload

function DataPreparation() {
  const { 
    fileData, 
    setFileData, 
    fieldSelection,
    setFieldSelection,
    uploadFile,
    setCurrentStep 
  } = useAppStore()
  
  // 上传相关状态
  const [uploading, setUploading] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  
  // 字段选择相关状态
  const [selectedFields, setSelectedFields] = useState([])
  const [startRow, setStartRow] = useState(1)
  const [endRow, setEndRow] = useState(null)

  // 页面状态控制
  const [currentPhase, setCurrentPhase] = useState('upload') // 'upload' | 'preview' | 'configure'

  // 初始化字段选择状态
  useEffect(() => {
    if (fieldSelection.selectedFields.length > 0) {
      setSelectedFields(fieldSelection.selectedFields)
    }
    setStartRow(fieldSelection.startRow || 1)
    setEndRow(fieldSelection.endRow)
  }, [fieldSelection])

  // 根据文件数据判断当前阶段
  useEffect(() => {
    if (fileData.fileName && fileData.headers.length > 0) {
      setCurrentPhase('preview')
    } else {
      setCurrentPhase('upload')
    }
  }, [fileData])

  // 处理文件上传
  const handleFileUpload = useCallback(async (file) => {
    setUploading(true)
    setUploadProgress(0)
    
    try {
      // 模拟上传进度
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return 90
          }
          return prev + 10
        })
      }, 100)

      // 上传文件到后端
      const uploadedFile = await uploadFile(file)
      
      clearInterval(progressInterval)
      setUploadProgress(100)
      
      // 解析文件内容
      setParsing(true)
      const parsedData = await parseFile(file)
      
      // 处理预览数据格式
      const previewData = parsedData.preview ? parsedData.preview.map(row => {
        return parsedData.headers.map(header => row[header] || '')
      }) : []
      
      // 更新文件数据
      setFileData({
        fileName: file.name,
        fileSize: file.size,
        totalRows: parsedData.totalRows,
        totalColumns: parsedData.totalColumns,
        previewData: previewData,
        headers: parsedData.headers,
        uploadedFile: uploadedFile
      })
      
      // 自动全选所有字段
      const allFieldIndexes = parsedData.headers.map((_, index) => index)
      setSelectedFields(allFieldIndexes)
      
      // 更新字段选择状态
      const selectedFieldNames = allFieldIndexes.map(index => parsedData.headers[index])
      setFieldSelection({
        selectedFields: allFieldIndexes,
        selectedFieldNames: selectedFieldNames,
        startRow: 1,
        endRow: parsedData.totalRows
      })
      
      message.success('文件上传和解析完成！已自动选择所有字段')
      
    } catch (error) {
      console.error('文件处理失败:', error)
      message.error(`文件处理失败: ${error.message}`)
    } finally {
      setUploading(false)
      setParsing(false)
      setUploadProgress(0)
    }
    
    return false
  }, [uploadFile, setFileData, setFieldSelection])

  // 删除文件
  const handleRemoveFile = () => {
    setFileData({
      fileName: '',
      fileSize: 0,
      totalRows: 0,
      totalColumns: 0,
      previewData: [],
      headers: [],
      uploadedFile: null
    })
    setSelectedFields([])
    setStartRow(1)
    setEndRow(null)
    setCurrentPhase('upload')
    message.info('文件已移除')
  }

  // 处理单个字段选择
  const handleFieldCheck = (fieldIndex, checked) => {
    let newSelectedFields
    if (checked) {
      newSelectedFields = [...selectedFields, fieldIndex].sort((a, b) => a - b)
    } else {
      newSelectedFields = selectedFields.filter(index => index !== fieldIndex)
    }
    
    setSelectedFields(newSelectedFields)
    updateFieldSelection({ selectedFields: newSelectedFields })
  }

  // 处理全选/取消全选
  const handleSelectAll = (checked) => {
    if (checked) {
      const allFields = fileData.headers.map((_, index) => index)
      setSelectedFields(allFields)
      updateFieldSelection({ selectedFields: allFields })
    } else {
      setSelectedFields([])
      updateFieldSelection({ selectedFields: [] })
    }
  }

  // 处理行数范围
  const handleRowRangeChange = (type, value) => {
    if (type === 'start') {
      setStartRow(value)
      updateFieldSelection({ startRow: value })
    } else {
      setEndRow(value)
      updateFieldSelection({ endRow: value })
    }
  }

  // 更新字段选择状态
  const updateFieldSelection = (updates) => {
    const selectedFieldNames = []
    if (updates.selectedFields) {
      updates.selectedFields.forEach(index => {
        if (fileData.headers[index]) {
          selectedFieldNames.push(fileData.headers[index])
        }
      })
    }
    
    setFieldSelection({
      ...fieldSelection,
      ...updates,
      selectedFieldNames
    })
  }

  // 文件上传配置
  const uploadProps = {
    name: 'file',
    multiple: false,
    accept: '.csv,.xlsx,.xls,.json',
    beforeUpload: handleFileUpload,
    showUploadList: false,
    disabled: uploading || parsing
  }

  // 增强的表格列配置 - 在表头集成选择功能
  const columns = fileData.headers.map((header, index) => ({
    title: (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Checkbox
          checked={selectedFields.includes(index)}
          onChange={(e) => handleFieldCheck(index, e.target.checked)}
        />
        <div>
          <div style={{ fontWeight: 'bold' }}>{header}</div>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>第{index + 1}列</div>
        </div>
      </div>
    ),
    dataIndex: index.toString(),
    key: index.toString(),
    width: 200,
    ellipsis: true,
    className: selectedFields.includes(index) ? 'selected-column' : '',
    render: (text) => (
      <span title={text}>
        {text !== null && text !== undefined ? text.toString() : '-'}
      </span>
    )
  }))

  // 表格数据
  const tableData = fileData.previewData.map((row, index) => ({
    key: index,
    ...row.reduce((acc, cell, cellIndex) => {
      acc[cellIndex.toString()] = cell
      return acc
    }, {})
  }))

  // 计算处理范围
  const totalDataRows = fileData.totalRows || 0
  const effectiveEndRow = endRow || totalDataRows
  const effectiveStartRow = Math.max(1, startRow)
  const isConfigValid = selectedFields.length > 0

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <Row gutter={24}>
        {/* 主要内容区域 */}
        <Col span={24}>
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {/* 页面标题和进度 */}
            <div>
              <Title level={4}>
                <TableOutlined style={{ marginRight: 8 }} />
                数据准备
              </Title>
              <Paragraph type="secondary">
                上传数据文件，选择要处理的字段和设置处理范围。
              </Paragraph>
            </div>

            {/* 文件上传区域 */}
            {currentPhase === 'upload' ? (
              <Card>
                <Dragger {...uploadProps} style={{ padding: '40px 20px' }}>
                  <p className="ant-upload-drag-icon">
                    <InboxOutlined style={{ fontSize: 48, color: '#1890ff' }} />
                  </p>
                  <p className="ant-upload-text">
                    点击或拖拽文件到此区域上传
                  </p>
                  <p className="ant-upload-hint">
                    支持 CSV、Excel (.xlsx/.xls)、JSON 格式文件，单个文件大小不超过 50MB
                  </p>
                </Dragger>
                
                {/* 上传和解析进度 */}
                {uploading && (
                  <div style={{ marginTop: 16 }}>
                    <Text>正在上传文件...</Text>
                    <Progress percent={uploadProgress} status="active" />
                  </div>
                )}
                
                {parsing && (
                  <div style={{ marginTop: 16, textAlign: 'center' }}>
                    <Spin size="large" />
                    <div style={{ marginTop: 8 }}>
                      <Text>正在解析文件内容...</Text>
                    </div>
                  </div>
                )}
              </Card>
            ) : (
              <>
                {/* 紧凑的文件信息条 */}
                <Card size="small">
                  <Row gutter={16} align="middle">
                    <Col flex={1}>
                      <Space>
                        <FileExcelOutlined style={{ color: '#1890ff' }} />
                        <div>
                          <Text strong>{fileData.fileName}</Text>
                          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                            {fileData.fileSize > 1024 * 1024 
                              ? `${(fileData.fileSize / 1024 / 1024).toFixed(1)} MB`
                              : `${(fileData.fileSize / 1024).toFixed(1)} KB`
                            } · {fileData.totalRows} 行 · {fileData.totalColumns} 列
                          </div>
                        </div>
                      </Space>
                    </Col>
                    <Col>
                      <Button 
                        danger 
                        size="small"
                        icon={<DeleteOutlined />} 
                        onClick={handleRemoveFile}
                      >
                        重新上传
                      </Button>
                    </Col>
                  </Row>
                </Card>

                {/* 数据预览与字段选择 */}
                <Card 
                  title={
                    <Space>
                      <EyeOutlined />
                      数据预览与字段选择
                      <Text type="secondary">(点击列标题选择字段)</Text>
                    </Space>
                  }
                  extra={
                    <Space>
                      <Button 
                        size="small"
                        onClick={() => handleSelectAll(true)}
                        disabled={selectedFields.length === fileData.headers.length}
                      >
                        全选
                      </Button>
                      <Button 
                        size="small"
                        onClick={() => handleSelectAll(false)}
                        disabled={selectedFields.length === 0}
                      >
                        清除
                      </Button>
                      <Text type="secondary">
                        已选择 {selectedFields.length}/{fileData.headers.length} 个字段
                      </Text>
                    </Space>
                  }
                >
                  {fileData.previewData.length > 0 ? (
                    <>
                      <Table
                        columns={columns}
                        dataSource={tableData.slice(0, 10)}
                        pagination={false}
                        scroll={{ x: Math.max(800, fileData.totalColumns * 200), y: 400 }}
                        size="small"
                        bordered
                        className="field-selection-table"
                      />
                    </>
                  ) : (
                    <Alert
                      type="warning"
                      message="无法预览数据"
                      description="文件可能为空或格式不正确，请检查文件内容。"
                      showIcon
                    />
                  )}
                </Card>

                {/* 字段选择摘要 */}
                {/* 已删除：重复的字段选择区域 */}

                {/* 处理范围设置 */}
                <Collapse 
                  defaultActiveKey={selectedFields.length > 0 ? ['range'] : []}
                  onChange={(keys) => {
                    if (keys.includes('range') && selectedFields.length === 0) {
                      message.warning('请先选择要处理的字段')
                    }
                  }}
                  items={[
                    {
                      key: 'range',
                      label: (
                        <Space>
                          <SettingOutlined />
                          处理范围设置
                          {effectiveStartRow && effectiveEndRow && (
                            <Tag color="green">
                              第{effectiveStartRow}-{effectiveEndRow}行 ({effectiveEndRow - effectiveStartRow + 1}行)
                            </Tag>
                          )}
                        </Space>
                      ),
                      collapsible: selectedFields.length === 0 ? "disabled" : "header",
                      children: (
                        <>
                          <Row gutter={24}>
                            <Col span={12}>
                              <Space direction="vertical" style={{ width: '100%' }}>
                                <Text strong>起始行数：</Text>
                                <InputNumber
                                  value={startRow}
                                  onChange={(value) => handleRowRangeChange('start', value)}
                                  min={1}
                                  max={totalDataRows}
                                  style={{ width: '100%' }}
                                  placeholder="从第几行开始处理"
                                />
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  从第几行开始处理数据（包含该行）
                                </Text>
                              </Space>
                            </Col>
                            <Col span={12}>
                              <Space direction="vertical" style={{ width: '100%' }}>
                                <Text strong>结束行数：</Text>
                                <InputNumber
                                  value={endRow}
                                  onChange={(value) => handleRowRangeChange('end', value)}
                                  min={effectiveStartRow}
                                  max={totalDataRows}
                                  style={{ width: '100%' }}
                                  placeholder="留空表示处理到最后一行"
                                />
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  处理到第几行结束，留空表示处理到最后一行
                                </Text>
                              </Space>
                            </Col>
                          </Row>
                        </>
                      )
                    }
                  ]}
                />

                {/* 配置完成提示 */}
                {isConfigValid && (
                  <Alert
                    type="success"
                    message="数据准备完成！"
                    description={`已选择 ${selectedFields.length} 个字段。可以进入下一步进行API配置。`}
                    icon={<CheckCircleOutlined />}
                    showIcon
                    action={
                      <Button 
                        type="primary" 
                        onClick={() => setCurrentStep(2)}
                      >
                        下一步：API配置
                      </Button>
                    }
                  />
                )}

                {/* 配置无效提示 */}
                {!isConfigValid && currentPhase === 'preview' && (
                  <Alert
                    type="warning"
                    message="请选择要处理的字段"
                    description="在表格上方点击列标题的复选框来选择要处理的字段，至少需要选择一个字段。"
                    showIcon
                  />
                )}
              </>
            )}
          </Space>
        </Col>

        {/* 右侧配置指导 */}
        {/* 已删除：占用空间的右侧配置指导区域 */}
      </Row>
    </div>
  )
}

export default DataPreparation 