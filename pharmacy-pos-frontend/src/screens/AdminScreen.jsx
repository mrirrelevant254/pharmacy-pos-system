import { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../auth/AuthContext';
import { Package, TrendingUp, AlertTriangle, ShoppingCart, RefreshCw, Scan, Plus, X, Trash2, Edit2, Calendar } from 'lucide-react';

export default function AdminScreen() {
    const { logout } = useAuth();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [inventory, setInventory] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Analysis state
    const [advancedStats, setAdvancedStats] = useState(null);
    const [productRevenue, setProductRevenue] = useState([]);
    const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

    // Stock Take & Receive state (kept simple for brevity)
    const [stockTake, setStockTake] = useState({ productId: '', batchId: '', newQty: '', reason: 'stock_take_adjustment' });
    const [scanInput, setScanInput] = useState('');
    const [showReceiveForm, setShowReceiveForm] = useState(false);
    const [receiveForm, setReceiveForm] = useState({ product_id: '', batch_no: '', quantity: '', cost_price: '', expiry_date: '' });

    useEffect(() => {
        loadData();
        loadAdvancedAnalytics();
    }, []);

    // Reload analytics when dates change
    useEffect(() => {
        if (activeTab === 'analysis') {
            loadAdvancedAnalytics();
        }
    }, [startDate, endDate, activeTab]);

    const loadData = async () => {
        setLoading(true);
        try {
            const invRes = await api.get('/admin/inventory');
            setInventory(invRes.data);
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    const loadAdvancedAnalytics = async () => {
        try {
            const [statsRes, prodRes] = await Promise.all([
                api.get(`/admin/analytics/advanced?start=${startDate}&end=${endDate}`),
                api.get(`/admin/analytics/products?start=${startDate}&end=${endDate}`)
            ]);
            setAdvancedStats(statsRes.data);
            setProductRevenue(prodRes.data);
        } catch (err) { console.error("Failed to load analytics:", err); }
    };

    const handleReceiveStock = async (e) => {
        e.preventDefault();
        try {
            await api.post('/pharmacy/batches', { ...receiveForm, quantity: parseInt(receiveForm.quantity), cost_price: parseFloat(receiveForm.cost_price) });
            alert('Stock received!');
            setShowReceiveForm(false);
            setReceiveForm({ product_id: '', batch_no: '', quantity: '', cost_price: '', expiry_date: '' });
            loadData();
        } catch (err) { alert('Failed: ' + err.message); }
    };

    const handleBarcodeScan = async (e) => {
        if (e) e.preventDefault();
        if (!scanInput.trim()) return;
        try {
            const res = await api.get(`/pharmacy/products/barcode/${scanInput.trim()}`);
            const invItem = inventory.find(item => item.id === res.data.id);
            if (invItem) {
                setStockTake({ productId: invItem.id, batchId: invItem.batches?.[0]?.id || '', newQty: '', reason: 'stock_take_adjustment' });
                alert(`Found: ${res.data.name}`);
            }
        } catch (err) { alert('Not found'); }
        setScanInput('');
    };

    const handleStockUpdate = async (e) => {
        e.preventDefault();
        try {
            await api.post('/admin/stock-update', { ...stockTake, new_qty: parseInt(stockTake.newQty) });
            alert('Updated!');
            setStockTake({ productId: '', batchId: '', newQty: '', reason: 'stock_take_adjustment' });
            loadData();
        } catch (err) { alert('Failed'); }
    };

    const handleDeleteBatch = async (batchId, productName) => {
        if (!window.confirm(`Delete batch from ${productName}?`)) return;
        try {
            const item = inventory.find(i => i.batches?.some(b => b.id === batchId));
            await api.post('/admin/stock-update', { product_id: item?.id, batch_id: batchId, new_qty: 0, reason: 'deleted' });
            loadData();
        } catch (err) { alert('Failed'); }
    };

    const openEditForm = (batch, productId) => {
        // Simplified edit for this example
        alert(`Edit functionality for batch ${batch.batch_no} would open a modal here.`);
    };

    const lowStockItems = inventory.filter(item => item.needs_reorder);
    const expiringSoon = inventory.flatMap(item => item.batches?.filter(b => b.is_expiring).map(b => ({ ...b, productName: item.name })) || []);

    // Helper for Payment Chart
    const maxPayment = advancedStats?.payment_methods?.reduce((max, p) => p.total > max ? p.total : max, 0) || 1;
    const maxProductRev = productRevenue?.reduce((max, p) => p.revenue > max ? p.revenue : max, 1) || 1;

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6' }}>
            <header style={{ backgroundColor: '#1e3a8a', color: 'white', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>🏥 Admin Dashboard</h2>
                <button onClick={logout} style={{ background: 'none', border: '1px solid white', color: 'white', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}>Logout</button>
            </header>

            <div style={{ backgroundColor: 'white', padding: '1rem 2rem', borderBottom: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    {['dashboard', 'analysis', 'inventory', 'stocktake'].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)} style={{ 
                            padding: '0.75rem 1.5rem', border: 'none', borderRadius: '6px', 
                            backgroundColor: activeTab === tab ? '#1e3a8a' : '#f3f4f6', 
                            color: activeTab === tab ? 'white' : '#374151', cursor: 'pointer', fontWeight: 'bold' 
                        }}>
                            {tab === 'dashboard' ? '📊 Dashboard' : tab === 'analysis' ? '📈 Analysis' : tab === 'inventory' ? '📦 Inventory' : '🔄 Stock Take'}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ padding: '2rem' }}>
                {loading ? <p>Loading...</p> : (
                    <>
                        {/* DASHBOARD TAB */}
                        {activeTab === 'dashboard' && (
                            <div>
                                <h3>Real-Time Overview</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                                    <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                        <TrendingUp size={32} color="#059669" />
                                        <p style={{ margin: '0.5rem 0', color: '#6b7280' }}>Total Revenue</p>
                                        <p style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0, color: '#059669' }}>KES {advancedStats?.total_revenue.toFixed(2)}</p>
                                    </div>
                                    <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                        <AlertTriangle size={32} color="#dc2626" />
                                        <p style={{ margin: '0.5rem 0', color: '#6b7280' }}>Low Stock</p>
                                        <p style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>{lowStockItems.length}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ANALYSIS TAB */}
                        {activeTab === 'analysis' && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                                    <h3 style={{ margin: 0 }}>📈 Advanced Analytics</h3>
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', backgroundColor: 'white', padding: '0.5rem', borderRadius: '6px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                        <Calendar size={16} />
                                        <label>From:</label>
                                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ padding: '0.25rem', border: '1px solid #d1d5db', borderRadius: '4px' }} />
                                        <label>To:</label>
                                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ padding: '0.25rem', border: '1px solid #d1d5db', borderRadius: '4px' }} />
                                    </div>
                                </div>

                                {/* Top Cards */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                                    <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>Total Revenue</p>
                                        <p style={{ fontSize: '1.75rem', fontWeight: 'bold', margin: '0.5rem 0 0 0', color: '#059669' }}>KES {advancedStats?.total_revenue.toFixed(2)}</p>
                                    </div>
                                    <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>Est. Profit (40% Margin)</p>
                                        <p style={{ fontSize: '1.75rem', fontWeight: 'bold', margin: '0.5rem 0 0 0', color: '#2563eb' }}>KES {advancedStats?.total_profit.toFixed(2)}</p>
                                    </div>
                                    <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>Transactions</p>
                                        <p style={{ fontSize: '1.75rem', fontWeight: 'bold', margin: '0.5rem 0 0 0' }}>{advancedStats?.total_transactions}</p>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
                                    {/* Payment Methods Chart */}
                                    <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                        <h4 style={{ marginTop: 0 }}>💳 Payment Methods Share</h4>
                                        {advancedStats?.payment_methods?.map((p, idx) => (
                                            <div key={idx} style={{ marginBottom: '1rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 'bold', textTransform: 'capitalize' }}>
                                                    <span>{p.method}</span>
                                                    <span>KES {p.total.toFixed(2)} ({Math.round((p.total / advancedStats.total_revenue) * 100)}%)</span>
                                                </div>
                                                <div style={{ backgroundColor: '#f3f4f6', borderRadius: '9999px', height: '12px', overflow: 'hidden' }}>
                                                    <div style={{ 
                                                        width: `${(p.total / maxPayment) * 100}%`, 
                                                        height: '100%', 
                                                        backgroundColor: p.method === 'cash' ? '#059669' : '#2563eb',
                                                        borderRadius: '9999px'
                                                    }}></div>
                                                </div>
                                            </div>
                                        ))}
                                        {(!advancedStats?.payment_methods || advancedStats.payment_methods.length === 0) && <p style={{color: '#6b7280'}}>No sales in this period.</p>}
                                    </div>

                                    {/* Product Revenue Chart */}
                                    <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                        <h4 style={{ marginTop: 0 }}>🏆 Revenue by Product</h4>
                                        {productRevenue?.map((p, idx) => (
                                            <div key={idx} style={{ marginBottom: '1rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
                                                    <span style={{ fontWeight: '600' }}>{p.name}</span>
                                                    <span style={{ color: '#059669', fontWeight: 'bold' }}>KES {p.revenue.toFixed(2)}</span>
                                                </div>
                                                <div style={{ backgroundColor: '#f3f4f6', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                                                    <div style={{ 
                                                        width: `${(p.revenue / maxProductRev) * 100}%`, 
                                                        height: '100%', 
                                                        backgroundColor: '#7c3aed',
                                                        borderRadius: '4px'
                                                    }}></div>
                                                </div>
                                            </div>
                                        ))}
                                        {(!productRevenue || productRevenue.length === 0) && <p style={{color: '#6b7280'}}>No product sales in this period.</p>}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* INVENTORY TAB */}
                        {activeTab === 'inventory' && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                                    <h3 style={{ margin: 0 }}>Inventory</h3>
                                    <button onClick={() => setShowReceiveForm(true)} style={{ padding: '0.5rem 1rem', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Plus size={16} /> Receive Stock
                                    </button>
                                </div>
                                
                                {showReceiveForm && (
                                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }} onClick={() => setShowReceiveForm(false)}>
                                        <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px', width: '100%', maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                                <h3 style={{ margin: 0 }}>Receive Stock</h3>
                                                <button onClick={() => setShowReceiveForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X /></button>
                                            </div>
                                            <form onSubmit={handleReceiveStock}>
                                                <select required value={receiveForm.product_id} onChange={(e) => setReceiveForm({...receiveForm, product_id: e.target.value})} style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', borderRadius: '6px', border: '1px solid #d1d5db' }}>
                                                    <option value="">Select Product</option>
                                                    {inventory.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                </select>
                                                <input required type="text" placeholder="Batch No" value={receiveForm.batch_no} onChange={(e) => setReceiveForm({...receiveForm, batch_no: e.target.value})} style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', borderRadius: '6px', border: '1px solid #d1d5db', boxSizing: 'border-box' }} />
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                                    <input required type="number" placeholder="Qty" value={receiveForm.quantity} onChange={(e) => setReceiveForm({...receiveForm, quantity: e.target.value})} style={{ padding: '0.75rem', borderRadius: '6px', border: '1px solid #d1d5db' }} />
                                                    <input required type="number" step="0.01" placeholder="Cost Price" value={receiveForm.cost_price} onChange={(e) => setReceiveForm({...receiveForm, cost_price: e.target.value})} style={{ padding: '0.75rem', borderRadius: '6px', border: '1px solid #d1d5db' }} />
                                                </div>
                                                <input required type="date" value={receiveForm.expiry_date} onChange={(e) => setReceiveForm({...receiveForm, expiry_date: e.target.value})} style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', borderRadius: '6px', border: '1px solid #d1d5db', boxSizing: 'border-box' }} />
                                                <button type="submit" style={{ width: '100%', padding: '1rem', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>Add Batch</button>
                                            </form>
                                        </div>
                                    </div>
                                )}

                                <div style={{ backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead style={{ backgroundColor: '#f9fafb' }}>
                                            <tr>
                                                <th style={{ textAlign: 'left', padding: '1rem' }}>Product</th>
                                                <th style={{ textAlign: 'center', padding: '1rem' }}>Batches</th>
                                                <th style={{ textAlign: 'right', padding: '1rem' }}>Total</th>
                                                <th style={{ textAlign: 'center', padding: '1rem' }}>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {inventory.map(item => (
                                                <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                    <td style={{ padding: '1rem', fontWeight: 'bold' }}>{item.name}</td>
                                                    <td style={{ padding: '1rem' }}>
                                                        {item.batches?.map(b => (
                                                            <div key={b.id} style={{ backgroundColor: b.is_expiring ? '#fef3c7' : '#f0f9ff', padding: '0.5rem', borderRadius: '6px', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <div>
                                                                    <div style={{ fontWeight: 'bold', fontSize: '0.875rem' }}>{b.batch_no}</div>
                                                                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Exp: {new Date(b.expiry_date).toLocaleDateString()}</div>
                                                                </div>
                                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                    <span style={{ fontWeight: 'bold', color: '#059669' }}>{b.quantity}</span>
                                                                    <button onClick={() => handleDeleteBatch(b.id, item.name)} style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', padding: '0.25rem', cursor: 'pointer' }}><Trash2 size={12} /></button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </td>
                                                    <td style={{ textAlign: 'right', padding: '1rem', fontWeight: 'bold' }}>{item.total_stock}</td>
                                                    <td style={{ textAlign: 'center', padding: '1rem' }}>
                                                        {item.needs_reorder ? <span style={{ color: '#dc2626', fontWeight: 'bold' }}>LOW</span> : <span style={{ color: '#059669' }}>OK</span>}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* STOCK TAKE TAB */}
                        {activeTab === 'stocktake' && (
                            <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                                <h3>Stock Take</h3>
                                <div style={{ backgroundColor: '#f9fafb', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem', border: '2px dashed #d1d5db' }}>
                                    <form onSubmit={handleBarcodeScan} style={{ display: 'flex', gap: '0.5rem' }}>
                                        <input type="text" value={scanInput} onChange={(e) => setScanInput(e.target.value)} placeholder="Scan barcode..." style={{ flex: 1, padding: '0.75rem', borderRadius: '6px', border: '1px solid #d1d5db' }} />
                                        <button type="submit" style={{ padding: '0 1.5rem', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Scan</button>
                                    </form>
                                </div>
                                <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px' }}>
                                    <form onSubmit={handleStockUpdate}>
                                        <select required value={stockTake.productId} onChange={(e) => setStockTake({...stockTake, productId: e.target.value, batchId: ''})} style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', borderRadius: '6px', border: '1px solid #d1d5db' }}>
                                            <option value="">Select Product</option>
                                            {inventory.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                        <select required value={stockTake.batchId} onChange={(e) => setStockTake({...stockTake, batchId: e.target.value})} style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', borderRadius: '6px', border: '1px solid #d1d5db' }}>
                                            <option value="">Select Batch</option>
                                            {inventory.find(p => p.id === stockTake.productId)?.batches?.map(b => (
                                                <option key={b.id} value={b.id}>{b.batch_no} (Current: {b.quantity})</option>
                                            ))}
                                        </select>
                                        <input type="number" required placeholder="New Quantity" value={stockTake.newQty} onChange={(e) => setStockTake({...stockTake, newQty: e.target.value})} style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', borderRadius: '6px', border: '1px solid #d1d5db', boxSizing: 'border-box' }} />
                                        <button type="submit" style={{ width: '100%', padding: '1rem', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>Update Stock</button>
                                    </form>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}