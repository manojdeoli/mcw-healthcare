import React, { useState, useEffect, useRef } from 'react';
import './AttractMode.css';

const AttractMode = () => {
  const [currentView, setCurrentView] = useState(0);
  const [hotelKioskAvailable, setHotelKioskAvailable] = useState(false);
  const [hotelPort, setHotelPort] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [erSoundEnabled, setErSoundEnabled] = useState(false);
  const [hotelSoundEnabled, setHotelSoundEnabled] = useState(false);
  const iframeRefs = useRef([]); // refs to iframe DOM elements for postMessage
  const currentViewRef = useRef(0); // track current view without stale closure

  const getViews = () => [
    { url: `${window.location.origin}/#/er-dashboard`, name: 'ER Dashboard' },
    { url: hotelPort ? `http://localhost:${hotelPort}/kiosk` : null, name: 'Hotel Kiosk' }
  ].filter(view => view.url);

  // Send message to a specific iframe by index - uses postMessage for cross-origin support
  const sendToIframe = (index, msg) => {
    const iframe = iframeRefs.current[index];
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ ...msg, source: 'attract_mode' }, '*');
    }
  };

  // Send via BroadcastChannel (same-origin ER iframe) + postMessage (cross-origin Hotel iframe)
  const broadcast = (msg) => {
    // ER is same-origin: use BroadcastChannel
    const ch = new BroadcastChannel('attract_mode_sync');
    ch.postMessage(msg);
    ch.close();
    // Hotel is cross-origin: use postMessage (index 1 when hotel available, skip ER at index 0)
    iframeRefs.current.forEach((iframe, i) => {
      const views = getViews();
      if (views[i]?.name === 'Hotel Kiosk' && iframe?.contentWindow) {
        iframe.contentWindow.postMessage({ ...msg, source: 'attract_mode' }, '*');
      }
    });
  };


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
      setCurrentView(prev => {
        const newView = (prev + 1) % views.length;
        currentViewRef.current = newView;
        const activeTarget = views[newView].name === 'Hotel Kiosk' ? 'hotel' : 'er';
        // Pause only the outgoing iframe (same pattern as Hotel AttractMode)
        const outgoingIndex = prev;
        const outgoingTarget = views[outgoingIndex]?.name === 'Hotel Kiosk' ? 'hotel' : 'er';
        if (outgoingTarget === 'hotel') {
          // Hotel iframe is cross-origin: postMessage only
          iframeRefs.current[outgoingIndex]?.contentWindow?.postMessage({ type: 'PAUSE_ALL', source: 'attract_mode' }, '*');
        } else {
          // ER iframe is same-origin: BroadcastChannel only (avoids double-pause)
          const ch = new BroadcastChannel('attract_mode_sync');
          ch.postMessage({ type: 'PAUSE_ALL' });
          ch.close();
        }
        broadcast({ type: 'VIEW_CHANGED', activeView: newView, activeTarget });
        return newView;
      });
    }, 8000);

    return () => clearInterval(interval);
  }, [hotelKioskAvailable, hotelPort]);

  // Broadcast initial view state immediately so inactive iframe pauses from the start
  useEffect(() => {
    const views = getViews();
    const activeTarget = views[0]?.name === 'Hotel Kiosk' ? 'hotel' : 'er';
    currentViewRef.current = 0;
    // Use a short delay only to allow iframes to mount their message listeners
    const timer = setTimeout(() => broadcast({ type: 'VIEW_CHANGED', activeView: 0, activeTarget }), 500);
    return () => clearTimeout(timer);
  }, [hotelKioskAvailable]); // re-run when hotel becomes available so hotel iframe also gets the signal

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

  const toggleErSound = (e) => {
    e.stopPropagation();
    setErSoundEnabled(prev => {
      const next = !prev;
      broadcast({ type: 'SOUND_TOGGLE', target: 'er', enabled: next });
      return next;
    });
  };

  const toggleHotelSound = (e) => {
    e.stopPropagation();
    setHotelSoundEnabled(prev => {
      const next = !prev;
      broadcast({ type: 'SOUND_TOGGLE', target: 'hotel', enabled: next });
      return next;
    });
  };

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
    <div className="attract-mode">
      <div className="attract-container">
        {(() => {
          const views = getViews();
          return hotelKioskAvailable ? (
            views.map((view, index) => (
              <iframe
                key={index}
                ref={el => iframeRefs.current[index] = el}
                src={view.url}
                className={`attract-iframe ${currentView === index ? 'active' : ''}`}
                title={view.name}
                allow="autoplay"
                frameBorder="0"
              />
            ))
          ) : (
            // Show only ER Dashboard when Hotel is not available
            <iframe
              ref={el => iframeRefs.current[0] = el}
              src={views[0].url}
              className="attract-iframe active"
              title={views[0].name}
              allow="autoplay"
              frameBorder="0"
            />
          );
        })()}
      </div>
      
      {isFullscreen && (
        <div className="click-overlay" onClick={exitAttractMode}></div>
      )}
      
      {!isFullscreen && (
        <>
          <button className="fullscreen-button" onClick={enterFullscreen}>
            Fullscreen Mode
          </button>
          <button
            onClick={toggleErSound}
            style={{
              position: 'fixed',
              top: '20px',
              right: '160px',
              background: erSoundEnabled ? '#28a745' : 'rgba(0, 0, 0, 0.7)',
              color: 'white',
              border: '2px solid #007bff',
              borderRadius: '20px',
              padding: '6px 12px',
              fontSize: '14px',
              cursor: 'pointer',
              zIndex: 10002,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
            }}
            title="Toggle Healthcare ER sound"
          >
            {erSoundEnabled ? '🔊' : '🔇'} <span style={{ fontSize: '11px' }}>ER Sound</span>
          </button>
          {hotelKioskAvailable && (
            <button
              onClick={toggleHotelSound}
              style={{
                position: 'fixed',
                top: '20px',
                right: '290px',
                background: hotelSoundEnabled ? '#28a745' : 'rgba(0, 0, 0, 0.7)',
                color: 'white',
                border: '2px solid #e80074',
                borderRadius: '20px',
                padding: '6px 12px',
                fontSize: '14px',
                cursor: 'pointer',
                zIndex: 10002,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
              }}
              title="Toggle Hotel sound"
            >
              {hotelSoundEnabled ? '🔊' : '🔇'} <span style={{ fontSize: '11px' }}>Hotel Sound</span>
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default AttractMode;
