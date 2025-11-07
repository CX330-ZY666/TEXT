// src/App.jsx
import { Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import KnowledgePointFormPage from './pages/KnowledgePointFormPage';
import FeynmanRecordPage from './pages/FeynmanRecordPage';

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* 公共路由 */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* 受保护的路由 */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/kp/new" element={<KnowledgePointFormPage />} />
          <Route path="/kp/edit/:id" element={<KnowledgePointFormPage />} />
          <Route path="/feynman/:id" element={<FeynmanRecordPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
export default App;