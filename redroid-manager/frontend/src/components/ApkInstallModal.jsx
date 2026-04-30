import { useState, useRef, useCallback } from 'react';
import { X, Upload, Package, CheckCircle, XCircle, Loader, FileArchive } from 'lucide-react';

/**
 * ApkInstallModal
 * Modal สำหรับอัปโหลดและติดตั้ง APK บน Redroid device ที่เลือก
 */
export default function ApkInstallModal({ device, onClose, showNotification }) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | uploading | success | error
  const [resultMessage, setResultMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef(null);

  const handleFile = (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.apk')) {
      showNotification('ERR: ไฟล์ต้องเป็น .apk เท่านั้น');
      return;
    }
    setSelectedFile(file);
    setStatus('idle');
    setResultMessage('');
    setProgress(0);
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleInstall = async () => {
    if (!selectedFile || status === 'uploading') return;

    setStatus('uploading');
    setProgress(0);
    setResultMessage('');

    // simulate progress เพื่อ UX ที่ดีขึ้น (จริงๆ fetch ไม่มี progress event)
    const fakeProgress = setInterval(() => {
      setProgress(prev => {
        if (prev >= 85) { clearInterval(fakeProgress); return prev; }
        return prev + Math.random() * 15;
      });
    }, 400);

    try {
      const formData = new FormData();
      formData.append('apk_file', selectedFile);

      const res = await fetch(`/api/devices/${device.id}/install-apk`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      clearInterval(fakeProgress);
      setProgress(100);

      const data = await res.json();

      if (!res.ok) {
        setStatus('error');
        setResultMessage(data.detail || 'INSTALL_FAILED');
        showNotification(`ERR: ${data.detail || 'INSTALL_FAILED'}`);
      } else {
        setStatus('success');
        setResultMessage(data.message || 'APK installed successfully');
        showNotification(`APK_INSTALLED: ${selectedFile.name}`);
      }
    } catch (err) {
      clearInterval(fakeProgress);
      setStatus('error');
      setResultMessage(err.message || 'NETWORK_ERROR');
      showNotification(`ERR: ${err.message}`);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleReset = () => {
    setSelectedFile(null);
    setStatus('idle');
    setResultMessage('');
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel apk-modal">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title">
            <Package size={16} />
            INSTALL_APK
            <span className="apk-device-tag">→ {device.name}</span>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Drop Zone */}
        <div className="apk-body">
          <div
            className={`apk-dropzone ${isDragging ? 'dragging' : ''} ${selectedFile ? 'has-file' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => !selectedFile && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".apk"
              style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files[0])}
            />

            {!selectedFile ? (
              <>
                <Upload size={36} className="apk-drop-icon" />
                <p className="apk-drop-title">DROP APK HERE</p>
                <p className="apk-drop-sub">or click to browse — .apk files only</p>
              </>
            ) : (
              <div className="apk-file-info">
                <FileArchive size={32} className="text-neon" />
                <div className="apk-file-meta">
                  <span className="apk-file-name">{selectedFile.name}</span>
                  <span className="apk-file-size">{formatBytes(selectedFile.size)}</span>
                </div>
                {status === 'idle' && (
                  <button
                    className="btn-icon danger"
                    onClick={(e) => { e.stopPropagation(); handleReset(); }}
                    title="Remove file"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Progress Bar */}
          {status === 'uploading' && (
            <div className="apk-progress-wrap">
              <div className="apk-progress-label">
                <Loader size={12} className="spin" />
                <span>TRANSFERRING &amp; INSTALLING...</span>
                <span className="mono">{Math.round(progress)}%</span>
              </div>
              <div className="apk-progress-bar">
                <div
                  className="apk-progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Result */}
          {(status === 'success' || status === 'error') && (
            <div className={`apk-result ${status}`}>
              {status === 'success'
                ? <CheckCircle size={16} />
                : <XCircle size={16} />
              }
              <span className="apk-result-msg">{resultMessage}</span>
            </div>
          )}

          {/* Device info strip */}
          <div className="apk-device-strip">
            <span className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
              TARGET: <span style={{ color: 'var(--secondary)' }}>{device.name}</span>
              &nbsp;|&nbsp; IP: <span style={{ color: 'var(--secondary)' }}>{device.ip || 'DHCP'}</span>
              &nbsp;|&nbsp; PORT: <span style={{ color: 'var(--secondary)' }}>{device.port || '-'}</span>
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="apk-footer">
          {status === 'success' ? (
            <button className="btn-glitch small" onClick={handleReset}>
              INSTALL_ANOTHER
            </button>
          ) : (
            <button
              className="btn-glitch small"
              onClick={handleInstall}
              disabled={!selectedFile || status === 'uploading'}
            >
              <span className="btn-text">
                {status === 'uploading'
                  ? 'INSTALLING...'
                  : <><Package size={14} style={{ display: 'inline', marginRight: 6 }} />INSTALL_APK</>
                }
              </span>
            </button>
          )}
          <button className="btn-outline" onClick={onClose}>
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}
