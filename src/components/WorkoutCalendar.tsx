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
  onDateSelect: (date: Date) => void;
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

  // Format date for API calls
  const formatDateForAPI = (date: Date): string => {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
  };

  // Get calendar days for current month (Monday start)
  const getCalendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    const firstDayOfMonth = new Date(year, month, 1);
    const startDate = new Date(firstDayOfMonth);
    
    // Adjust to start from Monday (0 = Sunday, 1 = Monday, etc.)
    const dayOfWeek = firstDayOfMonth.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday = 6 days back, Monday = 0 days back
    startDate.setDate(startDate.getDate() - daysFromMonday);
    
    const days: Date[] = [];
    const currentDate = new Date(startDate);
    
    // Generate 42 days (6 weeks) for consistent calendar grid
    for (let i = 0; i < 42; i++) {
      days.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return days;
  };

  // Load workout data for visible dates
  const loadWorkoutData = async (dates: Date[]) => {
    setLoading(true);
    const dataMap: Record<string, StrengthWorkout> = {};
    
    try {
      // Load data for each date (in practice, you might batch this)
      for (const date of dates) {
        const dateKey = formatDateForAPI(date);
        try {
          const response = await axios.get(`${API_BASE}/strength-workouts?date=${dateKey}`);
          if (response.data && response.data.exercises?.length > 0) {
            dataMap[dateKey] = response.data;
          }
        } catch (error) {
          // Silently handle individual date failures
          console.log('No data for date:', dateKey);
        }
      }
      
      setWorkoutData(dataMap);
    } catch (error) {
      console.error('Failed to load calendar workout data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load data when month changes
  useEffect(() => {
    const days = getCalendarDays();
    loadWorkoutData(days);
  }, [currentMonth, isTestingMode]);

  const handleDateClick = (date: Date) => {
    // Allow clicking any date - actions are limited based on date state
    onDateSelect(date);
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