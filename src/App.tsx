import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
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

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="reviews" element={<AdminReviews />} />
          <Route path="filings" element={<AdminFilings />} />
          <Route path="invoices" element={<AdminInvoices />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="messaging" element={<AdminMessaging />} />
          <Route path="payments" element={<AdminPayments />} />
          <Route path="simulator" element={<AdminSimulator />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}

export default App;