import { useState, useEffect, useCallback } from 'react';
import LoginForm from './components/LoginForm';
import Sidebar from './components/Sidebar';
import StreamViewer from './components/StreamViewer';
import Notification from './components/Notification';
import UserManagementModal from './components/UserManagementModal';
import './App.css';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true); // สำหรับโหลด session ตอนแรก
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState(null);

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [notification, setNotification] = useState(null);

  // State สำหรับ User Management Modal
  const [showUserMgmt, setShowUserMgmt] = useState(false);

  const showNotification = useCallback((msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      // เรียก logout API เพื่อลบ cookie
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    } catch (err) {
      console.error("Logout failed", err);
    }
    setCurrentUser(null);
    setDevices([]);
    setSelectedDevice(null);
    setShowUserMgmt(false);
  }, []);

  const fetchDevices = useCallback(async () => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/devices', { credentials: 'include' });
      if (res.status === 401) { handleLogout(); return; }
      // ตรวจสอบ Content-Type เพื่อป้องกัน parse error กรณี backend ส่ง HTML
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) return;
      const data = await res.json();
      if (data.status === 'success') setDevices(data.data);
    } catch (err) {
      console.warn("Failed to fetch devices:", err.message);
    } finally {
      setLoading(false);
    }
  }, [currentUser, handleLogout]);

  // ตรวจสอบ Session ตอนเข้าเว็บครั้งแรก
  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/me', { credentials: 'include' });
        // ตรวจสอบ Content-Type ก่อน parse JSON เพื่อป้องกันกรณีที่ backend ยังไม่พร้อม
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          // Backend ไม่พร้อม หรือให้ HTML — ไม่ต้อง throw เพียงแค่รอให้ผ่าน
          return;
        }
        if (res.ok) {
          const data = await res.json();
          setCurrentUser(data.data);
        }
        // 401 = ยังไม่ได้ login เป็นเรื่องปกติ ไม่ต้อง log error
      } catch (err) {
        // เป็น network error จริงๆ (เช่น backend ไม่รัน)
        console.warn("Session check: backend not reachable", err.message);
      } finally {
        setIsInitialLoading(false);
      }
    };
    checkSession();
  }, []);

  useEffect(() => {
    if (currentUser) {
      // เรียก fetch ครั้งแรก
      const timer = setTimeout(() => {
        fetchDevices();
      }, 0);

      // polling ทุก 5 วินาที
      const interval = setInterval(fetchDevices, 5000);
      return () => {
        clearTimeout(timer);
        clearInterval(interval);
      };
    }
  }, [currentUser, fetchDevices]);

  // ===== Login =====
  const handleLogin = async (username, password) => {
    setIsLoggingIn(true);
    try {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
        credentials: 'include' // ส่ง/รับ cookie
      });
      const data = await res.json();

      if (res.ok) {
        setCurrentUser({ username: data.username, role: data.role });
        showNotification('SYS_ACCESS_GRANTED');
      } else {
        throw new Error(data.detail || "ACCESS_DENIED");
      }
    } catch (err) {
      showNotification(`ERR: ${err.message}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // ===== Device Handlers =====
  const handleAddDevice = async (name, port) => {
    if (!name || !port) return;
    setIsAdding(true);
    try {
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, port: parseInt(port) }),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "DEPLOY_FAILED");
      showNotification(`NODE [${name}] DEPLOYED`);
      setShowAddForm(false);
      fetchDevices();
      // หา device ที่เพิ่งสร้างใหม่แล้ว auto-connect หลัง 3 วินาที
      if (data.id) setTimeout(() => {
        fetchDevices();
        // สร้าง device stub เพื่อ connect ก่อน polling รอบถัดไป
        connectAdb({ id: data.id, name, ip: '', port: parseInt(port) });
      }, 3000);
    } catch (err) {
      showNotification(`ERR: ${err.message}`);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteDevice = async (id, name) => {
    if (!window.confirm(`CONFIRM_DELETE_NODE: ${name}?`)) return;
    try {
      const res = await fetch(`/api/devices/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail);
      }
      showNotification(`NODE [${name}] TERMINATED`);
      setSelectedDevice(prev => prev?.id === id ? null : prev);
      fetchDevices();
    } catch (err) {
      showNotification(`ERR: ${err.message}`);
    }
  };

  // รับ device object ทั้งก้อนเพื่อ auto-select หลัง connect สำเร็จ
  const connectAdb = useCallback(async (device) => {
    try {
      showNotification(`INITIATING_ADB_UPLINK...`);
      const res = await fetch(`/api/devices/${device.id}/connect`, { 
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        showNotification(`ADB_UPLINK_ESTABLISHED`);
        // auto-select device เพื่อแสดงหน้าจอทันที
        setSelectedDevice(device);
      } else {
        showNotification(`ERR_ADB_UPLINK_FAILED`);
      }
    } catch {
      showNotification(`ERR_ADB_UPLINK_FAILED`);
    }
  }, [showNotification]);

  if (isInitialLoading) {
    return <div className="app-container cyber-theme"><div className="loading-overlay">SYNCHRONIZING_SESSION...</div></div>;
  }

  // ===== Login screen =====
  if (!currentUser) {
    return (
      <>
        <div className="noise-overlay"></div>
        <LoginForm onLogin={handleLogin} isLoggingIn={isLoggingIn} />
        <Notification message={notification} />
      </>
    );
  }

  return (
    <div className="app-container cyber-theme">
      <div className="noise-overlay"></div>
      <Sidebar 
        devices={devices}
        loading={loading}
        selectedDevice={selectedDevice}
        onSelectDevice={setSelectedDevice}
        onLogout={handleLogout}
        showAddForm={showAddForm}
        setShowAddForm={setShowAddForm}
        handleAddDevice={handleAddDevice}
        isAdding={isAdding}
        handleDeleteDevice={handleDeleteDevice}
        connectAdb={connectAdb}
        currentUser={currentUser}
        onOpenUserMgmt={() => setShowUserMgmt(true)}
      />
      <StreamViewer selectedDevice={selectedDevice} />
      <Notification message={notification} />

      {/* User Management Modal — render เมื่อ showUserMgmt=true */}
      {showUserMgmt && (
        <UserManagementModal
          currentUser={currentUser}
          allDevices={devices} // ส่งรายการเครื่องทั้งหมดไปให้เลือก
          onClose={() => setShowUserMgmt(false)}
          showNotification={showNotification}
        />
      )}
    </div>
  );
}

export default App;
