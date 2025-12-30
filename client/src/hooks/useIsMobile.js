import { useState, useEffect } from 'react';

/**
 * Custom hook to detect if the user is on a mobile device
 * Uses both screen width and user agent detection for reliability
 */
export function useIsMobile(breakpoint = 768) {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => {
            // Check screen width
            const isSmallScreen = window.innerWidth <= breakpoint;

            // Check user agent for mobile devices
            const userAgent = navigator.userAgent || navigator.vendor || window.opera;
            const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());

            // Check for touch capability
            const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

            // Consider mobile if small screen OR (mobile device AND has touch)
            setIsMobile(isSmallScreen || (isMobileDevice && hasTouch));
        };

        // Initial check
        checkMobile();

        // Listen for resize events
        window.addEventListener('resize', checkMobile);

        // Listen for orientation changes on mobile
        window.addEventListener('orientationchange', checkMobile);

        return () => {
            window.removeEventListener('resize', checkMobile);
            window.removeEventListener('orientationchange', checkMobile);
        };
    }, [breakpoint]);

    return isMobile;
}

export default useIsMobile;
