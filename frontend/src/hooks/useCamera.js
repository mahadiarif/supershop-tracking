import { useState, useEffect, useCallback } from 'react';
import { getCameras } from '../api/client';

export function useCamera() {
    const [cameras, setCameras] = useState(null);
    const [error, setError] = useState('');
    
    const fetchCameras = useCallback(async () => {
        try {
            const res = await getCameras();
            setCameras(res.data);
            setError('');
        } catch (err) {
            console.error("Failed to load cameras", err);
            setError('Failed to load camera list.');
            setCameras([]);
        }
    }, []);

    useEffect(() => {
        fetchCameras();
    }, [fetchCameras]);

    return { cameras, error, refresh: fetchCameras };
}
