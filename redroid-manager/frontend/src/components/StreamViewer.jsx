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
          <div className="w-full h-full flex items-center justify-center p-2">
            {/* ปรับให้เป็น Responsive และใช้ class ที่กำหนดไว้ใน CSS */}
            <div className={`device-frame ${isLandscape ? 'landscape' : 'portrait'} relative overflow-hidden`}>
              <iframe 
                key={selectedDevice.id}
                src={iframeUrl} 
                title="ws-scrcpy stream"
                allow="fullscreen"
                className="absolute border-none"
                style={{ 
                  /* ปรับแบบละเอียด: ดันส่วนหัวและด้านข้างของ ws-scrcpy ออกไปให้พ้นกรอบ */
                  width: isLandscape ? '110%' : '145%', 
                  height: isLandscape ? '110%' : '185%', 
                  top: isLandscape ? '-5%' : '-55%', 
                  left: isLandscape ? '-5%' : '-22.5%',
                  background: '#000',
                  /* เพิ่มความเนียนในการแสดงผล */
                  filter: 'contrast(1.02) brightness(1.02)'
                }}
              />
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
