import { LogOut, Plus, Activity, Users } from 'lucide-react';
import DeviceList from './DeviceList';
import DeviceForm from './DeviceForm';

/**
 * Sidebar
 * เพิ่มปุ่ม USER_MGMT ที่แสดงเฉพาะ admin เท่านั้น
 */
export default function Sidebar({ 
  devices, loading, selectedDevice, onSelectDevice, 
  onLogout, showAddForm, setShowAddForm, 
  handleAddDevice, isAdding, 
  handleDeleteDevice, connectAdb,
  currentUser, onOpenUserMgmt, onInstallApk
}) {
  // ใช้ optional chaining เผื่อ role เป็น undefined ตอน token เก่า
  const isAdmin = currentUser?.role === 'admin';

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="logo">
          <Activity className="text-neon" size={24} />
          <h1>REDROID<span className="text-neon">_CTRL</span></h1>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {/* ปุ่ม USER_MGMT แสดงเฉพาะ role=admin */}
          {isAdmin && (
            <button 
              className="btn-icon" 
              onClick={onOpenUserMgmt} 
              title="User Management"
              style={{ color: 'var(--text-muted)' }}
            >
              <Users size={18} />
            </button>
          )}
          <button className="btn-icon danger" onClick={onLogout} title="Logout">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* ปุ่ม Deploy Node เห็นเฉพาะ admin */}
      {isAdmin && (
        <div className="sidebar-controls">
          <button 
            className={`btn-glitch w-full ${showAddForm ? 'active' : ''}`}
            onClick={() => setShowAddForm(!showAddForm)}
          >
            <span className="btn-text">
              <Plus size={18} style={{ display: 'inline', marginRight: '8px' }} /> 
              {showAddForm ? 'CANCEL_DEPLOY' : 'DEPLOY_NEW_NODE'}
            </span>
          </button>
        </div>
      )}

      {showAddForm && isAdmin && (
        <DeviceForm 
          onAdd={handleAddDevice} 
          isAdding={isAdding} 
          onCancel={() => setShowAddForm(false)} 
        />
      )}

      <div className="device-list-container">
        <div className="list-header">
          <span className="text-muted text-xs tracking-widest">ACTIVE_NODES [{devices.length}]</span>
          {/* แสดง badge ของ current user */}
          {currentUser?.role && (
            <span className={`role-badge ${currentUser.role}`} style={{ fontSize: '0.6rem', padding: '2px 8px' }}>
              {currentUser.role.toUpperCase()}
            </span>
          )}
        </div>
        <DeviceList 
          devices={devices}
          loading={loading}
          selectedDevice={selectedDevice}
          onSelectDevice={onSelectDevice}
          onConnectAdb={connectAdb}
          onDeleteDevice={isAdmin ? handleDeleteDevice : null}
          onInstallApk={onInstallApk}
        />
      </div>
    </div>
  );
}
