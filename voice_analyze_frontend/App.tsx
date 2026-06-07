import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Routes, Route, useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import { RootState } from './store';
import { logout, fetchCurrentUser } from './store/slices/authSlice';
import TrainingStudio from './views/TrainingStudio';
import AdminMode from './views/AdminMode';
import QariDashboard from './views/QariDashboard';
import StudentProgressView from './views/StudentProgress';
import Login from './components/Login';
import Register from './components/Register';
import QariSelector from './components/QariSelector';
import QariContentEditor from './components/QariContentEditor';
import { Mic2, LayoutDashboard, Users, BookOpen, Settings, LogOut, BarChart3, User, Monitor, Menu, X } from 'lucide-react';


const App: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user, isLoading } = useSelector((state: RootState) => state.auth);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Check if we're on login or register page
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
  
  // Get current route for active state
  const currentPath = location.pathname;

  useEffect(() => {
    // Try to fetch current user if token exists
    if (!isAuthenticated && localStorage.getItem('tarannum_auth_token')) {
      dispatch(fetchCurrentUser() as any);
    }
  }, [dispatch, isAuthenticated]);

  // Redirect authenticated users away from login/register pages
  useEffect(() => {
    if (isAuthenticated && isAuthPage) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, isAuthPage, navigate]);

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const userRole = user?.role || 'public';

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Sidebar - Hide on auth pages */}
      {!isAuthPage && (
        <>
      <aside className="w-64 bg-slate-900 text-white fixed h-full hidden md:flex flex-col z-20">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Mic2 className="text-white" size={24} />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight">Tarannum</h1>
              <p className="text-xs text-slate-400">
                {isAuthenticated ? "AI Trainer System" : "Demo Mode - Public Access"}
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <Link
            to="/"
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${(currentPath === '/' || currentPath === '/training') ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
          >
            <Mic2 size={20} />
            <span className="font-medium">
              {isAuthenticated ? "Training Studio" : "Training (Demo)"}
            </span>
          </Link>

          {/* Student-specific tabs */}
          {userRole === 'student' && (
            <>
              <Link
                to="/progress"
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentPath === '/progress' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
              >
                <BarChart3 size={20} />
                <span className="font-medium">My Progress</span>
              </Link>
            </>
          )}

          {/* Qari-specific tabs */}
          {userRole === 'qari' && (
            <Link
              to="/dashboard"
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentPath === '/dashboard' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
            >
              <LayoutDashboard size={20} />
              <span className="font-medium">My Dashboard</span>
            </Link>
          )}

          {/* Admin tabs */}
          {userRole === 'admin' && (
            <>
              <div className="pt-8 pb-2 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Admin
              </div>
              <Link
                to="/admin/presets"
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentPath === '/admin/presets' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
              >
                <BookOpen size={20} />
                <span className="font-medium">Preset Manager</span>
              </Link>
              <Link
                to="/admin/users"
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentPath === '/admin/users' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
              >
                <Users size={20} />
                <span className="font-medium">User Management</span>
              </Link>
              <Link
                to="/admin/monitoring"
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentPath === '/admin/monitoring' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
              >
                <Monitor size={20} />
                <span className="font-medium">Platform Monitoring</span>
              </Link>
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800">
          {isAuthenticated ? (
            <>
              <div className="mb-3 px-4 py-2 text-sm">
                <div className="text-slate-300 font-medium">{user?.full_name || user?.email}</div>
                <div className="text-slate-500 text-xs capitalize">{userRole}</div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all"
              >
                <LogOut size={20} />
                <span className="font-medium">Sign Out</span>
              </button>
            </>
          ) : (
            <div className="space-y-2 px-4 py-2 text-sm">
              <div className="text-slate-300 font-medium">Public User</div>
              <div className="text-slate-500 text-xs">
                You are in demo mode.{" "}
                <button
                  className="text-emerald-400 hover:text-emerald-300 underline"
                  onClick={() => navigate('/login')}
                >
                  Login
                </button>{" "}
                or{" "}
                <button
                  className="text-emerald-400 hover:text-emerald-300 underline"
                  onClick={() => navigate('/register')}
                >
                  Register
                </button>{" "}
                for full features.
              </div>
            </div>
          )}
        </div>
      </aside>
        </>
      )}

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar - Hide on auth pages */}
      {!isAuthPage && (
      <aside className={`fixed top-0 left-0 h-full w-64 bg-slate-900 text-white z-50 transform transition-transform duration-300 ease-in-out md:hidden ${
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Mic2 className="text-white" size={24} />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight">Tarannum</h1>
              <p className="text-xs text-slate-400">
                {isAuthenticated ? "AI Trainer System" : "Demo Mode"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="text-slate-400 hover:text-white"
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              (currentPath === '/' || currentPath === '/training')
                ? 'bg-emerald-600 text-white shadow-lg' 
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Mic2 size={20} />
            <span className="font-medium">
              {isAuthenticated ? "Training Studio" : "Training (Demo)"}
            </span>
          </Link>

          {userRole === 'student' && (
            <Link
              to="/progress"
              onClick={() => setMobileMenuOpen(false)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                currentPath === '/progress'
                  ? 'bg-emerald-600 text-white shadow-lg' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <BarChart3 size={20} />
              <span className="font-medium">My Progress</span>
            </Link>
          )}

          {userRole === 'qari' && (
            <Link
              to="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                currentPath === '/dashboard'
                  ? 'bg-emerald-600 text-white shadow-lg' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <LayoutDashboard size={20} />
              <span className="font-medium">My Dashboard</span>
            </Link>
          )}

          {userRole === 'admin' && (
            <>
              <div className="pt-8 pb-2 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Admin
              </div>
              <Link
                to="/admin/presets"
                onClick={() => setMobileMenuOpen(false)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  currentPath === '/admin/presets'
                    ? 'bg-emerald-600 text-white shadow-lg' 
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <BookOpen size={20} />
                <span className="font-medium">Preset Manager</span>
              </Link>
              <Link
                to="/admin/users"
                onClick={() => setMobileMenuOpen(false)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  currentPath === '/admin/users'
                    ? 'bg-emerald-600 text-white shadow-lg' 
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Users size={20} />
                <span className="font-medium">User Management</span>
              </Link>
              <Link
                to="/admin/monitoring"
                onClick={() => setMobileMenuOpen(false)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  currentPath === '/admin/monitoring'
                    ? 'bg-emerald-600 text-white shadow-lg' 
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Monitor size={20} />
                <span className="font-medium">Platform Monitoring</span>
              </Link>
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800">
          {isAuthenticated ? (
            <>
              <div className="mb-3 px-4 py-2 text-sm">
                <div className="text-slate-300 font-medium">{user?.full_name || user?.email}</div>
                <div className="text-slate-500 text-xs capitalize">{userRole}</div>
              </div>
              <button
                onClick={() => {
                  handleLogout();
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all"
              >
                <LogOut size={20} />
                <span className="font-medium">Sign Out</span>
              </button>
            </>
          ) : (
            <div className="space-y-2 px-4 py-2 text-sm">
              <div className="text-slate-300 font-medium">Public User</div>
              <div className="text-slate-500 text-xs">
                <button
                  className="text-emerald-400 hover:text-emerald-300 underline"
                  onClick={() => {
                    navigate('/login');
                    setMobileMenuOpen(false);
                  }}
                >
                  Login
                </button>
                {" or "}
                <button
                  className="text-emerald-400 hover:text-emerald-300 underline"
                  onClick={() => {
                    navigate('/register');
                    setMobileMenuOpen(false);
                  }}
                >
                  Register
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
      )}

      {/* Main Content */}
      <main className={`flex-1 ${!isAuthPage ? 'md:ml-64' : ''} relative`}>
        {/* Header - Hide on auth pages */}
        {!isAuthPage && (
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm px-3 sm:px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-2 min-h-[56px]">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <Menu size={24} />
            </button>
            <div className="flex items-center gap-2 flex-1 md:flex-none min-w-0">
                 <div className="w-8 h-8 flex-shrink-0 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center shadow-md">
                    <Mic2 className="text-white" size={16} />
                </div>
                <span className="font-bold text-slate-800 text-base sm:text-lg truncate">Tarannum AI</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 flex-shrink-0">
              {isAuthenticated && (
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium">
                  <User size={14} />
                  <span className="truncate max-w-[120px]">{user?.full_name || user?.email}</span>
                </div>
              )}
              {!isAuthenticated && (
                <>
                  <span className="hidden sm:inline-block px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                    Demo Mode
                  </span>
                  <button
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm hover:shadow-md"
                    onClick={() => navigate('/login')}
                  >
                    Login
                  </button>
                </>
              )}
            </div>
        </header>
        )}

        <div className="min-h-[calc(100vh-64px)] pb-[env(safe-area-inset-bottom)]">
          <Routes>
            {/* Auth Routes */}
            <Route 
              path="/login" 
              element={
                !isAuthenticated ? (
                  <Login
                    onSwitchToRegister={() => navigate('/register')}
                    onSuccess={() => navigate('/')}
                  />
                ) : (
                  <Navigate to="/" replace />
                )
              } 
            />
            <Route 
              path="/register" 
              element={
                !isAuthenticated ? (
                  <Register
                    onSwitchToLogin={() => navigate('/login')}
                    onSuccess={() => navigate('/login')}
                  />
                ) : (
                  <Navigate to="/" replace />
                )
              } 
            />

            {/* Main App Routes */}
            <Route 
              path="/" 
              element={<TrainingStudio />}
            />
            <Route 
              path="/training" 
              element={<TrainingStudio />}
            />
            
            {/* Student Routes */}
            <Route 
              path="/progress" 
              element={
                isAuthenticated && userRole === 'student' ? (
                  <StudentProgressView />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            
            {/* Qari Routes */}
            <Route 
              path="/dashboard" 
              element={
                isAuthenticated && userRole === 'qari' ? (
                  <QariDashboard />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route 
              path="/qari/content/edit/:contentId" 
              element={
                isAuthenticated && userRole === 'qari' ? (
                  <QariContentEditor />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            
            {/* Admin Routes */}
            <Route 
              path="/admin/presets" 
              element={
                isAuthenticated && userRole === 'admin' ? (
                  <AdminMode view="presets" />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route 
              path="/admin/users" 
              element={
                isAuthenticated && userRole === 'admin' ? (
                  <AdminMode view="users" />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route 
              path="/admin/monitoring" 
              element={
                isAuthenticated && userRole === 'admin' ? (
                  <AdminMode view="monitoring" />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            
            {/* Redirect unknown routes to home */}
            <Route 
              path="*" 
              element={<Navigate to="/" replace />}
            />
          </Routes>
        </div>
      </main>
    </div>
  );
};

export default App;