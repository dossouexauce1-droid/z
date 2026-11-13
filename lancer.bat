@echo off
rem Lance la demo Z et l'ouvre dans le navigateur.
cd /d "%~dp0"
start "" http://localhost:5173
node server.js
