# Smile Smart Homes - Comprehensive Project Documentation

## 🎯 Project Overview

Smile Smart Homes is a comprehensive smart home automation platform that combines cutting-edge AI technology with robust business management tools. This enterprise-grade web application serves both as a customer-facing smart home planning tool and an internal business management system.

**Technology Stack:**
- **Frontend**: Astro v5 with React 19, TypeScript, TailwindCSS
- **Backend**: Firebase Cloud Functions (Gen 1 & Gen 2) with OpenAI integration
- **Database**: Firestore with real-time synchronization
- **Authentication**: Firebase Auth with role-based access control
- **Deployment**: Firebase Hosting with global CDN

---

## 📁 Repository Structure

```
smile-smart-home-website/
├── functions/                    # Backend Cloud Functions
│   ├── src/                   # Function source code
│   │   ├── chatbot.ts         # AI-powered chatbot assistant
│   │   ├── adminClearUserChat.ts # Admin chat management
│   │   ├── adminDeleteUserAndData.ts # User data management
│   │   ├── aiVisualization.ts   # Room photo analysis
│   │   ├── deviceRecommendations.ts # Smart device suggestions
│   │   ├── sceneManagement.ts   # Smart scene automation
│   │   ├── reviews.ts          # Customer reviews system
│   │   ├── core.ts            # Shared utilities and config
│   │   └── index.ts           # Function exports and super admin
│   ├── package.json             # Function dependencies
│   └── tsconfig.json           # TypeScript configuration
├── functions-gen1/              # Legacy Gen 1 functions
├── src/                        # Frontend React application
│   ├── components/              # React components (112 files)
│   │   ├── dashboard/          # Admin/User dashboards
│   │   ├── admin/              # Admin-specific components
│   │   ├── supportChat/        # Chat system
│   │   ├── ui/                 # Reusable UI components
│   │   ├── about/              # About page components
│   │   ├── contact/            # Contact form components
│   │   ├── gallery/            # Project gallery
│   │   ├── home/               # Homepage components
│   │   └── services/           # Services page
│   ├── contexts/               # React contexts (2 files)
│   │   ├── DevicesContext.tsx   # Global device state
│   │   └── AuthModeContext.tsx # Authentication mode
│   ├── hooks/                  # Custom hooks (11 files)
│   │   ├── useDeviceRecommendations.tsx
│   │   ├── useAuth.ts
│   │   ├── useQuoteRequest.ts
│   │   ├── useRevenueAnalytics.ts
│   │   └── useServiceHistory.ts
│   ├── lib/                    # Utility libraries (9 files)
│   │   ├── firebase.ts          # Firebase configuration
│   │   ├── constants.ts         # Application constants
│   │   ├── animate.ts          # Animation utilities
│   │   └── errorUtils.ts       # Error handling
│   ├── models/                 # TypeScript models (2 files)
│   │   ├── index.ts            # Core interfaces
│   │   └── Collections.ts      # Database models
│   ├── data/                   # Static data (3 files)
│   │   ├── indiaLocations.js    # Location data
│   │   └── quoteTemplates.ts  # Quote templates
│   ├── pages/                  # Astro pages (53 files)
│   │   ├── dashboard/          # Dashboard routes
│   │   ├── super_admin-a1b2c3/ # Admin routes
│   │   └── *.astro             # Public pages
│   ├── layouts/                # Astro layouts (1 file)
│   │   └── Layout.astro       # Main site layout
│   ├── middleware.ts            # Request middleware
│   ├── scripts/                # Build scripts (3 files)
│   └── styles/                 # Styling (1 file)
├── public/                     # Static assets
├── astro.config.mjs            # Astro configuration
├── firebase.json              # Firebase configuration
├── package.json               # Project dependencies
├── tailwind.config.mjs        # TailwindCSS configuration
└── tsconfig.json              # TypeScript configuration
```

---

## 🚀 Backend Cloud Functions

### **functions/src/chatbot.ts**
**Purpose**: Handles AI-powered chatbot interactions with OpenAI GPT-4 integration
**Key Features**:
- 24/7 intelligent customer support
- Context-aware conversations with history
- Rate limiting and abuse prevention
- Multi-channel notifications (WhatsApp, email)
- Human handoff detection and escalation

**Core Functionality**:
```typescript
export const chatbotAssistant = onCall(
  { 
    region: "us-central1",
    secrets: [OPENAI_API_KEY],
    cors: true,
    timeoutSeconds: 120,
    memory: "1GiB"
  },
  async (request: CallableRequest) => {
    // Authentication and rate limiting
    const uid = request.auth?.uid || request.data?.uid;
    await applyRateLimit(uid);
    
    // OpenAI API integration
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY.value()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ]
      })
    });
    
    return { response: data.choices[0].message.content };
  }
);
```

### **functions/src/adminClearUserChat.ts**
**Purpose**: Provides admin capability to clear chat history for specific users
**Key Features**:
- Bulk chat session deletion
- Role-based access control (Admin/Super Admin)
- Image cleanup from Firebase Storage
- Comprehensive logging and audit trails

**Core Functionality**:
```typescript
export const adminClearUserChat = onCall({ cors: true }, async (request) => {
  const authCtx = request.auth;
  const targetUid = request.data?.uid;
  
  // Role validation
  const callerSnap = await db.collection("Accounts").doc(authCtx.uid).get();
  const role = callerSnap.data()?.Role;
  if (role !== "Super Admin" && role !== "Admin") {
    throw new HttpsError("permission-denied", "Only admins can clear chat history");
  }
  
  // Delete chat sessions and associated images
  const sessionsSnap = await db.collection("chat_sessions")
    .where("ownerUid", "==", targetUid).get();
    
  return { 
    status: "ok", 
    deletedSessions: sessionsSnap.size,
    deletedImages: imageUrls.length 
  };
});
```

### **functions/src/adminDeleteUserAndData.ts**
**Purpose**: Enables super admin to securely delete user accounts and all related data
**Key Features**:
- Complete user data deletion
- Firebase Auth and Firestore cleanup
- Security validations and audit logging
- Protection against self-deletion and admin deletion

### **functions/src/aiVisualization.ts**
**Purpose**: Analyzes room photos using OpenAI GPT-4o for smart device placement
**Key Features**:
- Computer vision analysis of room photos
- Intelligent device placement suggestions
- Fallback system for API failures
- Detailed room analysis with lighting quality

### **functions/src/deviceRecommendations.ts**
**Purpose**: Generates personalized smart home device recommendations
**Key Features**:
- AI-powered device suggestions
- Budget-aware recommendations
- Security level-based filtering
- Real-time quote generation

### **functions/src/index.ts**
**Purpose**: Main entry point exporting all cloud functions
**Key Features**:
- Super admin user management functions
- Role-based access control
- Function orchestration and exports
- Global configuration management

---

## 🎨 Frontend React Application

### **src/contexts/DevicesContext.tsx**
**Purpose**: Central state management for devices, recommendations, and user interactions
**Key Features**:
- Global device inventory management
- Real-time Firebase synchronization
- Room visualization state
- Scene management and automation
- Notification system
- Admin CRM data integration

**Core Implementation**:
```typescript
export const DevicesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [devices, setDevices] = useState<DeviceDoc[]>([]);
  const [recommendations, setRecommendations] = useState<DeviceRecommendation[]>([]);
  const [visualizationData, setVisualizationData] = useState<RoomVisualizationResult | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Real-time Firebase listeners
  useEffect(() => {
    if (!uid) return;
    const unsubscribe = onSnapshot(
      query(collection(db, 'Devices'), where('uid', '==', uid)),
      (snapshot) => {
        const deviceData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setDevices(deviceData);
      }
    );
    return unsubscribe;
  }, [uid]);

  return (
    <DevicesContext.Provider value={{
      devices, recommendations, visualizationData, scenes, notifications,
      // ... 50+ other state variables and functions
    }}>
      {children}
    </DevicesContext.Provider>
  );
};
```

### **src/hooks/useDeviceRecommendations.tsx**
**Purpose**: Manages device recommendation form state and AI interactions
**Key Features**:
- Multi-step form management
- Real-time admin acceptance tracking
- Template-based recommendations
- Budget and security filtering
- Quote generation and saving

**Core Implementation**:
```typescript
export function useDeviceRecommendations() {
  const [step, setStep] = useState<number>(1);
  const [formData, setFormData] = useState<RecommendationRequest>({
    houseSize: '',
    budget: 1500,
    securityNeeds: 'Medium',
    preferences: []
  });

  // Real-time admin acceptance tracking
  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'Planner_Leads'),
      where('uid', '==', uid),
      where('source', '==', 'ai_consultant'),
      orderBy('updatedAt', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const data = snap.data();
        setAdminAccepted(!!data.adminAccepted);
      }
    });
    return unsubscribe;
  }, [uid]);

  return {
    step, formData, recommendations, loading, error,
    nextStep, prevStep, handleSubmit, resetForm
  };
}
```

### **src/components/RoomVisualization.tsx**
**Purpose**: Interactive room visualization with AI-powered device placement
**Key Features**:
- Drag-and-drop device markers
- Interactive tooltips with animations
- Real-time position updates
- AI analysis integration
- Responsive design with touch support

**Core Implementation**:
```typescript
const DeviceMarker: React.FC<MarkerProps> = ({ marker, index, isActive, onToggle }) => {
  const tooltipVariants = {
    hidden: { opacity: 0, y: 15, scale: 0.8, rotate: -5 },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      rotate: 0,
      transition: { 
        type: 'spring', 
        damping: 15, 
        stiffness: 250,
        mass: 0.8 
      }
    }
  };

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0, rotate: -20 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ 
        type: 'spring', 
        stiffness: 350, 
        damping: 15, 
        delay: index * 0.08 
      }}
    >
      {/* Interactive device marker with animations */}
    </motion.div>
  );
};
```

### **src/components/DeviceRecommendationsForm.tsx**
**Purpose**: Multi-step form for collecting user preferences and generating recommendations
**Key Features**:
- Progressive form disclosure
- Real-time validation
- Authentication integration
- Template application
- Quote generation and sharing

### **src/components/AdminRevenueDashboard.tsx**
**Purpose**: Comprehensive business analytics dashboard for administrators
**Key Features**:
- Real-time revenue metrics
- Interactive charts and visualizations
- Date range filtering
- Service history integration
- KPI tracking and forecasting

---

## 🔧 Utility Libraries and Configuration

### **src/lib/firebase.ts**
**Purpose**: Firebase configuration and initialization
**Key Features**:
- Firebase app initialization
- Authentication setup
- Database and storage references
- Cloud functions configuration

### **src/lib/constants.ts**
**Purpose**: Application-wide constants and configurations
**Key Features**:
- Device pricing data
- Security levels and house sizes
- Budget ranges
- UI configuration constants

### **src/models/Collections.ts**
**Purpose**: TypeScript interfaces for Firestore collections
**Key Features**:
- Type-safe database models
- Collection references
- Data validation schemas
- Export utilities

**Core Models**:
```typescript
export interface DeviceDoc {
  id: string;
  deviceName?: string;
  type?: string;
  status?: string;
  serial?: string;
  modelNumber?: string;
  imageUrl?: string;
  price?: number | null;
  health?: DeviceHealth;
}

export interface DeviceHealth {
  score: number;
  status: 'Online' | 'Offline';
  lastSeen: string;
  batteryLevel: number;
  signalStrength: number;
  alerts: string[];
  forecast?: string;
}
```

---

## 🛡️ Middleware and Security

### **src/middleware.ts**
**Purpose**: Request interception and route protection
**Key Features**:
- Authentication validation
- Route protection based on user roles
- Request logging and monitoring
- Error handling and redirects

**Implementation**:
```typescript
export const onRequest = async (context, next) => {
  const { url, request, cookies } = context;
  
  // Authentication checks for protected routes
  if (url.startsWith('/dashboard') && !cookies.get('auth_token')) {
    return Response.redirect('/auth');
  }
  
  // Role-based route protection
  if (url.startsWith('/dashboard/admin') && userRole !== 'Admin') {
    return Response.redirect('/dashboard');
  }
  
  return next();
};
```

---

## 📊 Data Management

### **src/data/indiaLocations.js**
**Purpose**: Geographic location data for service areas
**Key Features**:
- City and state mappings
- Service area definitions
- Geographic coordinates
- Regional pricing data

### **src/data/quoteTemplates.ts**
**Purpose**: Pre-configured smart home packages and templates
**Key Features**:
- Budget-based templates
- Device bundles
- Room-specific packages
- Quick quote generation

---

## 🔄 Interaction Flows

### **User Registration and Authentication Flow**
1. User visits `/auth` page
2. Chooses Google OAuth or email/password
3. `useAuth` hook handles authentication
4. Firebase Auth creates user session
5. User data stored in Firestore `Accounts` collection
6. Role-based redirection to appropriate dashboard

### **Device Recommendation Flow**
1. User accesses smart home planner
2. `useDeviceRecommendations` hook manages form state
3. Multi-step form collects preferences
4. Form data sent to `deviceRecommendations` cloud function
5. AI generates personalized recommendations
6. Results displayed with interactive UI
7. User can save recommendations as quotes

### **Room Visualization Flow**
1. User uploads room photo via `RoomVisualization` component
2. Photo uploaded to Firebase Storage
3. `aiVisualization` function analyzes photo with OpenAI
4. AI returns device placement suggestions
5. Interactive markers displayed on room image
6. User can adjust positions manually
7. Final layout saved to user profile

### **Admin Dashboard Flow**
1. Admin logs in with elevated permissions
2. `AdminRevenueDashboard` loads business metrics
3. Real-time data from Firestore collections
4. Interactive charts display revenue and analytics
5. Admin can manage users, quotes, and support tickets
6. Changes reflected in real-time across all connected clients

---

## 🚀 Development Workflow

### **Local Development**
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start Firebase Functions emulator
npm run functions:serve

# Run both frontend and backend
npm run dev
```

### **Build and Deployment**
```bash
# Build for production
npm run build

# Deploy to Firebase Hosting
firebase deploy --only hosting

# Deploy Cloud Functions
firebase deploy --only functions
```

### **Environment Configuration**
- **Development**: Local Firebase emulator
- **Staging**: Firebase project with test data
- **Production**: Firebase production environment

---

## 🔒 Security Architecture

### **Authentication System**
- **Firebase Auth**: Multi-provider authentication (Google, Email/Password)
- **Role-Based Access**: User, Admin, Super Admin roles
- **Session Management**: Secure token handling
- **Password Security**: Strong password requirements

### **Data Protection**
- **Firestore Rules**: Collection-based access control
- **Storage Rules**: File upload security
- **Rate Limiting**: API abuse prevention
- **Input Validation**: Comprehensive data sanitization

---

## 📱 Key Features Summary

### **Customer-Facing Features**
- **AI Room Visualizer**: Computer vision for device placement
- **Smart Home Planner**: Interactive recommendation system
- **Energy Calculator**: ROI and savings analysis
- **Project Gallery**: Visual showcase with filtering
- **Customer Reviews**: Verified testimonials and ratings
- **Live Chat**: 24/7 AI-powered support

### **Administrative Features**
- **Revenue Dashboard**: Real-time business analytics
- **User Management**: Role-based user administration
- **Lead Management**: Kanban pipeline with AI scoring
- **Support System**: Multi-channel ticket management
- **Service History**: Complete installation tracking

### **Technical Features**
- **Real-time Updates**: Firebase synchronization
- **Mobile Responsive**: Optimized for all devices
- **Progressive Enhancement**: Works without JavaScript
- **Performance Optimized**: Code splitting and lazy loading
- **Type Safe**: Full TypeScript implementation

---

## 🛠️ Development Guidelines

### **Code Standards**
- **TypeScript**: Full type safety across all files
- **Component Structure**: Consistent patterns and interfaces
- **Error Handling**: Comprehensive error boundaries
- **Performance**: Optimized re-renders and memory usage
- **Accessibility**: ARIA labels and keyboard navigation

### **Testing Strategy**
- **Unit Tests**: Component and hook testing
- **Integration Tests**: API and database interactions
- **E2E Tests**: User flow validation
- **Performance Tests**: Load and stress testing

### **Deployment Strategy**
- **CI/CD Pipeline**: Automated testing and deployment
- **Environment Management**: Separate dev/staging/prod configs
- **Monitoring**: Error tracking and performance metrics
- **Rollback Strategy**: Quick rollback capabilities

---

## 📞 Support and Maintenance

### **Monitoring**
- **Error Tracking**: Sentry integration planned
- **Performance Monitoring**: Web Vitals tracking
- **Usage Analytics**: Firebase Analytics
- **Health Checks**: Automated system monitoring

### **Backup Strategy**
- **Database Backups**: Automated Firestore backups
- **Code Backups**: Git version control
- **Asset Backups**: Firebase Storage redundancy
- **Disaster Recovery**: Comprehensive recovery plan

---

## 🚀 Future Development

### **Planned Enhancements**
- **Mobile Applications**: React Native iOS/Android apps
- **Advanced AI**: Voice control and emotional intelligence
- **IoT Integration**: Direct device connectivity
- **Global Expansion**: Multi-language and regional support
- **Enterprise Features**: Multi-tenancy and advanced analytics

### **Technical Roadmap**
- **Testing Suite**: Comprehensive test coverage
- **Performance Optimization**: Advanced caching strategies
- **Security Enhancements**: Advanced threat detection
- **Scalability**: Microservices architecture
- **API Platform**: Public API for third-party integration

---

## 📚 Additional Resources

### **Documentation**
- **API Documentation**: OpenAPI/Swagger specifications
- **Component Library**: Storybook component showcase
- **Deployment Guide**: Step-by-step deployment instructions
- **Troubleshooting**: Common issues and solutions

### **Development Tools**
- **Code Quality**: ESLint and Prettier configuration
- **Type Checking**: Strict TypeScript configuration
- **Build Optimization**: Webpack and Vite configuration
- **Debugging**: Source maps and dev tools integration

---

**Last Updated**: May 2026  
**Version**: 2.0.0  
**Maintainers**: Smile Smart Homes Development Team

This documentation serves as the comprehensive guide for understanding, developing, and maintaining the Smile Smart Homes platform. For specific implementation details, refer to the individual file documentation and inline code comments throughout the codebase.
