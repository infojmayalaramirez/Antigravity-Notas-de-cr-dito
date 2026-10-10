@echo off
title Casa Ayala - Servidor SQL y Túnel 24/7
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo  ========================================================
echo  ^|         SISTEMA CASA AYALA - SERVIDOR PERMANENTE 24/7  ^|
echo  ^|         INICIANDO BASE DE DATOS Y CONEXIÓN...          ^|
echo  ========================================================
echo.

:: Liberar procesos previos
taskkill /f /im node.exe 2>nul
taskkill /f /im cloudflared.exe 2>nul
timeout /t 1 /nobreak >nul

:: Abrir el sistema en el navegador
start "" "http://localhost:3000"

:: Iniciar el servidor Node.js que gestiona SQL Server y el túnel automáticamente
node server.js

pause
