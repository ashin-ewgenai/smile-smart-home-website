# Smile Smart Homes Website

Modern Astro + React site with an Admin SPA and Super Admin SSR section.

- Astro v5 with Node adapter (SSR)
- React for Admin dashboard (client:only)
- Firebase (Auth/Firestore)
- TailwindCSS
- Smooth SPA-like navigation across public pages via Astro View Transitions

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
│   └── favicon.svg
├── src/
│   ├── layouts/
│   │   └── Layout.astro
│   └── pages/
│       └── index.astro
├── functions/
│   └── package.json
└── package.json
```

To learn more about the folder structure of an Astro project, refer to [our guide on project structure](https://docs.astro.build/en/basics/project-structure/).

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                     | Action                                             |
| :-------------------------- | :------------------------------------------------- |
| `npm install`               | Installs dependencies for root and `functions/`    |
| `npm run dev`               | Starts Astro dev server at `localhost:4321`        |
| `npm run build`             | Build your production site to `./dist/`            |
| `npm run preview`           | Preview your build locally                         |
| `npm run astro ...`         | Run CLI commands like `astro add`, `astro check`   |
| `npm run astro -- --help`   | Get help using the Astro CLI                       |
| `npm start`                 | Start SSR server (Node adapter, production)        |
| `npm run functions:serve`   | Build and start Firebase Functions emulator        |
| `npm run functions:deploy`  | Deploy only Firebase Functions                     |
| `npm run functions:logs`    | Stream Firebase Functions logs                     |

### Monorepo setup (npm workspaces)

This project uses npm workspaces so a single install at the repo root sets up both the web app and Firebase Functions.

- Install everything once from root:

```bash
npm install
```

- Add a dependency to the web app (root):

```bash
npm i <pkg>
```

- Add a dependency only to Firebase Functions:

```bash
npm i -w functions <pkg>
```

- Add a devDependency only to Firebase Functions:

```bash
npm i -D -w functions <pkg>
```

### Firebase Functions

- Run emulator (functions only):

```bash
npm run functions:serve
```

- Deploy functions only:

```bash
npm run functions:deploy
```

### SSR (Server-Side Rendering)

- This project uses Astro Node adapter in standalone mode for SSR.
- Config: see `astro.config.mjs` (`output: 'server'`, `adapter: node({ mode: 'standalone' })`).
- Server-side auth middleware: `src/middleware.ts` protects routes under `/super_admin-a1b2c3`.

Dynamic Super Admin user page:

- Page: `src/pages/super_admin-a1b2c3/user/[uid].astro`
- Navigate as `/super_admin-a1b2c3/user/<UID>` (e.g., from a users list choose a UID and link to that URL).

### Deploy to Cloud Run (standalone Node)

Prereqs: gcloud CLI logged in and a GCP project selected.

1. Build container image (from repo root):

```bash
gcloud builds submit --tag gcr.io/$(gcloud config get-value project)/smile-astro-ssr
```

2. Deploy to Cloud Run:

```bash
gcloud run deploy smile-astro-ssr \
  --image gcr.io/$(gcloud config get-value project)/smile-astro-ssr \
  --platform managed \
  --region asia-south1 \
  --allow-unauthenticated \
  --port 8080
```

3. After deploy, Cloud Run outputs a service URL. Optionally, put Firebase Hosting or a custom domain in front as a reverse proxy.

### Notes

- Keep a single lockfile at the repo root. If `functions/package-lock.json` exists, delete it and run `npm install` again at root.
- `functions/package.json` sets `$schema` for better editor support and uses Node `"engines": { "node": "22" }`.
- SSR requires `@astrojs/node` (already in devDependencies). Run `npm install` at root to fetch it.

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).
