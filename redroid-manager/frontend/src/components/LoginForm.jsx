import { useState } from 'react';
import { Terminal, Lock, User } from 'lucide-react';

export default function LoginForm({ onLogin, isLoggingIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(username, password);
  };

  return (
    <div className="login-container">
      <div className="login-box glitch-box">
        <div className="login-header">
          <Terminal className="text-neon" size={32} />
          <h2>REDROID<span className="text-neon">_CTRL</span></h2>
          <p className="sys-status">SYSTEM_LOCKED</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <User size={18} className="input-icon" />
            <input 
              type="text" 
              placeholder="USERNAME" 
              value={username} 
              onChange={e => setUsername(e.target.value)} 
              required 
              autoComplete="off"
            />
          </div>
          <div className="input-group">
            <Lock size={18} className="input-icon" />
            <input 
              type="password" 
              placeholder="PASSWORD" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
            />
          </div>
          <button type="submit" className="btn-glitch" disabled={isLoggingIn}>
            <span className="btn-text">{isLoggingIn ? 'AUTHENTICATING...' : 'ACCESS_SYSTEM'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
