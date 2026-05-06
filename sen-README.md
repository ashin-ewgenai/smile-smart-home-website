# Smile Smart Home Website - Project Documentation

This document provides a comprehensive overview of the Smile Smart Home Website's repository structure, key components, and their interactions. It serves as a centralized resource for developers and stakeholders to understand the project architecture.

## Overall Project Architecture
The project is structured as a full-stack application leveraging Firebase and React (via Astro/Vite). 
- **Frontend**: Located primarily in the `src/` directory, containing React components, custom hooks, contexts, and utility libraries. It uses Astro for routing and server-side rendering/middleware.
- **Backend Cloud Functions**: Located in the `functions/` and `functions-gen1/` directories, providing serverless compute for tasks like chatbot interactions, user management, and administrative actions via Firebase Cloud Functions.

---

## Backend Functions

The backend is powered by Firebase Cloud Functions, structured to handle specific micro-tasks.

- **`functions/src/chatbot.ts`**: Handles chatbot interactions by processing user messages, querying AI services, and returning responses.
- **`functions/src/adminClearUserChat.ts`**: Provides admin capability to clear chat history for a specific user.
- **`functions/src/adminDeleteUserAndData.ts`**: Enables super admin to delete user accounts and all related data securely.
- **`functions/src/deviceRecommendations.ts`**: Analyzes user preferences and data to suggest smart home devices.
- **`functions/src/sceneManagement.ts`**: Handles the creation and execution of smart home scenes (e.g., turning off all lights).
- **`functions-gen1/src/index.ts`**: Contains legacy or first-generation Firebase cloud functions used for maintaining backward compatibility or specific older integrations.

*Interaction Flow*: The frontend uses Firebase client SDKs or HTTP calls to trigger these functions (e.g., calling the chatbot endpoint or invoking a callable function for deleting user data).

---

## Frontend Contexts and Hooks

The frontend manages global state and encapsulated logic using React Contexts and Custom Hooks.

### Contexts (`src/contexts/`)
- **`src/contexts/DevicesContext.tsx`**: Provides global state for all smart home devices across the application. It fetches device data from Firestore and makes it accessible to any consuming component, reducing prop drilling.
- **`src/contexts/AuthModeContext.tsx`**: Manages the authentication state and UI mode (login vs. signup vs. reset password).

### Custom Hooks (`src/hooks/`)
- **`src/hooks/useAuth.ts`**: Wraps Firebase authentication logic to provide the current user's session state and login/logout methods.
- **`src/hooks/useDeviceRecommendations.tsx`**: Connects with the `deviceRecommendations` backend function to fetch and provide tailored device suggestions to components.
- **`src/hooks/useSceneManagement.ts`**: Interfaces with `sceneManagement.ts` to allow users to trigger or modify smart home scenes directly from the UI.
- **`src/hooks/useQuoteRequest.ts`**: Handles the complex form state and submission logic for users requesting service quotes.
- **`src/hooks/useRevenueAnalytics.ts`**: Fetches and aggregates financial data from Firestore for the admin dashboard.

---

## Utility Libraries

The `src/lib/` folder contains essential helper functions and configurations used throughout the project.

- **`src/lib/firebase.ts`**: Initializes and configures the Firebase client SDK (Auth, Firestore, Storage) using environment variables. It serves as the primary export point for Firebase services.
- **`src/lib/constants.ts`**: Stores globally used constant values (e.g., predefined roles, static API routes, standard timeout durations).
- **`src/lib/toast.ts`**: A utility wrapper for displaying toast notifications to the user for success or error feedback.
- **`src/lib/errorUtils.ts`**: Standardizes error handling and formatting, especially for API and Firebase errors, ensuring consistent messages in the UI.
- **`src/lib/animate.ts`**: Contains reusable animation configurations or utility functions for UI transitions.

---

## Middleware

Middleware functions intercept incoming requests to the Astro server before they reach the page or API routes.

- **`src/middleware.ts`**: 
  - **CORS Handling**: Intercepts `OPTIONS` requests to provide CORS headers, ensuring native mobile apps (via Capacitor) can communicate with the API without cross-origin blocks.
  - **Health Endpoints Validation**: Secures routes starting with `/api/health`. It strictly validates `Authorization: Bearer <token>` headers by verifying the ID token against Firebase Admin (`firebase-admin`). Requests without a valid token are blocked with a `401 Unauthorized`.
- **`src/_middleware.disabled.ts`**: A disabled or legacy middleware file, kept for reference or temporary deactivation.

---

## Data Models

The data layer is defined via TypeScript interfaces and static mock files, ensuring type safety and structured database interactions.

### Static Data (`src/data/`)
- **`src/data/indiaLocations.js`**: Contains static geographical data used for dropdowns or location-based services in forms (e.g., quoting or delivery).
- **`src/data/projects.ts`**: Holds static definitions or initial states for showcase projects displayed on the website.
- **`src/data/quoteTemplates.js`**: Provides predefined templates for generating estimation quotes quickly.

### Firestore Collections (`src/models/Collections.ts`)
This file is the single source of truth for Firestore document shapes and collection references.
- **`Account`**: Defines the user profile (`Uid`, `Email`, `FullName`, `Role`, `LastLoginAt`).
- **`Device`**: Represents a smart home device (`deviceName`, `modelNumber`, `status`, `price`, `stock`).
- **`Scene`**: Defines a group of actions (`SceneAction`) to execute across multiple devices simultaneously.
- **`SupportTicket`**: Defines the structure for customer service requests, tracking their Kanban stage (`status: 'open' | 'in_progress' | 'resolved' | 'closed'`).
- **`EstimationQuote`**: Represents detailed service quotes sent to customers, including itemized costs and tax breakdowns.
- **Helper Functions**: Provides utility functions like `accountsCollection(db)`, `createAccountProfile()`, and `registerUserWithProfile()` to encapsulate Firestore query logic away from UI components.
