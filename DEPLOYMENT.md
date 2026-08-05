# Deployment & Operations Guide

## 1. Prerequisites

- **Docker:** v20.10+ & Docker Compose v2.0+
- **Node.js (for local dev without Docker):** v18+ or v20+

---

## 2. Docker Deployment (Recommended)

```bash
# 1. Clone repository
git clone <repo-url>
cd propel

# 2. Start full containerized stack
docker compose up --build
```

The system will start on `http://localhost:3000` pre-seeded with synthetic network data.

---

## 3. Local Non-Docker Setup

```bash
# 1. Install dependencies
npm install
npm --prefix frontend install

# 2. Run unit test suite
npm test

# 3. Start development server
npm run dev
```

---

## 4. Environment Variables Reference

| Variable | Purpose | Default | Required |
|----------|---------|---------|----------|
| `PORT` | HTTP & WebSocket server port | `3000` | No |
| `NODE_ENV` | Environment mode (`development` / `production`) | `production` | No |
| `LOG_LEVEL` | Application logging detail | `info` | No |

---

## 5. Deployment Troubleshooting Matrix

| Symptom | Probable Cause | Resolution |
|---------|----------------|------------|
| **Port 3000 in use** | Another process occupies port 3000 | Set `PORT=3001 docker compose up` or kill process on 3000. |
| **WebSocket Connection Failed behind proxy** | Proxy stripping Upgrade header | Ensure Nginx/Cloudflare has `proxy_set_header Upgrade $http_upgrade;` enabled. |
| **Cold-start timeout on free tier (Railway/Render)** | Free container sleeping | Wait 30–45s for initial seed boot; see health check at `/api/network/summary`. |
| **Map Tiles Not Rendering** | Offline environment or blocked tile CDN | CartoDB dark tiles fall back to standard OpenStreetMap tiles automatically. |
