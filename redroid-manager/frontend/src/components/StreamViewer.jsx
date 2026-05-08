import { useState, useEffect, useRef, useCallback } from 'react';
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

  const iframeRef = useRef(null);

  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;
      
      // ลบ script/style เก่าถ้ามี (กรณี reload)
      doc.getElementById('__redroid_css')?.remove();
      doc.getElementById('__redroid_js')?.remove();
      
      const style = doc.createElement('style');
      style.id = '__redroid_css';
      style.textContent = `
        /* Reset body */
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          background: #000 !important;
          width: 100vw !important;
          height: 100vh !important;
        }
        /* ให้วิดีโอขยายเต็ม container แทนที่จะลอยขึ้นมาทับทั้งหมด */
        video, canvas {
          width: 100% !important;
          height: 100% !important;
          max-width: 100vw !important;
          max-height: 100vh !important;
          object-fit: contain !important;
          background: #000 !important;
        }
      `;
      doc.head.appendChild(style);

      const script = doc.createElement('script');
      script.id = '__redroid_js';
      script.textContent = `
        setInterval(() => {
          const medias = Array.from(document.querySelectorAll('video, canvas'));
          if (medias.length === 0) return;
          
          medias.forEach(media => {
              let current = media;
              while (current && current !== document.body && current.parentElement) {
                 const parent = current.parentElement;
                 Array.from(parent.children).forEach(sibling => {
                     const containsMedia = medias.some(m => sibling.contains(m));
                     if (!containsMedia && sibling.tagName !== 'STYLE' && sibling.tagName !== 'SCRIPT') {
                         
                         const rect = sibling.getBoundingClientRect();
                         const isVerticalToolbar = rect.width > 0 && rect.width <= 120 && rect.height > 100;
                         const isHorizontalToolbar = rect.height > 0 && rect.height <= 120 && rect.width > 100;
                         
                         const className = sibling.className || '';
                         const isControlClass = typeof className === 'string' && (className.includes('control-') || className.includes('toolbar') || className.includes('panel'));

                         // ซ่อนเฉพาะ Sibling ที่เป็นแถบเครื่องมือจริงๆ (กันเผลอซ่อนปุ่ม Play Overlay)
                         if (isVerticalToolbar || isHorizontalToolbar || isControlClass) {
                             sibling.style.setProperty('display', 'none', 'important');
                         }
                     }
                 });
                 current = parent;
              }
          });
          
          // ถ้ามี Overlay Play button ให้กดออโต้เพื่อเล่นวิดีโอ
          document.querySelectorAll('button').forEach(btn => {
             const text = btn.innerText || '';
             if (text.toLowerCase().includes('play') && btn.offsetParent !== null) {
                 btn.click();
             }
          });
        }, 500);
      `;
      doc.body.appendChild(script);

    } catch (e) {
      console.warn('[IFRAME-CSS] Cannot inject (cross-origin?):', e);
    }
  }, []);


  const getIframeUrl = (device) => {
    const ip = device?.ip;
    const canStream = device?.checks?.stream_ready;
    if (!canStream || !ip) {
      return null;
    }

    const udid = `${ip.trim()}:5555`;

    // wsUrl ผ่าน backend proxy (/api/stream/) — ไม่เปิด port 8001 สู่ public
    const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsBase = `${wsProto}://${window.location.host}`;
    const wsUrl = `${wsBase}/api/stream/?action=proxy-adb&remote=tcp:8886&udid=${encodeURIComponent(udid)}`;

    // iframe ชี้ผ่าน backend HTTP proxy /api/stream/ (ต้อง login แล้ว)
    const httpBase = window.location.origin;
    return `${httpBase}/api/stream/#!action=stream&udid=${encodeURIComponent(udid)}&player=mse&hide-header=1&hide-navbar=1&hide-footer=1&hide-menu=1&fitToScreen=true&keyboard=true&mouse=true&gamepad=true&ws=${encodeURIComponent(wsUrl)}`;
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
            <div className="stream-center">
              <div
                className={`scrcpy-shell scrcpy-shell--${orientation}`}
                style={(() => {
                  // ใช้ screen_width/height จาก Docker label ที่ backend return มา
                  const w = selectedDevice?.screen_width  || 720;
                  const h = selectedDevice?.screen_height || 1280;
                  // คำนวณ aspect-ratio ตาม orientation ที่ user เลือก
                  let ar;
                  if (orientation === 'landscape') {
                    ar = w >= h ? `${w} / ${h}` : `${h} / ${w}`;
                  } else if (orientation === 'portrait') {
                    ar = h >= w ? `${w} / ${h}` : `${h} / ${w}`;
                  } else {
                    // auto: ใช้ตาม resolution จริงของ device
                    ar = `${w} / ${h}`;
                  }
                  return { aspectRatio: ar };
                })()}
              >
                <iframe
                  key={`${selectedDevice.id}-${orientation}`}
                  src={iframeUrl}
                  title="ws-scrcpy stream"
                  allow="fullscreen; clipboard-read; clipboard-write; gamepad"
                  ref={iframeRef}
                  onLoad={handleIframeLoad}
                  className="scrcpy-iframe"
                  style={{ background: 'transparent' }}
                  tabIndex={0}
                />
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
