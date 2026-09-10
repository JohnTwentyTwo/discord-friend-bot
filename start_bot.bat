@echo off
title Quan Ly Le - Discord Bot Daemon
cd /d "C:\Users\quang\.gemini\antigravity-ide\scratch\discord-friend-node-bot"
:loop
echo [%date% %time%] Dang khoi chay Quan Ly Le...
node index.js
echo [%date% %time%] Bot bi ngat ket noi hoac crash. Tu dong khoi dong lai sau 5 giay...
timeout /t 5 /nobreak >nul
goto loop
