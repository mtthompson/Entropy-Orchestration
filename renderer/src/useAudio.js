import { useRef, useCallback } from 'react';

export function useAudio(connected) {
    const audioContext = useRef(null);
    const engineNode = useRef(null);
    const isPlayingRef = useRef(false);
    const currentMeasure = useRef(0);
    const currentStyleRef = useRef('classic');
    const songEndCallbackRef = useRef(null);
    const currentTrackIndexRef = useRef(0);
    const masterGainRef = useRef(null);
    const compressorRef = useRef(null);
    const songLengthRef = useRef(0); // Total bars in current song
    const schedulerTimerRef = useRef(null); // For lookahead scheduler
    const nextNoteTimeRef = useRef(0); // When the next measure should start
    const scheduledMeasuresRef = useRef(new Set()); // Track which measures are scheduled
    
    // Lookahead scheduler constants (in seconds)
    const SCHEDULE_AHEAD_TIME = 0.2; // How far ahead to schedule audio (200ms)
    const SCHEDULER_INTERVAL = 50; // How often to check/schedule (50ms - runs frequently but cheaply)
    
    // Track order for automatic progression
    const TRACK_ORDER = [
        'track_01', 'track_02', 'track_03', 'track_04', 'track_05', 'track_06',
        'track_07', 'track_08', 'track_09', 'track_10', 'track_11', 'track_12'
    ];

    // 12 Track-specific music styles with comprehensive instrument configurations
    const TRACK_STYLES = {
        'track_01': { name: 'Classic Synthwave', bpm: 118, key: 'Dm', bassType: 'triangle', leadType: 'sawtooth', intensity: 1.0, filterMod: 1.0, 
            usePluck: true, useArp: true, useSubBass: true, useDetuned: true, useFM: false, useStabs: false, useBells: true, useMetallic: false, 
            useNoiseSweep: false, usePWM: true, usePortamento: false, useGated: false, useTremolo: true, usePercussion: true, useFormant: false, 
            useGranular: false, useReverse: false, useWobble: false, useGrowl: false, wobbleRate: 2, drumStyle: 'basic', percStyle: 'electronic', noiseLevel: 0.3,
            progression: [0], melodyStyle: 'arpeggio', bassStyle: 'steady' },
        'track_02': { name: 'Aggressive Darksynth', bpm: 140, key: 'Em', bassType: 'sawtooth', leadType: 'sawtooth', intensity: 1.4, filterMod: 0.7, 
            usePluck: false, useArp: false, useSubBass: true, useDetuned: false, useFM: false, useStabs: true, useBells: false, useMetallic: true, 
            useNoiseSweep: true, usePWM: false, usePortamento: false, useGated: true, useTremolo: false, usePercussion: false, useFormant: false, 
            useGranular: false, useReverse: false, useWobble: true, useGrowl: true, wobbleRate: 4, drumStyle: 'driving', percStyle: 'minimal', noiseLevel: 0.7,
            progression: [3], melodyStyle: 'staccato', bassStyle: 'aggressive' },
        'track_03': { name: 'Outrun', bpm: 124, key: 'Am', bassType: 'triangle', leadType: 'sawtooth', intensity: 1.1, filterMod: 1.2, 
            usePluck: true, useArp: true, useSubBass: true, useDetuned: true, useFM: true, useStabs: false, useBells: false, useMetallic: false, 
            useNoiseSweep: false, usePWM: false, usePortamento: true, useGated: false, useTremolo: false, usePercussion: true, useFormant: false, 
            useGranular: false, useReverse: false, useWobble: false, useGrowl: false, wobbleRate: 2, drumStyle: 'driving', percStyle: 'electronic', noiseLevel: 0.4,
            progression: [2, 5], melodyStyle: 'driving', bassStyle: 'syncopated' },
        'track_04': { name: 'Dreamwave', bpm: 100, key: 'F', bassType: 'triangle', leadType: 'sine', intensity: 0.7, filterMod: 1.5, 
            usePluck: false, useArp: false, useSubBass: true, useDetuned: true, useFM: false, useStabs: false, useBells: true, useMetallic: false, 
            useNoiseSweep: false, usePWM: false, usePortamento: false, useGated: false, useTremolo: true, usePercussion: false, useFormant: true, 
            useGranular: true, useReverse: false, useWobble: false, useGrowl: false, wobbleRate: 1, drumStyle: 'minimal', percStyle: 'minimal', noiseLevel: 0.2,
            progression: [4], melodyStyle: 'ambient', bassStyle: 'slow' },
        'track_05': { name: 'Industrial', bpm: 145, key: 'Bb', bassType: 'sawtooth', leadType: 'sawtooth', intensity: 1.5, filterMod: 0.5, 
            usePluck: false, useArp: false, useSubBass: true, useDetuned: false, useFM: false, useStabs: false, useBells: false, useMetallic: true, 
            useNoiseSweep: true, usePWM: false, usePortamento: false, useGated: false, useTremolo: false, usePercussion: true, useFormant: false, 
            useGranular: false, useReverse: true, useWobble: true, useGrowl: true, wobbleRate: 8, drumStyle: 'driving', percStyle: 'industrial', noiseLevel: 0.8,
            progression: [3], melodyStyle: 'mechanical', bassStyle: 'aggressive' },
        'track_06': { name: 'Cyberpunk', bpm: 130, key: 'C', bassType: 'triangle', leadType: 'sawtooth', intensity: 1.2, filterMod: 0.8, 
            usePluck: true, useArp: true, useSubBass: true, useDetuned: false, useFM: true, useStabs: true, useBells: false, useMetallic: false, 
            useNoiseSweep: true, usePWM: false, usePortamento: false, useGated: false, useTremolo: false, usePercussion: true, useFormant: false, 
            useGranular: false, useReverse: false, useWobble: true, useGrowl: false, wobbleRate: 4, drumStyle: 'driving', percStyle: 'electronic', noiseLevel: 0.5,
            progression: [1, 2], melodyStyle: 'glitch', bassStyle: 'funky' },
        'track_07': { name: 'Horror Synth', bpm: 90, key: 'Gm', bassType: 'sawtooth', leadType: 'triangle', intensity: 0.6, filterMod: 0.4, 
            usePluck: false, useArp: false, useSubBass: true, useDetuned: true, useFM: false, useStabs: false, useBells: false, useMetallic: false, 
            useNoiseSweep: true, usePWM: false, usePortamento: false, useGated: false, useTremolo: false, usePercussion: false, useFormant: true, 
            useGranular: true, useReverse: true, useWobble: false, useGrowl: true, wobbleRate: 1, drumStyle: 'minimal', percStyle: 'sparse', noiseLevel: 0.7,
            progression: [3], melodyStyle: 'dissonant', bassStyle: 'slow' },
        'track_08': { name: '80s Pop', bpm: 120, key: 'C', bassType: 'triangle', leadType: 'sawtooth', intensity: 1.0, filterMod: 1.3, 
            usePluck: true, useArp: true, useSubBass: true, useDetuned: true, useFM: false, useStabs: true, useBells: false, useMetallic: false, 
            useNoiseSweep: false, usePWM: true, usePortamento: false, useGated: false, useTremolo: false, usePercussion: true, useFormant: false, 
            useGranular: false, useReverse: false, useWobble: false, useGrowl: false, wobbleRate: 2, drumStyle: 'basic', percStyle: 'live', noiseLevel: 0.3,
            progression: [1, 4], melodyStyle: 'pop', bassStyle: 'steady' },
        'track_09': { name: 'Gabber', bpm: 160, key: 'Am', bassType: 'sawtooth', leadType: 'sawtooth', intensity: 1.8, filterMod: 0.3, 
            usePluck: false, useArp: false, useSubBass: true, useDetuned: false, useFM: false, useStabs: false, useBells: false, useMetallic: true, 
            useNoiseSweep: false, usePWM: false, usePortamento: false, useGated: false, useTremolo: false, usePercussion: false, useFormant: false, 
            useGranular: false, useReverse: false, useWobble: true, useGrowl: true, wobbleRate: 8, drumStyle: 'driving', percStyle: 'minimal', noiseLevel: 0.9,
            progression: [3], melodyStyle: 'minimal', bassStyle: 'relentless' },
        'track_10': { name: 'Eurobeat', bpm: 155, key: 'Em', bassType: 'triangle', leadType: 'sawtooth', intensity: 1.3, filterMod: 1.4, 
            usePluck: true, useArp: true, useSubBass: true, useDetuned: true, useFM: true, useStabs: true, useBells: false, useMetallic: false, 
            useNoiseSweep: false, usePWM: false, usePortamento: false, useGated: false, useTremolo: true, usePercussion: true, useFormant: false, 
            useGranular: false, useReverse: false, useWobble: false, useGrowl: false, wobbleRate: 4, drumStyle: 'driving', percStyle: 'electronic', noiseLevel: 0.4,
            progression: [5, 2], melodyStyle: 'euphoric', bassStyle: 'funky' },
        'track_11': { name: 'Epic Orchestral', bpm: 110, key: 'Dm', bassType: 'triangle', leadType: 'sine', intensity: 0.9, filterMod: 1.6, 
            usePluck: false, useArp: false, useSubBass: true, useDetuned: true, useFM: false, useStabs: false, useBells: true, useMetallic: false, 
            useNoiseSweep: false, usePWM: false, usePortamento: false, useGated: false, useTremolo: true, usePercussion: true, useFormant: true, 
            useGranular: true, useReverse: false, useWobble: false, useGrowl: false, wobbleRate: 2, drumStyle: 'minimal', percStyle: 'live', noiseLevel: 0.3,
            progression: [0, 4], melodyStyle: 'epic', bassStyle: 'slow' },
        'track_12': { name: 'Claustrophobic', bpm: 135, key: 'Bb', bassType: 'sawtooth', leadType: 'sawtooth', intensity: 1.4, filterMod: 0.6, 
            usePluck: false, useArp: true, useSubBass: true, useDetuned: false, useFM: false, useStabs: false, useBells: false, useMetallic: true, 
            useNoiseSweep: true, usePWM: false, usePortamento: false, useGated: true, useTremolo: false, usePercussion: false, useFormant: false, 
            useGranular: true, useReverse: true, useWobble: true, useGrowl: true, wobbleRate: 4, drumStyle: 'driving', percStyle: 'broken', noiseLevel: 0.6,
            progression: [3], melodyStyle: 'chaotic', bassStyle: 'aggressive' }
    };

    // Extended Note Frequencies (3 octaves)
    const NOTE_FREQS = {
        'C2': 65.41, 'C#2': 69.30, 'D2': 73.42, 'D#2': 77.78, 'E2': 82.41, 'F2': 87.31, 'F#2': 92.50, 'G2': 98.00, 'G#2': 103.83, 'A2': 110.00, 'A#2': 116.54, 'B2': 123.47,
        'C3': 130.81, 'C#3': 138.59, 'D3': 146.83, 'D#3': 155.56, 'E3': 164.81, 'F3': 174.61, 'F#3': 185.00, 'G3': 196.00, 'G#3': 207.65, 'A3': 220.00, 'A#3': 233.08, 'B3': 246.94,
        'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'D#4': 311.13, 'E4': 329.63, 'F4': 349.23, 'F#4': 369.99, 'G4': 392.00, 'G#4': 415.30, 'A4': 440.00, 'A#4': 466.16, 'B4': 493.88,
        'C5': 523.25, 'C#5': 554.37, 'D5': 587.33, 'D#5': 622.25, 'E5': 659.25, 'F5': 698.46, 'F#5': 739.99, 'G5': 783.99, 'A5': 880.00
    };

    // Chord definitions (root note -> chord notes)
    const CHORDS = {
        'Dm': ['D3', 'F3', 'A3'],
        'Am': ['A2', 'C3', 'E3'],
        'Bb': ['A#2', 'D3', 'F3'],
        'C': ['C3', 'E3', 'G3'],
        'F': ['F2', 'A2', 'C3'],
        'Gm': ['G2', 'A#2', 'D3'],
        'Em': ['E2', 'G2', 'B2'],
        'A': ['A2', 'C#3', 'E3']
    };

    // Helper to transpose note up one octave - defined early for use in melody generators
    const chordUp = (note) => {
        const match = note.match(/([A-G]#?)(\d)/);
        if (!match) return note;
        return match[1] + (parseInt(match[2]) + 1);
    };

    // Note name to frequency conversion for precise melodies
    const NOTE_FREQS = {
        'C3': 130.81, 'C#3': 138.59, 'Db3': 138.59, 'D3': 146.83, 'D#3': 155.56, 'Eb3': 155.56,
        'E3': 164.81, 'F3': 174.61, 'F#3': 185.00, 'Gb3': 185.00, 'G3': 196.00, 'G#3': 207.65,
        'Ab3': 207.65, 'A3': 220.00, 'A#3': 233.08, 'Bb3': 233.08, 'B3': 246.94,
        'C4': 261.63, 'C#4': 277.18, 'Db4': 277.18, 'D4': 293.66, 'D#4': 311.13, 'Eb4': 311.13,
        'E4': 329.63, 'F4': 349.23, 'F#4': 369.99, 'Gb4': 369.99, 'G4': 392.00, 'G#4': 415.30,
        'Ab4': 415.30, 'A4': 440.00, 'A#4': 466.16, 'Bb4': 466.16, 'B4': 493.88,
        'C5': 523.25, 'C#5': 554.37, 'Db5': 554.37, 'D5': 587.33, 'D#5': 622.25, 'Eb5': 622.25,
        'E5': 659.25, 'F5': 698.46, 'F#5': 739.99, 'Gb5': 739.99, 'G5': 783.99, 'G#5': 830.61,
        'Ab5': 830.61, 'A5': 880.00, 'A#5': 932.33, 'Bb5': 932.33, 'B5': 987.77,
        'C6': 1046.50, 'D6': 1174.66, 'E6': 1318.51, 'F6': 1396.91, 'G6': 1567.98,
    };

    // Complete 4-bar melodies for each track - actual tunes!
    // Each melody is designed to work over a 4-chord progression
    const COMPLETE_MELODIES = {
        // Track 1: Stadium Oval - Classic Synthwave anthem
        'track_01': {
            verse: [
                // Bar 1
                { bar: 0, step: 0, note: 'A4', duration: 2 },
                { bar: 0, step: 2, note: 'C5', duration: 2 },
                { bar: 0, step: 4, note: 'D5', duration: 4 },
                { bar: 0, step: 8, note: 'E5', duration: 2 },
                { bar: 0, step: 10, note: 'D5', duration: 2 },
                { bar: 0, step: 12, note: 'C5', duration: 4 },
                // Bar 2
                { bar: 1, step: 0, note: 'A4', duration: 2 },
                { bar: 1, step: 2, note: 'G4', duration: 2 },
                { bar: 1, step: 4, note: 'A4', duration: 8 },
                { bar: 1, step: 12, note: 'G4', duration: 4 },
                // Bar 3 - variation
                { bar: 2, step: 0, note: 'A4', duration: 2 },
                { bar: 2, step: 2, note: 'C5', duration: 2 },
                { bar: 2, step: 4, note: 'D5', duration: 2 },
                { bar: 2, step: 6, note: 'E5', duration: 2 },
                { bar: 2, step: 8, note: 'F5', duration: 4 },
                { bar: 2, step: 12, note: 'E5', duration: 4 },
                // Bar 4 - resolution
                { bar: 3, step: 0, note: 'D5', duration: 4 },
                { bar: 3, step: 4, note: 'C5', duration: 4 },
                { bar: 3, step: 8, note: 'A4', duration: 8 },
            ],
            chorus: [
                // Bar 1 - big hook
                { bar: 0, step: 0, note: 'E5', duration: 4 },
                { bar: 0, step: 4, note: 'D5', duration: 2 },
                { bar: 0, step: 6, note: 'E5', duration: 2 },
                { bar: 0, step: 8, note: 'G5', duration: 8 },
                // Bar 2
                { bar: 1, step: 0, note: 'F5', duration: 4 },
                { bar: 1, step: 4, note: 'E5', duration: 2 },
                { bar: 1, step: 6, note: 'D5', duration: 2 },
                { bar: 1, step: 8, note: 'E5', duration: 8 },
                // Bar 3
                { bar: 2, step: 0, note: 'E5', duration: 2 },
                { bar: 2, step: 2, note: 'F5', duration: 2 },
                { bar: 2, step: 4, note: 'G5', duration: 4 },
                { bar: 2, step: 8, note: 'A5', duration: 4 },
                { bar: 2, step: 12, note: 'G5', duration: 4 },
                // Bar 4 - climax
                { bar: 3, step: 0, note: 'F5', duration: 2 },
                { bar: 3, step: 2, note: 'E5', duration: 2 },
                { bar: 3, step: 4, note: 'D5', duration: 4 },
                { bar: 3, step: 8, note: 'C5', duration: 8 },
            ],
        },
        
        // Track 2: Thunder Dome - Industrial darksynth
        'track_02': {
            verse: [
                { bar: 0, step: 0, note: 'E4', duration: 1 },
                { bar: 0, step: 2, note: 'E4', duration: 1 },
                { bar: 0, step: 4, note: 'G4', duration: 2 },
                { bar: 0, step: 8, note: 'E4', duration: 1 },
                { bar: 0, step: 10, note: 'E4', duration: 1 },
                { bar: 0, step: 12, note: 'A4', duration: 4 },
                { bar: 1, step: 0, note: 'G4', duration: 8 },
                { bar: 1, step: 8, note: 'E4', duration: 8 },
                { bar: 2, step: 0, note: 'E4', duration: 1 },
                { bar: 2, step: 2, note: 'E4', duration: 1 },
                { bar: 2, step: 4, note: 'G4', duration: 2 },
                { bar: 2, step: 8, note: 'A4', duration: 2 },
                { bar: 2, step: 10, note: 'B4', duration: 2 },
                { bar: 2, step: 12, note: 'C5', duration: 4 },
                { bar: 3, step: 0, note: 'B4', duration: 4 },
                { bar: 3, step: 4, note: 'A4', duration: 4 },
                { bar: 3, step: 8, note: 'E4', duration: 8 },
            ],
            chorus: [
                { bar: 0, step: 0, note: 'E5', duration: 2 },
                { bar: 0, step: 2, note: 'D5', duration: 2 },
                { bar: 0, step: 4, note: 'E5', duration: 2 },
                { bar: 0, step: 6, note: 'D5', duration: 2 },
                { bar: 0, step: 8, note: 'C5', duration: 8 },
                { bar: 1, step: 0, note: 'B4', duration: 4 },
                { bar: 1, step: 4, note: 'C5', duration: 4 },
                { bar: 1, step: 8, note: 'E5', duration: 8 },
                { bar: 2, step: 0, note: 'E5', duration: 2 },
                { bar: 2, step: 2, note: 'G5', duration: 2 },
                { bar: 2, step: 4, note: 'E5', duration: 2 },
                { bar: 2, step: 6, note: 'D5', duration: 2 },
                { bar: 2, step: 8, note: 'C5', duration: 8 },
                { bar: 3, step: 0, note: 'B4', duration: 8 },
                { bar: 3, step: 8, note: 'E4', duration: 8 },
            ],
        },
        
        // Track 3: Switchback - Outrun driving
        'track_03': {
            verse: [
                { bar: 0, step: 0, note: 'D5', duration: 2 },
                { bar: 0, step: 3, note: 'E5', duration: 2 },
                { bar: 0, step: 6, note: 'F5', duration: 2 },
                { bar: 0, step: 9, note: 'A5', duration: 2 },
                { bar: 0, step: 12, note: 'G5', duration: 4 },
                { bar: 1, step: 0, note: 'F5', duration: 4 },
                { bar: 1, step: 4, note: 'E5', duration: 4 },
                { bar: 1, step: 8, note: 'D5', duration: 8 },
                { bar: 2, step: 0, note: 'D5', duration: 2 },
                { bar: 2, step: 3, note: 'E5', duration: 2 },
                { bar: 2, step: 6, note: 'F5', duration: 2 },
                { bar: 2, step: 9, note: 'G5', duration: 2 },
                { bar: 2, step: 12, note: 'A5', duration: 4 },
                { bar: 3, step: 0, note: 'G5', duration: 4 },
                { bar: 3, step: 4, note: 'F5', duration: 4 },
                { bar: 3, step: 8, note: 'E5', duration: 4 },
                { bar: 3, step: 12, note: 'D5', duration: 4 },
            ],
            chorus: [
                { bar: 0, step: 0, note: 'A5', duration: 4 },
                { bar: 0, step: 4, note: 'G5', duration: 2 },
                { bar: 0, step: 6, note: 'A5', duration: 2 },
                { bar: 0, step: 8, note: 'C6', duration: 4 },
                { bar: 0, step: 12, note: 'A5', duration: 4 },
                { bar: 1, step: 0, note: 'G5', duration: 8 },
                { bar: 1, step: 8, note: 'F5', duration: 8 },
                { bar: 2, step: 0, note: 'A5', duration: 2 },
                { bar: 2, step: 2, note: 'Bb5', duration: 2 },
                { bar: 2, step: 4, note: 'C6', duration: 4 },
                { bar: 2, step: 8, note: 'D6', duration: 4 },
                { bar: 2, step: 12, note: 'C6', duration: 4 },
                { bar: 3, step: 0, note: 'Bb5', duration: 4 },
                { bar: 3, step: 4, note: 'A5', duration: 4 },
                { bar: 3, step: 8, note: 'G5', duration: 4 },
                { bar: 3, step: 12, note: 'F5', duration: 4 },
            ],
        },
        
        // Track 4: Cloverleaf - Dreamy ambient
        'track_04': {
            verse: [
                { bar: 0, step: 0, note: 'G5', duration: 8 },
                { bar: 0, step: 8, note: 'E5', duration: 8 },
                { bar: 1, step: 0, note: 'D5', duration: 8 },
                { bar: 1, step: 8, note: 'C5', duration: 8 },
                { bar: 2, step: 0, note: 'E5', duration: 8 },
                { bar: 2, step: 8, note: 'G5', duration: 8 },
                { bar: 3, step: 0, note: 'A5', duration: 16 },
            ],
            chorus: [
                { bar: 0, step: 0, note: 'C6', duration: 8 },
                { bar: 0, step: 8, note: 'B5', duration: 8 },
                { bar: 1, step: 0, note: 'A5', duration: 8 },
                { bar: 1, step: 8, note: 'G5', duration: 8 },
                { bar: 2, step: 0, note: 'A5', duration: 8 },
                { bar: 2, step: 8, note: 'B5', duration: 8 },
                { bar: 3, step: 0, note: 'C6', duration: 16 },
            ],
        },
        
        // Track 5: Hexagon Heat - Volcanic intensity
        'track_05': {
            verse: [
                { bar: 0, step: 0, note: 'A4', duration: 1 },
                { bar: 0, step: 1, note: 'A4', duration: 1 },
                { bar: 0, step: 4, note: 'C5', duration: 2 },
                { bar: 0, step: 8, note: 'A4', duration: 1 },
                { bar: 0, step: 9, note: 'A4', duration: 1 },
                { bar: 0, step: 12, note: 'E5', duration: 4 },
                { bar: 1, step: 0, note: 'D5', duration: 4 },
                { bar: 1, step: 4, note: 'C5', duration: 4 },
                { bar: 1, step: 8, note: 'A4', duration: 8 },
                { bar: 2, step: 0, note: 'A4', duration: 1 },
                { bar: 2, step: 1, note: 'A4', duration: 1 },
                { bar: 2, step: 4, note: 'E5', duration: 2 },
                { bar: 2, step: 8, note: 'F5', duration: 2 },
                { bar: 2, step: 10, note: 'E5', duration: 2 },
                { bar: 2, step: 12, note: 'D5', duration: 4 },
                { bar: 3, step: 0, note: 'C5', duration: 8 },
                { bar: 3, step: 8, note: 'A4', duration: 8 },
            ],
            chorus: [
                { bar: 0, step: 0, note: 'E5', duration: 2 },
                { bar: 0, step: 2, note: 'F5', duration: 2 },
                { bar: 0, step: 4, note: 'E5', duration: 2 },
                { bar: 0, step: 6, note: 'D5', duration: 2 },
                { bar: 0, step: 8, note: 'E5', duration: 4 },
                { bar: 0, step: 12, note: 'A5', duration: 4 },
                { bar: 1, step: 0, note: 'G5', duration: 4 },
                { bar: 1, step: 4, note: 'F5', duration: 4 },
                { bar: 1, step: 8, note: 'E5', duration: 8 },
                { bar: 2, step: 0, note: 'E5', duration: 2 },
                { bar: 2, step: 2, note: 'F5', duration: 2 },
                { bar: 2, step: 4, note: 'G5', duration: 2 },
                { bar: 2, step: 6, note: 'A5', duration: 2 },
                { bar: 2, step: 8, note: 'B5', duration: 8 },
                { bar: 3, step: 0, note: 'A5', duration: 8 },
                { bar: 3, step: 8, note: 'E5', duration: 8 },
            ],
        },
        
        // Track 6: Dragon's Tail - Oriental pentatonic
        'track_06': {
            verse: [
                { bar: 0, step: 0, note: 'E5', duration: 2 },
                { bar: 0, step: 2, note: 'G5', duration: 2 },
                { bar: 0, step: 4, note: 'A5', duration: 4 },
                { bar: 0, step: 8, note: 'G5', duration: 2 },
                { bar: 0, step: 10, note: 'E5', duration: 2 },
                { bar: 0, step: 12, note: 'D5', duration: 4 },
                { bar: 1, step: 0, note: 'E5', duration: 8 },
                { bar: 1, step: 8, note: 'D5', duration: 4 },
                { bar: 1, step: 12, note: 'B4', duration: 4 },
                { bar: 2, step: 0, note: 'E5', duration: 2 },
                { bar: 2, step: 2, note: 'G5', duration: 2 },
                { bar: 2, step: 4, note: 'A5', duration: 2 },
                { bar: 2, step: 6, note: 'B5', duration: 2 },
                { bar: 2, step: 8, note: 'D6', duration: 4 },
                { bar: 2, step: 12, note: 'B5', duration: 4 },
                { bar: 3, step: 0, note: 'A5', duration: 4 },
                { bar: 3, step: 4, note: 'G5', duration: 4 },
                { bar: 3, step: 8, note: 'E5', duration: 8 },
            ],
            chorus: [
                { bar: 0, step: 0, note: 'B5', duration: 4 },
                { bar: 0, step: 4, note: 'A5', duration: 2 },
                { bar: 0, step: 6, note: 'G5', duration: 2 },
                { bar: 0, step: 8, note: 'A5', duration: 4 },
                { bar: 0, step: 12, note: 'E5', duration: 4 },
                { bar: 1, step: 0, note: 'G5', duration: 8 },
                { bar: 1, step: 8, note: 'E5', duration: 8 },
                { bar: 2, step: 0, note: 'B5', duration: 2 },
                { bar: 2, step: 2, note: 'D6', duration: 2 },
                { bar: 2, step: 4, note: 'E6', duration: 4 },
                { bar: 2, step: 8, note: 'D6', duration: 4 },
                { bar: 2, step: 12, note: 'B5', duration: 4 },
                { bar: 3, step: 0, note: 'A5', duration: 8 },
                { bar: 3, step: 8, note: 'E5', duration: 8 },
            ],
        },
        
        // Track 7: Octagon - Mystic/ethereal
        'track_07': {
            verse: [
                { bar: 0, step: 0, note: 'D5', duration: 4 },
                { bar: 0, step: 4, note: 'F5', duration: 4 },
                { bar: 0, step: 8, note: 'A5', duration: 8 },
                { bar: 1, step: 0, note: 'G5', duration: 4 },
                { bar: 1, step: 4, note: 'F5', duration: 4 },
                { bar: 1, step: 8, note: 'E5', duration: 4 },
                { bar: 1, step: 12, note: 'D5', duration: 4 },
                { bar: 2, step: 0, note: 'D5', duration: 2 },
                { bar: 2, step: 2, note: 'E5', duration: 2 },
                { bar: 2, step: 4, note: 'F5', duration: 2 },
                { bar: 2, step: 6, note: 'G5', duration: 2 },
                { bar: 2, step: 8, note: 'A5', duration: 8 },
                { bar: 3, step: 0, note: 'Bb5', duration: 8 },
                { bar: 3, step: 8, note: 'A5', duration: 8 },
            ],
            chorus: [
                { bar: 0, step: 0, note: 'A5', duration: 4 },
                { bar: 0, step: 4, note: 'Bb5', duration: 4 },
                { bar: 0, step: 8, note: 'C6', duration: 8 },
                { bar: 1, step: 0, note: 'D6', duration: 8 },
                { bar: 1, step: 8, note: 'C6', duration: 8 },
                { bar: 2, step: 0, note: 'Bb5', duration: 4 },
                { bar: 2, step: 4, note: 'A5', duration: 4 },
                { bar: 2, step: 8, note: 'G5', duration: 4 },
                { bar: 2, step: 12, note: 'F5', duration: 4 },
                { bar: 3, step: 0, note: 'E5', duration: 8 },
                { bar: 3, step: 8, note: 'D5', duration: 8 },
            ],
        },
        
        // Track 8: Grand Prix - 80s Pop racing
        'track_08': {
            verse: [
                { bar: 0, step: 0, note: 'C5', duration: 2 },
                { bar: 0, step: 2, note: 'D5', duration: 2 },
                { bar: 0, step: 4, note: 'E5', duration: 2 },
                { bar: 0, step: 6, note: 'G5', duration: 2 },
                { bar: 0, step: 8, note: 'E5', duration: 4 },
                { bar: 0, step: 12, note: 'D5', duration: 4 },
                { bar: 1, step: 0, note: 'C5', duration: 8 },
                { bar: 1, step: 8, note: 'D5', duration: 4 },
                { bar: 1, step: 12, note: 'E5', duration: 4 },
                { bar: 2, step: 0, note: 'C5', duration: 2 },
                { bar: 2, step: 2, note: 'D5', duration: 2 },
                { bar: 2, step: 4, note: 'E5', duration: 2 },
                { bar: 2, step: 6, note: 'G5', duration: 2 },
                { bar: 2, step: 8, note: 'A5', duration: 4 },
                { bar: 2, step: 12, note: 'G5', duration: 4 },
                { bar: 3, step: 0, note: 'E5', duration: 8 },
                { bar: 3, step: 8, note: 'C5', duration: 8 },
            ],
            chorus: [
                { bar: 0, step: 0, note: 'G5', duration: 4 },
                { bar: 0, step: 4, note: 'A5', duration: 2 },
                { bar: 0, step: 6, note: 'G5', duration: 2 },
                { bar: 0, step: 8, note: 'E5', duration: 4 },
                { bar: 0, step: 12, note: 'C5', duration: 4 },
                { bar: 1, step: 0, note: 'D5', duration: 4 },
                { bar: 1, step: 4, note: 'E5', duration: 4 },
                { bar: 1, step: 8, note: 'G5', duration: 8 },
                { bar: 2, step: 0, note: 'A5', duration: 2 },
                { bar: 2, step: 2, note: 'G5', duration: 2 },
                { bar: 2, step: 4, note: 'A5', duration: 2 },
                { bar: 2, step: 6, note: 'C6', duration: 2 },
                { bar: 2, step: 8, note: 'B5', duration: 4 },
                { bar: 2, step: 12, note: 'A5', duration: 4 },
                { bar: 3, step: 0, note: 'G5', duration: 8 },
                { bar: 3, step: 8, note: 'C5', duration: 8 },
            ],
        },
        
        // Track 9: Triangle Terror - Tense minimal
        'track_09': {
            verse: [
                { bar: 0, step: 0, note: 'E4', duration: 8 },
                { bar: 0, step: 8, note: 'E4', duration: 8 },
                { bar: 1, step: 0, note: 'F4', duration: 8 },
                { bar: 1, step: 8, note: 'E4', duration: 8 },
                { bar: 2, step: 0, note: 'E4', duration: 4 },
                { bar: 2, step: 4, note: 'G4', duration: 4 },
                { bar: 2, step: 8, note: 'E4', duration: 8 },
                { bar: 3, step: 0, note: 'D4', duration: 8 },
                { bar: 3, step: 8, note: 'E4', duration: 8 },
            ],
            chorus: [
                { bar: 0, step: 0, note: 'E5', duration: 4 },
                { bar: 0, step: 8, note: 'E5', duration: 4 },
                { bar: 1, step: 0, note: 'F5', duration: 4 },
                { bar: 1, step: 8, note: 'E5', duration: 4 },
                { bar: 2, step: 0, note: 'G5', duration: 2 },
                { bar: 2, step: 4, note: 'F5', duration: 2 },
                { bar: 2, step: 8, note: 'E5', duration: 4 },
                { bar: 3, step: 0, note: 'D5', duration: 8 },
                { bar: 3, step: 8, note: 'E5', duration: 8 },
            ],
        },
        
        // Track 10: Velocity Strip - Eurobeat euphoria
        'track_10': {
            verse: [
                { bar: 0, step: 0, note: 'A4', duration: 1 },
                { bar: 0, step: 1, note: 'B4', duration: 1 },
                { bar: 0, step: 2, note: 'C5', duration: 2 },
                { bar: 0, step: 4, note: 'D5', duration: 1 },
                { bar: 0, step: 5, note: 'E5', duration: 1 },
                { bar: 0, step: 6, note: 'F5', duration: 2 },
                { bar: 0, step: 8, note: 'E5', duration: 4 },
                { bar: 0, step: 12, note: 'D5', duration: 4 },
                { bar: 1, step: 0, note: 'C5', duration: 4 },
                { bar: 1, step: 4, note: 'B4', duration: 4 },
                { bar: 1, step: 8, note: 'A4', duration: 8 },
                { bar: 2, step: 0, note: 'A4', duration: 1 },
                { bar: 2, step: 1, note: 'C5', duration: 1 },
                { bar: 2, step: 2, note: 'E5', duration: 2 },
                { bar: 2, step: 4, note: 'A4', duration: 1 },
                { bar: 2, step: 5, note: 'C5', duration: 1 },
                { bar: 2, step: 6, note: 'E5', duration: 2 },
                { bar: 2, step: 8, note: 'G5', duration: 4 },
                { bar: 2, step: 12, note: 'F5', duration: 4 },
                { bar: 3, step: 0, note: 'E5', duration: 8 },
                { bar: 3, step: 8, note: 'A4', duration: 8 },
            ],
            chorus: [
                { bar: 0, step: 0, note: 'E5', duration: 2 },
                { bar: 0, step: 2, note: 'F5', duration: 2 },
                { bar: 0, step: 4, note: 'G5', duration: 2 },
                { bar: 0, step: 6, note: 'A5', duration: 2 },
                { bar: 0, step: 8, note: 'B5', duration: 4 },
                { bar: 0, step: 12, note: 'A5', duration: 4 },
                { bar: 1, step: 0, note: 'G5', duration: 4 },
                { bar: 1, step: 4, note: 'F5', duration: 4 },
                { bar: 1, step: 8, note: 'E5', duration: 8 },
                { bar: 2, step: 0, note: 'E5', duration: 1 },
                { bar: 2, step: 1, note: 'G5', duration: 1 },
                { bar: 2, step: 2, note: 'B5', duration: 2 },
                { bar: 2, step: 4, note: 'C6', duration: 4 },
                { bar: 2, step: 8, note: 'B5', duration: 2 },
                { bar: 2, step: 10, note: 'A5', duration: 2 },
                { bar: 2, step: 12, note: 'G5', duration: 4 },
                { bar: 3, step: 0, note: 'A5', duration: 8 },
                { bar: 3, step: 8, note: 'E5', duration: 8 },
            ],
        },
        
        // Track 11: Coliseum - Epic orchestral
        'track_11': {
            verse: [
                { bar: 0, step: 0, note: 'D5', duration: 8 },
                { bar: 0, step: 8, note: 'F5', duration: 8 },
                { bar: 1, step: 0, note: 'A5', duration: 8 },
                { bar: 1, step: 8, note: 'G5', duration: 8 },
                { bar: 2, step: 0, note: 'F5', duration: 4 },
                { bar: 2, step: 4, note: 'E5', duration: 4 },
                { bar: 2, step: 8, note: 'D5', duration: 8 },
                { bar: 3, step: 0, note: 'E5', duration: 8 },
                { bar: 3, step: 8, note: 'D5', duration: 8 },
            ],
            chorus: [
                { bar: 0, step: 0, note: 'A5', duration: 4 },
                { bar: 0, step: 4, note: 'Bb5', duration: 4 },
                { bar: 0, step: 8, note: 'C6', duration: 4 },
                { bar: 0, step: 12, note: 'D6', duration: 4 },
                { bar: 1, step: 0, note: 'C6', duration: 8 },
                { bar: 1, step: 8, note: 'Bb5', duration: 8 },
                { bar: 2, step: 0, note: 'A5', duration: 4 },
                { bar: 2, step: 4, note: 'G5', duration: 4 },
                { bar: 2, step: 8, note: 'F5', duration: 4 },
                { bar: 2, step: 12, note: 'E5', duration: 4 },
                { bar: 3, step: 0, note: 'D5', duration: 16 },
            ],
        },
        
        // Track 12: The Cage - Chaotic/tense
        'track_12': {
            verse: [
                { bar: 0, step: 0, note: 'E4', duration: 2 },
                { bar: 0, step: 3, note: 'G4', duration: 1 },
                { bar: 0, step: 5, note: 'E4', duration: 2 },
                { bar: 0, step: 8, note: 'Bb4', duration: 2 },
                { bar: 0, step: 11, note: 'A4', duration: 2 },
                { bar: 0, step: 14, note: 'E4', duration: 2 },
                { bar: 1, step: 0, note: 'G4', duration: 4 },
                { bar: 1, step: 6, note: 'E4', duration: 2 },
                { bar: 1, step: 10, note: 'D4', duration: 4 },
                { bar: 2, step: 0, note: 'E4', duration: 1 },
                { bar: 2, step: 2, note: 'E4', duration: 1 },
                { bar: 2, step: 4, note: 'G4', duration: 2 },
                { bar: 2, step: 8, note: 'Bb4', duration: 4 },
                { bar: 2, step: 13, note: 'A4', duration: 2 },
                { bar: 3, step: 0, note: 'G4', duration: 8 },
                { bar: 3, step: 8, note: 'E4', duration: 8 },
            ],
            chorus: [
                { bar: 0, step: 0, note: 'E5', duration: 2 },
                { bar: 0, step: 2, note: 'F5', duration: 1 },
                { bar: 0, step: 4, note: 'E5', duration: 2 },
                { bar: 0, step: 7, note: 'D5', duration: 1 },
                { bar: 0, step: 9, note: 'E5', duration: 2 },
                { bar: 0, step: 12, note: 'G5', duration: 4 },
                { bar: 1, step: 0, note: 'Bb5', duration: 4 },
                { bar: 1, step: 4, note: 'A5', duration: 4 },
                { bar: 1, step: 8, note: 'G5', duration: 4 },
                { bar: 1, step: 12, note: 'E5', duration: 4 },
                { bar: 2, step: 0, note: 'E5', duration: 1 },
                { bar: 2, step: 1, note: 'G5', duration: 1 },
                { bar: 2, step: 2, note: 'Bb5', duration: 2 },
                { bar: 2, step: 4, note: 'A5', duration: 2 },
                { bar: 2, step: 6, note: 'G5', duration: 2 },
                { bar: 2, step: 8, note: 'E5', duration: 8 },
                { bar: 3, step: 0, note: 'D5', duration: 8 },
                { bar: 3, step: 8, note: 'E5', duration: 8 },
            ],
        },
    };

    // Get melody notes for current bar from complete melody
    const getCompleteMelody = (trackId, section, barInPhrase) => {
        const trackMelodies = COMPLETE_MELODIES[trackId] || COMPLETE_MELODIES['track_01'];
        const isChorus = section === 3 || section === 6; // Chorus or Drop
        const melodySet = isChorus ? trackMelodies.chorus : trackMelodies.verse;
        const bar = barInPhrase % 4;
        
        return melodySet.filter(note => note.bar === bar).map(note => ({
            step: note.step,
            note: note.note,
            duration: note.duration
        }));
    };

    // Multiple chord progressions for variety
    const PROGRESSIONS = [
        ['Dm', 'Am', 'Bb', 'C'],     // 0: Classic synthwave
        ['C', 'Am', 'F', 'C'],       // 1: Pop/uplifting
        ['Am', 'F', 'C', 'Gm'],      // 2: Alternative/driving
        ['Em', 'C', 'Am', 'Em'],     // 3: Dark/minor
        ['F', 'C', 'Dm', 'Bb'],      // 4: Cinematic/epic  
        ['Am', 'Em', 'F', 'C'],      // 5: Emotional/euphoric
        ['Bb', 'Gm', 'Dm', 'Bb'],    // 6: Heavy/industrial (not used yet)
    ];

    // Bassline patterns (array of [stepOffset, duration] pairs)
    const BASS_PATTERNS = [
        [[0, 2], [4, 2], [8, 2], [12, 2]],           // 0: Quarter notes (steady)
        [[0, 1], [2, 1], [4, 1], [6, 1], [8, 2], [12, 2]], // 1: Syncopated
        [[0, 3], [4, 1], [8, 3], [12, 1]],           // 2: Dotted (funky)
        [[0, 1], [1, 1], [4, 2], [8, 1], [9, 1], [12, 2]], // 3: Busy/aggressive
        [[0, 4], [8, 4]],                             // 4: Half notes (slow)
        [[0, 1], [3, 1], [4, 1], [7, 1], [8, 1], [11, 1], [12, 1], [14, 1]], // 5: 16th groove (relentless)
    ];

    // Lead melody generators - fallback for when complete melody not available
    const generateMelody = (chord, section, measureNum, melodyStyle = 'arpeggio') => {
        const chordNotes = CHORDS[chord];
        if (!chordNotes) return [];

        const MELODY_GENERATORS = {
            // Track 1: Classic Synthwave - smooth arpeggios
            'arpeggio': () => [
                { step: 0, note: chordNotes[0] },
                { step: 2, note: chordNotes[1] },
                { step: 4, note: chordNotes[2] },
                { step: 6, note: chordUp(chordNotes[0]) },
                { step: 8, note: chordUp(chordNotes[2]) },
                { step: 10, note: chordUp(chordNotes[1]) },
                { step: 12, note: chordUp(chordNotes[0]) },
                { step: 14, note: chordNotes[2] },
            ],
            
            // Track 2: Darksynth - aggressive staccato hits
            'staccato': () => [
                { step: 0, note: chordUp(chordNotes[0]) },
                { step: 2, note: chordUp(chordUp(chordNotes[2])) },
                { step: 4, note: chordUp(chordNotes[0]) },
                { step: 7, note: chordUp(chordUp(chordNotes[1])) },
                { step: 10, note: chordUp(chordUp(chordNotes[0])) },
                { step: 12, note: chordUp(chordNotes[2]) },
            ],
            
            // Track 3: Outrun - driving syncopated rhythm
            'driving': () => [
                { step: 1, note: chordUp(chordNotes[0]) },
                { step: 3, note: chordUp(chordNotes[2]) },
                { step: 6, note: chordUp(chordUp(chordNotes[1])) },
                { step: 9, note: chordUp(chordNotes[0]) },
                { step: 11, note: chordUp(chordNotes[1]) },
                { step: 14, note: chordUp(chordUp(chordNotes[0])) },
            ],
            
            // Track 4: Dreamwave - slow ambient pads
            'ambient': () => [
                { step: 0, note: chordUp(chordUp(chordNotes[1])) },
                { step: 8, note: chordUp(chordUp(chordNotes[2])) },
            ],
            
            // Track 5: Industrial - repetitive mechanical pattern
            'mechanical': () => [
                { step: 0, note: chordNotes[0] },
                { step: 2, note: chordNotes[0] },
                { step: 4, note: chordNotes[2] },
                { step: 6, note: chordNotes[2] },
                { step: 8, note: chordNotes[0] },
                { step: 10, note: chordNotes[1] },
                { step: 12, note: chordNotes[0] },
                { step: 14, note: chordNotes[2] },
            ],
            
            // Track 6: Cyberpunk - glitchy irregular pattern
            'glitch': () => [
                { step: 0, note: chordUp(chordNotes[0]) },
                { step: 1, note: chordUp(chordUp(chordNotes[2])) },
                { step: 5, note: chordUp(chordNotes[1]) },
                { step: 7, note: chordUp(chordUp(chordNotes[0])) },
                { step: 9, note: chordUp(chordNotes[2]) },
                { step: 13, note: chordUp(chordUp(chordNotes[1])) },
            ],
            
            // Track 7: Horror - dissonant descending
            'dissonant': () => [
                { step: 0, note: chordUp(chordUp(chordUp(chordNotes[2]))) },
                { step: 4, note: chordUp(chordUp(chordNotes[1])) },
                { step: 8, note: chordUp(chordNotes[2]) },
                { step: 12, note: chordNotes[0] },
            ],
            
            // Track 8: 80s Pop - catchy memorable hook
            'pop': () => [
                { step: 0, note: chordUp(chordNotes[0]) },
                { step: 3, note: chordUp(chordNotes[1]) },
                { step: 4, note: chordUp(chordNotes[2]) },
                { step: 7, note: chordUp(chordUp(chordNotes[0])) },
                { step: 8, note: chordUp(chordNotes[2]) },
                { step: 11, note: chordUp(chordNotes[1]) },
                { step: 12, note: chordUp(chordNotes[0]) },
                { step: 15, note: chordUp(chordNotes[0]) },
            ],
            
            // Track 9: Gabber - minimal sparse hits
            'minimal': () => [
                { step: 0, note: chordUp(chordNotes[0]) },
                { step: 8, note: chordUp(chordNotes[0]) },
            ],
            
            // Track 10: Eurobeat - euphoric ascending
            'euphoric': () => [
                { step: 0, note: chordNotes[0] },
                { step: 2, note: chordNotes[1] },
                { step: 4, note: chordNotes[2] },
                { step: 6, note: chordUp(chordNotes[0]) },
                { step: 7, note: chordUp(chordNotes[1]) },
                { step: 8, note: chordUp(chordNotes[2]) },
                { step: 9, note: chordUp(chordUp(chordNotes[0])) },
                { step: 10, note: chordUp(chordUp(chordNotes[1])) },
                { step: 11, note: chordUp(chordUp(chordNotes[2])) },
                { step: 12, note: chordUp(chordUp(chordUp(chordNotes[0]))) },
            ],
            
            // Track 11: Epic Orchestral - slow dramatic progression
            'epic': () => [
                { step: 0, note: chordUp(chordUp(chordNotes[0])) },
                { step: 4, note: chordUp(chordUp(chordNotes[2])) },
                { step: 8, note: chordUp(chordUp(chordNotes[1])) },
                { step: 12, note: chordUp(chordUp(chordUp(chordNotes[0]))) },
            ],
            
            // Track 12: Claustrophobic - chaotic unpredictable
            'chaotic': () => [
                { step: 0, note: chordUp(chordUp(chordNotes[1])) },
                { step: 2, note: chordNotes[0] },
                { step: 5, note: chordUp(chordUp(chordUp(chordNotes[2]))) },
                { step: 7, note: chordUp(chordNotes[0]) },
                { step: 9, note: chordNotes[2] },
                { step: 11, note: chordUp(chordUp(chordNotes[0])) },
                { step: 13, note: chordUp(chordNotes[1]) },
                { step: 15, note: chordUp(chordUp(chordNotes[2])) },
            ],
        };

        const generator = MELODY_GENERATORS[melodyStyle] || MELODY_GENERATORS['arpeggio'];
        return generator();
    };

    // Generate catchy hook melody for choruses - memorable, repetitive
    const generateHookMelody = (chord, section, measureNum) => {
        const chordNotes = CHORDS[chord];
        if (!chordNotes) return [];
        
        // Different hook patterns that repeat every 4 measures
        const hookPattern = measureNum % 4;
        
        const HOOK_PATTERNS = [
            // Pattern 0: Call melody
            [
                { step: 0, note: chordUp(chordUp(chordNotes[0])), duration: 2 },
                { step: 2, note: chordUp(chordUp(chordNotes[2])), duration: 1 },
                { step: 4, note: chordUp(chordUp(chordNotes[1])), duration: 2 },
                { step: 8, note: chordUp(chordUp(chordNotes[0])), duration: 4 },
            ],
            // Pattern 1: Response melody
            [
                { step: 0, note: chordUp(chordUp(chordNotes[2])), duration: 2 },
                { step: 2, note: chordUp(chordUp(chordNotes[1])), duration: 1 },
                { step: 4, note: chordUp(chordUp(chordNotes[0])), duration: 2 },
                { step: 8, note: chordUp(chordNotes[2]), duration: 4 },
            ],
            // Pattern 2: Rising tension
            [
                { step: 0, note: chordUp(chordNotes[0]), duration: 1 },
                { step: 2, note: chordUp(chordNotes[1]), duration: 1 },
                { step: 4, note: chordUp(chordNotes[2]), duration: 1 },
                { step: 6, note: chordUp(chordUp(chordNotes[0])), duration: 1 },
                { step: 8, note: chordUp(chordUp(chordNotes[1])), duration: 1 },
                { step: 10, note: chordUp(chordUp(chordNotes[2])), duration: 1 },
                { step: 12, note: chordUp(chordUp(chordUp(chordNotes[0]))), duration: 4 },
            ],
            // Pattern 3: Resolution
            [
                { step: 0, note: chordUp(chordUp(chordUp(chordNotes[0]))), duration: 2 },
                { step: 4, note: chordUp(chordUp(chordNotes[2])), duration: 2 },
                { step: 8, note: chordUp(chordUp(chordNotes[1])), duration: 2 },
                { step: 12, note: chordUp(chordUp(chordNotes[0])), duration: 4 },
            ],
        ];
        
        return HOOK_PATTERNS[hookPattern];
    };

    // Generate counter-melody for harmonic depth
    const generateCounterMelody = (chord, section, measureNum) => {
        const chordNotes = CHORDS[chord];
        if (!chordNotes) return [];
        
        // Counter-melodies move in contrary motion or fill gaps
        const patterns = [
            // Descending while main ascends
            [
                { step: 2, note: chordUp(chordNotes[2]) },
                { step: 6, note: chordUp(chordNotes[1]) },
                { step: 10, note: chordUp(chordNotes[0]) },
                { step: 14, note: chordNotes[2] },
            ],
            // Syncopated fills
            [
                { step: 1, note: chordUp(chordNotes[1]) },
                { step: 5, note: chordUp(chordNotes[0]) },
                { step: 9, note: chordUp(chordNotes[2]) },
                { step: 13, note: chordUp(chordNotes[1]) },
            ],
            // Pedal tone with movement
            [
                { step: 0, note: chordNotes[0] },
                { step: 4, note: chordNotes[0] },
                { step: 6, note: chordUp(chordNotes[1]) },
                { step: 8, note: chordNotes[0] },
                { step: 12, note: chordNotes[0] },
                { step: 14, note: chordUp(chordNotes[2]) },
            ],
        ];
        
        return patterns[measureNum % patterns.length];
    };

    // Drum patterns with fills
    const DRUM_PATTERNS = {
        basic: {
            kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0],
            snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
            hihat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
        },
        driving: {
            kick: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
            snare: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1],
            hihat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        },
        minimal: {
            kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
            snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            hihat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
        },
        fill1: {
            kick: [1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
            snare: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1],
            hihat: [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
        },
        breakdown: {
            kick: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            hihat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        },
    };

    // Percussion patterns for additional instruments
    const PERCUSSION_PATTERNS = {
        minimal: {
            clap: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            tom: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            rim: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            cymbal: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        },
        electronic: {
            clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
            tom: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            rim: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
            cymbal: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
        },
        live: {
            clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
            tom: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
            rim: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0],
            cymbal: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
        },
        industrial: {
            clap: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            tom: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
            rim: [0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0],
            cymbal: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        },
        sparse: {
            clap: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            tom: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
            rim: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            cymbal: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        },
        broken: {
            clap: [0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0],
            tom: [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
            rim: [1, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1],
            cymbal: [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
        },
    };

    // Generate 5+ minutes of unique arrangement (at 130 BPM, 16 steps = 1 bar ≈ 1.85s)
    // 5 minutes = 300 seconds ≈ 162 bars
    const generateArrangement = () => {
        const arrangement = [];
        let progIndex = 0;
        let section = 0; // 0=intro, 1=verse, 2=prechorus, 3=chorus, 4=bridge, 5=breakdown, 6=drop, 7=outro

        // Intro: 8 bars
        for (let i = 0; i < 8; i++) {
            arrangement.push({ section: 0, progIndex: 0, bassPattern: 4, drumPattern: 'minimal', leadEnabled: false, chordPad: false });
        }

        // First verse: 16 bars
        for (let i = 0; i < 16; i++) {
            arrangement.push({ section: 1, progIndex: 0, bassPattern: 0, drumPattern: 'basic', leadEnabled: i >= 8, chordPad: true });
        }

        // Pre-chorus: 8 bars
        for (let i = 0; i < 8; i++) {
            arrangement.push({ section: 2, progIndex: 1, bassPattern: 1, drumPattern: 'driving', leadEnabled: true, chordPad: true });
        }

        // First chorus: 16 bars
        for (let i = 0; i < 16; i++) {
            const isFill = i === 15;
            arrangement.push({ section: 3, progIndex: 0, bassPattern: 3, drumPattern: isFill ? 'fill1' : 'driving', leadEnabled: true, chordPad: true });
        }

        // Second verse: 12 bars (shorter)
        for (let i = 0; i < 12; i++) {
            arrangement.push({ section: 1, progIndex: 2, bassPattern: 2, drumPattern: 'basic', leadEnabled: true, chordPad: true });
        }

        // Bridge: 8 bars
        for (let i = 0; i < 8; i++) {
            arrangement.push({ section: 4, progIndex: 3, bassPattern: 4, drumPattern: 'minimal', leadEnabled: true, chordPad: true });
        }

        // Breakdown: 8 bars
        for (let i = 0; i < 8; i++) {
            arrangement.push({ section: 5, progIndex: 0, bassPattern: 4, drumPattern: 'breakdown', leadEnabled: false, chordPad: i >= 4 });
        }

        // Build-up: 4 bars
        for (let i = 0; i < 4; i++) {
            arrangement.push({ section: 5, progIndex: 0, bassPattern: 5, drumPattern: 'driving', leadEnabled: false, chordPad: true, riser: true });
        }

        // Drop (second chorus): 16 bars
        for (let i = 0; i < 16; i++) {
            arrangement.push({ section: 6, progIndex: 4, bassPattern: 5, drumPattern: 'driving', leadEnabled: true, chordPad: true, intensity: 1.5 });
        }

        // Third chorus with variation: 16 bars
        for (let i = 0; i < 16; i++) {
            const isFill = i === 15;
            arrangement.push({ section: 3, progIndex: 5, bassPattern: 3, drumPattern: isFill ? 'fill1' : 'driving', leadEnabled: true, chordPad: true });
        }

        // Final bridge: 8 bars
        for (let i = 0; i < 8; i++) {
            arrangement.push({ section: 4, progIndex: 2, bassPattern: 0, drumPattern: 'basic', leadEnabled: true, chordPad: true });
        }

        // Outro: 16 bars (gradually removing elements)
        for (let i = 0; i < 16; i++) {
            arrangement.push({
                section: 7,
                progIndex: 0,
                bassPattern: 4,
                drumPattern: i >= 12 ? 'breakdown' : 'minimal',
                leadEnabled: i < 8,
                chordPad: i < 12
            });
        }

        return arrangement; // Total: ~136 bars ≈ 4.2 minutes at 130 BPM
    };

    // Generate a complete song with proper intro, body, and ending
    const generateSong = (style) => {
        const arrangement = [];
        const bpm = style.bpm || 130;
        
        // Song length varies by tempo: faster = shorter perceived time
        // Target ~2-3 minutes per song for good variety
        const targetBars = Math.round(80 + (160 - bpm) * 0.5); // 80-115 bars depending on BPM
        
        // INTRO: 4-8 bars - sparse, building
        const introBars = Math.round(targetBars * 0.06);
        for (let i = 0; i < introBars; i++) {
            arrangement.push({ 
                section: 0, 
                progIndex: 0, 
                bassPattern: 4, 
                drumPattern: i < introBars/2 ? 'breakdown' : 'minimal', 
                leadEnabled: false, 
                chordPad: i >= introBars/2,
                intensity: 0.3 + (i / introBars) * 0.3
            });
        }

        // VERSE 1: 12-16 bars - main theme established
        const verse1Bars = Math.round(targetBars * 0.14);
        for (let i = 0; i < verse1Bars; i++) {
            arrangement.push({ 
                section: 1, 
                progIndex: 0, 
                bassPattern: 0, 
                drumPattern: 'basic', 
                leadEnabled: i >= verse1Bars * 0.4, 
                chordPad: true,
                intensity: 0.7
            });
        }

        // PRE-CHORUS: 8 bars - building energy
        const preChorusBars = Math.round(targetBars * 0.08);
        for (let i = 0; i < preChorusBars; i++) {
            arrangement.push({ 
                section: 2, 
                progIndex: 1, 
                bassPattern: 1, 
                drumPattern: 'driving', 
                leadEnabled: true, 
                chordPad: true,
                intensity: 0.85,
                riser: i >= preChorusBars - 2
            });
        }

        // CHORUS 1: 16 bars - full energy, memorable hook
        const chorus1Bars = Math.round(targetBars * 0.15);
        for (let i = 0; i < chorus1Bars; i++) {
            const isFill = i === chorus1Bars - 1;
            arrangement.push({ 
                section: 3, 
                progIndex: 0, 
                bassPattern: 3, 
                drumPattern: isFill ? 'fill1' : 'driving', 
                leadEnabled: true, 
                chordPad: true,
                intensity: 1.0
            });
        }

        // VERSE 2: 10 bars - shorter, varied
        const verse2Bars = Math.round(targetBars * 0.10);
        for (let i = 0; i < verse2Bars; i++) {
            arrangement.push({ 
                section: 1, 
                progIndex: 2, 
                bassPattern: 2, 
                drumPattern: 'basic', 
                leadEnabled: true, 
                chordPad: true,
                intensity: 0.75
            });
        }

        // BRIDGE: 8 bars - contrast, different feel
        const bridgeBars = Math.round(targetBars * 0.08);
        for (let i = 0; i < bridgeBars; i++) {
            arrangement.push({ 
                section: 4, 
                progIndex: 3, 
                bassPattern: 4, 
                drumPattern: 'minimal', 
                leadEnabled: true, 
                chordPad: true,
                intensity: 0.6
            });
        }

        // BREAKDOWN: 6 bars - tension, anticipation
        const breakdownBars = Math.round(targetBars * 0.06);
        for (let i = 0; i < breakdownBars; i++) {
            arrangement.push({ 
                section: 5, 
                progIndex: 0, 
                bassPattern: 4, 
                drumPattern: 'breakdown', 
                leadEnabled: false, 
                chordPad: i >= breakdownBars/2,
                intensity: 0.3
            });
        }

        // BUILD-UP: 4 bars - riser to drop
        const buildBars = 4;
        for (let i = 0; i < buildBars; i++) {
            arrangement.push({ 
                section: 5, 
                progIndex: 0, 
                bassPattern: 5, 
                drumPattern: 'driving', 
                leadEnabled: false, 
                chordPad: true, 
                riser: true,
                intensity: 0.5 + (i / buildBars) * 0.5
            });
        }

        // DROP: 16 bars - maximum energy
        const dropBars = Math.round(targetBars * 0.15);
        for (let i = 0; i < dropBars; i++) {
            arrangement.push({ 
                section: 6, 
                progIndex: 4, 
                bassPattern: 5, 
                drumPattern: 'driving', 
                leadEnabled: true, 
                chordPad: true, 
                intensity: 1.3
            });
        }

        // FINAL CHORUS: 12 bars - triumphant ending
        const finalChorusBars = Math.round(targetBars * 0.12);
        for (let i = 0; i < finalChorusBars; i++) {
            const isFill = i === finalChorusBars - 1;
            arrangement.push({ 
                section: 3, 
                progIndex: 5, 
                bassPattern: 3, 
                drumPattern: isFill ? 'fill1' : 'driving', 
                leadEnabled: true, 
                chordPad: true,
                intensity: 1.1
            });
        }

        // OUTRO: 6-8 bars - wind down, fade out
        const outroBars = Math.round(targetBars * 0.08);
        for (let i = 0; i < outroBars; i++) {
            const fadeProgress = i / outroBars;
            arrangement.push({ 
                section: 7, 
                progIndex: 0, 
                bassPattern: 4, 
                drumPattern: fadeProgress < 0.5 ? 'basic' : 'minimal', 
                leadEnabled: fadeProgress < 0.7, 
                chordPad: fadeProgress < 0.8,
                intensity: Math.max(0.2, 0.8 - fadeProgress * 0.7),
                isOutro: true,
                isFinalBar: i === outroBars - 1
            });
        }

        return arrangement;
    };

    const arrangementRef = useRef(null);

    const initAudio = useCallback(() => {
        if (audioContext.current) {
            if (audioContext.current.state === 'suspended') {
                audioContext.current.resume();
            }
            return;
        }

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        audioContext.current = ctx;

        // === MASTER OUTPUT CHAIN (prevents clipping) ===
        
        // Soft clipper using waveshaper for smooth limiting
        const limiter = ctx.createWaveShaper();
        const limitCurve = new Float32Array(65536);
        for (let i = 0; i < 65536; i++) {
            const x = (i / 32768) - 1;
            // Soft clip curve - starts limiting around 0.7, hard limit at 1.0
            limitCurve[i] = Math.tanh(x * 1.5) * 0.9;
        }
        limiter.curve = limitCurve;
        limiter.oversample = '2x';

        // Master compressor for dynamic control
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -12;  // Start compressing at -12dB
        compressor.knee.value = 6;         // Soft knee
        compressor.ratio.value = 4;        // 4:1 compression
        compressor.attack.value = 0.003;   // Fast attack
        compressor.release.value = 0.15;   // Quick release

        // Master gain (reduced to prevent overload)
        const masterGain = ctx.createGain();
        masterGain.gain.value = 0.7; // -3dB headroom
        
        // Chain: masterGain -> compressor -> limiter -> destination
        masterGain.connect(compressor);
        compressor.connect(limiter);
        limiter.connect(ctx.destination);
        masterGainRef.current = masterGain;

        // Store compressor for potential external control
        compressorRef.current = compressor;

        // Initialize with first track style
        const initialTrack = TRACK_ORDER[currentTrackIndexRef.current];
        const initialStyle = TRACK_STYLES[initialTrack];
        currentStyleRef.current = initialStyle;

        // Generate song arrangement based on track style
        arrangementRef.current = generateSong(initialStyle);
        songLengthRef.current = arrangementRef.current.length;

        // --- ENGINE RUMBLE (Brown Noise) ---
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            lastOut = (lastOut + (0.02 * white)) / 1.02;
            data[i] = lastOut * 4.5;
        }

        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = buffer;
        noiseSrc.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 150;

        const gain = ctx.createGain();
        gain.gain.value = 0.18;

        noiseSrc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noiseSrc.start();
        engineNode.current = { src: noiseSrc, filter, gain };

        // --- START LOOKAHEAD SCHEDULER ---
        isPlayingRef.current = true;
        currentMeasure.current = 0;
        nextNoteTimeRef.current = ctx.currentTime + 0.1; // Start slightly in the future
        scheduledMeasuresRef.current.clear();
        
        // Start the lookahead scheduler loop
        startScheduler(ctx);

        const songDuration = Math.round(arrangementRef.current.length * (60 / initialStyle.bpm) * 4);
        console.log(`[AUDIO] 🎵 Song started: "${initialStyle.name}" - ${arrangementRef.current.length} bars (~${songDuration} seconds)`);
    }, []);

    // Lookahead scheduler - runs frequently to schedule audio ahead of time
    // This pattern prevents audio glitches by not relying on setTimeout timing accuracy
    const startScheduler = (ctx) => {
        if (schedulerTimerRef.current) {
            clearInterval(schedulerTimerRef.current);
        }
        
        const scheduler = () => {
            if (!isPlayingRef.current || !ctx) {
                clearInterval(schedulerTimerRef.current);
                return;
            }
            
            // Schedule measures that fall within our lookahead window
            while (nextNoteTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD_TIME) {
                const measureNum = currentMeasure.current;
                
                // Prevent double-scheduling the same measure
                if (!scheduledMeasuresRef.current.has(measureNum)) {
                    scheduledMeasuresRef.current.add(measureNum);
                    scheduleMeasureAtTime(measureNum, nextNoteTimeRef.current, ctx);
                    
                    // Clean up old scheduled measures (keep only recent 10)
                    if (scheduledMeasuresRef.current.size > 10) {
                        const oldest = Math.min(...scheduledMeasuresRef.current);
                        scheduledMeasuresRef.current.delete(oldest);
                    }
                }
                
                // Calculate when the next measure starts
                const style = currentStyleRef.current || TRACK_STYLES['track_01'];
                const BPM = style.bpm || 130;
                const measureDuration = (60 / BPM / 4) * 16;
                
                // Check if song is ending
                const songLength = songLengthRef.current || arrangementRef.current.length;
                if (measureNum >= songLength - 1) {
                    // Song complete - schedule transition to next track
                    handleSongEnd(ctx, nextNoteTimeRef.current + measureDuration);
                    nextNoteTimeRef.current += measureDuration;
                    return; // Exit scheduler, will be restarted by handleSongEnd
                }
                
                // Advance to next measure
                nextNoteTimeRef.current += measureDuration;
                currentMeasure.current = measureNum + 1;
            }
        };
        
        // Run scheduler at regular intervals (doesn't need to be precise, just frequent enough)
        schedulerTimerRef.current = setInterval(scheduler, SCHEDULER_INTERVAL);
        scheduler(); // Run immediately once
    };

    // Handle song ending and track transition
    const handleSongEnd = (ctx, transitionTime) => {
        console.log(`[AUDIO] 🎵 Song complete! (${currentMeasure.current + 1} bars)`);
        
        // Stop current scheduler
        if (schedulerTimerRef.current) {
            clearInterval(schedulerTimerRef.current);
        }
        
        // Schedule the transition using audio time (precise)
        const delay = Math.max(0, (transitionTime - ctx.currentTime) * 1000);
        
        setTimeout(() => {
            if (audioContext.current && isPlayingRef.current) {
                // Move to next track
                currentTrackIndexRef.current = (currentTrackIndexRef.current + 1) % TRACK_ORDER.length;
                const nextTrack = TRACK_ORDER[currentTrackIndexRef.current];
                
                console.log(`[AUDIO] 🔄 Auto-advancing to: ${nextTrack}`);
                
                // Reset and regenerate for new track
                const newStyle = TRACK_STYLES[nextTrack];
                currentStyleRef.current = newStyle;
                arrangementRef.current = generateSong(newStyle);
                songLengthRef.current = arrangementRef.current.length;
                currentMeasure.current = 0;
                scheduledMeasuresRef.current.clear();
                nextNoteTimeRef.current = ctx.currentTime + 0.05;
                
                // Reset master gain for new song
                if (masterGainRef.current) {
                    masterGainRef.current.gain.setTargetAtTime(0.7, ctx.currentTime, 0.1);
                }
                
                // Notify callback if set
                if (songEndCallbackRef.current) {
                    songEndCallbackRef.current(nextTrack, newStyle.name);
                }
                
                // Restart scheduler for new song
                startScheduler(ctx);
            }
        }, delay);
    };

    // Schedule one measure at a specific audio time (called by lookahead scheduler)
    const scheduleMeasureAtTime = (measureNum, startTime, ctx) => {
        if (!isPlayingRef.current || !ctx) return;

        // Get current track style
        const style = currentStyleRef.current || TRACK_STYLES['track_01'];
        const BPM = style.bpm || 130;
        const stepDuration = 60 / BPM / 4;
        const measureDuration = stepDuration * 16;

        const arrangement = arrangementRef.current;
        const barData = arrangement[measureNum % arrangement.length];
        
        // Use track-specific chord progression
        const trackProgressions = style.progression || [0];
        const progIndex = trackProgressions[measureNum % trackProgressions.length];
        const progression = PROGRESSIONS[progIndex % PROGRESSIONS.length];
        
        const chordIndex = Math.floor((measureNum % 4)); // Change chord every bar
        const chord = progression[chordIndex % progression.length];
        const intensity = (barData.intensity || 1.0) * (style.intensity || 1.0);

        // Map bass style to pattern index
        const bassStyleMap = {
            'steady': 0, 'syncopated': 1, 'funky': 2, 'aggressive': 3, 'slow': 4, 'relentless': 5
        };
        const trackBassPattern = bassStyleMap[style.bassStyle] || 0;

        // Section-based instrument probability (0=intro, 1=verse, 2=prechorus, 3=chorus, 4=bridge, 5=breakdown, 6=drop, 7=outro)
        const sectionIntensity = {
            0: 0.3, 1: 0.5, 2: 0.7, 3: 1.0, 4: 0.6, 5: 0.2, 6: 1.0, 7: 0.5
        }[barData.section] || 0.5;

        // Get percussion pattern
        const percPattern = PERCUSSION_PATTERNS[style.percStyle] || PERCUSSION_PATTERNS.minimal;

        // Schedule all 16 steps in this measure
        for (let step = 0; step < 16; step++) {
            const time = startTime + step * stepDuration;

            // Drums
            const drumPattern = DRUM_PATTERNS[barData.drumPattern] || DRUM_PATTERNS.basic;
            if (drumPattern.kick[step]) scheduleKick(ctx, time, intensity);
            if (drumPattern.snare[step]) scheduleSnare(ctx, time, intensity);
            if (drumPattern.hihat[step]) scheduleHihat(ctx, time, intensity);

            // Percussion (when enabled)
            if (style.usePercussion && Math.random() < sectionIntensity) {
                if (percPattern.clap[step]) scheduleClap(ctx, time, intensity);
                if (percPattern.tom[step]) scheduleTom(ctx, time, ['hi', 'mid', 'lo'][step % 3], intensity);
                if (percPattern.rim[step]) scheduleRim(ctx, time, intensity);
                if (percPattern.cymbal[step]) scheduleCymbal(ctx, time, 0.3, intensity);
            }

            // Metallic hits on snare hits
            if (style.useMetallic && drumPattern.snare[step] && Math.random() < 0.7) {
                scheduleMetallic(ctx, time, intensity * style.noiseLevel);
            }

            // Bass - use track-specific bass pattern
            const bassPattern = BASS_PATTERNS[trackBassPattern];
            for (const [offset, dur] of bassPattern) {
                if (offset === step) {
                    const bassNote = CHORDS[chord][0]; // Root note
                    
                    // Use PWM instead of regular bass if enabled
                    if (style.usePWM && Math.random() < 0.5) {
                        schedulePWM(ctx, time, bassNote, dur * stepDuration, intensity * 0.6, style);
                    } else {
                        scheduleBass(ctx, time, bassNote, dur * stepDuration, intensity * 0.7, style);
                    }
                }
            }

            // Sub-bass layer for heavy tracks (every 4 steps)
            if (style.useSubBass && step % 4 === 0) {
                const bassNote = CHORDS[chord][0];
                scheduleSubBass(ctx, time, bassNote, stepDuration * 4, intensity * 0.6);
                
                // Deep sub rumble on drops and choruses (every 8 steps)
                if ((barData.section === 6 || barData.section === 3) && step % 8 === 0) {
                    scheduleDeepSub(ctx, time, bassNote, stepDuration * 8, intensity * 0.5);
                }
            }

            // Wobble bass - dubstep wobble on drops and choruses
            if (style.useWobble && (barData.section === 6 || barData.section === 3)) {
                if (step % 4 === 0) { // Every quarter note
                    const bassNote = CHORDS[chord][0];
                    scheduleWobbleBass(ctx, time, bassNote, stepDuration * 4, intensity * 0.5, style);
                }
            }

            // Growl bass - aggressive modulated bass on intense sections
            if (style.useGrowl && barData.section === 6 && step === 0) {
                const bassNote = CHORDS[chord][0];
                scheduleGrowlBass(ctx, time, bassNote, measureDuration * 0.9, intensity * 0.4, style);
            }

            // === MELODIC ELEMENTS ===
            
            // Main lead melody - use COMPLETE track-specific melodies
            if (barData.leadEnabled && step === 0) {
                // Get current track ID
                const trackId = TRACK_ORDER[currentTrackIndexRef.current] || 'track_01';
                const barInPhrase = measureNum % 4;
                
                // Try complete melody first, fall back to generated patterns
                const completeMelody = getCompleteMelody(trackId, barData.section, measureNum);
                
                if (completeMelody && completeMelody.length > 0) {
                    // Use complete, authored melody
                    for (const note of completeMelody) {
                        const noteTime = startTime + note.step * stepDuration;
                        const noteDuration = (note.duration || 2) * stepDuration;
                        
                        // Schedule lead with note name (will be converted to frequency)
                        scheduleLeadNote(ctx, noteTime, note.note, noteDuration, intensity * 0.6, style);
                        
                        // Add pluck doubling for emphasis on some notes
                        if (style.usePluck && note.duration >= 2 && Math.random() < 0.4 * sectionIntensity) {
                            schedulePluckNote(ctx, noteTime, note.note, style);
                        }
                    }
                } else {
                    // Fall back to chord-based generated melody
                    const melody = generateMelody(chord, barData.section, measureNum, style.melodyStyle);
                    for (const note of melody) {
                        const noteTime = startTime + note.step * stepDuration;
                        scheduleLead(ctx, noteTime, note.note, stepDuration * 1.5, intensity * 0.6, style);
                        
                        if (style.usePluck && Math.random() < 0.5 * sectionIntensity) {
                            schedulePluck(ctx, noteTime, note.note, style);
                        }
                    }
                }

                // Tremolo on some lead notes
                if (style.useTremolo && Math.random() < 0.3 * sectionIntensity) {
                    const tremoloNote = completeMelody.length > 0 ? completeMelody[0].note : 'A4';
                    scheduleLeadNote(ctx, startTime, tremoloNote, stepDuration * 4, intensity * 0.3, style);
                }

                // Portamento slides (occasionally on long notes)
                if (style.usePortamento && measureNum % 8 === 0 && completeMelody.length >= 2) {
                    const freq1 = NOTE_FREQS[completeMelody[0].note] || 440;
                    const freq2 = NOTE_FREQS[completeMelody[1].note] || 523;
                    schedulePortamentoFreq(ctx, startTime, freq1, freq2, stepDuration * 4, intensity * 0.5, style);
                }
                
                // COUNTER-MELODY: Secondary melody line for depth
                if (barData.section >= 1 && barData.section <= 4 && measureNum % 2 === 1) {
                    const counterMelody = generateCounterMelody(chord, barData.section, measureNum);
                    for (const note of counterMelody) {
                        const noteTime = startTime + note.step * stepDuration;
                        scheduleCounterMelody(ctx, noteTime, note.note, stepDuration * 1.2, intensity * 0.35, style);
                    }
                }
                
                // HARMONY: Parallel thirds on chorus/drop
                if ((barData.section === 3 || barData.section === 6) && completeMelody.length > 0) {
                    // Add harmony a third above first few notes
                    for (const note of completeMelody.slice(0, 3)) {
                        if (note.duration >= 2) {
                            const noteTime = startTime + note.step * stepDuration;
                            const harmonyFreq = (NOTE_FREQS[note.note] || 440) * 1.26; // Major third
                            scheduleHarmonyFreq(ctx, noteTime, harmonyFreq, note.duration * stepDuration, intensity * 0.25, style);
                        }
                    }
                }
            }

            // FM counter-melodies on odd measures - use minimal style for variety
            if (style.useFM && barData.leadEnabled && measureNum % 2 === 1 && step === 0 && Math.random() < sectionIntensity) {
                const melody = generateMelody(chord, barData.section, measureNum + 1, 'minimal');
                for (const note of melody.slice(0, 4)) { // Only first 4 notes
                    scheduleFM(ctx, startTime + note.step * stepDuration, note.note, stepDuration * 1.2, intensity * 0.5, style);
                }
            }

            // Bells (sparse, high melody every 4 measures)
            if (style.useBells && barData.leadEnabled && measureNum % 4 === 0 && step === 0 && Math.random() < 0.5) {
                const melody = generateMelody(chord, barData.section, measureNum, style.melodyStyle);
                for (const note of melody.slice(0, 3)) {
                    scheduleBell(ctx, startTime + note.step * stepDuration, note.note, style);
                }
            }

            // Arpeggiator on chord changes
            if (style.useArp && barData.chordPad && step === 0 && measureNum % 2 === 0 && Math.random() < sectionIntensity) {
                scheduleArp(ctx, time, chord, stepDuration, style);
            }

            // Chord pad or detuned pad
            if (barData.chordPad && step === 0) {
                if (style.useDetuned && Math.random() < sectionIntensity) {
                    scheduleDetunedPad(ctx, time, chord, measureDuration * 0.95, intensity * 0.4, style);
                } else {
                    scheduleChordPad(ctx, time, chord, measureDuration * 0.95, intensity * 0.5, style);
                }
            }

            // Gated pads on chorus sections
            if (style.useGated && barData.section === 3 && step === 0) {
                scheduleGated(ctx, time, chord, measureDuration * 0.95, stepDuration, style);
            }

            // Stabs on downbeats during energetic sections
            if (style.useStabs && step === 0 && (barData.section === 3 || barData.section === 6)) {
                scheduleStab(ctx, time, chord, intensity, style);
            }
        }

        // Formant sweeps on pads during bridges
        if (style.useFormant && barData.chordPad && barData.section === 4 && Math.random() < 0.5) {
            scheduleFormant(ctx, startTime, chord, measureDuration * 0.95, intensity * 0.6, style);
        }

        // Granular textures on breakdowns
        if (style.useGranular && barData.section === 5 && Math.random() < 0.7) {
            scheduleGranular(ctx, startTime, measureDuration * 0.95, chord, intensity * 0.5, style);
        }

        // Noise sweeps during transitions/risers
        if (style.useNoiseSweep && (barData.riser || barData.section === 2)) {
            scheduleNoiseSweep(ctx, startTime, measureDuration * 0.9, 'up', intensity * style.noiseLevel);
        }

        // Reverse sweeps before drops
        if (style.useReverse && barData.section === 5 && measureNum % 4 === 3) {
            scheduleReverse(ctx, startTime, measureDuration, intensity * 0.8);
        }

        // Riser for buildups
        if (barData.riser) {
            scheduleRiser(ctx, startTime, measureDuration);
        }

        // Check if song is ending
        const songLength = songLengthRef.current || arrangement.length;
        const isLastBar = measureNum >= songLength - 1;
        const isOutro = barData.isOutro;
        
        // Apply fade out during outro (schedule gain change at startTime)
        if (isOutro && masterGainRef.current) {
            const fadeProgress = (measureNum - (songLength - 8)) / 8; // Last 8 bars fade
            const fadeGain = Math.max(0.1, 1.0 - fadeProgress * 0.8);
            masterGainRef.current.gain.setTargetAtTime(fadeGain, startTime, 0.5);
        }

        // Handle end of song - trigger track transition via handleSongEnd
        if (isLastBar) {
            console.log(`[AUDIO] 🎵 Song complete! (${measureNum + 1} bars)`);
            // Schedule transition at end of this measure
            const transitionTime = startTime + measureDuration;
            handleSongEnd(ctx, transitionTime);
        }
        // Note: Next measure scheduling is handled by the lookahead scheduler loop
    };

    // --- INSTRUMENT SCHEDULERS ---
    // Enhanced kick for heavy dubstep - deeper pitch sweep and sub layer
    const scheduleKick = (ctx, time, intensity) => {
        // Main kick oscillator with deeper pitch sweep
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        // Sub layer for chest-rattling thump
        const subOsc = ctx.createOscillator();
        const subGain = ctx.createGain();
        
        // Click transient for punch
        const clickOsc = ctx.createOscillator();
        const clickGain = ctx.createGain();

        // Main kick - starts higher, sweeps lower for more impact
        osc.type = 'sine';
        osc.frequency.setValueAtTime(250 * intensity, time);
        osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
        gain.gain.setValueAtTime(0.35 * intensity, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);

        // Sub layer - very low frequency thump
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(60, time);
        subOsc.frequency.exponentialRampToValueAtTime(30, time + 0.2);
        subGain.gain.setValueAtTime(0.25 * intensity, time);
        subGain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

        // Click transient - high frequency attack for definition
        clickOsc.type = 'triangle';
        clickOsc.frequency.setValueAtTime(1000, time);
        clickOsc.frequency.exponentialRampToValueAtTime(200, time + 0.02);
        clickGain.gain.setValueAtTime(0.15 * intensity, time);
        clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);

        osc.connect(gain);
        subOsc.connect(subGain);
        clickOsc.connect(clickGain);
        gain.connect(ctx.destination);
        subGain.connect(ctx.destination);
        clickGain.connect(ctx.destination);

        osc.start(time);
        subOsc.start(time);
        clickOsc.start(time);
        osc.stop(time + 0.3);
        subOsc.stop(time + 0.35);
        clickOsc.stop(time + 0.03);
    };

    const scheduleSnare = (ctx, time, intensity) => {
        const bufferSize = ctx.sampleRate * 0.12;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const bandpass = ctx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.value = 4000;
        bandpass.Q.value = 0.8;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.18 * intensity, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

        noise.connect(bandpass);
        bandpass.connect(gain);
        gain.connect(ctx.destination);
        noise.start(time);
    };

    const scheduleHihat = (ctx, time, intensity) => {
        const bufferSize = ctx.sampleRate * 0.03;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const highpass = ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 10000;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.05 * intensity, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);

        noise.connect(highpass);
        highpass.connect(gain);
        gain.connect(ctx.destination);
        noise.start(time);
    };

    const scheduleBass = (ctx, time, note, duration, intensity, style = {}) => {
        const freq = NOTE_FREQS[note];
        if (!freq) return;

        const osc = ctx.createOscillator();
        const osc2 = ctx.createOscillator(); // Second oscillator for fatness
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        // Use track-specific bass type
        osc.type = style.bassType || 'triangle';
        osc.frequency.value = freq;

        // Second oscillator slightly detuned for thickness
        osc2.type = style.bassType || 'triangle';
        osc2.frequency.value = freq * 1.005;

        filter.type = 'lowpass';
        filter.frequency.value = 600 * (style.filterMod || 1.0);
        filter.Q.value = 2; // Slight resonance for punch

        // Sidechain-style pump envelope - duck then swell
        gain.gain.setValueAtTime(0.08 * intensity, time); // Start ducked
        gain.gain.linearRampToValueAtTime(0.15 * intensity, time + 0.04); // Quick attack
        gain.gain.setValueAtTime(0.15 * intensity, time + duration * 0.3);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc2.start(time);
        osc.stop(time + duration);
        osc2.stop(time + duration);
    };

    const scheduleLead = (ctx, time, note, duration, intensity, style = {}) => {
        const freq = NOTE_FREQS[note];
        if (!freq) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        // Use track-specific lead type
        osc.type = style.leadType || 'sawtooth';
        osc.frequency.value = freq;

        filter.type = 'lowpass';
        const baseFreq = 800 * (style.filterMod || 1.0);
        filter.frequency.setValueAtTime(baseFreq + Math.sin(time) * 400, time);
        filter.frequency.linearRampToValueAtTime(baseFreq * 0.5, time + duration);
        filter.Q.value = 2;

        gain.gain.setValueAtTime(0.08 * intensity, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + duration);
    };

    // Hook melody - bright, memorable, cuts through the mix
    const scheduleHook = (ctx, time, note, duration, intensity, style = {}) => {
        const freq = NOTE_FREQS[note];
        if (!freq) return;

        // Dual oscillator for fuller sound
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        // Bright sawtooth with slight detuning
        osc1.type = 'sawtooth';
        osc1.frequency.value = freq;
        osc2.type = 'sawtooth';
        osc2.frequency.value = freq * 1.003; // Slight detune for chorus effect

        // High-pass filter for brightness, then lowpass for smoothness
        filter.type = 'bandpass';
        filter.frequency.value = freq * 2;
        filter.Q.value = 1.5;

        // Punchy envelope
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.12 * intensity, time + 0.01);
        gain.gain.setValueAtTime(0.1 * intensity, time + duration * 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc1.start(time);
        osc2.start(time);
        osc1.stop(time + duration);
        osc2.stop(time + duration);
    };

    // Counter-melody - softer, sits behind the main melody
    const scheduleCounterMelody = (ctx, time, note, duration, intensity, style = {}) => {
        const freq = NOTE_FREQS[note];
        if (!freq) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        // Triangle for softer tone
        osc.type = 'triangle';
        osc.frequency.value = freq;

        filter.type = 'lowpass';
        filter.frequency.value = 1200 * (style.filterMod || 1.0);
        filter.Q.value = 0.7;

        // Gentle envelope
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.06 * intensity, time + 0.05);
        gain.gain.setValueAtTime(0.05 * intensity, time + duration * 0.6);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + duration);
    };

    // Harmony - sits with the lead, adds richness
    const scheduleHarmony = (ctx, time, note, duration, intensity, style = {}) => {
        const freq = NOTE_FREQS[note];
        if (!freq) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        // Sine for pure harmony
        osc.type = 'sine';
        osc.frequency.value = freq;

        filter.type = 'lowpass';
        filter.frequency.value = 2000;

        // Soft attack, blend with lead
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.05 * intensity, time + 0.03);
        gain.gain.setValueAtTime(0.04 * intensity, time + duration * 0.5);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + duration);
    };

    const scheduleChordPad = (ctx, time, chord, duration, intensity, style = {}) => {
        const notes = CHORDS[chord];
        if (!notes) return;

        for (const note of notes) {
            const freq = NOTE_FREQS[chordUp(note)]; // Play chord one octave up
            if (!freq) continue;

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const filter = ctx.createBiquadFilter();

            // Chord pads use triangle/sine for softer sound
            osc.type = style.leadType === 'sine' ? 'sine' : 'triangle';
            osc.frequency.value = freq;

            filter.type = 'lowpass';
            filter.frequency.value = 600 * (style.filterMod || 1.0);

            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(0.04 * intensity, time + 0.3);
            gain.gain.linearRampToValueAtTime(0.03 * intensity, time + duration - 0.3);
            gain.gain.linearRampToValueAtTime(0, time + duration);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            osc.start(time);
            osc.stop(time + duration);
        }
    };

    // ============= NEW INSTRUMENTS =============

    // Pluck synth - short attack, fast decay
    const schedulePluck = (ctx, time, note, style = {}) => {
        const freq = NOTE_FREQS[note];
        if (!freq) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = 'triangle';
        osc.frequency.value = freq * 2; // One octave higher for brightness

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(3000, time);
        filter.frequency.exponentialRampToValueAtTime(800, time + 0.15);
        filter.Q.value = 5;

        gain.gain.setValueAtTime(0.12 * (style.intensity || 1.0), time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + 0.2);
    };

    // Arpeggiator - fast note sequence
    const scheduleArp = (ctx, time, chord, stepDuration, style = {}) => {
        const notes = CHORDS[chord];
        if (!notes) return;

        const arpSpeed = stepDuration / 4; // 16th notes
        for (let i = 0; i < 8; i++) {
            const note = notes[i % notes.length];
            const freq = NOTE_FREQS[chordUp(note)];
            if (!freq) continue;

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const filter = ctx.createBiquadFilter();

            osc.type = style.leadType === 'square' ? 'square' : 'sawtooth';
            osc.frequency.value = freq * (i < 4 ? 1 : 2); // Second half octave up

            filter.type = 'lowpass';
            filter.frequency.value = 1200 * (style.filterMod || 1.0);
            filter.Q.value = 3;

            gain.gain.setValueAtTime(0.06 * (style.intensity || 1.0), time + i * arpSpeed);
            gain.gain.exponentialRampToValueAtTime(0.001, time + i * arpSpeed + arpSpeed * 0.8);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            osc.start(time + i * arpSpeed);
            osc.stop(time + i * arpSpeed + arpSpeed);
        }
    };

    // Sub-bass - enhanced for heavy dubstep weight
    const scheduleSubBass = (ctx, time, note, duration, intensity) => {
        const freq = NOTE_FREQS[note];
        if (!freq) return;

        // Primary sub oscillator
        const osc = ctx.createOscillator();
        // Secondary sub one octave lower for earthquake rumble
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = 'sine';
        osc.frequency.value = freq / 2; // One octave down

        osc2.type = 'sine';
        osc2.frequency.value = freq / 4; // Two octaves down for deep rumble

        // Sub-bass filter to prevent mud
        filter.type = 'lowpass';
        filter.frequency.value = 120;
        filter.Q.value = 0.7;

        // Increased gain and slower attack for weight
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.25 * intensity, time + 0.03);
        gain.gain.setValueAtTime(0.25 * intensity, time + duration * 0.6);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc2.start(time);
        osc.stop(time + duration);
        osc2.stop(time + duration);
    };

    // Wobble bass - LFO-modulated filter for dubstep sound
    const scheduleWobbleBass = (ctx, time, note, duration, intensity, style = {}) => {
        const freq = NOTE_FREQS[note];
        if (!freq) return;

        const osc = ctx.createOscillator();
        const osc2 = ctx.createOscillator(); // Second oscillator for thickness
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        const distortion = ctx.createWaveShaper();

        // Main oscillator - sawtooth for gritty bass
        osc.type = 'sawtooth';
        osc.frequency.value = freq / 2; // Sub frequencies

        // Second oscillator slightly detuned for fatness
        osc2.type = 'sawtooth';
        osc2.frequency.value = (freq / 2) * 1.01; // Slight detune

        // LFO for wobble effect - rate based on track style
        const wobbleRate = (style.wobbleRate || 4); // Wobbles per beat
        lfo.type = 'sine';
        lfo.frequency.value = wobbleRate * ((style.bpm || 130) / 60) / 4;

        // Resonant lowpass filter - key to wobble sound
        filter.type = 'lowpass';
        filter.frequency.value = 200;
        filter.Q.value = 12; // High resonance for squelchy growl

        // LFO modulates filter cutoff (200 Hz to 2000 Hz)
        lfoGain.gain.value = 900; // Modulation depth
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);

        // Soft clipping distortion for extra grit
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
            const x = (i / 128) - 1;
            curve[i] = Math.tanh(x * 2);
        }
        distortion.curve = curve;

        // Envelope with sidechain-style pump
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.2 * intensity, time + 0.02);
        gain.gain.setValueAtTime(0.2 * intensity, time + duration * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        // Signal chain: oscillators -> filter -> distortion -> gain
        osc.connect(filter);
        osc2.connect(filter);
        filter.connect(distortion);
        distortion.connect(gain);
        gain.connect(ctx.destination);

        lfo.start(time);
        osc.start(time);
        osc2.start(time);
        lfo.stop(time + duration);
        osc.stop(time + duration);
        osc2.stop(time + duration);
    };

    // Growl bass - aggressive modulated bass with formant-like character
    const scheduleGrowlBass = (ctx, time, note, duration, intensity, style = {}) => {
        const freq = NOTE_FREQS[note];
        if (!freq) return;

        // Three oscillators for maximum fatness
        const oscs = [];
        const gains = [];
        const masterGain = ctx.createGain();
        const filter1 = ctx.createBiquadFilter();
        const filter2 = ctx.createBiquadFilter();
        const lfo1 = ctx.createOscillator();
        const lfo2 = ctx.createOscillator();
        const lfoGain1 = ctx.createGain();
        const lfoGain2 = ctx.createGain();

        // Create 3 detuned oscillators
        const detunes = [-15, 0, 15];
        const types = ['sawtooth', 'sawtooth', 'triangle'];
        for (let i = 0; i < 3; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = types[i];
            osc.frequency.value = freq / 2;
            osc.detune.value = detunes[i];
            gain.gain.value = 0.3;
            osc.connect(gain);
            oscs.push(osc);
            gains.push(gain);
        }

        // Two bandpass filters for formant-like growl
        filter1.type = 'bandpass';
        filter1.frequency.value = 400;
        filter1.Q.value = 3;

        filter2.type = 'bandpass';
        filter2.frequency.value = 1200;
        filter2.Q.value = 2;

        // LFOs modulate filter frequencies for evolving growl
        const bpm = style.bpm || 130;
        lfo1.type = 'sine';
        lfo1.frequency.value = (bpm / 60) / 2; // Half note wobble
        lfoGain1.gain.value = 300;
        lfo1.connect(lfoGain1);
        lfoGain1.connect(filter1.frequency);

        lfo2.type = 'triangle';
        lfo2.frequency.value = (bpm / 60) * 2; // Eighth note modulation
        lfoGain2.gain.value = 600;
        lfo2.connect(lfoGain2);
        lfoGain2.connect(filter2.frequency);

        // Master envelope
        masterGain.gain.setValueAtTime(0, time);
        masterGain.gain.linearRampToValueAtTime(0.2 * intensity, time + 0.01);
        masterGain.gain.setValueAtTime(0.2 * intensity, time + duration * 0.8);
        masterGain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        // Connect oscillators to both filters in parallel, then sum
        for (const gain of gains) {
            gain.connect(filter1);
            gain.connect(filter2);
        }
        filter1.connect(masterGain);
        filter2.connect(masterGain);
        masterGain.connect(ctx.destination);

        // Start everything
        lfo1.start(time);
        lfo2.start(time);
        for (const osc of oscs) {
            osc.start(time);
            osc.stop(time + duration);
        }
        lfo1.stop(time + duration);
        lfo2.stop(time + duration);
    };

    // Deep sub-bass rumble - extremely low frequencies for chest-rattling bass
    const scheduleDeepSub = (ctx, time, note, duration, intensity) => {
        const freq = NOTE_FREQS[note];
        if (!freq) return;

        const osc = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        // Fundamental at very low frequency
        osc.type = 'sine';
        osc.frequency.value = freq / 4; // Two octaves down (~30-60 Hz range)

        // Second harmonic for definition
        osc2.type = 'sine';
        osc2.frequency.value = freq / 2; // One octave down

        // Sub-bass filter to clean up
        filter.type = 'lowpass';
        filter.frequency.value = 100;
        filter.Q.value = 1;

        // Slow attack, sustained body
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.25 * intensity, time + 0.05);
        gain.gain.setValueAtTime(0.25 * intensity, time + duration * 0.7);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(time);
        osc2.start(time);
        osc.stop(time + duration);
        osc2.stop(time + duration);
    };

    // Detuned pad - multiple oscillators slightly detuned for richness
    const scheduleDetunedPad = (ctx, time, chord, duration, intensity, style = {}) => {
        const notes = CHORDS[chord];
        if (!notes) return;

        for (const note of notes) {
            const freq = NOTE_FREQS[chordUp(chordUp(note))];
            if (!freq) continue;

            // Create 3 detuned oscillators per note
            for (let detune of [-8, 0, 8]) {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                const filter = ctx.createBiquadFilter();

                osc.type = 'sawtooth';
                osc.frequency.value = freq;
                osc.detune.value = detune;

                filter.type = 'lowpass';
                filter.frequency.value = 400 * (style.filterMod || 1.0);
                filter.Q.value = 1;

                gain.gain.setValueAtTime(0, time);
                gain.gain.linearRampToValueAtTime(0.015 * intensity, time + 0.5);
                gain.gain.linearRampToValueAtTime(0.01 * intensity, time + duration - 0.5);
                gain.gain.linearRampToValueAtTime(0, time + duration);

                osc.connect(filter);
                filter.connect(gain);
                gain.connect(ctx.destination);
                osc.start(time);
                osc.stop(time + duration);
            }
        }
    };

    // FM synth - frequency modulation for bell/electric piano tones
    const scheduleFM = (ctx, time, note, duration, intensity, style = {}) => {
        const freq = NOTE_FREQS[note];
        if (!freq) return;

        const modulator = ctx.createOscillator();
        const modulatorGain = ctx.createGain();
        const carrier = ctx.createOscillator();
        const carrierGain = ctx.createGain();

        modulator.type = 'sine';
        modulator.frequency.value = freq * 2; // 2:1 ratio
        modulatorGain.gain.value = freq * 3 * intensity; // Modulation depth

        carrier.type = 'sine';
        carrier.frequency.value = freq;

        carrierGain.gain.setValueAtTime(0.08 * intensity, time);
        carrierGain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        modulator.connect(modulatorGain);
        modulatorGain.connect(carrier.frequency);
        carrier.connect(carrierGain);
        carrierGain.connect(ctx.destination);

        modulator.start(time);
        carrier.start(time);
        modulator.stop(time + duration);
        carrier.stop(time + duration);
    };

    // Stabs - short chord hits
    const scheduleStab = (ctx, time, chord, intensity, style = {}) => {
        const notes = CHORDS[chord];
        if (!notes) return;

        for (const note of notes) {
            const freq = NOTE_FREQS[chordUp(note)];
            if (!freq) continue;

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const filter = ctx.createBiquadFilter();

            osc.type = style.leadType || 'square';
            osc.frequency.value = freq;

            filter.type = 'lowpass';
            filter.frequency.value = 2000;
            filter.Q.value = 2;

            gain.gain.setValueAtTime(0.15 * intensity, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            osc.start(time);
            osc.stop(time + 0.1);
        }
    };

    // Bells - high sine wave melodies with long release
    const scheduleBell = (ctx, time, note, style = {}) => {
        const freq = NOTE_FREQS[note];
        if (!freq) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.value = freq * 4; // Two octaves up

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.03 * (style.intensity || 1.0), time + 0.3);
        gain.gain.linearRampToValueAtTime(0, time + 3);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + 3);
    };

    // Metallic - ring modulation percussion
    const scheduleMetallic = (ctx, time, intensity) => {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'triangle';
        osc1.frequency.value = 200 + Math.random() * 100;
        osc2.type = 'triangle';
        osc2.frequency.value = 311 + Math.random() * 100;

        gain.gain.setValueAtTime(0.1 * intensity, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

        osc1.connect(gain);
        osc2.connect(gain.gain);
        gain.connect(ctx.destination);

        osc1.start(time);
        osc2.start(time);
        osc1.stop(time + 0.12);
        osc2.stop(time + 0.12);
    };

    // Noise sweep - filtered noise risers/falls
    const scheduleNoiseSweep = (ctx, time, duration, direction, intensity) => {
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 5;
        
        if (direction === 'up') {
            filter.frequency.setValueAtTime(200, time);
            filter.frequency.exponentialRampToValueAtTime(8000, time + duration);
        } else {
            filter.frequency.setValueAtTime(8000, time);
            filter.frequency.exponentialRampToValueAtTime(200, time + duration);
        }

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.12 * intensity, time + duration * 0.5);
        gain.gain.linearRampToValueAtTime(0, time + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start(time);
    };

    // PWM synth - pulse width modulation
    const schedulePWM = (ctx, time, note, duration, intensity, style = {}) => {
        const freq = NOTE_FREQS[note];
        if (!freq) return;

        // Two square waves slightly detuned
        for (let detune of [-10, 10]) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const filter = ctx.createBiquadFilter();

            osc.type = 'triangle';
            osc.frequency.value = freq;
            osc.detune.value = detune;

            filter.type = 'lowpass';
            filter.frequency.value = 800 * (style.filterMod || 1.0);

            gain.gain.setValueAtTime(0.08 * intensity, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            osc.start(time);
            osc.stop(time + duration);
        }
    };

    // Portamento - sliding pitch
    const schedulePortamento = (ctx, time, noteStart, noteEnd, duration, intensity, style = {}) => {
        const freqStart = NOTE_FREQS[noteStart];
        const freqEnd = NOTE_FREQS[noteEnd];
        if (!freqStart || !freqEnd) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = style.leadType || 'sawtooth';
        osc.frequency.setValueAtTime(freqStart, time);
        osc.frequency.exponentialRampToValueAtTime(freqEnd, time + duration);

        filter.type = 'lowpass';
        filter.frequency.value = 1500;

        gain.gain.setValueAtTime(0.1 * intensity, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + duration);
    };

    // Gated pad - rhythmic gating
    const scheduleGated = (ctx, time, chord, duration, stepDuration, style = {}) => {
        const notes = CHORDS[chord];
        if (!notes) return;

        const gateSpeed = stepDuration / 4;
        const gateCount = Math.floor(duration / gateSpeed);

        for (const note of notes) {
            const freq = NOTE_FREQS[chordUp(note)];
            if (!freq) continue;

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const filter = ctx.createBiquadFilter();

            osc.type = 'sawtooth';
            osc.frequency.value = freq;

            filter.type = 'lowpass';
            filter.frequency.value = 600;

            // Create gate pattern
            for (let i = 0; i < gateCount; i++) {
                const t = time + i * gateSpeed;
                if (i % 2 === 0) {
                    gain.gain.setValueAtTime(0.04 * (style.intensity || 1.0), t);
                } else {
                    gain.gain.setValueAtTime(0, t);
                }
            }

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            osc.start(time);
            osc.stop(time + duration);
        }
    };

    // Tremolo - amplitude modulation
    const scheduleTremolo = (ctx, time, note, duration, intensity, style = {}) => {
        const freq = NOTE_FREQS[note];
        if (!freq) return;

        const osc = ctx.createOscillator();
        const tremolo = ctx.createOscillator();
        const tremoloGain = ctx.createGain();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.value = freq;

        tremolo.type = 'sine';
        tremolo.frequency.value = 6; // 6 Hz tremolo
        tremoloGain.gain.value = 0.3;

        gain.gain.setValueAtTime(0.06 * intensity, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        tremolo.connect(tremoloGain);
        tremoloGain.connect(gain.gain);
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(time);
        tremolo.start(time);
        osc.stop(time + duration);
        tremolo.stop(time + duration);
    };

    // Clap - hand clap simulation
    const scheduleClap = (ctx, time, intensity) => {
        for (let i = 0; i < 3; i++) {
            const bufferSize = ctx.sampleRate * 0.05;
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let j = 0; j < bufferSize; j++) {
                data[j] = (Math.random() * 2 - 1) * (1 - j / bufferSize);
            }
            const noise = ctx.createBufferSource();
            noise.buffer = buffer;

            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 1000 + Math.random() * 500;
            filter.Q.value = 1;

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.12 * intensity, time + i * 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, time + i * 0.01 + 0.05);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            noise.start(time + i * 0.01);
        }
    };

    // Tom - pitched drum
    const scheduleTom = (ctx, time, pitch, intensity) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        const baseFreq = pitch === 'hi' ? 200 : pitch === 'mid' ? 120 : 80;
        osc.frequency.setValueAtTime(baseFreq, time);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, time + 0.15);

        gain.gain.setValueAtTime(0.2 * intensity, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + 0.25);
    };

    // Rim shot
    const scheduleRim = (ctx, time, intensity) => {
        const bufferSize = ctx.sampleRate * 0.01;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 3000;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.08 * intensity, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.01);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start(time);
    };

    // Cymbal
    const scheduleCymbal = (ctx, time, duration, intensity) => {
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 6000;
        filter.Q.value = 0.5;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.08 * intensity, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start(time);
    };

    // Formant filter - vowel sounds
    const scheduleFormant = (ctx, time, chord, duration, intensity, style = {}) => {
        const notes = CHORDS[chord];
        if (!notes) return;

        const vowels = [
            [700, 1200, 2600], // 'a'
            [400, 2000, 2800], // 'e'
            [300, 2300, 3000], // 'i'
        ];
        const vowel = vowels[Math.floor(Math.random() * vowels.length)];

        for (const note of notes) {
            const freq = NOTE_FREQS[chordUp(note)];
            if (!freq) continue;

            const osc = ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.value = freq;

            let node = osc;
            for (const formantFreq of vowel) {
                const filter = ctx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.value = formantFreq;
                filter.Q.value = 10;
                node.connect(filter);
                node = filter;
            }

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.02 * intensity, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

            node.connect(gain);
            gain.connect(ctx.destination);
            osc.start(time);
            osc.stop(time + duration);
        }
    };

    // Granular synthesis - textural clouds
    const scheduleGranular = (ctx, time, duration, chord, intensity, style = {}) => {
        const notes = CHORDS[chord];
        if (!notes) return;

        const grainCount = 30;
        const grainDuration = 0.03;

        for (let i = 0; i < grainCount; i++) {
            const grainTime = time + Math.random() * duration;
            const note = notes[Math.floor(Math.random() * notes.length)];
            const freq = NOTE_FREQS[note];
            if (!freq) continue;

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.value = freq * (0.5 + Math.random());

            gain.gain.setValueAtTime(0.02 * intensity, grainTime);
            gain.gain.exponentialRampToValueAtTime(0.001, grainTime + grainDuration);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(grainTime);
            osc.stop(grainTime + grainDuration);
        }
    };

    // Reverse cymbal/noise swell
    const scheduleReverse = (ctx, time, duration, intensity) => {
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(200, time);
        filter.frequency.exponentialRampToValueAtTime(8000, time + duration);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.15 * intensity, time + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start(time);
    };

    const scheduleRiser = (ctx, time, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, time);
        osc.frequency.exponentialRampToValueAtTime(2000, time + duration);

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.15, time + duration * 0.8);
        gain.gain.linearRampToValueAtTime(0, time + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + duration);
    };

    const playSfx = useCallback((type) => {
        if (!audioContext.current) return;
        const ctx = audioContext.current;
        const t = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'crash') {
            osc.type = 'sine'; // Softer than square
            osc.frequency.setValueAtTime(150, t);
            osc.frequency.exponentialRampToValueAtTime(40, t + 0.4);
            gain.gain.setValueAtTime(0.08, t); // Reduced from 0.5
            gain.gain.linearRampToValueAtTime(0, t + 0.4);
            osc.start(t);
            osc.stop(t + 0.4);
        } else if (type === 'boost') {
            osc.type = 'sine'; // Softer than sawtooth
            osc.frequency.setValueAtTime(200, t);
            osc.frequency.linearRampToValueAtTime(600, t + 0.8);
            gain.gain.setValueAtTime(0.05, t); // Reduced from 0.2
            gain.gain.linearRampToValueAtTime(0, t + 0.8);
            osc.start(t);
            osc.stop(t + 0.8);
        } else if (type === 'missile') {
            // Whoosh + explosion
            osc.type = 'triangle'; // Softer than sawtooth
            osc.frequency.setValueAtTime(800, t);
            osc.frequency.exponentialRampToValueAtTime(200, t + 0.3);
            gain.gain.setValueAtTime(0.08, t); // Reduced from 0.4
            gain.gain.linearRampToValueAtTime(0, t + 0.3);
            osc.start(t);
            osc.stop(t + 0.3);
        } else if (type === 'laser') {
            // Zap sound
            osc.type = 'triangle'; // Softer than square
            osc.frequency.setValueAtTime(1200, t);
            osc.frequency.exponentialRampToValueAtTime(300, t + 0.15);
            gain.gain.setValueAtTime(0.06, t); // Reduced from 0.25
            gain.gain.linearRampToValueAtTime(0, t + 0.15);
            osc.start(t);
            osc.stop(t + 0.15);
        } else if (type === 'powerup') {
            // Magical pickup sound (ascending)
            osc.type = 'sine';
            osc.frequency.setValueAtTime(300, t);
            osc.frequency.setValueAtTime(400, t + 0.1);
            osc.frequency.setValueAtTime(600, t + 0.2);
            osc.frequency.setValueAtTime(800, t + 0.3);
            gain.gain.setValueAtTime(0.06, t); // Reduced from 0.15
            gain.gain.linearRampToValueAtTime(0, t + 0.4);
            osc.start(t);
            osc.stop(t + 0.4);
        } else if (type === 'explosion') {
            // Big boom
            osc.type = 'triangle'; // Softer than sawtooth
            osc.frequency.setValueAtTime(100, t);
            osc.frequency.exponentialRampToValueAtTime(20, t + 0.8);
            gain.gain.setValueAtTime(0.12, t); // Reduced from 0.6
            gain.gain.linearRampToValueAtTime(0, t + 0.8);
            osc.start(t);
            osc.stop(t + 0.8);
        } else if (type === 'join') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(500, t);
            osc.frequency.setValueAtTime(1000, t + 0.1);
            gain.gain.setValueAtTime(0.04, t); // Reduced from 0.1
            gain.gain.linearRampToValueAtTime(0, t + 0.4);
            osc.start(t);
            osc.stop(t + 0.4);
        } else if (type === 'countdown') {
            // Countdown beep - softer and less harsh
            osc.type = 'sine'; // Changed from square (much softer)
            osc.frequency.setValueAtTime(440, t);
            osc.frequency.setValueAtTime(660, t + 0.08); // Less dramatic jump (was 880)
            gain.gain.setValueAtTime(0.04, t); // Reduced from 0.2
            gain.gain.linearRampToValueAtTime(0, t + 0.15);
            osc.start(t);
            osc.stop(t + 0.15);
        } else if (type === 'locate') {
            // Radar-style ping for locate feature
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, t);
            osc.frequency.setValueAtTime(1200, t + 0.05);
            osc.frequency.setValueAtTime(1000, t + 0.1);
            osc.frequency.setValueAtTime(800, t + 0.15);
            gain.gain.setValueAtTime(0.08, t);
            gain.gain.linearRampToValueAtTime(0.06, t + 0.1);
            gain.gain.linearRampToValueAtTime(0, t + 0.3);
            osc.start(t);
            osc.stop(t + 0.3);
        }
    }, []);

    const setEngineRpm = useCallback((rpm) => {
        if (!engineNode.current) return;
        const { filter, gain } = engineNode.current;
        const ctx = audioContext.current;

        const targetFreq = 150 + (rpm * 350);
        const targetVol = 0.18 + (rpm * 0.30);

        filter.frequency.setTargetAtTime(targetFreq, ctx.currentTime, 0.1);
        gain.gain.setTargetAtTime(targetVol, ctx.currentTime, 0.1);
    }, []);

    // Set music style based on track ID - regenerates song for the track
    const setMusicStyle = useCallback((trackId) => {
        const style = TRACK_STYLES[trackId];
        if (style) {
            currentStyleRef.current = style;
            
            // Update track index for auto-progression
            const trackIndex = TRACK_ORDER.indexOf(trackId);
            if (trackIndex >= 0) {
                currentTrackIndexRef.current = trackIndex;
            }
            
            // Regenerate song arrangement for new style
            if (audioContext.current) {
                arrangementRef.current = generateSong(style);
                songLengthRef.current = arrangementRef.current.length;
                currentMeasure.current = 0; // Start from beginning
                
                // Reset master gain for new song
                if (masterGainRef.current) {
                    masterGainRef.current.gain.setTargetAtTime(1.0, audioContext.current.currentTime, 0.1);
                }
            }
            
            // Build active instruments list
            const activeInstruments = [];
            if (style.usePluck) activeInstruments.push('pluck');
            if (style.useArp) activeInstruments.push('arp');
            if (style.useSubBass) activeInstruments.push('sub-bass');
            if (style.useDetuned) activeInstruments.push('detuned-pad');
            if (style.useFM) activeInstruments.push('FM');
            if (style.useStabs) activeInstruments.push('stabs');
            if (style.useBells) activeInstruments.push('bells');
            if (style.useMetallic) activeInstruments.push('metallic');
            if (style.useNoiseSweep) activeInstruments.push('noise-sweep');
            if (style.usePWM) activeInstruments.push('PWM');
            if (style.usePortamento) activeInstruments.push('portamento');
            if (style.useGated) activeInstruments.push('gated');
            if (style.useTremolo) activeInstruments.push('tremolo');
            if (style.usePercussion) activeInstruments.push('percussion');
            if (style.useFormant) activeInstruments.push('formant');
            if (style.useGranular) activeInstruments.push('granular');
            if (style.useReverse) activeInstruments.push('reverse');
            if (style.useWobble) activeInstruments.push('wobble-bass');
            if (style.useGrowl) activeInstruments.push('growl-bass');

            const songDuration = arrangementRef.current ? 
                Math.round(arrangementRef.current.length * (60 / style.bpm) * 4) : 0;
            console.log(`[AUDIO] 🎵 New song: "${style.name}" (~${songDuration}s)`);
            console.log(`[AUDIO]   BPM: ${style.bpm} | Bass: ${style.bassType} | Lead: ${style.leadType}`);
            console.log(`[AUDIO]   Instruments (${activeInstruments.length}): ${activeInstruments.join(', ') || 'none'}`);
        } else {
            console.warn(`[AUDIO] Unknown track style: ${trackId}`);
        }
    }, []);

    // Set callback for when song ends
    const onSongEnd = useCallback((callback) => {
        songEndCallbackRef.current = callback;
    }, []);

    // Get current song progress (0-1)
    const getSongProgress = useCallback(() => {
        if (!songLengthRef.current) return 0;
        return currentMeasure.current / songLengthRef.current;
    }, []);

    const getCurrentStyle = useCallback(() => {
        return currentStyleRef.current || TRACK_STYLES['track_01'];
    }, []);

    // Stop audio and clean up scheduler
    const stopAudio = useCallback(() => {
        isPlayingRef.current = false;
        if (schedulerTimerRef.current) {
            clearInterval(schedulerTimerRef.current);
            schedulerTimerRef.current = null;
        }
        scheduledMeasuresRef.current.clear();
        console.log('[AUDIO] Stopped and cleaned up scheduler');
    }, []);

    return { 
        initAudio, 
        playSfx, 
        setEngineRpm, 
        setMusicStyle, 
        getCurrentStyle, 
        onSongEnd,
        stopAudio,
        getSongProgress,
        TRACK_STYLES,
        TRACK_ORDER
    };
}
