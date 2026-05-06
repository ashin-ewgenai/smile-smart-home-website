# Smile Smart Homes: Comprehensive Technical Report

## 1. Project Overview
Smile Smart Homes is a premium, high-performance web application that serves as both a public-facing brochure and a powerful internal business management tool. The platform bridges the gap between client acquisition and internal lead management, offering a seamless experience from initial consultation to hardware installation.

### Key Objectives:
- **Client Acquisition**: Premium landing pages and interactive tools to attract high-end clientele.
- **Lead Management**: Dynamic funnels like the "Smart Home Planner" to capture and manage leads.
- **Business Operations**: An enterprise-grade CRM for managing requests, performance analytics, and scheduling.
- **AI Integration**: Utilizing state-of-the-art AI for room analysis and personalized recommendations.

---

## 2. Technical Stack
The application is built using a modern, scalable technology stack designed for performance and interactivity.

### Frontend:
- **Astro v5**: Used for lightning-fast static site generation and routing.
- **React**: Powering highly interactive user interfaces, including the Admin SPA and User Dashboards.
- **TailwindCSS**: A custom design system with a premium charcoal, teal, and soft-gray theme.
- **Framer Motion**: Delivering smooth, high-end animations and transitions.
- **Lucide React & React Icons**: For modern, consistent iconography.

### Backend (Firebase):
- **Firebase Authentication**: Multi-role security (User, Admin, Super Admin).
- **Cloud Firestore**: Real-time NoSQL database for leads, devices, and user data.
- **Cloud Functions (Gen 2)**: Scalable server-side logic for AI processing and notifications.
- **Firebase Storage**: Secure hosting for user-uploaded room photos and review media.
- **Firebase Hosting**: High-speed global content delivery.

### Third-Party Integrations:
- **OpenAI GPT-4o**: Powering the AI Room Visualization and consultation chatbot.
- **Twilio**: Multi-channel notifications via WhatsApp.
- **EmailJS / SMTP**: Automated quote delivery and email notifications.

---

## 3. Core Architecture
The project follows a monorepo structure with npm workspaces, separating the frontend from the Firebase backend.

### Project Directory Structure:
- `/src`: Frontend source code (Astro pages, React components, hooks, contexts).
- `/functions`: Firebase Cloud Functions (Gen 2) in TypeScript.
- `/public`: Static assets (images, icons).
- `package.json`: Centralized dependency management.

### Key Contexts & Hooks:
- **DevicesContext**: Centralized state for device inventory, health telemetry, and AI data.
- **useDeviceRecommendations**: Manages the 4-step AI consultation wizard.
- **useQuoteRequest**: Handles multi-channel (Email/WhatsApp) notification logic.
- **useSceneManagement**: Logic for building and saving smart home automation scenes.

---

## 4. Key Features & Functionalities

### AI Smart Home Planner
A 4-step consultation wizard that guides users through house size, security needs, and budget to generate personalized device recommendations using OpenAI.

### Room Visualization Tool
Users can upload photos of their rooms, which are analyzed by GPT-4o Vision to suggest optimal device placements (e.g., smart bulbs, security cameras) with interactive markers.

### Smart Scene Builder
A visual tool allowing users to create automation routines (e.g., "Movie Night," "Eco Away") by linking multiple device actions (dimming lights, locking doors).

### Enterprise CRM Admin Dashboard
- **Analytics**: Dynamic data visualization for contact submissions and user growth.
- **Lead Pipeline**: A drag-and-drop Kanban board for managing leads from "New" to "Installed."
- **Health Monitoring**: Real-time telemetry for all installed devices, including battery levels and connectivity alerts.

---

## 5. Database Models (Firestore)
- **Accounts**: User profiles with role-based access control.
- **Devices**: Master product catalog.
- **User_Devices**: Real-time state and health of customer hardware.
- **Planner_Leads**: Data captured from the AI consultation tools.
- **Support_Tickets**: Integrated customer support tracking.
- **Reviews**: Customer-submitted feedback and media.

---

## 6. Future Enhancements & Roadmap
The project has identified several high-impact features for future development:

### 1. Admin Dashboard Visual Overhaul
Implementing a glassy, macOS-inspired UI with floating KPI metric cards and enhanced data visualization for real-time business insights.

### 2. Enhanced CRM Integration
Expanding the Kanban pipeline with automated WhatsApp/Email follow-ups triggered by card movement.

### 3. Interactive Floorplan Tour
A scalable architectural blueprint with animated "hotspots" that reveal hardware options for specific rooms through frosted-glass info panels.

### 4. Interactive Cost Estimator
A gamified, real-time calculator where users can toggle features (Lighting, Security, Climate) to see a live budget estimate, replacing static contact forms.

---

## 7. Installation & Setup

### Prerequisites:
- Node.js v20
- Firebase CLI
- npm

### Commands:
| Task | Command |
| :--- | :--- |
| **Install** | `npm install` |
| **Dev Server** | `npm run dev` |
| **Build** | `npm run build` |
| **Deploy Site** | `firebase deploy --only hosting` |
| **Deploy Functions** | `npm run functions:deploy` |
