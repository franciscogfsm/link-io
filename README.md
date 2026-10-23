<div align="center">

# LINK.IO

Build energy networks in an anti-gravity arena. A real-time multiplayer .io game.

<img src="https://img.shields.io/badge/React-61DAFB?style=flat&logo=react&logoColor=black" alt="React">
<img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript">
<img src="https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white" alt="Vite">
<img src="https://img.shields.io/badge/Node.js-5FA04E?style=flat&logo=nodedotjs&logoColor=white" alt="Node.js">
<img src="https://img.shields.io/badge/Express-000000?style=flat&logo=express&logoColor=white" alt="Express">
<img src="https://img.shields.io/badge/Socket.IO-010101?style=flat&logo=socketdotio&logoColor=white" alt="Socket.IO">
<img src="https://img.shields.io/badge/Vercel-000000?style=flat&logo=vercel&logoColor=white" alt="Vercel">

<sub>
<a href="DEPLOY.md">Deployment</a>
</sub>

</div>

<br>

Players move through an anti-gravity arena, linking nodes into energy networks and breaking their
rivals' links. The server runs the game; the client renders it on a canvas with interpolation, particles and
sound.

## Start

Needs Node 18 or newer.

```bash
npm run install:all     # root, client and server
npm run dev             # server and client together
```

| | Address |
|---|---|
| Client | http://localhost:5173 |
| Server | http://localhost:3001 |
| Health check | http://localhost:3001/health |

## Layout

```
client/src/game/       renderer, camera, input, interpolation, particles, audio
client/src/screens/    landing, menu, game and game-over screens
client/src/network/    Socket.IO client
server/src/game/       authoritative game loop and rules
server/src/rooms/      matchmaking and rooms
shared/types.ts        types shared by client and server
```

[`DEPLOY.md`](DEPLOY.md) covers production builds and hosting the client and the server separately.
