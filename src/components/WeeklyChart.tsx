import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './WeeklyChart.css';

interface DailySummary {
  _id: string;
  date: string;
  totalJumps: number;
  sessionsCount: number;
}

const WeeklyChart: React.FC = () => {
  const [weeklyData, setWeeklyData] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [hasOlderData, setHasOlderData] = useState(false);
  const [hasNewerData, setHasNewerData] = useState(false);
  const [hasHistoricalData, setHasHistoricalData] = useState(false);

  const API_BASE = process.env.NODE_ENV === 'development' ? '/.netlify/functions' : '/.netlify/functions';

  useEffect(() => {
    fetchWeeklyData();
  }, [weekOffset]);

  const fetchWeeklyData = async () => {
    try {
      const response = await axios.get(`${API_BASE}/daily-summaries?weekOffset=${weekOffset}`);
      console.log('Fetched weekly data:', response.data);
      // Log each data item with its date
      response.data.forEach((item: any, index: number) => {
        console.log(`Data ${index}:`, {
          id: item._id,
          date: item.date,
          dateString: new Date(item.date).toDateString(),
          totalJumps: item.totalJumps
        });
      });
      setWeeklyData(response.data);
      
      // Check for navigation availability
      await checkNavigationAvailability();
    } catch (error) {
      console.error('Failed to fetch weekly data:', error);
      setWeeklyData([]);
    } finally {
      setLoading(false);
    }
  };

  const checkNavigationAvailability = async () => {
    try {
      // Check if there's any historical data by going back further
      let hasAnyHistoricalData = false;
      let hasDataBeforeCurrentView = false;
      
      for (let i = 1; i <= 10; i++) { // Check up to 10 weeks back
        const checkWeekResponse = await axios.get(`${API_BASE}/daily-summaries?weekOffset=${weekOffset - i}`);
        if (checkWeekResponse.data.length > 0) {
          hasDataBeforeCurrentView = true;
        }
        
        // Also check from current week to find any historical data at all
        const checkHistoricalResponse = await axios.get(`${API_BASE}/daily-summaries?weekOffset=${-i}`);
        if (checkHistoricalResponse.data.length > 0) {
          hasAnyHistoricalData = true;
        }
        
        if (hasDataBeforeCurrentView && hasAnyHistoricalData) break;
      }
      
      setHasOlderData(hasDataBeforeCurrentView);
      setHasHistoricalData(hasAnyHistoricalData);
      
      // Right arrow: Show if not at current week (weekOffset < 0)
      setHasNewerData(weekOffset < 0);
    } catch (error) {
      console.error('Failed to check navigation availability:', error);
      setHasOlderData(false);
      setHasNewerData(false);
      setHasHistoricalData(false);
    }
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    if (direction === 'prev' && hasOlderData) {
      setWeekOffset(weekOffset - 1);
    } else if (direction === 'next' && hasNewerData) {
      setWeekOffset(weekOffset + 1);
    }
  };

  const navigateToCurrentWeek = () => {
    setWeekOffset(0);
  };

  const navigateToFirstWeek = async () => {
    // Find the earliest week with data
    for (let i = 1; i <= 20; i++) { // Check up to 20 weeks back
      const checkWeekResponse = await axios.get(`${API_BASE}/daily-summaries?weekOffset=${-i}`);
      const nextWeekResponse = await axios.get(`${API_BASE}/daily-summaries?weekOffset=${-i - 1}`);
      if (checkWeekResponse.data.length > 0 && nextWeekResponse.data.length === 0) {
        setWeekOffset(-i);
        break;
      }
    }
  };

  const generateWeekDays = () => {
    // Use user's local timezone automatically with week offset
    const today = new Date();
    const monday = new Date(today);
    // Get Monday of current week in user's local timezone
    const dayOfWeek = today.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Sunday = 0, so we need -6, otherwise 1-dayOfWeek
    monday.setDate(today.getDate() + diff + (weekOffset * 7));
    
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      weekDays.push(day);
    }
    return weekDays;
  };

  const weekDays = generateWeekDays();
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Get max jumps for scaling
  const actualMaxJumps = Math.max(...weekDays.map(day => {
    const dayData = weeklyData.find(d => 
      new Date(d.date).toDateString() === day.toDateString()
    );
    return dayData ? dayData.totalJumps : 0;
  }), 0);

  // Calculate Y-axis max: floor(max/1000) * 1000 + 1000
  const yAxisMax = actualMaxJumps === 0 ? 1000 : Math.floor(actualMaxJumps / 1000) * 1000 + 1000;
  
  // Generate Y-axis tick marks
  const yAxisTicks = [];
  for (let i = 0; i <= yAxisMax; i += 1000) {
    yAxisTicks.push(i);
  }

  // Format date as "Aug 10"
  const formatDate = (date: Date) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}`;
  };

  if (loading) {
    return (
      <div className="weekly-chart">
        <h3 className="chart-title">Weekly Progress</h3>
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="weekly-chart">
      <div className="chart-header">
        {hasOlderData && (
          <button 
            className="nav-arrow left" 
            onClick={() => navigateWeek('prev')}
          >
            ←
          </button>
        )}
        <h3 className="chart-title">Weekly Progress</h3>
        {hasNewerData && (
          <button 
            className="nav-arrow right" 
            onClick={() => navigateWeek('next')}
          >
            →
          </button>
        )}
      </div>
      <div className="chart-wrapper">
        <div className="y-axis">
          {yAxisTicks.slice().reverse().map((tick, index) => (
            <div key={tick} className="y-axis-tick">
              <span className="y-axis-label">{tick.toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div className="chart-container">
          <div className="bars-container">
            {weekDays.map((day, index) => {
              const dayData = weeklyData.find(d => 
                new Date(d.date).toDateString() === day.toDateString()
              );
              const jumps = dayData ? dayData.totalJumps : 0;
              const height = yAxisMax > 0 ? (jumps / yAxisMax) * 100 : 0;
              
              console.log(`Day ${index}:`, {
                day: day.toDateString(),
                dayData,
                jumps,
                height
              });

              return (
                <div key={index} className="bar-item">
                  <div className="bar-container">
                    {jumps > 0 && (
                      <div className="bar-value-top">
                        {jumps.toLocaleString()}
                      </div>
                    )}
                    <div 
                      className="bar"
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <div className="bar-labels">
                    <div className="bar-label-day">{dayLabels[index]}</div>
                    <div className="bar-label-date">{formatDate(day)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      {/* Navigation buttons */}
      <div className="chart-navigation">
        {weekOffset < 0 && (
          <button className="nav-btn current-week" onClick={navigateToCurrentWeek}>
            Current Week
          </button>
        )}
        {hasHistoricalData && weekOffset > -10 && ( // Don't show if already at oldest possible week
          <button className="nav-btn first-week" onClick={navigateToFirstWeek}>
            First Week
          </button>
        )}
      </div>
    </div>
  );
};

export default WeeklyChart;