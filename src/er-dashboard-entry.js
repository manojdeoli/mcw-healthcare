import React from 'react';
import ReactDOM from 'react-dom/client';
import ERDashboard from './components/ERDashboard';
import './components/ERDashboard.css';

const root = ReactDOM.createRoot(document.getElementById('er-root'));
root.render(
  <React.StrictMode>
    <ERDashboard />
  </React.StrictMode>
);
