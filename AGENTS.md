# FitX Project Notes — Codex Agent

## Snapshot
- Full-stack jump rope tracker deployed on Netlify; frontend React 19 + TypeScript, backend Netlify Functions hitting MongoDB Atlas.
- Primary flows: auth (email verification first), cardio session tracking with timers & weekly charts, strength logging with calendar UI.
- Dev workflow requires planning discussion before code; complex changes need `[feature]_IMPP.md` progress files.

## Frontend Architecture
- `src/App.tsx` wires React Router (`/`, `/verify-email`, `/cardio`, `/strength`) inside `AuthProvider`; protected routes enforce login + verification.
- Global auth state via `AuthContext` (axios with credentials, `/auth-*` endpoints). Loading states gate UI.
- Workout experience (`WorkoutTracker.tsx`) manages rich session state: goal input, rep increments, timer sync, rep pattern learning, weekly chart refresh. Utilises `RepPatternsManager` (localStorage + API) and date utilities (`UTC storage, local grouping`).
- Strength view (`StrengthTracker.tsx`) couples with `WorkoutCalendar`: month view with local-time boundaries, 3-day edit window, testing mode, modals for record/edit/delete.
- Shared UI components: `TimerPicker` (iOS-style scroll wheel responsive logic), `CircularTimer` (progress ring, pause overlay), `WeeklyChart` (caching, week navigation, distinguishes testing vs real data).

## Backend Functions (Netlify)
- Auth suite: `auth-register` (bcrypt, verification email), `auth-login` (JWT cookie, email-verified gate), `auth-verify`, `auth-logout`, `verify-email`, `resend-verification`, `update-registration-email`.
- Workout APIs: `training-sessions` (session lifecycle, timer math, summary upsert), `daily-summaries` (week metadata, timezone-safe aggregation), `strength-workouts` (date-range queries, CRUD per day), `cleanup-paused-sessions` (overnight auto-finish).
- Personalisation: `user-rep-patterns` stores top 3 rep counts per user.
- Shared utils: `db` connection caching, `auth-helper` (cookie → userId), `cookies/jwt/validation/email`.

## Data & Timezone Handling
- Mongo collections documented in `database-schema.md`: `trainingSessions`, `dailySummaries`, `strengthWorkouts`, `userRepPatterns`, `users`.
- `src/utils/dateUtils.ts` enforces “UTC storage, local display” (local YYYY-MM-DD strings, noon-UTC daily summary timestamps, local day boundaries).
- Strength calendar converts local month bounds to UTC; weekly chart caches per week and separates testing data.

## Dev Workflow & Tooling
- Commands: `npm run dev` (Netlify dev proxy), `npm run functions`, `npm start`, `npm run build`, `npm test`. Database scripts (`npm run db:*`) for resets/imports.
- CLAUDE workflow: discuss fixes/features before coding; complex work tracked in temporary `_IMPP.md` checklists; delete when done.
- Axios default `withCredentials`; `.env` expected to provide Mongo URI, JWT secret, Gmail app password, etc. `netlify.toml` sets build/serve config.

## UI / UX Notes
- Auth screen uses minimal card layout; toggles login/register; shows validation hints but several Unicode glyphs render as `�?` (likely encoding/font issue worth addressing).
- Home page features two primary cards (Cardio/Strength) with emoji icons; same encoding glitch (`�?` separators/icons) visible.
- Workout tracker emphasises large numeric inputs, quick rep chips, adaptive timer ring; modals for completion, deletion, overtime.
- Strength tracker leans into calendar-first navigation; edit restrictions (3-day window) help maintain data integrity but may need clearer messaging.
- Weekly chart prioritises smooth navigation (week caching, “Current Week” / “First Week” buttons) but arrow icons also hit encoding issue.

## Risks & Follow-Ups
- `test-timezone-fix.js` referenced in IDE tab but missing from repo; confirm if obsolete or needs recovery.
- Persistent replacement glyphs (`�?`) in JSX/HTML/CSS imply encoding conversions—should audit source of icons (maybe lost emoji, check build pipeline/fonts).
- `import-historical-data.js` mentioned in docs yet absent; ensure historical import script lives elsewhere or update docs.
- Rep pattern manager still hardcodes `USER_ID = 'default-user'`; authentication hook likely needed to pass real user id.
- Ensure environment secrets (`MONGODB_URI`, `JWT_SECRET`, Gmail creds) configured for Netlify and local dev.

