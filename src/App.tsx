import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import ProtectedRoute from "@/components/ProtectedRoute";
import LandingPage from "./pages/LandingPage";
import Dashboard from "./pages/Dashboard";
import TaxDashboard from "./pages/TaxDashboard";
import Insights from "./pages/Insights";
import Reports from "./pages/Reports";
import Transactions from "./pages/Transactions";
import Settings from "./pages/Settings";
import BankConnected from "./pages/BankConnected";
import Auth from "./pages/Auth";
import Register from "./pages/Register";
import BusinessSignup from "./pages/BusinessSignup";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminLayout from "./layouts/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminProjects from "./pages/admin/AdminProjects";
import AdminReviews from "./pages/admin/AdminReviews";
import AdminFilings from "./pages/admin/AdminFilings";
import AdminInvoices from "./pages/admin/AdminInvoices";
import AdminAnalytics from "./pages/admin/AdminAnalytics";
import AdminMessaging from "./pages/admin/AdminMessaging";
import AdminPayments from "./pages/admin/AdminPayments";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminSimulator from "./pages/admin/AdminSimulator";
import AdminChatbots from "./pages/admin/AdminChatbots";
import AdminVATTesting from "./pages/admin/AdminVATTesting";
import AdminRelatedParties from "./pages/admin/AdminRelatedParties";
import AdminFeedback from "./pages/admin/AdminFeedback";
import AdminProfiles from "./pages/admin/AdminProfiles";
import AdminNLUTesting from "./pages/admin/AdminNLUTesting";
import AdminMLHealth from "./pages/admin/AdminMLHealth";
import AdminPatterns from "./pages/admin/AdminPatterns";
import AdminDocuments from "./pages/admin/AdminDocuments";
import AdminClassificationTesting from "./pages/admin/AdminClassificationTesting";
import AdminLogs from "./pages/admin/AdminLogs";

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/register" element={<Register />} />
            <Route path="/register/business" element={<BusinessSignup />} />
            <Route path="/bank-connected" element={<BankConnected />} />
            <Route path="/admin/login" element={<AdminLogin />} />

            {/* Protected User Routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/insights"
              element={
                <ProtectedRoute>
                  <Insights />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tax-dashboard"
              element={
                <ProtectedRoute>
                  <TaxDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedRoute>
                  <Reports />
                </ProtectedRoute>
              }
            />
            <Route
              path="/transactions"
              element={
                <ProtectedRoute>
                  <Transactions />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />

            {/* Protected Admin Routes - Require Admin Role */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireAdmin={true}>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="projects" element={<AdminProjects />} />
              <Route path="reviews" element={<AdminReviews />} />
              <Route path="related-parties" element={<AdminRelatedParties />} />
              <Route path="feedback" element={<AdminFeedback />} />
              <Route path="ml-health" element={<AdminMLHealth />} />
              <Route path="profiles" element={<AdminProfiles />} />
              <Route path="filings" element={<AdminFilings />} />
              <Route path="invoices" element={<AdminInvoices />} />
              <Route path="analytics" element={<AdminAnalytics />} />
              <Route path="messaging" element={<AdminMessaging />} />
              <Route path="chatbots" element={<AdminChatbots />} />
              <Route path="payments" element={<AdminPayments />} />
              <Route path="simulator" element={<AdminSimulator />} />
              <Route path="nlu-testing" element={<AdminNLUTesting />} />
              <Route path="vat-testing" element={<AdminVATTesting />} />
              <Route path="classification-testing" element={<AdminClassificationTesting />} />
              <Route path="patterns" element={<AdminPatterns />} />
              <Route path="documents" element={<AdminDocuments />} />
              <Route path="logs" element={<AdminLogs />} />
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
