import { useRef, useCallback } from 'react';

export function useAudio(connected) {
    const audioContext = useRef(null);
    const engineNode = useRef(null);
    const isPlayingRef = useRef(false);
    const currentMeasure = useRef(0);
    const currentStyleRef = useRef('classic');

    // 12 Track-specific music styles
    const TRACK_STYLES = {
        'track_01': { name: 'Classic Synthwave', bpm: 118, key: 'Dm', bassType: 'square', leadType: 'sawtooth', intensity: 1.0, filterMod: 1.0 },
        'track_02': { name: 'Aggressive Darksynth', bpm: 140, key: 'Em', bassType: 'sawtooth', leadType: 'square', intensity: 1.4, filterMod: 0.7 },
        'track_03': { name: 'Outrun', bpm: 124, key: 'Am', bassType: 'square', leadType: 'sawtooth', intensity: 1.1, filterMod: 1.2 },
        'track_04': { name: 'Dreamwave', bpm: 100, key: 'F', bassType: 'triangle', leadType: 'sine', intensity: 0.7, filterMod: 1.5 },
        'track_05': { name: 'Industrial', bpm: 145, key: 'Bb', bassType: 'sawtooth', leadType: 'square', intensity: 1.5, filterMod: 0.5 },
        'track_06': { name: 'Cyberpunk', bpm: 130, key: 'C', bassType: 'square', leadType: 'sawtooth', intensity: 1.2, filterMod: 0.8 },
        'track_07': { name: 'Horror Synth', bpm: 90, key: 'Gm', bassType: 'sawtooth', leadType: 'triangle', intensity: 0.6, filterMod: 0.4 },
        'track_08': { name: '80s Pop', bpm: 120, key: 'C', bassType: 'square', leadType: 'sawtooth', intensity: 1.0, filterMod: 1.3 },
        'track_09': { name: 'Gabber', bpm: 160, key: 'Am', bassType: 'sawtooth', leadType: 'square', intensity: 1.8, filterMod: 0.3 },
        'track_10': { name: 'Eurobeat', bpm: 155, key: 'Em', bassType: 'square', leadType: 'sawtooth', intensity: 1.3, filterMod: 1.4 },
        'track_11': { name: 'Epic Orchestral', bpm: 110, key: 'Dm', bassType: 'triangle', leadType: 'sine', intensity: 0.9, filterMod: 1.6 },
        'track_12': { name: 'Claustrophobic', bpm: 135, key: 'Bb', bassType: 'sawtooth', leadType: 'square', intensity: 1.4, filterMod: 0.6 }
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

    // Multiple chord progressions for variety
    const PROGRESSIONS = [
        ['Dm', 'Am', 'Bb', 'C'],     // Classic synthwave
        ['Dm', 'Bb', 'F', 'C'],      // Pop progression
        ['Am', 'F', 'C', 'Gm'],      // Alternative
        ['Dm', 'Gm', 'Am', 'Dm'],    // Minor mood
        ['F', 'Bb', 'C', 'Dm'],      // Uplifting
        ['Am', 'Em', 'F', 'C'],      // Emotional
    ];

    // Bassline patterns (array of [stepOffset, duration] pairs)
    const BASS_PATTERNS = [
        [[0, 2], [4, 2], [8, 2], [12, 2]],           // Quarter notes
        [[0, 1], [2, 1], [4, 1], [6, 1], [8, 2], [12, 2]], // Syncopated
        [[0, 3], [4, 1], [8, 3], [12, 1]],           // Dotted
        [[0, 1], [1, 1], [4, 2], [8, 1], [9, 1], [12, 2]], // Busy
        [[0, 4], [8, 4]],                             // Half notes
        [[0, 1], [3, 1], [4, 1], [7, 1], [8, 1], [11, 1], [12, 1], [14, 1]], // 16th groove
    ];

    // Lead melody generators (procedural patterns)
    const generateMelody = (chord, section, measureNum) => {
        const chordNotes = CHORDS[chord];
        const notes = [];
        const seed = measureNum * 7 + section * 13;

        const patterns = [
            // Arpeggios
            () => [
                { step: 0, note: chordNotes[0] },
                { step: 2, note: chordNotes[1] },
                { step: 4, note: chordNotes[2] },
                { step: 6, note: chordUp(chordNotes[0]) },
                { step: 8, note: chordUp(chordNotes[2]) },
                { step: 10, note: chordUp(chordNotes[1]) },
                { step: 12, note: chordUp(chordNotes[0]) },
                { step: 14, note: chordNotes[2] },
            ],
            // Staccato hits
            () => [
                { step: 0, note: chordUp(chordNotes[0]) },
                { step: 4, note: chordUp(chordNotes[1]) },
                { step: 8, note: chordUp(chordNotes[2]) },
                { step: 12, note: chordUp(chordNotes[0]) },
            ],
            // Syncopated
            () => [
                { step: 1, note: chordUp(chordNotes[0]) },
                { step: 4, note: chordUp(chordNotes[2]) },
                { step: 7, note: chordUp(chordNotes[1]) },
                { step: 10, note: chordUp(chordNotes[0]) },
                { step: 14, note: chordUp(chordNotes[2]) },
            ],
            // Descending
            () => [
                { step: 0, note: chordUp(chordUp(chordNotes[2])) },
                { step: 3, note: chordUp(chordUp(chordNotes[1])) },
                { step: 6, note: chordUp(chordUp(chordNotes[0])) },
                { step: 9, note: chordUp(chordNotes[2]) },
                { step: 12, note: chordUp(chordNotes[1]) },
                { step: 15, note: chordUp(chordNotes[0]) },
            ],
            // Minimal
            () => [
                { step: 0, note: chordUp(chordNotes[0]) },
                { step: 8, note: chordUp(chordNotes[2]) },
            ],
        ];

        const patternIndex = (seed % patterns.length);
        return patterns[patternIndex]();
    };

    // Helper to transpose note up one octave
    const chordUp = (note) => {
        const match = note.match(/([A-G]#?)(\d)/);
        if (!match) return note;
        return match[1] + (parseInt(match[2]) + 1);
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

        return arrangement; // Total: ~136 bars ≈ 4.2 minutes, will loop with variation
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

        // Generate arrangement
        arrangementRef.current = generateArrangement();

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

        // --- START SONG SEQUENCER ---
        isPlayingRef.current = true;
        currentMeasure.current = 0;
        scheduleMeasure(0, ctx);

        console.log(`[AUDIO] Procedural song started: ${arrangementRef.current.length} bars (~${Math.round(arrangementRef.current.length * 1.85)} seconds)`);
    }, []);

    // Schedule one measure (16 steps) at a time
    const scheduleMeasure = (measureNum, ctx) => {
        if (!isPlayingRef.current || !ctx) return;

        // Get current track style
        const style = currentStyleRef.current || TRACK_STYLES['track_01'];
        const BPM = style.bpm || 130;
        const stepDuration = 60 / BPM / 4;
        const measureDuration = stepDuration * 16;

        const arrangement = arrangementRef.current;
        const barData = arrangement[measureNum % arrangement.length];
        const progression = PROGRESSIONS[barData.progIndex % PROGRESSIONS.length];
        const chordIndex = Math.floor((measureNum % 4)); // Change chord every bar
        const chord = progression[chordIndex % progression.length];
        const intensity = (barData.intensity || 1.0) * (style.intensity || 1.0);

        // Schedule all 16 steps in this measure
        for (let step = 0; step < 16; step++) {
            const time = ctx.currentTime + step * stepDuration;

            // Drums
            const drumPattern = DRUM_PATTERNS[barData.drumPattern] || DRUM_PATTERNS.basic;
            if (drumPattern.kick[step]) scheduleKick(ctx, time, intensity);
            if (drumPattern.snare[step]) scheduleSnare(ctx, time, intensity);
            if (drumPattern.hihat[step]) scheduleHihat(ctx, time, intensity);

            // Bass
            const bassPattern = BASS_PATTERNS[barData.bassPattern % BASS_PATTERNS.length];
            for (const [offset, dur] of bassPattern) {
                if (offset === step) {
                    const bassNote = CHORDS[chord][0]; // Root note
                    scheduleBass(ctx, time, bassNote, dur * stepDuration, intensity, style);
                }
            }

            // Lead melody
            if (barData.leadEnabled && step === 0) {
                const melody = generateMelody(chord, barData.section, measureNum);
                for (const note of melody) {
                    scheduleLead(ctx, ctx.currentTime + note.step * stepDuration, note.note, stepDuration * 1.5, intensity, style);
                }
            }

            // Chord pad
            if (barData.chordPad && step === 0) {
                scheduleChordPad(ctx, time, chord, measureDuration * 0.95, intensity * 0.5, style);
            }
        }

        // Riser for buildups
        if (barData.riser) {
            scheduleRiser(ctx, ctx.currentTime, measureDuration);
        }

        // Schedule next measure
        setTimeout(() => {
            if (audioContext.current) {
                currentMeasure.current = measureNum + 1;
                scheduleMeasure(measureNum + 1, ctx);
            }
        }, measureDuration * 1000);
    };

    // --- INSTRUMENT SCHEDULERS ---
    const scheduleKick = (ctx, time, intensity) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200 * intensity, time);
        osc.frequency.exponentialRampToValueAtTime(30, time + 0.15);
        gain.gain.setValueAtTime(0.7 * intensity, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + 0.25);
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
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        // Use track-specific bass type
        osc.type = style.bassType || 'square';
        osc.frequency.value = freq;

        filter.type = 'lowpass';
        filter.frequency.value = 500 * (style.filterMod || 1.0);

        gain.gain.setValueAtTime(0.15 * intensity, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + duration);
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
            osc.type = 'square';
            osc.frequency.setValueAtTime(150, t);
            osc.frequency.exponentialRampToValueAtTime(40, t + 0.4);
            gain.gain.setValueAtTime(0.5, t);
            gain.gain.linearRampToValueAtTime(0, t + 0.4);
            osc.start(t);
            osc.stop(t + 0.4);
        } else if (type === 'boost') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, t);
            osc.frequency.linearRampToValueAtTime(600, t + 0.8);
            gain.gain.setValueAtTime(0.2, t);
            gain.gain.linearRampToValueAtTime(0, t + 0.8);
            osc.start(t);
            osc.stop(t + 0.8);
        } else if (type === 'missile') {
            // Whoosh + explosion
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(800, t);
            osc.frequency.exponentialRampToValueAtTime(200, t + 0.3);
            gain.gain.setValueAtTime(0.4, t);
            gain.gain.linearRampToValueAtTime(0, t + 0.3);
            osc.start(t);
            osc.stop(t + 0.3);
        } else if (type === 'laser') {
            // Zap sound
            osc.type = 'square';
            osc.frequency.setValueAtTime(1200, t);
            osc.frequency.exponentialRampToValueAtTime(300, t + 0.15);
            gain.gain.setValueAtTime(0.25, t);
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
            gain.gain.setValueAtTime(0.15, t);
            gain.gain.linearRampToValueAtTime(0, t + 0.4);
            osc.start(t);
            osc.stop(t + 0.4);
        } else if (type === 'explosion') {
            // Big boom
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(100, t);
            osc.frequency.exponentialRampToValueAtTime(20, t + 0.8);
            gain.gain.setValueAtTime(0.6, t);
            gain.gain.linearRampToValueAtTime(0, t + 0.8);
            osc.start(t);
            osc.stop(t + 0.8);
        } else if (type === 'join') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(500, t);
            osc.frequency.setValueAtTime(1000, t + 0.1);
            gain.gain.setValueAtTime(0.1, t);
            gain.gain.linearRampToValueAtTime(0, t + 0.4);
            osc.start(t);
            osc.stop(t + 0.4);
        } else if (type === 'countdown') {
            // Countdown beep - ascending pitch
            osc.type = 'square';
            osc.frequency.setValueAtTime(440, t);
            osc.frequency.setValueAtTime(880, t + 0.08);
            gain.gain.setValueAtTime(0.2, t);
            gain.gain.linearRampToValueAtTime(0, t + 0.15);
            osc.start(t);
            osc.stop(t + 0.15);
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

    // Set music style based on track ID
    const setMusicStyle = useCallback((trackId) => {
        const style = TRACK_STYLES[trackId];
        if (style) {
            currentStyleRef.current = style;
            console.log(`[AUDIO] Music style changed to: ${style.name} (${style.bpm} BPM, bass=${style.bassType}, lead=${style.leadType}, intensity=${style.intensity}, filterMod=${style.filterMod})`);
        } else {
            console.warn(`[AUDIO] Unknown track style: ${trackId}`);
        }
    }, []);

    const getCurrentStyle = useCallback(() => {
        return currentStyleRef.current || TRACK_STYLES['track_01'];
    }, []);

    return { initAudio, playSfx, setEngineRpm, setMusicStyle, getCurrentStyle, TRACK_STYLES };
}
