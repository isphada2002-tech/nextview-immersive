import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import type { Role } from './lib/types';
import Home from './pages/Home';
import Login from './pages/Login';
import PropertyLanding from './pages/PropertyLanding';
import AgencyPortal from './pages/AgencyPortal';
import PhotographerPortal from './pages/PhotographerPortal';
import AdminPortal from './pages/AdminPortal';
import { Spinner } from './components/ui';

function Guard({ roles, children }: { roles: Role[]; children: JSX.Element }) {
  const { session, profile, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <h1 className="text-2xl">Account not set up</h1>
        <p className="mt-3 text-white/60">Your sign-in worked, but your profile could not be loaded. Please contact NVI.</p>
      </div>
    );
  }
  if (!roles.includes(profile.role)) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/property/:id" element={<PropertyLanding />} />
      <Route path="/login" element={<Login />} />
      <Route path="/agency" element={<Guard roles={['agency']}><AgencyPortal /></Guard>} />
      <Route path="/photographer" element={<Guard roles={['photographer']}><PhotographerPortal /></Guard>} />
      <Route path="/admin" element={<Guard roles={['admin']}><AdminPortal /></Guard>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
