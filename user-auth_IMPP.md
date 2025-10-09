# User Authentication Implementation Progress

## ✅ Core Design

**Auth Stack:**
- JWT with httpOnly cookies (21-day sessions)
- bcryptjs (salt rounds: 10)
- Resend email service
- Email verification required before login (1-hour token expiry)

**Password Requirements:**
- Min 8 characters, must have letters AND numbers

**User ID System:**
- Display format: `0000-0000` to `9999-9999`
- Stored as auto-increment integer (0, 1, 2...)
- First user gets ID `0000-0000`

**Security:**
- Input sanitization for NoSQL injection/XSS prevention
- CORS configured for credentials

---

## 📝 Schema

**`users` collection:**
- userId (Number, auto-increment), email, username (max 20 chars), passwordHash
- emailVerified, emailVerificationToken, emailVerificationExpires (1 hour)
- passwordResetToken/Expires (null for MVP)
- createdAt, updatedAt, lastLogin (all UTC)

**Username validation:**
- Alphanumeric + `_-.`, start/end with letter/number, no consecutive specials, case-insensitive unique

**Existing collections:**
- Add `userId: Number` to trainingSessions, dailySummaries, strength workouts

---

## 🔧 Backend (Phase 1 ✅)

**Endpoints implemented:**
- `auth-register` - creates user, sends verification email, sets cookie
- `auth-login` - validates credentials + emailVerified, blocks if not verified (403)
- `auth-logout` - clears cookie
- `auth-verify` - checks auth status from cookie
- `verify-email` - handles email verification links
- `resend-verification` - sends new verification email
- `update-registration-email` - allows email change before verification

**Utilities created:**
- `utils/jwt.js`, `utils/cookies.js`, `utils/email.js`, `utils/validation.js`

---

## 🎨 Frontend (Phase 2 - TODO)

**Routes:**
- `/` → Login/Register page (if not authenticated) or HomePage (if authenticated)
- `/cardio`, `/strength` → Protected routes
- `/verify-email?token=xxx` → Email verification handler

**Components to build:**
1. **Auth.tsx** - Login/Register toggle page, full page centered card
2. **EmailVerificationPending.tsx** - Shows after registration, options: resend email or change email (pre-filled form)
3. **EmailVerified.tsx** - Success page (no auto-redirect)
4. **AuthContext.tsx** - Global auth state, methods: login/register/logout/checkAuth, configure `credentials: 'include'`
5. **ProtectedRoute** - Wraps protected routes, calls `/auth-verify`

**HomePage updates:**
- Top-right: `username • Logout` (click username to toggle with userId `0000-0000`)
- Color: `#6e6e73`, hover Logout: `#2C2C2E`

**Design specs:**
- Match existing FitX card style (border-radius: 25px, shadow, same padding/colors)
- Mobile: full-width cards

---

## 📋 Implementation Plan

**Phase 1: Backend ✅** - All endpoints + utils implemented, tested via test-auth.html

**Phase 2: Frontend Auth UI ✅**
- [x] AuthContext + credential config
- [x] Auth/EmailVerificationPending/EmailVerified/ProtectedRoute components
- [x] Form validation, styling
- [x] Update HomePage with user info + logout

**Phase 3: Integration**
- [ ] Migration script (add userId:0 to existing workout data)
- [ ] Update Netlify functions to extract userId from JWT
- [ ] Add userId filtering to all workout queries

**Phase 4: Testing**
- [ ] Full user flow + edge cases
- [ ] Loading states + error messages
- [ ] Mobile testing

---

## 🎯 Status: Phase 2 Complete ✅

**Completed:**
- Phase 1: Backend (all auth endpoints)
- Phase 2: Frontend Auth UI (all components + routing)

**Next:** Phase 3 (Integration with existing workout features)
