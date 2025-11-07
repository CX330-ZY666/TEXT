// src/components/Layout.jsx
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

function Layout() {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-layout">
      <nav style={{ background: '#eee', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {token ? (
        <Link to="/" style={{ marginRight: '1rem' }}>主页</Link>
          ) : (
            <>
        <Link to="/login" style={{ marginRight: '1rem' }}>登录</Link>
        <Link to="/register">注册</Link>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {token && (
            <span style={{ fontSize: 14, color: '#333' }}>
              {user?.email || user?.username || user?.userId
                ? `欢迎，${user?.email || user?.username || `用户#${user?.userId}`}`
                : '欢迎，正在加载用户信息'}
            </span>
          )}
          <span style={{
            padding: '2px 8px',
            borderRadius: '999px',
            fontSize: '12px',
            color: token ? '#0a5' : '#666',
            background: token ? 'rgba(0,170,85,0.12)' : 'rgba(0,0,0,0.06)',
            border: token ? '1px solid rgba(0,170,85,0.35)' : '1px solid rgba(0,0,0,0.08)'
          }}>
            {token ? '已登录' : '未登录'}
          </span>
          {token && (
            <button onClick={handleLogout} style={{ background: 'none', border: '1px solid #c9c9c9', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
              退出登录
            </button>
          )}
        </div>
      </nav>
      
      <main style={{ padding: '1rem' }}>
        {/* Outlet 是一个占位符，子路由匹配的组件会在这里显示 */}
        <Outlet /> 
      </main>
    </div>
  );
}
export default Layout;