import { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../auth/AuthContext';
import { Pill, CheckCircle, Clock, RefreshCw, LogOut } from 'lucide-react';

export default function PharmacyQueueScreen() {
    const { user, logout } = useAuth();
    const [queue, setQueue] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadQueue();
    }, []);

    const loadQueue = async () => {
        setLoading(true);
        try {
            const res = await api.get('/pharmacy/pending-consultations');
            setQueue(res.data || []);
        } catch (err) {
            console.error("Failed to load pharmacy queue:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleDispense = async (consultationId) => {
        if (!window.confirm("Mark this prescription as dispensed? This will automatically deduct the stock from inventory.")) return;
        
        try {
            await api.post('/pharmacy/dispense', { consultation_id: consultationId });
            alert("✅ Prescription dispensed and inventory updated!");
            loadQueue(); // Refresh the list
        } catch (err) {
            alert("Failed to dispense: " + (err.response?.data || err.message));
        }
    };

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6' }}>
            <header style={{ backgroundColor: '#059669', color: 'white', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>💊 Pharmacy Dispensing Queue</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span>Welcome, {user?.name}</span>
                    <button onClick={logout} style={{ background: 'none', border: '1px solid white', color: 'white', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}>Logout</button>
                </div>
            </header>

            <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Clock size={20} /> Pending Prescriptions ({queue.length})
                    </h3>
                    <button onClick={loadQueue} style={{ padding: '0.5rem 1rem', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <RefreshCw size={16} /> Refresh
                    </button>
                </div>

                {loading ? (
                    <p style={{ textAlign: 'center', padding: '3rem' }}>Loading queue...</p>
                ) : queue.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <CheckCircle size={48} color="#059669" style={{ margin: '0 auto 1rem auto' }} />
                        <p style={{ color: '#6b7280', fontSize: '1.125rem' }}>No pending prescriptions. Great job!</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {queue.map(item => (
                            <div key={item.id} style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #059669' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                                    <div>
                                        <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.125rem' }}>{item.patient_name}</h4>
                                        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>
                                            Prescribed by Dr. {item.doctor_name} • {new Date(item.created_at).toLocaleString()}
                                        </p>
                                        {item.diagnosis && (
                                            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#dc2626', fontWeight: 'bold' }}>
                                                Dx: {item.diagnosis}
                                            </p>
                                        )}
                                    </div>
                                    <button 
                                        onClick={() => handleDispense(item.id)}
                                        style={{ padding: '0.75rem 1.5rem', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                    >
                                        <CheckCircle size={18} /> Dispense
                                    </button>
                                </div>

                                {item.prescriptions && item.prescriptions.length > 0 ? (
                                    <div style={{ backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '6px' }}>
                                        <h5 style={{ margin: '0 0 0.75rem 0', color: '#374151', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Pill size={16} /> Prescribed Medications
                                        </h5>
                                        <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#4b5563' }}>
                                            {item.prescriptions.map((p, idx) => (
                                                <li key={idx} style={{ marginBottom: '0.5rem' }}>
                                                    {/* 👇 UPDATED TO SHOW QUANTITY 👇 */}
                                                    <strong>{p.product_name} (x{p.quantity || 1})</strong> 
                                                    {p.dosage && ` - ${p.dosage}`}
                                                    {p.frequency && `, ${p.frequency}`}
                                                    {p.duration && ` for ${p.duration}`}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : (
                                    <p style={{ color: '#6b7280', fontStyle: 'italic' }}>No specific medications prescribed.</p>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}