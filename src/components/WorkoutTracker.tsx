import React, { useState, useEffect } from 'react';
import axios from 'axios';
import WeeklyChart from './WeeklyChart';
import './WorkoutTracker.css';

interface TrainingSession {
  _id: string;
  goal: number;
  completed: number;
  startTime: string;
  endTime: string | null;
  isActive: boolean;
  isPaused: boolean;
  pausedAt: string | null;
  totalPausedDuration: number;
}

interface DailySummary {
  _id: string;
  date: string;
  totalJumps: number;
  sessionsCount: number;
}

const WorkoutTracker: React.FC = () => {
  const [currentSession, setCurrentSession] = useState<TrainingSession | null>(null);
  const [goalInput, setGoalInput] = useState('4000');
  const [repInput, setRepInput] = useState('100');
  const [isDefaultRep, setIsDefaultRep] = useState(true);
  const [isStarted, setIsStarted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [needsSync, setNeedsSync] = useState(false);
  const [isWorkoutComplete, setIsWorkoutComplete] = useState(false);
  const [completedSession, setCompletedSession] = useState<TrainingSession | null>(null);
  const [isTestingMode, setIsTestingMode] = useState(false); // Always default to Off
  const [hasTestData, setHasTestData] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const API_BASE = process.env.NODE_ENV === 'development' ? '/.netlify/functions' : '/.netlify/functions';
  

  useEffect(() => {
    fetchCurrentSession();
    checkForTestData();
  }, []);

  const toggleTestingMode = async () => {
    const newMode = !isTestingMode;
    setIsTestingMode(newMode);
    // Don't persist to localStorage - always default to Off on page load
    
    // Refresh test data status when toggling mode
    await checkForTestData();
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
      }
    } catch (error) {
      console.error('Failed to fetch current session:', error);
    } finally {
      setLoading(false);
    }
  };

  const setDailyGoal = () => {
    const goal = parseInt(goalInput);
    if (goal >= 100) {
      setIsStarted(true);
    }
  };

  const startWorkout = async () => {
    try {
      const goal = parseInt(goalInput);
      const now = new Date();
      const response = await axios.post(`${API_BASE}/training-sessions`, {
        goal: goal,
        testing: isTestingMode,
        startTime: now.toISOString(),
        createdAt: now.toISOString()
      });
      setCurrentSession(response.data);
    } catch (error) {
      console.error('Failed to start workout:', error);
    }
  };

  const addReps = async () => {
    if (!currentSession) return;
    
    const reps = repInput === '' ? 100 : parseInt(repInput) || 100;
    if (reps > 0) {
      try {
        const newCompleted = currentSession.completed + reps;
        const response = await axios.put(`${API_BASE}/training-sessions?id=${currentSession._id}`, {
          action: 'updateProgress',
          completed: newCompleted
        });
        setCurrentSession(response.data);
        setRepInput('100');
        setIsDefaultRep(true);
        setNeedsSync(true); // Mark as needing sync after progress update
        
        // Auto-sync every 500 reps (but not when goal is reached, as endWorkout will handle that)
        if (newCompleted % 500 === 0 && newCompleted < currentSession.goal) {
          console.log('Auto-sync triggered at', newCompleted, 'reps');
          // Actually perform the sync to database
          try {
            await axios.put(`${API_BASE}/training-sessions?id=${currentSession._id}`, {
              action: 'updateProgress',
              completed: newCompleted
            });
            setNeedsSync(false); // Auto-sync completed, reset sync state
            console.log('Auto-sync completed for', newCompleted, 'reps');
          } catch (error) {
            console.error('Auto-sync failed:', error);
            // Keep needsSync as true if auto-sync fails
          }
        }
        
        // Auto-complete session when goal is reached
        if (newCompleted >= currentSession.goal) {
          setTimeout(() => {
            endWorkout();
          }, 1000); // Small delay to let user see the achievement
        }
      } catch (error) {
        console.error('Failed to update progress:', error);
      }
    }
  };

  const manualSync = async () => {
    if (!currentSession || isSyncing) return;
    
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

  const endWorkout = async () => {
    if (!currentSession) return;
    
    try {
      const now = new Date();
      await axios.put(`${API_BASE}/training-sessions?id=${currentSession._id}`, {
        action: 'end',
        endTime: now.toISOString()
      });
      
      // Update daily summary (using user's local timezone)
      const today = new Date();
      const localDate = today.toLocaleDateString("en-CA"); // YYYY-MM-DD format in user's timezone
      await axios.post(`${API_BASE}/daily-summaries`, {
        date: `${localDate}T00:00:00.000`,
        totalJumps: currentSession.completed,
        sessionsCount: 1,
        testing: isTestingMode,
        createdAt: today.toISOString(),
        updatedAt: today.toISOString()
      });
      
      // Save completed session and switch to completed state
      setCompletedSession(currentSession);
      setCurrentSession(null);
      setIsWorkoutComplete(true);
      
      // Refresh test data status after session ends
      await checkForTestData();
    } catch (error) {
      console.error('Failed to end workout:', error);
    }
  };

  const startNewGoal = () => {
    setIsWorkoutComplete(false);
    setCompletedSession(null);
    setIsStarted(false);
    setGoalInput('4000');
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
            onClick={() => setIsTestingMode(false)}
          >
            Off
          </button>
          <button 
            className={`toggle-option ${isTestingMode ? 'active' : ''}`}
            onClick={() => setIsTestingMode(true)}
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
        <div className="new-goal-header">
          <button className="new-goal-btn" onClick={startNewGoal}>
            New Goal
          </button>
        </div>
        
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
        
        <WeeklyChart />
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
            <div className="goal-input-container">
              <input
                type="number"
                className="goal-input"
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="4000"
                min="100"
                autoFocus
              />
              <button className="set-goal-btn" onClick={setDailyGoal}>
                Set Goal
              </button>
            </div>
          </div>
          <WeeklyChart />
          <DeleteConfirmModal />
        </div>
      );
    } else {
      // Ready to start view
      return (
        <div className="workout-container">
          <TestingControls />
          <div className="goal-setup">
            <h1 className="welcome-text">Goal: {parseInt(goalInput).toLocaleString()} jumps</h1>
            <p className="ready-text">Ready to start today's workout?</p>
            <button className="start-btn" onClick={startWorkout}>
              Start Training
            </button>
          </div>
          <WeeklyChart />
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
          {isComplete ? 'Goal Achieved!' : 'Jumps remaining'}
        </div>
        <div className="main-number">
          {isComplete ? '🎉' : remaining.toLocaleString()}
        </div>
        <div className="progress-sync-container">
          <div className="goal-progress">
            {currentSession.completed.toLocaleString()} / {currentSession.goal.toLocaleString()}
          </div>
          {needsSync && (
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
            className={`rep-input ${isDefaultRep ? 'default-value' : ''}`}
            value={repInput}
            onChange={(e) => {
              const value = e.target.value;
              if (value === '' || /^\d+$/.test(value)) {
                setRepInput(value);
                setIsDefaultRep(false);
              }
            }}
            onKeyPress={handleKeyPress}
            placeholder="100"
          />
          <button className="add-btn" onClick={addReps}>
            +
          </button>
        </div>
        
        <div className="session-controls">
          <button className="end-workout-btn" onClick={endWorkout}>
            End Training
          </button>
        </div>
      </div>
      
      <WeeklyChart />
      <DeleteConfirmModal />
    </div>
  );
};

export default WorkoutTracker;