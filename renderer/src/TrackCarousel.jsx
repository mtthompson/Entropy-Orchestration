import React, { useState } from 'react';

export function TrackCarousel({ tracks, currentTrack, onSelectTrack }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isTransitioning, setIsTransitioning] = useState(false);

    const track = tracks[currentIndex];

    const handlePrev = () => {
        if (!isTransitioning) {
            setIsTransitioning(true);
            setCurrentIndex((i) => (i - 1 + tracks.length) % tracks.length);
            setTimeout(() => setIsTransitioning(false), 300);
        }
    };

    const handleNext = () => {
        if (!isTransitioning) {
            setIsTransitioning(true);
            setCurrentIndex((i) => (i + 1) % tracks.length);
            setTimeout(() => setIsTransitioning(false), 300);
        }
    };

    const handleSelect = () => {
        if (track && onSelectTrack) {
            onSelectTrack(track.id);
        }
    };

    if (!tracks || tracks.length === 0 || !track) {
        return null;
    }

    const isCurrentTrack = currentTrack?.id === track.id;
    const typeIcon = track.type === 'race' ? '🏁' : '⚔️';
    const primaryColor = track.primaryColor || '#ff00ff';
    const secondaryColor = track.secondaryColor || '#00ffff';

    return (
        <>
            <style>{`
                @keyframes trackSlideIn {
                    from { transform: translateX(100px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `}</style>
            <div style={{
                width: '100%',
                marginTop: '12px'
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '8px'
                }}>
                    <button
                        onClick={handlePrev}
                        disabled={isTransitioning}
                        style={{
                            background: 'rgba(255, 0, 255, 0.2)',
                            border: '1px solid #ff00ff',
                            borderRadius: '4px',
                            color: '#ff00ff',
                            fontFamily: 'monospace',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            padding: '4px 12px',
                            cursor: isTransitioning ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                            opacity: isTransitioning ? 0.5 : 1
                        }}
                        onMouseEnter={(e) => {
                            if (!isTransitioning) {
                                e.target.style.background = 'rgba(255, 0, 255, 0.4)';
                                e.target.style.boxShadow = '0 0 10px #ff00ff';
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.background = 'rgba(255, 0, 255, 0.2)';
                            e.target.style.boxShadow = 'none';
                        }}
                    >
                        ◀
                    </button>

                    <div style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{
                            color: '#fff',
                            fontFamily: 'monospace',
                            fontSize: '10px',
                            marginBottom: '4px',
                            opacity: 0.7
                        }}>
                            {currentIndex + 1} / {tracks.length}
                        </div>
                    </div>

                    <button
                        onClick={handleNext}
                        disabled={isTransitioning}
                        style={{
                            background: 'rgba(255, 0, 255, 0.2)',
                            border: '1px solid #ff00ff',
                            borderRadius: '4px',
                            color: '#ff00ff',
                            fontFamily: 'monospace',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            padding: '4px 12px',
                            cursor: isTransitioning ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                            opacity: isTransitioning ? 0.5 : 1
                        }}
                        onMouseEnter={(e) => {
                            if (!isTransitioning) {
                                e.target.style.background = 'rgba(255, 0, 255, 0.4)';
                                e.target.style.boxShadow = '0 0 10px #ff00ff';
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.background = 'rgba(255, 0, 255, 0.2)';
                            e.target.style.boxShadow = 'none';
                        }}
                    >
                        ▶
                    </button>
                </div>

                <div style={{
                    animation: isTransitioning ? 'trackSlideIn 0.3s ease-out' : 'none'
                }}>
                    {/* Color gradient preview */}
                    <div style={{
                        height: '60px',
                        background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
                        borderRadius: '8px',
                        marginBottom: '8px',
                        boxShadow: `0 0 15px ${primaryColor}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '32px'
                    }}>
                        {typeIcon}
                    </div>

                    {/* Track name */}
                    <div style={{
                        color: '#fff',
                        fontFamily: 'monospace',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                        letterSpacing: '2px',
                        textAlign: 'center',
                        marginBottom: '4px'
                    }}>
                        {track.name}
                    </div>

                    {/* Track type */}
                    <div style={{
                        color: track.type === 'race' ? '#00ff00' : '#ff6600',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        textAlign: 'center',
                        marginBottom: '12px',
                        textTransform: 'uppercase'
                    }}>
                        {typeIcon} {track.type}
                    </div>

                    {/* Select button */}
                    <button
                        onClick={handleSelect}
                        disabled={isCurrentTrack}
                        style={{
                            width: '100%',
                            background: isCurrentTrack ? 'rgba(0, 255, 0, 0.2)' : 'rgba(255, 0, 255, 0.2)',
                            border: `2px solid ${isCurrentTrack ? '#00ff00' : '#ff00ff'}`,
                            borderRadius: '6px',
                            color: isCurrentTrack ? '#00ff00' : '#ff00ff',
                            fontFamily: 'monospace',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            textTransform: 'uppercase',
                            letterSpacing: '2px',
                            padding: '8px',
                            cursor: isCurrentTrack ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            if (!isCurrentTrack) {
                                e.target.style.background = 'rgba(255, 0, 255, 0.4)';
                                e.target.style.boxShadow = '0 0 15px #ff00ff';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isCurrentTrack) {
                                e.target.style.background = 'rgba(255, 0, 255, 0.2)';
                                e.target.style.boxShadow = 'none';
                            }
                        }}
                    >
                        {isCurrentTrack ? '✓ CURRENT TRACK' : 'CHANGE TRACK'}
                    </button>
                </div>
            </div>
        </>
    );
}
