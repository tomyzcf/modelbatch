@echo off
chcp 65001 >nul
echo Building portable version for local development...

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

REM Build frontend
echo Building frontend...
call npm run build
if errorlevel 1 goto error

REM Create dist directory if not exists
if not exist "dist\portable\app\dist" mkdir "dist\portable\app\dist"

REM Download Node.js with proxy support for local development
echo Checking Node.js executable...
if not exist "tools\node.exe" (
    echo Downloading Node.js executable...
    mkdir "tools" 2>nul
    
    REM Try multiple download methods with proxy support
    echo Attempting download method 1: PowerShell with proxy detection...
    powershell -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $webRequest = [Net.WebRequest]::GetSystemWebProxy(); $webRequest.Credentials = [Net.CredentialCache]::DefaultCredentials; $client = New-Object System.Net.WebClient; $client.Proxy = $webRequest; $client.DownloadFile('https://nodejs.org/dist/v18.19.0/win-x64/node.exe', 'tools\node.exe'); Write-Host 'Download completed successfully' } catch { Write-Host 'Method 1 failed:' $_.Exception.Message; exit 1 }"
    
    if not exist "tools\node.exe" (
        echo Download method 1 failed, trying method 2: PowerShell Invoke-WebRequest with proxy...
        powershell -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v18.19.0/win-x64/node.exe' -OutFile 'tools\node.exe' -UseBasicParsing -Proxy ([System.Net.WebRequest]::GetSystemWebProxy().GetProxy('https://nodejs.org')) } catch { Write-Host 'Method 2 failed:' $_.Exception.Message; exit 1 }"
    )
    
    if not exist "tools\node.exe" (
        echo Download method 2 failed, trying method 3: curl with proxy detection...
        curl --version >nul 2>&1
        if not errorlevel 1 (
            curl -L --proxy-anyauth --proxy-negotiate -o "tools\node.exe" "https://nodejs.org/dist/v18.19.0/win-x64/node.exe"
        )
    )
    
    if not exist "tools\node.exe" (
        echo Download method 3 failed, trying method 4: PowerShell simple download...
        powershell -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v18.19.0/win-x64/node.exe' -OutFile 'tools\node.exe' -UseBasicParsing } catch { Write-Host 'Method 4 failed:' $_.Exception.Message; exit 1 }"
    )
    
    REM Final check
    if not exist "tools\node.exe" (
        echo ERROR: All download methods failed. Please check your network connection or proxy settings.
        echo You can manually download from: https://nodejs.org/dist/v18.19.0/win-x64/node.exe
        echo And save it as: tools\node.exe
        echo Or run: .\scripts\download-node.bat
        echo Or run: .\scripts\check-proxy.bat for network diagnostics
        goto error
    )
    
    REM Verify downloaded file size using PowerShell (more reliable)
    echo Verifying downloaded file...
    for /f %%i in ('powershell -command "(Get-Item 'tools\node.exe').Length"') do set filesize=%%i
    echo File size: %filesize% bytes
    
    REM Check if file size is reasonable (greater than 10MB = 10485760 bytes)
    powershell -command "if ((Get-Item 'tools\node.exe').Length -lt 10485760) { exit 1 }" >nul 2>&1
    if errorlevel 1 (
        echo ERROR: Downloaded node.exe is too small ^(%filesize% bytes^), likely corrupted
        del "tools\node.exe" 2>nul
        goto error
    )
    
    echo Successfully downloaded node.exe ^(%filesize% bytes^)
)

REM Verify node.exe works
echo Verifying Node.js executable...
"tools\node.exe" --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Downloaded node.exe is not working properly
    del "tools\node.exe" 2>nul
    goto error
)

REM Copy Node.js executable
echo Copying Node.js executable...
copy "tools\node.exe" "dist\portable\app\" /Y >nul
if not exist "dist\portable\app\node.exe" (
    echo ERROR: Failed to copy node.exe
    goto error
)

REM Copy server files
echo Copying server files...
xcopy "server" "dist\portable\app\server\" /E /I /Y /Q
if errorlevel 1 goto error

REM Copy node_modules
echo Copying node_modules...
xcopy "node_modules" "dist\portable\app\node_modules\" /E /I /Y /Q
if errorlevel 1 goto error

REM Copy package.json
copy "package.json" "dist\portable\app\" /Y >nul

REM Copy frontend build files
echo Copying frontend files...
xcopy "build\assets" "dist\portable\app\dist\assets\" /E /I /Y /Q
copy "build\index.html" "dist\portable\app\dist\" /Y >nul

REM Copy config files
echo Copying config files...
copy "LICENSE" "dist\portable\" /Y >nul

REM Create startup script with firewall bypass
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
echo echo Server is starting...
echo echo Browser will open automatically when ready...
echo echo.
echo echo ========================================
echo echo IMPORTANT:
echo echo - Keep this window open to keep the server running
echo echo - Close this window to stop the server
echo echo - If Windows Firewall asks, click "Allow access"
echo echo ========================================
echo echo.
echo echo.
echo REM Run server with bundled Node.js
echo REM Add firewall rule silently if running as admin
echo netsh advfirewall firewall show rule name="LLM Batch Tool" ^>nul 2^>^&1
echo if errorlevel 1 ^(
echo     echo Adding firewall rule...
echo     netsh advfirewall firewall add rule name="LLM Batch Tool" dir=in action=allow program="%%~dp0node.exe" enable=yes ^>nul 2^>^&1
echo ^)
echo.
echo node.exe server\index.js
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
echo 2. If Windows Firewall prompts, click "Allow access" >> "dist\portable\README.txt"
echo 3. Wait for the browser to open automatically >> "dist\portable\README.txt"
echo 4. Access: http://localhost:3001 >> "dist\portable\README.txt"
echo. >> "dist\portable\README.txt"
echo System Requirements: >> "dist\portable\README.txt"
echo - Windows 10+ >> "dist\portable\README.txt"
echo - Port 3001 available >> "dist\portable\README.txt"
echo. >> "dist\portable\README.txt"
echo Note: This version includes Node.js runtime, no installation required! >> "dist\portable\README.txt"
echo First run may show Windows Firewall dialog - click "Allow access" >> "dist\portable\README.txt"

REM Final verification
echo Performing final verification...
if not exist "dist\portable\start-tool.bat" (
    echo ERROR: start-tool.bat not created
    goto error
)
if not exist "dist\portable\app\node.exe" (
    echo ERROR: node.exe not found in portable directory
    goto error
)
if not exist "dist\portable\app\server\index.js" (
    echo ERROR: server\index.js not found
    goto error
)
if not exist "dist\portable\app\package.json" (
    echo ERROR: package.json not found
    goto error
)

REM Test node.exe in portable directory
echo Testing Node.js in portable directory...
cd "dist\portable\app"
node.exe --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: node.exe in portable directory is not working
    cd ..\..\..
    goto error
)
cd ..\..\..

echo Local build completed successfully!
echo Portable version created in: dist\portable\
echo.
echo You can now test by running: dist\portable\start-tool.bat
echo.
echo Note: First run may show Windows Firewall dialog - click "Allow access"
exit /b 0

:error
echo Local build failed!
echo.
echo Troubleshooting:
echo - Run .\scripts\check-proxy.bat for network diagnostics
echo - Run .\scripts\download-node.bat to download Node.js separately
echo - Check your internet connection and proxy settings
exit /b 1 