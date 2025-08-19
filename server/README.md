# Smile Smart Home — Backend Server

This folder contains a minimal Express backend that exposes API endpoints and connects to Firebase Realtime Database via the Firebase Admin SDK. The goal is to prevent the frontend from talking to the DB directly.

## Structure

- `src/index.ts` — Express server entry, CORS, health check, and routes mounting
- `src/db/firebase.ts` — Firebase Admin initialization for Realtime Database
- `src/routes/users.ts` — Example CRUD routes backed by Firebase RDB (`/api/users`)
- `.env.example` — Environment variables template
- `tsconfig.json` — TS config (CommonJS)
- `package.json` — Scripts and dependencies

## Setup

1) Install dependencies

```
cd server
npm install
```

2) Configure environment

- Copy `.env.example` to `.env`
- Fill in your Firebase Admin credentials and DB URL

Notes for private key:
- If pasting into `.env`, keep it on one line with `\n` for newlines, e.g. `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n`

3) Run the server (dev)

```
npm run dev
```

The server will start on `http://localhost:4000` by default.

4) Build and run (prod)

```
npm run build
npm start
```

## Endpoints (examples)

- `GET /health` → `{ status: 'ok' }`
- `GET /api/users` → all users object
- `GET /api/users/:id` → one user
- `POST /api/users` → create user (JSON body)
- `PUT /api/users/:id` → update user (JSON body)
- `DELETE /api/users/:id` → delete user

## Frontend integration

Replace direct Firebase calls in the frontend with HTTP requests to this server. Example:

```ts
// fetch all users from frontend
const res = await fetch(import.meta.env.PUBLIC_API_BASE + '/api/users');
const users = await res.json();
```

You can set `PUBLIC_API_BASE` in Astro as a public env or hardcode `http://localhost:4000` for local dev.

## CORS

- Allowed origin is controlled by `CORS_ORIGIN` in `.env`. For local Astro dev, set it to `http://localhost:4321`.

## Notes

- This backend uses Firebase Admin SDK, which requires a service account. Never commit real credentials.
- The example `users` routes use the `/users` path in your Realtime Database; adjust as needed.
