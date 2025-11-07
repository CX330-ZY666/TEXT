// src/pages/LoginPage.jsx
import { useState } from 'react';
import apiClient from '../api/axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx'; // 引入useAuth

function LoginPage() {
  const [formData, setFormData] = useState({
    email: '', 
    password: ''
  });
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth(); // 从Context中获取login函数

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      console.log('发送登录请求:', formData);
      const response = await apiClient.post('/users/login', formData);
      console.log('登录响应:', response.data);
      
      const { token } = response.data || {};
      // 兼容不同后端返回格式，尽力提取用户信息
      const derivedUser = response.data?.user
        || (response.data?.email || response.data?.username
            ? { email: response.data.email, username: response.data.username }
            : null);
      if (token) {
        console.log('保存Token与用户:', token, derivedUser);
        login(token, derivedUser); // 保存token与用户信息（可能为null）
        navigate('/'); // 登录成功后跳转到主页
      } else {
        console.error('响应中没有token:', response.data);
        setError('登录响应格式错误');
      }
    } catch (err) {
      console.error('登录失败:', err.response?.data);
      setError(err.response?.data?.msg || '登录失败，请检查邮箱和密码');
    }
  };

  return (
    <div>
      <h1>登录</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label>邮箱:</label>
          <input 
            name="email"
            type="email" 
            value={formData.email} 
            onChange={handleChange}
            placeholder="邮箱"
            required
          />
        </div>
        <div>
          <label>密码:</label>
          <input 
            name="password"
            type="password" 
            value={formData.password}
            onChange={handleChange}
            placeholder="密码"
            required
          />
        </div>
        <button type="submit">登录</button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}
export default LoginPage;