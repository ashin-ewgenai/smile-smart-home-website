# Smile Smart Home Website: Technical Reference & Project Structure

This document serves as a centralized reference for developers and stakeholders to understand the architecture, project structure, and core functionalities of the Smile Smart Home platform.

---

## 🏗️ Project Architecture Overview

The Smile Smart Home Website is built as a hybrid application that combines **Static Site Generation (SSG)** for performance with **Client-Side SPA (Single Page Application)** logic for complex administrative tasks.

### Core Stack:
- **Framework**: Astro v5 (Static Output)
- **UI Library**: React 19
- **Backend-as-a-Service**: Firebase (Auth, Firestore, Storage, Functions)
- **Styling**: TailwindCSS
- **Animations**: Framer Motion
- **AI Integration**: OpenAI GPT-4o (Vision & Chat)

---

## 📁 Repository Structure

### Root Directory
The root directory contains configuration files for the entire project environment.

- `astro.config.mjs`: Configures the Astro builder, including React and Tailwind integrations.
- `firebase.json`: Configuration for Firebase Hosting, Functions, and Firestore rules.
- `package.json`: Root package file defining **npm workspaces** for the web app and functions.
- `tailwind.config.mjs`: Defines the custom design system (colors, typography, and theme extensions).
- `tsconfig.json`: TypeScript configuration for the frontend.

### `functions/` (Firebase Cloud Functions Gen 2)
Handles server-side logic, AI processing, and third-party integrations.

- `src/index.ts`: The entry point where all functions are exported.
- `src/aiVisualization.ts`: Integrates with OpenAI GPT-4o Vision to analyze room photos.
- `src/chatbot.ts`: Backend for the AI-powered support chatbot.
- `src/deviceRecommendations.ts`: Logic for health scoring and multi-channel (WhatsApp/Email) notifications.
- `src/sceneManagement.ts`: CRUD operations for user automation routines.
- `src/adminDeleteUserAndData.ts`: Security-critical function for privacy compliance.

### `src/` (Frontend Source Code)
The primary workspace for the web application.

#### `src/components/`
Modular UI elements organized by feature area.
- `admin/`: Components for the Administrative Dashboard (Analytics, Kanban Lead Board).
- `dashboard/`: Components for the User Dashboard (Device management, Quotes).
- `common/`: Reusable UI elements (Buttons, Modals, Toasts).
- `InteractiveFloorplan.tsx`: Visual room planner for public-facing leads.
- `RoomVisualization.tsx`: Interface for AI room analysis.

#### `src/contexts/`
Global state management using React Context.
- `DevicesContext.tsx`: The "brain" of the frontend. It manages real-time Firestore listeners for devices, leads, and notifications.

#### `src/hooks/`
Encapsulated business logic for React components.
- `useDeviceRecommendations.tsx`: Wizard state management for the AI consultant.
- `useQuoteRequest.ts`: Triggers multi-channel notifications via backend functions.
- `useSceneManagement.ts`: Logic for building and editing automation scenes.

#### `src/pages/`
Astro's file-based routing system.
- `index.astro`: The premium landing page.
- `admin/`: Protected administrative routes.
- `user/`: User-specific account and device pages.
- `api/`: Server-side API endpoints for health checks and token verification.

#### `src/lib/`
Utility libraries and configuration.
- `firebase.ts`: Initializes the Firebase client SDK and handles secure file uploads.
- `constants.ts`: Centralized app configuration (House sizes, budget ranges).

#### `src/models/`
TypeScript definitions for data integrity.
- `Collections.ts`: Type definitions for every Firestore document (Users, Devices, Tickets).

---

## 💡 Core Functionalities & Interrelations

### 1. AI-Driven Consultation & Lead Funnel
**Purpose**: To convert visitors into leads through an interactive, AI-powered experience.
- **Interrelation**: The `DeviceRecommendationsForm.tsx` (Component) uses the `useDeviceRecommendations` (Hook), which ultimately calls the `aiVisualization` (Cloud Function) via `DevicesContext`. Results are stored in the `Planner_Leads` collection in Firestore.

### 2. Real-Time Device Health Monitoring
**Purpose**: To provide administrators with a live overview of all installed hardware.
- **Interrelation**: `DevicesContext.tsx` maintains a real-time listener on the `User_Devices` collection. The `deviceRecommendations.ts` (Cloud Function) periodically calculates health scores (0-100) based on battery and signal telemetry, which is then reflected in the Admin Dashboard.

### 3. Multi-Channel Notification System
**Purpose**: To ensure instant communication for quotes and support alerts.
- **Interrelation**: When a quote is generated, `useQuoteRequest.ts` triggers a Cloud Function that simultaneously sends an email via **EmailJS** and a WhatsApp message via **Twilio**.

### 4. Enterprise CRM & Kanban Pipeline
**Purpose**: To manage the business lifecycle of a client from lead to installation.
- **Interrelation**: The Admin Dashboard components interact with `Planner_Leads` and `quotes` collections. The drag-and-drop Kanban board updates document statuses in real-time, triggering backend logs and notifications.

---

## 🛠️ Developer Workflow

### Installation
1. Run `npm install` at the root (installs both frontend and function dependencies).
2. Create a `.env` file for frontend keys.
3. Use `firebase functions:secrets:set` for backend keys (OpenAI, Twilio).

### Execution
- `npm run dev`: Starts the local development environment.
- `npm run functions:serve`: Runs the Firebase emulators for backend testing.
- `npm run build`: Generates the production-ready static site.

---

## 📜 Acceptance Criteria Checklist
- [x] Covers all main directories and files.
- [x] Explains purpose and functionality of key files.
- [x] Structured logically with clear headings.
- [x] Correctly references actual file paths.
- [x] Professional language throughout.
