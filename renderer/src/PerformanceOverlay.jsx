import React from 'react';

export function PerformanceOverlay({ stats, visible }) {
    if (!visible) return null;

    return (
        <div style={{
            position: 'fixed',
            top: '20px',
            right: '320px',
            background: 'rgba(0, 0, 0, 0.85)',
            border: '2px solid #00ff00',
            borderRadius: '8px',
            padding: '12px 16px',
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#00ff00',
            zIndex: 1500,
            minWidth: '180px',
            textShadow: '0 0 5px #00ff00'
        }}>
            <div style={{
                marginBottom: '8px',
                fontSize: '10px',
                textTransform: 'uppercase',
                letterSpacing: '2px',
                opacity: 0.7
            }}>
                ⚡ Performance
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>FPS:</span>
                <span style={{ fontWeight: 'bold', color: stats.fps >= 55 ? '#00ff00' : stats.fps >= 40 ? '#ffff00' : '#ff0000' }}>
                    {stats.fps || 0}
                </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Draw Calls:</span>
                <span style={{ fontWeight: 'bold' }}>{stats.drawCalls || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Particles:</span>
                <span style={{ fontWeight: 'bold' }}>{stats.particles || 0}</span>
            </div>
        </div>
    );
}
