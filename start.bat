@echo off
rem Windows: dobbeltklik for at starte Julefrokost. Luk vinduet for at stoppe.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js mangler. Hent det paa https://nodejs.org og proev igen.
  pause
  exit /b 1
)
start "" http://localhost:8080
node server.js
pause
