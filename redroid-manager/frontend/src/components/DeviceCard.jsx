import { memo } from 'react';
import { Cpu, TerminalSquare, Trash2, Radio, PackagePlus } from 'lucide-react';

const DeviceCard = memo(({ device, isActive, onSelect, onConnectAdb, onDelete, onInstallApk }) => {
  return (
    <div 
      className={`device-card ${isActive ? 'active' : ''}`}
      onClick={() => onSelect(device)}
    >
      <div className="device-header">
        <div className="device-name">
          <Cpu size={16} className="text-neon" />
          {device.name}
        </div>
        <div className={`status-badge ${device.status === 'running' ? 'status-running' : ''}`}>
          <Radio size={12} className={device.status === 'running' ? 'pulse-neon' : ''} />
          {/* ใช้ optional chaining เผื่อ status เป็น undefined จาก backend */}
          {(device.status ?? 'unknown').toUpperCase()}
        </div>
      </div>
      <div className="device-info">
        <span className="mono">IP: {device.ip || 'WAITING_DHCP'}</span>
        <span className="mono">PORT: {device.port || 'NONE'}</span>
      </div>
      
      <div className="device-actions">
        <button 
          className="btn-outline flex-1" 
          onClick={(e) => { e.stopPropagation(); onConnectAdb(device); }}
        >
          <TerminalSquare size={14} /> CONNECT
        </button>
        {device.status === 'running' && onInstallApk && (
          <button
            className="btn-outline apk-btn"
            onClick={(e) => { e.stopPropagation(); onInstallApk(device); }}
            title="Install APK"
          >
            <PackagePlus size={14} />
          </button>
        )}
        {onDelete && (
          <button 
            className="btn-outline danger"
            onClick={(e) => { e.stopPropagation(); onDelete(device.id, device.name); }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
});

DeviceCard.displayName = 'DeviceCard';
export default DeviceCard;
