# Smile Smart Home – Comprehensive Technical Documentation

## 📌 Overall Project Architecture

Smile Smart Home is a full-stack web application combining static site generation, a client-side React dashboard, and Firebase backend services.

### Core Stack

* **Frontend**: Astro + React (SPA for dashboards)
* **Backend**: Firebase Cloud Functions (Gen 2 + Gen 1 legacy)
* **Database**: Firestore
* **Storage**: Firebase Storage
* **Authentication**: Firebase Auth
* **AI Integration**: OpenAI APIs
* **Notifications**: Twilio (WhatsApp) + EmailJS/SMTP

### High-Level Flow

```
React Components / Astro Pages
        ↓
Contexts & Hooks (state + logic)
        ↓
Firebase SDK (Auth / Firestore / Storage)
        ↓
Cloud Functions (business logic + AI)
        ↓
External APIs (OpenAI, Twilio, Email)
```

---

## ⚙️ Backend Functions

Located in:

* `functions/` (Gen 2 - primary backend)
* `functions-gen1/` (legacy support)

### Key Files

#### `functions/src/chatbot.ts` 

**Purpose**: Handles chatbot interactions by processing user messages, querying AI services, and returning responses.

**Features**:
* Uses OpenAI GPT-4.1 for natural language responses
* Stores chat history in Firestore
* Implements rate limiting (15 requests per minute, 3-second cooldown)
* SMTP and WhatsApp integration for notifications
* Comprehensive error handling and logging

**Flow**:
```
User Message → Frontend → chatbot Function → OpenAI → Response → Firestore → UI
```

**Key Configuration**:
- Rate limit: 15 requests per 60-second window
- Cooldown: 3000ms between requests
- Model: GPT-4.1

---

#### `functions/src/adminClearUserChat.ts` 

**Purpose**: Provides admin capability to clear chat history for a specific user.

**Features**:
* Admin-only access control
* Deletes user chat sessions and messages
* Ensures cleanup of related Firestore data
* Audit logging for admin actions

---

#### `functions/src/adminDeleteUserAndData.ts` 

**Purpose**: Enables super admin to delete user accounts and all related data securely.

**Features**:
* Super admin capability with role verification
* Comprehensive data deletion:
  * Firebase Auth user
  * Firestore documents
  * Storage files
* GDPR-style data removal compliance
* Transaction-based deletion for data integrity

---

#### `functions/src/aiVisualization.ts` 

**Purpose**: Processes room images and generates device placement recommendations.

**Features**:
* Uses OpenAI Vision API for image analysis
* Returns device placement coordinates
* Generates room-specific device suggestions
* Handles image upload and processing

---

#### `functions/src/deviceRecommendations.ts` 

**Purpose**: Generates device recommendations and manages device health monitoring.

**Features**:
* AI-powered device recommendations
* Device health score computation
* Multi-channel notifications:
  * EmailJS / SMTP
  * Twilio WhatsApp
* Real-time health monitoring

---

#### `functions/src/sceneManagement.ts` 

**Purpose**: CRUD operations for smart scenes and automation logic.

**Features**:
* Scene creation, update, and deletion
* Automation logic storage in Firestore
* Device scene orchestration
* User preference management

---

#### `functions/src/reviews.ts` 

**Purpose**: Manages customer reviews and ratings system.

**Features**:
* Review submission and validation
* Rating aggregation
* Review moderation for admins
* SEO-friendly review display

---

#### `functions/src/index.ts` 

**Purpose**: Main entry point for Gen 2 cloud functions.

**Features**:
* Function exports and routing
* Common middleware setup
* Error handling configuration
* CORS management

---

#### `functions/src/core.ts` 

**Purpose**: Shared configuration and utilities for cloud functions.

**Features**:
* Firebase Admin SDK initialization
* OpenAI API key management
* Common database connections
* Shared constants and types

---

### Legacy Functions (Gen 1)

#### `functions-gen1/src/index.ts` 

**Purpose**: Legacy Gen 1 functions for backward compatibility.

**Features**:
* Maintains compatibility with existing integrations
* Gradual migration path to Gen 2
* Fallback functionality

---

## ⚛️ Frontend (React + Astro)

Located in `src/` 

### Contexts

#### `src/contexts/DevicesContext.tsx` 

**Purpose**: Central state manager for devices, AI recommendations, scenes, and notifications.

**Responsibilities**:
* Device inventory management
* AI recommendation workflow
* Scene management and orchestration
* Real-time notifications system
* Admin CRM data integration
* Room visualization state management

**Key Features**:
* Global state synchronization with Firestore
* Real-time updates using onSnapshot listeners
* Error handling and user feedback
* Authentication state management
* File upload handling for room photos

**State Management**:
```typescript
// Core state categories
- devices: Device inventory and health
- recommendations: AI-powered suggestions
- scenes: Smart home automation scenes
- notifications: User alerts and system messages
- adminHealthStats: Administrative analytics
- plannerLeads: Customer relationship management
- supportTickets: Customer support tracking
```

---

#### `src/contexts/AuthModeContext.tsx` 

**Purpose**: Authentication mode and user session management.

**Features**:
* Authentication state tracking
* User role management
* Session persistence
* Google Sign-In integration

---

### Custom Hooks

Located in `src/hooks/` 

#### `src/hooks/useDeviceRecommendations.tsx` 

**Purpose**: Manages AI recommendation workflow and device health analysis.

**Features**:
* Sends device data to backend AI functions
* Processes recommendation responses
* Manages recommendation state and UI updates
* Error handling for AI failures

---

#### `src/hooks/useQuoteRequest.ts` 

**Purpose**: Handles quote generation and customer communication.

**Features**:
* Quote creation and management
* Multi-channel notification integration:
  * Email notifications via EmailJS/SMTP
  * WhatsApp notifications via Twilio
* Quote template management
* Customer follow-up automation

---

#### `src/hooks/useSceneManagement.ts` 

**Purpose**: Manages smart scene creation and lifecycle.

**Features**:
* Scene CRUD operations
* Device orchestration within scenes
* Scene scheduling and automation
* User preference storage

---

#### `src/hooks/useTicketNotifications.ts` 

**Purpose**: Real-time admin alerts for support tickets.

**Features**:
* Real-time ticket monitoring
* Admin notification system
* Ticket status tracking
* Priority-based alerting

---

#### `src/hooks/useServiceHistory.ts` 

**Purpose**: Tracks device service history and maintenance records.

**Features**:
* Service record management
* Maintenance scheduling
* Device performance tracking
* Historical analytics

---

#### `src/hooks/useRevenueAnalytics.ts` 

**Purpose**: Provides business intelligence and revenue tracking.

**Features**:
* Revenue calculation and reporting
* Customer lifetime value analysis
* Sales performance metrics
* Financial dashboard data

---

#### `src/hooks/useReviews.ts` 

**Purpose**: Manages customer review system.

**Features**:
* Review submission and validation
* Rating aggregation
* Review display management
* Admin review moderation

---

#### `src/hooks/useAuth.ts` 

**Purpose**: Authentication state management.

**Features**:
* User session tracking
* Login/logout functionality
* Google Sign-In integration
* Role-based access control

---

#### `src/hooks/useActiveUsersCount.ts` 

**Purpose**: Real-time active user monitoring.

**Features**:
* Active user count tracking
* Real-time dashboard updates
* User engagement metrics

---

#### `src/hooks/useUnclosedServiceRequestsCount.ts` 

**Purpose**: Tracks pending service requests.

**Features**:
* Service request status monitoring
* Admin alerting for overdue requests
* Service queue management

---

#### `src/hooks/useUnconfirmedQuotesCount.ts` 

**Purpose**: Manages quote confirmation workflow.

**Features**:
* Quote status tracking
* Follow-up automation
* Conversion rate analytics

---

### Example Interaction Flow

**AI Recommendation Flow:**
```
User Input → useDeviceRecommendations → Firebase Function (deviceRecommendations.ts)
→ OpenAI Processing → Firestore Storage → Real-time Sync → UI Update
```

**Quote Notification Flow:**
```
User submits form → useQuoteRequest → Firestore Trigger 
→ Cloud Function (deviceRecommendations.ts) → Email + WhatsApp → User receives notification
```

---

## 🛠️ Utility Libraries

Located in `src/lib/` 

### `src/lib/firebase.ts` 

**Purpose**: Firebase client initialization and service configuration.

**Features**:
* Firebase App initialization
* Authentication setup with persistence
* Firestore configuration with long-polling
* Cloud Functions setup
* Firebase Storage configuration
* App Check integration with reCAPTCHA

**Configuration**:
```javascript
// Uses PUBLIC_ environment variables for browser exposure
// Long-polling enabled for network reliability
// Local persistence for user sessions
```

---

### `src/lib/firebase-auth-client.ts` 

**Purpose**: Client-side authentication utilities.

**Features**:
* Auth state management
* User session persistence
* Authentication helper functions

---

### `src/lib/constants.ts` 

**Purpose**: Stores static configuration values used across the application.

**Features**:
* Application constants
* API endpoints
* Default values and thresholds
* Configuration parameters

---

### `src/lib/errorUtils.ts` 

**Purpose**: Centralized error handling and logging utilities.

**Features**:
* Error classification and formatting
* User-friendly error messages
* Logging and debugging utilities

---

### `src/lib/toast.ts` 

**Purpose**: Toast notification system for user feedback.

**Features**:
* Success, error, info, and warning notifications
* Auto-dismiss functionality
* Queue management for multiple toasts

---

### `src/lib/animate.ts` 

**Purpose**: Animation utilities using Framer Motion.

**Features**:
* Reusable animation presets
* Page transition animations
* Component animation helpers

---

### `src/lib/lenis-init.ts` 

**Purpose**: Smooth scrolling initialization.

**Features**:
* Lenis smooth scrolling setup
* Performance optimizations
* Scroll event handling

---

### `src/lib/hooks.ts` 

**Purpose**: Shared React hooks and utilities.

**Features**:
* Common hook patterns
* State management utilities
* Performance optimization hooks

---

### `src/lib/useAuth.ts` 

**Purpose**: Authentication hook wrapper.

**Features**:
* Auth state subscription
* User data management
* Role-based access helpers

---

## 🚦 Middleware

### `src/middleware.ts` 

**Purpose**: Protects API routes and validates Firebase ID tokens.

**Features**:
* Firebase Admin SDK initialization
* Token validation for protected endpoints
* Health endpoint authentication
* CORS handling
* Error handling and logging

**Protected Endpoints**:
* `/api/health` - Requires authenticated user
* Admin routes - Require admin role verification

**Example Flow**:
```
Request → Middleware → Token Validation → Role Check → API Access
```

---

### `src/_middleware.disabled.ts` 

**Purpose**: Placeholder for SSR environments, currently disabled for static hosting.

**Features**:
* SSR compatibility layer
* Disabled for current static hosting setup
* Future-proofing for potential SSR migration

---

## 🗄️ Data Models

Located in `src/models/Collections.ts` 

### Core Collections

#### Accounts Collection
```typescript
interface Account {
  Uid: string;
  Email: string | null;
  FullName: string;
  Role: 'user' | 'admin' | 'Super Admin' | string;
  CreatedAt: Timestamp | null;
  LastLoginAt: Timestamp | null;
  LoginCount: number;
  Status: 'online' | 'offline' | string;
  StatusUpdatedAt: Timestamp | null;
  ConsultationId: string | null;
}
```

#### Devices Collection
```typescript
interface Device {
  DeviceId: string;
  Name: string;
  Type: string;
  Room: string;
  Status: 'online' | 'offline' | 'maintenance';
  LastSeen: Timestamp;
  HealthScore: number;
  BatteryLevel?: number;
  SignalStrength?: number;
}
```

#### Quotes Collection
```typescript
interface Quote {
  QuoteId: string;
  CustomerId: string;
  Items: QuoteItem[];
  TotalAmount: number;
  Status: 'pending' | 'confirmed' | 'rejected';
  CreatedAt: Timestamp;
  ExpiresAt: Timestamp;
}
```

#### Support Tickets Collection
```typescript
interface SupportTicket {
  TicketId: string;
  CustomerId: string;
  Subject: string;
  Description: string;
  Priority: 'low' | 'medium' | 'high' | 'critical';
  Status: 'open' | 'in_progress' | 'resolved' | 'closed';
  CreatedAt: Timestamp;
  AssignedTo?: string;
}
```

#### Scenes Collection
```typescript
interface Scene {
  SceneId: string;
  Name: string;
  Description: string;
  Devices: SceneDevice[];
  Triggers: SceneTrigger[];
  IsActive: boolean;
  CreatedBy: string;
  CreatedAt: Timestamp;
}
```

### Helper Functions

**Collection Builders**:
- `accountsCollection(db)` - Accounts collection reference
- `devicesCollection(db)` - Devices collection reference
- `quotesCollection(db)` - Quotes collection reference
- `supportTicketsCollection(db)` - Support tickets reference
- `scenesCollection(db)` - Scenes collection reference

**Document Builders**:
- `accountDoc(db, uid)` - Account document reference
- `deviceDoc(db, deviceId)` - Device document reference
- And corresponding document builders for all collections

**Payload Builders**:
- `newAccountPayload(params)` - Creates new account objects
- `newDevicePayload(params)` - Creates new device objects
- And payload builders for all data models

---

## 🌍 Data Files

### `src/data/indiaLocations.js` 

**Purpose**: Contains Indian states and cities data for location-based features.

**Features**:
* Complete list of Indian states
* Major cities per state
* Used for user registration and location-based services
* Structured data for dropdown components

**Usage**:
- User registration forms
- Location-based device recommendations
- Service area validation
- Regional analytics

---

### `src/data/projects.ts` 

**Purpose**: Project templates and sample data.

**Features**:
* Predefined smart home project templates
* Sample device configurations
* Demo data for development and testing

---

### `src/data/quoteTemplates.js` 

**Purpose**: Quote templates for automated quote generation.

**Features**:
* Pre-designed quote templates
* Pricing structures
* Service package definitions
* Template customization options

---

## 🔄 End-to-End Interaction Examples

### Device Control Flow

```
User Click → React Component
→ DevicesContext State Update
→ Firebase Function Call (sceneManagement.ts)
→ Firestore Document Update
→ Real-time Sync via onSnapshot
→ UI Update Across All Clients
```

### AI Visualization Flow

```
User Uploads Room Photo → uploadRoomPhoto()
→ Firebase Storage → aiVisualization Function
→ OpenAI Vision API → Device Placement Analysis
→ Coordinate Generation → Firestore Storage
→ Real-time UI Update → Visual Device Placement
```

### Quote Generation Flow

```
User Requests Quote → useQuoteRequest Hook
→ Quote Template Selection → Firestore Quote Creation
→ Trigger Cloud Function (deviceRecommendations.ts)
→ EmailJS/SMTP + Twilio WhatsApp → Customer Notification
→ Real-time Quote Status Tracking → Admin Dashboard Update
```

### Admin User Management Flow

```
Admin Action → adminDeleteUserAndData Function
→ Role Verification → Transaction-based Deletion:
  * Firebase Auth User Deletion
  * Firestore Documents Cleanup
  * Storage Files Removal
→ Audit Logging → Success Confirmation
```

---

## 🔧 Development Workflow

### State Management Pattern

**Global State**: DevicesContext provides centralized state management
**Local State**: Component-level useState for UI-specific state
**Server State**: Firestore real-time listeners for data synchronization
**Cache State**: React Query patterns for API optimization

### Error Handling Strategy

**Client-side**: Toast notifications + Error boundaries
**Server-side**: Firebase Functions error responses + Logging
**Network**: Retry logic + Fallback mechanisms
**User Input**: Form validation + Real-time feedback

### Authentication Flow

```
User Visit → Auth State Check → Google Sign-In Option
→ Firebase Auth → Role Assignment → Context Update
→ Route Protection → Dashboard Access
```

---

## 📊 Performance Optimizations

### Frontend Optimizations

* **Code Splitting**: Lazy loading for dashboard components
* **Image Optimization**: Firebase Storage + WebP format
* **Caching**: Service worker for offline functionality
* **Bundle Size**: Tree shaking + Dynamic imports

### Backend Optimizations

* **Rate Limiting**: Prevents API abuse
* **Caching**: Firestore query optimization
* **Connection Pooling**: Firebase Admin SDK reuse
* **Lazy Loading**: On-demand function initialization

---

## ✅ Summary

This project follows a modern, scalable architecture:

### Architectural Principles

* **Separation of Concerns**: Clear boundaries between frontend, backend, and data layers
* **Real-time First**: Firestore listeners for live updates across all clients
* **Scalable Functions**: Gen 2 Cloud Functions for better performance and features
* **Type Safety**: TypeScript throughout for better developer experience
* **Progressive Enhancement**: Works without JavaScript for basic functionality

### Technology Benefits

* **Firebase Integration**: Seamless authentication, database, and hosting
* **AI-Powered**: OpenAI integration for intelligent recommendations
* **Multi-channel**: Email + WhatsApp notifications for better engagement
* **Modern Stack**: Astro + React for optimal performance
* **Admin Dashboard**: Comprehensive management interface

### Maintainability Features

* **Modular Structure**: Clear file organization and separation
* **Reusable Components**: Consistent UI patterns and hooks
* **Documentation**: Comprehensive inline and external documentation
* **Testing Ready**: Structure supports easy test implementation
* **Version Control**: Git-friendly development workflow

The architecture ensures scalability, maintainability, and excellent real-time performance for a modern smart home management platform.

---

## 📌 Commit Message

```
docs: add comprehensive project structure and core functionalities documentation
```
