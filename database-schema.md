# Database Schema

FitX MongoDB collections and data structures.

## Collections

### `trainingSessions`
Individual workout sessions with real-time progress tracking.

```javascript
{
  goal: Number,                     // Target jump count
  completed: Number,                // Current jumps completed  
  startTime: Date,                  // Session start
  endTime: Date | null,             // Session end (null if not ended)
  status: String,                   // "active" | "paused" | "ended"
  pausedAt: Date | null,            // Last pause timestamp
  lastActivityAt: Date,             // Last rep addition time (for auto-pause)
  actualWorkoutDuration: Number,    // Total active workout time in milliseconds (calculated from segments)
  trainingSegments: [{              // Array of training periods
    start: Date,
    end: Date | null
  }],
  testing: Boolean,                 // Test data flag
  createdAt: Date
}
```

**Rules**: Only one non-ended session at a time. Goal ≥ 100. Auto-pause after 10min inactivity.

### `dailySummaries`
Daily aggregated totals for weekly charts.

```javascript
{
  date: Date,                       // Date (midnight UTC)
  totalJumps: Number,               // Total jumps for this day
  sessionsCount: Number,            // Number of sessions
  testing: Boolean,                 // Test data flag
  createdAt: Date,
  updatedAt: Date
}
```

**Rules**: One document per date. Used by WeeklyChart component.

## Testing Data

- UI toggle sets `testing: true/false` on new records
- Delete test data: `DELETE /.netlify/functions/{endpoint}?deleteTestData=true`
- Historical data has `testing: false` (preserve during cleanup)