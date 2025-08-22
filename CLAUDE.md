# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FitX is a personal jump rope workout tracking application with full-stack architecture:

- **Frontend**: React 19.1.1 with TypeScript
- **Backend**: Netlify Functions (serverless APIs)
- **Database**: MongoDB Atlas with connection caching
- **Deployment**: Netlify (frontend + functions), MongoDB Atlas cloud

## Development Commands

**Full Development Environment:**
```bash
npm run dev        # Start both frontend (port 3000) and backend functions concurrently
npm run functions  # Start only Netlify functions for backend development
npm start          # Start only React frontend development server
npm run build      # Build for production deployment
npm test           # Run React test suite
```

**Data Management:**
```bash
node import-historical-data.js  # Import historical workout data to MongoDB
```

## Core Architecture

**State Management Pattern:**
The application uses a session-based architecture where workout sessions are the primary entity. Each session tracks goal, progress, timing, and state (active/paused/completed). The WorkoutTracker component manages the complete session lifecycle with mock API fallback when functions aren't running.

**API Endpoints:**
- `/.netlify/functions/training-sessions` - CRUD operations for workout sessions
- `/.netlify/functions/daily-summaries` - Aggregate daily workout data for charts

**Database Collections:**
- `trainingSessions` - Individual workout sessions with real-time progress
- `dailySummaries` - Aggregated daily totals for weekly chart visualization

**Component Architecture:**
- WorkoutTracker: Main state machine handling goal setting → active workout → completion flow
- WeeklyChart: Standalone visualization component with its own data fetching
- Mock API system provides offline development capability when backend unavailable

**Session State Flow:**
1. Goal setting (input validation, minimum 100 jumps)
2. Session creation (POST to training-sessions)
3. Progress tracking (PUT updates with auto-sync every 500 reps)
4. Session completion (creates daily summary, celebration view)
5. New goal reset

**Development vs Production:**
Frontend uses same API_BASE path (/.netlify/functions) for both environments. Mock API automatically activates when real functions return errors, enabling frontend-only development.

## Implementation Workflow

**REQUIRED: Discuss Before Coding**
Before implementing any bug fix or new feature, you MUST:

1. **Analyze the issue/requirement** thoroughly
2. **Assess complexity**:
   - **Simple tasks** (UI fixes, small bugs): Propose solution directly in chat
   - **Complex tasks** (new features, major changes): Request to create `IMPLEMENTATION_PROGRESS.md` for detailed tracking
3. **Propose a specific implementation approach** with technical details
4. **Discuss and get agreement** on the solution strategy
5. **Only then proceed** to write the actual code

**For Complex Tasks:**
- Create temporary `[feature-name]_IMPP.md` file (e.g., `user-auth_IMPP.md`, `chart-filters_IMPP.md`) with **high-level steps and todo lists only**
- **Step-by-Step Implementation**:
  - When working on each step, show implementation plan in **chat** (for simple todos) or **add to MD** (for complex todos requiring multiple steps)
  - **Get agreement** for each todo item before implementing
  - Only dive into detailed analysis when actually reaching each step (not upfront)
- Update progress file throughout implementation across multiple sessions
- Delete temp file only when feature is fully complete

**Benefits**: Prevents over-planning while maintaining structure. Allows agile approach where we plan as we go, ensuring alignment at each step without wasting time on premature detailed analysis.