import { Monitor, Wifi } from 'lucide-react';

export default function StreamViewer({ selectedDevice }) {
  const getIframeUrl = () => {
    const host = window.location.hostname || 'localhost';
    if (selectedDevice && selectedDevice.ip) {
      // ส่ง udid เป็น ip:5555 ให้ ws-scrcpy ดึง stream โดยตรง
      return `http://${host}:8001/#!action=stream&udid=${selectedDevice.ip}:5555`;
    }
    return null; // ไม่โหลด iframe ถ้ายังไม่ได้ select
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
          // key={selectedDevice.id} ทำให้ React สร้าง iframe ใหม่ทุกครั้งที่เปลี่ยน device
          <iframe 
            key={selectedDevice.id}
            src={iframeUrl} 
            title="ws-scrcpy stream"
            allow="fullscreen"
          />
        ) : (
          // แสดง placeholder เมื่อยังไม่ได้เลือก device
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
