import { Monitor } from 'lucide-react';

export default function StreamViewer({ selectedDevice }) {
  const getIframeUrl = () => {
    const host = window.location.hostname || 'localhost';
    if (selectedDevice && selectedDevice.ip) {
      return `http://${host}:8001/#!action=stream&udid=${selectedDevice.ip}:5555`;
    }
    return `http://${host}:8001/`;
  };

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
        <iframe 
          src={getIframeUrl()} 
          title="ws-scrcpy stream"
          allow="fullscreen"
        ></iframe>
      </div>
    </div>
  );
}
