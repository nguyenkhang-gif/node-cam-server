const { execSync, exec } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const ROOT = __dirname
const isWin = os.platform() === 'win32'

function log(msg) { console.log(`\n→ ${msg}`) }
function ok(msg)  { console.log(`✓ ${msg}`) }
function warn(msg){ console.log(`⚠ ${msg}`) }

// 1. Kiểm tra node_modules
log('Kiểm tra dependencies...')
if (!fs.existsSync(path.join(ROOT, 'node_modules'))) {
  log('Cài đặt npm packages...')
  execSync('npm install', { stdio: 'inherit', cwd: ROOT })
  ok('npm install xong')
} else {
  ok('node_modules đã có')
}

// 2. Tạo cert nếu chưa có
const certPath = path.join(ROOT, 'cert.pem')
const keyPath  = path.join(ROOT, 'key.pem')

log('Kiểm tra SSL cert...')
if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
  log('Tạo self-signed cert...')
  const cmd = `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=facecam"`
  try {
    execSync(cmd, { stdio: 'pipe' })
    ok('Đã tạo cert.pem và key.pem')
  } catch {
    warn('openssl không tìm thấy.')
    if (isWin) {
      console.log(`
Trên Windows, chạy lệnh sau trong Git Bash hoặc WSL:
  openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=facecam"

Hoặc trong PowerShell:
  $cert = New-SelfSignedCertificate -DnsName "facecam" -CertStoreLocation "cert:\\LocalMachine\\My" -NotAfter (Get-Date).AddDays(365)
  # Sau đó export ra PEM — xem README.md để biết thêm chi tiết
`)
    } else {
      console.log('Hãy cài openssl: brew install openssl')
    }
  }
} else {
  ok('cert.pem và key.pem đã có')
}

// 3. Tạo config.json nếu chưa có
const configPath = path.join(ROOT, 'config.json')
log('Kiểm tra config.json...')
if (!fs.existsSync(configPath)) {
  const defaultConfig = {
    flipH: false,
    flipV: false,
    rotation: 0,
    hideControls: false,
    phone: {
      facingMode: 'environment',
      width: 1280,
      height: 720,
      frameRate: 30
    }
  }
  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2))
  ok('Đã tạo config.json với giá trị mặc định')
} else {
  ok('config.json đã có')
}

// 4. Kiểm tra ADB (tuỳ chọn)
log('Kiểm tra ADB (dùng cho USB mode)...')
try {
  const adbPaths = [
    'adb',
    path.join(os.homedir(), 'Library/Android/sdk/platform-tools/adb'),
    path.join(os.homedir(), 'AppData/Local/Android/Sdk/platform-tools/adb.exe'),
  ]
  let adbFound = false
  for (const p of adbPaths) {
    try { execSync(`"${p}" version`, { stdio: 'pipe' }); adbFound = true; ok(`ADB tìm thấy: ${p}`); break } catch {}
  }
  if (!adbFound) {
    warn('ADB không tìm thấy — USB mode sẽ không hoạt động.')
    console.log('  Cài: brew install android-platform-tools  (macOS)')
    console.log('  Hoặc tải: https://developer.android.com/studio/releases/platform-tools')
  }
} catch {}

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Setup hoàn tất!

Chạy server:
  npm start

USB mode (Android):
  adb reverse tcp:7070 tcp:7070
  → Phone mở: http://localhost:7070/phone.html

WiFi mode:
  → Phone quét QR trong terminal
  → Accept cert warning lần đầu
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)
