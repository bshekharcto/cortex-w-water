import { useState, useEffect } from 'react';

let isScriptLoading = false;
let isScriptLoaded = false;
const callbacks: Array<(loaded: boolean) => void> = [];

export function useGoogleMaps(apiKey: string) {
  const [isLoaded, setIsLoaded] = useState<boolean>(() => {
    return typeof window !== 'undefined' && !!(window as any).google?.maps;
  });
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Already available
    if ((window as any).google?.maps) {
      setIsLoaded(true);
      return;
    }

    if (!apiKey) {
      setLoadError('Google Maps API key is missing. Please provide VITE_GOOGLE_MAPS_API_KEY.');
      return;
    }

    // Set auth failure listener
    (window as any).gm_authFailure = () => {
      console.warn('Google Maps authentication failed with the provided key.');
      setLoadError('Google Maps rejected the provided key or billing/referrers are not configured.');
    };

    if (isScriptLoaded) {
      setIsLoaded(true);
      return;
    }

    if (isScriptLoading) {
      callbacks.push((loaded) => setIsLoaded(loaded));
      return;
    }

    isScriptLoading = true;

    // Check if script element already exists in DOM
    const existingScript = document.getElementById('google-maps-script');
    if (existingScript) {
      existingScript.addEventListener('load', () => {
        isScriptLoaded = true;
        isScriptLoading = false;
        setIsLoaded(true);
        callbacks.forEach((cb) => cb(true));
      });
      existingScript.addEventListener('error', () => {
        isScriptLoading = false;
        setLoadError('Failed to load Google Maps script.');
        callbacks.forEach((cb) => cb(false));
      });
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      isScriptLoaded = true;
      isScriptLoading = false;
      setIsLoaded(true);
      callbacks.forEach((cb) => cb(true));
    };

    script.onerror = () => {
      isScriptLoading = false;
      setLoadError('Failed to load Google Maps JavaScript API. Please check your network or key.');
      callbacks.forEach((cb) => cb(false));
    };

    document.head.appendChild(script);
  }, [apiKey]);

  return { isLoaded, loadError };
}
