@echo off
rem Serves The Hollow Crown locally and opens it in your browser (use this if double-clicking index.html shows nothing).
cd /d "%~dp0"
start "" "http://localhost:8642/index.html"
npx --yes http-server@14.1.1 . -p 8642 -c-1 --silent
