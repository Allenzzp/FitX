import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Auth from './components/Auth';
import EmailVerificationPending from './components/EmailVerificationPending';
import EmailVerified from './components/EmailVerified';
import HomePage from './components/HomePage';
import WorkoutTracker from './components/WorkoutTracker';
import StrengthTracker from './components/StrengthTracker';
import ProtectedRoute from './components/ProtectedRoute';

const AuthRouter: React.FC = () => {
  const { user, loading } = useAuth();
  const [showVerificationPending, setShowVerificationPending] = useState(false);
  const [prefilledData, setPrefilledData] = useState<{
    email: string;
    password: string;
    username: string;
  } | null>(null);

  const handleVerificationPending = () => {
    setShowVerificationPending(true);
  };

  const handleChangeEmail = () => {
    if (user) {
      setPrefilledData({
        email: user.email,
        password: '',
        username: user.username,
      });
    }
    setShowVerificationPending(false);
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontSize: '1.2rem',
        color: '#6e6e73'
      }}>
        Loading...
      </div>
    );
  }

  // If user is not authenticated, show auth page
  if (!user) {
    return <Auth onVerificationPending={handleVerificationPending} />;
  }

  // If user is authenticated but email not verified, show verification pending
  if (user && user.emailVerified === false && showVerificationPending) {
    return <EmailVerificationPending onChangeEmail={handleChangeEmail} />;
  }

  // If user is authenticated and email verified, show HomePage
  return <HomePage />;
};

function App() {
  return (
    <div className="App">
      <Router>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<AuthRouter />} />
            <Route path="/verify-email" element={<EmailVerified />} />
            <Route
              path="/cardio"
              element={
                <ProtectedRoute>
                  <WorkoutTracker />
                </ProtectedRoute>
              }
            />
            <Route
              path="/strength"
              element={
                <ProtectedRoute>
                  <StrengthTracker />
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </Router>
    </div>
  );
}

export default App;