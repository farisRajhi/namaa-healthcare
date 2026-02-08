@echo off
REM Make an AI-powered outbound call using curl
REM Usage: make-ai-call.bat +966507434470

set TO_NUMBER=%1
set FROM_NUMBER=+17078745670
set API_URL=http://localhost:3007/api/voice/make-call

if "%TO_NUMBER%"=="" (
    echo Usage: make-ai-call.bat [phone_number]
    echo Example: make-ai-call.bat +966507434470
    exit /b 1
)

echo Making AI call...
echo From: %FROM_NUMBER%
echo To: %TO_NUMBER%
echo.

curl.exe -X POST %API_URL% ^
  -H "Content-Type: application/json" ^
  -d "{\"to\":\"%TO_NUMBER%\",\"from\":\"%FROM_NUMBER%\"}"

echo.
echo Done!
