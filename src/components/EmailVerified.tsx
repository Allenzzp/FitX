import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import './EmailVerified.css';

const EmailVerified: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verifyEmail = async () => {
      const token = searchParams.get('token');

      if (!token) {
        setStatus('error');
        setMessage('Invalid verification link');
        return;
      }

      try {
        await axios.get(`/.netlify/functions/verify-email?token=${token}`);
        setStatus('success');
        setMessage('Email verified successfully!');
      } catch (err: any) {
        setStatus('error');
        setMessage(err.response?.data?.error || 'Verification failed');
      }
    };

    verifyEmail();
  }, [searchParams]);

  return (
    <div className="email-verified-container">
      <div className="email-verified-card">
        {status === 'loading' && (
          <>
            <div className="verified-icon">⏳</div>
            <h1 className="verified-title">Verifying...</h1>
            <p className="verified-message">Please wait while we verify your email.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="verified-icon">✅</div>
            <h1 className="verified-title">Email Verified!</h1>
            <p className="verified-message">{message}</p>
            <p className="verified-instruction">
              You can now close this page and return to FitX to log in.
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="verified-icon">❌</div>
            <h1 className="verified-title">Verification Failed</h1>
            <p className="verified-message">{message}</p>
            <p className="verified-instruction">
              The verification link may have expired or is invalid. Please try registering again or request a new verification email.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default EmailVerified;
