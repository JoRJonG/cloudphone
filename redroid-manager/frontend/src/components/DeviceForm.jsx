import { useState } from 'react';
import { X } from 'lucide-react';

// Preset resolutions ที่ใช้บ่อยสำหรับเกม
const PRESETS = [
  { label: 'HD Portrait  720×1280', width: 720,  height: 1280, dpi: 320 },
  { label: 'FHD Portrait 1080×1920', width: 1080, height: 1920, dpi: 480 },
  { label: 'HD Landscape 1280×720',  width: 1280, height: 720,  dpi: 320 },
  { label: 'FHD Landscape 1920×1080',width: 1920, height: 1080, dpi: 480 },
  { label: 'Tablet 1600×2560',       width: 1600, height: 2560, dpi: 320 },
];

export default function DeviceForm({ onAdd, isAdding, onCancel }) {
  const [newName, setNewName] = useState('');
  const [newPort, setNewPort] = useState('');
  const [features, setFeatures] = useState({ gapps: false, magisk: false, ndk: false });
  const [width,  setWidth]  = useState(720);
  const [height, setHeight] = useState(1280);
  const [dpi,    setDpi]    = useState(320);

  const handleSubmit = (e) => {
    e.preventDefault();
    const selectedFeatures = Object.keys(features).filter(f => features[f]);
    onAdd(newName, newPort, selectedFeatures, Number(width), Number(height), Number(dpi));
  };

  const toggleFeature = (f) => {
    setFeatures(prev => ({ ...prev, [f]: !prev[f] }));
  };

  const applyPreset = (preset) => {
    setWidth(preset.width);
    setHeight(preset.height);
    setDpi(preset.dpi);
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

        {/* Screen Resolution */}
        <div className="feature-selection">
          <p className="text-xs text-muted mb-2 tracking-widest">DISPLAY_RESOLUTION</p>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
            <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
              <input
                type="number" placeholder="WIDTH"
                value={width} onChange={e => setWidth(e.target.value)}
                min={360} max={2560} required
              />
            </div>
            <span style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>×</span>
            <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
              <input
                type="number" placeholder="HEIGHT"
                value={height} onChange={e => setHeight(e.target.value)}
                min={360} max={2560} required
              />
            </div>
            <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
              <input
                type="number" placeholder="DPI"
                value={dpi} onChange={e => setDpi(e.target.value)}
                min={120} max={640} required
              />
            </div>
          </div>
          {/* Preset buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
            {PRESETS.map(p => (
              <button
                key={p.label} type="button"
                onClick={() => applyPreset(p)}
                className={`orientation-btn ${width === p.width && height === p.height ? 'active' : ''}`}
                style={{ fontSize: '9px', padding: '2px 6px' }}
              >
                {p.label}
              </button>
            ))}
          </div>
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
