import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import './EmailVerificationPending.css';

interface EmailVerificationPendingProps {
  onChangeEmail: () => void;
}

const EmailVerificationPending: React.FC<EmailVerificationPendingProps> = ({ onChangeEmail }) => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { user } = useAuth();

  const handleResendEmail = async () => {
    if (!user?.email) return;

    try {
      setLoading(true);
      setError('');
      setMessage('');
      await axios.post('/.netlify/functions/resend-verification', {
        email: user.email,
      });
      setMessage('Verification email sent! Please check your inbox.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to resend email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="verification-container">
      <div className="verification-card">
        <div className="verification-icon">📧</div>
        <h1 className="verification-title">Check your email</h1>
        <p className="verification-message">
          We've sent a verification link to <strong>{user?.email}</strong>
        </p>
        <p className="verification-instruction">
          Click the link in the email to verify your account and start using FitX.
        </p>

        {message && <div className="verification-success">{message}</div>}
        {error && <div className="verification-error">{error}</div>}

        <div className="verification-actions">
          <button
            onClick={handleResendEmail}
            disabled={loading}
            className="resend-btn"
          >
            {loading ? 'Sending...' : 'Resend verification email'}
          </button>

          <button onClick={onChangeEmail} className="change-email-link">
            Change email address
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmailVerificationPending;
