let audioCtx = null;

function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playTone(freq, type, duration, volume = 0.1) {
    if (GameState.isMuted) return;
    if (!audioCtx) initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

const Sound = {
    tap: () => playTone(880, 'sine', 0.1, 0.05),
    start: () => {
        playTone(523.25, 'sine', 0.2, 0.1);
        setTimeout(() => playTone(659.25, 'sine', 0.2, 0.1), 100);
        setTimeout(() => playTone(783.99, 'sine', 0.4, 0.1), 200);
    },
    tick: () => playTone(440, 'square', 0.02, 0.02),
    win: () => {
        playTone(783.99, 'sine', 0.1, 0.1);
        setTimeout(() => playTone(1046.50, 'sine', 0.5, 0.1), 100);
    },
    error: () => {
        playTone(220, 'sawtooth', 0.3, 0.05);
    }
};
