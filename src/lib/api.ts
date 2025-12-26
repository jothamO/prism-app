// src/lib/api.ts – Axios instance for communicating with the Prism API
import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
    withCredentials: true,
});

export default api;