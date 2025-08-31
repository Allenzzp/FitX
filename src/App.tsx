import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import HomePage from './components/HomePage';
import WorkoutTracker from './components/WorkoutTracker';
import StrengthTracker from './components/StrengthTracker';

function App() {
  return (
    <div className="App">
      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/cardio" element={<WorkoutTracker />} />
          <Route path="/strength" element={<StrengthTracker />} />
        </Routes>
      </Router>
    </div>
  );
}

export default App;