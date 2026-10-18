let audioCtx = null;
let noiseNode = null;
let soundMode = localStorage.getItem('span_sound_mode') || 'auto'; // 'auto' | 'on' | 'off'
let isNoisePlaying = false;
let noiseGainNode = null;

function initAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
}

function updateSoundButtonUI() {
  const btn = document.getElementById('soundBtn');
  const label = document.getElementById('soundLabel');
  const icon = document.getElementById('soundIcon');
  if (!btn || !label || !icon) return;

  if (soundMode === 'auto') {
    label.textContent = 'Auto';
    icon.textContent = '🎧';
    btn.classList.add('active');
  } else if (soundMode === 'on') {
    label.textContent = 'On';
    icon.textContent = '🎧';
    btn.classList.add('active');
  } else {
    label.textContent = 'Off';
    icon.textContent = '🔇';
    btn.classList.remove('active');
  }
}

function cycleSoundMode() {
  if (soundMode === 'auto') soundMode = 'on';
  else if (soundMode === 'on') soundMode = 'off';
  else soundMode = 'auto';

  localStorage.setItem('span_sound_mode', soundMode);
  updateSoundButtonUI();

  if (soundMode === 'on') {
    startNoise();
  } else if (soundMode === 'off') {
    stopNoise();
  } else if (soundMode === 'auto') {
    if (typeof isRunning !== 'undefined' && isRunning && (typeof isBreakSession === 'undefined' || !isBreakSession)) {
      startNoise();
    } else {
      stopNoise();
    }
  }
}

function startNoise() {
  initAudio();
  if (!audioCtx) return;

  if (isNoisePlaying && noiseNode) return;

  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }

  try {
    const bufferSize = audioCtx.sampleRate * 2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = data[i];
      data[i] *= 3.5;
    }

    noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = buffer;
    noiseNode.loop = true;
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;

    noiseGainNode = audioCtx.createGain();
    const currTime = audioCtx.currentTime;
    noiseGainNode.gain.setValueAtTime(0, currTime);
    noiseGainNode.gain.linearRampToValueAtTime(0.75, currTime + 0.5);

    noiseNode.connect(filter);
    filter.connect(noiseGainNode);
    noiseGainNode.connect(audioCtx.destination);
    noiseNode.start(0);
    isNoisePlaying = true;
  } catch (err) {
    console.warn('Error starting noise:', err);
  }
}

function stopNoise() {
  if (!isNoisePlaying && !noiseNode) return;
  isNoisePlaying = false;
  if (noiseGainNode && audioCtx) {
    const currTime = audioCtx.currentTime;
    try {
      noiseGainNode.gain.setValueAtTime(noiseGainNode.gain.value, currTime);
      noiseGainNode.gain.linearRampToValueAtTime(0.0001, currTime + 0.4);
    } catch (e) {}
    const nodeToStop = noiseNode;
    setTimeout(() => {
      try {
        if (nodeToStop) {
          nodeToStop.stop();
          nodeToStop.disconnect();
        }
      } catch (e) {}
    }, 450);
  } else if (noiseNode) {
    try {
      noiseNode.stop();
      noiseNode.disconnect();
    } catch (e) {}
  }
  noiseNode = null;
}

function playBell() {
  initAudio();
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(528, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 3);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 3);
  } catch (e) {}
}

let silentKeepaliveSource = null;

function startSilentKeepalive() {
  try {
    initAudio();
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    if (!silentKeepaliveSource && audioCtx) {
      // 1-second silent buffer looping continuously to prevent background tab CPU throttle
      const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
      silentKeepaliveSource = audioCtx.createBufferSource();
      silentKeepaliveSource.buffer = buffer;
      silentKeepaliveSource.loop = true;
      const gain = audioCtx.createGain();
      gain.gain.value = 0.00001;
      silentKeepaliveSource.connect(gain);
      gain.connect(audioCtx.destination);
      silentKeepaliveSource.start(0);
    }
  } catch (e) {}
}

function stopSilentKeepalive() {
  if (silentKeepaliveSource) {
    try {
      silentKeepaliveSource.stop();
      silentKeepaliveSource.disconnect();
    } catch (e) {}
    silentKeepaliveSource = null;
  }
}

// Synchro automatique avec le timer
function handleTimerAudioSync(running, isBreak) {
  if (running) {
    startSilentKeepalive();
  } else {
    stopSilentKeepalive();
  }

  if (soundMode === 'auto') {
    if (running && !isBreak) startNoise();
    else stopNoise();
  } else if (soundMode === 'on') {
    startNoise();
  } else {
    stopNoise();
  }
}

// Déverrouiller le contexte audio lors de la première interaction utilisateur
let audioUnlocked = false;

function unlockAudioOnFirstInteraction() {
  if (audioUnlocked) return;
  initAudio();
  if (audioCtx) {
    try {
      const silentBuffer = audioCtx.createBuffer(1, 1, 22050);
      const source = audioCtx.createBufferSource();
      source.buffer = silentBuffer;
      source.connect(audioCtx.destination);
      source.start(0);
    } catch (e) {}
  }
  audioUnlocked = true;
}

// Écoute le premier clic/touch sur toute la page
document.addEventListener('touchstart', unlockAudioOnFirstInteraction, { once: true, passive: true });
document.addEventListener('click', unlockAudioOnFirstInteraction, { once: true, passive: true });

