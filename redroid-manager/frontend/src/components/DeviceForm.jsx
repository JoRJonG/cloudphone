import { useState } from 'react';
import { X } from 'lucide-react';

export default function DeviceForm({ onAdd, isAdding, onCancel }) {
  const [newName, setNewName] = useState('');
  const [newPort, setNewPort] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onAdd(newName, newPort);
  };

  return (
    <div className="device-form-panel">
      <div className="panel-header">
        <h3>INIT_NEW_NODE</h3>
        <button onClick={onCancel} className="btn-icon"><X size={18}/></button>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <input 
            type="text" 
            placeholder="NODE_NAME (e.g. env-01)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            required
            autoComplete="off"
          />
        </div>
        <div className="input-group">
          <input 
            type="number" 
            placeholder="ADB_PORT (e.g. 5555)"
            value={newPort}
            onChange={e => setNewPort(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn-glitch small w-full mt-2" disabled={isAdding}>
          <span className="btn-text">{isAdding ? 'DEPLOYING...' : 'DEPLOY_NODE'}</span>
        </button>
      </form>
    </div>
  );
}
