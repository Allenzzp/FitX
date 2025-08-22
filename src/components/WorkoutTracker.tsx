import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import WeeklyChart from './WeeklyChart';
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
}

const WorkoutTracker: React.FC = () => {
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

  const API_BASE = process.env.NODE_ENV === 'development' ? '/.netlify/functions' : '/.netlify/functions';
  

  useEffect(() => {
    // Run backup cleanup check first, then check for session recovery and fetch current session
    runBackupCleanup().then(() => {
      checkSessionRecovery();
      fetchCurrentSession();
      checkForTestData();
      fetchCommonGoals();
    });
  }, []);

  const toggleTestingMode = async () => {
    const newMode = !isTestingMode;
    setIsTestingMode(newMode);
    // Don't persist to localStorage - always default to Off on page load
    
    // Refresh test data status when toggling mode
    await checkForTestData();
  };

  const checkSessionRecovery = () => {
    try {
      const sessionData = localStorage.getItem('activeSession');
      if (sessionData) {
        const { sessionId, timestamp, status } = JSON.parse(sessionData);
        const now = Date.now();
        const timeDiff = now - timestamp;
        const tenMinutes = 10 * 60 * 1000;
        
        // If within 10 minutes and session was active, keep UI in active state
        // If more than 10 minutes or session was paused, will be handled by fetchCurrentSession
        if (timeDiff <= tenMinutes && status === 'active') {
          console.log('Recovering active session within 10 minutes');
          setIsStarted(true);
        }
      }
    } catch (error) {
      console.error('Failed to recover session:', error);
      // Clear invalid session data
      localStorage.removeItem('activeSession');
    }
  };

  const saveSessionToLocalStorage = (session: TrainingSession | null) => {
    if (session && (session.status === 'active' || session.status === 'paused')) {
      localStorage.setItem('activeSession', JSON.stringify({
        sessionId: session._id,
        timestamp: Date.now(),
        status: session.status
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
      // Delete test training sessions
      await axios.delete(`${API_BASE}/training-sessions?deleteTestData=true`);
      // Delete test daily summaries
      await axios.delete(`${API_BASE}/daily-summaries?deleteTestData=true`);
      
      setHasTestData(false);
      setShowDeleteConfirm(false);
      console.log('Test data deleted successfully');
      
      // Refresh current session in case it was a test session
      await fetchCurrentSession();
      
      // Force chart refresh by changing its key
      setChartKey(prev => prev + 1);
    } catch (error) {
      console.error('Failed to delete test data:', error);
    }
  };

  const fetchCurrentSession = async () => {
    try {
      const response = await axios.get(`${API_BASE}/training-sessions`);
      if (response.data) {
        setCurrentSession(response.data);
        setIsStarted(true);
        // Set sync point based on current progress for existing sessions
        setLastSyncPoint(Math.floor(response.data.completed / 500) * 500);
        // Start auto-pause timer if session is active
        if (response.data.status === "active") {
          startAutoPauseTimer(response.data._id);
        }
        // Save session to localStorage for recovery
        saveSessionToLocalStorage(response.data);
      } else {
        // No active session, clear localStorage
        saveSessionToLocalStorage(null);
      }
    } catch (error) {
      console.error('Failed to fetch current session:', error);
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
        testing: isTestingMode,
        startTime: now.toISOString(),
        createdAt: now.toISOString()
      });
      setCurrentSession(response.data);
      setLastSyncPoint(0); // Reset sync point for new session
      // Start auto-pause timer for new session
      startAutoPauseTimer(response.data._id);
      // Save new session to localStorage
      saveSessionToLocalStorage(response.data);
      // Track goal usage for common goals feature
      await trackGoalUsage(goal);
    } catch (error) {
      console.error('Failed to start workout:', error);
    }
  };

  const addReps = async () => {
    if (!currentSession) return;
    
    const remainingGoal = currentSession.goal - currentSession.completed;
    
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
    
    // Check if reps exceeds remaining goal
    if (reps > remainingGoal) {
      setRepInputError(`Cannot exceed remaining goal (${remainingGoal.toLocaleString()})`);
      return;
    }
    
    // Clear any previous errors
    setRepInputError('');
    if (reps > 0) {
      try {
        const newCompleted = currentSession.completed + reps;
        const response = await axios.put(`${API_BASE}/training-sessions?id=${currentSession._id}`, {
          action: 'updateProgress',
          completed: newCompleted
        });
        setCurrentSession(response.data);
        // Update localStorage with new progress
        saveSessionToLocalStorage(response.data);
        setRepInput('');
        setIsDefaultRep(true);
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
          // Final sync: update progress AND end session in one operation
          try {
            const now = new Date();
            await axios.put(`${API_BASE}/training-sessions?id=${currentSession._id}`, {
              action: 'finalSync',
              completed: newCompleted,
              endTime: now.toISOString()
            });
            
            // Create daily summary with correct final count
            const today = new Date();
            const localDate = today.toLocaleDateString("en-CA");
            // Create timezone-aware date that preserves the local date
            const localMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
            await axios.post(`${API_BASE}/daily-summaries`, {
              date: localMidnight,
              totalJumps: newCompleted,
              sessionsCount: 1,
              testing: isTestingMode,
              createdAt: today.toISOString(),
              updatedAt: today.toISOString()
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
      } catch (error) {
        console.error('Failed to update progress:', error);
      }
    }
  };

  const manualSync = async () => {
    if (!currentSession || isSyncing || currentSession.status !== "active") return;
    
    setIsSyncing(true);
    try {
      await axios.put(`${API_BASE}/training-sessions?id=${currentSession._id}`, {
        action: 'updateProgress',
        completed: currentSession.completed
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
        await axios.put(`${API_BASE}/training-sessions?id=${sessionId}`, {
          action: 'autoPause'
        });
        // Refresh current session to get updated status
        await fetchCurrentSession();
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
      const response = await axios.put(`${API_BASE}/training-sessions?id=${currentSession._id}`, {
        action: 'pause'
      });
      setCurrentSession(response.data);
      // Update localStorage with paused status
      saveSessionToLocalStorage(response.data);
      clearAutoPauseTimer(); // Stop auto-pause timer when manually paused
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
    } catch (error) {
      console.error('Failed to resume workout:', error);
    }
  };

  const endWorkout = async () => {
    if (!currentSession) return;
    
    try {
      const now = new Date();
      
      // End the session (for manual end workout button)
      await axios.put(`${API_BASE}/training-sessions?id=${currentSession._id}`, {
        action: 'end',
        endTime: now.toISOString()
      });
      
      // Create daily summary with current progress
      const today = new Date();
      const localDate = today.toLocaleDateString("en-CA");
      // Create timezone-aware date that preserves the local date
      const localMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      await axios.post(`${API_BASE}/daily-summaries`, {
        date: localMidnight,
        totalJumps: currentSession.completed,
        sessionsCount: 1,
        testing: isTestingMode,
        createdAt: today.toISOString(),
        updatedAt: today.toISOString()
      });
      
      // Save completed session and switch to completed state
      setCompletedSession(currentSession);
      setCurrentSession(null);
      // Clear session from localStorage on manual end
      saveSessionToLocalStorage(null);
      setIsWorkoutComplete(true);
      
      // Clear auto-pause timer when session ends
      clearAutoPauseTimer();
      
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

  // Testing controls component
  const TestingControls = () => (
    <div className="testing-controls">
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
      {hasTestData && (
        <button className="delete-test-btn" onClick={() => setShowDeleteConfirm(true)}>
          Delete Test Data
        </button>
      )}
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
            <h1 className="welcome-text">What's your jump rope goal today?</h1>
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
                autoFocus
              />
              <button className="set-goal-btn" onClick={setDailyGoal}>
                Set Goal
              </button>
            </div>
            {goalInputError && (
              <div className="error-message">
                {goalInputError}
              </div>
            )}
          </div>
          <WeeklyChart key={chartKey} />
          <DeleteConfirmModal />
        </div>
      );
    } else {
      // Ready to start view
      return (
        <div className="workout-container">
          <TestingControls />
          <div className="goal-setup">
            <h1 className="welcome-text">Goal: {(isDefaultGoal ? 4000 : parseInt(goalInput)).toLocaleString()} jumps</h1>
            <p className="ready-text">Ready to start today's workout?</p>
            <button className="start-btn" onClick={startWorkout}>
              Start Training
            </button>
          </div>
          <WeeklyChart key={chartKey} />
          <DeleteConfirmModal />
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
        <div className="remaining-label">
          {isComplete ? 'Goal Achieved!' : 
           currentSession.status === "paused" ? 'Session Paused - Jumps remaining' : 
           'Jumps remaining'}
        </div>
        <div className="main-number">
          {isComplete ? '🎉' : remaining.toLocaleString()}
        </div>
        <div className="progress-sync-container">
          <div className="goal-progress">
            {currentSession.completed.toLocaleString()} / {currentSession.goal.toLocaleString()}
          </div>
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
        {isComplete && (
          <div className="achievement-text">
            Congratulations! You completed {currentSession.completed.toLocaleString()} jumps
          </div>
        )}
        
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
              if (isDefaultRep) {
                setRepInput('');
                setIsDefaultRep(false);
              }
              setRepInputError('');
            }}
            onBlur={() => {
              if (repInput === '') {
                setIsDefaultRep(true);
                setRepInputError('');
              }
            }}
            onKeyPress={handleKeyPress}
            placeholder=""
            disabled={currentSession.status === "paused"}
          />
          <button 
            className="add-btn" 
            onClick={addReps}
            disabled={currentSession.status === "paused"}
          >
            +
          </button>
        </div>
        
        {repInputError && (
          <div className="error-message">
            {repInputError}
          </div>
        )}
        
        <div className="session-controls">
          {currentSession.status === "active" && (
            <button className="pause-workout-btn" onClick={pauseWorkout}>
              Pause Training
            </button>
          )}
          {currentSession.status === "paused" && (
            <button className="resume-workout-btn" onClick={resumeWorkout}>
              Resume Training
            </button>
          )}
          <button className="end-workout-btn" onClick={endWorkout}>
            End Training
          </button>
        </div>
      </div>
      
      <WeeklyChart key={chartKey} />
      <DeleteConfirmModal />
    </div>
  );
};

export default WorkoutTracker;