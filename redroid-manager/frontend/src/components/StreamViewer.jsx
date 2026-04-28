import { useState } from 'react';
import { Monitor, Wifi, RotateCw, RotateCcw, Maximize, Smartphone } from 'lucide-react';

export default function StreamViewer({ selectedDevice }) {
  const [isLandscape, setIsLandscape] = useState(false);

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
      // เพิ่มพารามิเตอร์ซ่อน UI ส่วนเกินของ ws-scrcpy ให้ครบถ้วนที่สุดเพื่อให้เหลือแต่หน้าจอ Android
      const url = `http://${host}:8001/#!action=stream&udid=${encodeURIComponent(udid)}&player=mse&hide-navbar=1&hide-control=1&hide-settings=1&hide-menu=1&hide-header=1&hide-list=1&inline=1&ws=${encodeURIComponent(wsUrl)}`;
      
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
      </div>
      
      <div className="iframe-container">
        {iframeUrl && (
          <div className="stream-toolbar">
            <button 
              className={`toolbar-btn ${!isLandscape ? 'active' : ''}`} 
              onClick={() => setIsLandscape(false)}
              title="Portrait Mode"
            >
              <Smartphone size={18} />
            </button>
            <button 
              className={`toolbar-btn ${isLandscape ? 'active' : ''}`} 
              onClick={() => setIsLandscape(true)}
              title="Landscape Mode"
            >
              <RotateCw size={18} />
            </button>
            <div style={{ width: '1px', background: 'var(--panel-border)', margin: '0 5px' }} />
            <button className="toolbar-btn" title="Expand View">
              <Maximize size={18} />
            </button>
          </div>
        )}

        {iframeUrl ? (
          <div className={`device-frame ${isLandscape ? 'landscape' : 'portrait'}`}>
            <iframe 
              key={selectedDevice.id}
              src={iframeUrl} 
              title="ws-scrcpy stream"
              allow="fullscreen"
            />
          </div>
        ) : (
          <div className="stream-placeholder">
            <div className="placeholder-icon">
              <Wifi size={48} className="text-neon" style={{ opacity: 0.3 }} />
            </div>
            <p className="mono text-muted" style={{ fontSize: '0.8rem', letterSpacing: '2px', marginTop: '16px' }}>
              SELECT_NODE → CONNECT → VIEW_STREAM
            </p>
            <p className="mono" style={{ fontSize: '0.7rem', color: '#444', marginTop: '8px' }}>
              กดปุ่ม CONNECT ที่ device เพื่อเริ่ม stream
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
