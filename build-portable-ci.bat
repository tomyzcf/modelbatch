@echo off
chcp 65001 >nul
echo 🚀 构建便携版 LLM批处理工具（CI模式）...
echo.
echo ⚠️  重要提醒：
echo    - 本软件仅限个人学习研究使用
echo    - 禁止商业用途和盈利使用
echo    - API费用由用户自行承担
echo    - 使用风险由用户自担
echo.

echo.
echo 🏗️ 第1步: 构建前端应用...
call npm run build
if errorlevel 1 goto error

echo.
echo 📂 第2步: 创建便携包目录...
if exist "dist\portable" rmdir /s /q "dist\portable"
mkdir "dist\portable"
mkdir "dist\portable\app"
mkdir "dist\portable\temp"
mkdir "dist\portable\outputData"

echo.
echo 📦 第3步: 复制应用文件...
robocopy "server" "dist\portable\app\server" /E /NFL /NDL /NJH /NJS
robocopy "dist" "dist\portable\app\dist" /E /NFL /NDL /NJH /NJS
robocopy "node_modules" "dist\portable\app\node_modules" /E /NFL /NDL /NJH /NJS
copy "package.json" "dist\portable\app\" >nul
copy "LICENSE" "dist\portable\" >nul
copy "TERMS_OF_USE.md" "dist\portable\" >nul

echo.
echo 📝 第4步: 创建启动脚本...
echo @echo off > "dist\portable\启动工具.bat"
echo setlocal enabledelayedexpansion >> "dist\portable\启动工具.bat"
echo chcp 65001 ^>nul >> "dist\portable\启动工具.bat"
echo title LLM批处理工具 >> "dist\portable\启动工具.bat"
echo. >> "dist\portable\启动工具.bat"
echo echo ⚠️  使用前请阅读LICENSE和TERMS_OF_USE.md >> "dist\portable\启动工具.bat"
echo echo 🚀 启动 LLM批处理工具... >> "dist\portable\启动工具.bat"
echo echo 💰 提醒：API费用由用户承担 >> "dist\portable\启动工具.bat"
echo echo 💡 提示：关闭此窗口将自动停止服务 >> "dist\portable\启动工具.bat"
echo echo. >> "dist\portable\启动工具.bat"
echo. >> "dist\portable\启动工具.bat"
echo echo 📡 启动后端服务... >> "dist\portable\启动工具.bat"
echo cd /d "%%~dp0app" >> "dist\portable\启动工具.bat"
echo start /min cmd /c "node server/index.js" >> "dist\portable\启动工具.bat"
echo timeout /t 3 ^>nul >> "dist\portable\启动工具.bat"
echo. >> "dist\portable\启动工具.bat"
echo echo 🌐 正在打开浏览器... >> "dist\portable\启动工具.bat"
echo start http://localhost:3001 >> "dist\portable\启动工具.bat"
echo echo. >> "dist\portable\启动工具.bat"
echo echo ✅ 启动完成！ >> "dist\portable\启动工具.bat"
echo echo 📋 使用说明： >> "dist\portable\启动工具.bat"
echo echo    - 浏览器已自动打开工具界面 >> "dist\portable\启动工具.bat"
echo echo    - 保持此窗口开启以维持服务运行 >> "dist\portable\启动工具.bat"
echo echo    - 关闭此窗口将自动停止服务 >> "dist\portable\启动工具.bat"
echo echo. >> "dist\portable\启动工具.bat"
echo echo 🔗 手动访问地址: http://localhost:3001 >> "dist\portable\启动工具.bat"
echo echo. >> "dist\portable\启动工具.bat"
echo echo 按任意键停止服务并退出... >> "dist\portable\启动工具.bat"
echo pause ^>nul >> "dist\portable\启动工具.bat"
echo. >> "dist\portable\启动工具.bat"
echo echo 🛑 正在停止服务... >> "dist\portable\启动工具.bat"
echo taskkill /f /fi "CommandLine eq *server/index.js*" 2^>nul >> "dist\portable\启动工具.bat"
echo echo ✅ 服务已停止 >> "dist\portable\启动工具.bat"
echo timeout /t 2 ^>nul >> "dist\portable\启动工具.bat"

echo.
echo 📄 第5步: 创建使用说明...
echo LLM批处理工具 - 便携版 > "dist\portable\使用说明.txt"
echo ======================= >> "dist\portable\使用说明.txt"
echo. >> "dist\portable\使用说明.txt"
echo ⚠️  重要提醒： >> "dist\portable\使用说明.txt"
echo   - 本软件仅限个人学习研究使用 >> "dist\portable\使用说明.txt"
echo   - 禁止任何商业用途和盈利行为 >> "dist\portable\使用说明.txt"
echo   - API费用由用户自行承担 >> "dist\portable\使用说明.txt"
echo   - 详见LICENSE和TERMS_OF_USE.md >> "dist\portable\使用说明.txt"
echo. >> "dist\portable\使用说明.txt"
echo 🚀 启动方法: >> "dist\portable\使用说明.txt"
echo   1. 双击 "启动工具.bat" >> "dist\portable\使用说明.txt"
echo   2. 等待浏览器自动打开 >> "dist\portable\使用说明.txt"
echo   3. 在浏览器中使用工具 >> "dist\portable\使用说明.txt"
echo. >> "dist\portable\使用说明.txt"
echo 🛑 停止方法: >> "dist\portable\使用说明.txt"
echo   - 关闭启动工具的窗口即可自动停止服务 >> "dist\portable\使用说明.txt"
echo   - 无需其他操作 >> "dist\portable\使用说明.txt"
echo. >> "dist\portable\使用说明.txt"
echo 📋 系统要求: >> "dist\portable\使用说明.txt"
echo   - Windows 10+ >> "dist\portable\使用说明.txt"
echo   - Node.js 16+ 已安装 >> "dist\portable\使用说明.txt"
echo   - 端口 3001 可用 >> "dist\portable\使用说明.txt"

echo.
echo ✅ 便携版构建完成！
echo 📁 输出位置: dist\portable\
echo 📋 使用方法: 双击 "启动工具.bat"
echo ⚠️  重要：已包含许可证和使用条款文件
echo 💡 改进：关闭启动窗口即可停止服务，无需单独的停止脚本

echo.
echo 🎯 包含文件:
dir "dist\portable" /B

echo.
echo 💾 分发说明:
echo   将整个 dist\portable\ 文件夹复制到目标电脑即可使用
echo   用户必须阅读并同意LICENSE和TERMS_OF_USE.md中的条款

echo 🎉 构建完成，退出...
exit /b 0

:error
echo ❌ 构建失败！
exit /b 1 