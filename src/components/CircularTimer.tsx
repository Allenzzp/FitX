import React from 'react';
import './CircularTimer.css';

interface CircularTimerProps {
  remainTime: number;
  totalTime: number;
  isExpired: boolean;
  extraTime: number;
  isPaused: boolean;
  onClick: () => void;
}

const CircularTimer: React.FC<CircularTimerProps> = ({
  remainTime,
  totalTime,
  isExpired,
  extraTime,
  isPaused,
  onClick
}) => {
  // Calculate progress percentage (0-100)
  const progressPercentage = totalTime > 0 ? Math.max(0, Math.min(100, (remainTime / totalTime) * 100)) : 0;
  
  // Determine color based on remaining time percentage
  const getProgressColor = (): string => {
    if (isExpired) return '#FF3B30'; // Red for overtime
    if (progressPercentage <= 5) return '#FF3B30'; // Red for 5% or less
    if (progressPercentage <= 10) return '#FF9500'; // Orange for 10% or less
    return '#34C759'; // Green for 90%+
  };

  // Format time display (MM:SS)
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(Math.abs(seconds) / 60);
    const secs = Math.abs(seconds) % 60;
    const sign = seconds < 0 ? '+' : '';
    return `${sign}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // SVG circle calculations
  const size = 120;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDasharray = circumference;
  const strokeDashoffset = isExpired ? 0 : circumference - (progressPercentage / 100) * circumference;

  const displayTime = isExpired ? formatTime(-extraTime) : formatTime(remainTime);
  const progressColor = getProgressColor();

  return (
    <div className="circular-timer" onClick={onClick}>
      <div className="circular-timer-container">
        <svg
          className="circular-timer-svg"
          width={size}
          height={size}
        >
          {/* Background circle */}
          <circle
            className="circular-timer-bg"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
          />
          
          {/* Progress circle */}
          <circle
            className="circular-timer-progress"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            style={{ stroke: progressColor }}
          />
        </svg>
        
        {/* Center content */}
        <div className="circular-timer-content">
          {isPaused ? (
            <div className="pause-indicator">
              {/* Background time display */}
              <div className="timer-text paused-bg">
                {displayTime}
              </div>
              <div className="timer-label paused-bg">
                {isExpired ? 'Overtime' : 'Remaining'}
              </div>
              {/* Triangle overlay with transparency */}
              <div className="triangle-play"></div>
            </div>
          ) : (
            <>
              <div className={`timer-text ${isExpired ? 'overtime' : ''}`}>
                {displayTime}
              </div>
              <div className="timer-label">
                {isExpired ? 'Overtime' : 'Remaining'}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CircularTimer;