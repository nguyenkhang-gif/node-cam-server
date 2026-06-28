const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')
const express = require('express')
const { Server } = require('socket.io')
const os = require('os')
const QRCode = require('qrcode')

const app = express()

const HTTP_PORT = 7070
const HTTPS_PORT = 7443

function getLocalIP() {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return 'localhost'
}

app.use(express.static(path.join(__dirname, 'public')))
app.use(express.json())

const CONFIG_PATH = path.join(__dirname, 'config.json')
const DEFAULT_CONFIG = {
  flipH: false, flipV: false, rotation: 0, hideControls: false,
  phone: { facingMode: 'environment', width: 1280, height: 720, frameRate: 30 }
}
const VALID_CONFIG_KEYS = new Set(['flipH', 'flipV', 'rotation', 'hideControls', 'phone'])

let configCache
try {
  configCache = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) }
} catch {
  configCache = { ...DEFAULT_CONFIG }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(configCache, null, 2))
}

app.get('/api/config', (req, res) => {
  res.json(configCache)
})

app.post('/api/config', (req, res) => {
  const body = req.body
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return res.status(400).json({ error: 'Invalid body' })
  }
  const patch = Object.fromEntries(Object.entries(body).filter(([k]) => VALID_CONFIG_KEYS.has(k)))
  configCache = { ...configCache, ...patch }
  fs.writeFile(CONFIG_PATH, JSON.stringify(configCache, null, 2), () => {})
  res.json(configCache)
})

// serve QR data as JSON for the index page
app.get('/api/urls', async (req, res) => {
  const ip = getLocalIP()
  const usbURL = `http://localhost:${HTTP_PORT}/phone.html`
  const wifiURL = `https://${ip}:${HTTPS_PORT}/phone.html`

  const [usbQR, wifiQR] = await Promise.all([
    QRCode.toDataURL(usbURL),
    QRCode.toDataURL(wifiURL),
  ])

  res.json({ usbURL, wifiURL, usbQR, wifiQR, ip })
})

// signaling shared across both servers
// Bridge: relay event từ io này sang io kia
function setupSignaling(io, peer, label) {
  io.on('connection', (socket) => {
    console.log(`[${label}] CONNECT   ${socket.id}`)

    socket.on('join', (room) => {
      socket.join(room)
      const members = io.sockets.adapter.rooms.get(room)?.size ?? 0
      console.log(`[${label}] JOIN room="${room}" total=${members}`)
      // khi có client mới join, notify phone stream lại
      socket.to(room).emit('request_stream')
      peer?.to(room).emit('request_stream')
    })

    socket.on('offer', (data) => {
      console.log(`[${label}] OFFER  → room=${data.room}`)
      socket.to(data.room).emit('offer', data)
      peer?.to(data.room).emit('offer', data)
    })

    socket.on('answer', (data) => {
      console.log(`[${label}] ANSWER → room=${data.room}`)
      socket.to(data.room).emit('answer', data)
      peer?.to(data.room).emit('answer', data)
    })

    socket.on('ice', (data) => {
      socket.to(data.room).emit('ice', data)
      peer?.to(data.room).emit('ice', data)
    })

    socket.on('request_stream', () => {
      console.log(`[${label}] REQUEST_STREAM → broadcast cả 2 server`)
      socket.to('facecam').emit('request_stream')
      peer?.to('facecam').emit('request_stream')
    })

    socket.on('config_updated', () => {
      console.log(`[${label}] CONFIG_UPDATED → notify viewer`)
      socket.to('facecam').emit('config_updated')
      peer?.to('facecam').emit('config_updated')
    })

    socket.on('disconnect', (reason) => {
      const rooms = [...socket.rooms].join(', ') || 'none'
      console.log(`[${label}] DISCONNECT ${socket.id} | reason: ${reason} | rooms: ${rooms}`)
      // notify viewer nếu phone drop
      peer?.to('facecam').emit('phone_disconnected')
      io.to('facecam').emit('phone_disconnected')
    })
  })
}

// HTTP server (USB mode - localhost is secure context)
const httpServer = http.createServer(app)
const httpIO = new Server(httpServer)
let httpsIO = null

httpServer.listen(HTTP_PORT, '0.0.0.0', async () => {
  const usbURL = `http://localhost:${HTTP_PORT}/phone.html`
  const qr = await QRCode.toString(usbURL, { type: 'terminal', small: true })
  console.log(`[HTTP]  http://localhost:${HTTP_PORT}  (USB mode)`)
  console.log('\nQR USB (phone cắm dây):')
  console.log(qr)
})

// HTTPS server (WiFi mode)
try {
  const httpsServer = https.createServer({
    key: fs.readFileSync(path.join(__dirname, 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'cert.pem')),
  }, app)
  httpsIO = new Server(httpsServer)
  setupSignaling(httpsIO, httpIO, 'HTTPS')
  setupSignaling(httpIO, httpsIO, 'HTTP')

  httpsServer.listen(HTTPS_PORT, '0.0.0.0', async () => {
    const ip = getLocalIP()
    const wifiURL = `https://${ip}:${HTTPS_PORT}/phone.html`
    const qr = await QRCode.toString(wifiURL, { type: 'terminal', small: true })
    console.log(`[HTTPS] https://${ip}:${HTTPS_PORT}  (WiFi mode)`)
    console.log('\nQR WiFi (phone không dây):')
    console.log(qr)
  })
} catch {
  console.log('[HTTPS] Bỏ qua — không tìm thấy cert.pem/key.pem')
  setupSignaling(httpIO, null, 'HTTP')
}

console.log(`\nMở trên PC: http://localhost:${HTTP_PORT}\n`)
