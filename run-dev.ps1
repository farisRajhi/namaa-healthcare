$env:Path = "C:\Program Files\nodejs;" + $env:Path
Set-Location "C:\Users\farii\projects\ai-agent\backend"
Write-Host "Generating Prisma client..."
npx prisma generate
Write-Host "Pushing database schema..."
npx prisma db push
Write-Host "Starting backend server..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd C:\Users\farii\projects\ai-agent\backend; `$env:Path = 'C:\Program Files\nodejs;' + `$env:Path; npm run dev"
Write-Host "Starting frontend server..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd C:\Users\farii\projects\ai-agent\frontend; `$env:Path = 'C:\Program Files\nodejs;' + `$env:Path; npm run dev"
Write-Host "Done! Backend: http://localhost:3005 | Frontend: http://localhost:5173"
