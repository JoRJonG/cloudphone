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

  // Inject JS เข้า iframe: auto-play + ตั้ง video resolution ตาม device
  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;

      // ลบ script/style เก่าถ้ามี (กรณี reload)
      doc.getElementById('__redroid_js')?.remove();
      doc.getElementById('__redroid_css')?.remove();

      // ฉีด CSS เพื่อให้ iframe ไม่มี scrollbar และจัดกึ่งกลางพอดี
      const style = doc.createElement('style');
      style.id = '__redroid_css';
      style.textContent = `
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          height: 100% !important;
          overflow: hidden !important;
          background: transparent !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        /* Container หลักของ scrcpy */
        #app, .device-view, .scrcpy-container {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 100% !important;
          height: 100% !important;
        }
        /* ซ่อน scrollbar */
        ::-webkit-scrollbar { display: none !important; }
      `;
      doc.head.appendChild(style);

      // Resolution เป้าหมาย (จาก Docker label ของ device)
      const targetW = selectedDevice?.screen_width  || 1280;
      const targetH = selectedDevice?.screen_height || 720;
      const targetFps = selectedDevice?.screen_fps  || 45;

      const script = doc.createElement('script');
      script.id = '__redroid_js';
      script.textContent = `
        (function() {
          var TARGET_W = ${targetW};
          var TARGET_H = ${targetH};
          var TARGET_FPS = ${targetFps};
          var videoSettingsApplied = false;

          function setNativeValue(el, value) {
            var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
            if (nativeSetter && nativeSetter.set) nativeSetter.set.call(el, String(value));
            el.dispatchEvent(new Event('input',  { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }

          function applyVideoSettings() {
            if (videoSettingsApplied) return;

            var allInputs = Array.from(document.querySelectorAll('input'));
            var numInputs = allInputs.filter(function(i) {
              return i.type === 'number' || (i.type === 'text' && /^\\d*$/.test(i.value.trim()));
            });

            var wInput = null, hInput = null, fpsInput = null;

            allInputs.forEach(function(inp) {
              // หา label หรือ parent ที่ครอบอยู่ และมีความยาวข้อความไม่เกิน 50 ตัวอักษร
              // เพื่อป้องกันการเหมารวม text ของทั้ง panel
              var text = '';
              if (inp.parentElement) text += inp.parentElement.innerText;
              if (inp.previousSibling && inp.previousSibling.nodeType === 3) text += inp.previousSibling.nodeValue;
              
              text = text.toLowerCase();
              if (text.length < 50) {
                if (text.includes('width')) wInput = inp;
                if (text.includes('height')) hInput = inp;
                if (text.includes('fps') || text.includes('framerate')) fpsInput = inp;
              }
            });

            if (!wInput || !hInput) {
              if (numInputs.length >= 2) {
                wInput = numInputs[numInputs.length - 2];
                hInput = numInputs[numInputs.length - 1];
              }
            }

            if (!wInput || !hInput) return;

            var wOk = parseInt(wInput.value) === TARGET_W;
            var hOk = parseInt(hInput.value) === TARGET_H;
            var fpsOk = !fpsInput || parseInt(fpsInput.value) === TARGET_FPS;

            if (wOk && hOk && fpsOk) {
              videoSettingsApplied = true;
              return;
            }

            setNativeValue(wInput, TARGET_W);
            setNativeValue(hInput, TARGET_H);
            if (fpsInput) setNativeValue(fpsInput, TARGET_FPS);

            var btns = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
            for (var i = 0; i < btns.length; i++) {
              var label = (btns[i].innerText || btns[i].value || '').toLowerCase();
              if (label.includes('change video') || label.includes('apply')) {
                btns[i].click();
                videoSettingsApplied = true;
                console.log('[REDROID] Video settings applied: ' + TARGET_W + 'x' + TARGET_H + ' @' + TARGET_FPS + 'fps');
                break;
              }
            }
          }

          function autoPlay() {
            document.querySelectorAll('button').forEach(function(btn) {
              var text = btn.innerText || '';
              if (text.toLowerCase().includes('play') && btn.offsetParent !== null) {
                btn.click();
              }
            });
          }

          var interval = setInterval(function() {
            autoPlay();
            applyVideoSettings();
          }, 1000);

          setTimeout(function() { clearInterval(interval); }, 30000);
        })();
      `;
      doc.body.appendChild(script);

    } catch (e) {
      console.warn('[IFRAME-JS] Cannot inject (cross-origin?):', e);
    }
  }, [selectedDevice]);


  const getIframeUrl = (device) => {
    const ip = device?.ip;
    const canStream = device?.checks?.stream_ready;
    if (!canStream || !ip) {
      return null;
    }

    const udid = `${ip.trim()}:5555`;

    const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsBase = `${wsProto}://${window.location.host}`;
    const wsUrl = `${wsBase}/api/stream/?action=proxy-adb&remote=tcp:8886&udid=${encodeURIComponent(udid)}`;

    const screenW = device?.screen_width  || 1280;
    const screenH = device?.screen_height || 720;
    const screenFps = device?.screen_fps || 45;

    const httpBase = window.location.origin;
    return `${httpBase}/api/stream/#!action=stream&udid=${encodeURIComponent(udid)}&player=broadway&hide-header=1&hide-navbar=1&hide-footer=1&hide-menu=1&fitToScreen=true&keyboard=true&mouse=true&gamepad=true&max-width=${screenW}&max-height=${screenH}&max-fps=${screenFps}&ws=${encodeURIComponent(wsUrl)}`;
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
        <div className="iframe-container">
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
              <div className={`device-frame ${orientation === 'auto' ? '' : orientation}`}>
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
                {selectedDevice.screen_width && (
                  <span className="mono">
                    DISPLAY: {selectedDevice.screen_width}x{selectedDevice.screen_height} @{selectedDevice.screen_fps || 45}FPS {selectedDevice.screen_dpi}DPI
                  </span>
                )}
                {(selectedDevice.cpu_cores || selectedDevice.memory_limit) && (
                  <span className="mono">
                    HW: {selectedDevice.cpu_cores ? `${selectedDevice.cpu_cores}C ` : ''}{selectedDevice.memory_limit ? selectedDevice.memory_limit : ''}
                  </span>
                )}
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
