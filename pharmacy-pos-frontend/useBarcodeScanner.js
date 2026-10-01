import { useEffect, useRef } from 'react';

export default function useBarcodeScanner(onScan) {
    const buffer = useRef('');
    const lastKeyTime = useRef(0);

    useEffect(() => {
        const handleKeyDown = (e) => {
            // CRITICAL: Check what element currently has focus
            const activeElement = document.activeElement;
            const activeTag = activeElement?.tagName;
            
            // If user is typing in ANY input field, IGNORE the scanner completely
            if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
                return;
            }

            const currentTime = new Date().getTime();
            
            // Reset buffer if typing is too slow (>100ms between keys)
            if (currentTime - lastKeyTime.current > 100) {
                buffer.current = '';
            }
            lastKeyTime.current = currentTime;

            if (e.key === 'Enter') {
                if (buffer.current.length > 2) {
                    onScan(buffer.current);
                }
                buffer.current = '';
                e.preventDefault();
            } else if (e.key.length === 1) {
                buffer.current += e.key;
            }
        };

        // Use window.addEventListener for global capture
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onScan]);

    // Return null since we don't need an input ref anymore
    return { inputRef: null, handleKeyDown: null };
}