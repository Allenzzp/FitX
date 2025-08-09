import React, { useState, useEffect } from 'react';
import './WorkoutTracker.css';

interface DailyData {
  date: string;
  goal: number;
  completed: number;
}

const WorkoutTracker: React.FC = () => {
  const [dailyData, setDailyData] = useState<DailyData | null>(null);
  const [goalInput, setGoalInput] = useState('5000');
  const [repInput, setRepInput] = useState('100');

  const today = new Date().toDateString();

  useEffect(() => {
    // Check if user has set goal today
    const storedData = localStorage.getItem(`fitx-${today}`);
    if (storedData) {
      setDailyData(JSON.parse(storedData));
    }
  }, [today]);

  const setDailyGoal = () => {
    const goal = parseInt(goalInput);
    if (goal > 0) {
      const newData: DailyData = {
        date: today,
        goal: goal,
        completed: 0
      };
      setDailyData(newData);
      localStorage.setItem(`fitx-${today}`, JSON.stringify(newData));
    }
  };

  const addReps = () => {
    if (!dailyData) return;
    
    const reps = repInput === '' ? 100 : parseInt(repInput) || 100;
    if (reps > 0) {
      const updatedData = {
        ...dailyData,
        completed: dailyData.completed + reps
      };
      setDailyData(updatedData);
      localStorage.setItem(`fitx-${today}`, JSON.stringify(updatedData));
      setRepInput('100');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (!dailyData) {
        setDailyGoal();
      } else {
        addReps();
      }
    }
  };

  if (!dailyData) {
    // Goal setting view
    return (
      <div className="workout-container">
        <div className="goal-setup">
          <h1 className="welcome-text">What's your jump rope goal today?</h1>
          <div className="goal-input-container">
            <input
              type="number"
              className="goal-input"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="5000"
              autoFocus
            />
            <button className="set-goal-btn" onClick={setDailyGoal}>
              Set Goal
            </button>
          </div>
        </div>
      </div>
    );
  }

  const remaining = Math.max(0, dailyData.goal - dailyData.completed);
  const isComplete = dailyData.completed >= dailyData.goal;

  // Progress tracking view
  return (
    <div className="workout-container">
      <div className="progress-display">
        <div className="main-number">
          {isComplete ? '🎉' : remaining.toLocaleString()}
        </div>
        <div className="status-text">
          {isComplete 
            ? `Goal achieved! ${dailyData.completed.toLocaleString()} jumps completed`
            : `jumps remaining`
          }
        </div>
        <div className="completed-text">
          {dailyData.completed.toLocaleString()} / {dailyData.goal.toLocaleString()}
        </div>
        
        <div className="input-container">
          <input
            type="text"
            className="rep-input"
            value={repInput}
            onChange={(e) => {
              const value = e.target.value;
              if (value === '' || /^\d+$/.test(value)) {
                setRepInput(value);
              }
            }}
            onKeyPress={handleKeyPress}
            placeholder="100"
          />
          <button className="add-btn" onClick={addReps}>
            +
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkoutTracker;