@echo off
chcp 65001 >nul
echo Building portable version for CI...

REM Check required files
if not exist "package.json" (
    echo ERROR: package.json not found
    exit /b 1
)

if not exist "server\index.js" (
    echo ERROR: server files not found
    exit /b 1
)

REM Create output directories
echo Creating output directories...
rmdir /s /q "dist\portable" 2>nul
mkdir "dist\portable\app"
mkdir "dist\portable\temp"
mkdir "dist\portable\outputData"

REM Copy server files
echo Copying server files...
xcopy "server" "dist\portable\app\server\" /E /I /Y /Q
if errorlevel 1 goto error

REM Copy frontend build files
echo Copying frontend files...
mkdir "dist\portable\app\dist" 2>nul
xcopy "build\assets" "dist\portable\app\dist\assets\" /E /I /Y /Q
copy "build\index.html" "dist\portable\app\dist\" /Y >nul

REM Copy ALL node_modules (essential for proper functioning)
echo Copying node_modules...
xcopy "node_modules" "dist\portable\app\node_modules\" /E /I /Y /Q
if errorlevel 1 goto error

REM Copy config files
echo Copying config files...
copy "package.json" "dist\portable\app\" /Y >nul
copy "LICENSE" "dist\portable\" /Y >nul
copy "TERMS_OF_USE.md" "dist\portable\" /Y >nul

REM Create startup script
echo Creating startup script...
(
echo @echo off
echo chcp 65001 ^>nul
echo title LLM Batch Processing Tool
echo.
echo echo ========================================
echo echo    LLM Batch Processing Tool
echo echo ========================================
echo echo.
echo echo Starting server...
echo echo.
echo cd /d "%%~dp0app"
echo echo.
echo REM Start browser with delay
echo REM Browser will auto-open when server is ready
echo echo.
echo echo Server is starting...
echo echo Browser will open automatically when ready...
echo echo.
echo echo ========================================
echo echo IMPORTANT:
echo echo - Keep this window open to keep the server running
echo echo - Close this window to stop the server
echo echo ========================================
echo echo.
echo echo.
echo REM Run server in main window
echo node server/index.js
echo echo.
echo REM If server stops, show exit message
echo echo Server has stopped.
echo echo Press any key to exit...
echo pause ^>nul
) > "dist\portable\start-tool.bat"

REM Create readme file
echo Creating readme...
echo LLM Batch Processing Tool - Portable Version > "dist\portable\README.txt"
echo ============================================== >> "dist\portable\README.txt"
echo. >> "dist\portable\README.txt"
echo How to use: >> "dist\portable\README.txt"
echo 1. Double-click "start-tool.bat" >> "dist\portable\README.txt"
echo 2. Wait for the browser to open automatically >> "dist\portable\README.txt"
echo 3. Access: http://localhost:3001 >> "dist\portable\README.txt"
echo. >> "dist\portable\README.txt"
echo System Requirements: >> "dist\portable\README.txt"
echo - Windows 10+ >> "dist\portable\README.txt"
echo - Node.js 16+ installed >> "dist\portable\README.txt"
echo - Port 3001 available >> "dist\portable\README.txt"

REM Verify build
echo Verifying build results...
if not exist "dist\portable\start-tool.bat" goto error
if not exist "dist\portable\app\server\index.js" goto error
if not exist "dist\portable\app\package.json" goto error

echo CI build completed successfully!
exit /b 0

:error
echo CI build failed!
exit /b 1