# ELEVATEX Backend

## Setup
1. `cd backend`
2. `cp .env.example .env`
3. Create DB and run schema:
   - `mysql -u <user> -p -e "CREATE DATABASE IF NOT EXISTS elevatex CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"`
   - `mysql -u <user> -p elevatex < sql/schema.sql`
4. `npm install`
5. `npm run dev`

Server starts at `http://localhost:4000`.

## Endpoints
- `GET /api/health`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/google/start`
- `GET /api/auth/google/callback`
- `GET /api/auth/github/start`
- `GET /api/auth/github/callback`
- `POST /api/support/chat`
- `POST /api/support/issues`
- `GET /api/support/issues?email=client@example.com`

## Storage Mode
- Preferred: MySQL (`users` and `support_issues` tables)
- Automatic fallback: local JSON file at `backend/data/store.json` when MySQL is unavailable
- Health endpoint reports mode:
  - `mode: "mysql"` when DB is connected
  - `mode: "file_fallback"` when DB is unavailable

## OAuth Setup
Create OAuth apps and set callback URLs exactly:

- Google callback: `http://localhost:4000/api/auth/google/callback`
- GitHub callback: `http://localhost:4000/api/auth/github/callback`

Set these values in `.env`:
- `FRONTEND_ORIGIN` (where your frontend is running, e.g. `http://localhost:5500`)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`
- `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_MAX_TOKENS`, `OPENAI_TEMPERATURE`

## Production Notes
- Set `NODE_ENV=production`.
- Set `FRONTEND_ORIGIN` to one or more deployed origins (comma-separated), not `*`.
- Set strong JWT secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`) with at least 32 characters each.
- If OAuth is enabled, use non-localhost callback URLs.
- Health should report `mode: "mysql"` for production-grade persistence.
- Use the root deployment runbook: [`../DEPLOY_PRODUCTION.md`](../DEPLOY_PRODUCTION.md).

## Support Chatbot Notes
- The support chatbot can suggest solutions and auto-log issue tickets into `support_issues`.
- If `OPENAI_API_KEY` is not configured, a fallback support responder is used.
- Run schema file again (safe with `IF NOT EXISTS`) to ensure `support_issues` table exists:
  - `mysql -u <user> -p elevatex < sql/schema.sql`

## Request examples
### Signup
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "+919876543210",
  "company": "Acme",
  "password": "Password123!"
}
```

### Login
```json
{
  "identifier": "john@example.com",
  "password": "Password123!"
}
```
