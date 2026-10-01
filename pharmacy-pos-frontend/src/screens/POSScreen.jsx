import { useState, useEffect, useRef } from 'react';
import api from '../api';
import useBarcodeScanner from '../hooks/useBarcodeScanner';
import { useAuth } from '../auth/AuthContext';
import { ShoppingCart, LogOut } from 'lucide-react';

export default function POSScreen() {
    const { user, logout } = useAuth();
    const [cart, setCart] = useState([]);
    const [products, setProducts] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    
    // M-Pesa States
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [mpesaPhone, setMpesaPhone] = useState('');
    const [isProcessingMpesa, setIsProcessingMpesa] = useState(false);

    // 1. Load products on mount
    useEffect(() => {
        api.get('/pharmacy/products')
            .then(res => setProducts(Array.isArray(res.data) ? res.data : []))
            .catch(err => { console.error("Failed to fetch products:", err); setProducts([]); });
    }, []);

    // 2. Initialize Barcode Scanner (Global Listener)
    useBarcodeScanner(async (barcode) => {
        try {
            const res = await api.get(`/pharmacy/products/barcode/${barcode}`);
            addToCart(res.data);
        } catch (err) {
            alert(`Product with barcode "${barcode}" not found!`);
        }
    });

    // 3. Cart Management
    const addToCart = (product) => {
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                return prev.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item);
            }
            return [...prev, { ...product, qty: 1 }];
        });
    };

    const removeFromCart = (productId) => setCart(prev => prev.filter(item => item.id !== productId));

    const updateQty = (productId, delta) => {
        setCart(prev => prev.map(item => {
            if (item.id === productId) return { ...item, qty: Math.max(1, item.qty + delta) };
            return item;
        }));
    };

    const totalAmount = cart.reduce((sum, item) => sum + (item.unit_price * item.qty), 0);

    // 4. Checkout Function (Updated for M-Pesa)
    const handleCheckout = async () => {
        if (cart.length === 0) return;
        setIsProcessing(true);

        try {
            // Step 1: Create the sale record in the database
            const saleRes = await api.post('/pharmacy/sale', {
                items: cart.map(item => ({ product_id: item.id, qty: item.qty })),
                payment_method: paymentMethod 
            });
            const saleId = saleRes.data.sale_id;

            // Step 2: If M-Pesa, trigger the STK Push
            if (paymentMethod === 'mpesa') {
                if (!mpesaPhone || mpesaPhone.length < 10) {
                    alert("Please enter a valid M-Pesa phone number (e.g., 0712345678)");
                    setIsProcessing(false);
                    return;
                }
                setIsProcessingMpesa(true);
                
                const mpesaRes = await api.post('/mpesa/stkpush', {
                    phone: mpesaPhone,
                    amount: totalAmount,
                    sale_id: saleId
                });

                // DEBUG: Log the exact response to the browser console
                console.log("🔍 RAW M-PESA RESPONSE:", mpesaRes.data);

                if (mpesaRes.data.ResponseCode === "0") {
                    alert(`✅ M-Pesa prompt sent to ${mpesaPhone}!\nPlease enter your PIN on your phone.`);
                    setCart([]); 
                    setMpesaPhone('');
                } else {
                    // Show the FULL raw response so we can see exactly what Safaricom said
                    alert("❌ Failed to send M-Pesa prompt.\n\nSafaricom's exact response:\n" + JSON.stringify(mpesaRes.data, null, 2));
                }
                setIsProcessingMpesa(false);
            }else {
                // Cash payment success
                alert(`✅ Sale successful! Total: KES ${saleRes.data.total_amount}\nSale ID: ${saleId}`);
                setCart([]);
            }
        } catch (err) {
            alert('Sale failed: ' + (err.response?.data || err.message));
        } finally {
            setIsProcessing(false);
        }
    };

    // 5. Filter products for manual search
    const filteredProducts = Array.isArray(products) ? products.filter(p => 
        (p.name && p.name.toLowerCase().includes(searchQuery.toLowerCase())) || 
        (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase()))
    ) : [];

    // 6. UI Rendering
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#f3f4f6' }}>
            
            {/* Header */}
            <header style={{ backgroundColor: '#1e3a8a', color: 'white', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>💊 Pharmacy POS</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span>Welcome, {user?.name} ({user?.role})</span>
                    <button onClick={logout} style={{ background: 'none', border: '1px solid white', color: 'white', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <LogOut size={16} /> Logout
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                
                {/* Left Panel: Product Catalog & Search */}
                <div style={{ flex: 2, padding: '1rem', overflowY: 'auto', borderRight: '1px solid #d1d5db' }}>
                    <input 
                        type="text" 
                        placeholder="🔍 Search products by name or SKU..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ 
                            width: '100%', padding: '0.75rem', borderRadius: '6px', 
                            border: '1px solid #d1d5db', marginBottom: '1rem', fontSize: '1rem' 
                        }}
                    />
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                        {filteredProducts.map(product => (
                            <div 
                                key={product.id} 
                                onClick={() => addToCart(product)} 
                                style={{ 
                                    backgroundColor: 'white', padding: '1rem', borderRadius: '8px', 
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)', cursor: 'pointer' 
                                }}
                            >
                                <h4 style={{ margin: '0 0 0.5rem 0' }}>{product.name}</h4>
                                <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>{product.sku}</p>
                                <p style={{ margin: '0.5rem 0 0 0', fontWeight: 'bold', color: '#059669' }}>KES {product.unit_price.toFixed(2)}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Panel: Cart & Checkout */}
                <div style={{ flex: 1, backgroundColor: 'white', display: 'flex', flexDirection: 'column', borderLeft: '1px solid #d1d5db' }}>
                    <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <ShoppingCart size={20} />
                        <h3 style={{ margin: 0 }}>Current Sale</h3>
                    </div>
                    
                    <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                        {cart.length === 0 ? (
                            <p style={{ textAlign: 'center', color: '#9ca3af', marginTop: '2rem' }}>Cart is empty. Scan a barcode or click a product.</p>
                        ) : (
                            cart.map(item => (
                                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0', borderBottom: '1px solid #f3f4f6' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 'bold' }}>{item.name}</div>
                                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>KES {item.unit_price.toFixed(2)} x {item.qty}</div>
                                    </div>
                                    
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <button onClick={() => updateQty(item.id, -1)} style={{ width: '32px', height: '32px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer' }}>−</button>
                                        <span style={{ width: '32px', textAlign: 'center', fontWeight: '600' }}>{item.qty}</span>
                                        <button onClick={() => updateQty(item.id, 1)} style={{ width: '32px', height: '32px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer' }}>+</button>
                                        <button onClick={() => removeFromCart(item.id)} style={{ marginLeft: '0.5rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>🗑️</button>
                                    </div>

                                    <div style={{ fontWeight: 'bold', width: '80px', textAlign: 'right' }}>KES {(item.unit_price * item.qty).toFixed(2)}</div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Checkout Footer with M-Pesa */}
                    <div style={{ padding: '1.5rem', borderTop: '2px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
                            <span>Total:</span>
                            <span>KES {totalAmount.toFixed(2)}</span>
                        </div>

                        {/* Payment Method Selection */}
                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.5rem 1rem', border: `1px solid ${paymentMethod === 'cash' ? '#059669' : '#d1d5db'}`, borderRadius: '6px', backgroundColor: paymentMethod === 'cash' ? '#d1fae5' : 'white', flex: 1, justifyContent: 'center' }}>
                                <input type="radio" name="payment" value="cash" checked={paymentMethod === 'cash'} onChange={(e) => setPaymentMethod(e.target.value)} />
                                💵 Cash
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.5rem 1rem', border: `1px solid ${paymentMethod === 'mpesa' ? '#059669' : '#d1d5db'}`, borderRadius: '6px', backgroundColor: paymentMethod === 'mpesa' ? '#d1fae5' : 'white', flex: 1, justifyContent: 'center' }}>
                                <input type="radio" name="payment" value="mpesa" checked={paymentMethod === 'mpesa'} onChange={(e) => setPaymentMethod(e.target.value)} />
                                📱 M-Pesa
                            </label>
                        </div>

                        {/* M-Pesa Phone Input */}
                        {paymentMethod === 'mpesa' && (
                            <input 
                                type="tel" 
                                placeholder="M-Pesa Phone (e.g., 0712345678)" 
                                value={mpesaPhone}
                                onChange={(e) => setMpesaPhone(e.target.value)}
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #d1d5db', marginBottom: '1rem', fontSize: '1rem', boxSizing: 'border-box' }}
                            />
                        )}

                        <button 
                            onClick={handleCheckout} 
                            disabled={cart.length === 0 || isProcessing}
                            style={{ 
                                width: '100%', padding: '1rem', 
                                backgroundColor: cart.length === 0 ? '#9ca3af' : (paymentMethod === 'mpesa' ? '#059669' : '#2563eb'), 
                                color: 'white', border: 'none', borderRadius: '6px', fontSize: '1.125rem', fontWeight: 'bold', cursor: cart.length === 0 ? 'not-allowed' : 'pointer' 
                            }}>
                            {isProcessing ? (isProcessingMpesa ? 'Sending M-Pesa Prompt...' : 'Processing...') : `Complete Sale (${paymentMethod === 'cash' ? 'Cash' : 'M-Pesa'})`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}