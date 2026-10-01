import { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../auth/AuthContext';
import { FlaskConical, ClipboardList, CheckCircle, Clock } from 'lucide-react';

export default function LabScreen() {
    const { user, logout } = useAuth();
    const [activeTab, setActiveTab] = useState('new-order');
    const [tests, setTests] = useState([]);
    const [queue, setQueue] = useState([]);
    const [loading, setLoading] = useState(true);

    // New Order Form State
    const [orderForm, setOrderForm] = useState({ patient_name: '', patient_phone: '', test_ids: [] });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [testsRes, queueRes] = await Promise.all([
                api.get('/lab/tests'),
                api.get('/lab/queue')
            ]);
            setTests(testsRes.data);
            setQueue(queueRes.data);
        } catch (err) {
            console.error("Failed to load lab data:", err);
        } finally {
            setLoading(false);
        }
    };

    const toggleTest = (testId) => {
        setOrderForm(prev => {
            const isSelected = prev.test_ids.includes(testId);
            return {
                ...prev,
                test_ids: isSelected 
                    ? prev.test_ids.filter(id => id !== testId)
                    : [...prev.test_ids, testId]
            };
        });
    };

    const handleCreateOrder = async (e) => {
        e.preventDefault();
        if (!orderForm.patient_name || orderForm.test_ids.length === 0) {
            alert("Please enter patient name and select at least one test.");
            return;
        }

        try {
            await api.post('/lab/orders', {
                ...orderForm,
                requested_by: user?.name || 'Unknown Doctor'
            });
            alert("Lab Order Created Successfully!");
            setOrderForm({ patient_name: '', patient_phone: '', test_ids: [] });
            loadData(); // Refresh queue
            setActiveTab('queue'); // Switch to queue tab
        } catch (err) {
            alert("Failed to create order: " + (err.response?.data || err.message));
        }
    };

    const handleSaveResult = async (itemId, result) => {
        if (!result.trim()) return;
        try {
            await api.post('/lab/results', {
                item_id: itemId,
                result: result,
                verified_by: user?.name || 'Lab Tech'
            });
            alert("Result saved and verified!");
            loadData();
        } catch (err) {
            alert("Failed to save result.");
        }
    };

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6' }}>
            <header style={{ backgroundColor: '#4c1d95', color: 'white', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>🧪 Laboratory Module</h2>
                <button onClick={logout} style={{ background: 'none', border: '1px solid white', color: 'white', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}>Logout</button>
            </header>

            <div style={{ backgroundColor: 'white', padding: '1rem 2rem', borderBottom: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button onClick={() => setActiveTab('new-order')} style={{ 
                        padding: '0.75rem 1.5rem', border: 'none', borderRadius: '6px', 
                        backgroundColor: activeTab === 'new-order' ? '#4c1d95' : '#f3f4f6', 
                        color: activeTab === 'new-order' ? 'white' : '#374151', cursor: 'pointer', fontWeight: 'bold' 
                    }}>
                        <ClipboardList size={16} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }}/> New Order
                    </button>
                    <button onClick={() => setActiveTab('queue')} style={{ 
                        padding: '0.75rem 1.5rem', border: 'none', borderRadius: '6px', 
                        backgroundColor: activeTab === 'queue' ? '#4c1d95' : '#f3f4f6', 
                        color: activeTab === 'queue' ? 'white' : '#374151', cursor: 'pointer', fontWeight: 'bold' 
                    }}>
                        <FlaskConical size={16} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }}/> Lab Queue ({queue.length})
                    </button>
                </div>
            </div>

            <div style={{ padding: '2rem' }}>
                {loading ? <p>Loading...</p> : (
                    <>
                        {activeTab === 'new-order' && (
                            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                                <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                    <h3 style={{ marginTop: 0 }}>Create New Lab Order</h3>
                                    <form onSubmit={handleCreateOrder}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Patient Name</label>
                                                <input required type="text" value={orderForm.patient_name} onChange={(e) => setOrderForm({...orderForm, patient_name: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #d1d5db', boxSizing: 'border-box' }} />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Patient Phone</label>
                                                <input type="text" value={orderForm.patient_phone} onChange={(e) => setOrderForm({...orderForm, patient_phone: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #d1d5db', boxSizing: 'border-box' }} />
                                            </div>
                                        </div>

                                        <h4 style={{ marginBottom: '1rem' }}>Select Tests</h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                                            {tests.map(test => (
                                                <label key={test.id} style={{ 
                                                    display: 'flex', alignItems: 'center', padding: '1rem', 
                                                    border: `1px solid ${orderForm.test_ids.includes(test.id) ? '#4c1d95' : '#d1d5db'}`,
                                                    borderRadius: '6px', cursor: 'pointer', backgroundColor: orderForm.test_ids.includes(test.id) ? '#f5f3ff' : 'white'
                                                }}>
                                                    <input type="checkbox" checked={orderForm.test_ids.includes(test.id)} onChange={() => toggleTest(test.id)} style={{ marginRight: '0.75rem', transform: 'scale(1.2)' }} />
                                                    <div>
                                                        <div style={{ fontWeight: 'bold' }}>{test.name}</div>
                                                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{test.category} - KES {test.price}</div>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>

                                        <button type="submit" style={{ width: '100%', padding: '1rem', backgroundColor: '#4c1d95', color: 'white', border: 'none', borderRadius: '6px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer' }}>
                                            Submit Order
                                        </button>
                                    </form>
                                </div>
                            </div>
                        )}

                        {activeTab === 'queue' && (
                            <div>
                                <h3 style={{ marginBottom: '1.5rem' }}>Pending Lab Orders</h3>
                                {queue.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: 'white', borderRadius: '8px' }}>
                                        <CheckCircle size={48} color="#059669" style={{ margin: '0 auto 1rem auto' }} />
                                        <p style={{ color: '#6b7280' }}>No pending orders. Great job!</p>
                                    </div>
                                ) : (
                                    queue.map(order => (
                                        <div key={order.id} style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '8px', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.5rem' }}>
                                                <div>
                                                    <h4 style={{ margin: 0 }}>{order.patient_name} <span style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 'normal' }}>({order.patient_phone})</span></h4>
                                                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>Requested by: {order.requested_by} • {new Date(order.created_at).toLocaleString()}</p>
                                                </div>
                                                <span style={{ 
                                                    padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: 'bold',
                                                    backgroundColor: order.status === 'completed' ? '#d1fae5' : '#fef3c7',
                                                    color: order.status === 'completed' ? '#065f46' : '#92400e'
                                                }}>
                                                    {order.status === 'completed' ? <><CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }}/> Completed</> : <><Clock size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }}/> In Progress</>}
                                                </span>
                                            </div>
                                            
                                            <div style={{ display: 'grid', gap: '1rem' }}>
                                                {order.items.map(item => (
                                                    <div key={item.id} style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontWeight: 'bold' }}>{item.test_name}</div>
                                                            <div style={{ fontSize: '0.875rem', color: item.status === 'completed' ? '#059669' : '#6b7280' }}>
                                                                Status: {item.status === 'completed' ? 'Verified' : 'Pending'}
                                                            </div>
                                                        </div>
                                                        {item.status === 'completed' ? (
                                                            <div style={{ fontWeight: 'bold', color: '#059669', backgroundColor: '#d1fae5', padding: '0.5rem 1rem', borderRadius: '4px' }}>
                                                                {item.result}
                                                            </div>
                                                        ) : (
                                                            <form onSubmit={(e) => {
                                                                e.preventDefault();
                                                                const input = e.target.elements.resultInput;
                                                                handleSaveResult(item.id, input.value);
                                                                input.value = '';
                                                            }} style={{ display: 'flex', gap: '0.5rem' }}>
                                                                <input name="resultInput" type="text" placeholder="Enter result..." required style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db' }} />
                                                                <button type="submit" style={{ padding: '0.5rem 1rem', backgroundColor: '#4c1d95', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Save</button>
                                                            </form>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}