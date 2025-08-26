import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './WeeklyChart.css';

interface DailySummary {
  _id: string;
  date: string;
  totalJumps: number;
  sessionsCount: number;
}

interface WeekData {
  data: DailySummary[];
  meta: {
    requestedWeeks: number[];
    totalWeeksAvailable: number;
    firstRecordDate: string;
  };
}

interface CacheEntry {
  weekNumber: number;
  data: DailySummary[];
  timestamp: number;
}

const WeeklyChart: React.FC = () => {
  const [currentWeekData, setCurrentWeekData] = useState<DailySummary[]>([]);
  const [currentWeekNumber, setCurrentWeekNumber] = useState<number>(1);
  const [totalWeeksAvailable, setTotalWeeksAvailable] = useState<number>(0);
  const [firstRecordDate, setFirstRecordDate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [displayedWeek, setDisplayedWeek] = useState<number>(1);
  const [cache] = useState<Map<number, DailySummary[]>>(new Map());
  const [cacheQueue] = useState<number[]>([]); // FIFO queue for cache management

  const API_BASE = '/.netlify/functions';
  const MAX_CACHE_SIZE = 10; // Maximum weeks to keep in cache

  useEffect(() => {
    initializeChart();
  }, []);

  // Smart Cache Management with Week 1 Priority
  const addToCache = (weekNumber: number, data: DailySummary[]) => {
    // Never cache current week - it changes frequently
    if (weekNumber === currentWeekNumber) {
      return;
    }
    
    // Week 1 gets priority position (always keep)
    if (weekNumber === 1) {
      cache.set(1, data);
      // Remove from queue if it exists, we'll manage Week 1 separately
      const index = cacheQueue.indexOf(1);
      if (index > -1) {
        cacheQueue.splice(index, 1);
      }
    } else {
      // For other historical weeks, apply FIFO
      while (cacheQueue.length >= MAX_CACHE_SIZE - 1) { // -1 to reserve space for Week 1
        const oldestWeek = cacheQueue.shift();
        if (oldestWeek !== undefined && oldestWeek !== 1) {
          cache.delete(oldestWeek);
        }
      }
      
      cache.set(weekNumber, data);
      cacheQueue.push(weekNumber);
    }
    
    // Save to sessionStorage (except current week)
    const sessionKey = `weeklyChart_${weekNumber}`;
    sessionStorage.setItem(sessionKey, JSON.stringify(data));
  };

  const getFromCache = (weekNumber: number): DailySummary[] | null => {
    // Never return cached data for current week - always fetch fresh
    if (weekNumber === currentWeekNumber) {
      return null;
    }
    
    // Check memory cache first
    if (cache.has(weekNumber)) {
      return cache.get(weekNumber) || null;
    }
    
    // Check sessionStorage for historical weeks only
    const sessionKey = `weeklyChart_${weekNumber}`;
    const stored = sessionStorage.getItem(sessionKey);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        // Add back to memory cache (with priority handling)
        if (weekNumber === 1) {
          cache.set(1, data); // Week 1 priority
        } else {
          cache.set(weekNumber, data);
          if (!cacheQueue.includes(weekNumber)) {
            cacheQueue.push(weekNumber);
          }
        }
        return data;
      } catch (error) {
        // Remove invalid data
        sessionStorage.removeItem(sessionKey);
      }
    }
    
    return null;
  };

  // Fetch metadata from new dedicated endpoint
  const fetchMetadata = async () => {
    try {
      const response = await axios.get(`${API_BASE}/daily-summaries?metadata=true`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch metadata:', error);
      return null;
    }
  };

  // Fetch weeks from API
  const fetchWeeks = async (weekNumbers: number[]): Promise<WeekData | null> => {
    try {
      const response = await axios.get(`${API_BASE}/daily-summaries?weekNumbers=${weekNumbers.join(',')}`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch weeks:', weekNumbers, error);
      return null;
    }
  };

  // Get data for a specific week (from cache or API)
  const getWeekData = async (weekNumber: number): Promise<DailySummary[]> => {
    // Check cache first
    const cached = getFromCache(weekNumber);
    if (cached) {
      return cached;
    }
    
    // Not in cache, need to fetch
    const response = await fetchWeeks([weekNumber]);
    
    if (response?.data) {
      // Find data for this specific week
      const weekData = response.data.filter(item => {
        const itemDate = new Date(item.date);
        const itemWeek = getWeekNumberFromDate(itemDate, firstRecordDate);
        return itemWeek === weekNumber;
      });
      
      addToCache(weekNumber, weekData);
      return weekData;
    }
    
    return [];
  };

  // Calculate week number from date
  const getWeekNumberFromDate = (date: Date, firstRecordDateStr: string): number => {
    if (!firstRecordDateStr) return 1;
    
    const firstDate = new Date(firstRecordDateStr);
    const firstMonday = getMondayOfWeek(firstDate);
    const targetMonday = getMondayOfWeek(date);
    
    const diffTime = targetMonday.getTime() - firstMonday.getTime();
    const diffWeeks = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000));
    return diffWeeks + 1;
  };

  const getMondayOfWeek = (date: Date): Date => {
    const result = new Date(date);
    const dayOfWeek = result.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    result.setDate(result.getDate() + diff);
    result.setHours(0, 0, 0, 0);
    return result;
  };

  // Initialize chart with phased loading using clean metadata API
  const initializeChart = async () => {
    try {
      // Phase 1: Get metadata from dedicated endpoint (clean approach!)
      const metadata = await fetchMetadata();
      
      if (!metadata) {
        setLoading(false);
        return;
      }
      
      // Set metadata state
      setTotalWeeksAvailable(metadata.totalWeeksAvailable);
      setFirstRecordDate(metadata.firstRecordDate);
      setCurrentWeekNumber(metadata.currentWeekNumber);
      setDisplayedWeek(metadata.currentWeekNumber);
      
      // Phase 1: Load current week data (always fetch fresh - never cache)
      const currentWeekResponse = await fetchWeeks([metadata.currentWeekNumber]);
      let currentWeekData: DailySummary[] = [];
      
      if (currentWeekResponse?.data) {
        currentWeekData = currentWeekResponse.data.filter(item => {
          const itemDate = new Date(item.date);
          const itemWeek = getWeekNumberFromDate(itemDate, metadata.firstRecordDate);
          return itemWeek === metadata.currentWeekNumber;
        });
        // Note: Don't cache current week data (per Option B strategy)
      }
      
      setCurrentWeekData(currentWeekData);
      setLoading(false);
      
      // Phase 2+3: Load previous weeks + first week in parallel (background)
      const loadPhase2And3 = async () => {
        const currentWeek = metadata.currentWeekNumber;
        const weeksToLoad: number[] = [];
        
        // Previous 2 weeks (if they exist)
        if (currentWeek > 1) weeksToLoad.push(currentWeek - 1);
        if (currentWeek > 2) weeksToLoad.push(currentWeek - 2);
        
        // First week (if different from current/previous weeks)
        if (currentWeek > 3) weeksToLoad.push(1);
        
        if (weeksToLoad.length > 0) {
          const response = await fetchWeeks(weeksToLoad);
          if (response?.data) {
            // Process and cache the data (historical weeks only)
            weeksToLoad.forEach(weekNum => {
              const weekData = response.data.filter(item => {
                const itemDate = new Date(item.date);
                const itemWeek = getWeekNumberFromDate(itemDate, metadata.firstRecordDate);
                return itemWeek === weekNum;
              });
              addToCache(weekNum, weekData); // Will handle Week 1 priority automatically
            });
          }
        }
      };
      
      // Run Phase 2+3 in background
      setTimeout(loadPhase2And3, 100);
      
    } catch (error) {
      console.error('Failed to initialize chart:', error);
      setLoading(false);
    }
  };

  // Navigation functions for new week-based system
  const navigateWeek = async (direction: 'prev' | 'next') => {
    let targetWeek: number;
    
    if (direction === 'prev') {
      targetWeek = displayedWeek - 1;
      if (targetWeek < 1) return; // Can't go before first week
    } else {
      targetWeek = displayedWeek + 1;
      if (targetWeek > currentWeekNumber) return; // Can't go beyond current week
    }
    
    // Load target week data
    const weekData = await getWeekData(targetWeek);
    setCurrentWeekData(weekData);
    setDisplayedWeek(targetWeek);
  };

  const navigateToCurrentWeek = async () => {
    if (displayedWeek === currentWeekNumber) return;
    
    const weekData = await getWeekData(currentWeekNumber);
    setCurrentWeekData(weekData);
    setDisplayedWeek(currentWeekNumber);
  };

  const navigateToFirstWeek = async () => {
    if (displayedWeek === 1) return;
    
    const weekData = await getWeekData(1);
    setCurrentWeekData(weekData);
    setDisplayedWeek(1);
  };

  const generateWeekDays = () => {
    if (!firstRecordDate) return [];
    
    const firstDate = new Date(firstRecordDate);
    const firstMonday = getMondayOfWeek(firstDate);
    
    // Calculate Monday of the displayed week
    const displayedMonday = new Date(firstMonday);
    displayedMonday.setDate(firstMonday.getDate() + ((displayedWeek - 1) * 7));
    
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(displayedMonday);
      day.setDate(displayedMonday.getDate() + i);
      weekDays.push(day);
    }
    return weekDays;
  };

  const weekDays = generateWeekDays();
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Get max jumps for scaling
  const actualMaxJumps = Math.max(...weekDays.map(day => {
    const dayData = currentWeekData.find(d => 
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
        {displayedWeek > 1 && (
          <button 
            className="nav-arrow left" 
            onClick={() => navigateWeek('prev')}
          >
            ←
          </button>
        )}
        <h3 className="chart-title">Weekly Progress</h3>
        {displayedWeek < currentWeekNumber && (
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
              const dayData = currentWeekData.find(d => 
                new Date(d.date).toDateString() === day.toDateString()
              );
              const jumps = dayData ? dayData.totalJumps : 0;
              const height = yAxisMax > 0 ? (jumps / yAxisMax) * 100 : 0;

              return (
                <div key={index} className="bar-item">
                  <div className="bar-container">
                    {jumps > 0 && (
                      <div 
                        className="bar"
                        style={{ height: `${height}%` }}
                      >
                        <div className="bar-value-top">
                          {jumps.toLocaleString()}
                        </div>
                      </div>
                    )}
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
        {displayedWeek !== currentWeekNumber && (
          <button className="nav-btn current-week" onClick={navigateToCurrentWeek}>
            Current Week
          </button>
        )}
        {totalWeeksAvailable > 1 && displayedWeek !== 1 && (
          <button className="nav-btn first-week" onClick={navigateToFirstWeek}>
            First Week
          </button>
        )}
      </div>
    </div>
  );
};

export default WeeklyChart;