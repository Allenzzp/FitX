# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FitX is a personal jump rope workout tracking application with the following architecture:

- **Frontend**: React with TypeScript for the web UI
- **Backend**: Netlify Functions (serverless APIs) 
- **Database**: MongoDB Atlas (NoSQL storage)
- **Deployment**: Netlify (frontend + functions), MongoDB Atlas cloud

## Core User Flow

Users set daily jump rope goals, log individual workout sessions (rep counts), and view progress tracking with:
- Real-time goal progress updates (total jumps vs remaining)
- 7-day workout history with totals
- List and chart visualizations

## Development Commands

Since this project uses react-scripts, the standard React development commands apply:

```bash
npm start          # Start development server
npm run build      # Build for production
npm test           # Run tests
npm run eject      # Eject from react-scripts (not recommended)
```

## Architecture Notes

**Frontend Structure**: Standard React app structure expected in `src/` with components for:
- Workout logging interface
- Goal setting/display
- Progress tracking dashboard
- 7-day history views (list/chart)

**Backend Functions**: Netlify Functions should be placed in `netlify/functions/` directory with endpoints for:
- Setting daily goals
- Logging workout sessions
- Retrieving workout history
- Calculating progress metrics

**Database Design**: MongoDB collections likely needed:
- User goals (daily targets)
- Workout sessions (timestamp, rep count)
- Aggregated daily totals

**API Communication**: Using axios for HTTP requests to Netlify Functions, which connect to MongoDB Atlas using the mongodb driver.

## Dependencies

Key dependencies installed:
- React 19.1.1 with TypeScript support
- MongoDB Node.js driver for database operations
- Axios for API calls
- Netlify CLI for local development and deployment