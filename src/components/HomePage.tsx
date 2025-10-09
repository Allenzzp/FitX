import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './HomePage.css';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [showUserId, setShowUserId] = useState(false);

  const handleCardClick = (route: string) => {
    navigate(route);
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const toggleUserDisplay = () => {
    setShowUserId(!showUserId);
  };

  return (
    <div className="homepage-container">
      {user && (
        <div className="user-info">
          <span className="user-display" onClick={toggleUserDisplay}>
            {showUserId ? user.userId : user.username}
          </span>
          <span className="separator">•</span>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      )}

      <h1 className="homepage-title">FitX</h1>
      <p className="homepage-subtitle">Your Personal Training Helper</p>

      <div className="workout-cards">
        <div
          className="workout-card workout-card--cardio"
          onClick={() => handleCardClick('/cardio')}
        >
          <div className="card-icon">🏃‍♂️</div>
          <h2 className="card-title">Cardio</h2>
          <p className="card-description">Jump rope, running, and endurance training</p>
        </div>

        <div
          className="workout-card workout-card--strength"
          onClick={() => handleCardClick('/strength')}
        >
          <div className="card-icon">💪</div>
          <h2 className="card-title">Strength</h2>
          <p className="card-description">Weight lifting, bodyweight, and resistance training</p>
        </div>
      </div>
    </div>
  );
};

export default HomePage;