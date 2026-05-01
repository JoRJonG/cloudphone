import { useState } from 'react';
import { X } from 'lucide-react';

export default function DeviceForm({ onAdd, isAdding, onCancel }) {
  const [newName, setNewName] = useState('');
  const [newPort, setNewPort] = useState('');
  const [features, setFeatures] = useState({
    gapps: false,
    magisk: false,
    ndk: false
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const selectedFeatures = Object.keys(features).filter(f => features[f]);
    onAdd(newName, newPort, selectedFeatures);
  };

  const toggleFeature = (f) => {
    setFeatures(prev => ({ ...prev, [f]: !prev[f] }));
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

        <div className="feature-selection">
          <p className="text-xs text-muted mb-2 tracking-widest">ENHANCEMENTS</p>
          <div className="checkbox-group">
            <label className={`checkbox-item ${features.gapps ? 'active' : ''}`}>
              <input type="checkbox" checked={features.gapps} onChange={() => toggleFeature('gapps')} />
              <span>GAPPS</span>
            </label>
            <label className={`checkbox-item ${features.magisk ? 'active' : ''}`}>
              <input type="checkbox" checked={features.magisk} onChange={() => toggleFeature('magisk')} />
              <span>MAGISK</span>
            </label>
            <label className={`checkbox-item ${features.ndk ? 'active' : ''}`}>
              <input type="checkbox" checked={features.ndk} onChange={() => toggleFeature('ndk')} />
              <span>ARM_NDK</span>
            </label>
          </div>
        </div>

        <button type="submit" className="btn-glitch small w-full mt-2" disabled={isAdding}>
          <span className="btn-text">{isAdding ? 'DEPLOYING...' : 'DEPLOY_NODE'}</span>
        </button>
      </form>
    </div>
  );
}
