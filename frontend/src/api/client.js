import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8001/api';

const api = axios.create({
  baseURL,
});

export const getDashboardStats = () => api.get('/dashboard/stats');
export const getDashboardLive = () => api.get('/dashboard/live');
export const getCameras = () => api.get('/cameras');
export const getAlerts = () => api.get('/alerts/stats');
//... other api methods

export default api;
