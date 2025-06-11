# 创建发布版本指南

## 🚀 如何触发自动构建和发布

项目已配置了GitHub Actions自动构建流程，当创建新版本标签时会自动构建便携版并发布到GitHub Releases。

## 📋 发布步骤

### 1. 推送更改到GitHub

```bash
# 确保所有更改已提交
git add -A
git commit -m "feat: 版本更新"

# 推送到GitHub
git push origin master
```

### 2. 创建版本标签

```bash
# 创建新版本标签（例如 v2.1.0）
git tag v2.1.0

# 推送标签到GitHub
git push origin v2.1.0
```

### 3. 自动构建触发

当推送标签到GitHub时，会自动触发以下流程：

1. **构建便携版**: 运行 `build-portable.bat` 脚本
2. **打包ZIP文件**: 生成 `LLM批处理工具-便携版-v2.1.0.zip`
3. **创建GitHub Release**: 自动创建发布页面
4. **上传文件**: 将ZIP文件上传到Releases

### 4. 验证发布

访问 https://github.com/tomyzcf/modelbatch/releases 查看：

- ✅ 新版本已创建
- ✅ ZIP文件已上传
- ✅ 发布说明已生成

## 📦 用户获取便携版

用户现在可以：

1. **直接下载**: 访问 https://github.com/tomyzcf/modelbatch/releases/latest
2. **选择版本**: 下载 `LLM批处理工具-便携版-v2.1.0.zip`
3. **解压使用**: 双击 `启动工具.bat` 即可使用

## ⚠️ 注意事项

### 版本命名规范
- 使用语义化版本号：`v主版本.次版本.修订版本`
- 例如：`v2.1.0`, `v2.1.1`, `v2.2.0`

### 发布前检查
- [ ] 确保 `build-portable.bat` 脚本正常工作
- [ ] 测试本地构建是否成功
- [ ] 验证README中的下载链接
- [ ] 确认LICENSE和TERMS_OF_USE.md文件完整

### 自动构建失败处理
如果GitHub Actions构建失败：

1. 查看Actions页面的错误日志
2. 修复问题后重新推送
3. 删除失败的标签：`git tag -d v2.1.0`
4. 重新创建标签

## 🎯 发布周期建议

- **主版本更新**: 重大功能变更或架构调整
- **次版本更新**: 新功能添加或重要改进
- **修订版本**: Bug修复或小幅优化

## 📝 发布说明模板

创建Release时建议包含：

```markdown
## ✨ 新功能
- 新增功能描述

## 🐛 修复
- 修复的问题描述

## 🔧 优化
- 性能或体验优化

## ⚠️ 重要提醒
- API费用用户自负
- 仅限非商业使用
- Windows 10+系统要求
``` 