import StaffManagementScreen from './screens/StaffManagementScreen'; 
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import LoginScreen from './auth/LoginScreen';
import RoleGuard from './shared/RoleGuard';
import POSScreen from './screens/POSScreen';
import LabScreen from './screens/LabScreen';
import AdminScreen from './screens/AdminScreen';
import DoctorScreen from './screens/DoctorScreen';
import PharmacyQueueScreen from './screens/PharmacyQueueScreen';

// Smart Dashboard that redirects based on role
function DashboardRouter() {
    const { user } = useAuth();
    
    if (user?.role === 'cashier' || user?.role === 'pharmacist') {
        return <Navigate to="/pos" replace />;
    }
    if (user?.role === 'lab_tech' || user?.role === 'doctor') {
        return <Navigate to="/lab" replace />;
    }
    if (user?.role === 'admin') {
        return <Navigate to="/admin" replace />; // 👈 Admin goes to admin dashboard
    }
    if (user?.role === 'lab_tech' || user?.role === 'doctor') {
        return <Navigate to="/lab" replace />;
    }
    return <Navigate to="/login" replace />;
}

function AppRoutes() {
    const { user } = useAuth();

    return (
        <Routes>
            <Route path="/login" element={user ? <Navigate to="/" /> : <LoginScreen />} />
            
            <Route path="/" element={
                <RoleGuard>
                    <DashboardRouter />
                </RoleGuard>
            } />

            <Route path="/pharmacy-queue" element={
                <RoleGuard allowedRoles={['pharmacist', 'cashier', 'admin']}>
                    <PharmacyQueueScreen />
                </RoleGuard>
            } />

            <Route path="/doctor" element={
                <RoleGuard allowedRoles={['doctor', 'admin']}>
                    <DoctorScreen />
                </RoleGuard>
            } />

            <Route path="/admin" element={
                <RoleGuard allowedRoles={['admin']}>
                    <AdminScreen />
                </RoleGuard>
            } />

            <Route path="/lab" element={
                  <RoleGuard allowedRoles={['lab_tech', 'doctor', 'admin']}>
                      <LabScreen />
                  </RoleGuard>
              } />

            <Route path="/pos" element={
                <RoleGuard allowedRoles={['cashier', 'pharmacist', 'admin']}>
                    <POSScreen />
                </RoleGuard>
            } />

            <Route path="/lab" element={
                <RoleGuard allowedRoles={['lab_tech', 'doctor', 'admin']}>
                    <LabScreen />
                </RoleGuard>
            } />

            <Route path="/admin/staff" element={
                <RoleGuard allowedRoles={['admin']}>
                    <StaffManagementScreen />
                </RoleGuard>
            } />
        </Routes>
    );
}

function App() {
    return (
        <Router>
            <AuthProvider>
                <AppRoutes />
            </AuthProvider>
        </Router>
    );
}

export default App;