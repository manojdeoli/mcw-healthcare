import React, { useState, useEffect } from 'react';
import './AttractMode.css';

const AttractMode = () => {
  const [currentView, setCurrentView] = useState(0);
  const [hotelKioskAvailable, setHotelKioskAvailable] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const views = [
    { url: 'http://localhost:3000/#/er-dashboard', name: 'ER Dashboard' },
    { url: 'http://localhost:4002/kiosk', name: 'Hotel Kiosk' }
  ];

  // Check if Hotel Kiosk is available
  useEffect(() => {
    const checkHotelKiosk = async () => {
      try {
        const response = await fetch('http://localhost:4002/kiosk', { mode: 'no-cors' });
        setHotelKioskAvailable(true);
      } catch (error) {
        setHotelKioskAvailable(false);
      }
    };
    checkHotelKiosk();
  }, []);

  // Auto-rotate views every 8 seconds if both apps are available
  useEffect(() => {
    if (!hotelKioskAvailable) return;

    const interval = setInterval(() => {
      setCurrentView(prev => (prev + 1) % views.length);
    }, 8000);

    return () => clearInterval(interval);
  }, [hotelKioskAvailable, views.length]);

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
        {hotelKioskAvailable ? (
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
          <iframe
            src={views[0].url}
            className="attract-iframe active"
            title={views[0].name}
            frameBorder="0"
          />
        )}
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
