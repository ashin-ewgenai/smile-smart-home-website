# Build and run Astro SSR (Node adapter, standalone) on Cloud Run
# Use Node 22 to match functions runtime and modern features
FROM node:22-alpine AS base

# Enable faster, smaller installs
ENV NODE_ENV=production
ENV CI=true

WORKDIR /app

# Install dependencies (use separate layer for better caching)
# Copy only manifest files first
COPY package.json package-lock.json ./

# If using npm workspaces, ensure workspaces are installed as well
# (functions/ is a workspace but not required in the container; still safe to include lock if present)
RUN npm ci

# Copy the rest of the source
COPY . .

# Build Astro for server output
RUN npm run build

# Cloud Run provides PORT env var; Astro respects it via `astro start`
EXPOSE 8080
ENV PORT=8080

CMD ["npm", "start"]
