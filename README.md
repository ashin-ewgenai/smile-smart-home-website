# Smile Smart Homes Website

Modern Astro + React site with an Admin SPA and Super Admin SSR section.

- Astro v5 with Node adapter (SSR)
- React for Admin dashboard (client:only)
- Firebase (Auth/Firestore)
- TailwindCSS
- Smooth SPA-like navigation across public pages via Astro View Transitions

## 🏗️ Overall Project Architecture

The Smile Smart Homes Website is a modern web application that combines server-side rendering (SSR) with client-side React components to deliver a seamless smart home management experience. The architecture follows a modular separation between backend cloud functions and frontend utilities.

**Key Architectural Components:**
- **Astro v5 with Node Adapter**: Provides SSR capabilities for optimal performance and SEO
- **React Admin Dashboard**: Client-side SPA for administrative interfaces
- **Firebase Integration**: Comprehensive backend services including Authentication, Firestore, Cloud Functions, and Storage
- **TailwindCSS**: Utility-first styling framework for modern UI design
- **Smooth Navigation**: Astro View Transitions enable SPA-like navigation across public pages

The project uses a monorepo structure with npm workspaces, allowing seamless dependency management between the main web application and Firebase Cloud Functions.

## 📁 Comprehensive Project Structure

```text
/
├── functions/                    # Firebase Cloud Functions (Gen 2)
│   ├── src/
│   │   ├── chatbot.ts           # AI-powered chatbot backend
│   │   ├── adminClearUserChat.ts # Admin chat management
│   │   ├── adminDeleteUserAndData.ts # User data deletion
│   │   └── index.ts             # Functions entry point
│   └── package.json
├── functions-gen1/               # Firebase Cloud Functions (Gen 1)
│   └── src/index.ts             # Legacy functions
├── src/                          # Frontend source code
│   ├── contexts/
│   │   └── DevicesContext.tsx   # Device state management
│   ├── hooks/                    # Custom React hooks
│   ├── lib/                      # Utility libraries
│   ├── models/                   # Data models and types
│   ├── middleware.ts             # Request middleware
│   └── pages/                    # Astro pages
├── public/                       # Static assets
└── firebase.json                 # Firebase configuration
```

## 🔧 Backend Functions

### Firebase Cloud Functions (Gen 2) - `functions/`

The backend leverages Firebase Cloud Functions Gen 2 for scalable server-side logic:

#### `functions/src/chatbot.ts`
**Purpose**: AI-powered chatbot backend handling user queries and intelligent responses
**Key Features**:
- Integrates with OpenAI GPT-4.1 model for natural language processing
- Implements rate limiting (15 requests per minute, 3-second cooldown)
- Manages chat sessions and message history in Firestore
- Provides device-specific context and support ticket integration
- Handles device control queries and troubleshooting assistance

**Configuration**:
```typescript
const CONFIG = {
  RATE_LIMIT: {
    COOLDOWN_MS: 3000,
    WINDOW_MS: 60000,
    MAX_PER_WINDOW: 15
  },
  OPENAI: {
    MODEL: "gpt-4.1",
    TEMPERATURE: 0.4,
    MAX_TOKENS: 310
  }
};
```

#### `functions/src/adminClearUserChat.ts`
**Purpose**: Administrative function to clear user chat history and sessions
**Features**:
- Secure admin-only access with role verification
- Complete deletion of chat sessions and messages from Firestore
- Storage cleanup for any chat-related files
- Audit logging for administrative actions

#### `functions/src/adminDeleteUserAndData.ts`
**Purpose**: Comprehensive user data deletion for privacy compliance
**Features**:
- Complete user account deletion from Firebase Authentication
- Firestore document cleanup across all collections
- Firebase Storage file deletion (user uploads, avatars, etc.)
- Multi-bucket support for different storage locations
- Detailed deletion reporting and error handling

### Legacy Functions (Gen 1) - `functions-gen1/`

Contains older Firebase Functions for backward compatibility. New development should use Gen 2 functions.

## ⚛️ Frontend Contexts and Hooks

### React Contexts

#### `src/contexts/DevicesContext.tsx`
**Purpose**: Centralized device state management for the smart home ecosystem
**Features**:
- Manages device inventory and status across multiple rooms
- Provides real-time device updates via Firestore listeners
- Handles device control operations (on/off, settings, schedules)
- Caches device data for offline functionality
- Supports device grouping and room-based organization

**Usage Example**:
```typescript
// Custom hook usage in React components
const { devices, controlDevice, addDevice } = useDevices();
await controlDevice(deviceId, { power: true, brightness: 80 });
```

### React Components Architecture

The project includes extensive React component structures for both Admin and User dashboards:

#### Admin Dashboard Components (`src/components/dashboard/Admin/`)
- **Core Layout**: `AdminDashboard.tsx`, `DashboardLayout.tsx`, `AdminSidebar.tsx`
- **Pages**: `Devices.tsx`, `AdminUsers.tsx`, `Estimates.tsx`, `Reports.tsx`, `Alerts.tsx`
- **Forms**: `DeviceForm.tsx`, `EstimationTool.tsx`
- **Modals**: `AddDeviceModal.tsx`, `DeviceDetailsModal.tsx`

#### User Dashboard Components (`src/components/dashboard/User/`)
- **Core Layout**: `DashboardApp.tsx`, `DashboardLayout.tsx`
- **Pages**: `AboutDevices.tsx`, `MyQuotes.tsx`, `NotificationsPage.tsx`
- **Account**: `ChangePassword.tsx`, `PaymentHistoryModal.tsx`

#### Common Components (`src/components/common/`)
- **Authentication**: `AuthNavClient.tsx`
- **Notifications**: `NotificationBadge.tsx`, `TicketNotificationButton.tsx`
- **UI**: `LocationSelector.tsx`, `ContactForm.tsx`

### Custom React Hooks

#### `src/hooks/useTicketNotifications.ts`
**Purpose**: Real-time support ticket notifications for administrators
**Features**: Custom hook that monitors new support tickets and provides toast notifications

#### `src/hooks/useUnclosedServiceRequestsCount.ts`
**Purpose**: Tracks pending service requests for dashboard metrics
**Features**: Custom hook providing real-time count of unresolved service requests

#### `src/hooks/useUnconfirmedQuotesCount.ts`
**Purpose**: Manages quote confirmation workflow
**Features**: Custom hook that tracks quotes awaiting customer approval

#### Additional Custom Hooks
- `src/hooks/useAuth.ts`: Custom authentication state management hook
- Various dashboard-specific hooks for admin and user interfaces

## 🛠️ Utility Libraries

### `src/lib/firebase.ts`
**Purpose**: Firebase client initialization and configuration
**Features**:
- Firebase app initialization with hardcoded configuration
- Authentication setup with local persistence
- Firestore initialization with long-polling support
- Storage and Functions configuration for us-central1 region
- App Check integration with reCAPTCHA v3

### `src/lib/constants.ts`
**Purpose**: Centralized application constants and configuration
**Features**: Contains reusable constants for API endpoints, collection names, and UI configurations

### `src/lib/firebase-auth-client.ts`
**Purpose**: Firebase Auth function exports for module script compatibility
**Features**: Re-exports authentication functions for use in Astro module scripts

### Additional Utilities
- `animate.ts`: Animation utilities and transitions
- `lenis-init.ts`: Smooth scrolling initialization
- `toast.ts`: Notification system implementation
- `useAuth.ts`: Authentication state management

## 🚦 Middleware

### `src/middleware.ts`
**Purpose**: Request processing middleware for SSR routes (currently placeholder implementation)
**Current State**: Minimal implementation passing through all requests - serves as a placeholder for future authentication and route protection logic
**Intended Use**: Will handle authentication, route protection, and request preprocessing when fully implemented

### `src/_middleware.disabled.ts`
**Purpose**: Disabled middleware for static hosting builds
**Features**: Placeholder middleware that can be enabled when switching from static to SSR hosting

## 📊 Data Models

### `src/models/Collections.ts`
**Purpose**: TypeScript type definitions for Firestore collections
**Features**:
- Comprehensive type definitions for all Firestore collections
- User, Device, Ticket, and Support request models
- Type-safe database operations and queries
- Validation schemas for data integrity

### `src/data/indiaLocations.js`
**Purpose**: Static geographical data for location-based features
**Features**: Complete list of Indian states and cities for user registration and service area configuration

## 🔄 Example Interaction Flow

### Device Control Flow
1. **User Action**: User toggles device from React component
2. **Context Update**: `DevicesContext` updates device state locally
3. **API Call**: Context calls Firebase Function to update device
4. **Backend Processing**: Cloud Function validates and processes command
5. **Database Update**: Device state updated in Firestore
6. **Real-time Sync**: All connected clients receive state update via listeners

### Admin Support Ticket Flow
1. **Ticket Creation**: User submits support request via frontend form
2. **Notification**: `useTicketNotifications` hook detects new ticket
3. **Admin Alert**: Toast notification appears in admin dashboard
4. **Ticket Management**: Admin can view, assign, and resolve tickets
5. **Chat Integration**: Optional chatbot assistance for ticket resolution

## 🔐 Authentication & Security

### Firebase Authentication Integration
- Multi-role authentication (User, Admin, Super Admin)
- Protected routes using middleware
- Session persistence across browser reloads
- Admin-only function access with role verification

### Security Features
- API key management through Firebase configuration
- Rate limiting on chatbot functions
- Input validation and sanitization
- Secure file handling in Firebase Storage

## 🚀 Deployment Architecture

### Development Environment
- Local development server: `npm run dev`
- Firebase Functions emulator: `npm run functions:serve`
- Hot reloading for both frontend and backend

### Production Deployment
- **Frontend**: Deployed to Cloud Run with Node.js standalone mode
- **Backend**: Firebase Cloud Functions with automatic scaling
- **Database**: Firestore with security rules
- **Storage**: Firebase Storage with access controls
- **Hosting**: Optional Firebase Hosting as reverse proxy

This modular architecture ensures scalability, maintainability, and clear separation of concerns between frontend and backend components.

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
- **Note**: Route protection for `/super_admin-a1b2c3` is currently handled at the component level, not via middleware (middleware.ts is placeholder).

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
