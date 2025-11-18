// API configuration utility
const LOCAL_URL = 'http://localhost:5000';
const RENDER_URL = 'https://cotton-api-ekdn.onrender.com';

const getCurrentApiUrl = () => {
  const stored = localStorage.getItem('apiEnvironment');
  if (stored === 'render') return RENDER_URL;
  if (stored === 'local') return LOCAL_URL;
  return RENDER_URL;
};

export const getApiUrl = (endpoint) => {
  return `${getCurrentApiUrl()}${endpoint}`;
};

export const setApiEnvironment = (environment) => {
  localStorage.setItem('apiEnvironment', environment);
};

export const getCurrentEnvironment = () => {
  const stored = localStorage.getItem('apiEnvironment');
  if (stored) return stored;
  return 'render';
};

export { LOCAL_URL, RENDER_URL };