# Production Deployment Guide

This project is configured for single-origin deployment:
- Frontend static files are served by Express.
- API is served at `/api/*` from the same domain.

## 1) Prepare environment variables

1. Copy production template:
   - `cp backend/.env.production.example backend/.env.production`
2. Fill real values:
   - DB credentials (`DB_*`)
   - `FRONTEND_ORIGIN` with your final domain (for this setup: `https://www.elevatex.com,https://elevatex.com`)
   - Strong JWT secrets (minimum 32 characters each)
   - OAuth credentials/callbacks if using Google/GitHub login

Generate secrets quickly:
- `openssl rand -base64 48`

## 2) Validate config in production mode

Run:
- `cd backend`
- `set -a; source .env.production; set +a`
- `node -e "require('./src/config'); console.log('production config ok')"`

## 3) Build and test Docker image

From repo root:
- `docker build -t elevatex:prod .`
- `docker run --rm -p 4000:4000 --env-file backend/.env.production elevatex:prod`

Smoke test:
- `curl -sS http://localhost:4000/api/health`
- Open `http://localhost:4000` in browser.

## 4) Deploy to cloud

Use any platform that supports Docker images/containers.

Required deploy settings:
- Docker build context: repository root
- Dockerfile path: `./Dockerfile`
- Container port: `4000` (or set `PORT` from platform)
- Health check path: `/api/health`
- Environment variables: from `backend/.env.production` (without comments)

### Render (quick path)
- A Render Blueprint file is included: [`render.yaml`](./render.yaml).
- In Render, create a new Blueprint service from this repository.
- After the service is created, fill all `sync: false` environment variables in the Render dashboard.
- Redeploy once environment variables are set.

### Render (one-command API apply)
If you have Render API access, you can apply domains + env vars + redeploy automatically:
- Export:
  - `RENDER_API_KEY`
  - `RENDER_SERVICE_ID`
- Ensure `backend/.env.production` contains real production values.
- Run:
  - `./scripts/render_apply_production.sh`

## 5) Post-deploy verification

After deploy, verify:
- `GET /api/health` responds successfully
- Signup/Login works
- Support chatbot sends responses
- OAuth callbacks work (if enabled)

For production persistence, health should report:
- `mode: "mysql"`
