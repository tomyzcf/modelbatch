# LLM批处理工具 - 部署指南

> 📖 完整的部署说明，支持便携版、开发环境和生产服务器部署

## 🎯 部署概述

本项目支持三种部署方式：
- **便携版部署**：适合单机使用，无需复杂配置
- **开发环境部署**：适合开发和调试
- **生产服务器部署**：适合团队使用和生产环境

选择适合你的部署方式开始使用。

## 📋 系统要求

### 基础环境
- **操作系统**: Windows 10+, macOS 10.15+, Ubuntu 18.04+
- **Node.js**: 16.0.0 或更高版本
- **内存**: 最少512MB，推荐1GB+
- **存储**: 至少500MB可用空间
- **网络**: 需要访问外部LLM API服务

### 端口要求
- `3001` - 后端API服务
- `5173` - 前端开发服务器
- `3000` - 前端生产服务器（可选）

## 🚀 快速部署

### 方法一：便携版部署（推荐）

**适合：单机使用、快速分发、不想配置开发环境**

```bash
# 1. 克隆仓库（开发机）
git clone <your-repository-url>
cd modelbatch

# 2. 安装依赖并构建
npm install
build-portable.bat

# 3. 分发便携包
# 将 dist/portable/ 文件夹复制到目标机器
# 双击 "启动工具.bat" 即可使用
```

便携版特点：
- ✅ 包含所有必要文件
- ✅ 一键启动，自动打开浏览器
- ✅ 无需配置，开箱即用
- ⚠️ 需要目标机器已安装Node.js

### 方法二：开发环境部署

**适合：开发调试、功能定制、源码修改**

```bash
# 1. 克隆仓库
git clone <your-repository-url>
cd modelbatch

# 2. 安装依赖
npm install

# 3. 启动开发服务
npm run dev:full
```

开发环境访问：
- 🌐 **前端开发服务器**: http://localhost:5173
- 🔧 **后端API服务**: http://localhost:3001

### 方法三：生产服务器部署

**适合：团队使用、生产环境、服务器托管**

```bash
# 1. 服务器准备
npm install
npm run build:production

# 2. 启动生产服务
npm run server

# 3. 访问应用
# http://your-server:3001
```

## 🏗️ 生产环境部署

### 1. 服务器准备

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y nodejs npm

# CentOS/RHEL
sudo yum install -y nodejs npm

# 验证安装
node --version  # 应该是 16.0.0+
npm --version
```

### 2. 应用部署

```bash
# 1. 上传代码到服务器
git clone <your-repository-url>
cd modelbatch

# 2. 安装生产依赖
npm ci --only=production

# 3. 构建前端
npm run build

# 4. 使用PM2管理进程（推荐）
npm install -g pm2

# 5. 创建PM2配置
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'llm-batch-backend',
    script: 'server/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    }
  }]
};
EOF

# 6. 启动服务
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 3. Nginx反向代理（可选）

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # 前端静态文件
    location / {
        root /path/to/modelbatch/dist;
        try_files $uri $uri/ /index.html;
    }
    
    # 后端API代理
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # WebSocket支持
    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 🐳 Docker部署

### 1. 创建Dockerfile

```dockerfile
# 前端构建阶段
FROM node:16-alpine AS frontend-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# 生产阶段
FROM node:16-alpine
WORKDIR /app

# 复制后端代码
COPY server/ ./server/
COPY package*.json ./

# 安装后端依赖
RUN npm ci --only=production

# 复制前端构建产物
COPY --from=frontend-build /app/dist ./dist

# 创建必要目录
RUN mkdir -p temp outputData

# 暴露端口
EXPOSE 3001

# 启动命令
CMD ["node", "server/index.js"]
```

### 2. 创建docker-compose.yml

```yaml
version: '3.8'

services:
  llm-batch:
    build: .
    ports:
      - "3001:3001"
    volumes:
      - ./outputData:/app/outputData
      - ./temp:/app/temp
    environment:
      - NODE_ENV=production
    restart: unless-stopped
    
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
    depends_on:
      - llm-batch
    restart: unless-stopped
```

### 3. 启动Docker服务

```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

## 🔧 环境配置

### 环境变量配置

创建 `.env` 文件：

```bash
# 服务配置
NODE_ENV=production
PORT=3001

# 文件上传配置
MAX_FILE_SIZE=50MB
UPLOAD_DIR=./temp/uploads

# 输出配置
OUTPUT_DIR=./outputData

# 日志配置
LOG_LEVEL=info
LOG_FILE=./backend.log
```

### 目录权限设置

```bash
# 设置必要的目录权限
chmod 755 temp/
chmod 755 outputData/
chmod 644 server/index.js
```

## 🔍 健康检查

### API健康检查

```bash
# 检查后端服务状态
curl http://localhost:3001/api/health

# 预期响应
{
  "status": "ok",
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

### 前端检查

访问 http://localhost:5173 或你配置的域名，确保页面正常加载。

## 🐛 故障排除

### 常见问题

#### 1. 端口冲突
```bash
# 查看端口占用
netstat -an | grep :3001
lsof -i :3001

# 杀死占用进程
kill -9 <PID>
```

#### 2. 依赖安装失败
```bash
# 清理缓存
npm cache clean --force
rm -rf node_modules package-lock.json

# 重新安装
npm install
```

#### 3. 文件权限问题
```bash
# 修复权限
sudo chown -R $USER:$USER .
chmod -R 755 .
```

#### 4. 内存不足
```bash
# 增加Node.js内存限制
node --max-old-space-size=2048 server/index.js
```

### 日志查看

```bash
# 查看后端日志
tail -f backend.log

# PM2日志
pm2 logs llm-batch-backend

# Docker日志
docker-compose logs -f llm-batch
```

## 📊 性能优化

### 系统优化

```bash
# 增加文件描述符限制
echo "* soft nofile 65536" >> /etc/security/limits.conf
echo "* hard nofile 65536" >> /etc/security/limits.conf

# 优化TCP参数
echo "net.core.somaxconn = 65536" >> /etc/sysctl.conf
sysctl -p
```

### 应用优化

1. **启用gzip压缩**
2. **配置CDN**（如果需要）
3. **数据库连接池**（如果使用数据库）
4. **缓存策略**

## 🔐 安全配置

### 基础安全

```bash
# 1. 创建专用用户
sudo useradd -m -s /bin/bash llm-batch
sudo su - llm-batch

# 2. 设置防火墙
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 3001
sudo ufw enable

# 3. 定期更新
sudo apt update && sudo apt upgrade
```

### 应用安全

1. **API密钥安全**: 不要在代码中硬编码API密钥
2. **文件上传限制**: 已内置50MB限制和类型检查
3. **访问控制**: 根据需要配置IP白名单
4. **HTTPS**: 生产环境建议使用SSL证书

## 📈 监控和维护

### 监控脚本

```bash
#!/bin/bash
# health-check.sh

# 检查服务状态
if curl -f http://localhost:3001/api/health > /dev/null 2>&1; then
    echo "$(date): Service is healthy"
else
    echo "$(date): Service is down, restarting..."
    pm2 restart llm-batch-backend
fi
```

### 定期维护

```bash
# 清理临时文件
find temp/ -type f -mtime +7 -delete

# 日志轮转
logrotate /etc/logrotate.d/llm-batch

# 磁盘空间检查
df -h
```

## 🆘 支持和帮助

遇到问题时，请按以下顺序排查：

1. **查看日志文件**
2. **检查网络连接**
3. **验证配置文件**
4. **检查系统资源**
5. **重启服务**

如果问题仍然存在，请提供详细的错误日志和环境信息。

---

📝 **部署完成检查清单**:

- [ ] Node.js环境安装正确
- [ ] 项目依赖安装成功
- [ ] 前端构建完成
- [ ] 后端服务启动正常
- [ ] 端口访问正常
- [ ] API健康检查通过
- [ ] 文件上传功能正常
- [ ] WebSocket连接正常 