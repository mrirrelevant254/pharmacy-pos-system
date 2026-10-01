import { useEffect, useRef } from 'react';

export default function useBarcodeScanner(onScan) {
    const inputRef = useRef(null);

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }

        const handleGlobalClick = () => {
            if (inputRef.current) {
                inputRef.current.focus();
            }
        };

        document.addEventListener('click', handleGlobalClick);
        
        return () => document.removeEventListener('click', handleGlobalClick);
    }, []);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            const barcode = e.target.value.trim();
            if (barcode.length > 0) {
                onScan(barcode);
                e.target.value = '';
            }
        }
    };

    return { inputRef, handleKeyDown };
}
