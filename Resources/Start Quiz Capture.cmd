@echo off
setlocal DisableDelayedExpansion
set "support=%LOCALAPPDATA%\Quiz Capture"
if defined QUIZ_CAPTURE_INSTALL_ROOT set "support=%QUIZ_CAPTURE_INSTALL_ROOT%"
set "version="
if exist "%support%\current" set /p "version="<"%support%\current"
if not defined version goto incomplete
"%SystemRoot%\System32\findstr.exe" /v /r /x "[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*" "%support%\current" >nul
if errorlevel 2 goto incomplete
if not errorlevel 1 goto incomplete
"%support%\%version%\node.exe" "%support%\%version%\Quiz Capture\capture.mjs" %*
set "result=%errorlevel%"
if not "%result%"=="0" if /i not "%~1"=="--verify" pause
exit /b %result%

:incomplete
echo Quiz Capture installation is incomplete. Run the installer again.
if /i not "%~1"=="--verify" pause
exit /b 1
