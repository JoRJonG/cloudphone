import { Terminal } from 'lucide-react';

export default function Notification({ message }) {
  if (!message) return null;
  
  return (
    <div className="notification">
      <Terminal size={16} className="text-neon" style={{ marginRight: '8px' }} />
      <span className="mono">{message}</span>
    </div>
  );
}
