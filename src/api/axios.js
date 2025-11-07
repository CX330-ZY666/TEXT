// src/api/axios.js
import axios from 'axios';

const apiClient = axios.create({
    baseURL: 'http://localhost:3000/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

// 添加一个请求拦截器：仅附带 Authorization: Bearer <token>
apiClient.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token'); // 从localStorage获取token
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

let isRefreshing = false;
let refreshPromise = null;

// 统一处理 401：支持 TOKEN_EXPIRED 自动刷新并重试一次
apiClient.interceptors.response.use(
    (res) => res,
    (error) => {
        const status = error?.response?.status;
        const errCode = error?.response?.data?.error || error?.response?.data?.code;
        const originalRequest = error.config;

        if (status === 401 && errCode === 'TOKEN_EXPIRED' && !originalRequest._retry) {
            originalRequest._retry = true;
            if (!isRefreshing) {
                isRefreshing = true;
                refreshPromise = apiClient.post('/users/refresh')
                    .then((resp) => {
                        const newToken = resp?.data?.token;
                        if (newToken) {
                            localStorage.setItem('token', newToken);
                            return newToken;
                        }
                        throw new Error('No token in refresh response');
                    })
                    .finally(() => {
                        isRefreshing = false;
                    });
            }
            return refreshPromise.then((newToken) => {
                originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
                return apiClient(originalRequest);
            }).catch(() => {
                // 刷新失败则清理并跳登录
                try {
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                } catch (err) {
                    console.warn('清理localStorage失败:', err);
                }
                if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
                    window.location.href = '/login';
                }
                return Promise.reject(error);
            });
        }

        if (status === 401) {
            try {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
            } catch (err) {
                console.warn('清理localStorage失败:', err);
            }
            if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
                window.location.href = '/login';
            }
        }

        return Promise.reject(error);
    }
);

export default apiClient;

