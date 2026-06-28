# FaceCam Server

Biến điện thoại Android/iPhone thành webcam qua WebRTC, không cần cài app. Latency ~50-100ms trên LAN.

---

## Kiến trúc

```
Phone (Brave/Chrome)          Mac
┌─────────────────┐          ┌──────────────────────────┐
│  phone.html     │          │  Node.js Server          │
│  getUserMedia() │◄─────────│  - HTTP  :7070 (USB)     │
│  WebRTC sender  │  signal  │  - HTTPS :7443 (WiFi)    │
└────────┬────────┘          └──────────────────────────┘
         │ WebRTC P2P (video)          │
         ▼                             ▼
┌─────────────────┐          ┌──────────────────────────┐
│  viewer.html    │          │  OBS Studio              │
│  WebRTC receiver│          │  Browser Source          │
│  <video>        │─────────►│  Virtual Camera          │
└─────────────────┘          └──────────┬───────────────┘
                                        │
                                        ▼
                             Discord / Zoom / Meet
```

**Lưu ý quan trọng:** Node.js chỉ làm signaling (trao đổi SDP/ICE). Video truyền P2P trực tiếp giữa phone và PC — không đi qua server.

---

## Yêu cầu

- Node.js 16+
- OBS Studio (để tạo virtual camera)
- Android: Brave hoặc Chrome | iPhone: Safari
- Cùng mạng WiFi, hoặc cắm USB (khuyến nghị)

---

## Cài đặt (lần đầu)

### Cách nhanh nhất — `npm run init` (khuyến nghị, cả Windows lẫn macOS)

```bash
git clone https://github.com/nguyenkhang-gif/node-cam-server.git
cd node-cam-server
npm install
npm run init
```

`npm run init` ([init.js](init.js)) sẽ tự động:
- Cài npm packages nếu thiếu
- Tạo self-signed cert (`cert.pem` / `key.pem`) — tự nhận diện Windows và in hướng dẫn nếu thiếu `openssl`
- Tạo `config.json` mặc định nếu chưa có
- Kiểm tra ADB (cho USB mode)

Xong là chạy được: `npm start`.

> `cert.pem` và `key.pem` **không** commit vào git (có trong `.gitignore`) — mỗi máy clone về tự tạo. Cert chỉ cần cho **WiFi mode**; nếu chỉ dùng USB mode thì server vẫn chạy bình thường khi thiếu cert (HTTPS sẽ bị bỏ qua).

---

### Setup thủ công

Dùng khi `npm run init` báo lỗi (thường do thiếu `openssl` trên Windows).

**1. Cài dependencies** (cần Node.js 16+ từ https://nodejs.org):
```bash
npm install
```

**2. Tạo self-signed cert** (chỉ cần cho WiFi mode):

<details>
<summary><b>Windows</b></summary>

Cách đơn giản nhất — chạy trong **Git Bash** hoặc **WSL** (đã có sẵn `openssl`):
```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj '/CN=facecam'
```

Nếu chỉ có **PowerShell** (Win10/11) và không có `openssl`:
```powershell
$cert = New-SelfSignedCertificate -DnsName "facecam" -CertStoreLocation "cert:\LocalMachine\My" -NotAfter (Get-Date).AddDays(365)
$certPath = "Cert:\LocalMachine\My\$($cert.Thumbprint)"
$password = ConvertTo-SecureString -String "facecam" -Force -AsPlainText
Export-PfxCertificate -Cert $certPath -FilePath cert.pfx -Password $password
# Convert PFX → PEM (bước này vẫn cần openssl)
openssl pkcs12 -in cert.pfx -nocerts -nodes -out key.pem -passin pass:facecam
openssl pkcs12 -in cert.pfx -nokeys -out cert.pem -passin pass:facecam
```
</details>

<details>
<summary><b>macOS / Linux</b></summary>

```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj '/CN=facecam'
```
</details>

**3. (Tuỳ chọn) Cài ADB** — chỉ cần cho USB mode trên Android:

- **Windows:** tải [platform-tools](https://developer.android.com/studio/releases/platform-tools), giải nén → thêm thư mục vào **PATH** (hoặc gọi `adb.exe` bằng đường dẫn đầy đủ).
- **macOS:** `brew install android-platform-tools`

> Trên Windows lệnh ADB là `adb` / `adb.exe`, **không** dùng path macOS `~/Library/Android/sdk/platform-tools/adb`. Xem mục [Lệnh hữu ích (Windows)](#lệnh-hữu-ích-windows) ở cuối.

---

## Chạy server

```bash
node server.js
```

Terminal sẽ hiện:
- QR code cho USB mode và WiFi mode
- URL viewer cho PC

---

## Kết nối phone

### USB mode (khuyến nghị — camera hoạt động ngay, không cần HTTPS)

1. Cắm USB phone vào Mac
2. Bật **USB Debugging** trên Android: Settings → Developer Options → USB Debugging
3. Chạy ADB reverse:
   ```bash
   ~/Library/Android/sdk/platform-tools/adb reverse tcp:7070 tcp:7070
   ```
4. Phone mở Brave/Chrome → gõ `http://localhost:7070/phone.html`
5. Bấm **▶ Bật Camera**

### WiFi mode (không cần dây)

1. Phone và Mac cùng WiFi
2. Phone quét QR WiFi trong terminal (hoặc gõ `https://192.168.x.x:7443/phone.html`)
3. Bấm **Advanced → Proceed** để qua self-signed cert warning
4. Bấm **▶ Bật Camera**

> **Lý do cần HTTPS:** Browser chỉ cho phép `getUserMedia()` (camera) trên secure context. `localhost` được miễn trừ nên USB mode dùng HTTP bình thường.

---

## Setup OBS

1. Mở OBS Studio
2. **Nguồn → + → Trình duyệt**
   - URL: `http://localhost:7070/viewer.html`
   - Chiều rộng: `1280`
   - Chiều cao: `720`
   - Bỏ tick **"Tắt nguồn khi không hiển thị"**
3. Bấm **Bắt đầu máy quay ảo**
4. Discord/Zoom → Settings → Camera → chọn **OBS Virtual Camera**

---

## Cấu hình `config.json`

Chỉnh file `config.json` để lưu cài đặt, tự động load khi viewer mở:

```json
{
  "flipH": false,
  "flipV": false,
  "rotation": 0,
  "hideControls": false
}
```

| Option | Giá trị | Mô tả |
|---|---|---|
| `flipH` | `true/false` | Lật ngang |
| `flipV` | `true/false` | Lật dọc |
| `rotation` | `0/90/180/270` | Xoay video |
| `hideControls` | `true/false` | Ẩn thanh điều khiển |

Có thể chỉnh trực tiếp trên viewer bằng các nút — tự lưu vào `config.json`.  
**Double click** lên màn hình để hiện lại controls khi đã ẩn.

---

## Troubleshooting

### Phone báo "Permission denied"

- Android: Settings → Apps → Brave → Permissions → Camera → Allow
- Sau đó: Brave → 🔒 address bar → Site settings → Camera → Allow
- Nếu vẫn lỗi: bật flag `brave://flags/#unsafely-treat-insecure-origin-as-secure`

### Phone báo "Đóng mọi cửa sổ chú giải"

App overlay đang chặn camera. Tắt:
- Blue light filter / Eye comfort shield
- Accessibility overlay apps
- Chạy lệnh tìm overlay: `adb shell dumpsys window windows | grep mAlertWindowSurfaces`

### Viewer đen, status "Đang stream"

OBS Browser Source bị throttle. Trong Thuộc tính Browser Source:
- Bỏ tick **"Tắt nguồn khi không hiển thị"**
- Bấm **Làm mới**

### Không thấy OFFER trong log (không kết nối được)

Phone và viewer dùng 2 server khác nhau (HTTP vs HTTPS). Server đã có bridge tự động — chỉ cần restart server và kết nối lại.

### Video lag

- Ưu tiên dùng WiFi 5GHz
- Tắt VPN
- Kiểm tra không có app nào khác đang dùng camera

---

## Lệnh hữu ích

```bash
# Khởi động server
node server.js

# Kill server
lsof -ti:7070,7443 | xargs kill -9

# ADB reverse (USB mode)
~/Library/Android/sdk/platform-tools/adb reverse tcp:7070 tcp:7070

# Xem camera đang được app nào giữ
~/Library/Android/sdk/platform-tools/adb shell dumpsys media.camera | grep -i "active\|connect"

# Tìm overlay app đang chặn camera
~/Library/Android/sdk/platform-tools/adb shell dumpsys window windows | grep mAlertWindowSurfaces
```

### Lệnh hữu ích (Windows)

```powershell
# Khởi động server
node server.js

# Kill server (tìm PID rồi kill)
netstat -ano | findstr "7070 7443"
taskkill /PID <pid> /F

# ADB reverse (USB mode) — adb đã có trong PATH
adb reverse tcp:7070 tcp:7070

# Xem camera đang được app nào giữ
adb shell dumpsys media.camera | findstr /i "active connect"

# Tìm overlay app đang chặn camera
adb shell dumpsys window windows | findstr mAlertWindowSurfaces
```

---

## Changelog

### 2026-06-18
- Thêm quick bar ở phone: flip cam, flip H/V, xoay, settings
- Config viewer (flip/rotation/hideControls) có thể chỉnh từ phone
- `config_updated` event sync viewer realtime khi phone lưu config
- Auto-reconnect viewer nếu phone join muộn hơn
- Log disconnect reason + notify viewer khi phone mất kết nối

### 2026-06-17
- Khởi tạo project
- WebRTC P2P signaling qua Socket.io
- Dual server: HTTP :7070 (USB) + HTTPS :7443 (WiFi)
- ADB reverse cho USB mode (localhost = secure context)
- `config.json` cho flip/rotation/hideControls/phone camera settings
- QR code terminal + trang index với QR
- Viewer: flip H, flip V, rotate 90°, double click hiện controls
- OBS Browser Source integration
- keepAlive: WebGL loop + Wake Lock + silent audio

## Ports

| Port | Protocol | Dùng cho |
|---|---|---|
| 7070 | HTTP | USB mode, Viewer PC |
| 7443 | HTTPS | WiFi mode |
