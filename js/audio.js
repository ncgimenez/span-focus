let audioCtx = null;
let noiseNode = null;
let soundMode = localStorage.getItem('span_sound_mode') || 'auto'; // 'auto' | 'on' | 'off'
let isNoisePlaying = false;

function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function updateSoundButtonUI() {
  const btn = document.getElementById('soundBtn');
  const label = document.getElementById('soundLabel');
  const icon = document.getElementById('soundIcon');

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
    if (isRunning && !isBreakSession) startNoise();
    else stopNoise();
  }
}

let noiseGainNode = null;

function startNoise() {
  if (isNoisePlaying) return;
  initAudio();
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

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
  // Smooth fade-in over 0.8s
  noiseGainNode.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  noiseGainNode.gain.exponentialRampToValueAtTime(1.0, audioCtx.currentTime + 0.8);

  noiseNode.connect(filter);
  filter.connect(noiseGainNode);
  noiseGainNode.connect(audioCtx.destination);
  noiseNode.start();
  isNoisePlaying = true;
}

function stopNoise() {
  if (!isNoisePlaying || !noiseNode) return;
  isNoisePlaying = false;
  if (noiseGainNode && audioCtx) {
    const currTime = audioCtx.currentTime;
    noiseGainNode.gain.setValueAtTime(Math.max(0.0001, noiseGainNode.gain.value), currTime);
    noiseGainNode.gain.exponentialRampToValueAtTime(0.0001, currTime + 0.6);
    const nodeToStop = noiseNode;
    setTimeout(() => {
      try {
        nodeToStop.stop();
        nodeToStop.disconnect();
      } catch (e) {}
    }, 650);
  } else {
    try {
      noiseNode.stop();
      noiseNode.disconnect();
    } catch (e) {}
  }
  noiseNode = null;
}

function playBell() {
  initAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(528, audioCtx.currentTime);
  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 3);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 3);
}

// Synchro automatique avec le timer
function handleTimerAudioSync(running, isBreak) {
  if (soundMode === 'auto') {
    if (running && !isBreak) startNoise();
    else stopNoise();
  }
}

// Déverrouiller le contexte audio sur iOS Safari lors du premier clic
let audioUnlocked = false;

function unlockAudioOnIOS() {
  if (audioUnlocked) return;
  
  // Si tu utilises la Web Audio API (AudioContext)
  if (typeof audioCtx !== 'undefined' && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  
  // Joue un son silencieux de 1 milliseconde pour autoriser les sons suivants
  const silentBuffer = audioCtx?.createBuffer(1, 1, 22050);
  if (silentBuffer && audioCtx) {
    const source = audioCtx.createBufferSource();
    source.buffer = silentBuffer;
    source.connect(audioCtx.destination);
    source.start(0);
  }

  audioUnlocked = true;
}

// Écoute le premier clic/touch sur toute la page
document.addEventListener('touchstart', unlockAudioOnIOS, { once: true });
document.addEventListener('click', unlockAudioOnIOS, { once: true });

