import { useEffect, useRef } from 'react';

export default function useBarcodeScanner(onScan) {
    const barcodeBuffer = useRef('');
    const lastKeyTime = useRef(0);

    useEffect(() => {
        const handleKeyDown = (e) => {
            const currentTime = new Date().getTime();
            
            // If the time between keystrokes is too long (> 50ms), it's likely manual typing, reset buffer
            if (currentTime - lastKeyTime.current > 50) {
                barcodeBuffer.current = '';
            }
            lastKeyTime.current = currentTime;

            if (e.key === 'Enter') {
                if (barcodeBuffer.current.length > 3) { // Minimum length for a valid barcode
                    onScan(barcodeBuffer.current);
                }
                barcodeBuffer.current = ''; // Reset after scanning
                e.preventDefault(); // Prevent form submission if inside a form
            } else if (e.key.length === 1) {
                barcodeBuffer.current += e.key;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onScan]);
}
