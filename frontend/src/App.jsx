import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { UserProvider } from './context/UserContext';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import DocumentList from './pages/DocumentList';
import SearchPage from './pages/SearchPage';
import SettingsPage from './pages/SettingsPage';
import MdfList from './pages/MdfList';
import MdfDetail from './pages/MdfDetail';


function App() {
  return (
    <UserProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="documents" element={<DocumentList />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="mdf" element={<MdfList />} />
            <Route path="mdf/:id" element={<MdfDetail />} />
            <Route path="settings" element={<SettingsPage />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </UserProvider>
  );
}

export default App;
