@echo off
title Casa Ayala - Arranque del Sistema
chcp 65001 >nul

echo.
echo  Iniciando Sistema Casa Ayala...
echo  (Esta ventana se cerrara automaticamente)
echo.

PowerShell -ExecutionPolicy Bypass -File "%~dp0iniciar_casa_ayala.ps1"
