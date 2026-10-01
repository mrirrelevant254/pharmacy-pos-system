import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:8080/api',
});

// Interceptor to attach the JWT token to every request automatically
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export default api;

// Add this to the bottom of src/api.js
api.interceptors.response.use(
    (response) => response,
    (error) => {
        // If the server returns a 401 Unauthorized, the token has expired
        if (error.response && error.response.status === 401) {
            console.warn("Session expired. Redirecting to login...");
            
            // 1. Clear the stored token (adjust 'token' to whatever key you use in localStorage)
            localStorage.removeItem('token'); 
            localStorage.removeItem('user');
            
            // 2. Force redirect to login page
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);