import React from 'react';
import { useNavigate } from 'react-router-dom';
import './HomePage.css';

const HomePage: React.FC = () => {
  const navigate = useNavigate();

  const handleCardClick = (route: string) => {
    navigate(route);
  };

  return (
    <div className="homepage-container">
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