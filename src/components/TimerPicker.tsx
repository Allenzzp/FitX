import React, { useState, useRef, useEffect, useCallback } from 'react';
import './TimerPicker.css';

interface TimerPickerProps {
  value: number;  // Value in minutes
  onChange: (minutes: number) => void;
  disabled?: boolean;
}

const TimerPicker: React.FC<TimerPickerProps> = ({ value, onChange, disabled = false }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const snapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Timer options: 1 minute for testing, then 10-70 in 10-minute increments
  const timerOptions = [1, 10, 20, 30, 40, 50, 60, 70];
  
  // Find current index
  const currentIndex = timerOptions.indexOf(value);
  
  // Responsive item height to match CSS
  const itemHeight = isMobile ? 36 : 40;
  
  // Smooth snap to target index
  const snapToIndex = useCallback((targetIndex: number, smooth = true) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const targetScrollTop = targetIndex * itemHeight;
    
    if (smooth) {
      container.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth'
      });
    } else {
      container.scrollTop = targetScrollTop;
    }
  }, [itemHeight]);

  // Detect mobile screen size
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth <= 480);
    };
    
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  // Initialize scroll position
  useEffect(() => {
    if (scrollContainerRef.current && currentIndex >= 0) {
      // Longer delay to ensure DOM is ready on both mobile and desktop
      setTimeout(() => {
        snapToIndex(currentIndex, false);
      }, 100);
    }
  }, [currentIndex, snapToIndex]);

  // Simple scroll handler - just update selection and snap
  const handleScroll = useCallback(() => {
    if (disabled) return;
    
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const scrollTop = container.scrollTop;
    const rawIndex = scrollTop / itemHeight;
    const nearestIndex = Math.floor(rawIndex + 0.5);
    const clampedIndex = Math.max(0, Math.min(nearestIndex, timerOptions.length - 1));
    
    // Update selection immediately - no complex timing
    if (clampedIndex !== currentIndex && timerOptions[clampedIndex]) {
      onChange(timerOptions[clampedIndex]);
    }
    
    // Simple debounced snap
    if (snapTimeoutRef.current) {
      clearTimeout(snapTimeoutRef.current);
    }
    
    snapTimeoutRef.current = setTimeout(() => {
      snapToIndex(clampedIndex, true);
    }, 150);
    
  }, [disabled, currentIndex, itemHeight, onChange, snapToIndex, timerOptions]);

  // Simple click handler
  const handleItemClick = useCallback((clickedMinutes: number) => {
    if (disabled) return;
    const clickedIndex = timerOptions.indexOf(clickedMinutes);
    if (clickedIndex >= 0) {
      onChange(clickedMinutes);
      snapToIndex(clickedIndex, true);
    }
  }, [disabled, onChange, snapToIndex, timerOptions]);

  // Simple mouse wheel handler
  const handleWheel = useCallback((e: WheelEvent) => {
    if (disabled) return;
    e.preventDefault();
    
    const direction = e.deltaY > 0 ? 1 : -1;
    const newIndex = Math.max(0, Math.min(currentIndex + direction, timerOptions.length - 1));
    
    if (newIndex !== currentIndex) {
      onChange(timerOptions[newIndex]);
      snapToIndex(newIndex, true);
    }
  }, [disabled, currentIndex, onChange, snapToIndex, timerOptions]);

  // Simple event listeners
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    container.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
      container.removeEventListener('wheel', handleWheel);
      
      if (snapTimeoutRef.current) {
        clearTimeout(snapTimeoutRef.current);
      }
    };
  }, [handleScroll, handleWheel]);

  return (
    <div className={`timer-picker ${disabled ? 'disabled' : ''}`}>
      <div className="section-question">How long will you train today?</div>
      <div className="timer-picker-container">
        {/* Selection indicator (center line) */}
        <div className="timer-picker-selection-indicator"></div>
        
        {/* Gradient overlays for wheel effect */}
        <div className="timer-picker-gradient-top"></div>
        <div className="timer-picker-gradient-bottom"></div>
        
        <div 
          className="timer-picker-scroll"
          ref={scrollContainerRef}
        >
          {/* Padding to center the first and last items */}
          <div className="timer-picker-spacer"></div>
          
          {timerOptions.map((minutes, index) => {
            const isSelected = index === currentIndex;
            
            return (
              <div
                key={minutes}
                className={`timer-picker-item ${isSelected ? 'selected' : ''}`}
                onClick={() => handleItemClick(minutes)}
              >
                {minutes}
              </div>
            );
          })}
          
          <div className="timer-picker-spacer"></div>
        </div>
        
        <div className="timer-picker-unit">min</div>
      </div>
    </div>
  );
};

export default TimerPicker;