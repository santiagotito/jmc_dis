@echo off
echo Iniciando Servidor DISOR Analytics 2.0...
cd dashboard-v2
cmd /c npm run dev -- --port 3000
pause
