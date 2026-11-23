@echo off
setlocal DisableDelayedExpansion
set "arch=%PROCESSOR_ARCHITECTURE%"
if defined PROCESSOR_ARCHITEW6432 set "arch=%PROCESSOR_ARCHITEW6432%"
if /i "%arch%"=="AMD64" set "arch=x64"
set "runtime=%~dp0Resources\runtime\%arch%\node.exe"
if not exist "%runtime%" (
  echo Extract the complete Windows release ZIP. The bundled runtime is missing or this PC is unsupported.
  if /i not "%~1"=="--non-interactive" pause
  exit /b 1
)
"%runtime%" "%~dp0Resources\Quiz Capture\install.mjs" %*
set "result=%errorlevel%"
if /i not "%~1"=="--non-interactive" pause
exit /b %result%
