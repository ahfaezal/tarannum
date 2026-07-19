import React, { Suspense, lazy, useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "./store";
import { fetchCurrentUser } from "./store/slices/authSlice";
import PublicLayout from "./layouts/PublicLayout";
import AppLayout from "./layouts/AppLayout";
import ProtectedRoute from "./routes/ProtectedRoute";

const HomePage = lazy(() => import("./views/public/HomePage"));
const AboutPage = lazy(() => import("./views/public/AboutPage"));
const HowToUsePage = lazy(() => import("./views/public/HowToUsePage"));
const DemoPage = lazy(() => import("./views/public/DemoPage"));
const ContactPage = lazy(() => import("./views/public/ContactPage"));
const Login = lazy(() => import("./components/Login"));
const Register = lazy(() => import("./components/Register"));
const VerifyEmail = lazy(() => import("./components/VerifyEmail"));
const ForgotPassword = lazy(() => import("./components/ForgotPassword"));
const TrainingPage = lazy(() => import("./views/training/TrainingPage"));
const RecordingPage = lazy(() => import("./views/recording/RecordingPage"));
const StudentProgress = lazy(() => import("./views/StudentProgress"));
const StudentProfile = lazy(() => import("./views/StudentProfile"));
const QariProfile = lazy(() => import("./views/QariProfile"));
const QariDashboard = lazy(() => import("./views/QariDashboard"));
const QariContentEditor = lazy(() => import("./components/QariContentEditor"));
const AdminQariContentManager = lazy(() => import("./views/AdminQariContentManager"));
const AdminMode = lazy(() => import("./views/AdminMode"));
const AdminDashboard = lazy(() => import("./views/AdminDashboard"));

const PageLoader = () => (
  <div className="flex min-h-[40vh] items-center justify-center" role="status">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
    <span className="sr-only">Loading page</span>
  </div>
);

const ProfileRoute = () => {
  const role = useSelector((state: RootState) => state.auth.user?.role);
  if (role === "student") return <StudentProfile />;
  if (role === "qari") return <QariProfile />;
  return <Navigate to="/" replace />;
};

const App: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useSelector((state: RootState) => state.auth);
  const isLightweightPublicPage = ["/", "/about", "/how-to-use", "/demo", "/contact"].includes(location.pathname);

  useEffect(() => {
    if (!isLightweightPublicPage && !isAuthenticated && localStorage.getItem("tarannum_auth_token")) {
      dispatch(fetchCurrentUser() as any);
    }
  }, [dispatch, isAuthenticated, isLightweightPublicPage]);

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/how-to-use" element={<HowToUsePage />} />
          <Route path="/demo" element={<DemoPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/login" element={isAuthenticated ? <Navigate to="/training" replace /> : <Login onSwitchToRegister={() => navigate("/register")} onSuccess={() => navigate(new URLSearchParams(location.search).get("next") || "/training")} />} />
          <Route path="/register" element={isAuthenticated ? <Navigate to="/training" replace /> : <Register onSwitchToLogin={() => navigate("/login")} onSuccess={(email) => navigate(`/verify-email?email=${encodeURIComponent(email || "")}`)} />} />
          <Route path="/verify-email" element={isAuthenticated ? <Navigate to="/training" replace /> : <VerifyEmail />} />
          <Route path="/forgot-password" element={isAuthenticated ? <Navigate to="/training" replace /> : <ForgotPassword />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/training" element={<TrainingPage />} />
            <Route path="/recording" element={<RecordingPage />} />
            <Route element={<ProtectedRoute roles={["student"]} />}>
              <Route path="/progress" element={<StudentProgress />} />
            </Route>
            <Route element={<ProtectedRoute roles={["student", "qari"]} />}>
              <Route path="/profile" element={<ProfileRoute />} />
            </Route>
            <Route element={<ProtectedRoute roles={["qari"]} />}>
              <Route path="/dashboard" element={<QariDashboard />} />
              <Route path="/qari/content/edit/:contentId" element={<QariContentEditor />} />
            </Route>
            <Route element={<ProtectedRoute roles={["admin"]} />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/qari/:qariId/content" element={<AdminQariContentManager />} />
              <Route path="/admin/qari/:qariId/content/edit/:contentId" element={<QariContentEditor />} />
              <Route path="/admin/presets" element={<AdminMode view="presets" />} />
              <Route path="/admin/users" element={<AdminMode view="users" />} />
              <Route path="/admin/monitoring" element={<AdminMode view="monitoring" />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
};

export default App;
