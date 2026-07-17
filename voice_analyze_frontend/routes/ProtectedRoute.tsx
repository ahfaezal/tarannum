import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "../store";

const ProtectedRoute: React.FC<{ roles?: string[] }> = ({ roles }) => {
  const location = useLocation();
  const { isAuthenticated, user, isLoading } = useSelector((state: RootState) => state.auth);

  if (isLoading) {
    return <div className="p-8 text-center text-sm text-slate-500">Menyemak sesi pengguna…</div>;
  }
  if (!isAuthenticated) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  if (roles && (!user?.role || !roles.includes(user.role))) {
    return <Navigate to="/training" replace />;
  }
  return <Outlet />;
};

export default ProtectedRoute;
