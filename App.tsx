
import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './views/Login';
import Dashboard from './views/Dashboard';
import Queue from './views/Queue';
import Sales from './views/SalesView';
import Clients from './views/Clients';
import Admin from './views/Admin';
import Protocols from './views/Protocols';
import Reports from './views/Reports';
import Calendar from './views/Calendar';
import RoutesView from './views/Routes';
import WhatsAppDashboard from './views/WhatsAppDashboard';
import { ScraperView } from './views/Scraper/ScraperView';
import Prospects from './views/Prospects';
import WorkloadUpload from './views/WorkloadUpload';
import { CampaignPlanner } from './views/CampaignPlanner';
import { Quotes } from './views/Quotes';
import { DataCenter } from './views/DataCenter';
// Import updated views
import { UserRole } from './types';

const App: React.FC = () => {
  const [user, setUser] = React.useState<any>(() => {
    const saved = localStorage.getItem('dreon_user');
    return saved ? JSON.parse(saved) : null;
  });

  const handleLogin = (userData: any) => {
    setUser(userData);
    localStorage.setItem('dreon_user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('dreon_user');
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <HashRouter>
      <Layout user={user} onLogout={handleLogout}>
        <Routes>
          <Route path="/" element={<Dashboard user={user} />} />
          <Route path="/queue" element={
            <Queue user={user} />
          } />
          <Route path="/sales" element={<Sales user={user} />} />
          <Route path="/clients" element={<Clients user={user} />} />
          <Route path="/protocols" element={<Protocols user={user} />} />
          <Route path="/admin" element={
            user.role === UserRole.ADMIN ? <Admin user={user} /> : <Navigate to="/" />
          } />
          <Route path="/calendar" element={<Calendar user={user} />} />
          <Route path="/routes" element={<RoutesView user={user} />} />
          <Route path="/whatsapp" element={<WhatsAppDashboard user={user} />} />
          <Route path="/scraper" element={<ScraperView user={user} />} />
          <Route path="/reports" element={<Reports user={user} />} />
          <Route path="/prospects" element={<Prospects />} />
          <Route path="/quotes" element={<Quotes user={user} />} />
          <Route path="/workload" element={
            user.role === UserRole.ADMIN || user.role === UserRole.SUPERVISOR ? <WorkloadUpload user={user} /> : <Navigate to="/" />
          } />
          <Route path="/campaigns" element={
            user.role === UserRole.ADMIN || user.role === UserRole.SUPERVISOR ? <CampaignPlanner /> : <Navigate to="/" />
          } />
          <Route path="/data-center" element={
            user.role === UserRole.ADMIN || user.role === UserRole.SUPERVISOR ? <DataCenter user={user} /> : <Navigate to="/" />
          } />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
};

export default App;
