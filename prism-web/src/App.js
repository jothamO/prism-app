import { Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import AdminLogin from './pages/admin/AdminLogin';
import AdminLayout from './layouts/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminReviews from './pages/admin/AdminReviews';
function App() {
    return (<Routes>
            {/* Public Routes */}
            <Route path="/" element={<Dashboard />}/>

            {/* Admin Routes */}
            <Route path="/admin/login" element={<AdminLogin />}/>
            <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboard />}/>
                <Route path="users" element={<AdminUsers />}/>
                <Route path="reviews" element={<AdminReviews />}/>
                {/* Add more admin routes here later */}
            </Route>

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/" replace/>}/>
        </Routes>);
}
export default App;
