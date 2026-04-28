import DeviceCard from './DeviceCard';
import { Loader2 } from 'lucide-react';

export default function DeviceList({ devices, loading, selectedDevice, onSelectDevice, onConnectAdb, onDeleteDevice }) {
  if (loading && devices.length === 0) {
    return (
      <div className="empty-state">
        <Loader2 className="spin text-neon" size={32} />
        <p className="mt-2 text-sm mono">SCANNING_NETWORK...</p>
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="empty-state">
        <p className="text-sm mono text-muted">NO_NODES_FOUND</p>
      </div>
    );
  }

  return (
    <div className="device-list">
      {devices.map(device => (
        <DeviceCard 
          key={device.id}
          device={device}
          isActive={selectedDevice?.id === device.id}
          onSelect={onSelectDevice}
          onConnectAdb={onConnectAdb}
          onDelete={onDeleteDevice}
        />
      ))}
    </div>
  );
}
