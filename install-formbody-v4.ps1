$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
Set-Location backend
npm uninstall @fastify/formbody
npm install @fastify/formbody@^7.4.0
