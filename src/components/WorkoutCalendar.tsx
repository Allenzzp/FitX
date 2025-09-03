import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './WorkoutCalendar.css';

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

interface WorkoutCalendarProps {
  selectedDate: Date;
  onDateSelect: (date: Date, workoutData?: StrengthWorkout | null) => void;
  isTestingMode: boolean;
}

const WorkoutCalendar: React.FC<WorkoutCalendarProps> = ({
  selectedDate,
  onDateSelect,
  isTestingMode
}) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [workoutData, setWorkoutData] = useState<Record<string, StrengthWorkout>>({});
  const [loading, setLoading] = useState(false);

  const API_BASE = process.env.NODE_ENV === 'development' ? '/.netlify/functions' : '/.netlify/functions';

  // Get date state based on 3-day edit window (事不过三)
  const getDateState = (date: Date): 'TODAY' | 'EDIT_WINDOW' | 'HISTORICAL' => {
    const today = new Date();
    const daysDiff = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff === 0) return 'TODAY';
    if (daysDiff <= 2) return 'EDIT_WINDOW';
    return 'HISTORICAL';
  };

  // Format date for local date mapping (creates consistent key for local dates)
  const formatDateForAPI = (date: Date): string => {
    // Create a local date key without timezone conversion
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
  };

  // Get calendar days for current month (Monday start)
  const getCalendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    
    const startDate = new Date(firstDayOfMonth);
    
    // Adjust to start from Monday (0 = Sunday, 1 = Monday, etc.)
    const dayOfWeek = firstDayOfMonth.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startDate.setDate(startDate.getDate() - daysFromMonday);
    
    const days: Date[] = [];
    const currentDate = new Date(startDate);
    
    // Add dates until we complete the month
    while (currentDate <= lastDayOfMonth || currentDate.getDay() !== 1) {
      days.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
      
      // Stop if we're in the next month and it's Monday (start of a new week)
      if (currentDate.getMonth() !== month && currentDate.getDay() === 1) {
        break;
      }
    }
    
    return days;
  };

  // Load workout data for the entire month range using proper local-to-UTC boundaries
  const loadWorkoutData = async (dates: Date[]) => {
    setLoading(true);
    const dataMap: Record<string, StrengthWorkout> = {};
    
    try {
      // Create proper month boundaries in local time (Vancouver)
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();
      
      // Start: First day of month at 00:00:00 local time
      const monthStart = new Date(year, month, 1, 0, 0, 0, 0);
      
      // End: Last day of month at 23:59:59 local time  
      const lastDay = new Date(year, month + 1, 0).getDate(); // Get last day of month
      const monthEnd = new Date(year, month, lastDay, 23, 59, 59, 999);
      
      // Convert local boundaries to UTC for database query
      const startUTC = monthStart.toISOString();
      const endUTC = monthEnd.toISOString();
      
      // Query for all workouts in this UTC date range
      const response = await axios.get(`${API_BASE}/strength-workouts?startDate=${startUTC}&endDate=${endUTC}`);
      
      if (response.data && Array.isArray(response.data)) {
        // Map each workout to its local date for easy lookup
        response.data.forEach((workout: StrengthWorkout) => {
          if (workout && workout.exercises && workout.exercises.length > 0) {
            // Convert UTC date back to local date for display mapping
            const workoutLocalDate = new Date(workout.date);
            const localDateKey = formatDateForAPI(workoutLocalDate);
            dataMap[localDateKey] = workout;
          }
        });
      }
      setWorkoutData(dataMap);
    } catch (error) {
      console.error('Failed to load calendar workout data:', error);
      setWorkoutData({});
    } finally {
      setLoading(false);
    }
  };

  // Load data when month changes
  useEffect(() => {
    const days = getCalendarDays();
    loadWorkoutData(days);
  }, [currentMonth, isTestingMode]);

  // After data loads, trigger initial date selection if no date selected yet
  useEffect(() => {
    const dataKeys = Object.keys(workoutData);
    if (dataKeys.length > 0) {
      // Find today's data if available, otherwise keep current selection
      const today = new Date();
      const todayKey = formatDateForAPI(today);
      const todayWorkout = workoutData[todayKey];
      
      // If viewing current month and today has data, auto-select today
      if (today.getMonth() === currentMonth.getMonth() && 
          today.getFullYear() === currentMonth.getFullYear()) {
        onDateSelect(today, todayWorkout);
      }
    }
  }, [workoutData]);

  const handleDateClick = (date: Date) => {
    // Allow clicking any date - actions are limited based on date state
    // Pass the pre-loaded workout data for this date to avoid additional API calls
    const dateKey = formatDateForAPI(date);
    const workoutForDate = workoutData[dateKey] || null;
    onDateSelect(date, workoutForDate);
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev);
      newMonth.setMonth(prev.getMonth() + (direction === 'next' ? 1 : -1));
      return newMonth;
    });
  };

  const isToday = (date: Date): boolean => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isSelected = (date: Date): boolean => {
    return date.toDateString() === selectedDate.toDateString();
  };

  const isCurrentMonth = (date: Date): boolean => {
    return date.getMonth() === currentMonth.getMonth();
  };

  const hasWorkoutData = (date: Date): boolean => {
    // Simply check if we have workout data for this date (already mapped by local date)
    const dateKey = formatDateForAPI(date);
    const workout = workoutData[dateKey];
    return workout && workout.exercises && workout.exercises.length > 0;
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="workout-calendar">
      {/* Calendar Header */}
      <div className="calendar-header">
        <button 
          className="nav-btn"
          onClick={() => navigateMonth('prev')}
        >
          &lt;
        </button>
        
        <h3 className="month-title">
          {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </h3>
        
        <button 
          className="nav-btn"
          onClick={() => navigateMonth('next')}
        >
          &gt;
        </button>
      </div>

      {/* Week Days Header */}
      <div className="weekdays-header">
        {weekDays.map(day => (
          <div key={day} className="weekday">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="calendar-grid">
        {getCalendarDays().map((date, index) => {
          const dateState = getDateState(date);
          const hasWorkout = hasWorkoutData(date);
          
          return (
            <div
              key={index}
              className={`calendar-day 
                ${!isCurrentMonth(date) ? 'other-month' : ''} 
                ${isToday(date) ? 'today' : ''} 
                ${isSelected(date) ? 'selected' : ''}
                ${hasWorkout ? 'has-workout' : ''}
              `}
              onClick={() => handleDateClick(date)}
            >
              <span className="day-number">{date.getDate()}</span>
              {hasWorkout && <span className="workout-dot"></span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WorkoutCalendar;