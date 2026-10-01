import { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../auth/AuthContext';
import { Stethoscope, Search, Plus, Trash2, Save, FileText } from 'lucide-react';

export default function DoctorScreen() {
    const { user, logout } = useAuth();
    const [activeTab, setActiveTab] = useState('consultation');
    const [patients, setPatients] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [history, setHistory] = useState(null);
    const [loading, setLoading] = useState(false);

    // Consultation Form State
    const [form, setForm] = useState({
        vitals: '', symptoms: '', diagnosis: '', notes: ''
    });
    
    // 👇 Added 'quantity: 1' to the default state
    const [prescriptions, setPrescriptions] = useState([
        { product_id: '', dosage: '', frequency: '', duration: '', instructions: '', quantity: 1 }
    ]);
    const [products, setProducts] = useState([]);

    useEffect(() => {
        api.get('/pharmacy/products').then(res => setProducts(res.data || [])).catch(() => {});
    }, []);

    // Debounced patient search
    useEffect(() => {
        if (searchQuery.length > 2) {
            const timer = setTimeout(() => {
                api.get(`/doctor/patients?q=${searchQuery}`)
                    .then(res => setPatients(res.data || []))
                    .catch(() => setPatients([]));
            }, 500);
            return () => clearTimeout(timer);
        } else {
            setPatients([]);
        }
    }, [searchQuery]);

    const selectPatient = (patient) => {
        setSelectedPatient(patient);
        setSearchQuery(patient.name);
        loadHistory(patient.id);
    };

    const loadHistory = async (patientId) => {
        setLoading(true);
        try {
            const res = await api.get(`/doctor/history?patient_id=${patientId}`);
            console.log("📋 Patient History:", res.data);
            setHistory(res.data || {});
        } catch (err) {
            console.error("❌ Failed to load history:", err);
            setHistory({});
        } finally {
            setLoading(false);
        }
    };

    // 👇 Added 'quantity: 1' when adding a new row
    const addPrescriptionRow = () => {
        setPrescriptions([...prescriptions, { product_id: '', dosage: '', frequency: '', duration: '', instructions: '', quantity: 1 }]);
    };

    const removePrescriptionRow = (index) => {
        setPrescriptions(prescriptions.filter((_, i) => i !== index));
    };

    const updatePrescription = (index, field, value) => {
        const updated = [...prescriptions];
        updated[index][field] = value;
        setPrescriptions(updated);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedPatient && !searchQuery) {
            alert("Please select or enter a patient name.");
            return;
        }

        setLoading(true);
        try {
            await api.post('/doctor/consultations', {
                patient_id: selectedPatient?.id || '',
                patient_name: searchQuery,
                patient_phone: selectedPatient?.phone || '',
                doctor_name: user?.name || 'Doctor',
                ...form,
                prescriptions: prescriptions.filter(p => p.product_id !== '')
            });
            alert("Consultation saved successfully!");
            setForm({ vitals: '', symptoms: '', diagnosis: '', notes: '' });
            setPrescriptions([{ product_id: '', dosage: '', frequency: '', duration: '', instructions: '', quantity: 1 }]);
            if (selectedPatient) loadHistory(selectedPatient.id);
        } catch (err) {
            alert("Failed to save consultation: " + (err.response?.data || err.message));
        } finally {
            setLoading(false);
        }
    };

    // Safe fallbacks for history arrays
    const consultations = history?.consultations || [];
    const labOrders = history?.lab_orders || [];

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6' }}>
            <header style={{ backgroundColor: '#047857', color: 'white', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>🩺 Doctor Consultation</h2>
                <button onClick={logout} style={{ background: 'none', border: '1px solid white', color: 'white', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}>Logout</button>
            </header>

            <div style={{ backgroundColor: 'white', padding: '1rem 2rem', borderBottom: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button onClick={() => setActiveTab('consultation')} style={{ padding: '0.75rem 1.5rem', border: 'none', borderRadius: '6px', backgroundColor: activeTab === 'consultation' ? '#047857' : '#f3f4f6', color: activeTab === 'consultation' ? 'white' : '#374151', cursor: 'pointer', fontWeight: 'bold' }}>
                        <Stethoscope size={16} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }}/> New Consultation
                    </button>
                    <button onClick={() => setActiveTab('history')} disabled={!selectedPatient} style={{ padding: '0.75rem 1.5rem', border: 'none', borderRadius: '6px', backgroundColor: activeTab === 'history' ? '#047857' : '#f3f4f6', color: activeTab === 'history' ? 'white' : '#374151', cursor: 'pointer', fontWeight: 'bold', opacity: selectedPatient ? 1 : 0.5 }}>
                        <FileText size={16} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }}/> Patient History
                    </button>
                </div>
            </div>

            <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
                {/* Patient Search */}
                <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Search Patient</label>
                    <div style={{ position: 'relative' }}>
                        <Search size={20} style={{ position: 'absolute', left: '12px', top: '12px', color: '#9ca3af' }} />
                        <input 
                            type="text" 
                            placeholder="Type patient name or phone..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ width: '100%', padding: '0.75rem 0.75rem 0.75rem 2.5rem', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '1rem', boxSizing: 'border-box' }}
                        />
                        {patients.length > 0 && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid #d1d5db', borderRadius: '6px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: '200px', overflowY: 'auto' }}>
                                {patients.map(p => (
                                    <div key={p.id} onClick={() => selectPatient(p)} style={{ padding: '0.75rem', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }} onMouseEnter={(e) => e.target.style.backgroundColor = '#f9fafb'} onMouseLeave={(e) => e.target.style.backgroundColor = 'white'}>
                                        <div style={{ fontWeight: 'bold' }}>{p.name}</div>
                                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{p.phone} {p.gender && `• ${p.gender}`}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    {selectedPatient && <div style={{ marginTop: '0.5rem', color: '#047857', fontWeight: 'bold' }}>✅ Selected: {selectedPatient.name}</div>}
                </div>

                {activeTab === 'consultation' && (
                    <form onSubmit={handleSubmit} style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '1.5rem' }}>Consultation Details</h3>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Vitals</label>
                                <input type="text" placeholder="e.g., BP: 120/80, Temp: 37°C" value={form.vitals} onChange={(e) => setForm({...form, vitals: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #d1d5db', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Diagnosis</label>
                                <input type="text" placeholder="e.g., Uncomplicated Malaria" value={form.diagnosis} onChange={(e) => setForm({...form, diagnosis: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #d1d5db', boxSizing: 'border-box' }} />
                            </div>
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Symptoms</label>
                            <textarea rows="2" placeholder="e.g., Fever, headache, joint pain" value={form.symptoms} onChange={(e) => setForm({...form, symptoms: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #d1d5db', boxSizing: 'border-box' }} />
                        </div>

                        <h4 style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            Prescriptions 
                            <button type="button" onClick={addPrescriptionRow} style={{ padding: '0.5rem 1rem', backgroundColor: '#047857', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Plus size={16} /> Add Drug
                            </button>
                        </h4>

                        {prescriptions.map((p, idx) => (
                            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'end', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280' }}>Medication</label>
                                    <select value={p.product_id} onChange={(e) => updatePrescription(idx, 'product_id', e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db' }}>
                                        <option value="">Select Drug</option>
                                        {products.map(prod => <option key={prod.id} value={prod.id}>{prod.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280' }}>Dosage</label>
                                    <input type="text" placeholder="e.g., 500mg" value={p.dosage} onChange={(e) => updatePrescription(idx, 'dosage', e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280' }}>Frequency</label>
                                    <input type="text" placeholder="e.g., Twice daily" value={p.frequency} onChange={(e) => updatePrescription(idx, 'frequency', e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280' }}>Duration</label>
                                    <input type="text" placeholder="e.g., 5 days" value={p.duration} onChange={(e) => updatePrescription(idx, 'duration', e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db' }} />
                                </div>
                                {/*  NEW QUANTITY INPUT 👇 */}
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280' }}>Qty (Packs)</label>
                                    <input type="number" min="1" value={p.quantity} onChange={(e) => updatePrescription(idx, 'quantity', parseInt(e.target.value) || 1)} style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db' }} />
                                </div>
                                <button type="button" onClick={() => removePrescriptionRow(idx)} style={{ padding: '0.5rem', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginBottom: '2px' }}>
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Additional Notes</label>
                            <textarea rows="2" placeholder="Any follow-up instructions..." value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #d1d5db', boxSizing: 'border-box' }} />
                        </div>

                        <button type="submit" disabled={loading} style={{ width: '100%', padding: '1rem', backgroundColor: '#047857', color: 'white', border: 'none', borderRadius: '6px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
                            {loading ? 'Saving...' : <><Save size={20} /> Save Consultation & Send to Pharmacy</>}
                        </button>
                    </form>
                )}

                {activeTab === 'history' && history && (
                    <div>
                        <h3 style={{ marginBottom: '1.5rem' }}>Medical History for {selectedPatient?.name}</h3>
                        
                        {consultations.length === 0 && labOrders.length === 0 && (
                            <p style={{ textAlign: 'center', color: '#6b7280', padding: '2rem', backgroundColor: 'white', borderRadius: '8px' }}>No previous records found.</p>
                        )}

                        {consultations.map(c => (
                            <div key={c.id} style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '8px', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.5rem' }}>
                                    <div>
                                        <h4 style={{ margin: 0, color: '#047857' }}>{c.diagnosis || 'Consultation'}</h4>
                                        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>Dr. {c.doctor} • {new Date(c.date).toLocaleDateString()}</p>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                    <div><strong>Vitals:</strong> {c.vitals || 'N/A'}</div>
                                </div>
                                {c.prescriptions && c.prescriptions.length > 0 && (
                                    <div>
                                        <strong>Prescriptions:</strong>
                                        <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                                            {c.prescriptions.map((p, i) => (
                                                <li key={i} style={{ marginBottom: '0.25rem' }}>
                                                    <strong>{p.product_name}</strong> - {p.dosage}, {p.frequency} for {p.duration}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        ))}

                        {labOrders.length > 0 && (
                            <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                <h4 style={{ marginTop: 0, marginBottom: '1rem' }}>🧪 Lab Orders</h4>
                                {labOrders.map(lo => (
                                    <div key={lo.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '6px', marginBottom: '0.5rem' }}>
                                        <span>Requested by {lo.requested_by} on {new Date(lo.created_at).toLocaleDateString()}</span>
                                        <span style={{ fontWeight: 'bold', color: lo.status === 'completed' ? '#059669' : '#d97706', textTransform: 'capitalize' }}>{lo.status}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}