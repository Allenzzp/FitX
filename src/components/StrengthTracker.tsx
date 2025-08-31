import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getExerciseOptions, getExerciseClass, ExerciseClassName } from '../utils/exerciseClasses';
import WorkoutCalendar from './WorkoutCalendar';
import './StrengthTracker.css';

interface WorkoutSet {
  reps: number;
  timestamp: string;
}

interface Exercise {
  exercise: string;
  sets: WorkoutSet[];
}

interface StrengthWorkout {
  _id?: string;
  date: string;
  exercises: Exercise[];
  testing?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const StrengthTracker: React.FC = () => {
  const navigate = useNavigate();
  const [todaysWorkout, setTodaysWorkout] = useState<StrengthWorkout | null>(null);
  const [isTestingMode, setIsTestingMode] = useState(false);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedExercises, setExpandedExercises] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedDateWorkout, setSelectedDateWorkout] = useState<StrengthWorkout | null>(null);

  const API_BASE = process.env.NODE_ENV === 'development' ? '/.netlify/functions' : '/.netlify/functions';
  
  // Get exercise options from classes (no database needed)
  const exerciseOptions = getExerciseOptions();
  
  // Calculate daily total for an exercise
  const calculateDailyTotal = (exercise: Exercise): number => {
    return exercise.sets.reduce((total, set) => total + set.reps, 0);
  };

  // Toggle expand/collapse for an exercise
  const toggleExerciseExpansion = (exerciseName: string) => {
    setExpandedExercises(prev => {
      const newSet = new Set(prev);
      if (newSet.has(exerciseName)) {
        newSet.delete(exerciseName);
      } else {
        newSet.add(exerciseName);
      }
      return newSet;
    });
  };

  // Format timestamp for display
  const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  // Handle date selection from calendar
  const handleDateSelect = async (date: Date) => {
    setSelectedDate(date);
    setExpandedExercises(new Set()); // Reset expanded state
    
    // Load workout data for selected date
    const dateString = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
    
    try {
      const response = await axios.get(`${API_BASE}/strength-workouts?date=${dateString}`);
      setSelectedDateWorkout(response.data || null);
      
      // If selected date is today, also update todaysWorkout
      const today = new Date();
      if (date.toDateString() === today.toDateString()) {
        setTodaysWorkout(response.data || null);
      }
    } catch (error) {
      console.error('Failed to load selected date workout:', error);
      setSelectedDateWorkout(null);
    }
  };

  // Get the workout to display (selected date or today)
  const getDisplayWorkout = (): StrengthWorkout | null => {
    const today = new Date();
    if (selectedDate.toDateString() === today.toDateString()) {
      return todaysWorkout;
    }
    return selectedDateWorkout;
  };

  // Check if selected date is in the 3-day edit window (today + 2 days back)
  const isInEditWindow = (): boolean => {
    const today = new Date();
    const daysDiff = Math.floor((today.getTime() - selectedDate.getTime()) / (1000 * 60 * 60 * 24));
    return daysDiff >= 0 && daysDiff <= 2;
  };

  const handleBackClick = () => {
    navigate('/');
  };

  const toggleTestingMode = () => {
    setIsTestingMode(!isTestingMode);
  };

  const handleAddWorkout = () => {
    setShowRecordModal(true);
  };

  // Handle editing a specific set
  const handleEditSet = (exerciseName: string, setIndex: number, set: WorkoutSet) => {
    const newReps = prompt(`Edit reps for Set ${setIndex + 1}:`, set.reps.toString());
    if (newReps && parseInt(newReps) > 0) {
      updateSet(exerciseName, set.timestamp, parseInt(newReps));
    }
  };

  // Handle deleting a specific set  
  const handleDeleteSet = async (exerciseName: string, setIndex: number, set: WorkoutSet) => {
    if (confirm(`Delete Set ${setIndex + 1} (${set.reps} reps)?`)) {
      await deleteSet(exerciseName, set.timestamp);
    }
  };

  // Update a set's reps value using timestamp targeting
  const updateSet = async (exerciseName: string, timestamp: string, newReps: number) => {
    try {
      const workout = getDisplayWorkout();
      if (!workout || !workout._id) {
        return;
      }

      // Create updated workout data using timestamp targeting
      const updatedWorkout = {
        ...workout,
        exercises: workout.exercises.map(exercise => {
          if (exercise.exercise === exerciseName) {
            return {
              ...exercise,
              sets: exercise.sets.map(set => 
                set.timestamp === timestamp ? { ...set, reps: newReps } : set
              )
            };
          }
          return exercise;
        })
      };

      // Send PUT request to update the workout
      const response = await axios.put(`${API_BASE}/strength-workouts?id=${workout._id}`, updatedWorkout);
      
      // Update local state
      const today = new Date();
      if (selectedDate.toDateString() === today.toDateString()) {
        setTodaysWorkout(response.data);
      } else {
        setSelectedDateWorkout(response.data);
      }
    } catch (error) {
      console.error('Failed to update set:', error);
      alert('Failed to update set. Please try again.');
    }
  };

  // Delete a specific set using timestamp targeting
  const deleteSet = async (exerciseName: string, timestamp: string) => {
    try {
      const workout = getDisplayWorkout();
      if (!workout || !workout._id) {
        return;
      }

      // Create updated workout data without the deleted set using timestamp targeting
      const updatedWorkout = {
        ...workout,
        exercises: workout.exercises.map(exercise => {
          if (exercise.exercise === exerciseName) {
            const filteredSets = exercise.sets.filter(set => set.timestamp !== timestamp);
            return {
              ...exercise,
              sets: filteredSets
            };
          }
          return exercise;
        }).filter(exercise => exercise.sets.length > 0) // Remove exercises with no sets
      };

      // Send PUT request to update the workout
      const response = await axios.put(`${API_BASE}/strength-workouts?id=${workout._id}`, updatedWorkout);
      
      // Update local state
      const today = new Date();
      if (selectedDate.toDateString() === today.toDateString()) {
        setTodaysWorkout(response.data);
      } else {
        setSelectedDateWorkout(response.data);
      }
    } catch (error) {
      console.error('Failed to delete set:', error);
      alert('Failed to delete set. Please try again.');
    }
  };

  // Fetch today's workout only (exercise definitions come from classes)
  useEffect(() => {
    const fetchData = async () => {
      try {
        const workoutResponse = await axios.get(`${API_BASE}/strength-workouts`);
        setTodaysWorkout(workoutResponse.data);
        
        // Initialize selected date workout (today by default)
        handleDateSelect(new Date());
      } catch (error) {
        console.error('Failed to fetch workout data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="strength-container">
        <div className="loading-state">
          <h2>Loading...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="strength-container">
      {/* Header with back button */}
      <div className="strength-header">
        <button className="back-btn" onClick={handleBackClick}>
          ✕
        </button>
        <div className="testing-controls">
          <div className="testing-toggle">
            <span className="testing-label">Test:</span>
            <div className="toggle-container">
              <button 
                className={`toggle-option ${!isTestingMode ? 'active' : ''}`}
                onClick={() => !isTestingMode || toggleTestingMode()}
              >
                Off
              </button>
              <button 
                className={`toggle-option ${isTestingMode ? 'active' : ''}`}
                onClick={() => isTestingMode || toggleTestingMode()}
              >
                On
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Top half - Workout records area */}
      <div className="workout-records-area">
        {/* Date indicator with edit status */}
        <div className={`selected-date-indicator ${isInEditWindow() ? 'editable' : 'historical'}`}>
          {selectedDate.toLocaleDateString('en-US', { 
            weekday: 'long', 
            month: 'long', 
            day: 'numeric' 
          })}
          {!isInEditWindow() && <span className="date-status">View Only</span>}
        </div>
        
        {/* Display selected date exercises or REST */}
        {getDisplayWorkout()?.exercises && getDisplayWorkout()!.exercises.length > 0 ? (
          <div className="exercise-sentences">
            {getDisplayWorkout()!.exercises.map((exercise, index) => {
              const isExpanded = expandedExercises.has(exercise.exercise);
              return (
                <div key={`${exercise.exercise}-${index}`} className="exercise-sentence">
                  <div 
                    className="sentence-text"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleExerciseExpansion(exercise.exercise);
                    }}
                  >
                    {exercise.exercise}: {calculateDailyTotal(exercise)} reps
                    <span className={`expand-arrow ${isExpanded ? 'expanded' : ''}`}>
                      ↓
                    </span>
                  </div>
                  
                  {isExpanded && (
                    <div className="sets-breakdown">
                      {exercise.sets.map((set, setIndex) => (
                        <div key={`${exercise.exercise}-set-${setIndex}`} className="set-item">
                          <span className="set-number">Set {setIndex + 1}:</span>
                          <span className="set-reps">{set.reps} reps</span>
                          <span className="set-time">{formatTime(set.timestamp)}</span>
                          {isInEditWindow() && getDisplayWorkout()?._id && (
                            <div className="set-actions">
                              <button 
                                className="set-edit-btn"
                                onClick={() => handleEditSet(exercise.exercise, setIndex, set)}
                              >
                                ✎
                              </button>
                              <button 
                                className="set-delete-btn"
                                onClick={() => handleDeleteSet(exercise.exercise, setIndex, set)}
                              >
                                ×
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : !isInEditWindow() && (
          <div className="rest-display">
            <div className="rest-text">REST</div>
          </div>
        )}
        
        {/* Add workout button - only for editable dates */}
        {isInEditWindow() && (
          <div className="add-workout-container">
            <button className="add-workout-btn" onClick={handleAddWorkout}>
              +
            </button>
          </div>
        )}
      </div>

      {/* Bottom half - Calendar area */}
      <div className="calendar-area">
        <WorkoutCalendar 
          selectedDate={selectedDate}
          onDateSelect={handleDateSelect}
          isTestingMode={isTestingMode}
        />
      </div>

      {/* Record Workout Modal */}
      {showRecordModal && (
        <RecordWorkoutModal 
          exerciseOptions={exerciseOptions}
          isTestingMode={isTestingMode}
          onClose={() => setShowRecordModal(false)}
          onRecord={async (exerciseName: ExerciseClassName, value: number) => {
            try {
              const ExerciseClass = getExerciseClass(exerciseName);
              const exerciseInstance = new ExerciseClass(value);
              
              const response = await axios.post(`${API_BASE}/strength-workouts`, {
                exercise: ExerciseClass.exerciseName,
                reps: exerciseInstance.reps,
                testing: isTestingMode,
                date: new Date().toISOString()
              });
              
              setTodaysWorkout(response.data);
              setShowRecordModal(false);
            } catch (error) {
              console.error('Failed to record workout:', error);
            }
          }}
        />
      )}
    </div>
  );
};

// Record Workout Modal Component
interface RecordWorkoutModalProps {
  exerciseOptions: ReturnType<typeof getExerciseOptions>;
  isTestingMode: boolean;
  onClose: () => void;
  onRecord: (exerciseName: ExerciseClassName, value: number) => void;
}

const RecordWorkoutModal: React.FC<RecordWorkoutModalProps> = ({
  exerciseOptions,
  isTestingMode,
  onClose,
  onRecord
}) => {
  const [selectedExercise, setSelectedExercise] = useState<ExerciseClassName | null>(null);
  const [inputValue, setInputValue] = useState('');

  const handleExerciseSelect = (exerciseName: ExerciseClassName) => {
    setSelectedExercise(exerciseName);
  };

  const handleRecord = () => {
    if (!selectedExercise || !inputValue) return;
    
    const ExerciseClass = getExerciseClass(selectedExercise);
    if (!ExerciseClass.validate(inputValue)) {
      return; // Invalid input
    }

    onRecord(selectedExercise, parseInt(inputValue));
  };

  const selectedExerciseClass = selectedExercise ? getExerciseClass(selectedExercise) : null;

  return (
    <div className="modal-overlay">
      <div className="modal-content record-modal">
        <h3>Record Workout</h3>
        
        {!selectedExercise ? (
          <div className="exercise-selection">
            <p>Choose workout:</p>
            <div className="exercise-options">
              {exerciseOptions.map(option => (
                <button
                  key={option.key}
                  className="exercise-option-btn"
                  onClick={() => handleExerciseSelect(option.key)}
                >
                  {option.name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="exercise-input">
            <p>Recording: <strong>{selectedExerciseClass?.exerciseName}</strong></p>
            
            <div className="input-group">
              <label>{selectedExerciseClass?.inputLabel}:</label>
              <input
                type="number"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={selectedExerciseClass?.inputLabel}
                autoFocus
              />
            </div>
            
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setSelectedExercise(null)}>
                Back
              </button>
              <button 
                className="confirm-btn" 
                onClick={handleRecord}
                disabled={!inputValue}
              >
                Record
              </button>
            </div>
          </div>
        )}
        
        {!selectedExercise && (
          <div className="modal-actions">
            <button className="cancel-btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default StrengthTracker;