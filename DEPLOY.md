# LINK.IO - Deployment Guide

## Local Development

### Prerequisites
- Node.js 18+
- npm 9+

### Quick Start
```bash
# Install all dependencies
npm run install:all

# Run both server & client concurrently
npm run dev
```

- **Client**: http://localhost:5173
- **Server**: http://localhost:3001
- **Health check**: http://localhost:3001/health

### Manual Start (if concurrently doesn't work)
```bash
# Terminal 1 - Server
cd server
npm run dev

# Terminal 2 - Client  
cd client
npm run dev
```

---

## Production Deployment

### Client → Vercel

1. Connect your GitHub repo to Vercel
2. Set root directory to `client/`
3. Set build command: `npm run build`
4. Set output directory: `dist`
5. Add environment variable:
   - `VITE_SERVER_URL` = `https://your-server.onrender.com`
6. Deploy!

### Server → Render

1. Create a new Web Service on Render
2. Set root directory to `server/`
3. Set build command: `npm install`
4. Set start command: `npx tsx src/index.ts`
5. Add environment variables:
   - `PORT` = `3001` (Render may override this)
   - `CLIENT_URL` = `https://your-app.vercel.app`
6. Deploy!

### Server → Fly.io

```bash
cd server
fly launch
fly secrets set CLIENT_URL=https://your-app.vercel.app
fly deploy
```

---

## Environment Variables

### Client (`client/.env.production`)
```
VITE_SERVER_URL=https://your-server.onrender.com
```

### Server (`server/.env`)
```
PORT=3001
CLIENT_URL=https://your-app.vercel.app
```

## WebSocket Production Setup

The Socket.IO server uses both WebSocket and HTTP long-polling transports.
For production behind a reverse proxy, ensure WebSocket upgrade headers are forwarded:

```nginx
location /socket.io/ {
    proxy_pass http://server:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```
