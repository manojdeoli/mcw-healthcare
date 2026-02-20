import React from 'react';
import ReactDOM from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import './index.css';
import App from './App';
import ERDashboardPage from './ERDashboardPage';
import AttractMode from './components/AttractMode';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));

// Check route
const hash = window.location.hash;
const isERDashboard = hash === '#/er-dashboard';
const isAttractMode = hash === '#/attract-mode';

root.render(
  <React.StrictMode>
    {isAttractMode ? <AttractMode /> : isERDashboard ? <ERDashboardPage /> : <App />}
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
