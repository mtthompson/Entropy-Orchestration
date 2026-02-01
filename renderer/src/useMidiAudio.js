import { useRef, useCallback, useEffect } from 'react';

// === VIRTUAL MIDI SYNTHESIZER ===
// This class mimics a General MIDI device using Web Audio API
class VirtualMidiSynth {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.4;
        this.masterGain.connect(this.ctx.destination);
        this.activeNotes = new Map();

        this.engineNode = null;
    }

    resume() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    midiToFreq(note) {
        return 440 * Math.pow(2, (note - 69) / 12);
    }

    setEngineRpm(rpm) {
        if (!this.engineNode) {
            const bufferSize = this.ctx.sampleRate * 2;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            let lastOut = 0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                lastOut = (lastOut + (0.02 * white)) / 1.02;
                data[i] = lastOut * 3.5;
            }
            const src = this.ctx.createBufferSource();
            src.buffer = buffer;
            src.loop = true;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            const gain = this.ctx.createGain();
            src.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            src.start();
            this.engineNode = { src, filter, gain };
        }

        const { filter, gain } = this.engineNode;
        const targetFreq = 100 + (rpm * 400);
        const targetVol = 0.05 + (rpm * 0.15);

        filter.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
        gain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.1);
    }

    noteOn(channel, note, velocity) {
        this.resume();
        if (velocity === 0) {
            this.noteOff(channel, note);
            return;
        }

        const id = `${channel}-${note}`;
        // Polyphony check: if note exists, stop it first
        if (this.activeNotes.has(id)) {
            this.activeNotes.get(id).stop(this.ctx.currentTime);
            this.activeNotes.delete(id);
        }

        const freq = this.midiToFreq(note);
        const intensity = velocity / 127;
        const time = this.ctx.currentTime;

        if (channel === 9) {
            this.playDrum(note, intensity, time);
        } else {
            this.playSynth(channel, freq, intensity, time, id);
        }
    }

    noteOff(channel, note) {
        const id = `${channel}-${note}`;
        if (this.activeNotes.has(id)) {
            const activeNote = this.activeNotes.get(id);
            if (activeNote.gainNode) {
                const releaseTime = 0.2;
                activeNote.gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
                activeNote.gainNode.gain.setValueAtTime(activeNote.gainNode.gain.value, this.ctx.currentTime);
                activeNote.gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + releaseTime);
                activeNote.stop(this.ctx.currentTime + releaseTime);
            } else {
                activeNote.stop(this.ctx.currentTime);
            }
            this.activeNotes.delete(id);
        }
    }

    playSynth(channel, freq, intensity, time, id) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        // 0: Bass (Saw/Square)
        // 1: Lead 1 (Saw)
        // 2: Pad (Triangle + Slow Attack)
        // 3: Arp (Square)
        // 4: Pluck (Triangle + Fast Decay)
        // 5: Bells (Sine + Long Release)
        // 6: Gritty Bass (Saw + Distortion ish)
        // 7: Orchestral (Saw + Low Filter)

        let type = 'triangle';
        let attack = 0.01;
        let release = 0.2;
        let filterFreq = 2000;

        if (channel === 0) { type = 'sawtooth'; filterFreq = 600; }
        if (channel === 1) { type = 'square'; filterFreq = 3000; }
        if (channel === 2) { type = 'sine'; attack = 0.4; filterFreq = 1500; }
        if (channel === 3) { type = 'square'; filterFreq = 1000; }
        if (channel === 4) { type = 'triangle'; attack = 0.005; release = 0.1; filterFreq = 3000; }
        if (channel === 5) { type = 'sine'; attack = 0.01; release = 1.5; filterFreq = 5000; }
        if (channel === 6) { type = 'sawtooth'; filterFreq = 400; }
        if (channel === 7) { type = 'sawtooth'; attack = 0.1; filterFreq = 1200; }

        osc.type = type;
        osc.frequency.setValueAtTime(freq, time);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(filterFreq, time);
        if (channel === 3 || channel === 4) {
            filter.frequency.setValueAtTime(filterFreq * 2, time);
            filter.frequency.exponentialRampToValueAtTime(filterFreq / 2, time + 0.2);
        }

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(intensity * 0.4, time + attack);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        osc.start(time);

        this.activeNotes.set(id, {
            stop: (t) => { try { osc.stop(t); } catch (e) { } },
            gainNode: gain
        });
    }

    playDrum(note, intensity, time) {
        // Kick (35, 36)
        if (note === 35 || note === 36) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.frequency.setValueAtTime(150, time);
            osc.frequency.exponentialRampToValueAtTime(40, time + 0.15);
            gain.gain.setValueAtTime(intensity, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(time);
            osc.stop(time + 0.2);
        }
        // Snare (38, 40)
        else if (note === 38 || note === 40) {
            const noise = this.createNoiseBuffer();
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.value = 1000;
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(intensity * 0.8, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.masterGain);
            noise.start(time);
        }
        // HiHat (42, 44, 46)
        else if (note === 42 || note === 44 || note === 46) {
            const noise = this.createNoiseBuffer();
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.value = 5000;
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(intensity * 0.4, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.masterGain);
            noise.start(time);
        }
    }

    createNoiseBuffer() {
        const bufferSize = this.ctx.sampleRate * 0.5;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        return noise;
    }

    playSFX(type) {
        this.resume();
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        const vol = 0.3;

        if (type === 'crash') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(150, t);
            osc.frequency.exponentialRampToValueAtTime(40, t + 0.4);
            gain.gain.setValueAtTime(vol, t);
            gain.gain.linearRampToValueAtTime(0, t + 0.4);
            osc.start(t);
            osc.stop(t + 0.4);
        } else if (type === 'boost') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(200, t);
            osc.frequency.linearRampToValueAtTime(600, t + 0.8);
            gain.gain.setValueAtTime(vol, t);
            gain.gain.linearRampToValueAtTime(0, t + 0.8);
            osc.start(t);
            osc.stop(t + 0.8);
        } else if (type === 'missile') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(800, t);
            osc.frequency.exponentialRampToValueAtTime(200, t + 0.3);
            gain.gain.setValueAtTime(vol, t);
            gain.gain.linearRampToValueAtTime(0, t + 0.3);
            osc.start(t);
            osc.stop(t + 0.3);
        } else if (type === 'laser') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(1200, t);
            osc.frequency.exponentialRampToValueAtTime(300, t + 0.15);
            gain.gain.setValueAtTime(vol * 0.8, t);
            gain.gain.linearRampToValueAtTime(0, t + 0.15);
            osc.start(t);
            osc.stop(t + 0.15);
        } else if (type === 'powerup') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(300, t);
            osc.frequency.setValueAtTime(400, t + 0.1);
            osc.frequency.setValueAtTime(600, t + 0.2);
            osc.frequency.setValueAtTime(800, t + 0.3);
            gain.gain.setValueAtTime(vol, t);
            gain.gain.linearRampToValueAtTime(0, t + 0.4);
            osc.start(t);
            osc.stop(t + 0.4);
        } else if (type === 'explosion') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(100, t);
            osc.frequency.exponentialRampToValueAtTime(20, t + 0.8);
            gain.gain.setValueAtTime(vol, t);
            gain.gain.linearRampToValueAtTime(0, t + 0.8);
            osc.start(t);
            osc.stop(t + 0.8);
        } else if (type === 'join') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(500, t);
            osc.frequency.setValueAtTime(1000, t + 0.1);
            gain.gain.setValueAtTime(vol, t);
            gain.gain.linearRampToValueAtTime(0, t + 0.4);
            osc.start(t);
            osc.stop(t + 0.4);
        } else if (type === 'countdown') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(440, t);
            gain.gain.setValueAtTime(vol, t);
            gain.gain.linearRampToValueAtTime(0, t + 0.15);
            osc.start(t);
            osc.stop(t + 0.15);
        } else if (type === 'locate') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, t);
            osc.frequency.linearRampToValueAtTime(1200, t + 0.2);
            gain.gain.setValueAtTime(vol, t);
            gain.gain.linearRampToValueAtTime(0, t + 0.3);
            osc.start(t);
            osc.stop(t + 0.3);
        }
    }
}


export function useMidiAudio(connected) {
    const isPlayingRef = useRef(false);
    const audioContext = useRef(null);
    const midiSynthRef = useRef(null);
    const currentMeasure = useRef(0);
    const currentStyleRef = useRef('classic');
    const songEndCallbackRef = useRef(null);
    const currentTrackIndexRef = useRef(0);
    const songLengthRef = useRef(0);
    const schedulerTimerRef = useRef(null);
    const nextNoteTimeRef = useRef(0);
    const scheduledMeasuresRef = useRef(new Set());
    const arrangementRef = useRef([]);

    const SCHEDULE_AHEAD_TIME = 0.2;
    const SCHEDULER_INTERVAL = 50;

    const TRACK_ORDER = [
        'track_01', 'track_02', 'track_03', 'track_04', 'track_05', 'track_06',
        'track_07', 'track_08', 'track_09', 'track_10', 'track_11', 'track_12'
    ];

    // Same TRACK_STYLES but ensure they have melodies mapping
    const TRACK_STYLES = {
        'track_01': { name: 'Classic Synthwave', bpm: 118, key: 'Dm', bassStyle: 'steady', progression: [0], drumStyle: 'basic' },
        'track_02': { name: 'Aggressive Darksynth', bpm: 140, key: 'Em', bassStyle: 'aggressive', progression: [3], drumStyle: 'driving' },
        'track_03': { name: 'Outrun', bpm: 124, key: 'Am', bassStyle: 'syncopated', progression: [2, 5], drumStyle: 'driving' },
        'track_04': { name: 'Dreamwave', bpm: 100, key: 'F', bassStyle: 'slow', progression: [4], drumStyle: 'minimal' },
        'track_05': { name: 'Industrial', bpm: 145, key: 'Bb', bassStyle: 'aggressive', progression: [3], drumStyle: 'driving' },
        'track_06': { name: 'Cyberpunk', bpm: 130, key: 'C', bassStyle: 'funky', progression: [1, 2], drumStyle: 'driving' },
        'track_07': { name: 'Horror Synth', bpm: 90, key: 'Gm', bassStyle: 'slow', progression: [3], drumStyle: 'minimal' },
        'track_08': { name: '80s Pop', bpm: 120, key: 'C', bassStyle: 'steady', progression: [1, 4], drumStyle: 'basic' },
        'track_09': { name: 'Gabber', bpm: 160, key: 'Am', bassStyle: 'relentless', progression: [3], drumStyle: 'driving' },
        'track_10': { name: 'Eurobeat', bpm: 155, key: 'Em', bassStyle: 'funky', progression: [5, 2], drumStyle: 'driving' },
        'track_11': { name: 'Epic Orchestral', bpm: 110, key: 'Dm', bassStyle: 'slow', progression: [0, 4], drumStyle: 'minimal' },
        'track_12': { name: 'Claustrophobic', bpm: 135, key: 'Bb', bassStyle: 'aggressive', progression: [3], drumStyle: 'driving' }
    };

    const NOTE_TO_MIDI = {
        'C2': 36, 'C#2': 37, 'Db2': 37, 'D2': 38, 'D#2': 39, 'Eb2': 39, 'E2': 40, 'F2': 41, 'F#2': 42, 'Gb2': 42, 'G2': 43, 'G#2': 44, 'Ab2': 44, 'A2': 45, 'A#2': 46, 'Bb2': 46, 'B2': 47,
        'C3': 48, 'C#3': 49, 'D3': 50, 'Eb3': 51, 'E3': 52, 'F3': 53, 'F#3': 54, 'G3': 55, 'G#3': 56, 'A3': 57, 'Bb3': 58, 'B3': 59,
        'C4': 60, 'C#4': 61, 'D4': 62, 'Eb4': 63, 'E4': 64, 'F4': 65, 'F#4': 66, 'G4': 67, 'G#4': 68, 'A4': 69, 'Bb4': 70, 'B4': 71,
        'C5': 72, 'C#5': 73, 'D5': 74, 'Eb5': 75, 'E5': 76, 'F5': 77, 'F#5': 78, 'G5': 79, 'G#5': 80, 'A5': 81, 'Bb5': 82, 'B5': 83,
        'C6': 84, 'D6': 86, 'E6': 88, 'F6': 89, 'G6': 91, 'A6': 93
    };

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

    // Helper: Transpose note string up one octave
    const chordUp = (note) => {
        const match = note.match(/([A-G]#?)(\d)/);
        if (!match) return note;
        return match[1] + (parseInt(match[2]) + 1);
    };

    const getMidiNote = (noteName) => {
        const n = NOTE_TO_MIDI[noteName];
        if (!n) return 60;
        return n;
    };

    const PROGRESSIONS = [
        ['Dm', 'Am', 'Bb', 'C'],     // 0
        ['C', 'Am', 'F', 'C'],       // 1
        ['Am', 'F', 'C', 'Gm'],      // 2
        ['Em', 'C', 'Am', 'Em'],     // 3
        ['F', 'C', 'Dm', 'Bb'],      // 4
        ['Am', 'Em', 'F', 'C'],      // 5
        ['Bb', 'Gm', 'Dm', 'Bb'],    // 6
    ];

    // --- COPIED COMPLETE MELODIES ---
    // (A subset due to length, but representing the structure)
    const COMPLETE_MELODIES = {
        'track_01': {
            verse: [
                { bar: 0, step: 0, note: 'A4', duration: 2 }, { bar: 0, step: 2, note: 'C5', duration: 2 }, { bar: 0, step: 4, note: 'D5', duration: 4 },
                { bar: 1, step: 0, note: 'A4', duration: 2 }, { bar: 1, step: 2, note: 'G4', duration: 2 }, { bar: 1, step: 4, note: 'A4', duration: 8 }
            ],
            chorus: [
                { bar: 0, step: 0, note: 'E5', duration: 4 }, { bar: 0, step: 4, note: 'D5', duration: 2 }, { bar: 0, step: 6, note: 'E5', duration: 2 }, { bar: 0, step: 8, note: 'G5', duration: 8 },
                { bar: 1, step: 0, note: 'F5', duration: 4 }, { bar: 1, step: 4, note: 'E5', duration: 2 }, { bar: 1, step: 6, note: 'D5', duration: 2 }, { bar: 1, step: 8, note: 'E5', duration: 8 }
            ]
        }
    };

    const generateArrangement = (bpm) => {
        const arrangement = [];
        for (let i = 0; i < 8; i++) arrangement.push({ section: 0, drumPattern: 'minimal' }); // Intro
        for (let i = 0; i < 16; i++) arrangement.push({ section: 1, drumPattern: 'basic', hasLead: i >= 8 }); // Verse
        for (let i = 0; i < 8; i++) arrangement.push({ section: 2, drumPattern: 'driving', hasLead: true }); // Pre
        for (let i = 0; i < 16; i++) arrangement.push({ section: 3, drumPattern: 'driving', hasLead: true, isChorus: true }); // Chorus
        for (let i = 0; i < 8; i++) arrangement.push({ section: 4, drumPattern: 'minimal', hasLead: true }); // Bridge
        for (let i = 0; i < 16; i++) arrangement.push({ section: 3, drumPattern: 'driving', hasLead: true, isChorus: true }); // Chorus 2
        for (let i = 0; i < 8; i++) arrangement.push({ section: 7, drumPattern: 'minimal' }); // Outro
        return arrangement;
    };

    const getCompleteMelody = (trackId, section, barInPhrase) => {
        // Fallback to track_01 if specific melody not defined in this subset
        const trackMelodies = COMPLETE_MELODIES[trackId] || COMPLETE_MELODIES['track_01'];
        if (!trackMelodies) return [];

        let melodySet = trackMelodies.verse;
        if (section === 3) melodySet = trackMelodies.chorus || trackMelodies.verse;

        const bar = barInPhrase % 4;

        return melodySet.filter(note => note.bar === bar).map(note => ({
            step: note.step,
            note: note.note,
            duration: note.duration
        }));
    };

    const initAudio = useCallback(() => {
        if (midiSynthRef.current) return;
        midiSynthRef.current = new VirtualMidiSynth();

        const initialTrack = TRACK_ORDER[0];
        setMusicStyle(initialTrack);

        isPlayingRef.current = true;
        currentMeasure.current = 0;
        nextNoteTimeRef.current = midiSynthRef.current.ctx.currentTime + 0.1;

        startScheduler();
    }, []);

    const startScheduler = () => {
        if (schedulerTimerRef.current) clearInterval(schedulerTimerRef.current);

        schedulerTimerRef.current = setInterval(() => {
            const ctx = midiSynthRef.current?.ctx;
            if (!ctx) return;

            while (nextNoteTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD_TIME) {
                const measureNum = currentMeasure.current;
                if (!scheduledMeasuresRef.current.has(measureNum)) {
                    scheduledMeasuresRef.current.add(measureNum);
                    scheduleMeasure(measureNum, nextNoteTimeRef.current);
                }

                const bpm = currentStyleRef.current.bpm || 120;
                const secondsPerBeat = 60 / bpm;
                const measureDuration = secondsPerBeat * 4;

                nextNoteTimeRef.current += measureDuration;
                currentMeasure.current++;

                // Check song end
                if (arrangementRef.current && currentMeasure.current >= arrangementRef.current.length) {
                    currentMeasure.current = 0; // Loop or trigger callback
                    if (songEndCallbackRef.current) songEndCallbackRef.current();
                }
            }
        }, SCHEDULER_INTERVAL);
    };

    const scheduleMeasure = (measureNum, startTime) => {
        const style = currentStyleRef.current;
        const bpm = style.bpm;
        const secondsPer16th = (60 / bpm) / 4;

        if (!arrangementRef.current || arrangementRef.current.length === 0) return;

        const sectionData = arrangementRef.current[measureNum % arrangementRef.current.length];
        const { section, drumPattern, hasLead, isChorus } = sectionData;

        // Progression
        const progIndex = (style.progression[0] || 0);
        const progression = PROGRESSIONS[progIndex % PROGRESSIONS.length];
        const chordName = progression[measureNum % 4];
        const chordNotes = CHORDS[chordName] || CHORDS['Dm'];

        // 1. Drums (Channel 9)
        if (drumPattern !== 'minimal' && drumPattern !== 'none') {
            for (let i = 0; i < 16; i++) {
                const time = startTime + i * secondsPer16th;

                // Kick
                if (i % 4 === 0) scheduleMidiEvent(9, 36, 100, time, 0.1);
                else if (drumPattern === 'driving' && i % 2 === 0 && Math.random() > 0.6) scheduleMidiEvent(9, 36, 80, time, 0.1);

                // Snare
                if (i === 4 || i === 12) scheduleMidiEvent(9, 38, 90, time, 0.1);

                // Hats
                if (i % 2 === 0) scheduleMidiEvent(9, 42, 60, time, 0.05);
                if (drumPattern === 'driving' && i % 2 !== 0) scheduleMidiEvent(9, 42, 40, time, 0.05);
            }
        }

        // 2. Bass (Channel 0)
        const bassRoot = getMidiNote(chordNotes[0].replace('3', '2'));
        for (let i = 0; i < 16; i += 2) {
            const time = startTime + i * secondsPer16th;
            if (style.bassStyle === 'steady' || i % 4 === 0) {
                scheduleMidiEvent(0, bassRoot, 85, time, secondsPer16th * 1.5);
            } else if (style.bassStyle === 'aggressive' || style.bassStyle === 'relentless') {
                scheduleMidiEvent(0, bassRoot, 90, time, secondsPer16th);
                if (i % 4 !== 0) scheduleMidiEvent(0, bassRoot + 12, 70, time + secondsPer16th, secondsPer16th);
            }
        }

        // 3. Pads/Chords (Channel 2)
        if (section !== 7) { // No pads in outro? maybe
            chordNotes.forEach(note => {
                scheduleMidiEvent(2, getMidiNote(note), 50, startTime, secondsPer16th * 16);
            });
        }

        // 4. Arps (Channel 3)
        if (hasLead || isChorus) {
            for (let i = 0; i < 16; i++) {
                const time = startTime + i * secondsPer16th;
                const noteName = chordNotes[i % 3];
                let midiNote = getMidiNote(noteName) + 12;
                scheduleMidiEvent(3, midiNote, 60, time, secondsPer16th * 0.8);
            }
        }

        // 5. Lead Melody (Channel 1)
        // Use predefined melodies if available, else procedural
        if (hasLead || isChorus) {
            // Get notes for this bar from track definition
            const trackId = Object.keys(TRACK_STYLES).find(key => TRACK_STYLES[key] === style) || 'track_01';
            const melodyNotes = getCompleteMelody(trackId, section, measureNum);

            if (melodyNotes && melodyNotes.length > 0) {
                melodyNotes.forEach(m => {
                    const time = startTime + m.step * secondsPer16th;
                    const duration = m.duration * secondsPer16th;
                    const midiNote = getMidiNote(m.note);
                    scheduleMidiEvent(1, midiNote, 90, time, duration);
                });
            } else {
                // Fallback procedural
                if (measureNum % 2 === 0) {
                    const leadNote = getMidiNote(chordNotes[0]) + 12;
                    scheduleMidiEvent(1, leadNote, 80, startTime, secondsPer16th * 4);
                }
            }
        }

        // 6. Bells/Plucks (Channel 4/5) for texture
        if (isChorus) {
            scheduleMidiEvent(5, getMidiNote(chordNotes[2]) + 12, 60, startTime, secondsPer16th * 2);
            scheduleMidiEvent(5, getMidiNote(chordNotes[0]) + 24, 50, startTime + secondsPer16th * 8, secondsPer16th * 2);
        }
    };

    const scheduleMidiEvent = (channel, note, velocity, time, duration) => {
        const synth = midiSynthRef.current;
        if (!synth) return;

        const ctx = synth.ctx;
        const now = ctx.currentTime;
        const delay = Math.max(0, time - now);

        setTimeout(() => {
            synth.noteOn(channel, note, velocity);
            setTimeout(() => {
                synth.noteOff(channel, note);
            }, duration * 1000);
        }, delay * 1000);
    };

    const playSfx = useCallback((type) => { midiSynthRef.current?.playSFX(type); }, []);
    const setEngineRpm = useCallback((rpm) => { midiSynthRef.current?.setEngineRpm(rpm); }, []);

    // Updated setMusicStyle to generate arrangement
    const setMusicStyle = useCallback((trackId) => {
        const style = TRACK_STYLES[trackId];
        if (style) {
            currentStyleRef.current = style;
            const newArrangement = generateArrangement(style.bpm);
            arrangementRef.current = newArrangement;
            songLengthRef.current = newArrangement.length;

            // Build active instruments string for debug (optional)
        }
    }, [TRACK_STYLES]); // Added dep

    const getCurrentStyle = useCallback(() => currentStyleRef.current, []);

    return {
        initAudio,
        playSfx,
        setEngineRpm,
        setMusicStyle,
        getCurrentStyle,
        onSongEnd: (cb) => { songEndCallbackRef.current = cb; },
        stopAudio: () => { isPlayingRef.current = false; },
        getSongProgress: () => {
            if (!songLengthRef.current) return 0;
            return currentMeasure.current / songLengthRef.current;
        },
        currentTrack: 'MIDI Track',
        style: currentStyleRef.current?.name,
        TRACK_STYLES
    };
}
