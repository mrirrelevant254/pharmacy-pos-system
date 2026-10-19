import axios from 'axios';

// In production, this will be relative (served by Go). 
// In development (npm run dev), it falls back to localhost.
const baseURL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8080/api' : '/api');

const api = axios.create({
    baseURL: baseURL,
    withCredentials: true, // Important for cookies/sessions if you use them
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