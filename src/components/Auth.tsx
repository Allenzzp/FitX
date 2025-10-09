import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './Auth.css';

interface AuthProps {
  onVerificationPending: () => void;
}

const Auth: React.FC<AuthProps> = ({ onVerificationPending }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [formError, setFormError] = useState('');
  const { login, register, loading } = useAuth();

  // Password validation states
  const passwordHasMinLength = password.length >= 8;
  const passwordHasLetterAndNumber = /[a-zA-Z]/.test(password) && /[0-9]/.test(password);
  const passwordValid = passwordHasMinLength && passwordHasLetterAndNumber;

  // Username validation states
  const usernameValidLength = username.length <= 20 && username.length > 0;

  // Password confirmation validation
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) {
      return 'Password must be at least 8 characters';
    }
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasLetter || !hasNumber) {
      return 'Password must contain both letters and numbers';
    }
    return null;
  };

  const validateUsername = (username: string): string | null => {
    if (!username) {
      return 'Username is required';
    }
    if (username.length > 20) {
      return 'Username must be 20 characters or less';
    }
    const validPattern = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;
    if (!validPattern.test(username)) {
      return 'Username must start/end with letter or number, and can only contain letters, numbers, _, -, .';
    }
    const consecutiveSpecials = /__|-{2}|\.{2}/;
    if (consecutiveSpecials.test(username)) {
      return 'Username cannot have consecutive special characters';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    // Validation
    if (!validateEmail(email)) {
      setFormError('Please enter a valid email address');
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setFormError(passwordError);
      return;
    }

    if (!isLogin) {
      const usernameError = validateUsername(username);
      if (usernameError) {
        setFormError(usernameError);
        return;
      }

      if (password !== confirmPassword) {
        setFormError('Passwords do not match');
        return;
      }
    }

    try {
      if (isLogin) {
        await login(email, password, rememberMe);
      } else {
        await register(email, password, username);
        onVerificationPending();
      }
    } catch (err: any) {
      setFormError(err.message);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setFormError('');
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">FitX</h1>
        <p className="auth-subtitle">Your Personal Training Helper</p>

        <div className="auth-toggle">
          <button
            className={`toggle-btn ${isLogin ? 'active' : ''}`}
            onClick={() => setIsLogin(true)}
            type="button"
          >
            Login
          </button>
          <button
            className={`toggle-btn ${!isLogin ? 'active' : ''}`}
            onClick={() => setIsLogin(false)}
            type="button"
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form" method="post" action="#">
          {!isLogin && (
            <div className="form-group">
              <input
                type="text"
                name="username"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="form-input"
                disabled={loading}
                maxLength={20}
                autoComplete="username"
              />
              <div className="validation-hints">
                <div className={`hint ${username.length === 0 ? '' : usernameValidLength ? 'valid' : 'invalid'}`}>
                  {username.length === 0 ? '○' : usernameValidLength ? '✓' : '✗'} Maximum 20 characters
                </div>
              </div>
            </div>
          )}

          <div className="form-group">
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input"
              disabled={loading}
              autoComplete="username"
            />
            {!isLogin && (
              <p className="input-hint">
                You'll need to verify this email address to complete registration
              </p>
            )}
          </div>

          <div className="form-group">
            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input password-input"
                disabled={loading}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
            {!isLogin && (
              <div className="validation-hints">
                <div className={`hint ${password.length === 0 ? '' : passwordHasMinLength ? 'valid' : 'invalid'}`}>
                  {password.length === 0 ? '○' : passwordHasMinLength ? '✓' : '✗'} Minimum 8 characters
                </div>
                <div className={`hint ${password.length === 0 ? '' : passwordHasLetterAndNumber ? 'valid' : 'invalid'}`}>
                  {password.length === 0 ? '○' : passwordHasLetterAndNumber ? '✓' : '✗'} Must contain both letters and numbers, special characters are optional
                </div>
              </div>
            )}
          </div>

          {!isLogin && (
            <div className="form-group">
              <div className="password-input-wrapper">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="form-input password-input"
                  disabled={loading}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
              {confirmPassword.length > 0 && (
                <div className="validation-hints">
                  <div className={`hint ${passwordsMatch ? 'valid' : 'invalid'}`}>
                    {passwordsMatch ? '✓' : '✗'} Passwords match
                  </div>
                </div>
              )}
            </div>
          )}

          {formError && <div className="form-error">{formError}</div>}

          {isLogin && (
            <div className="remember-me-wrapper">
              <label className="remember-me-label">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="remember-me-checkbox"
                />
                <span>Remember me</span>
              </label>
            </div>
          )}

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'Loading...' : isLogin ? 'Login' : 'Register'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Auth;
