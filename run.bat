@echo off
chcp 65001 > nul
echo ========================================================
echo   스카배틀 (SkaBattle) 서버를 시작합니다...
echo   친구 실시간 스카 위치 & 순공 1:1 대결 플랫폼
echo ========================================================
echo.
echo 브라우저 주소: http://localhost:8000
echo.
python -X utf8 main.py
pause
