@echo off
cd /d "%~dp0backend"
py -3 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
