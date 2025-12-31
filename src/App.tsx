import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import ProtectedRoute from "@/components/ProtectedRoute";
import LandingPage from "./pages/LandingPage";
import Dashboard from "./pages/Dashboard";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminLayout from "./layouts/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminReviews from "./pages/admin/AdminReviews";
import AdminFilings from "./pages/admin/AdminFilings";
import AdminInvoices from "./pages/admin/AdminInvoices";
import AdminAnalytics from "./pages/admin/AdminAnalytics";
import AdminMessaging from "./pages/admin/AdminMessaging";
import AdminPayments from "./pages/admin/AdminPayments";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminSimulator from "./pages/admin/AdminSimulator";
import AdminVATTesting from "./pages/admin/AdminVATTesting";

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            
            {/* Protected Dashboard */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            
            {/* Protected Admin Routes */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="reviews" element={<AdminReviews />} />
              <Route path="filings" element={<AdminFilings />} />
              <Route path="invoices" element={<AdminInvoices />} />
              <Route path="analytics" element={<AdminAnalytics />} />
              <Route path="messaging" element={<AdminMessaging />} />
              <Route path="payments" element={<AdminPayments />} />
              <Route path="simulator" element={<AdminSimulator />} />
              <Route path="vat-testing" element={<AdminVATTesting />} />
              <Route path="settings" element={<AdminSettings />} />
            </Route>
            
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
