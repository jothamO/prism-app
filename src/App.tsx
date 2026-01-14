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
import Analytics from "./pages/Analytics";
import TaxCalendar from "./pages/TaxCalendar";
import EducationCenter from "./pages/EducationCenter";
import FAQ from "./pages/FAQ";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Terms from "./pages/Terms";
import Contact from "./pages/Contact";
import Team from "./pages/Team";
import Projects from "./pages/Projects";
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
import AdminCompliance from "./pages/admin/AdminCompliance";
import AdminComplianceDocuments from "./pages/admin/AdminComplianceDocuments";
import AdminComplianceDocumentDetail from "./pages/admin/AdminComplianceDocumentDetail";
import AdminComplianceRules from "./pages/admin/AdminComplianceRules";
import AdminComplianceChangelog from "./pages/admin/AdminComplianceChangelog";
import AdminCodeProposals from "./pages/admin/AdminCodeProposals";
import AdminChangelog from "./pages/admin/AdminChangelog";
import AdminEducation from "./pages/admin/AdminEducation";
import AdminTaxCalendar from "./pages/admin/AdminTaxCalendar";
import AcceptInvite from "./pages/AcceptInvite";
import AwaitingApproval from "./pages/AwaitingApproval";
import DeveloperPortal from "./pages/DeveloperPortal";
import AdminCalculationLogs from "./pages/admin/AdminCalculationLogs";
import AdminAPIKeys from "./pages/admin/AdminAPIKeys";
import AdminAPIPricing from "./pages/admin/AdminAPIPricing";
import AdminSubscriptions from "./pages/admin/AdminSubscriptions";

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
            <Route path="/faq" element={<FAQ />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/invite/:token" element={<AcceptInvite />} />
            <Route path="/awaiting-approval" element={<AwaitingApproval />} />

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
            <Route
              path="/analytics"
              element={
                <ProtectedRoute>
                  <Analytics />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tax-calendar"
              element={
                <ProtectedRoute>
                  <TaxCalendar />
                </ProtectedRoute>
              }
            />
            <Route
              path="/education"
              element={
                <ProtectedRoute>
                  <EducationCenter />
                </ProtectedRoute>
              }
            />
            <Route
              path="/team"
              element={
                <ProtectedRoute>
                  <Team />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects"
              element={
                <ProtectedRoute>
                  <Projects />
                </ProtectedRoute>
              }
            />
            <Route
              path="/developers"
              element={
                <ProtectedRoute>
                  <DeveloperPortal />
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
              <Route path="changelog" element={<AdminChangelog />} />
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
              <Route path="compliance" element={<AdminCompliance />} />
              <Route path="compliance/documents" element={<AdminComplianceDocuments />} />
              <Route path="compliance/documents/:id" element={<AdminComplianceDocumentDetail />} />
              <Route path="compliance/rules" element={<AdminComplianceRules />} />
              <Route path="compliance/changelog" element={<AdminComplianceChangelog />} />
              <Route path="compliance/proposals" element={<AdminCodeProposals />} />
              <Route path="education" element={<AdminEducation />} />
              <Route path="tax-calendar" element={<AdminTaxCalendar />} />
              <Route path="settings" element={<AdminSettings />} />
              <Route path="calculation-logs" element={<AdminCalculationLogs />} />
              <Route path="api-keys" element={<AdminAPIKeys />} />
              <Route path="api-pricing" element={<AdminAPIPricing />} />
              <Route path="subscriptions" element={<AdminSubscriptions />} />
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
