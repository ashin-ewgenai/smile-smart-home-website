# Firebase Secrets Setup Script for Email (SMTP)
# Run this script to set all required Firebase Functions secrets

Write-Host "=== Firebase SMTP Secrets Setup ===" -ForegroundColor Cyan
Write-Host ""

# Check if firebase is available via npx
function Test-FirebaseCLI {
    try {
        $output = npx firebase --version 2>&1
        if ($output -match "\d+\.\d+\.\d+") {
            return $true
        }
    } catch {
        return $false
    }
    return $false
}

if (-not (Test-FirebaseCLI)) {
    Write-Host "ERROR: Firebase CLI not found. Installing..." -ForegroundColor Red
    npm install -g firebase-tools
}

# Prompt for values
Write-Host "Enter your SMTP configuration values:" -ForegroundColor Yellow
Write-Host ""

$SMTP_HOST = Read-Host "SMTP_HOST (e.g., smtp.gmail.com)"
$SMTP_PORT = Read-Host "SMTP_PORT (e.g., 587)"
$SMTP_USER = Read-Host "SMTP_USER (e.g., your-email@gmail.com)"
$SMTP_PASS = Read-Host "SMTP_PASS (your app password - will be hidden)" -AsSecureString
$EMAIL_FROM = Read-Host "EMAIL_FROM (e.g., noreply@smilesmarthome.com)"

# Convert secure string to plain text for firebase command
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($SMTP_PASS)
$SMTP_PASS_PLAIN = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

Write-Host ""
Write-Host "Setting secrets..." -ForegroundColor Cyan

# Create temporary files with values for piping
$SMTP_HOST | Out-File -FilePath "smtp_host.txt" -NoNewline
$SMTP_PORT | Out-File -FilePath "smtp_port.txt" -NoNewline
$SMTP_USER | Out-File -FilePath "smtp_user.txt" -NoNewline
$SMTP_PASS_PLAIN | Out-File -FilePath "smtp_pass.txt" -NoNewline
$EMAIL_FROM | Out-File -FilePath "email_from.txt" -NoNewline

try {
    Get-Content "smtp_host.txt" | npx firebase functions:secrets:set SMTP_HOST
    Get-Content "smtp_port.txt" | npx firebase functions:secrets:set SMTP_PORT
    Get-Content "smtp_user.txt" | npx firebase functions:secrets:set SMTP_USER
    Get-Content "smtp_pass.txt" | npx firebase functions:secrets:set SMTP_PASS
    Get-Content "email_from.txt" | npx firebase functions:secrets:set EMAIL_FROM
    
    Write-Host ""
    Write-Host "✅ All secrets set successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next step: Deploy functions with:" -ForegroundColor Yellow
    Write-Host "  npx firebase deploy --only functions" -ForegroundColor Cyan
} catch {
    Write-Host "ERROR: Failed to set secrets. Error: $_" -ForegroundColor Red
} finally {
    # Cleanup temp files
    Remove-Item -Path "smtp_host.txt" -ErrorAction SilentlyContinue
    Remove-Item -Path "smtp_port.txt" -ErrorAction SilentlyContinue
    Remove-Item -Path "smtp_user.txt" -ErrorAction SilentlyContinue
    Remove-Item -Path "smtp_pass.txt" -ErrorAction SilentlyContinue
    Remove-Item -Path "email_from.txt" -ErrorAction SilentlyContinue
}
