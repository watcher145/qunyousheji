@echo off
chcp 936 >nul
title 武将添加器
cd /d "%~dp0"
echo [武将添加器] 启动中，浏览器将自动打开 http://localhost:9527 ...
node server.mjs
if errorlevel 1 (
  echo.
  echo [错误] 启动失败：请确认已安装 Node.js 并加入 PATH
  pause
)
