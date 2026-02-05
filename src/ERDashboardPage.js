import React, { useEffect } from 'react';
import 'leaflet/dist/leaflet.css';
import ERDashboard from './components/ERDashboard';

function ERDashboardPage() {
  useEffect(() => {
    document.title = 'ER Coordination Center';
  }, []);

  return <ERDashboard />;
}

export default ERDashboardPage;
