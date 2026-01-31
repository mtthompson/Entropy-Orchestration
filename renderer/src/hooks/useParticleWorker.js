/**
 * useParticleWorker Hook
 * Manages Web Worker for offloading particle calculations
 */
import { useRef, useEffect, useCallback } from 'react';

// Singleton worker instance (shared across all particle systems)
let workerInstance = null;
let taskIdCounter = 0;
const pendingCallbacks = new Map();

function getWorker() {
    if (!workerInstance) {
        try {
            workerInstance = new Worker(
                new URL('../workers/particleWorker.js', import.meta.url),
                { type: 'module' }
            );
            
            workerInstance.onmessage = (e) => {
                const { taskId, data, error } = e.data;
                const callback = pendingCallbacks.get(taskId);
                
                if (callback) {
                    pendingCallbacks.delete(taskId);
                    if (error) {
                        callback.reject(new Error(error));
                    } else {
                        callback.resolve(data);
                    }
                }
            };
            
            workerInstance.onerror = (err) => {
                console.error('[ParticleWorker] Error:', err);
            };
            
            console.log('[ParticleWorker] Initialized');
        } catch (err) {
            console.warn('[ParticleWorker] Failed to initialize, falling back to main thread:', err);
            return null;
        }
    }
    return workerInstance;
}

/**
 * Submit a task to the particle worker
 * @param {string} type - Task type
 * @param {object} payload - Task data
 * @returns {Promise} Resolves with result
 */
function submitTask(type, payload) {
    const worker = getWorker();
    
    if (!worker) {
        return Promise.reject(new Error('Worker not available'));
    }
    
    return new Promise((resolve, reject) => {
        const taskId = ++taskIdCounter;
        pendingCallbacks.set(taskId, { resolve, reject });
        worker.postMessage({ taskId, type, payload });
    });
}

/**
 * Hook for using particle worker in React components
 * @returns {object} Worker interface
 */
export function useParticleWorker() {
    const isAvailable = useRef(false);
    
    useEffect(() => {
        // Check if worker is available
        isAvailable.current = !!getWorker();
    }, []);
    
    const updateExplosion = useCallback(async (positions, velocities, lifetimes, delta, config = {}) => {
        if (!isAvailable.current) return null;
        
        try {
            return await submitTask('updateExplosion', {
                positions: Array.from(positions),
                velocities,
                lifetimes,
                delta,
                config
            });
        } catch (err) {
            console.warn('[useParticleWorker] Explosion update failed:', err);
            return null;
        }
    }, []);
    
    const updateSmoke = useCallback(async (positions, velocities, lifetimes, delta, config, spawnPoint, active) => {
        if (!isAvailable.current) return null;
        
        try {
            return await submitTask('updateSmoke', {
                positions: Array.from(positions),
                velocities,
                lifetimes,
                delta,
                config,
                spawnPoint,
                active
            });
        } catch (err) {
            console.warn('[useParticleWorker] Smoke update failed:', err);
            return null;
        }
    }, []);
    
    const initExplosion = useCallback(async (count, origin, config = {}) => {
        if (!isAvailable.current) return null;
        
        try {
            return await submitTask('initExplosion', { count, origin, config });
        } catch (err) {
            console.warn('[useParticleWorker] Init explosion failed:', err);
            return null;
        }
    }, []);
    
    const batchUpdate = useCallback(async (systems) => {
        if (!isAvailable.current) return null;
        
        try {
            return await submitTask('batchUpdate', { systems });
        } catch (err) {
            console.warn('[useParticleWorker] Batch update failed:', err);
            return null;
        }
    }, []);
    
    return {
        isAvailable: isAvailable.current,
        updateExplosion,
        updateSmoke,
        initExplosion,
        batchUpdate
    };
}

/**
 * Higher-order component wrapper for particle worker
 * Use when you need direct worker access without hooks
 */
export const particleWorkerAPI = {
    submit: submitTask,
    isAvailable: () => !!getWorker()
};

export default useParticleWorker;
