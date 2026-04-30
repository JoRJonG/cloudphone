import { useState } from 'react';
import { Monitor, Wifi, Smartphone, Layout } from 'lucide-react';

export default function StreamViewer({ selectedDevice }) {
  const [orientation, setOrientation] = useState('auto'); // auto, portrait, landscape

  const getIframeUrl = () => {
    // ดึง hostname และจัดการกรณี IPv6 (ต้องครอบด้วย [])
    let host = window.location.hostname || 'localhost';
    if (host.includes(':') && !host.startsWith('[')) {
      host = `[${host}]`;
    }

    const ip = selectedDevice?.ip;
    const isValidIp =
      ip &&
      typeof ip === 'string' &&
      ip.trim() !== '' &&
      ip.trim() !== 'null' &&
      ip.trim() !== 'undefined';

    if (selectedDevice && isValidIp) {
      const udid = `${ip.trim()}:5555`;
      const wsHost = window.location.hostname || 'localhost';
      
      // สร้าง WebSocket URL ตามรูปแบบที่ผู้ใช้งานทดสอบแล้วว่าใช้งานได้จริง
      const wsUrl = `ws://${wsHost}:8001/?action=proxy-adb&remote=tcp:8886&udid=${udid}`;
      
      // กลับไปใช้ #! สำหรับ main URL เพราะการใช้ ? ทำให้ ws-scrcpy ค้างที่หน้า Device Tracker
      // ใช้พารามิเตอร์สำหรับโหมด Stream โดยเฉพาะ เพื่อให้ ws-scrcpy แสดงผลเต็มหน้าต่าง iframe
      const url = `http://${host}:8001/#!action=stream&udid=${encodeURIComponent(udid)}&player=mse&hide-header=1&hide-navbar=1&hide-footer=1&hide-menu=1&ws=${encodeURIComponent(wsUrl)}`;
      
      return url;
    }

    return null;
  };

  const iframeUrl = getIframeUrl();

  return (
    <div className="main-content">
      <div className="topbar">
        <div className="breadcrumb mono flex items-center gap-2 text-sm">
          <Monitor size={16} className="text-neon" />
          {selectedDevice ? (
            <>
              <span className="text-muted">NODE // </span>
              <span className="text-white">{selectedDevice.name}</span>
              <span className="text-neon ml-2">[{selectedDevice.ip}:5555]</span>
            </>
          ) : (
            <span className="text-muted">AWAITING_NODE_SELECTION...</span>
          )}
        </div>
        
        {selectedDevice && (
          <div className="orientation-selector">
            <button 
              className={`orientation-btn ${orientation === 'auto' ? 'active' : ''}`}
              onClick={() => setOrientation('auto')}
              title="Auto Mode"
            >
              AUTO
            </button>
            <button 
              className={`orientation-btn ${orientation === 'portrait' ? 'active' : ''}`}
              onClick={() => setOrientation('portrait')}
              title="Portrait Mode"
            >
              PORTRAIT
            </button>
            <button 
              className={`orientation-btn ${orientation === 'landscape' ? 'active' : ''}`}
              onClick={() => setOrientation('landscape')}
              title="Landscape Mode"
            >
              LANDSCAPE
            </button>
          </div>
        )}
      </div>
      
      <div className="iframe-container relative">
        {iframeUrl ? (
          <div className="flex items-center justify-center w-full h-full">
            {orientation === 'auto' ? (
              /* Auto Mode: High-tech monitor frame */
              <div className="cyber-monitor-frame" style={{ width: 'calc(100% - 40px)', height: 'calc(100% - 40px)' }}>
                <div className="cyber-monitor-inner">
                  <iframe 
                    key={`${selectedDevice.id}-auto`}
                    src={iframeUrl} 
                    title="ws-scrcpy stream auto"
                    allow="fullscreen"
                    className="iframe-clip-auto"
                    style={{ background: 'transparent' }}
                  />
                </div>
              </div>
            ) : (
              /* Phone Frame Mode: Portrait or Landscape */
              <div className={`cyber-phone-frame ${orientation}`}>
                <div className="cyber-phone-buttons"></div>
                <div className="cyber-phone-screen">
                  <iframe 
                    key={`${selectedDevice.id}-${orientation}`}
                    src={iframeUrl} 
                    title={`ws-scrcpy stream ${orientation}`}
                    allow="fullscreen"
                    className={`iframe-clip-${orientation}`}
                    style={{ background: 'transparent' }}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="stream-placeholder">
            <div className="placeholder-icon">
              <Wifi size={48} className="text-neon" style={{ opacity: 0.3 }} />
            </div>
            <p className="mono text-muted" style={{ fontSize: '0.8rem', letterSpacing: '2px', marginTop: '16px' }}>
              SELECT_NODE → CONNECT → VIEW_STREAM
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
