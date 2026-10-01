import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function RoleGuard({ children, allowedRoles }) {
    const { user, loading } = useAuth();

    if (loading) return <div style={{textAlign: 'center', marginTop: '5rem'}}>Loading...</div>;
    
    if (!user) return <Navigate to="/login" replace />;
    
    if (allowedRoles && !allowedRoles.includes(user.role)) {
        return (
            <div style={{textAlign: 'center', marginTop: '5rem', color: 'red'}}>
                <h2>403 Forbidden</h2>
                <p>Your role ({user.role}) does not have permission to view this page.</p>
            </div>
        );
    }

    return children;
}