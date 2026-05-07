import { useState, useEffect } from 'react';
import {
  Monitor,
  Wifi,
  Play,
  Square,
  RotateCw,
  TerminalSquare,
  CircleHelp,
  LoaderCircle,
  LayoutGrid,
  Smartphone
} from 'lucide-react';

function formatCheckLabel(key) {
  return key.replaceAll('_', ' ').toUpperCase();
}

export default function StreamViewer({
  devices,
  selectedDevice,
  diagnostics,
  diagnosticsLoading,
  onSelectDevice,
  onConnectAdb,
  onDeviceAction,
  activeDeviceAction,
  currentUser,
  onRefreshDiagnostics
}) {
  const [orientation, setOrientation] = useState('auto');
  const [viewerMode, setViewerMode] = useState('focus');
  const [thumbTs, setThumbTs] = useState(() => Date.now());
  const isAdmin = currentUser?.role === 'admin';
  const isBusy = selectedDevice && activeDeviceAction?.endsWith(selectedDevice.id);

  const getIframeUrl = (device) => {
    let host = window.location.hostname || 'localhost';
    if (host.includes(':') && !host.startsWith('[')) {
      host = `[${host}]`;
    }

    const ip = device?.ip;
    const canStream = device?.checks?.stream_ready;
    if (!canStream || !ip) {
      return null;
    }

    const udid = `${ip.trim()}:5555`;
    const wsHost = window.location.hostname || 'localhost';
    const wsUrl = `ws://${wsHost}:8001/?action=proxy-adb&remote=tcp:8886&udid=${udid}`;
    return `http://${host}:8001/#!action=stream&udid=${encodeURIComponent(udid)}&player=mse&hide-header=1&hide-navbar=1&hide-footer=1&hide-menu=0&keyboard=true&mouse=true&ws=${encodeURIComponent(wsUrl)}`;
  };

  const iframeUrl = getIframeUrl(selectedDevice);
  const checks = diagnostics?.checks || selectedDevice?.checks || {};
  const previewDevices = devices.filter((device) => device.checks?.stream_ready);

  // Polling thumbnail ทุก 4 วินาที เฉพาะตอนอยู่ใน WALL mode
  useEffect(() => {
    if (viewerMode !== 'wall' || previewDevices.length === 0) return;
    const interval = setInterval(() => setThumbTs(Date.now()), 4000);
    return () => clearInterval(interval);
  }, [viewerMode, previewDevices.length]);

  const getThumbnailUrl = (device) =>
    `/api/devices/${device.id}/thumbnail?t=${thumbTs}`;
  const combinedLogs = [
    '=== DEVICE LOG TAIL ===',
    diagnostics?.container_logs || 'No device logs available.',
    '',
    '=== STREAM GATEWAY ===',
    diagnostics?.ws_scrcpy_logs || 'No ws-scrcpy logs available.',
    '',
    '=== ADB DISCOVERY ===',
    diagnostics?.adb_raw_output || 'No adb diagnostic output yet.'
  ].join('\n');

  const handleCopyLogs = async () => {
    try {
      await navigator.clipboard.writeText(combinedLogs);
    } catch (err) {
      console.warn('Clipboard write failed', err);
    }
  };

  return (
    <div className="main-content">
      <div className="topbar">
        <div className="breadcrumb mono flex items-center gap-2 text-sm">
          <Monitor size={16} className="text-neon" />
          {selectedDevice ? (
            <>
              <span className="text-muted">NODE //</span>
              <span className="text-white">{selectedDevice.name}</span>
              <span className="text-neon ml-2">[{selectedDevice.status_label || selectedDevice.status}]</span>
            </>
          ) : (
            <span className="text-muted">AWAITING_NODE_SELECTION...</span>
          )}
        </div>

        {selectedDevice && (
          <div className="viewer-actions">
            <div className="viewer-mode-toggle">
              <button
                className={`orientation-btn ${viewerMode === 'focus' ? 'active' : ''}`}
                onClick={() => setViewerMode('focus')}
              >
                <Smartphone size={12} />
                FOCUS
              </button>
              <button
                className={`orientation-btn ${viewerMode === 'wall' ? 'active' : ''}`}
                onClick={() => setViewerMode('wall')}
                disabled={previewDevices.length === 0}
              >
                <LayoutGrid size={12} />
                WALL
              </button>
            </div>

            <button
              className="btn-outline text-[10px] px-3 py-1 flex items-center gap-2"
              onClick={() => onConnectAdb(selectedDevice)}
              disabled={isBusy || !selectedDevice.available_actions?.includes('connect')}
            >
              <TerminalSquare size={12} />
              CONNECT_ADB
            </button>

            {isAdmin && selectedDevice.available_actions?.includes('start') && (
              <button className="btn-outline" onClick={() => onDeviceAction(selectedDevice, 'start')} disabled={isBusy}>
                {isBusy ? <LoaderCircle size={12} className="spin" /> : <Play size={12} />}
                START
              </button>
            )}

            {isAdmin && selectedDevice.available_actions?.includes('stop') && (
              <button className="btn-outline" onClick={() => onDeviceAction(selectedDevice, 'stop')} disabled={isBusy}>
                {isBusy ? <LoaderCircle size={12} className="spin" /> : <Square size={12} />}
                STOP
              </button>
            )}

            {isAdmin && selectedDevice.available_actions?.includes('restart') && (
              <button className="btn-outline" onClick={() => onDeviceAction(selectedDevice, 'restart')} disabled={isBusy}>
                {isBusy ? <LoaderCircle size={12} className="spin" /> : <RotateCw size={12} />}
                RESTART
              </button>
            )}

            <div className="orientation-selector">
              <button className={`orientation-btn ${orientation === 'auto' ? 'active' : ''}`} onClick={() => setOrientation('auto')}>
                AUTO
              </button>
              <button className={`orientation-btn ${orientation === 'portrait' ? 'active' : ''}`} onClick={() => setOrientation('portrait')}>
                PORTRAIT
              </button>
              <button className={`orientation-btn ${orientation === 'landscape' ? 'active' : ''}`} onClick={() => setOrientation('landscape')}>
                LANDSCAPE
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="viewer-layout">
        <div className="iframe-container relative">
          {viewerMode === 'wall' && previewDevices.length > 0 ? (
            <div className="preview-wall">
              {previewDevices.map((device) => (
                <button
                  key={device.id}
                  className={`preview-tile ${selectedDevice?.id === device.id ? 'active' : ''}`}
                  onClick={() => {
                    onSelectDevice(device);
                    setViewerMode('focus');
                  }}
                  type="button"
                >
                  <div className="preview-tile-header">
                    <span className="mono">{device.name}</span>
                    <span className={`preview-pill ${device.runtime_stage}`}>{device.status_label}</span>
                  </div>

                  {/* ใช้ img snapshot แทน iframe เพื่อประหยัด WebSocket connection */}
                  <div className="preview-tile-screen">
                    <img
                      src={getThumbnailUrl(device)}
                      alt={`Snapshot ${device.name}`}
                      className="preview-snapshot"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextSibling.style.display = 'flex';
                      }}
                    />
                    <div className="preview-tile-empty" style={{ display: 'none' }}>
                      <Wifi size={20} />
                      <span>{device.status_label}</span>
                    </div>
                  </div>

                  <div className="preview-tile-footer mono">
                    <span>{device.ip || 'WAITING_DHCP'}</span>
                    <span>{(device.adb_state || 'disconnected').toUpperCase()}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : iframeUrl ? (
            <div className="stream-center flex-col gap-4">
              <div className={`scrcpy-shell scrcpy-shell--${orientation}`}>
                <iframe
                  key={`${selectedDevice.id}-${orientation}`}
                  src={iframeUrl}
                  title="ws-scrcpy stream"
                  allow="fullscreen"
                  className="scrcpy-iframe"
                  style={{ background: 'transparent' }}
                />
              </div>

              <div className="stream-hints mono text-[10px] text-muted flex gap-6 opacity-60 hover:opacity-100 transition-opacity">
                <div className="hint-item flex items-center gap-2">
                  <span className="bg-surface-highlight px-1 border border-panel-border text-primary">CLICK</span>
                  <span>TO_FOCUS_KEYBOARD</span>
                </div>
                <div className="hint-item flex items-center gap-2">
                  <span className="bg-surface-highlight px-1 border border-panel-border text-secondary">ALT+H</span>
                  <span>HOME</span>
                </div>
                <div className="hint-item flex items-center gap-2">
                  <span className="bg-surface-highlight px-1 border border-panel-border text-secondary">ALT+B</span>
                  <span>BACK</span>
                </div>
                <div className="hint-item flex items-center gap-2">
                  <span className="bg-surface-highlight px-1 border border-panel-border text-secondary">ALT+S</span>
                  <span>RECENTS</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="stream-placeholder">
              <div className="placeholder-icon">
                <Wifi size={48} className="text-neon" style={{ opacity: 0.3 }} />
              </div>
              <p className="mono text-muted" style={{ fontSize: '0.8rem', letterSpacing: '2px', marginTop: '16px' }}>
                {selectedDevice ? `${selectedDevice.status_label?.toUpperCase() || 'DEVICE_PENDING'} // CONNECT_ADB_TO_VIEW` : 'SELECT_NODE -> CONNECT -> VIEW_STREAM'}
              </p>
            </div>
          )}
        </div>

        <aside className="diagnostics-panel">
          <div className="diagnostics-header">
            <div>
              <p className="diagnostics-eyebrow">DEVICE_HEALTH</p>
              <h3>{selectedDevice ? selectedDevice.name : 'NO_NODE_SELECTED'}</h3>
            </div>
            <div className="diagnostics-tools">
              {selectedDevice && (
                <>
                  <button className="btn-outline diagnostics-btn" onClick={onRefreshDiagnostics} disabled={diagnosticsLoading}>
                    {diagnosticsLoading ? <LoaderCircle size={12} className="spin" /> : <RotateCw size={12} />}
                    REFRESH
                  </button>
                  <button className="btn-outline diagnostics-btn" onClick={handleCopyLogs}>
                    COPY_LOGS
                  </button>
                </>
              )}
            </div>
          </div>

          {selectedDevice ? (
            <>
              <div className="diagnostics-meta">
                <span className="mono">IMAGE: {selectedDevice.image || 'UNKNOWN'}</span>
                <span className="mono">IP: {selectedDevice.ip || 'WAITING_DHCP'}</span>
                <span className="mono">ADB: {(selectedDevice.adb_state || 'disconnected').toUpperCase()}</span>
              </div>

              <div className="checks-grid">
                {Object.entries(checks).map(([key, value]) => (
                  <div key={key} className={`check-card ${value ? 'ok' : ''}`}>
                    <span>{formatCheckLabel(key)}</span>
                    <strong>{value ? 'OK' : 'WAIT'}</strong>
                  </div>
                ))}
              </div>

              <div className="diagnostic-section">
                <div className="diagnostic-title">
                  <CircleHelp size={14} />
                  ADB_DISCOVERY
                </div>
                <pre>{diagnostics?.adb_raw_output || 'No adb diagnostic output yet.'}</pre>
              </div>

              <div className="diagnostic-section">
                <div className="diagnostic-title">
                  <Monitor size={14} />
                  DEVICE_LOG_TAIL
                </div>
                <pre>{diagnostics?.container_logs || 'No device logs available.'}</pre>
              </div>

              <div className="diagnostic-section compact">
                <div className="diagnostic-title">
                  <Wifi size={14} />
                  STREAM_GATEWAY
                </div>
                <pre>{diagnostics?.ws_scrcpy_logs || 'No ws-scrcpy logs available.'}</pre>
              </div>
            </>
          ) : (
            <div className="diagnostics-empty">
              <p className="mono text-muted">SELECT_A_DEVICE_TO_VIEW_STATUS_AND_LOGS</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
