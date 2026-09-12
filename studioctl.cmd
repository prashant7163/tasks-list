@echo off
setlocal
set "PROJECT_ROOT=%~dp0"
if "%1"=="bootstrap" (
  shift
  python "%PROJECT_ROOT%.studio\tools\bootstrap.py" --project-root "%PROJECT_ROOT%" %*
  exit /b %ERRORLEVEL%
)
if not exist "%PROJECT_ROOT%.studio\runtime\Scripts\python.exe" (
  echo {"code":"policy_denied","summary":"Project-local Studio runtime is not bootstrapped.","next_action":"Run studioctl.cmd bootstrap."}
  exit /b 4
)
"%PROJECT_ROOT%.studio\runtime\Scripts\python.exe" -c "import sys; from agentic_studio.cli import studioctl_main; sys.exit(studioctl_main())" --project-root "%PROJECT_ROOT%" %*
exit /b %ERRORLEVEL%
