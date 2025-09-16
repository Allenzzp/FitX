import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import WeeklyChart from './WeeklyChart';
import TimerPicker from './TimerPicker';
import CircularTimer from './CircularTimer';
import { RepPatternsManager } from '../utils/repPatternsManager';
import { getUserLocalDate, createDailySummaryDate } from '../utils/dateUtils';
import './WorkoutTracker.css';

interface TrainingSession {
  _id: string;
  goal: number;
  completed: number;
  startTime: string;
  endTime: string | null;
  status: "active" | "paused" | "ended";
  pausedAt: string | null;
  lastActivityAt: string;
  actualWorkoutDuration: number;
  // Timer fields
  sessionLen?: number;     // Target duration in seconds
  remainTime?: number;     // Remaining time in seconds
  timerExpired?: boolean;  // Has timer expired
  extraTime?: number;      // Overtime in seconds
  testing?: boolean;
  trainingSegments: {
    start: string;
    end: string | null;
  }[];
}

interface DailySummary {
  _id: string;
  date: string;
  totalJumps: number;
  sessionsCount: number;
  totalWorkoutMinutes?: number;  // New field for workout time
  testing?: boolean;
}

const WorkoutTracker: React.FC = () => {
  const navigate = useNavigate();
  const goalInputRef = useRef<HTMLInputElement>(null);
  const [currentSession, setCurrentSession] = useState<TrainingSession | null>(null);
  const [autoPauseTimer, setAutoPauseTimer] = useState<NodeJS.Timeout | null>(null);
  const [goalInput, setGoalInput] = useState('');
  const [repInput, setRepInput] = useState('');
  const [isDefaultRep, setIsDefaultRep] = useState(true);
  const [isDefaultGoal, setIsDefaultGoal] = useState(true);
  const [isGoalFocused, setIsGoalFocused] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [needsSync, setNeedsSync] = useState(false);
  const [isWorkoutComplete, setIsWorkoutComplete] = useState(false);
  const [completedSession, setCompletedSession] = useState<TrainingSession | null>(null);
  const [isTestingMode, setIsTestingMode] = useState(false); // Always default to Off
  const [hasTestData, setHasTestData] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [lastSyncPoint, setLastSyncPoint] = useState(0);
  const [chartKey, setChartKey] = useState(0);
  const [commonGoals, setCommonGoals] = useState<number[]>([]);
  const [goalInputError, setGoalInputError] = useState<string>('');
  const [repInputError, setRepInputError] = useState<string>('');
  const [quickRepOptions, setQuickRepOptions] = useState<number[]>([]);
  const [repPatternsManager] = useState(() => new RepPatternsManager());
  const [clickedButton, setClickedButton] = useState<number | null>(null);
  const [isRepInputFocused, setIsRepInputFocused] = useState(false);
  const [isInteractingWithButtons, setIsInteractingWithButtons] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState<number>(60); // Default 60 minutes
  const [showTimerExpiredModal, setShowTimerExpiredModal] = useState(false);

  // Client-side timer state for real-time countdown display
  const [clientTimer, setClientTimer] = useState<{
    remainTime: number;
    isExpired: boolean;
    extraTime: number;
    lastSync: number;
  } | null>(null);
  const [clientTimerInterval, setClientTimerInterval] = useState<NodeJS.Timeout | null>(null);
  const [syncInterval, setSyncInterval] = useState<NodeJS.Timeout | null>(null);
  const [clientLastRepAt, setClientLastRepAt] = useState<Date | null>(null);

  const API_BASE = process.env.NODE_ENV === 'development' ? '/.netlify/functions' : '/.netlify/functions';
  
  // Helper function to calculate workout minutes from session timer data
  const calculateWorkoutMinutes = (session: TrainingSession): number => {
    if (!session.sessionLen) {
      // No timer was set for this session, return 0
      return 0;
    }
    
    if (session.timerExpired && session.extraTime) {
      // Session went overtime: sessionLen + extraTime
      return Math.round((session.sessionLen + session.extraTime) / 60);
    } else {
      // Session completed within time: sessionLen - remainTime
      const remainingSeconds = session.remainTime || 0;
      return Math.round((session.sessionLen - remainingSeconds) / 60);
    }
  };

  // Helper function to format seconds into MM:SS display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(Math.abs(seconds) / 60);
    const secs = Math.abs(seconds) % 60;
    const sign = seconds < 0 ? '+' : ''; // Show + for overtime
    return `${sign}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle circular timer click for pause/resume
  const handleTimerClick = () => {
    if (!currentSession) return;
    
    if (currentSession.status === 'active') {
      pauseWorkout();
    } else if (currentSession.status === 'paused') {
      resumeWorkout();
    }
  };

  // Start client-side timer for real-time countdown
  const startClientTimer = (initialRemainTime: number, sessionLen: number) => {
    // Clear existing timer
    if (clientTimerInterval) {
      clearInterval(clientTimerInterval);
    }

    // Initialize client timer state
    setClientTimer({
      remainTime: initialRemainTime,
      isExpired: initialRemainTime <= 0,
      extraTime: initialRemainTime <= 0 ? Math.abs(initialRemainTime) : 0,
      lastSync: Date.now()
    });

    // Start countdown interval
    const interval = setInterval(() => {
      setClientTimer(prev => {
        if (!prev) return null;

        const newRemainTime = prev.remainTime - 1;

        if (newRemainTime <= 0 && prev.remainTime > 0) {
          // Timer just expired - show modal
          setShowTimerExpiredModal(true);
        }

        return {
          ...prev,
          remainTime: Math.max(0, newRemainTime),
          isExpired: newRemainTime <= 0,
          extraTime: newRemainTime <= 0 ? Math.abs(newRemainTime) : 0
        };
      });
    }, 1000);

    setClientTimerInterval(interval);
  };

  // Stop client-side timer
  const stopClientTimer = () => {
    if (clientTimerInterval) {
      clearInterval(clientTimerInterval);
      setClientTimerInterval(null);
    }
    setClientTimer(null);
  };

  // Pause client timer (preserve state, stop countdown)
  const pauseClientTimer = () => {
    if (clientTimerInterval) {
      clearInterval(clientTimerInterval);
      setClientTimerInterval(null);
    }
    // Keep clientTimer state for display during pause
  };

  // Sync client timer with server (every 30 seconds)
  const startTimerSync = () => {
    if (syncInterval) {
      clearInterval(syncInterval);
    }

    const interval = setInterval(async () => {
      if (currentSession && currentSession.status === 'active' && currentSession.sessionLen && clientTimer) {
        try {
          const response = await axios.get(`${API_BASE}/training-sessions`);
          if (response.data && response.data._id === currentSession._id) {
            // Update session state
            setCurrentSession(response.data);

            // Sync client timer with server data
            const serverRemainTime = response.data.remainTime || 0;
            const serverExtraTime = response.data.extraTime || 0;
            const serverExpired = response.data.timerExpired || false;

            setClientTimer(prev => ({
              remainTime: serverExpired ? 0 : serverRemainTime,
              isExpired: serverExpired,
              extraTime: serverExtraTime,
              lastSync: Date.now()
            }));
          }
        } catch (error) {
          console.error('Failed to sync timer with server:', error);
        }
      }
    }, 30000); // Sync every 30 seconds

    setSyncInterval(interval);
  };

  // Stop timer sync
  const stopTimerSync = () => {
    if (syncInterval) {
      clearInterval(syncInterval);
      setSyncInterval(null);
    }
  };

  // Sequential application initialization to prevent race conditions
  const initializeApplication = async () => {
    try {
      // Step 1: Run backup cleanup (non-critical, don't block on errors)
      try {
        await runBackupCleanup();
      } catch (error) {
        console.error('Backup cleanup failed, continuing initialization:', error);
      }

      // Step 2: Try to recover session from localStorage first
      const localRecoverySuccess = attemptLocalRecovery();

      // Step 3: Fetch current session from backend (critical step)
      const backendSession = await fetchCurrentSessionSafely();

      // Step 4: Validate and reconcile local vs backend state
      const finalSessionState = reconcileSessionState(localRecoverySuccess, backendSession);

      // Step 5: Determine if this is refresh recovery
      const isRefreshRecovery = localRecoverySuccess.hasLocalSession && finalSessionState.session;

      // Step 6: Initialize non-critical features
      await initializeSecondaryFeatures(isRefreshRecovery);

      // Step 7: Apply final validated session state
      applyValidatedSessionState(finalSessionState);

    } catch (error) {
      console.error('Application initialization failed:', error);
      // Graceful fallback: ensure app can still function
      setLoading(false);
      setCurrentSession(null);
      setIsStarted(false);
    }
  };

  useEffect(() => {
    // Sequential initialization to prevent race conditions
    initializeApplication();

    // Cleanup function
    return () => {
      stopClientTimer();
      stopTimerSync();
    };
  }, []);  // Remove currentSession dependency to prevent infinite loop


  // Separate effect for beforeunload handler to access current state
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentSession?.status === 'active') {
        // Use navigator.sendBeacon for reliable request during page unload
        const pauseData = JSON.stringify({
          action: 'pause'
          // Timer state is now calculated server-side - no need to send it
        });
        
        navigator.sendBeacon(
          `${API_BASE}/training-sessions?id=${currentSession._id}`,
          pauseData
        );
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentSession]);

  const handleBackClick = () => {
    navigate('/');
  };

  const toggleTestingMode = async () => {
    const newMode = !isTestingMode;
    setIsTestingMode(newMode);
    // Don't persist to localStorage - always default to Off on page load
    
    // Refresh test data status when toggling mode
    await checkForTestData();
  };

  // Safe local session recovery - returns recovery state info
  const attemptLocalRecovery = () => {
    try {
      const sessionData = localStorage.getItem('activeSession');
      if (!sessionData) {
        return { hasLocalSession: false, shouldRecover: false };
      }

      const { sessionId, timestamp, status, hasTimer, testing, clientLastRepAt } = JSON.parse(sessionData);
      const now = Date.now();
      const timeDiff = now - timestamp;
      const tenMinutes = 10 * 60 * 1000;

      // Determine if we should recover based on localStorage data
      const shouldRecover = (timeDiff <= tenMinutes && status === 'active') || status === 'paused';

      return {
        hasLocalSession: true,
        shouldRecover,
        sessionId,
        status,
        hasTimer,
        testing: testing || false, // Include testing mode from localStorage
        clientLastRepAt: clientLastRepAt || null, // Include last rep timestamp
        timeDiff
      };
    } catch (error) {
      console.error('Failed to parse localStorage session data:', error);
      // Clear invalid session data
      localStorage.removeItem('activeSession');
      return { hasLocalSession: false, shouldRecover: false };
    }
  };

  const saveSessionToLocalStorage = (session: TrainingSession | null) => {
    if (session && (session.status === 'active' || session.status === 'paused')) {
      localStorage.setItem('activeSession', JSON.stringify({
        sessionId: session._id,
        timestamp: Date.now(),
        status: session.status,
        hasTimer: !!session.sessionLen, // Track whether session has a timer
        testing: session.testing || false, // Store testing mode for recovery validation
        clientLastRepAt: clientLastRepAt?.toISOString() || null // Persist last rep timestamp
      }));
    } else {
      localStorage.removeItem('activeSession');
    }
  };

  const validateIntegerInput = (value: string, maxValue?: number): { isValid: boolean; error: string; sanitizedValue: string } => {
    // Remove any whitespace
    const trimmedValue = value.trim();
    
    // Allow empty string (will be handled by calling function)
    if (trimmedValue === '') {
      return { isValid: true, error: '', sanitizedValue: '' };
    }
    
    // Check if it's a valid positive integer
    const integerRegex = /^[1-9]\d*$/;
    
    if (!integerRegex.test(trimmedValue)) {
      return { isValid: false, error: 'Please enter an Integer', sanitizedValue: '' };
    }
    
    // Check for reasonable limits
    const number = parseInt(trimmedValue, 10);
    if (maxValue && number > maxValue) {
      return { isValid: false, error: 'Please set a reasonable goal', sanitizedValue: '' };
    }
    
    return { isValid: true, error: '', sanitizedValue: trimmedValue };
  };

  const fetchCommonGoals = async () => {
    try {
      const response = await axios.get(`${API_BASE}/user-preferences`);
      if (response.data && response.data.commonGoals) {
        setCommonGoals(response.data.commonGoals);
      }
    } catch (error) {
      console.log('No user preferences found or failed to fetch:', error);
      // Initialize with default empty array - not an error
    }
  };

  const updateQuickRepOptions = () => {
    // Bug 1 fix: Show all localStorage keys instead of just top 3
    const options = repPatternsManager.getAllLocalStorageReps();
    setQuickRepOptions(options);
  };

  const trackGoalUsage = async (goal: number) => {
    // Don't track the default 100 goal as specified in requirements
    if (goal === 100) return;
    
    try {
      // Get current goal frequencies from localStorage
      const storedFreqs = localStorage.getItem('goalFrequencies');
      const frequencies = storedFreqs ? JSON.parse(storedFreqs) : {};
      
      // Update frequency for this goal
      frequencies[goal] = (frequencies[goal] || 0) + 1;
      
      // Save back to localStorage
      localStorage.setItem('goalFrequencies', JSON.stringify(frequencies));
      
      // Get top 3 most frequent goals (excluding 100)
      const sortedGoals = Object.entries(frequencies)
        .filter(([goalStr]) => parseInt(goalStr) !== 100)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .slice(0, 3)
        .map(([goalStr]) => parseInt(goalStr));
      
      // Update backend with new common goals
      await axios.post(`${API_BASE}/user-preferences`, {
        commonGoals: sortedGoals
      });
      
      // Update local state
      setCommonGoals(sortedGoals);
    } catch (error) {
      console.error('Failed to track goal usage:', error);
    }
  };

  const runBackupCleanup = async () => {
    try {
      // Only run cleanup once per day and only if there's a non-ended session
      const lastCleanup = localStorage.getItem('lastCleanupDate');
      const today = new Date().toDateString();
      
      if (lastCleanup !== today) {
        // First check if there's any non-ended session (more efficient)
        const response = await axios.get(`${API_BASE}/training-sessions`);
        
        if (response.data && response.data.status !== 'ended') {
          // Only run cleanup if there's actually a non-ended session
          console.log('Found non-ended session, running backup cleanup...');
          await axios.get(`${API_BASE}/cleanup-paused-sessions`);
          console.log('Backup cleanup completed');
        }
        
        // Mark cleanup as done for today regardless of whether cleanup was needed
        localStorage.setItem('lastCleanupDate', today);
      }
    } catch (error) {
      console.error('Backup cleanup failed:', error);
      // Don't block app loading if cleanup fails
    }
  };

  const checkForTestData = async () => {
    try {
      // Check for test data in training sessions
      const sessionsResponse = await axios.get(`${API_BASE}/training-sessions?checkTestData=true`);
      // Check for test data in daily summaries  
      const summariesResponse = await axios.get(`${API_BASE}/daily-summaries?checkTestData=true`);
      
      setHasTestData(sessionsResponse.data.hasTestData || summariesResponse.data.hasTestData);
    } catch (error) {
      console.error('Failed to check for test data:', error);
    }
  };

  const deleteTestData = async () => {
    try {
      // Check if current session is a testing session
      if (currentSession?.testing === true) {
        // End the current testing session first (regardless of active/paused status)
        console.log('Ending current testing session before deleting test data');
        await endWorkout();
      }
      
      // Delete test training sessions
      await axios.delete(`${API_BASE}/training-sessions?deleteTestData=true`);
      // Delete test daily summaries
      await axios.delete(`${API_BASE}/daily-summaries?deleteTestData=true`);
      
      setHasTestData(false);
      setShowDeleteConfirm(false);
      console.log('Test data deleted successfully');
      
      // Refresh current session in case it was a test session
      try {
        const response = await axios.get(`${API_BASE}/training-sessions`);
        if (response.data) {
          setCurrentSession(response.data);
          saveSessionToLocalStorage(response.data);
        } else {
          setCurrentSession(null);
          saveSessionToLocalStorage(null);
        }
      } catch (error) {
        console.error('Failed to refresh current session:', error);
      }
      
      // Force chart refresh by changing its key
      setChartKey(prev => prev + 1);
    } catch (error) {
      console.error('Failed to delete test data:', error);
    }
  };

  // Safe backend session fetch - doesn't modify state directly
  const fetchCurrentSessionSafely = async () => {
    try {
      const response = await axios.get(`${API_BASE}/training-sessions`);
      return {
        success: true,
        session: response.data || null,
        error: null
      };
    } catch (error) {
      console.error('Failed to fetch current session:', error);
      return {
        success: false,
        session: null,
        error: error
      };
    }
  };

  // Validate and reconcile local vs backend session state
  const reconcileSessionState = (localRecovery: any, backendResult: any) => {
    // If backend fetch failed, rely on local recovery if available
    if (!backendResult.success) {
      if (localRecovery.shouldRecover) {
        return {
          shouldSetStarted: true,
          session: null, // We'll let user retry backend later
          useLocalRecovery: true,
          error: 'Backend unavailable, using local recovery'
        };
      }
      return {
        shouldSetStarted: false,
        session: null,
        useLocalRecovery: false,
        error: 'Backend unavailable, no local session to recover'
      };
    }

    // Backend is available - use backend data as source of truth
    const backendSession = backendResult.session;
    
    if (backendSession) {
      // Validate session data consistency
      if (!backendSession._id || !backendSession.goal || backendSession.status === undefined) {
        console.error('Invalid session data from backend:', backendSession);
        return {
          shouldSetStarted: false,
          session: null,
          useLocalRecovery: false,
          error: 'Invalid backend session data'
        };
      }
      
      return {
        shouldSetStarted: true,
        session: backendSession,
        useLocalRecovery: false,
        localTestingMode: localRecovery.testing, // Pass localStorage testing mode as fallback
        localClientLastRepAt: localRecovery.clientLastRepAt, // Pass localStorage last rep timestamp
        error: null
      };
    }

    // No backend session - clear any stale local data
    return {
      shouldSetStarted: false,
      session: null,
      useLocalRecovery: false,
      error: null
    };
  };

  // Initialize non-critical secondary features
  const initializeSecondaryFeatures = async (isRefreshRecovery = false) => {
    // These features should not block app loading if they fail
    const promises = [
      checkForTestData().catch(error => console.error('Test data check failed:', error)),
      fetchCommonGoals().catch(error => console.error('Common goals fetch failed:', error))
    ];

    // Only initialize rep patterns if NOT recovering from refresh (preserve session patterns)
    if (!isRefreshRecovery) {
      promises.push(
        repPatternsManager.initialize()
          .then(() => updateQuickRepOptions())
          .catch(error => console.error('Rep patterns init failed:', error))
      );
    } else {
      // For refresh recovery, load patterns from localStorage and update quick rep options
      try {
        repPatternsManager.loadFromLocalStorage();
        updateQuickRepOptions();
      } catch (error) {
        console.error('Failed to load patterns from localStorage during recovery:', error);
      }
    }

    // Wait for all but don't fail if any individual feature fails
    await Promise.allSettled(promises);
  };

  // Apply final validated session state to component
  const applyValidatedSessionState = (sessionState: any) => {
    try {
      if (sessionState.session) {
        setCurrentSession(sessionState.session);
        setIsStarted(true);

        // Restore testing mode from session data with localStorage fallback (Bug-3 fix)
        if (sessionState.session.testing !== undefined) {
          setIsTestingMode(sessionState.session.testing);
        } else if (sessionState.localTestingMode !== undefined) {
          // Fallback to localStorage testing mode if backend doesn't have it
          setIsTestingMode(sessionState.localTestingMode);
        }

        // Set sync point based on current progress
        setLastSyncPoint(Math.floor(sessionState.session.completed / 500) * 500);

        // Initialize client last rep timestamp - prefer localStorage, fallback to session's lastActivityAt
        if (sessionState.localClientLastRepAt) {
          setClientLastRepAt(new Date(sessionState.localClientLastRepAt));
        } else {
          setClientLastRepAt(new Date(sessionState.session.lastActivityAt));
        }

        // Initialize client-side timer based on session state
        if (sessionState.session.sessionLen) {
          const remainTime = sessionState.session.remainTime || sessionState.session.sessionLen;
          const extraTime = sessionState.session.extraTime || 0;
          const isExpired = sessionState.session.timerExpired || false;

          if (sessionState.session.status === "active") {
            // Active session: start countdown timer
            startClientTimer(remainTime, sessionState.session.sessionLen);
            startTimerSync();
          } else if (sessionState.session.status === "paused") {
            // Paused session: initialize client timer state but don't start countdown
            setClientTimer({
              remainTime: remainTime,
              isExpired: isExpired,
              extraTime: extraTime,
              lastSync: Date.now()
            });
          }
        }
        
        // Start auto-pause timer if session is active
        if (sessionState.session.status === "active") {
          startAutoPauseTimer(sessionState.session._id);
        }
        
        // Save to localStorage for future recovery
        saveSessionToLocalStorage(sessionState.session);
      } else {
        // No session or local recovery only
        if (sessionState.shouldSetStarted) {
          setIsStarted(true);
        }
        // Clear localStorage if no valid session
        if (!sessionState.useLocalRecovery) {
          saveSessionToLocalStorage(null);
        }
      }
    } catch (error) {
      console.error('Failed to apply session state:', error);
    } finally {
      setLoading(false);
    }
  };

  const setDailyGoal = () => {
    // Use default 4000 if empty, otherwise validate input
    let goal = 4000;
    if (goalInput !== '') {
      const validation = validateIntegerInput(goalInput, 20000);
      
      if (!validation.isValid) {
        setGoalInputError(validation.error);
        return;
      }
      
      goal = parseInt(validation.sanitizedValue || goalInput);
    }
    if (goal < 100) {
      setGoalInputError('Goal must be at least 100 jumps');
      return;
    }
    
    // Clear any previous errors and proceed
    setGoalInputError('');
    setIsStarted(true);
  };

  const startWorkout = async () => {
    try {
      // Use default 4000 if empty, otherwise validate input
      let goal = 4000;
      if (goalInput !== '') {
        const validation = validateIntegerInput(goalInput, 20000);
        
        if (!validation.isValid) {
          console.error('Invalid goal input:', validation.error);
          return;
        }
        
        goal = parseInt(validation.sanitizedValue || goalInput);
      }
      if (goal < 100) {
        console.error('Goal must be at least 100 jumps');
        return;
      }
      
      const now = new Date();
      const response = await axios.post(`${API_BASE}/training-sessions`, {
        goal: goal,
        sessionLen: timerMinutes * 60, // Convert minutes to seconds
        testing: isTestingMode,
        startTime: now.toISOString(),
        createdAt: now.toISOString()
      });
      setCurrentSession(response.data);
      setLastSyncPoint(0); // Reset sync point for new session

      // Initialize client last rep timestamp for new session
      setClientLastRepAt(new Date());

      // Start client-side timer for new session
      if (response.data.sessionLen) {
        startClientTimer(response.data.sessionLen, response.data.sessionLen);
        startTimerSync();
      }
      
      // Start auto-pause timer for new session
      startAutoPauseTimer(response.data._id);
      // Save new session to localStorage
      saveSessionToLocalStorage(response.data);

      // Initialize rep patterns for new training period (Bug-1 fix)
      try {
        await repPatternsManager.initialize();
        updateQuickRepOptions();
      } catch (error) {
        console.error('Failed to initialize rep patterns for new session:', error);
      }

      // Check for test data after session creation (to show delete button immediately)
      await checkForTestData();
      // Track goal usage for common goals feature (non-blocking)
      trackGoalUsage(goal).catch(error => {
        console.log('Goal usage tracking failed (non-critical):', error.message);
      });
    } catch (error) {
      console.error('Failed to start workout:', error);
    }
  };

  /**
   * Shared logic for processing rep additions (both + button and quick rep buttons)
   * Handles API calls, auto-sync, goal completion, and state updates
   */
  const processRepAddition = async (reps: number) => {
    if (!currentSession || reps <= 0) return false;
    
    const remainingGoal = currentSession.goal - currentSession.completed;
    
    // Check if reps exceeds remaining goal
    if (reps > remainingGoal) {
      setRepInputError(`Cannot exceed remaining goal (${remainingGoal.toLocaleString()})`);
      return false;
    }
    
    // Clear any previous errors
    setRepInputError('');
    
    try {
      // Track rep usage for pattern learning
      repPatternsManager.trackRepUsage(reps);
      updateQuickRepOptions();

      // Track client-side last rep activity timestamp
      const repTimestamp = new Date();
      setClientLastRepAt(repTimestamp);

      const newCompleted = currentSession.completed + reps;
      const response = await axios.put(`${API_BASE}/training-sessions?id=${currentSession._id}`, {
        action: 'updateProgress',
        completed: newCompleted
        // Timer state is now calculated server-side - no need to send it
      });
      // Clean session state update - no timer conflicts
      setCurrentSession(response.data);
      // Update localStorage with new progress
      saveSessionToLocalStorage(response.data);
      setNeedsSync(true); // Mark as needing sync after progress update
      
      // Reset auto-pause timer on activity
      resetAutoPauseTimer(currentSession._id);
      
      // Auto-sync every 500 reps (but not when goal is reached, as endWorkout will handle that)
      if (newCompleted >= lastSyncPoint + 500 && newCompleted < currentSession.goal && currentSession.status === "active") {
        console.log('Auto-sync triggered at', newCompleted, 'reps');
        // Actually perform the sync to database
        try {
          await axios.put(`${API_BASE}/training-sessions?id=${currentSession._id}`, {
            action: 'updateProgress',
            completed: newCompleted
            // Timer state is now calculated server-side - no need to send it
          });
          setNeedsSync(false); // Auto-sync completed, reset sync state
          setLastSyncPoint(Math.floor(newCompleted / 500) * 500); // Update sync point
          console.log('Auto-sync completed for', newCompleted, 'reps');
        } catch (error) {
          console.error('Auto-sync failed:', error);
          // Keep needsSync as true if auto-sync fails
        }
      }
      
      // Final sync and auto-complete session when goal is reached
      if (newCompleted >= currentSession.goal) {
        // Sync rep patterns before completing
        try {
          await repPatternsManager.syncToDatabase();
          updateQuickRepOptions();
        } catch (error) {
          console.error('Failed to sync rep patterns on completion:', error);
        }
        
        // Final sync: update progress AND end session in one operation
        try {
          const now = new Date();
          const finalSyncResponse = await axios.put(`${API_BASE}/training-sessions?id=${currentSession._id}`, {
            action: 'finalSync',
            completed: newCompleted,
            endTime: now.toISOString()
            // Timer state is now calculated server-side - no need to send it
          });
          
          // Create daily summary with correct final count
          const localDate = getUserLocalDate();
          const dailySummaryDate = createDailySummaryDate(localDate);
          // Calculate workout minutes from the updated session
          const updatedSession = finalSyncResponse.data;
          const workoutMinutes = calculateWorkoutMinutes(updatedSession);
          
          await axios.post(`${API_BASE}/daily-summaries`, {
            date: dailySummaryDate,
            localDate: localDate,
            totalJumps: newCompleted,
            sessionsCount: 1,
            totalWorkoutMinutes: workoutMinutes,
            testing: isTestingMode,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          
          // Update UI state for completion
          setCompletedSession({...currentSession, completed: newCompleted});
          setCurrentSession(null);
          // Clear session from localStorage on completion
          saveSessionToLocalStorage(null);
          setIsWorkoutComplete(true);
          await checkForTestData();
          
          // Force chart refresh to show new data
          setChartKey(prev => prev + 1);
          
        } catch (error) {
          console.error('Failed to complete workout:', error);
        }
      }
      
      return true; // Success
    } catch (error) {
      console.error('Failed to update progress:', error);
      return false; // Failure
    }
  };

  const addQuickReps = async (reps: number) => {
    if (!currentSession || currentSession.status === "paused") return;
    
    // Show button animation
    setClickedButton(reps);
    setTimeout(() => setClickedButton(null), 200);
    
    // Use shared helper for all the core logic
    await processRepAddition(reps);
  };

  const addReps = async () => {
    if (!currentSession) return;
    
    // Use default 100 if empty, otherwise validate input
    let reps = 100;
    if (repInput !== '') {
      const validation = validateIntegerInput(repInput);
      if (!validation.isValid) {
        setRepInputError(validation.error);
        return;
      }
      reps = parseInt(validation.sanitizedValue);
    }
    
    // Use shared helper for all the core logic
    const success = await processRepAddition(reps);
    
    if (success) {
      // Clear input on successful addition (specific to + button flow)
      setRepInput('');
      setIsDefaultRep(true);
    }
  };

  const manualSync = async () => {
    if (!currentSession || isSyncing || currentSession.status !== "active") return;
    
    setIsSyncing(true);
    try {
      await axios.put(`${API_BASE}/training-sessions?id=${currentSession._id}`, {
        action: 'updateProgress',
        completed: currentSession.completed
        // Timer state is now calculated server-side - no need to send it
      });
      setNeedsSync(false); // Manual sync completed, reset sync state
      console.log('Manual sync completed');
    } catch (error) {
      console.error('Failed to sync data:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const startAutoPauseTimer = (sessionId: string) => {
    // Clear existing timer
    if (autoPauseTimer) {
      clearTimeout(autoPauseTimer);
    }
    
    // Set 10-minute timer for auto-pause
    const timer = setTimeout(async () => {
      try {
        console.log('Auto-pausing session due to inactivity');

        // Include client timer state for accurate auto-pause
        const autoPauseData: any = {
          action: 'autoPause'
        };

        // Include client timer state if available
        if (clientTimer) {
          autoPauseData.clientTimerState = {
            remainTime: clientTimer.remainTime,
            isExpired: clientTimer.isExpired,
            extraTime: clientTimer.extraTime
          };
        }

        await axios.put(`${API_BASE}/training-sessions?id=${sessionId}`, autoPauseData);
        // Refresh current session to get updated status
        try {
          const response = await axios.get(`${API_BASE}/training-sessions`);
          if (response.data) {
            setCurrentSession(response.data);
            saveSessionToLocalStorage(response.data);

            // Handle client timer state for auto-pause
            pauseClientTimer();
            stopTimerSync();
          }
        } catch (error) {
          console.error('Failed to refresh session after auto-pause:', error);
        }
      } catch (error) {
        console.error('Failed to auto-pause session:', error);
      }
    }, 10 * 60 * 1000); // 10 minutes
    
    setAutoPauseTimer(timer);
  };

  const resetAutoPauseTimer = (sessionId: string) => {
    startAutoPauseTimer(sessionId);
  };

  const clearAutoPauseTimer = () => {
    if (autoPauseTimer) {
      clearTimeout(autoPauseTimer);
      setAutoPauseTimer(null);
    }
  };

  const pauseWorkout = async () => {
    if (!currentSession) return;

    try {
      // 1. IMMEDIATELY freeze what user sees (prevent timer drift during request)
      pauseClientTimer(); // Stop client timer first - user sees immediate pause
      clearAutoPauseTimer(); // Stop auto-pause timer when manually paused
      stopTimerSync(); // Stop timer sync when paused

      // Sync rep patterns before pausing
      try {
        await repPatternsManager.syncToDatabase();
        updateQuickRepOptions();
      } catch (error) {
        console.error('Failed to sync rep patterns on pause:', error);
      }

      // Send client's displayed time as authoritative source
      const pauseData: any = {
        action: 'pause'
      };

      // Include client's displayed time - this is what user saw when they clicked pause
      if (clientTimer) {
        pauseData.clientDisplayedTime = clientTimer.remainTime; // ← User's ground truth
        pauseData.clientTimerState = {
          remainTime: clientTimer.remainTime,
          isExpired: clientTimer.isExpired,
          extraTime: clientTimer.extraTime
        };
      }

      const response = await axios.put(`${API_BASE}/training-sessions?id=${currentSession._id}`, pauseData);
      setCurrentSession(response.data);
      // Update localStorage with paused status
      saveSessionToLocalStorage(response.data);
    } catch (error) {
      console.error('Failed to pause workout:', error);
    }
  };

  const resumeWorkout = async () => {
    if (!currentSession) return;

    try {
      const response = await axios.put(`${API_BASE}/training-sessions?id=${currentSession._id}`, {
        action: 'resume'
      });
      setCurrentSession(response.data);
      // Update localStorage with resumed status
      saveSessionToLocalStorage(response.data);
      // Start auto-pause timer when resuming
      startAutoPauseTimer(response.data._id);
      // Start client timer if session has timer
      if (response.data.sessionLen) {
        const remainTime = response.data.remainTime || response.data.sessionLen;
        startClientTimer(remainTime, response.data.sessionLen);
        startTimerSync();
      }

      // Initialize rep patterns for resumed training period (Bug-1 fix)
      try {
        await repPatternsManager.initialize();
        updateQuickRepOptions();
      } catch (error) {
        console.error('Failed to initialize rep patterns for resumed session:', error);
      }
    } catch (error) {
      console.error('Failed to resume workout:', error);
    }
  };

  const resumeToLastActivity = async () => {
    if (!currentSession || !currentSession.sessionLen) return;

    try {
      // Use client-side last rep timestamp if available, otherwise fall back to DB lastActivityAt
      const actualLastRepAt = clientLastRepAt || new Date(currentSession.lastActivityAt);

      // Calculate what the timer state was at the last rep time
      const sessionStartTime = new Date(currentSession.startTime);
      const elapsedAtLastRep = Math.floor((actualLastRepAt.getTime() - sessionStartTime.getTime()) / 1000);
      const remainTimeAtLastRep = Math.max(0, currentSession.sessionLen - elapsedAtLastRep);

      const lastRepTimerState = {
        remainTime: remainTimeAtLastRep,
        isExpired: remainTimeAtLastRep <= 0,
        extraTime: remainTimeAtLastRep <= 0 ? Math.abs(remainTimeAtLastRep) : 0
      };


      // Send the exact timer state to restore
      const response = await axios.put(`${API_BASE}/training-sessions?id=${currentSession._id}`, {
        action: 'resumeToLastActivity',
        lastRepTimerState: lastRepTimerState
      });
      setCurrentSession(response.data);
      // Update localStorage with resumed status
      saveSessionToLocalStorage(response.data);
      // Start auto-pause timer when resuming
      startAutoPauseTimer(response.data._id);
      // Start client timer if session has timer
      if (response.data.sessionLen) {
        const remainTime = response.data.remainTime || response.data.sessionLen;
        startClientTimer(remainTime, response.data.sessionLen);
        startTimerSync();
      }

      // Initialize rep patterns for resumed training period (Bug-1 fix)
      try {
        await repPatternsManager.initialize();
        updateQuickRepOptions();
      } catch (error) {
        console.error('Failed to initialize rep patterns for resumed session:', error);
      }
    } catch (error) {
      console.error('Failed to resume to last activity:', error);
    }
  };

  const endWorkout = async () => {
    if (!currentSession) return;
    
    try {
      // Sync rep patterns before ending
      try {
        await repPatternsManager.syncToDatabase();
        updateQuickRepOptions();
      } catch (error) {
        console.error('Failed to sync rep patterns on end:', error);
      }
      
      const now = new Date();
      
      // End the session (for manual end workout button)
      const endResponse = await axios.put(`${API_BASE}/training-sessions?id=${currentSession._id}`, {
        action: 'end',
        endTime: now.toISOString()
        // Timer state is now calculated server-side - no need to send it
      });
      
      // Create daily summary with current progress
      const localDate = getUserLocalDate();
      const dailySummaryDate = createDailySummaryDate(localDate);
      // Calculate workout minutes from the updated session
      const updatedSession = endResponse.data;
      const workoutMinutes = calculateWorkoutMinutes(updatedSession);
      
      await axios.post(`${API_BASE}/daily-summaries`, {
        date: dailySummaryDate,
        localDate: localDate,
        totalJumps: currentSession.completed,
        sessionsCount: 1,
        totalWorkoutMinutes: workoutMinutes,
        testing: isTestingMode,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      // Save completed session and switch to completed state
      setCompletedSession(currentSession);
      setCurrentSession(null);
      // Clear session from localStorage on manual end
      saveSessionToLocalStorage(null);
      setIsWorkoutComplete(true);
      
      // Clear auto-pause timer when session ends
      clearAutoPauseTimer();
      // Clear client timer when session ends
      stopClientTimer();
      stopTimerSync();
      
      // Refresh test data status after session ends
      await checkForTestData();
      
      // Force chart refresh to show new data
      setChartKey(prev => prev + 1);
    } catch (error) {
      console.error('Failed to end workout:', error);
    }
  };

  const startNewGoal = () => {
    setIsWorkoutComplete(false);
    setCompletedSession(null);
    setIsStarted(false);
    setGoalInput('');
    setIsDefaultGoal(true);
    setIsGoalFocused(false);
    setIsTestingMode(false); // Reset testing mode to default "Off"
    // Clear any remaining auto-pause timer
    clearAutoPauseTimer();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (!currentSession && !isStarted) {
        setDailyGoal();
      } else if (!currentSession && isStarted) {
        startWorkout();
      } else {
        addReps();
      }
    }
  };

  if (loading) {
    return (
      <div className="workout-container">
        <div className="goal-setup">
          <h1 className="welcome-text">Loading...</h1>
        </div>
      </div>
    );
  }

  // Testing controls component with conditional back button
  const TestingControls = () => (
    <div className="testing-controls">
      {/* Only show back button when NOT in active session */}
      {currentSession?.status !== "active" && (
        <button className="back-btn" onClick={handleBackClick}>
          ✕
        </button>
      )}
      <div className="testing-controls-right">
        {!currentSession && !isWorkoutComplete ? (
          // Show toggle only when no active session (session creation)
          <div className="testing-toggle">
            <span className="testing-label">Test:</span>
            <div className="toggle-container">
              <button 
                className={`toggle-option ${!isTestingMode ? 'active' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (isTestingMode) {
                    toggleTestingMode();
                  }
                }}
              >
                Off
              </button>
              <button 
                className={`toggle-option ${isTestingMode ? 'active' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!isTestingMode) {
                    toggleTestingMode();
                  }
                }}
              >
                On
              </button>
            </div>
          </div>
        ) : (
          // Show mode status when session is active or on completion screen (read-only)
          <div className="testing-mode-status">
            <span className="mode-label">
              Mode: {(currentSession?.testing === true || completedSession?.testing === true) ? 'Test Training' : 'Real Training'}
            </span>
          </div>
        )}
        {hasTestData && (
          <button className="delete-test-btn" onClick={() => setShowDeleteConfirm(true)}>
            Delete Test Data
          </button>
        )}
      </div>
    </div>
  );

  // Confirmation modal
  const DeleteConfirmModal = () => {
    if (!showDeleteConfirm) return null;
    
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <h3>Delete Test Data?</h3>
          <p>This will permanently delete all workout sessions and daily summaries marked as testing data.</p>
          <div className="modal-actions">
            <button className="cancel-btn" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </button>
            <button className="confirm-btn" onClick={deleteTestData}>
              Delete Test Data
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Timer expired modal
  const TimerExpiredModal = () => {
    if (!showTimerExpiredModal || !currentSession) return null;
    
    const handleContinue = async () => {
      setShowTimerExpiredModal(false);
      // Timer is already expired and counting in overtime
      // No need to update session state as it's already handled in the countdown logic
    };

    const handleFinish = async () => {
      setShowTimerExpiredModal(false);
      // End the current session
      await endWorkout();
    };

    return (
      <div className="modal-overlay">
        <div className="modal-content timer-modal">
          <h3>⏰ Time's Up!</h3>
          <p>Your {Math.floor((currentSession.sessionLen || 0) / 60)}-minute timer has expired.</p>
          <p>You can finish your session now or continue with overtime tracking.</p>
          <div className="modal-actions">
            <button className="continue-btn" onClick={handleContinue}>
              Continue
            </button>
            <button className="finish-btn" onClick={handleFinish}>
              End Training
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Completed workout view
  if (isWorkoutComplete && completedSession) {
    const isComplete = completedSession.completed >= completedSession.goal;
    return (
      <div className="workout-container">
        <TestingControls />
        
        <div className="progress-display">
          <div className="remaining-label">
            Workout Complete!
          </div>
          <div className="main-number">
            🎉
          </div>
          <div className="goal-progress">
            {completedSession.completed.toLocaleString()} / {completedSession.goal.toLocaleString()}
          </div>
          <div className="achievement-text">
            {isComplete 
              ? `Congratulations! You achieved your goal of ${completedSession.goal.toLocaleString()} jumps!`
              : `Great workout! You completed ${completedSession.completed.toLocaleString()} jumps.`
            }
          </div>
        </div>
        
        <div className="new-goal-header">
          <button className="new-goal-btn" onClick={startNewGoal}>
            Set New Goal
          </button>
        </div>
        
        <WeeklyChart key={chartKey} />
        <DeleteConfirmModal />
        <TimerExpiredModal />
      </div>
    );
  }

  if (!currentSession) {
    if (!isStarted) {
      // Goal setting view
      return (
        <div className="workout-container">
          <TestingControls />
          <div className="goal-setup">
            {commonGoals.length > 0 && (
              <div className="common-goals-container">
                <div className="common-goals-label">Your common goals:</div>
                <div className="common-goals-buttons">
                  {commonGoals.map((goal) => (
                    <button
                      key={goal}
                      className="common-goal-btn"
                      onClick={() => {
                        setGoalInput(goal.toString());
                        setIsDefaultGoal(false);
                        if (goal >= 100) {
                          setIsStarted(true);
                        }
                      }}
                    >
                      {goal.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            <div className="goal-timer-setup">
              <div className="goal-column">
                <h1 className="section-question">What's your goal today?</h1>
                <div className="goal-input-container">
                  <input
                    ref={goalInputRef}
                    type="text"
                    className={`goal-input ${goalInputError ? 'error' : ''} ${isDefaultGoal ? 'default-value' : ''}`}
                    value={isDefaultGoal ? '4000' : goalInput}
                    onFocus={() => {
                      setIsGoalFocused(true);
                      if (isDefaultGoal) {
                        setGoalInput('');
                        setIsDefaultGoal(false);
                      }
                      setGoalInputError('');
                    }}
                    onBlur={() => {
                      setIsGoalFocused(false);
                      if (goalInput === '') {
                        setIsDefaultGoal(true);
                        setGoalInputError('');
                      }
                    }}
                    onChange={(e) => {
                      const value = e.target.value;
                      const validation = validateIntegerInput(value, 20000);
                      
                      // Always update the input value (for immediate feedback)
                      setGoalInput(value);
                      
                      // Clear error if input becomes valid, show error if invalid
                      if (validation.isValid || value === '') {
                        setGoalInputError('');
                      } else {
                        setGoalInputError(validation.error);
                      }
                    }}
                    onKeyPress={handleKeyPress}
                    placeholder=""
                  />
                </div>
                {goalInputError && (
                  <div className="error-message">
                    {goalInputError}
                  </div>
                )}
              </div>
              
              <div className="timer-column">
                <TimerPicker
                  value={timerMinutes}
                  onChange={setTimerMinutes}
                />
              </div>
            </div>
            
            <button className="set-goal-btn" onClick={setDailyGoal}>
              Set Goal
            </button>
          </div>
          <WeeklyChart key={chartKey} />
          <DeleteConfirmModal />
          <TimerExpiredModal />
        </div>
      );
    } else {
      // Ready to start view
      return (
        <div className="workout-container">
          <TestingControls />
          <div className="goal-setup">
            <h1 className="welcome-text">Goal: {(isDefaultGoal ? 4000 : parseInt(goalInput)).toLocaleString()} jumps</h1>
            <p className="completion-time">Completion time: {timerMinutes} mins</p>
            <p className="ready-text">Ready to start today's workout?</p>
            <button className="start-btn" onClick={startWorkout}>
              Start Training
            </button>
          </div>
          <WeeklyChart key={chartKey} />
          <DeleteConfirmModal />
          <TimerExpiredModal />
        </div>
      );
    }
  }

  const remaining = Math.max(0, currentSession.goal - currentSession.completed);
  const isComplete = currentSession.completed >= currentSession.goal;

  // Progress tracking view
  return (
    <div className="workout-container">
      <TestingControls />
      <div className="progress-display">
        {/* Side-by-side layout: Jumps remaining (left) + Timer (right) */}
        <div className="progress-timer-container">
          {/* Left side: Jumps remaining */}
          <div className="jumps-section">
            <div className="remaining-label">
              {isComplete ? 'Goal Achieved!' : 
               currentSession.status === "paused" ? 'Session Paused - Jumps remaining' : 
               'Jumps remaining'}
            </div>
            <div className="main-number">
              {isComplete ? '🎉' : remaining.toLocaleString()}
            </div>
            <div className="goal-progress">
              <span className="progress-text">
                {currentSession.completed.toLocaleString()} / {currentSession.goal.toLocaleString()}
              </span>
              {needsSync && currentSession.status === "active" && (
                <button 
                  className={`sync-btn ${isSyncing ? 'syncing' : ''}`} 
                  onClick={manualSync}
                  disabled={isSyncing}
                >
                  {isSyncing ? 'Syncing...' : 'Sync'}
                </button>
              )}
            </div>
          </div>
          
          {/* Right side: Circular Timer */}
          {currentSession.sessionLen && (
            <div className="timer-section">
              <CircularTimer
                remainTime={clientTimer?.remainTime || currentSession.remainTime || currentSession.sessionLen}
                totalTime={currentSession.sessionLen}
                isExpired={clientTimer?.isExpired || currentSession.timerExpired || false}
                extraTime={clientTimer?.extraTime || currentSession.extraTime || 0}
                isPaused={currentSession.status === 'paused'}
                onClick={handleTimerClick}
              />
            </div>
          )}
        </div>
        
        {isComplete && (
          <div className="achievement-text">
            Congratulations! You completed {currentSession.completed.toLocaleString()} jumps
          </div>
        )}
        
        {currentSession.status !== "paused" && (
          <div className="input-container">
            <input
              type="text"
              className={`rep-input ${isDefaultRep ? 'default-value' : ''} ${repInputError ? 'error' : ''}`}
              value={isDefaultRep ? '100' : repInput}
              onChange={(e) => {
                const value = e.target.value;
                
                // Allow empty input (will use default 100)
                if (value === '') {
                  setRepInput(value);
                  setIsDefaultRep(false);
                  setRepInputError('');
                  return;
                }
                
                const validation = validateIntegerInput(value);
                
                // Always update the input value for immediate feedback
                setRepInput(value);
                setIsDefaultRep(false);
                
                // Show/clear error based on validation
                if (validation.isValid) {
                  // Check if the input exceeds remaining goal
                  const reps = parseInt(validation.sanitizedValue);
                  const remainingGoal = currentSession.goal - currentSession.completed;
                  if (reps > remainingGoal) {
                    setRepInputError(`Cannot exceed remaining goal (${remainingGoal.toLocaleString()})`);
                  } else {
                    setRepInputError('');
                  }
                } else {
                  setRepInputError(validation.error);
                }
              }}
              onFocus={() => {
                setIsRepInputFocused(true);
                if (isDefaultRep) {
                  setRepInput('');
                  setIsDefaultRep(false);
                }
                setRepInputError('');
              }}
              onBlur={() => {
                // Delay hiding options to allow button clicks to process
                setTimeout(() => {
                  if (!isInteractingWithButtons) {
                    setIsRepInputFocused(false);
                  }
                }, 150);
                
                if (repInput === '') {
                  setIsDefaultRep(true);
                  setRepInputError('');
                }
              }}
              onKeyPress={handleKeyPress}
              placeholder=""
            />
            <button 
              className="add-btn" 
              onClick={addReps}
            >
              +
            </button>
          </div>
        )}
        
        {quickRepOptions.length > 0 && (isRepInputFocused || isInteractingWithButtons) && currentSession.status !== "paused" && (
          <div className="quick-rep-options">
            {quickRepOptions.map((repCount) => (
              <button
                key={repCount}
                className={`quick-rep-btn ${clickedButton === repCount ? 'clicked' : ''}`}
                onMouseDown={() => setIsInteractingWithButtons(true)}
                onMouseUp={() => {
                  addQuickReps(repCount);
                  setIsInteractingWithButtons(false);
                  setIsRepInputFocused(false); // Hide options after successful click
                }}
                onMouseLeave={() => setIsInteractingWithButtons(false)}
              >
                {repCount}
              </button>
            ))}
          </div>
        )}
        
        {repInputError && (
          <div className="error-message">
            {repInputError}
          </div>
        )}
        
        <div className="session-controls">
          {currentSession.status === "active" && (
            <div className="button-group-centered">
              <div className="button-row">
                <button className="session-btn session-btn--red" onClick={endWorkout}>
                  End Training
                </button>
              </div>
            </div>
          )}
          {currentSession.status === "paused" && (
            <div className="button-group-centered">
              <div className="button-row">
                {/* Only show Resume Training if no timer exists (click timer to resume when timer exists) */}
                {!currentSession.sessionLen && (
                  <button className="session-btn session-btn--green" onClick={resumeWorkout}>
                    Resume Training
                  </button>
                )}
                <button className="session-btn session-btn--blue" onClick={resumeToLastActivity}>
                  Resume to Last Activity
                </button>
                <button className="session-btn session-btn--red" onClick={endWorkout}>
                  End Training
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <WeeklyChart key={chartKey} />
      <DeleteConfirmModal />
      <TimerExpiredModal />
    </div>
  );
};

export default WorkoutTracker;