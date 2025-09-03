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
    return '#34C759'; // Green for normal time
  };

  // Format time display (MM:SS)
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(Math.abs(seconds) / 60);
    const secs = Math.abs(seconds) % 60;
    const sign = seconds < 0 ? '+' : '';
    return `${sign}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const displayTime = isExpired ? formatTime(-extraTime) : formatTime(remainTime);
  const progressColor = getProgressColor();

  // Calculate progress angle for clip-path (0-360 degrees)
  const progressAngle = isExpired ? 360 : (progressPercentage / 100) * 360;

  return (
    <div className="circular-timer" onClick={onClick}>
      <div className="circular-timer-container">
        {/* Progress ring */}
        <div 
          className="progress-ring"
          style={{
            '--progress-angle': `${progressAngle}deg`,
            '--progress-color': progressColor
          } as React.CSSProperties}
        ></div>
        {/* Center content */}
        <div className="circular-timer-content">
          {isPaused ? (
            <div className="pause-indicator">
              {/* Normal time display - no blur/opacity */}
              <div className="timer-text">
                {displayTime}
              </div>
              <div className="timer-label">
                {isExpired ? 'Overtime' : 'Remaining'}
              </div>
              {/* Large transparent triangle overlay */}
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