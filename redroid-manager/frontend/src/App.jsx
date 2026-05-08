import { useState, useEffect, useCallback, useRef } from 'react';
import LoginForm from './components/LoginForm';
import Sidebar from './components/Sidebar';
import StreamViewer from './components/StreamViewer';
import Notification from './components/Notification';
import UserManagementModal from './components/UserManagementModal';
import ApkInstallModal from './components/ApkInstallModal';
import './App.css';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [selectedDiagnostics, setSelectedDiagnostics] = useState(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [notification, setNotification] = useState(null);
  const [activeDeviceAction, setActiveDeviceAction] = useState(null);

  const [showUserMgmt, setShowUserMgmt] = useState(false);
  const [apkTargetDevice, setApkTargetDevice] = useState(null);
  const reconnectAttemptsRef = useRef({});

  const showNotification = useCallback((msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  }, []);

  const syncSelectedDevice = useCallback((nextDevices) => {
    setSelectedDevice((prevSelected) => {
      if (!prevSelected) {
        return null;
      }
      return nextDevices.find((device) => device.id === prevSelected.id) || null;
    });
  }, []);

  const handleSelectDevice = useCallback((device) => {
    setSelectedDevice(device);
    setSelectedDiagnostics(null);
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    } catch (err) {
      console.error('Logout failed', err);
    }

    setCurrentUser(null);
    setDevices([]);
    setSelectedDevice(null);
    setSelectedDiagnostics(null);
    setShowUserMgmt(false);
  }, []);

  const fetchDevices = useCallback(async (options = {}) => {
    if (!currentUser) {
      return [];
    }

    const { silent = false } = options;
    if (!silent && devices.length === 0) {
      setLoading(true);
    }

    try {
      const res = await fetch('/api/devices', { credentials: 'include' });
      if (res.status === 401) {
        handleLogout();
        return [];
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return [];
      }

      const data = await res.json();
      if (data.status === 'success') {
        setDevices(data.data);
        syncSelectedDevice(data.data);
        return data.data;
      }
    } catch (err) {
      console.warn('Failed to fetch devices:', err.message);
    } finally {
      setLoading(false);
    }

    return [];
  }, [currentUser, devices.length, handleLogout, syncSelectedDevice]);

  const fetchDiagnostics = useCallback(async (deviceId, options = {}) => {
    if (!deviceId) {
      setSelectedDiagnostics(null);
      return null;
    }

    const { silent = false } = options;
    if (!silent) {
      setDiagnosticsLoading(true);
    }

    try {
      const res = await fetch(`/api/devices/${deviceId}/diagnostics`, { credentials: 'include' });
      if (res.status === 401) {
        handleLogout();
        return null;
      }

      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setSelectedDiagnostics(data.data);
        return data.data;
      }
    } catch (err) {
      console.warn('Failed to fetch diagnostics:', err.message);
    } finally {
      setDiagnosticsLoading(false);
    }

    return null;
  }, [handleLogout]);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/me', { credentials: 'include' });
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          return;
        }
        if (res.ok) {
          const data = await res.json();
          setCurrentUser(data.data);
        }
      } catch (err) {
        console.warn('Session check: backend not reachable', err.message);
      } finally {
        setIsInitialLoading(false);
      }
    };

    checkSession();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      return undefined;
    }

    const initialFetch = setTimeout(() => {
      fetchDevices();
    }, 0);
    const interval = setInterval(() => {
      fetchDevices({ silent: true });
    }, 5000);

    return () => {
      clearTimeout(initialFetch);
      clearInterval(interval);
    };
  }, [currentUser, fetchDevices]);

  useEffect(() => {
    if (!selectedDevice?.id) {
      return undefined;
    }

    const initialFetch = setTimeout(() => {
      fetchDiagnostics(selectedDevice.id);
    }, 0);
    const interval = setInterval(() => {
      fetchDiagnostics(selectedDevice.id, { silent: true });
    }, 7000);

    return () => {
      clearTimeout(initialFetch);
      clearInterval(interval);
    };
  }, [selectedDevice?.id, fetchDiagnostics]);

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
        credentials: 'include'
      });
      const data = await res.json();

      if (res.ok) {
        setCurrentUser({ username: data.username, role: data.role });
        showNotification('SYS_ACCESS_GRANTED');
      } else {
        throw new Error(data.detail || 'ACCESS_DENIED');
      }
    } catch (err) {
      showNotification(`ERR: ${err.message}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleAddDevice = async (name, port, features = [], width = 720, height = 1280, dpi = 320) => {
    const trimmedName = name.trim();
    const parsedPort = Number.parseInt(port, 10);

    if (!trimmedName) {
      showNotification('ERR: NODE_NAME_REQUIRED');
      return;
    }
    if (!Number.isInteger(parsedPort) || parsedPort < 1000 || parsedPort > 65535) {
      showNotification('ERR: INVALID_ADB_PORT');
      return;
    }

    setIsAdding(true);
    try {
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          port: parsedPort,
          features,
          width,
          height,
          dpi,
        }),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'DEPLOY_FAILED');
      }

      showNotification(`NODE [${trimmedName}] DEPLOYED`);
      setShowAddForm(false);
      await fetchDevices();
    } catch (err) {
      showNotification(`ERR: ${err.message}`);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteDevice = async (id, name) => {
    if (!window.confirm(`CONFIRM_DELETE_NODE: ${name}?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/devices/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'DELETE_FAILED');
      }

      showNotification(`NODE [${name}] TERMINATED`);
      setSelectedDiagnostics(null);
      await fetchDevices();
    } catch (err) {
      showNotification(`ERR: ${err.message}`);
    }
  };

  const connectAdb = useCallback(async (device, options = {}) => {
    const { silent = false } = options;
    try {
      if (!silent) {
        showNotification('INITIATING_ADB_UPLINK...');
      }
      const res = await fetch(`/api/devices/${device.id}/connect`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'ADB_CONNECT_FAILED');
      }

      reconnectAttemptsRef.current[device.id] = 0;
      if (!silent) {
        showNotification('ADB_UPLINK_ESTABLISHED');
      }
      const refreshedDevices = await fetchDevices({ silent: true });
      const updatedDevice = refreshedDevices.find((candidate) => candidate.id === device.id) || device;
      setSelectedDevice(updatedDevice);
      fetchDiagnostics(updatedDevice.id, { silent: true });
    } catch (err) {
      if (!silent) {
        showNotification(`ERR: ${err.message}`);
      }
    }
  }, [fetchDevices, fetchDiagnostics, showNotification]);

  useEffect(() => {
    if (!currentUser || activeDeviceAction) {
      return undefined;
    }

    Object.keys(reconnectAttemptsRef.current).forEach((deviceId) => {
      const device = devices.find((item) => item.id === deviceId);
      if (!device || !device.checks?.container_running || device.checks?.adb_connected) {
        reconnectAttemptsRef.current[deviceId] = 0;
      }
    });

    const candidate = devices.find((device) => (
      device.available_actions?.includes('connect')
      && device.checks?.container_running
      && device.checks?.has_ip
      && !device.checks?.adb_connected
      && (reconnectAttemptsRef.current[device.id] || 0) < 3
    ));

    if (!candidate) {
      return undefined;
    }

    reconnectAttemptsRef.current[candidate.id] = (reconnectAttemptsRef.current[candidate.id] || 0) + 1;
    const timer = setTimeout(() => {
      connectAdb(candidate, { silent: true });
    }, 1200);

    return () => clearTimeout(timer);
  }, [currentUser, devices, activeDeviceAction, connectAdb]);

  const handleDeviceAction = useCallback(async (device, action) => {
    const labels = {
      start: 'STARTING_NODE',
      stop: 'STOPPING_NODE',
      restart: 'RESTARTING_NODE'
    };

    setActiveDeviceAction(`${action}:${device.id}`);
    try {
      const res = await fetch(`/api/devices/${device.id}/${action}`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || `${action.toUpperCase()}_FAILED`);
      }

      showNotification(labels[action] || data.message || 'NODE_UPDATED');
      const refreshedDevices = await fetchDevices({ silent: true });
      const updatedDevice = refreshedDevices.find((candidate) => candidate.id === device.id);
      if (updatedDevice) {
        setSelectedDevice(updatedDevice);
        fetchDiagnostics(updatedDevice.id, { silent: true });
      }
    } catch (err) {
      showNotification(`ERR: ${err.message}`);
    } finally {
      setActiveDeviceAction(null);
    }
  }, [fetchDevices, fetchDiagnostics, showNotification]);

  if (isInitialLoading) {
    return <div className="app-container cyber-theme"><div className="loading-overlay">SYNCHRONIZING_SESSION...</div></div>;
  }

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
        onSelectDevice={handleSelectDevice}
        onLogout={handleLogout}
        showAddForm={showAddForm}
        setShowAddForm={setShowAddForm}
        handleAddDevice={handleAddDevice}
        isAdding={isAdding}
        handleDeleteDevice={handleDeleteDevice}
        connectAdb={connectAdb}
        currentUser={currentUser}
        onOpenUserMgmt={() => setShowUserMgmt(true)}
        onInstallApk={(device) => setApkTargetDevice(device)}
        onDeviceAction={handleDeviceAction}
        activeDeviceAction={activeDeviceAction}
      />
      <StreamViewer
        devices={devices}
        selectedDevice={selectedDevice}
        diagnostics={selectedDiagnostics}
        diagnosticsLoading={diagnosticsLoading}
        onSelectDevice={handleSelectDevice}
        onConnectAdb={connectAdb}
        onDeviceAction={handleDeviceAction}
        activeDeviceAction={activeDeviceAction}
        currentUser={currentUser}
        onRefreshDiagnostics={() => (selectedDevice?.id ? fetchDiagnostics(selectedDevice.id) : null)}
      />
      <Notification message={notification} />

      {showUserMgmt && (
        <UserManagementModal
          currentUser={currentUser}
          allDevices={devices}
          onClose={() => setShowUserMgmt(false)}
          showNotification={showNotification}
        />
      )}

      {apkTargetDevice && (
        <ApkInstallModal
          device={apkTargetDevice}
          onClose={() => setApkTargetDevice(null)}
          showNotification={showNotification}
        />
      )}
    </div>
  );
}

export default App;
