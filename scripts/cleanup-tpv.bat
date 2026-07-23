@echo off
echo === Limpieza TPV MultiShop ===
echo Ejecuta este archivo como Administrador.
echo.

rem Matar todos los procesos relacionados
taskkill /F /IM "TPV MultiShop.exe" /T 2>nul
taskkill /F /IM "TPV MultiShop Helper.exe" /T 2>nul
taskkill /F /IM "TPV MultiShop Helper (GPU).exe" /T 2>nul
taskkill /F /IM "TPV MultiShop Helper (Renderer).exe" /T 2>nul
timeout /t 2 /nobreak >nul

rem Eliminar directorio de instalacion (perMachine)
rd /s /q "C:\Program Files\TPV MultiShop" 2>nul

rem Eliminar directorio de instalacion (per-user, versiones anteriores)
rd /s /q "%LOCALAPPDATA%\Programs\TPV MultiShop" 2>nul

rem Limpiar entradas de registro
reg delete "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\com.multishop.tpv" /f 2>nul
reg delete "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\com.multishop.tpv" /f 2>nul
reg delete "HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\com.multishop.tpv" /f 2>nul

echo.
echo Listo. Ahora instala TPV MultiShop Setup 0.2.7.exe
pause
