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
      // ใช้พารามิเตอร์สำหรับโหมด Stream โดยเฉพาะ เพื่อให้ ws-scrcpy แสดงผลเต็มหน้าต่าง iframe
      const url = `http://${host}:8001/#!action=stream&udid=${encodeURIComponent(udid)}&player=mse&hide-header=1&hide-navbar=1&hide-footer=1&hide-menu=1&hide-control=1&ws=${encodeURIComponent(wsUrl)}`;
      
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
        {iframeUrl ? (
          <div className="w-full h-full flex items-start gap-6 p-4 overflow-auto">
            {/* หน้าจอแอนดรอยด์เพียวๆ ไม่มีกรอบ */}
            <div className="flex-1 bg-black shadow-2xl relative overflow-hidden" 
                 style={{ 
                   width: isLandscape ? '1156px' : '360px', 
                   height: isLandscape ? '850px' : '760px',
                   minWidth: isLandscape ? '1156px' : '360px'
                 }}>
              <iframe 
                key={selectedDevice.id}
                src={iframeUrl} 
                title="ws-scrcpy stream"
                allow="fullscreen"
                className="absolute inset-0 w-full h-full border-none"
                style={{ 
                  width: '112%', 
                  height: isLandscape ? '100%' : '145%', 
                  marginTop: isLandscape ? '0' : '-22%',
                  marginLeft: '0'
                }}
              />
            </div>

            {/* แถบควบคุมภายนอกยังคงอยู่เพื่อความสะดวก */}
            <div className="external-controller flex flex-col gap-4 p-4 bg-surface-highlight border border-panel-border rounded-xl sticky top-0">
              <button className="toolbar-btn" title="Power">
                <Smartphone size={20} className="text-danger" />
              </button>
              <div className="h-px bg-panel-border my-2" />
              <button className="toolbar-btn" title="Back">
                <RotateCcw size={20} />
              </button>
              <button className="toolbar-btn" title="Home">
                <div className="w-4 h-4 border-2 border-current rounded-full" />
              </button>
              <button className="toolbar-btn" title="Recent Tasks">
                <div className="w-4 h-4 border-2 border-current rounded-sm" />
              </button>
              <div className="h-px bg-panel-border my-2" />
              <button className="toolbar-btn" title="Rotate" onClick={() => setIsLandscape(!isLandscape)}>
                <RotateCw size={20} />
              </button>
              <button className="toolbar-btn" title="Full Screen">
                <Maximize size={20} />
              </button>
            </div>
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
