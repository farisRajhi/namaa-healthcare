# Make an AI-powered outbound call using your backend API
# Usage: .\make-ai-call.ps1 -To "+966507434470" -From "+17078745670"

param(
    [Parameter(Mandatory=$true)]
    [string]$To,

    [Parameter(Mandatory=$false)]
    [string]$From = "+17078745670",

    [Parameter(Mandatory=$false)]
    [string]$ApiUrl = "http://localhost:3007/api/voice/make-call"
)

Write-Host "Making AI call..." -ForegroundColor Cyan
Write-Host "From: $From" -ForegroundColor Yellow
Write-Host "To: $To" -ForegroundColor Yellow

$body = @{
    to = $To
    from = $From
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri $ApiUrl -Method Post -Body $body -ContentType "application/json"

    Write-Host "`nSuccess!" -ForegroundColor Green
    Write-Host "Call SID: $($response.callSid)" -ForegroundColor Cyan
    Write-Host "Status: $($response.status)" -ForegroundColor Cyan
    Write-Host "`nThe AI will speak in Arabic when the call is answered!" -ForegroundColor Green
}
catch {
    Write-Host "`nError making call:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red

    if ($_.ErrorDetails) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Red
    }
}
