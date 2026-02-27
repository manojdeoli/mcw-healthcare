import React, { useState, useEffect, useRef } from 'react';
import './AttractMode.css';

// Presentation sequence configuration
const SEQUENCE_CONFIG = {
  HEALTHCARE_SLIDE_DURATION: 5000, // 5 seconds
  HOTEL_SLIDE_DURATION: 5000, // 5 seconds
  WIPRO_LOGO_DURATION: 2000, // 2 seconds
  FADE_DURATION: 1200 // 1.2 seconds for transitions
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
  const [slideExiting, setSlideExiting] = useState(false);
  const [videoTransitioning, setVideoTransitioning] = useState(false);
  const [hotelKioskAvailable, setHotelKioskAvailable] = useState(false);
  const [hotelPort, setHotelPort] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [erSoundEnabled, setErSoundEnabled] = useState(false);
  const [hotelSoundEnabled, setHotelSoundEnabled] = useState(false);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const iframeRefs = useRef([]);
  const stepTimerRef = useRef(null);
  const currentStepRef = useRef(0);
  const hotelKioskAvailableRef = useRef(false);
  const hotelPortRef = useRef(null);

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
    console.log('🔄 AttractMode: nextStep() called - current step:', currentStep);
    setCurrentStep(prev => {
      const next = (prev + 1) % SEQUENCE_STEPS.length;
      console.log('🔄 AttractMode: Moving from step', prev, 'to step', next, '- Step type:', SEQUENCE_STEPS[next]?.type);
      currentStepRef.current = next;
      return next;
    });
  };

  // Handle slide display
  const showSlide = (slideType, duration) => {
    console.log('🖼️ AttractMode: showSlide called with slideType:', slideType, 'duration:', duration);
    setSlideExiting(false);
    setIsShowingSlide(true);
    setCurrentSlide(slideType);
    console.log('🖼️ AttractMode: currentSlide set to:', slideType);
    
    stepTimerRef.current = setTimeout(() => {
      // Start exit animation
      setSlideExiting(true);
      
      // Wait for exit animation to complete before moving to next step
      setTimeout(() => {
        setIsShowingSlide(false);
        setCurrentSlide(null);
        setSlideExiting(false);
        nextStep();
      }, SEQUENCE_CONFIG.FADE_DURATION);
    }, duration - SEQUENCE_CONFIG.FADE_DURATION);
  };

  // Handle video completion
  const handleVideoComplete = () => {
    console.log('🎬 AttractMode: handleVideoComplete() called - stepTimerRef.current:', !!stepTimerRef.current);
    
    if (stepTimerRef.current) {
      console.log('🎬 AttractMode: Clearing existing stepTimer');
      clearTimeout(stepTimerRef.current);
    }
    
    console.log('🎬 AttractMode: Video completed, proceeding to next step');
    
    // Clear any existing timeout to prevent race conditions
    if (stepTimerRef.current) {
      console.log('🎬 AttractMode: Double-clearing stepTimer for safety');
      clearTimeout(stepTimerRef.current);
      stepTimerRef.current = null;
    }
    
    nextStep();
  };

  // Hotel detection
  useEffect(() => {
    const checkHotelKiosk = async () => {
      const ports = [4001, 4002];
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
    console.log('🎬 AttractMode: Main sequence controller triggered - currentStep:', currentStep, 'stepType:', step.type);
    
    if (step.type.includes('SLIDE') || step.type === 'WIPRO_LOGO') {
      console.log('🖼️ AttractMode: Showing slide:', step.type, 'duration:', step.duration);
      // Show static slide
      showSlide(step.type, step.duration);
    } else if (step.type.includes('VIDEO')) {
      console.log('🎥 AttractMode: Starting video step:', step.type, 'target:', step.target);
      // Show video iframe with transition
      setIsShowingSlide(false);
      setCurrentSlide(null);
      
      const activeTarget = step.target;
      const activeView = step.target === 'hotel' ? 1 : 0;
      const videoNumber = step.type.includes('VIDEO_1') ? 1 : 2;
      
      console.log('🎥 AttractMode: Video details - activeTarget:', activeTarget, 'activeView:', activeView, 'videoNumber:', videoNumber);
      
      // Start video transition
      setVideoTransitioning(true);
      console.log('🎥 AttractMode: Video transition started');
      
      // Get next video in rotation
      const erVideos = ['ER-1.mp4', 'ER-2.mp4', 'ER-3.mp4', 'ER-4.mp4', 'ER-5.mp4', 'ER-6.mp4', 'ER-7.mp4', 'ER-8.mp4', 'ER-9.mp4'];
      const selectedVideo = erVideos[currentVideoIndex];
      console.log('🎥 AttractMode: Selected video:', selectedVideo, 'currentVideoIndex:', currentVideoIndex);
      
      // Update video index for next time
      setCurrentVideoIndex(prev => {
        const next = (prev + 1) % erVideos.length;
        console.log('🎥 AttractMode: Updated video index from', prev, 'to', next);
        return next;
      });
      
      // Wait for transition, then broadcast to iframe
      setTimeout(() => {
        console.log('📡 AttractMode: Broadcasting VIEW_CHANGED message');
        broadcast({ 
          type: 'VIEW_CHANGED', 
          activeView, 
          activeTarget,
          videoNumber,
          specificVideo: selectedVideo
        });
        
        // End transition
        setTimeout(() => {
          console.log('🎥 AttractMode: Video transition ended');
          setVideoTransitioning(false);
        }, 600);
      }, 300);
      
      // No timeout - wait for VIDEO_ENDED message from iframe
      console.log('🎥 AttractMode: Waiting for VIDEO_ENDED message from iframe');
    }
    
    return () => {
      if (stepTimerRef.current) {
        console.log('🧽 AttractMode: Cleanup - clearing stepTimer');
        clearTimeout(stepTimerRef.current);
      }
    };
  }, [currentStep]);

  // Start sequence on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      const step = getCurrentStep();
      if (step.type.includes('VIDEO')) {
        const erVideos = ['ER-1.mp4', 'ER-2.mp4', 'ER-3.mp4', 'ER-4.mp4', 'ER-5.mp4', 'ER-6.mp4', 'ER-7.mp4', 'ER-8.mp4', 'ER-9.mp4'];
        const selectedVideo = erVideos[currentVideoIndex];
        setCurrentVideoIndex(prev => (prev + 1) % erVideos.length);
        
        broadcast({ 
          type: 'VIEW_CHANGED', 
          activeView: step.target === 'hotel' ? 1 : 0, 
          activeTarget: step.target,
          videoNumber: 1,
          specificVideo: selectedVideo
        });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // Handle messages from iframes
  useEffect(() => {
    const handler = (event) => {
      console.log('📨 AttractMode: Received message:', event.data);
      
      if (event.data?.type === 'TRY_NOW') {
        console.log('📨 AttractMode: Handling TRY_NOW message');
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
      } else if (event.data?.type === 'VIDEO_ENDED') {
        console.log('📺 AttractMode: Received VIDEO_ENDED from iframe');
        
        // Only handle if we're currently showing a video step and not already transitioning
        const currentStep = SEQUENCE_STEPS[currentStepRef.current];
        const isVideoStep = currentStep?.type.includes('VIDEO');
        const isAlreadyTransitioning = !!stepTimerRef.current;
        
        console.log('📺 AttractMode: VIDEO_ENDED check - currentStep:', currentStepRef.current, 'stepType:', currentStep?.type, 'isVideoStep:', isVideoStep, 'isAlreadyTransitioning:', isAlreadyTransitioning);
        
        if (isVideoStep && !isAlreadyTransitioning) {
          console.log('📺 AttractMode: Processing VIDEO_ENDED - calling handleVideoComplete()');
          handleVideoComplete();
        } else {
          console.log('📺 AttractMode: Ignoring VIDEO_ENDED - not video step or already transitioning');
        }
      }
    };
    
    console.log('📨 AttractMode: Setting up message listener');
    window.addEventListener('message', handler);
    
    return () => {
      console.log('📨 AttractMode: Cleaning up message listener');
      window.removeEventListener('message', handler);
    };
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
      {/* Slide Display */}
      {isShowingSlide && (
        <div className={`slide-container ${slideExiting ? 'slide-out' : ''}`} style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <img
            src={(() => {
              console.log('🖼️ AttractMode: Rendering slide with currentSlide:', currentSlide);
              if (currentSlide === 'WIPRO_LOGO') {
                console.log('🖼️ AttractMode: Showing Wipro Logo');
                return '/Wipro-Logo.png?v=1';
              } else if (currentSlide === 'HOTEL_SLIDE') {
                console.log('🖼️ AttractMode: Showing Aduna Slide');
                return '/AdunaSlideforDemo.png?v=1';
              } else {
                console.log('🖼️ AttractMode: Showing Nokia Healthcare Slide');
                return '/NokiaSlideforDemo.png?v=1';
              }
            })()
            }
            alt={currentSlide === 'WIPRO_LOGO' ? 'Wipro Logo' : 
                 currentSlide === 'HOTEL_SLIDE' ? 'Aduna Demo Slide' : 
                 'Nokia Healthcare Slide'}
            style={{
              maxWidth: '100vw',
              maxHeight: '100vh',
              objectFit: 'contain'
            }}
          />
        </div>
      )}
      
      {/* Iframe Content */}
      {shouldShowIframe && (
        <div className="attract-container">
          <div className={`video-transition-overlay ${videoTransitioning ? 'transitioning' : ''}`}></div>
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
          })()
          )}
        </div>
      )}
      
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