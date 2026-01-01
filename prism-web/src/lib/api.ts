// src/lib/api.ts – Axios instance for communicating with the Prism API
import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
    withCredentials: true,
});

// Request interceptor to add Authorization header
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('admin_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

// Response interceptor to handle token expiration
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // If token expired and we haven't tried to refresh yet
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            const refreshToken = localStorage.getItem('admin_refresh_token');
            
            if (refreshToken) {
                try {
                    const response = await axios.post(
                        `${api.defaults.baseURL}/auth/refresh`,
                        { refreshToken }
                    );

                    const { token, refreshToken: newRefreshToken } = response.data;
                    
                    // Store new tokens
                    localStorage.setItem('admin_token', token);
                    if (newRefreshToken) {
                        localStorage.setItem('admin_refresh_token', newRefreshToken);
                    }

                    // Retry original request with new token
                    originalRequest.headers.Authorization = `Bearer ${token}`;
                    return api(originalRequest);
                } catch (refreshError) {
                    // Refresh failed, clear tokens and redirect to login
                    localStorage.removeItem('admin_token');
                    localStorage.removeItem('admin_refresh_token');
                    window.location.href = '/admin/login';
                    return Promise.reject(refreshError);
                }
            } else {
                // No refresh token, redirect to login
                localStorage.removeItem('admin_token');
                window.location.href = '/admin/login';
            }
        }

        return Promise.reject(error);
    }
);

export default api;
