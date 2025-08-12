# FitX - Jump Rope Workout Tracker

A modern, full-stack fitness tracking application for jump rope enthusiasts. Set daily goals, track progress in real-time, and visualize your weekly performance with beautiful charts.

## ✨ Features

- **Goal Setting**: Set personalized daily jump rope targets
- **Real-Time Tracking**: Log reps as you go with instant progress updates
- **Progress Visualization**: Weekly chart showing your workout consistency
- **Session Management**: Complete workout lifecycle from start to celebration
- **Offline Capable**: Works even when backend services are unavailable
- **Auto-Sync**: Automatic progress syncing every 500 reps
- **Responsive Design**: Works seamlessly on desktop and mobile

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- MongoDB Atlas account (for production)
- Netlify account (for deployment)

## 🏗️ Architecture

### Technology Stack
- **Frontend**: React 19.1.1 with TypeScript
- **Backend**: Netlify Functions (serverless)
- **Database**: MongoDB Atlas
- **Styling**: CSS Modules with Apple-inspired design
- **HTTP Client**: Axios
- **Deployment**: Netlify

### Core Components

- **WorkoutTracker**: Main application component managing the complete workout session lifecycle
- **WeeklyChart**: Visualization component displaying 7-day progress with interactive bars
- **Mock API System**: Fallback system enabling offline development and testing

### Available Scripts

```bash
npm run dev        # Full-stack development (frontend + functions)
npm run functions  # Backend functions only
npm start          # Frontend development server
npm run build      # Production build
npm test           # Run test suite
```

**Built with ❤️ for the jump rope community**