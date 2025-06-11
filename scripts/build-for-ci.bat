@echo off
chcp 65001 >nul
echo 🚀 CI环境构建便携版...

:: 检查必要文件
if not exist "package.json" (
    echo ❌ package.json 不存在
    exit /b 1
)

if not exist "server\index.js" (
    echo ❌ 服务器文件不存在
    exit /b 1
)

:: 创建输出目录
echo 📂 创建输出目录...
rmdir /s /q "dist\portable" 2>nul
mkdir "dist\portable\app\server"
mkdir "dist\portable\app\dist"
mkdir "dist\portable\temp"
mkdir "dist\portable\outputData"

:: 复制服务器文件
echo 📦 复制服务器文件...
xcopy "server\*" "dist\portable\app\server\" /E /I /Y /Q
if errorlevel 1 goto error

:: 复制前端构建文件（排除便携版目录）
echo 📦 复制前端文件...
for /d %%i in (dist\*) do (
    if /i not "%%i"=="dist\portable" (
        xcopy "%%i\*" "dist\portable\app\dist\%%~ni\" /E /I /Y /Q
    )
)
for %%i in (dist\*) do (
    if /i not "%%~nxi"=="portable" (
        copy "%%i" "dist\portable\app\dist\" /Y >nul
    )
)

:: 复制核心依赖（仅必要的modules）
echo 📦 复制Node模块...
mkdir "dist\portable\app\node_modules"
for %%m in (express cors multer ws csv-parser papaparse xlsx yaml antd react react-dom) do (
    if exist "node_modules\%%m" (
        xcopy "node_modules\%%m" "dist\portable\app\node_modules\%%m\" /E /I /Y /Q
    )
)

:: 复制配置文件
echo 📦 复制配置文件...
copy "package.json" "dist\portable\app\" /Y >nul
copy "LICENSE" "dist\portable\" /Y >nul
copy "TERMS_OF_USE.md" "dist\portable\" /Y >nul

:: 创建启动脚本
echo 📝 创建启动脚本...
(
echo @echo off
echo chcp 65001 ^>nul
echo title LLM批处理工具
echo echo 🚀 启动 LLM批处理工具...
echo cd /d "%%~dp0app"
echo start /min cmd /c "node server/index.js"
echo timeout /t 3 ^>nul
echo start http://localhost:3001
echo echo ✅ 启动完成！访问: http://localhost:3001
echo pause
) > "dist\portable\启动工具.bat"

:: 验证构建结果
echo ✅ 验证构建结果...
if not exist "dist\portable\启动工具.bat" goto error
if not exist "dist\portable\app\server\index.js" goto error
if not exist "dist\portable\app\package.json" goto error

echo ✅ CI构建完成！
exit /b 0

:error
echo ❌ CI构建失败！
exit /b 1