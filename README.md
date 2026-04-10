# Smile Smart Homes Website

Modern Astro + React site with an Admin SPA, Super Admin section, and AI-powered smart home features.

- Astro v5 with static output
- React for Admin dashboard (client:only)
- Firebase (Auth/Firestore/Functions/Storage)
- TailwindCSS with custom design system
- Framer Motion animations
- AI-powered room visualization and device recommendations
- Multi-channel notifications (Email & WhatsApp)

## 🏗️ Overall Project Architecture

The Smile Smart Homes Website is a modern web application that combines static site generation with client-side React components and Firebase backend services to deliver a comprehensive smart home management experience.

**Key Architectural Components:**
- **Astro v5 with Static Output**: Optimized static site generation for performance
- **React Admin Dashboard**: Client-side SPA for administrative interfaces with real-time data
- **Firebase Integration**: Comprehensive backend services including Authentication, Firestore, Cloud Functions (Gen 2), and Storage
- **TailwindCSS**: Custom design system with extended theme (charcoal, teal, soft-gray)
- **Framer Motion**: Advanced animations and transitions
- **AI Integration**: OpenAI GPT-4o for room visualization and smart recommendations
- **Multi-channel Notifications**: Twilio (WhatsApp) + EmailJS/SMTP for quote delivery

The project uses a monorepo structure with npm workspaces, allowing seamless dependency management between the main web application and Firebase Cloud Functions.

## 📁 Project Structure

This section describes the folder and file organization for `src/`, `functions/`, and `hooks/`.

### Comprehensive Project Structure

```text
/
├── functions/                    # Firebase Cloud Functions (Gen 2)
│   ├── src/
│   │   ├── chatbot.ts           # AI-powered chatbot backend
│   │   ├── aiVisualization.ts   # OpenAI room analysis
│   │   ├── deviceRecommendations.ts # Health scoring & notifications
│   │   ├── sceneManagement.ts   # Smart scene CRUD
│   │   ├── adminClearUserChat.ts # Admin chat management
│   │   ├── adminDeleteUserAndData.ts # User data deletion
│   │   ├── reviews.ts           # Customer review submission
│   │   └── index.ts             # Functions entry point & super admin
│   └── package.json
├── functions-gen1/               # Firebase Cloud Functions (Gen 1 - legacy)
│   └── src/index.ts             # Legacy functions
├── src/                          # Frontend source code
│   ├── components/
│   │   ├── DeviceRecommendationsForm.tsx  # AI consultant & health dashboard
│   │   ├── RoomVisualization.tsx          # AI room photo analysis
│   │   ├── SceneBuilder.tsx             # Smart scene builder
│   │   ├── InteractiveFloorplan.tsx     # Visual room planner
│   │   ├── admin/                       # Admin dashboard components
│   │   ├── dashboard/                   # User dashboard components
│   │   └── supportChat/                 # Support chat panel
│   ├── contexts/
│   │   └── DevicesContext.tsx   # Global state + notifications
│   ├── hooks/                   # Custom React hooks
│   │   ├── useDeviceRecommendations.tsx  # AI recommendations
│   │   ├── useQuoteRequest.ts           # Quote notifications
│   │   ├── useSceneManagement.ts        # Scene builder logic
│   │   └── useTicketNotifications.ts    # Admin ticket alerts
│   ├── lib/
│   │   ├── firebase.ts          # Firebase client + storage utils
│   │   └── constants.ts         # App constants
│   ├── middleware.ts            # API authentication middleware
│   └── pages/                   # Astro pages
├── public/                      # Static assets
└── firebase.json                # Firebase configuration
```

## ⚙️ Environment Variables and Configuration

This section documents all required environment variables and configuration settings from `functions/src/` and `src/middleware.ts`.

### Required Firebase Secrets

Set via `firebase functions:secrets:set`:

| Secret | Description | Used In |
|--------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API for GPT-4o room analysis | `aiVisualization.ts` |
| `TWILIO_ACCOUNT_SID` | Twilio account for WhatsApp | `chatbot.ts`, `deviceRecommendations.ts` |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | `chatbot.ts`, `deviceRecommendations.ts` |
| `TWILIO_WHATSAPP_NUMBER` | Twilio WhatsApp sender | `chatbot.ts`, `deviceRecommendations.ts` |
| `EMAILJS_SERVICE_ID` | EmailJS service ID | `deviceRecommendations.ts` |
| `EMAILJS_TEMPLATE_ID` | EmailJS template ID | `deviceRecommendations.ts` |
| `EMAILJS_PUBLIC_KEY` | EmailJS public key | `deviceRecommendations.ts` |
| `SMTP_HOST` | SMTP server host (legacy fallback) | `deviceRecommendations.ts` |
| `SMTP_PORT` | SMTP server port | `deviceRecommendations.ts` |
| `SMTP_USER` | SMTP username | `deviceRecommendations.ts` |
| `SMTP_PASS` | SMTP password | `deviceRecommendations.ts` |
| `EMAIL_FROM` | Sender email address | `deviceRecommendations.ts` |

### Frontend Environment Variables

Create a `.env` file in the project root:

```bash
# Optional: Enable reCAPTCHA v3 App Check
PUBLIC_RECAPTCHA_V3_SITE_KEY=your_recaptcha_site_key

# Optional: Middleware project ID (defaults to firebase config)
FIREBASE_PROJECT_ID=smile-smart-homes
```

### Middleware Configuration

`src/middleware.ts` reads:
- `FIREBASE_PROJECT_ID` - For Firebase Admin initialization
- Bearer tokens from `Authorization` header for `/api/health` endpoints

---

## 🔧 Backend Functions

### Firebase Cloud Functions (Gen 2) - `functions/`

The backend leverages Firebase Cloud Functions Gen 2 for scalable server-side logic with enhanced timeout and memory configuration.

#### `functions/src/chatbot.ts`
**Purpose**: AI-powered chatbot backend handling user queries and intelligent responses
**Key Features**:
- Integrates with OpenAI GPT-4.1 model for natural language processing
- Implements rate limiting (15 requests per minute, 3-second cooldown)
- Manages chat sessions and message history in Firestore
- Provides device-specific context and support ticket integration
- Handles device control queries and troubleshooting assistance
- **Twilio WhatsApp Integration**: Sends proactive notifications via WhatsApp

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

**Secrets Required**: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`

---

#### `functions/src/aiVisualization.ts`
**Purpose**: AI-powered room visualization and device placement analysis
**Key Features**:
- Uses OpenAI GPT-4o Vision to analyze room photos
- Generates optimal device placement markers with coordinates
- Provides room type detection, lighting quality assessment, WiFi coverage analysis
- Falls back to deterministic placement when AI is unavailable
- Persists analysis results to Firestore for CRM tracking

**Configuration**:
- Timeout: 120 seconds
- Memory: 1GiB
- Model: GPT-4o with vision capabilities

**Secrets Required**: `OPENAI_API_KEY`

---

#### `functions/src/deviceRecommendations.ts`
**Purpose**: Device health monitoring and multi-channel quote notifications
**Key Features**:
- **Health Scoring**: Composite 0-100 score from battery, RSSI, and uptime telemetry
- **Predictive Alerts**: Critical and warning alerts for battery, signal, and connectivity
- **Email Notifications**: SMTP + EmailJS integration for quote delivery
- **WhatsApp Notifications**: Twilio integration for instant quote alerts
- **Firestore Triggers**: Automated notifications on Planner_Leads, quotes collection changes

**Functions**:
- `getDeviceHealthStatus` - Individual device health check
- `getAdminHealthOverview` - Aggregated fleet health stats
- `sendQuoteNotification` - Manual notification trigger
- `sendQuoteEmailCallable` - EmailJS-powered quote emails

**Secrets Required**: 
- EmailJS: `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY`
- SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`
- Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`

---

#### `functions/src/sceneManagement.ts`
**Purpose**: Smart home scene (automation routine) management
**Key Features**:
- CRUD operations for smart scenes
- Device action linking (on/off/dim/lock/temperature)
- Template-based scene creation
- Firestore persistence with real-time sync

---

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

#### `functions/src/reviews.ts`
**Purpose**: Customer review submission (Gen 1 for IAM compatibility)
**Features**:
- Authenticated review submission with rating and media
- Firestore persistence with approval workflow
- User attribution and timestamp tracking

### Legacy Functions (Gen 1) - `functions-gen1/`

Contains older Firebase Functions for backward compatibility (e.g., `submitReview`). New development should use Gen 2 functions.

## ⚛️ Frontend Contexts and Hooks

### React Contexts

#### `src/contexts/DevicesContext.tsx`
**Purpose**: Centralized state management for the smart home ecosystem with integrated notifications
**Features**:
- **Device Management**: Real-time device inventory with health telemetry
- **Admin CRM Data**: Live Planner_Leads, contactRequests, Support_Tickets with filtering
- **AI Recommendations**: Device recommendation state and persistence
- **Scene Management**: Smart scene fetching and saving
- **Room Visualization**: Photo upload, AI analysis, and marker display state
- **Live Consultation**: Real-time consultation session management
- **Global Notifications**: Snackbar + critical error modal system
- **Device Health**: Real-time health scores, battery, signal strength, predictive alerts

**Key Interfaces**:
```typescript
interface DeviceHealth {
  score: number;           // 0-100 composite health score
  status: 'Online' | 'Offline';
  batteryLevel: number;  // 0-100%
  signalStrength: number; // dBm (typically -30 to -90)
  alerts: string[];        // Predictive maintenance alerts
}
```

**Usage Example**:
```typescript
// Custom hook usage in React components
const { 
  devices, 
  recommendations, 
  uploadAndAnalyzeRoom, 
  showNotification,
  adminHealthStats,
  scenes,
  saveScene 
} = useDevices();

// Upload and analyze room photo
await uploadAndAnalyzeRoom(['Smart Bulb', 'Security Camera']);

// Show success notification
showNotification({ message: 'Analysis complete!', type: 'success' });
```

### React Components Architecture

The project includes extensive React component structures for both Admin and User dashboards:

#### AI & Smart Features Components
- **`DeviceRecommendationsForm.tsx`**: AI consultant with 4-step wizard (house size → security → budget → results), integrated with Device Health dashboard tab
- **`RoomVisualization.tsx`**: Drag-drop photo upload, AI analysis with interactive device markers, room insights card
- **`SceneBuilder.tsx`**: Visual scene builder with templates, device action linking, deployment controls
- **`InteractiveFloorplan.tsx`**: Visual room planning with clickable areas for device placement

#### Admin Dashboard Components (`src/components/dashboard/Admin/`)
- **Core Layout**: `AdminDashboard.tsx`, `DashboardLayout.tsx`, `AdminSidebar.tsx`
- **Pages**: `Devices.tsx`, `AdminUsers.tsx`, `Estimates.tsx`, `Reports.tsx`, `Alerts.tsx`
- **CRM Features**: Kanban board for leads, contact submissions, support tickets with drag-drop status updates
- **Forms**: `DeviceForm.tsx`, `EstimationTool.tsx`
- **Modals**: `AddDeviceModal.tsx`, `DeviceDetailsModal.tsx`

#### User Dashboard Components (`src/components/dashboard/User/`)
- **Core Layout**: `DashboardApp.tsx`, `DashboardLayout.tsx`
- **Pages**: `AboutDevices.tsx`, `MyQuotes.tsx`, `NotificationsPage.tsx`
- **Account**: `ChangePassword.tsx`, `PaymentHistoryModal.tsx`

#### Common Components (`src/components/common/`)
- **Authentication**: `AuthNavClient.tsx`
- **Notifications**: `NotificationBadge.tsx`, `TicketNotificationButton.tsx`, `QuoteNotificationButton.tsx`
- **UI**: `LocationSelector.tsx`, `ContactForm.tsx`

### Custom React Hooks

#### `src/hooks/useDeviceRecommendations.tsx`
**Purpose**: AI-powered device recommendations with room visualization
**Features**:
- 4-step recommendation wizard state management
- Form data persistence and validation
- Integration with Firebase Functions for AI recommendations
- Room photo upload and analysis coordination
- Quote saving to user profile

#### `src/hooks/useQuoteRequest.ts`
**Purpose**: Multi-channel quote notification management
**Features**:
- Email + WhatsApp notification triggering
- Loading states and success/error handling
- Offline detection with user-friendly error messages
- Integration with `DevicesContext` notification system

#### `src/hooks/useSceneManagement.ts`
**Purpose**: Smart scene builder state management
**Features**:
- Scene template selection and customization
- Device action linking (on/off/dim/lock/temp)
- CRUD operations with Firestore persistence
- Form validation and error handling

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
- `src/hooks/useReviews.ts`: Customer review submission with media upload
- `src/hooks/useActiveUsersCount.ts`: Real-time active user metrics

## 🛠️ Utility Libraries

### `src/lib/firebase.ts`
**Purpose**: Firebase client initialization and secure file uploads
**Features**:
- Firebase app initialization with project configuration
- Authentication with `browserLocalPersistence` (stays logged in across reloads)
- Firestore with `experimentalAutoDetectLongPolling` (QUIC/HTTP3 compatibility)
- Storage with resumable upload support and progress tracking
- Functions configured for `us-central1` region
- App Check with reCAPTCHA v3 (optional, when `PUBLIC_RECAPTCHA_V3_SITE_KEY` is set)

**Upload Utilities**:
```typescript
// Secure file upload with validation
uploadFile(file, basePath, { allowedTypes, maxSizeMB, onProgress })
uploadRoomPhoto(file, uid, onProgress)  // For AI visualization
uploadReviewMedia(file, uid)             // For customer reviews
```

### `src/lib/constants.ts`
**Purpose**: Centralized application constants and configuration
**Features**: 
- House sizes, security levels, budget ranges for AI consultant
- Collection names and API endpoints
- UI configuration constants

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
**Purpose**: API endpoint authentication and Firebase Admin integration
**Current Features**:
- **Protected Health API**: Bearer token verification for `/api/health` endpoints
- **Firebase Admin**: Dynamic initialization with project ID from environment
- **Token Verification**: Validates Firebase ID tokens with provider attribution logging

**Environment Variables**:
- `FIREBASE_PROJECT_ID`: Used for Firebase Admin initialization

**Example Protected Request**:
```typescript
// Client-side: Include Firebase ID token
const token = await auth.currentUser.getIdToken();
fetch('/api/health', { 
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### `src/_middleware.disabled.ts`
**Purpose**: Disabled middleware for static hosting builds
**Features**: Placeholder middleware that can be enabled when switching from static to SSR hosting

## 📊 Data Models

### `src/models/Collections.ts`
**Purpose**: TypeScript type definitions for Firestore collections
**Features**:
- Comprehensive type definitions for all Firestore collections
- User, Device, Ticket, Quote, PlannerLead, and Support request models
- Type-safe database operations and queries
- Validation schemas for data integrity

**Key Collections**:
- `Accounts` - User profiles with role (User/Admin/Super Admin)
- `Devices` - Product catalog with specs and pricing
- `User_Devices` - User's installed devices with health telemetry
- `Planner_Leads` - AI consultant and floorplan submissions
- `quotes` - User quote requests
- `Quotes/{uid}/Quote_List` - Nested user quotes (legacy)
- `Support_Tickets` - Customer support requests
- `contactRequests` - General contact form submissions
- `Reviews` - Customer reviews and ratings
- `Scenes` - User automation scenes
- `room_analyses` - AI room visualization results

### `src/data/indiaLocations.js`
**Purpose**: Static geographical data for location-based features
**Features**: Complete list of Indian states and cities for user registration and service area configuration

## 🔄 Example Interaction Flows

### Device Control Flow
1. **User Action**: User toggles device from React component
2. **Context Update**: `DevicesContext` updates device state locally
3. **API Call**: Context calls Firebase Function to update device
4. **Backend Processing**: Cloud Function validates and processes command
5. **Database Update**: Device state updated in Firestore
6. **Real-time Sync**: All connected clients receive state update via listeners

### AI Room Visualization Flow
1. **Upload**: User drags room photo into `RoomVisualization` drop zone
2. **Storage**: `uploadRoomPhoto()` uploads to Firebase Storage with progress
3. **Analysis**: `analyzeRoomWithAI` Cloud Function processes with GPT-4o Vision
4. **Markers**: AI returns device placement coordinates and insights
5. **Display**: Interactive markers rendered on photo with tooltips
6. **Persistence**: Results saved to `Planner_Leads` for CRM tracking

### Quote Notification Flow
1. **Submission**: User completes AI consultant or submits contact form
2. **Trigger**: Firestore `onDocumentCreated` trigger activates
3. **Enrichment**: Function enriches data from `Accounts` collection
4. **Multi-channel**: Email sent via EmailJS + WhatsApp via Twilio
5. **Logging**: Results logged to `System_Logs` for monitoring
6. **User Feedback**: Success confirmation shown in UI

### Admin Support Ticket Flow
1. **Ticket Creation**: User submits support request via frontend form
2. **Notification**: `useTicketNotifications` hook detects new ticket
3. **Admin Alert**: Toast notification appears in admin dashboard
4. **Ticket Management**: Admin can view, assign, and resolve tickets
5. **Chat Integration**: Optional chatbot assistance for ticket resolution

## 🔐 Authentication & Security

### Firebase Authentication Integration
- **Multi-role authentication**: User, Admin, Super Admin
- **Session persistence**: `browserLocalPersistence` keeps users logged in
- **Protected Functions**: Role verification for admin/super-admin operations
- **Token Verification**: Middleware validates Bearer tokens for API access

### Security Features
- **Rate Limiting**: Chatbot limited to 15 requests/minute with 3s cooldown
- **Input Validation**: TypeScript types + runtime validation on all inputs
- **Secure Uploads**: File type and size validation in `uploadFile()`
- **Row-level Security**: Firestore rules restrict data access by UID/role
- **Secret Management**: All API keys stored in Firebase Secrets (not code)
- **CORS**: Functions configured with appropriate CORS policies

## 🚀 Deployment Architecture

### Development Environment
- **Frontend**: `npm run dev` (Astro dev server at `localhost:4321`)
- **Functions**: `npm run functions:serve` (Firebase emulator)
- **Proxy**: API requests proxied to `localhost:4000` via Vite config
- **Hot reloading**: Both frontend and functions support hot reload

### Production Deployment
- **Frontend**: Static build to `dist/` (configured for Firebase Hosting)
- **Backend**: Firebase Cloud Functions Gen 2 with auto-scaling
- **Database**: Firestore with security rules
- **Storage**: Firebase Storage with path-based access controls
- **Hosting**: Firebase Hosting with SPA fallback configuration

### Environment Configuration

#### Required Firebase Secrets (set via `firebase functions:secrets:set`):
```bash
# AI Features
firebase functions:secrets:set OPENAI_API_KEY

# WhatsApp Notifications (Twilio)
firebase functions:secrets:set TWILIO_ACCOUNT_SID
firebase functions:secrets:set TWILIO_AUTH_TOKEN
firebase functions:secrets:set TWILIO_WHATSAPP_NUMBER

# Email Notifications (EmailJS)
firebase functions:secrets:set EMAILJS_SERVICE_ID
firebase functions:secrets:set EMAILJS_TEMPLATE_ID
firebase functions:secrets:set EMAILJS_PUBLIC_KEY

# Legacy SMTP (optional fallback)
firebase functions:secrets:set SMTP_HOST
firebase functions:secrets:set SMTP_PORT
firebase functions:secrets:set SMTP_USER
firebase functions:secrets:set SMTP_PASS
firebase functions:secrets:set EMAIL_FROM
```

#### Frontend Environment Variables (`.env` file):
```bash
# Optional: Enable reCAPTCHA v3 App Check
PUBLIC_RECAPTCHA_V3_SITE_KEY=your_recaptcha_site_key

# Optional: Middleware project ID (defaults to config)
FIREBASE_PROJECT_ID=smile-smart-homes
```

This modular architecture ensures scalability, maintainability, and clear separation of concerns between frontend and backend components.

## 🚀 Installation

This section provides tested instructions for setting up the project in a fresh environment.

### Prerequisites

- **Node.js**: Version 20 (as specified in `functions/package.json`)
- **npm**: Comes with Node.js
- **Firebase CLI**: Install globally with `npm install -g firebase-tools`
- **Git**: For cloning the repository

### Step-by-Step Setup

1. **Clone the repository**:
```bash
git clone https://github.com/Expectation-Walkers/smile-smart-home-website.git
cd smile-smart-home-website
```

2. **Install dependencies** (root + functions workspace):
```bash
npm install
```

3. **Set up Firebase**:
```bash
firebase login
firebase init
```

4. **Configure environment variables**:
   - Create `.env` file with optional `PUBLIC_RECAPTCHA_V3_SITE_KEY`
   - Set Firebase Secrets for functions (see Environment Variables section)

5. **Run the development server**:
```bash
npm run dev
```

The site will be available at `http://localhost:4321/`

### Dependency Installation Commands

| Command | Purpose |
|---------|---------|
| `npm install` | Install all dependencies (root + functions) |
| `npm i <pkg>` | Add dependency to root (web app) |
| `npm i -w functions <pkg>` | Add dependency to Firebase Functions only |
| `npm i -D -w functions <pkg>` | Add devDependency to Functions only |

---

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
| `npm start`                 | Start production server (requires build first)     |
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

### Static Site Generation

- This project uses Astro with **static output** (`output: 'static'` in `astro.config.mjs`)
- The site is built to `./dist/` and deployed to Firebase Hosting
- **Note**: Route protection for `/super_admin-a1b2c3` is handled at the component level via Firebase Auth state

Dynamic Super Admin user page:

- Page: `src/pages/super_admin-a1b2c3/user/[uid].astro`
- Navigate as `/super_admin-a1b2c3/user/<UID>` (e.g., from a users list choose a UID and link to that URL).

### Deploy to Firebase Hosting

1. Build the project:

```bash
npm run build
```

2. Deploy to Firebase Hosting:

```bash
firebase deploy --only hosting
```

### Deploy Functions Only

```bash
npm run functions:deploy
```

### Notes

- Keep a single lockfile at the repo root. If `functions/package-lock.json` exists, delete it and run `npm install` again at root.
- `functions/package.json` uses Node `"engines": { "node": "20" }` (as of latest update).
- The `@astrojs/node` adapter is available in devDependencies but not currently used (static output mode).

## 📖 Usage

This section describes the current user and developer workflows, including how to use `DeviceRecommendationsForm.tsx`, `RoomVisualization.tsx`, and `SceneBuilder.tsx` components, as well as `DevicesContext.tsx` for state management.

### User Workflow: AI Device Recommendations

1. **Navigate to the recommendations page** containing `DeviceRecommendationsForm.tsx`
2. **Complete the 4-step wizard**:
   - Step 1: Select house size (1 BHK, 2 BHK, etc.)
   - Step 2: Choose security priority level
   - Step 3: Set estimated budget range
   - Step 4: View AI-generated device recommendations
3. **Save recommendations** to your quote plan using the heart icon
4. **Send quote** via Email & WhatsApp using the contact form

**Using `useDeviceRecommendations()` hook**:
```typescript
const { 
  step,           // Current wizard step (1-4)
  formData,       // { houseSize, securityNeeds, budget }
  recommendations,  // AI-generated device list
  handleSubmit,   // Trigger AI recommendation
  saveRecommendationToQuote  // Save to user profile
} = useDeviceRecommendations();
```

### User Workflow: Room Visualization

1. **Access Room Visualizer** (`RoomVisualization.tsx`)
2. **Upload a room photo** (JPEG/PNG/WebP, max 10MB)
3. **Select devices** to place from recommendations or fallback list
4. **Click "Analyze My Room"** to trigger AI analysis
5. **Review placement markers** on the photo with tooltips explaining each position
6. **Save results** which persist to `Planner_Leads` collection

**Using `uploadAndAnalyzeRoom()` from DevicesContext**:
```typescript
const { uploadAndAnalyzeRoom, visualizationData } = useDevices();

// Upload and analyze
await uploadAndAnalyzeRoom(['Smart Bulb', 'Security Camera']);

// visualizationData contains: markers, roomType, lightingQuality, etc.
```

### User Workflow: Scene Builder

1. **Open Scene Builder** (`SceneBuilder.tsx`)
2. **Choose a template** (Movie Night, Eco Away, etc.) or start from scratch
3. **Add device actions**: Select devices and set actions (on/off/dim/lock/temp)
4. **Configure scene**: Name the scene and select an icon
5. **Save scene** to Firestore for later activation

**Using `useSceneManagement()` hook**:
```typescript
const { 
  scenes,       // List of saved scenes
  startNewScene, // Initialize scene creation
  handleSave     // Persist scene to Firestore
} = useSceneManagement();
```

### Developer Workflow: State Management with DevicesContext

**DevicesContext** (`src/contexts/DevicesContext.tsx`) provides global state for:
- Device inventory and health telemetry
- AI recommendations and room visualization state
- Scene management
- Notifications (snackbar + critical error modal)

**Usage in components**:
```typescript
import { useDevices } from '../contexts/DevicesContext';

function MyComponent() {
  const { 
    devices,           // Device array with health data
    recommendations,   // AI recommendations
    scenes,           // User scenes
    showNotification, // Show success/error/warning/info toast
    adminHealthStats  // Admin fleet overview
  } = useDevices();
  
  // Show notification
  showNotification({ 
    message: 'Device updated!', 
    type: 'success' 
  });
}
```

### Developer Workflow: Quote Notifications

**Triggering quote requests** via `useQuoteRequest()`:
```typescript
const { notifyQuoteAction, isSending, sendSuccess } = useQuoteRequest();

// Send quote notification
await notifyQuoteAction({
  type: 'quote_submitted',
  quoteId: `AI-${Date.now()}`,
  email: userEmail,
  phone: userPhone,
  details: { budget, houseSize }
});
```

This triggers EmailJS email + Twilio WhatsApp notifications via Cloud Functions.

---

## 📸 Feature Screenshots

The following screenshots demonstrate key UI components in the application:

### AI Smart Recommendations & Device Health
The `DeviceRecommendationsForm.tsx` component provides:
- **4-step AI Consultant Wizard**: House size → Security needs → Budget → AI-generated recommendations
- **Device Health Dashboard**: Real-time health scores, battery levels, signal strength, and predictive alerts
- **Quote Actions**: Save recommendations to plan, send quotes via Email & WhatsApp

### AI Room Visualization
The `RoomVisualization.tsx` component enables:
- **Drag-drop photo upload**: Supports JPEG, PNG, WebP up to 10MB
- **AI-powered analysis**: GPT-4o Vision identifies optimal device placement
- **Interactive markers**: Click to view placement rationale and device details
- **Room insights**: Lighting quality, WiFi coverage recommendations

### Smart Scene Builder
The `SceneBuilder.tsx` component allows:
- **Template selection**: Pre-configured scenes (Movie Night, Eco Away, etc.)
- **Visual action editor**: Link devices with on/off/dim/lock/temperature actions
- **One-tap deployment**: Activate entire scenes instantly

*Note: Screenshots should be captured at 1440x900 or 1920x1080 resolution in both light and dark modes for documentation.*

---

## 📝 Changelog

### 2024-2025 Major Updates

#### AI & Smart Features
- **AI Room Visualization**: Upload room photos for GPT-4o-powered device placement analysis
- **Device Health Dashboard**: Real-time monitoring with predictive alerts (battery, signal, connectivity)
- **Smart Scene Builder**: Create and deploy multi-device automation scenes
- **AI Consultant Enhancements**: 4-step wizard with integrated health metrics

#### Notifications & CRM
- **Multi-channel Quote Delivery**: Email via EmailJS + WhatsApp via Twilio
- **Admin CRM Pipeline**: Kanban board for leads, contacts, and support tickets
- **Real-time Notifications**: Toast alerts for new tickets, quote submissions

#### Technical Infrastructure
- **Firebase Functions Gen 2**: Enhanced timeout/memory for AI workloads
- **Secure Upload System**: Resumable uploads with progress tracking
- **Middleware Authentication**: Bearer token verification for API endpoints
- **Environment Secrets Management**: All API keys moved to Firebase Secrets

#### UI/UX Improvements
- **Framer Motion Animations**: Smooth page transitions and micro-interactions
- **Dark Mode Support**: Full theme implementation across all components
- **Responsive Design**: Mobile-optimized dashboard layouts
- **Accessibility**: ARIA labels, keyboard navigation, focus management

---

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).
