import { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../auth/AuthContext';
import { Users, Plus, Edit2, Power, LogOut } from 'lucide-react';

export default function StaffManagementScreen() {
    const { user, logout } = useAuth();
    const [staff, setStaff] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ employee_no: '', full_name: '', password: '', role: 'cashier' });
    const [editingId, setEditingId] = useState(null);

    useEffect(() => {
        loadStaff();
    }, []);

    const loadStaff = async () => {
        setLoading(true);
        try {
            const res = await api.get('/admin/staff');
            setStaff(res.data || []);
        } catch (err) {
            console.error("Failed to load staff:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingId) {
                await api.put(`/admin/staff?id=${editingId}`, {
                    full_name: formData.full_name,
                    role: formData.role,
                    is_active: formData.is_active
                });
            } else {
                await api.post('/admin/staff', formData);
            }
            alert(editingId ? "Staff updated successfully!" : "Staff created successfully!");
            setShowForm(false);
            setEditingId(null);
            setFormData({ employee_no: '', full_name: '', password: '', role: 'cashier' });
            loadStaff();
        } catch (err) {
            alert("Failed: " + (err.response?.data || err.message));
        }
    };

    const handleEdit = (member) => {
        setFormData({ 
            employee_no: member.employee_no, 
            full_name: member.full_name, 
            password: '', 
            role: member.role,
            is_active: member.is_active
        });
        setEditingId(member.id);
        setShowForm(true);
    };

    const handleToggleActive = async (member) => {
        if (!window.confirm(`Are you sure you want to ${member.is_active ? 'deactivate' : 'activate'} ${member.full_name}?`)) return;
        try {
            await api.put(`/admin/staff?id=${member.id}`, {
                full_name: member.full_name,
                role: member.role,
                is_active: !member.is_active
            });
            loadStaff();
        } catch (err) {
            alert("Failed to update status");
        }
    };

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6' }}>
            <header style={{ backgroundColor: '#4f46e5', color: 'white', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>👥 Staff Management</h2>
                <button onClick={logout} style={{ background: 'none', border: '1px solid white', color: 'white', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}>Logout</button>
            </header>

            <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: 0 }}>Team Members ({staff.length})</h3>
                    <button onClick={() => { setShowForm(true); setEditingId(null); setFormData({ employee_no: '', full_name: '', password: '', role: 'cashier' }); }} 
                        style={{ padding: '0.75rem 1.5rem', backgroundColor: '#4f46e5', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Plus size={18} /> Add New Staff
                    </button>
                </div>

                {showForm && (
                    <form onSubmit={handleSubmit} style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                        <h4 style={{ marginTop: 0, marginBottom: '1rem' }}>{editingId ? 'Edit Staff Member' : 'Create New Staff Member'}</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.875rem' }}>Employee No</label>
                                <input 
                                    required 
                                    type="text" 
                                    value={formData.employee_no} 
                                    onChange={(e) => setFormData({...formData, employee_no: e.target.value})} 
                                    disabled={!!editingId} 
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #d1d5db', boxSizing: 'border-box', backgroundColor: editingId ? '#f3f4f6' : 'white', color: '#111827' }} 
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.875rem' }}>Full Name</label>
                                <input 
                                    required 
                                    type="text" 
                                    value={formData.full_name} 
                                    onChange={(e) => setFormData({...formData, full_name: e.target.value})} 
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #d1d5db', boxSizing: 'border-box', color: '#111827' }} 
                                />
                            </div>
                            {!editingId && (
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.875rem' }}>Password</label>
                                    <input 
                                        required 
                                        type="password" 
                                        value={formData.password} 
                                        onChange={(e) => setFormData({...formData, password: e.target.value})} 
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #d1d5db', boxSizing: 'border-box', color: '#111827' }} 
                                    />
                                </div>
                            )}
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.875rem' }}>Role</label>
                                <select 
                                    value={formData.role} 
                                    onChange={(e) => setFormData({...formData, role: e.target.value})} 
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #d1d5db', boxSizing: 'border-box', color: '#111827' }}
                                >
                                    <option value="cashier">Cashier</option>
                                    <option value="pharmacist">Pharmacist</option>
                                    <option value="doctor">Doctor</option>
                                    <option value="lab_tech">Lab Technician</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => setShowForm(false)} style={{ padding: '0.75rem 1.5rem', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                            <button type="submit" style={{ padding: '0.75rem 1.5rem', backgroundColor: '#4f46e5', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>{editingId ? 'Update Staff' : 'Create Staff'}</button>
                        </div>
                    </form>
                )}

                {loading ? (
                    <p style={{ textAlign: 'center', padding: '3rem' }}>Loading staff...</p>
                ) : (
                    <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                                <tr>
                                    <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 'bold', color: '#6b7280' }}>Employee No</th>
                                    <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 'bold', color: '#6b7280' }}>Name</th>
                                    <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 'bold', color: '#6b7280' }}>Role</th>
                                    <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 'bold', color: '#6b7280' }}>Status</th>
                                    <th style={{ padding: '1rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: 'bold', color: '#6b7280' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {staff.map(member => (
                                    <tr key={member.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '1rem', fontFamily: 'monospace' }}>{member.employee_no}</td>
                                        <td style={{ padding: '1rem', fontWeight: '500' }}>{member.full_name}</td>
                                        <td style={{ padding: '1rem' }}>
                                            <span style={{ padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 'bold', backgroundColor: member.role === 'admin' ? '#dbeafe' : '#f3f4f6', color: member.role === 'admin' ? '#1e40af' : '#374151', textTransform: 'capitalize' }}>
                                                {member.role.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <span style={{ color: member.is_active ? '#059669' : '#dc2626', fontWeight: 'bold', fontSize: '0.875rem' }}>
                                                {member.is_active ? '● Active' : '○ Inactive'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                                            <button onClick={() => handleEdit(member)} style={{ marginRight: '0.5rem', padding: '0.5rem', backgroundColor: '#f3f4f6', border: 'none', borderRadius: '4px', cursor: 'pointer', color: '#4b5563' }} title="Edit">
                                                <Edit2 size={16} />
                                            </button>
                                            <button onClick={() => handleToggleActive(member)} style={{ padding: '0.5rem', backgroundColor: member.is_active ? '#fee2e2' : '#d1fae5', border: 'none', borderRadius: '4px', cursor: 'pointer', color: member.is_active ? '#dc2626' : '#059669' }} title={member.is_active ? "Deactivate" : "Activate"}>
                                                <Power size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}