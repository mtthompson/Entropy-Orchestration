import React, { useEffect } from 'react';

// Toast types: 'success', 'error', 'info'
export function ToastNotification({ toasts, setToasts }) {
    // Auto-cleanup toasts after 3 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            setToasts(prev => prev.filter(t => Date.now() - t.timestamp < 3000));
        }, 100);
        return () => clearInterval(interval);
    }, [setToasts]);

    const getColor = (type) => {
        switch (type) {
            case 'success': return '#00ff00';
            case 'error': return '#ff0000';
            case 'info':
            default: return '#00ffff';
        }
    };

    return (
        <>
            <style>{`
                @keyframes toastFadeIn {
                    0% { transform: translateX(-50%) translateY(-20px) scale(0.8); opacity: 0; }
                    100% { transform: translateX(-50%) translateY(0) scale(1); opacity: 1; }
                }
                @keyframes toastFadeOut {
                    0% { transform: translateX(-50%) translateY(0) scale(1); opacity: 1; }
                    100% { transform: translateX(-50%) translateY(-20px) scale(0.8); opacity: 0; }
                }
            `}</style>
            <div style={{
                position: 'fixed',
                top: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 2500,
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                pointerEvents: 'none'
            }}>
                {toasts.map((toast) => {
                    const age = Date.now() - toast.timestamp;
                    const isLeaving = age > 2700;
                    const color = getColor(toast.type);

                    return (
                        <div
                            key={toast.id}
                            style={{
                                background: 'rgba(0, 0, 0, 0.9)',
                                border: `2px solid ${color}`,
                                borderRadius: '8px',
                                padding: '12px 24px',
                                color: color,
                                fontFamily: '"Segoe UI", "Roboto", "Helvetica", sans-serif',
                                fontSize: '14px',
                                fontWeight: 'bold',
                                textTransform: 'uppercase',
                                letterSpacing: '2px',
                                boxShadow: `0 0 20px ${color}`,
                                animation: `${isLeaving ? 'toastFadeOut' : 'toastFadeIn'} 0.3s ease-out forwards`,
                                textAlign: 'center',
                                minWidth: '200px'
                            }}
                        >
                            {toast.message}
                        </div>
                    );
                })}
            </div>
        </>
    );
}
