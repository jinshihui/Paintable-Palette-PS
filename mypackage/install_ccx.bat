@echo off
setlocal enableextensions

rem Install UXP .ccx package via UnifiedPluginInstallerAgent (UPIA)

set "CCX_PATH=%~dp0com.jinshihui.paintablepalette_PS.ccx"
if not exist "%CCX_PATH%" (
  echo [ERROR] CCX file not found: "%CCX_PATH%"
  echo Put the .ccx next to this .bat file or edit CCX_PATH in the script.
  exit /b 2
)

set "UPIA_EXE=%ProgramFiles%\Common Files\Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe"
if not exist "%UPIA_EXE%" set "UPIA_EXE=%ProgramFiles(x86)%\Common Files\Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe"

if not exist "%UPIA_EXE%" (
  echo [ERROR] UnifiedPluginInstallerAgent.exe not found.
  echo Expected at:
  echo   "%ProgramFiles%\Common Files\Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe"
  echo   "%ProgramFiles(x86)%\Common Files\Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe"
  echo Make sure Adobe Creative Cloud Desktop is installed and up to date.
  exit /b 3
)

echo Installing:
echo   "%CCX_PATH%"
echo Using:
echo   "%UPIA_EXE%"
echo.

"%UPIA_EXE%" /install "%CCX_PATH%"
set "ERR=%ERRORLEVEL%"

echo.
if "%ERR%"=="0" (
  echo [OK] Install command finished successfully.
  echo If Photoshop is running, restart Photoshop and check Window ^> Extensions ^(UXP^).
) else (
  echo [ERROR] Install command failed. exitcode=%ERR%
  echo Tip: Run this .bat as Administrator, or check Creative Cloud Desktop status.
)

exit /b %ERR%
