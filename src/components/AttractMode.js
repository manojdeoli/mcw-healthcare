import React, { useState, useEffect } from 'react';
import './AttractMode.css';

const AttractMode = () => {
  const [currentView, setCurrentView] = useState(0);
  const [hotelKioskAvailable, setHotelKioskAvailable] = useState(false);
  const [hotelPort, setHotelPort] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const getViews = () => [
    { url: `${window.location.origin}/#/er-dashboard`, name: 'ER Dashboard' },
    { url: hotelPort ? `http://localhost:${hotelPort}/kiosk` : null, name: 'Hotel Kiosk' }
  ].filter(view => view.url);

  // Check if Hotel Kiosk is available on either port
  useEffect(() => {
    const checkHotelKiosk = async () => {
      const ports = [4001, 4002];
      
      for (const port of ports) {
        try {
          const response = await fetch(`http://localhost:${port}/kiosk`, { mode: 'no-cors' });
          console.log(`Hotel Kiosk available on port ${port}`);
          setHotelPort(port);
          setHotelKioskAvailable(true);
          return;
        } catch (error) {
          console.log(`Hotel Kiosk not available on port ${port}`);
        }
      }
      
      console.log('Hotel Kiosk not available on any port, showing only ER Dashboard');
      setHotelKioskAvailable(false);
    };
    checkHotelKiosk();
  }, []);

  // Auto-rotate views every 8 seconds if both apps are available
  useEffect(() => {
    if (!hotelKioskAvailable) return;

    const views = getViews();
    const interval = setInterval(() => {
      setCurrentView(prev => (prev + 1) % views.length);
    }, 8000);

    return () => clearInterval(interval);
  }, [hotelKioskAvailable, hotelPort]);

  // Handle exit on ESC key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        exitAttractMode();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  // Track fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const enterFullscreen = async () => {
    try {
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        await elem.requestFullscreen();
      } else if (elem.webkitRequestFullscreen) {
        await elem.webkitRequestFullscreen();
      } else if (elem.msRequestFullscreen) {
        await elem.msRequestFullscreen();
      }
    } catch (error) {
      console.log('Fullscreen request failed:', error);
    }
  };

  const exitAttractMode = async () => {
    // Exit fullscreen
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.log('Exit fullscreen failed:', error);
    }
    window.location.hash = '/';
  };

  return (
    <div className="attract-mode" onClick={isFullscreen ? exitAttractMode : undefined}>
      <div className="attract-container">
        {(() => {
          const views = getViews();
          return hotelKioskAvailable ? (
            views.map((view, index) => (
              <iframe
                key={index}
                src={view.url}
                className={`attract-iframe ${currentView === index ? 'active' : ''}`}
                title={view.name}
                frameBorder="0"
              />
            ))
          ) : (
            // Show only ER Dashboard when Hotel is not available
            <iframe
              src={views[0].url}
              className="attract-iframe active"
              title={views[0].name}
              frameBorder="0"
            />
          );
        })()}
      </div>
      
      {isFullscreen ? (
        <div className="exit-hint">Press ESC or click anywhere to exit</div>
      ) : (
        <button className="fullscreen-button" onClick={enterFullscreen}>
          Enter Fullscreen Mode
        </button>
      )}
    </div>
  );
};

export default AttractMode;
