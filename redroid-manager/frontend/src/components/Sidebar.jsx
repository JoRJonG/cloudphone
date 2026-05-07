import { useState } from 'react';
import { LogOut, Plus, Activity, Users, Search, Filter } from 'lucide-react';
import DeviceList from './DeviceList';
import DeviceForm from './DeviceForm';

export default function Sidebar({
  devices,
  loading,
  selectedDevice,
  onSelectDevice,
  onLogout,
  showAddForm,
  setShowAddForm,
  handleAddDevice,
  isAdding,
  handleDeleteDevice,
  connectAdb,
  currentUser,
  onOpenUserMgmt,
  onInstallApk,
  onDeviceAction,
  activeDeviceAction
}) {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const isAdmin = currentUser?.role === 'admin';

  const filteredDevices = devices.filter((device) => {
    const matchesSearch = device.name.toLowerCase().includes(search.trim().toLowerCase());
    const matchesStage = stageFilter === 'all' || device.runtime_stage === stageFilter;
    return matchesSearch && matchesStage;
  });

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="logo">
          <Activity className="text-neon" size={24} />
          <h1>REDROID<span className="text-neon">_CTRL</span></h1>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
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
          <div className="list-header-row">
            <span className="text-muted text-xs tracking-widest">
              ACTIVE_NODES [{filteredDevices.length}/{devices.length}]
            </span>
            {currentUser?.role && (
              <span className={`role-badge ${currentUser.role}`} style={{ fontSize: '0.6rem', padding: '2px 8px' }}>
                {currentUser.role.toUpperCase()}
              </span>
            )}
          </div>

          <div className="device-toolbar">
            <label className="sidebar-search">
              <Search size={14} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="SEARCH_NODE"
                autoComplete="off"
              />
            </label>

            <label className="sidebar-filter">
              <Filter size={13} />
              <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
                <option value="all">ALL</option>
                <option value="stream_ready">STREAM_READY</option>
                <option value="adb_connected">ADB_CONNECTED</option>
                <option value="running">RUNNING</option>
                <option value="booting">BOOTING</option>
                <option value="stopped">STOPPED</option>
              </select>
            </label>
          </div>
        </div>

        <DeviceList
          devices={filteredDevices}
          loading={loading}
          selectedDevice={selectedDevice}
          onSelectDevice={onSelectDevice}
          onConnectAdb={connectAdb}
          onDeleteDevice={isAdmin ? handleDeleteDevice : null}
          onInstallApk={onInstallApk}
          onDeviceAction={isAdmin ? onDeviceAction : null}
          activeDeviceAction={activeDeviceAction}
        />
      </div>
    </div>
  );
}
