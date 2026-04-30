import { useState, useEffect, useCallback } from 'react';
import { Users, X, Plus, KeyRound, ShieldCheck, ShieldOff, Trash2, Eye, EyeOff, Monitor, Settings, UserCheck, UserX } from 'lucide-react';

/**
 * UserManagementModal
 * Modal สำหรับ admin จัดการ users ทั้งหมด
 * รองรับ: ดูรายการ, สร้างใหม่, เปลี่ยน role, เปลี่ยน password, ลบ, และ "จัดการสิทธิ์เครื่อง Android"
 */
export default function UserManagementModal({ currentUser, allDevices, onClose, showNotification }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // State สำหรับ form สร้าง user ใหม่
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ username: '', password: '', role: 'viewer' });
  const [isCreating, setIsCreating] = useState(false);

  // State สำหรับ modal เปลี่ยน password
  const [editPasswordId, setEditPasswordId] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  // State สำหรับ modal เปลี่ยน password ตัวเอง
  const [showSelfPwForm, setShowSelfPwForm] = useState(false);
  const [selfPwForm, setSelfPwForm] = useState({ current_password: '', new_password: '' });
  const [showSelfPw, setShowSelfPw] = useState(false);

  // State สำหรับจัดการสิทธิ์เครื่อง (Assignments)
  const [editAssignUserId, setEditAssignUserId] = useState(null);
  const [userAssignments, setUserAssignments] = useState([]); // รายชื่อเครื่องที่ user ได้รับสิทธิ์
  const [isAssigning, setIsAssigning] = useState(false);

  // ดึงรายการ users ทุกครั้งที่เปิด modal
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users', { credentials: 'include' });
      const data = await res.json();
      if (data.status === 'success') setUsers(data.data);
    } catch {
      showNotification('ERR: Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    const timer = setTimeout(() => fetchUsers(), 0);
    return () => clearTimeout(timer);
  }, [fetchUsers]);

  // ===== Assignment Handlers =====
  const fetchAssignments = useCallback(async (userId) => {
    setIsAssigning(true);
    try {
      const res = await fetch(`/api/users/${userId}/assignments`, { credentials: 'include' });
      const data = await res.json();
      if (data.status === 'success') setUserAssignments(data.data);
    } catch {
      showNotification('ERR: Failed to load assignments');
    } finally {
      setIsAssigning(false);
    }
  }, [showNotification]);

  const toggleAssignment = async (userId, deviceName, isAssigned) => {
    try {
      if (isAssigned) {
        // ลบสิทธิ์
        await fetch(`/api/users/${userId}/assignments/${deviceName}`, { 
          method: 'DELETE', 
          credentials: 'include' 
        });
      } else {
        // เพิ่มสิทธิ์
        await fetch(`/api/users/${userId}/assignments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_name: deviceName }),
          credentials: 'include'
        });
      }
      fetchAssignments(userId);
    } catch {
      showNotification('ERR: Update assignment failed');
    }
  };

  // ===== Handler: สร้าง user ใหม่ =====
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createForm.username || !createForm.password) return;
    setIsCreating(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      showNotification(`USER [${createForm.username}] CREATED`);
      setCreateForm({ username: '', password: '', role: 'viewer' });
      setShowCreateForm(false);
      fetchUsers();
    } catch (err) {
      showNotification(`ERR: ${err.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  // ===== Handler: เปลี่ยน password ของ user อื่น (admin) =====
  const handleChangePassword = async (userId, username) => {
    if (!newPassword || newPassword.length < 8) {
      showNotification('ERR: Password must be at least 8 characters');
      return;
    }
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      showNotification(`PASSWORD [${username}] UPDATED`);
      setEditPasswordId(null);
      setNewPassword('');
    } catch (err) {
      showNotification(`ERR: ${err.message}`);
    }
  };

  // ===== Handler: toggle role =====
  const handleToggleRole = async (user) => {
    const newRole = user.role === 'admin' ? 'viewer' : 'admin';
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      showNotification(`ROLE [${user.username}] → ${newRole.toUpperCase()}`);
      fetchUsers();
    } catch (err) {
      showNotification(`ERR: ${err.message}`);
    }
  };

  // ===== Handler: toggle active =====
  const handleToggleActive = async (user) => {
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !user.is_active }),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      showNotification(`USER [${user.username}] ${!user.is_active ? 'ENABLED' : 'DISABLED'}`);
      fetchUsers();
    } catch (err) {
      showNotification(`ERR: ${err.message}`);
    }
  };

  // ===== Handler: ลบ user =====
  const handleDelete = async (user) => {
    if (!window.confirm(`CONFIRM_PURGE_USER: ${user.username}?`)) return;
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      showNotification(`USER [${user.username}] PURGED`);
      fetchUsers();
    } catch (err) {
      showNotification(`ERR: ${err.message}`);
    }
  };

  // ===== Handler: user เปลี่ยน password ตัวเอง =====
  const handleSelfPassword = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/users/me/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selfPwForm),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      showNotification('PASSWORD_UPDATED');
      setShowSelfPwForm(false);
      setSelfPwForm({ current_password: '', new_password: '' });
    } catch (err) {
      showNotification(`ERR: ${err.message}`);
    }
  };

  return (
    /* Overlay พื้นหลัง */
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel glitch-box" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px' }}>

        {/* Header */}
        <div className="modal-header">
          <div className="modal-title">
            <Users size={20} className="text-neon" />
            <span>USER_MANAGEMENT</span>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {/* ปุ่มเปลี่ยน password ตัวเอง */}
            <button
              className="btn-outline"
              style={{ fontSize: '0.7rem', padding: '6px 12px' }}
              onClick={() => setShowSelfPwForm(!showSelfPwForm)}
            >
              <KeyRound size={14} /> MY_PASSWORD
            </button>
            <button className="btn-icon danger" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Form เปลี่ยน password ตัวเอง */}
        {showSelfPwForm && (
          <form className="self-pw-form" onSubmit={handleSelfPassword}>
            <span className="form-label">CHANGE_OWN_PASSWORD</span>
            <div className="self-pw-fields">
              <div className="pw-input-wrap">
                <input
                  type={showSelfPw ? 'text' : 'password'}
                  placeholder="CURRENT_PASSWORD"
                  value={selfPwForm.current_password}
                  onChange={e => setSelfPwForm(p => ({ ...p, current_password: e.target.value }))}
                  required
                />
                <button type="button" className="btn-icon" onClick={() => setShowSelfPw(!showSelfPw)}>
                  {showSelfPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <input
                type={showSelfPw ? 'text' : 'password'}
                placeholder="NEW_PASSWORD"
                value={selfPwForm.new_password}
                onChange={e => setSelfPwForm(p => ({ ...p, new_password: e.target.value }))}
                required
              />
              <button type="submit" className="btn-glitch small">CONFIRM</button>
            </div>
          </form>
        )}

        {/* ปุ่มเพิ่ม user ใหม่ */}
        <div className="modal-controls">
          <button
            className={`btn-glitch small ${showCreateForm ? 'active' : ''}`}
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            <Plus size={14} style={{ display: 'inline', marginRight: '6px' }} />
            {showCreateForm ? 'CANCEL' : 'CREATE_USER'}
          </button>
        </div>

        {/* Form สร้าง user ใหม่ */}
        {showCreateForm && (
          <form className="create-user-form" onSubmit={handleCreate}>
            <input
              type="text"
              placeholder="USERNAME"
              value={createForm.username}
              onChange={e => setCreateForm(p => ({ ...p, username: e.target.value }))}
              required
              autoFocus
            />
            <div className="pw-input-wrap">
              <input
                type={showPw ? 'text' : 'password'}
                placeholder="PASSWORD"
                value={createForm.password}
                onChange={e => setCreateForm(p => ({ ...p, password: e.target.value }))}
                required
              />
              <button type="button" className="btn-icon" onClick={() => setShowPw(!showPw)}>
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <select
              value={createForm.role}
              onChange={e => setCreateForm(p => ({ ...p, role: e.target.value }))}
              className="role-select"
            >
              <option value="viewer">VIEWER</option>
              <option value="admin">ADMIN</option>
            </select>
            <button type="submit" className="btn-glitch small" disabled={isCreating}>
              {isCreating ? 'DEPLOYING...' : 'DEPLOY_USER'}
            </button>
          </form>
        )}

        {/* ตารางรายการ users */}
        <div className="user-table-wrap">
          {loading ? (
            <div className="empty-state"><span className="text-muted">LOADING_USERS...</span></div>
          ) : (
            <table className="user-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>USERNAME</th>
                  <th>ROLE</th>
                  <th>STATUS</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id} className={!user.is_active ? 'user-disabled' : ''}>
                    <td className="text-muted" style={{ fontSize: '0.7rem' }}>#{user.id}</td>
                    <td>
                      <span className="user-name">
                        {user.username}
                        {user.username === currentUser?.username && (
                          <span className="self-badge">YOU</span>
                        )}
                      </span>
                    </td>
                    <td>
                      <span className={`role-badge ${user.role || 'viewer'}`}>
                        {(user.role || 'viewer').toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span className={`status-dot ${user.is_active !== false ? 'active' : 'inactive'}`}>
                        {user.is_active !== false ? 'ACTIVE' : 'DISABLED'}
                      </span>
                    </td>
                    <td>
                      <div className="action-row">
                        {/* ปุ่มเปิดจัดการสิทธิ์เครื่อง (Assignments) */}
                        <button
                          className={`btn-icon ${editAssignUserId === user.id ? 'active' : ''}`}
                          title="Assign Devices"
                          onClick={() => {
                            if (editAssignUserId === user.id) setEditAssignUserId(null);
                            else {
                              setEditAssignUserId(user.id);
                              fetchAssignments(user.id);
                            }
                          }}
                        >
                          <Monitor size={15} />
                        </button>

                        {/* ปุ่มเปลี่ยน password */}
                        {editPasswordId === user.id ? (
                          <div className="inline-pw-edit">
                            <input
                              type="password"
                              placeholder="NEW_PWD"
                              value={newPassword}
                              onChange={e => setNewPassword(e.target.value)}
                              style={{ width: '80px', fontSize: '0.7rem' }}
                            />
                            <button onClick={() => handleChangePassword(user.id, user.username)}>OK</button>
                            <button onClick={() => setEditPasswordId(null)}>✕</button>
                          </div>
                        ) : (
                          <button
                            className="btn-icon" title="Change Password"
                            onClick={() => { setEditPasswordId(user.id); setNewPassword(''); }}
                          >
                            <KeyRound size={15} />
                          </button>
                        )}

                        {/* ปุ่ม toggle active/disabled */}
                        <button
                          className={`btn-icon ${user.username === currentUser?.username ? 'disabled' : ''} ${!user.is_active ? 'warning' : ''}`}
                          title={user.is_active ? 'Disable User' : 'Enable User'}
                          onClick={() => user.username !== currentUser?.username && handleToggleActive(user)}
                          disabled={user.username === currentUser?.username}
                        >
                          {user.is_active ? <UserX size={15} /> : <UserCheck size={15} />}
                        </button>

                        {/* ปุ่ม toggle role */}
                        <button
                          className={`btn-icon ${user.username === currentUser?.username ? 'disabled' : ''}`}
                          onClick={() => user.username !== currentUser?.username && handleToggleRole(user)}
                          disabled={user.username === currentUser?.username}
                        >
                          {user.role === 'admin' ? <ShieldOff size={15} /> : <ShieldCheck size={15} />}
                        </button>

                        {/* ปุ่มลบ */}
                        {user.username !== currentUser?.username && (
                          <button
                            className="btn-icon danger" title="Delete User"
                            onClick={() => handleDelete(user)}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ส่วนจัดการสิทธิ์เครื่อง (แสดงเมื่อกดปุ่ม Monitor) */}
        {editAssignUserId && (
          <div className="assignment-panel">
            <div className="assignment-header">
              <Settings size={16} />
              <span>ASSIGN_DEVICES_FOR: <span className="text-neon">{users.find(u => u.id === editAssignUserId)?.username}</span></span>
            </div>
            {isAssigning ? (
              <div className="text-center p-4">LOADING_ASSIGNMENTS...</div>
            ) : (
              <div className="assignment-grid">
                {allDevices.length === 0 ? (
                  <div className="text-muted p-4">NO_DEVICES_FOUND</div>
                ) : (
                  allDevices.map(dev => {
                    const isAssigned = userAssignments.includes(dev.name);
                    return (
                      <div 
                        key={dev.id} 
                        className={`assignment-item ${isAssigned ? 'assigned' : ''}`}
                        onClick={() => toggleAssignment(editAssignUserId, dev.name, isAssigned)}
                      >
                        <div className="assign-checkbox">
                          {isAssigned ? '✓' : ''}
                        </div>
                        <div className="assign-info">
                          <div className="assign-name">{dev.name}</div>
                          <div className="assign-ip text-xs text-muted">{dev.ip}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
