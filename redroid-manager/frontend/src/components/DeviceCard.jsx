import { memo } from 'react';
import {
  Cpu,
  TerminalSquare,
  Trash2,
  Radio,
  PackagePlus,
  Play,
  Square,
  RotateCw,
  LoaderCircle
} from 'lucide-react';

const statusToneClass = {
  stream_ready: 'status-running',
  adb_connected: 'status-running',
  running: 'status-neutral',
  booting: 'status-waiting',
  stopped: 'status-stopped'
};

const DeviceCard = memo(({
  device,
  isActive,
  onSelect,
  onConnectAdb,
  onDelete,
  onInstallApk,
  onDeviceAction,
  activeAction
}) => {
  const statusClass = statusToneClass[device.runtime_stage] || '';
  const isBusy = activeAction?.endsWith(device.id);
  const checks = device.checks || {};

  const canStart = device.available_actions?.includes('start');
  const canStop = device.available_actions?.includes('stop');
  const canRestart = device.available_actions?.includes('restart');
  const canConnect = device.available_actions?.includes('connect');
  const canInstall = device.available_actions?.includes('install_apk');

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
        <div className={`status-badge ${statusClass}`}>
          <Radio size={12} className={checks.container_running ? 'pulse-neon' : ''} />
          {(device.status_label || device.status || 'unknown').toUpperCase()}
        </div>
      </div>

      <div className="device-info">
        <span className="mono">IP: {device.ip || 'WAITING_DHCP'}</span>
        <span className="mono">PORT: {device.port || 'NONE'}</span>
        <span className="mono">ADB: {(device.adb_state || 'disconnected').toUpperCase()}</span>
      </div>

      <div className="device-checks">
        <span className={`device-check ${checks.container_running ? 'ok' : ''}`}>CTR</span>
        <span className={`device-check ${checks.has_ip ? 'ok' : ''}`}>IP</span>
        <span className={`device-check ${checks.adb_connected ? 'ok' : ''}`}>ADB</span>
        <span className={`device-check ${checks.stream_ready ? 'ok' : ''}`}>VIEW</span>
      </div>

      <div className="device-actions">
        <button
          className="btn-outline flex-1"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(device);
            if (canConnect) {
              onConnectAdb(device);
            }
          }}
          disabled={isBusy}
        >
          <TerminalSquare size={14} />
          {checks.stream_ready ? 'OPEN' : 'CONNECT'}
        </button>

        {canStart && onDeviceAction && (
          <button
            className="btn-outline"
            onClick={(e) => {
              e.stopPropagation();
              onDeviceAction(device, 'start');
            }}
            title="Start device"
            disabled={isBusy}
          >
            {isBusy ? <LoaderCircle size={14} className="spin" /> : <Play size={14} />}
          </button>
        )}

        {canStop && onDeviceAction && (
          <button
            className="btn-outline"
            onClick={(e) => {
              e.stopPropagation();
              onDeviceAction(device, 'stop');
            }}
            title="Stop device"
            disabled={isBusy}
          >
            {isBusy ? <LoaderCircle size={14} className="spin" /> : <Square size={14} />}
          </button>
        )}

        {canRestart && onDeviceAction && (
          <button
            className="btn-outline"
            onClick={(e) => {
              e.stopPropagation();
              onDeviceAction(device, 'restart');
            }}
            title="Restart device"
            disabled={isBusy}
          >
            {isBusy ? <LoaderCircle size={14} className="spin" /> : <RotateCw size={14} />}
          </button>
        )}

        {canInstall && onInstallApk && (
          <button
            className="btn-outline apk-btn"
            onClick={(e) => {
              e.stopPropagation();
              onInstallApk(device);
            }}
            title="Install APK"
            disabled={isBusy}
          >
            <PackagePlus size={14} />
          </button>
        )}

        {onDelete && (
          <button
            className="btn-outline danger"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(device.id, device.name);
            }}
            title="Delete device"
            disabled={isBusy}
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
