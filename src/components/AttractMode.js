import React, { useState, useEffect, useRef } from 'react';
import './AttractMode.css';

// Presentation sequence configuration
const SEQUENCE_CONFIG = {
  HEALTHCARE_SLIDE_DURATION: 5000, // 5 seconds
  HOTEL_SLIDE_DURATION: 5000, // 5 seconds
  WIPRO_LOGO_DURATION: 2000, // 2 seconds
  FADE_DURATION: 200 // Reduced to 0.2 seconds for faster transitions
};

// Presentation sequence steps
const SEQUENCE_STEPS = [
  { type: 'ER_VIDEO_1', target: 'er' },
  { type: 'ER_VIDEO_2', target: 'er' },
  { type: 'HEALTHCARE_SLIDE', duration: SEQUENCE_CONFIG.HEALTHCARE_SLIDE_DURATION },
  { type: 'WIPRO_LOGO', duration: SEQUENCE_CONFIG.WIPRO_LOGO_DURATION },
  { type: 'HOTEL_VIDEO_1', target: 'hotel' },
  { type: 'HOTEL_VIDEO_2', target: 'hotel' },
  { type: 'HOTEL_SLIDE', duration: SEQUENCE_CONFIG.HOTEL_SLIDE_DURATION },
  { type: 'WIPRO_LOGO', duration: SEQUENCE_CONFIG.WIPRO_LOGO_DURATION }
];

const AttractMode = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isShowingSlide, setIsShowingSlide] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(null);
  const [hotelKioskAvailable, setHotelKioskAvailable] = useState(false);
  const [hotelPort, setHotelPort] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [erSoundEnabled, setErSoundEnabled] = useState(false);
  const [hotelSoundEnabled, setHotelSoundEnabled] = useState(false);
  const [isFrozen, setIsFrozen] = useState(false);
  const [erVideo1, setErVideo1] = useState(null);
  const [erVideo2, setErVideo2] = useState(null);
  const [videoIndex, setVideoIndex] = useState(0);
  const iframeRefs = useRef([]);
  const stepTimerRef = useRef(null);
  const currentStepRef = useRef(0);
  const frozenRef = useRef(false);
  const hotelKioskAvailableRef = useRef(false);
  const hotelPortRef = useRef(null);

  // Initialize different videos for VIDEO_1 and VIDEO_2 with proper rotation
  useEffect(() => {
    const videos = ['ER-1.mp4', 'ER-2.mp4', 'ER-3.mp4', 'ER-4.mp4', 'ER-5.mp4', 'ER-6.mp4', 'ER-7.mp4', 'ER-8.mp4', 'ER-9.mp4'];
    const video1 = videos[videoIndex % videos.length];
    const video2 = videos[(videoIndex + 1) % videos.length];
    setErVideo1(video1);
    setErVideo2(video2);
    console.log('🎥 AttractMode: Selected ER videos - Video1:', video1, 'Video2:', video2);
  }, [videoIndex]);

  // Rotate videos after each complete cycle
  const rotateVideos = () => {
    setVideoIndex(prev => (prev + 2) % 9); // Move by 2 to get next pair
  };

  // Get current sequence step
  const getCurrentStep = () => SEQUENCE_STEPS[currentStep];
  const step = getCurrentStep();

  // Determine if we should show iframe content
  const shouldShowIframe = step.type.includes('VIDEO') && !isShowingSlide;
  const activeTarget = step.target;
  const currentView = step.target === 'hotel' ? 1 : 0;

  const getViews = () => [
    { url: `${window.location.origin}/#/er-dashboard`, name: 'ER Dashboard' },
    { url: hotelPort ? `http://localhost:${hotelPort}/kiosk` : null, name: 'Hotel Kiosk' }
  ].filter(view => view.url);

  // Send via BroadcastChannel (same-origin ER iframe) + postMessage (cross-origin Hotel iframe)
  const broadcast = (msg) => {
    console.log('📡 AttractMode broadcasting:', msg);
    // ER is same-origin: use BroadcastChannel
    const ch = new BroadcastChannel('attract_mode_sync');
    ch.postMessage(msg);
    ch.close();
    // Hotel is cross-origin: use postMessage
    iframeRefs.current.forEach((iframe, i) => {
      const views = getViews();
      if (views[i]?.name === 'Hotel Kiosk' && iframe?.contentWindow) {
        console.log('📤 Sending to Hotel iframe:', msg);
        iframe.contentWindow.postMessage({ ...msg, source: 'attract_mode' }, '*');
      }
    });
  };

  // Move to next step in sequence
  const nextStep = () => {
    console.log('🔄 AttractMode: Moving from step', currentStep, 'to next step');
    setCurrentStep(prev => {
      const next = (prev + 1) % SEQUENCE_STEPS.length;
      currentStepRef.current = next;
      
      // Rotate videos when completing a full cycle (back to step 0)
      if (next === 0) {
        rotateVideos();
      }
      
      console.log('🎯 AttractMode: Next step is', next, ':', SEQUENCE_STEPS[next].type);
      return next;
    });
  };

  // Handle slide display with seamless crossfade to eliminate flicker
  const showSlide = (slideType, duration) => {
    console.log('🖼️ AttractMode: Showing slide:', slideType, 'duration:', duration);
    
    // Show slide immediately without fading iframe first
    setIsShowingSlide(true);
    setCurrentSlide(slideType);
    
    // Schedule slide end
    stepTimerRef.current = setTimeout(() => {
      console.log('➡️ AttractMode: Moving to next step');
      setIsShowingSlide(false);
      setCurrentSlide(null);
      nextStep();
    }, duration);
  };

  // Handle video completion
  const handleVideoComplete = () => {
    if (stepTimerRef.current) {
      clearTimeout(stepTimerRef.current);
    }
    nextStep();
  };

  // Hotel detection
  useEffect(() => {
    const checkHotelKiosk = async () => {
      const ports = [4001, 4002, 3005, 3006];
      for (const port of ports) {
        try {
          const check = await fetch(`http://localhost:${port}/hotel_logo.png`, { cache: 'no-store' });
          if (check.ok) {
            console.log(`Hotel Kiosk available on port ${port}`);
            hotelPortRef.current = port;
            hotelKioskAvailableRef.current = true;
            setHotelPort(port);
            setHotelKioskAvailable(true);
            return;
          }
        } catch {
          console.log(`Hotel Kiosk not available on port ${port}`);
        }
      }
      console.log('Hotel Kiosk not available on any port, showing only ER Dashboard');
      hotelKioskAvailableRef.current = false;
      setHotelKioskAvailable(false);
    };
    checkHotelKiosk();
    const poll = setInterval(checkHotelKiosk, 30000);
    return () => clearInterval(poll);
  }, []);

  // Main sequence controller
  useEffect(() => {
    const step = getCurrentStep();
    
    if (step.type.includes('SLIDE') || step.type === 'WIPRO_LOGO') {
      // Show static slide
      showSlide(step.type, step.duration);
    } else if (step.type.includes('VIDEO')) {
      // Show video iframe
      setIsShowingSlide(false);
      setCurrentSlide(null);
      
      // Broadcast to iframe
      const activeTarget = step.target;
      const activeView = step.target === 'hotel' ? 1 : 0;
      
      console.log('🎥 AttractMode: Starting', step.type, 'for', activeTarget, 'at', new Date().toLocaleTimeString());
      
      broadcast({ 
        type: 'VIEW_CHANGED', 
        activeView, 
        activeTarget,
        videoNumber: step.type.includes('VIDEO_1') ? 1 : 2,
        specificVideo: activeTarget === 'er' ? (step.type.includes('VIDEO_1') ? erVideo1 : erVideo2) : undefined
      });
      
      // Send activation message again after a short delay to ensure iframe is ready
      setTimeout(() => {
        console.log('🎥 AttractMode: Delayed activation for', step.type);
        broadcast({ 
          type: 'VIEW_CHANGED', 
          activeView, 
          activeTarget,
          videoNumber: step.type.includes('VIDEO_1') ? 1 : 2,
          specificVideo: activeTarget === 'er' ? (step.type.includes('VIDEO_1') ? erVideo1 : erVideo2) : undefined
        });
      }, 100);
      
      // FIXED: Use exact 8 second duration for all videos
      stepTimerRef.current = setTimeout(() => {
        console.log('🎥 AttractMode: EXACTLY 8 seconds completed for', step.type, 'at', new Date().toLocaleTimeString());
        handleVideoComplete();
      }, 8000);
    }
    
    return () => {
      if (stepTimerRef.current) {
        clearTimeout(stepTimerRef.current);
      }
    };
  }, [currentStep]);

  // Start sequence on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      const step = getCurrentStep();
      if (step.type.includes('VIDEO')) {
        console.log('🎥 AttractMode: Initial broadcast for', step.type, 'at', new Date().toLocaleTimeString());
        broadcast({ 
          type: 'VIEW_CHANGED', 
          activeView: step.target === 'hotel' ? 1 : 0, 
          activeTarget: step.target,
          videoNumber: 1
        });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // Handle messages from iframes
  useEffect(() => {
    const handler = (event) => {
      if (event.data?.type === 'TRY_NOW') {
        const close = async () => {
          try { if (document.fullscreenElement) await document.exitFullscreen(); } catch {}
          if (window.opener) {
            window.opener.focus();
            window.close();
          } else {
            window.location.hash = '/';
          }
        };
        close();
      } else if (event.data?.type === 'FREEZE_START') {
        console.log('❄️ AttractMode: FREEZE_START received - pausing sequence');
        setIsFrozen(true);
        frozenRef.current = true;
      } else if (event.data?.type === 'FREEZE_END') {
        console.log('🔓 AttractMode: FREEZE_END received - resuming sequence');
        setIsFrozen(false);
        frozenRef.current = false;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

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
      console.log('🔊 AttractMode: Toggling ER sound from', prev, 'to', next);
      broadcast({ type: 'SOUND_TOGGLE', target: 'er', enabled: next });
      return next;
    });
  };

  const toggleHotelSound = (e) => {
    e.stopPropagation();
    setHotelSoundEnabled(prev => {
      const next = !prev;
      console.log('🔊 AttractMode: Toggling Hotel sound from', prev, 'to', next);
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
      {/* Slide Display - Higher z-index for seamless transition */}
      {isShowingSlide && (
        <div className="slide-container" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: '#000',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 2000, // Higher than iframe to cover seamlessly
          opacity: 1
        }}>
          <img
            src={currentSlide === 'WIPRO_LOGO' ? '/wipro-logo.png' : 
                 currentSlide === 'HOTEL_SLIDE' ? '/AdunaSlideforDemo.png' : 
                 '/NokiaSlideforDemo.png'}
            alt={currentSlide === 'WIPRO_LOGO' ? 'Wipro Logo' : 
                 currentSlide === 'HOTEL_SLIDE' ? 'Aduna Demo Slide' : 
                 'Nokia Healthcare Slide'}
            style={{
              maxWidth: '100vw',
              maxHeight: '100vh',
              objectFit: 'contain',
              opacity: 1
            }}
          />
        </div>
      )}
      
      {/* Iframe Content - ALWAYS RENDERED to prevent audio state loss */}
      <div className="attract-container" style={{
        opacity: shouldShowIframe ? 1 : 0,
        transition: 'opacity 200ms ease-in-out',
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: isShowingSlide ? -1 : 1, // Hide behind slides but keep rendered
        pointerEvents: isShowingSlide ? 'none' : 'auto'
      }}>
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
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none'
                  }}
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
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none'
                }}
              />
            );
          })()}
        </div>
      )}
      
      {isFullscreen && (
        <div className="click-overlay" onClick={exitAttractMode}></div>
      )}
      
      {/* Sound buttons - always visible */}
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
      
      {!isFullscreen && (
        <button className="fullscreen-button" onClick={enterFullscreen}>
          Fullscreen Mode
        </button>
      )}
    </div>
  );
};

export default AttractMode;