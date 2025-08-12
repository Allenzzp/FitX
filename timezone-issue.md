# Timezone Mismatch Issue - Brief Summary

## Problem Overview
Frontend (Vancouver local time) vs Backend (UTC server time) timezone mismatch causing incorrect timestamps in database records.

## Affected Collections
- `trainingSessions`: startTime, endTime, createdAt, pausedAt
- `dailySummaries`: createdAt, updatedAt

## Root Cause
Backend using `getCurrentTime()` (server UTC) instead of user's local timezone for timestamp fields.

## Current Status
✅ **FIXED** - Frontend now sends local timestamps, backend uses them when provided.

## Implementation Details
- Frontend: Sends `now.toISOString()` for timestamp fields
- Backend: Uses provided timestamps or falls back to `getCurrentTime()`
- All new records will have correct local timestamps

## Future Discussion Points
- Historical data correction strategy
- Timezone handling best practices
- User timezone detection/configuration
- Database migration considerations

---
*Created: Aug 11, 2025 - Vancouver*
*Status: Resolved for new records*