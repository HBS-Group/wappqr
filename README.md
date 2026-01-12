# WhatsApp Backend API

Backend server for WhatsApp Web integration using Express.js and whatsapp-web.js.

## Features

- ✅ QR Code generation for WhatsApp login
- ✅ Persistent session with LocalAuth
- ✅ Send WhatsApp messages via API
- ✅ Connection status monitoring
- ✅ CORS enabled for frontend integration

## Installation

```bash
cd backend
npm install
```

## Running the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

## API Endpoints

### 1. Get QR Code
```
GET /whatsapp/qr
```
Returns QR code image (base64) for WhatsApp login or connection status.

**Responses:**
- `status: 'connected'` - Already connected
- `status: 'qr_available'` - QR code ready to scan
- `status: 'loading'` - WhatsApp is initializing

### 2. Check Status
```
GET /whatsapp/status
```
Returns current connection status.

### 3. Send Message
```
POST /whatsapp/send
Content-Type: application/json

{
  "phone": "201234567890",
  "message": "Hello from WhatsApp API!"
}
```

### 4. Logout
```
POST /whatsapp/logout
```
Disconnects WhatsApp session.

### 5. Health Check
```
GET /health
```
Check if the server is running.

## Session Storage

WhatsApp session data is stored locally in:
```
.wwebjs_auth/session-main-session/
```

⚠️ **Important:** This folder must persist to maintain your WhatsApp session.

## Frontend Integration

The backend is configured to accept requests from:
- `http://localhost:5173` (Vite default)
- `http://localhost:3000`

Update `src/app.js` CORS settings if using different ports.

## Environment Variables

Create a `.env` file:
```
PORT=3000
NODE_ENV=development
```

## Flow

1. Start the backend server
2. Frontend calls `GET /whatsapp/qr`
3. Display QR code to user
4. User scans QR with WhatsApp mobile app
5. Session is saved automatically
6. Send messages via `POST /whatsapp/send`

## Tech Stack

- **Node.js** - Runtime
- **Express.js** - Web framework
- **whatsapp-web.js** - WhatsApp Web API
- **qrcode** - QR code generation
- **cors** - Cross-origin resource sharing
