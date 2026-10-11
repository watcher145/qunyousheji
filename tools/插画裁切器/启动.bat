@echo off
chcp 936 >nul
cd /d "%~dp0"
setlocal enabledelayedexpansion

rem ============================================================
rem  无名杀 武将插画裁切器 启动器
rem  自动挑选一个装有 opencv-python / numpy / Pillow 的 Python
rem ============================================================
set "PYEXE="

rem [1] 优先用 py 启动器逐个版本试
where py >nul 2>nul
if %errorlevel%==0 (
    for %%V in (3.12 3.13 3.11 3.10 3) do (
        if not defined PYEXE (
            py -%%V -c "import cv2,numpy,PIL" >nul 2>nul
            if !errorlevel!==0 set "PYEXE=py -%%V"
        )
    )
)

rem [2] 再试 PATH 里的 python / python3
if not defined PYEXE (
    for %%C in (python python3) do (
        if not defined PYEXE (
            where %%C >nul 2>nul
            if !errorlevel!==0 (
                %%C -c "import cv2,numpy,PIL" >nul 2>nul
                if !errorlevel!==0 set "PYEXE=%%C"
            )
        )
    )
)

if defined PYEXE (
    echo 使用解释器：%PYEXE%
    %PYEXE% "插画裁切器.py"
    if errorlevel 1 pause
) else (
    echo.
    echo  [错误] 没找到装有 opencv-python / numpy / Pillow 的 Python。
    echo.
    echo  任选一种方式解决：
    echo    1^) 手动指定带这些库的 Python，例如：  py -3.12 "插画裁切器.py"
    echo    2^) 给默认 Python 安装依赖：  py -3 -m pip install opencv-python numpy pillow
    echo.
    pause
)
