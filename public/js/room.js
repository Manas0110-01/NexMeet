const socket = io('/');
const videoGrid = document.getElementById('videoGrid');
const localVideo = document.getElementById('localVideo');
const localLabel = document.getElementById('localLabel');
const localHandBadge = document.getElementById('localHandBadge');
const localVideoContainer = document.getElementById('localVideoContainer');
const meetingCodeDisplay = document.getElementById('meetingCodeDisplay');
const copyInviteBtn = document.getElementById('copyInviteBtn');
const toastNotification = document.getElementById('toastNotification');
const recordingIndicator = document.getElementById('recordingIndicator');

// Kicked Modal UI
const kickedModal = document.getElementById('kickedModal');
const rejoinMeetingBtn = document.getElementById('rejoinMeetingBtn');
const returnDashboardBtn = document.getElementById('returnDashboardBtn');

// Controls
const micBtn = document.getElementById('micBtn');
const videoBtn = document.getElementById('videoBtn');
const screenShareBtn = document.getElementById('screenShareBtn');
const whiteboardToggleBtn = document.getElementById('whiteboardToggleBtn');
const recordBtn = document.getElementById('recordBtn');
const handBtn = document.getElementById('handBtn');
const reactionToggleBtn = document.getElementById('reactionToggleBtn');
const reactionMenu = document.getElementById('reactionMenu');
const reactionOverlay = document.getElementById('reactionOverlay');
const chatToggleBtn = document.getElementById('chatToggleBtn');
const leaveBtn = document.getElementById('leaveBtn');

// Virtual Effects UI
const effectsToggleBtn = document.getElementById('effectsToggleBtn');
const effectsMenu = document.getElementById('effectsMenu');

// Participants Drawer UI
const participantsToggleBtn = document.getElementById('participantsToggleBtn');
const participantsPanel = document.getElementById('participantsPanel');
const closeParticipantsBtn = document.getElementById('closeParticipantsBtn');
const participantsList = document.getElementById('participantsList');
const participantsCountLabel = document.getElementById('participantsCountLabel');
const panelHeaderCount = document.getElementById('panelHeaderCount');

// Host Moderation UI
const hostControlsWrapper = document.getElementById('hostControlsWrapper');
const hostControlsBtn = document.getElementById('hostControlsBtn');
const hostMenu = document.getElementById('hostMenu');
const muteAllBtn = document.getElementById('muteAllBtn');
const lockRoomBtn = document.getElementById('lockRoomBtn');
const lockBtnText = document.getElementById('lockBtnText');

// Whiteboard UI
const whiteboardContainer = document.getElementById('whiteboardContainer');
const closeWhiteboardBtn = document.getElementById('closeWhiteboardBtn');
const whiteboardCanvas = document.getElementById('whiteboardCanvas');
const wbColorPicker = document.getElementById('wbColorPicker');
const wbLineWidth = document.getElementById('wbLineWidth');
const wbEraserBtn = document.getElementById('wbEraserBtn');
const wbClearBtn = document.getElementById('wbClearBtn');
const wbContext = whiteboardCanvas.getContext('2d');

// Chat UI
const chatPanel = document.getElementById('chatPanel');
const closeChatBtn = document.getElementById('closeChatBtn');
const chatInput = document.getElementById('chatInput');
const sendMsgBtn = document.getElementById('sendMsgBtn');
const chatMessages = document.getElementById('chatMessages');

const roomId = window.location.pathname.split('/')[2];

let userName = localStorage.getItem('nexmeet_username');
if (!userName) {
  userName = prompt('Enter your name to join the meeting:') || `Guest-${Math.floor(Math.random() * 1000)}`;
  localStorage.setItem('nexmeet_username', userName);
}

meetingCodeDisplay.textContent = `Room: ${roomId}`;
localLabel.textContent = `${userName} (You)`;

let localStream = new MediaStream();
let rawCameraStream = null; // Unprocessed hardware stream
let activeEffect = 'none';
let effectCanvas = null;
let effectCtx = null;
let effectAnimId = null;
let processedStream = null;

let peers = {}; // socketId -> RTCPeerConnection
let isScreenSharing = false;
let screenStream = null;
let isHandRaised = false;

let isVideoOn = true;
let isAudioOn = true;
let isUserHost = false;
let isRoomLocked = false;

// Participants Tracking Map: socketId -> { name, isHost, audio, video, hand }
let participants = new Map();

// Recording
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

// Whiteboard
let isDrawing = false;
let isEraser = false;
let lastX = 0;
let lastY = 0;

const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// Copy Invite Link
copyInviteBtn.addEventListener('click', async () => {
  const inviteUrl = window.location.href;
  try {
    await navigator.clipboard.writeText(inviteUrl);
    showToast('Meeting link copied to clipboard!');
  } catch (err) {
    const input = document.createElement('input');
    input.value = inviteUrl;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    showToast('Meeting link copied to clipboard!');
  }
});

function showToast(msg) {
  const toastMsg = document.getElementById('toastMsg');
  if (toastMsg) toastMsg.textContent = msg;
  toastNotification.classList.remove('hidden');
  setTimeout(() => {
    toastNotification.classList.add('hidden');
  }, 2500);
}

async function init() {
  let currentUserId = null;
  try {
    const res = await fetch('/api/me');
    if (res.ok) {
      const data = await res.json();
      if (data.user) currentUserId = data.user.id;
    }
  } catch (e) {}

  try {
    rawCameraStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    
    // Store raw tracks and build localStream
    rawCameraStream.getTracks().forEach((track) => {
      localStream.addTrack(track);
    });

    localVideo.srcObject = localStream;
    attachAudioAnalyzer(localStream, localVideoContainer);
    setupVirtualBackgroundPipeline();
  } catch (err) {
    console.error('Microphone/Camera permission error:', err);
    isVideoOn = false;
    isAudioOn = false;
    updateMediaButtonStates();
  }

  socket.emit('join-room', {
    roomId,
    userName,
    userId: currentUserId,
    isAudioOn,
    isVideoOn
  });

  socket.on('room-locked-error', () => {
    alert('This meeting has been locked by the host.');
    window.location.href = '/';
  });

  socket.on('role-assignment', ({ isHost, isLocked }) => {
    isUserHost = isHost;
    isRoomLocked = isLocked;
    if (isHost) {
      hostControlsWrapper.classList.remove('hidden');
      localLabel.textContent = `${userName} (Host, You)`;
    }
    updateLockBtnUI();
  });

  socket.on('room-lock-status', (locked) => {
    isRoomLocked = locked;
    updateLockBtnUI();
    showToast(locked ? 'Meeting has been locked by the host.' : 'Meeting unlocked.');
  });

  socket.on('force-mute', () => {
    if (isAudioOn) {
      localStream.getAudioTracks().forEach((track) => {
        track.stop();
        localStream.removeTrack(track);
      });
      isAudioOn = false;
      updateMediaButtonStates();
      socket.emit('media-status-change', { audio: false });
      showToast('You were muted by the host.');
    }
  });

  // Handle Being Removed/Kicked
  socket.on('kicked-from-room', () => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    if (rawCameraStream) {
      rawCameraStream.getTracks().forEach((track) => track.stop());
    }
    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
    }
    if (isRecording) {
      stopRecording();
    }
    stopVirtualBackgroundPipeline();

    for (const peerId in peers) {
      peers[peerId].close();
      delete peers[peerId];
    }
    socket.disconnect();
    kickedModal.classList.remove('hidden');
  });

  // Participant Roster Received
  socket.on('participant-roster', (roster) => {
    participants.clear();
    roster.forEach((p) => {
      participants.set(p.id, p);
    });
    renderParticipants();
  });

  socket.on('user-connected', ({ socketId, userName, isHost, audio, video, hand }) => {
    participants.set(socketId, { id: socketId, name: userName, isHost, audio, video, hand });
    renderParticipants();
    showToast(`${userName} ${isHost ? '(Host) ' : ''}joined the meeting`);
  });

  socket.on('participant-left', (socketId) => {
    participants.delete(socketId);
    renderParticipants();
  });

  socket.on('user-media-status-updated', ({ socketId, audio, video }) => {
    const user = participants.get(socketId);
    if (user) {
      if (typeof audio === 'boolean') user.audio = audio;
      if (typeof video === 'boolean') user.video = video;
      renderParticipants();
    }
  });

  socket.on('all-users', (users) => {
    users.forEach((user) => {
      createPeer(user.id, socket.id, user.name);
    });
  });

  socket.on('user-joined-signal', async ({ signal, callerId, callerName }) => {
    const peer = addPeer(signal, callerId, callerName);
    peers[callerId] = peer;
  });

  socket.on('receiving-returned-signal', async ({ signal, id }) => {
    if (peers[id]) {
      await peers[id].setRemoteDescription(new RTCSessionDescription(signal));
    }
  });

  socket.on('ice-candidate', async ({ candidate, from }) => {
    const peer = peers[from];
    if (peer && candidate) {
      try {
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('ICE candidate error', e);
      }
    }
  });

  socket.on('user-disconnected', (socketId) => {
    if (peers[socketId]) {
      peers[socketId].close();
      delete peers[socketId];
    }
    const card = document.getElementById(`video-${socketId}`);
    if (card) card.remove();
  });

  socket.on('create-message', (msgObj) => {
    appendMessage(msgObj);
  });

  socket.on('user-raised-hand', ({ socketId, userName, raised }) => {
    const user = participants.get(socketId);
    if (user) user.hand = raised;
    renderParticipants();

    const card = document.getElementById(`video-${socketId}`);
    if (card) {
      let badge = card.querySelector('.hand-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'hand-badge';
        badge.innerText = '✋ Raised';
        card.appendChild(badge);
      }
      badge.classList.toggle('hidden', !raised);
    }
  });

  socket.on('display-reaction', ({ reaction }) => {
    const elem = document.createElement('div');
    elem.className = 'floating-reaction';
    elem.innerText = reaction;
    reactionOverlay.appendChild(elem);
    setTimeout(() => elem.remove(), 2500);
  });

  socket.on('whiteboard-draw', (drawData) => {
    drawLine(drawData.x0, drawData.y0, drawData.x1, drawData.y1, drawData.color, drawData.size, false);
  });

  socket.on('whiteboard-clear', () => {
    clearCanvas(false);
  });

  setupWhiteboard();
}

// ==========================================
// Virtual Background & Blur Engine
// ==========================================
function setupVirtualBackgroundPipeline() {
  effectCanvas = document.createElement('canvas');
  effectCanvas.width = 640;
  effectCanvas.height = 360;
  effectCtx = effectCanvas.getContext('2d');

  // Hidden source video tag for camera feed processing
  const hiddenCamVideo = document.createElement('video');
  hiddenCamVideo.autoplay = true;
  hiddenCamVideo.muted = true;
  hiddenCamVideo.playsInline = true;
  hiddenCamVideo.srcObject = rawCameraStream;

  function renderLoop() {
    if (!isVideoOn || !rawCameraStream || rawCameraStream.getVideoTracks().length === 0) {
      effectAnimId = requestAnimationFrame(renderLoop);
      return;
    }

    if (activeEffect === 'none') {
      // Direct pass-through
      effectCtx.filter = 'none';
      effectCtx.drawImage(hiddenCamVideo, 0, 0, effectCanvas.width, effectCanvas.height);
    } else if (activeEffect === 'blur') {
      // Background Blur Pipeline
      effectCtx.filter = 'blur(12px)';
      effectCtx.drawImage(hiddenCamVideo, 0, 0, effectCanvas.width, effectCanvas.height);

      // Sharp subject simulation in center
      effectCtx.filter = 'none';
      effectCtx.save();
      effectCtx.beginPath();
      effectCtx.ellipse(effectCanvas.width / 2, effectCanvas.height / 2 + 20, 160, 150, 0, 0, Math.PI * 2);
      effectCtx.clip();
      effectCtx.drawImage(hiddenCamVideo, 0, 0, effectCanvas.width, effectCanvas.height);
      effectCtx.restore();
    } else {
      // Virtual Preset Scenes (Office, Library, Studio, Gradient)
      drawPresetScene(activeEffect);
      
      // Overlay center persona
      effectCtx.filter = 'none';
      effectCtx.save();
      effectCtx.beginPath();
      effectCtx.ellipse(effectCanvas.width / 2, effectCanvas.height / 2 + 30, 150, 140, 0, 0, Math.PI * 2);
      effectCtx.clip();
      effectCtx.drawImage(hiddenCamVideo, 0, 0, effectCanvas.width, effectCanvas.height);
      effectCtx.restore();
    }

    effectAnimId = requestAnimationFrame(renderLoop);
  }

  renderLoop();
}

function drawPresetScene(effectName) {
  const w = effectCanvas.width;
  const h = effectCanvas.height;

  if (effectName === 'office') {
    const grad = effectCtx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#1e272e');
    grad.addColorStop(1, '#485460');
    effectCtx.fillStyle = grad;
    effectCtx.fillRect(0, 0, w, h);
    // Draw office window grid pattern
    effectCtx.strokeStyle = 'rgba(255,255,255,0.08)';
    effectCtx.lineWidth = 3;
    for (let x = 40; x < w; x += 100) effectCtx.strokeRect(x, 20, 80, 200);
  } else if (effectName === 'library') {
    const grad = effectCtx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#2c1e13');
    grad.addColorStop(1, '#110b06');
    effectCtx.fillStyle = grad;
    effectCtx.fillRect(0, 0, w, h);
    // Draw bookshelf rows
    effectCtx.fillStyle = 'rgba(218, 165, 32, 0.15)';
    effectCtx.fillRect(0, 80, w, 10);
    effectCtx.fillRect(0, 180, w, 10);
    effectCtx.fillRect(0, 280, w, 10);
  } else if (effectName === 'gradient') {
    const grad = effectCtx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#0b5cff');
    grad.addColorStop(0.5, '#6a11cb');
    grad.addColorStop(1, '#2575fc');
    effectCtx.fillStyle = grad;
    effectCtx.fillRect(0, 0, w, h);
  } else if (effectName === 'studio') {
    const rad = effectCtx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, 300);
    rad.addColorStop(0, '#3a3a46');
    rad.addColorStop(1, '#0e0e12');
    effectCtx.fillStyle = rad;
    effectCtx.fillRect(0, 0, w, h);
  }
}

function stopVirtualBackgroundPipeline() {
  if (effectAnimId) cancelAnimationFrame(effectAnimId);
}

// Effects Selector
effectsToggleBtn.addEventListener('click', () => {
  effectsMenu.classList.toggle('hidden');
});

document.querySelectorAll('.effect-opt-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.effect-opt-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    activeEffect = btn.getAttribute('data-effect');
    effectsMenu.classList.add('hidden');

    // Switch video stream to the processed canvas output
    if (activeEffect === 'none') {
      const cameraTrack = rawCameraStream?.getVideoTracks()[0];
      if (cameraTrack) {
        localVideo.srcObject = rawCameraStream;
        for (const peerId in peers) {
          const senders = peers[peerId].getSenders();
          const sender = senders.find((s) => s.track && s.track.kind === 'video');
          if (sender) sender.replaceTrack(cameraTrack);
        }
      }
    } else {
      if (!processedStream) {
        processedStream = effectCanvas.captureStream(30);
      }
      const processedTrack = processedStream.getVideoTracks()[0];
      localVideo.srcObject = processedStream;

      for (const peerId in peers) {
        const senders = peers[peerId].getSenders();
        const sender = senders.find((s) => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(processedTrack);
      }
    }
  });
});

// Rejoin and Return Dashboard Actions
rejoinMeetingBtn.addEventListener('click', () => {
  window.location.reload();
});

returnDashboardBtn.addEventListener('click', () => {
  window.location.href = '/dashboard';
});

// Participants Drawer Render Logic
function renderParticipants() {
  participantsList.innerHTML = '';
  const totalCount = participants.size;
  participantsCountLabel.textContent = `People (${totalCount})`;
  panelHeaderCount.textContent = totalCount;

  participants.forEach((user) => {
    const item = document.createElement('div');
    item.className = 'participant-item';

    const isSelf = user.id === socket.id;
    const initial = (user.name || 'G').charAt(0).toUpperCase();

    item.innerHTML = `
      <div class="p-info">
        <div class="p-avatar">${initial}</div>
        <div>
          <span>${user.name}</span>
          ${isSelf ? '<span class="p-tag">You</span>' : ''}
          ${user.isHost ? '<span class="p-tag host-tag">Host</span>' : ''}
        </div>
      </div>
      <div class="p-icons">
        ${user.hand ? '<span class="p-icon-hand" title="Hand Raised">✋</span>' : ''}
        <i class="fa-solid ${user.audio ? 'fa-microphone p-icon-on' : 'fa-microphone-slash p-icon-off'}"></i>
        <i class="fa-solid ${user.video ? 'fa-video p-icon-on' : 'fa-video-slash p-icon-off'}"></i>
        ${
          isUserHost && !isSelf
            ? `<button class="p-kick-btn" title="Remove Participant" data-id="${user.id}">
                 <i class="fa-solid fa-user-xmark"></i>
               </button>`
            : ''
        }
      </div>
    `;

    const kickBtn = item.querySelector('.p-kick-btn');
    if (kickBtn) {
      kickBtn.addEventListener('click', () => {
        if (confirm(`Remove ${user.name} from the meeting?`)) {
          socket.emit('kick-participant', user.id);
        }
      });
    }

    participantsList.appendChild(item);
  });
}

// Drawers Toggle
participantsToggleBtn.addEventListener('click', () => {
  chatPanel.classList.add('hidden');
  participantsPanel.classList.toggle('hidden');
});
closeParticipantsBtn.addEventListener('click', () => {
  participantsPanel.classList.add('hidden');
});

chatToggleBtn.addEventListener('click', () => {
  participantsPanel.classList.add('hidden');
  chatPanel.classList.toggle('hidden');
});
closeChatBtn.addEventListener('click', () => {
  chatPanel.classList.add('hidden');
});

function updateLockBtnUI() {
  if (lockBtnText) {
    lockBtnText.textContent = isRoomLocked ? 'Unlock Room' : 'Lock Room';
  }
}

// Host Controls
hostControlsBtn.addEventListener('click', () => {
  hostMenu.classList.toggle('hidden');
});

muteAllBtn.addEventListener('click', () => {
  socket.emit('host-mute-all');
  hostMenu.classList.add('hidden');
  showToast('Muted all participants.');
});

lockRoomBtn.addEventListener('click', () => {
  socket.emit('toggle-lock-room');
  hostMenu.classList.add('hidden');
});

function createPeer(userToSignal, callerId, peerName) {
  const peer = new RTCPeerConnection(iceServers);
  peers[userToSignal] = peer;

  localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', {
        target: userToSignal,
        candidate: event.candidate
      });
    }
  };

  peer.ontrack = (event) => {
    setupRemoteMedia(userToSignal, peerName, event.streams[0]);
  };

  peer.onnegotiationneeded = async () => {
    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socket.emit('sending-signal', {
        userToSignal,
        callerId,
        signal: peer.localDescription
      });
    } catch (err) {
      console.error(err);
    }
  };

  return peer;
}

function addPeer(incomingSignal, callerId, callerName) {
  const peer = new RTCPeerConnection(iceServers);

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', {
        target: callerId,
        candidate: event.candidate
      });
    }
  };

  peer.ontrack = (event) => {
    setupRemoteMedia(callerId, callerName, event.streams[0]);
  };

  localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));

  peer.setRemoteDescription(new RTCSessionDescription(incomingSignal))
    .then(() => peer.createAnswer())
    .then((answer) => peer.setLocalDescription(answer))
    .then(() => {
      socket.emit('returning-signal', {
        signal: peer.localDescription,
        callerId
      });
    });

  return peer;
}

function setupRemoteMedia(peerId, name, stream) {
  let card = document.getElementById(`video-${peerId}`);
  if (!card) {
    card = document.createElement('div');
    card.className = 'video-card';
    card.id = `video-${peerId}`;

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = stream;

    const label = document.createElement('span');
    label.className = 'user-label';
    label.innerText = name || 'Guest';

    card.appendChild(video);
    card.appendChild(label);

    if (isUserHost) {
      const kickBtn = document.createElement('button');
      kickBtn.className = 'kick-btn';
      kickBtn.innerHTML = '<i class="fa-solid fa-user-xmark"></i> Kick';
      kickBtn.onclick = () => {
        if (confirm(`Remove ${name} from the meeting?`)) {
          socket.emit('kick-participant', peerId);
        }
      };
      card.appendChild(kickBtn);
    }

    videoGrid.appendChild(card);
    attachAudioAnalyzer(stream, card);
  } else {
    card.querySelector('video').srcObject = stream;
  }
}

function updateMediaButtonStates() {
  micBtn.classList.toggle('active', !isAudioOn);
  micBtn.querySelector('span').innerText = isAudioOn ? 'Mute' : 'Unmute';
  micBtn.querySelector('i').className = isAudioOn ? 'fa-solid fa-microphone' : 'fa-solid fa-microphone-slash';

  videoBtn.classList.toggle('active', !isVideoOn);
  videoBtn.querySelector('span').innerText = isVideoOn ? 'Stop Video' : 'Start Video';
  videoBtn.querySelector('i').className = isVideoOn ? 'fa-solid fa-video' : 'fa-solid fa-video-slash';
}

micBtn.addEventListener('click', async () => {
  if (isAudioOn) {
    localStream.getAudioTracks().forEach((track) => {
      track.stop();
      localStream.removeTrack(track);
    });
    isAudioOn = false;
    updateMediaButtonStates();
    socket.emit('media-status-change', { audio: false });
  } else {
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const newAudioTrack = audioStream.getAudioTracks()[0];
      localStream.addTrack(newAudioTrack);

      for (const peerId in peers) {
        const senders = peers[peerId].getSenders();
        const sender = senders.find((s) => s.track && s.track.kind === 'audio');
        if (sender) {
          sender.replaceTrack(newAudioTrack);
        } else {
          peers[peerId].addTrack(newAudioTrack, localStream);
        }
      }

      attachAudioAnalyzer(localStream, localVideoContainer);
      isAudioOn = true;
      updateMediaButtonStates();
      socket.emit('media-status-change', { audio: true });
    } catch (err) {
      console.error('Failed to enable microphone:', err);
      showToast('Could not access microphone.');
    }
  }
});

videoBtn.addEventListener('click', async () => {
  if (isVideoOn) {
    localStream.getVideoTracks().forEach((track) => {
      track.stop();
      localStream.removeTrack(track);
    });
    if (rawCameraStream) {
      rawCameraStream.getVideoTracks().forEach((t) => t.stop());
    }

    localVideo.srcObject = localStream;
    isVideoOn = false;
    updateMediaButtonStates();
    socket.emit('media-status-change', { video: false });

    for (const peerId in peers) {
      const senders = peers[peerId].getSenders();
      const sender = senders.find((s) => s.track && s.track.kind === 'video');
      if (sender) sender.replaceTrack(null);
    }
  } else {
    try {
      rawCameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const newVideoTrack = rawCameraStream.getVideoTracks()[0];
      localStream.addTrack(newVideoTrack);

      localVideo.srcObject = localStream;

      for (const peerId in peers) {
        const senders = peers[peerId].getSenders();
        const sender = senders.find((s) => s.track && s.track.kind === 'video');
        if (sender) {
          sender.replaceTrack(newVideoTrack);
        } else {
          peers[peerId].addTrack(newVideoTrack, localStream);
        }
      }

      isVideoOn = true;
      updateMediaButtonStates();
      socket.emit('media-status-change', { video: true });
    } catch (err) {
      console.error('Failed to enable camera:', err);
      showToast('Could not access camera.');
    }
  }
});

screenShareBtn.addEventListener('click', async () => {
  if (!isScreenSharing) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ cursor: true });
      const screenTrack = screenStream.getVideoTracks()[0];

      for (const peerId in peers) {
        const senders = peers[peerId].getSenders();
        const sender = senders.find((s) => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);
      }

      localVideo.srcObject = screenStream;
      isScreenSharing = true;
      screenShareBtn.classList.add('active');

      screenTrack.onended = stopScreenSharing;
    } catch (err) {
      console.error('Screen sharing canceled/failed', err);
    }
  } else {
    stopScreenSharing();
  }
});

function stopScreenSharing() {
  if (!isScreenSharing) return;
  const currentVideoTrack = (activeEffect !== 'none' && processedStream)
    ? processedStream.getVideoTracks()[0]
    : localStream.getVideoTracks()[0] || null;

  for (const peerId in peers) {
    const senders = peers[peerId].getSenders();
    const sender = senders.find((s) => s.track && s.track.kind === 'video');
    if (sender) sender.replaceTrack(currentVideoTrack);
  }

  localVideo.srcObject = (activeEffect !== 'none' && processedStream) ? processedStream : localStream;
  if (screenStream) {
    screenStream.getTracks().forEach((t) => t.stop());
  }
  isScreenSharing = false;
  screenShareBtn.classList.remove('active');
}

// Whiteboard
function setupWhiteboard() {
  function resizeCanvas() {
    whiteboardCanvas.width = whiteboardContainer.clientWidth;
    whiteboardCanvas.height = whiteboardContainer.clientHeight - 54;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  whiteboardCanvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    const rect = whiteboardCanvas.getBoundingClientRect();
    lastX = e.clientX - rect.left;
    lastY = e.clientY - rect.top;
  });

  whiteboardCanvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const rect = whiteboardCanvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const color = isEraser ? '#121214' : wbColorPicker.value;
    const size = isEraser ? 24 : parseInt(wbLineWidth.value, 10);

    drawLine(lastX, lastY, currentX, currentY, color, size, true);
    lastX = currentX;
    lastY = currentY;
  });

  window.addEventListener('mouseup', () => { isDrawing = false; });

  document.querySelectorAll('.wb-preset-color').forEach((btn) => {
    btn.addEventListener('click', () => {
      wbColorPicker.value = btn.getAttribute('data-color');
      isEraser = false;
      wbEraserBtn.classList.remove('active');
    });
  });

  wbEraserBtn.addEventListener('click', () => {
    isEraser = !isEraser;
    wbEraserBtn.classList.toggle('active', isEraser);
  });

  wbClearBtn.addEventListener('click', () => {
    clearCanvas(true);
  });
}

function drawLine(x0, y0, x1, y1, color, size, emit) {
  wbContext.beginPath();
  wbContext.moveTo(x0, y0);
  wbContext.lineTo(x1, y1);
  wbContext.strokeStyle = color;
  wbContext.lineWidth = size;
  wbContext.lineCap = 'round';
  wbContext.stroke();
  wbContext.closePath();

  if (!emit) return;
  socket.emit('whiteboard-draw', { x0, y0, x1, y1, color, size });
}

function clearCanvas(emit) {
  wbContext.clearRect(0, 0, whiteboardCanvas.width, whiteboardCanvas.height);
  if (emit) {
    socket.emit('whiteboard-clear');
  }
}

whiteboardToggleBtn.addEventListener('click', () => {
  const isHidden = whiteboardContainer.classList.toggle('hidden');
  whiteboardToggleBtn.classList.toggle('active', !isHidden);
  if (!isHidden) {
    whiteboardCanvas.width = whiteboardContainer.clientWidth;
    whiteboardCanvas.height = whiteboardContainer.clientHeight - 54;
  }
});

closeWhiteboardBtn.addEventListener('click', () => {
  whiteboardContainer.classList.add('hidden');
  whiteboardToggleBtn.classList.remove('active');
});

// Meeting Recording
recordBtn.addEventListener('click', async () => {
  if (!isRecording) {
    startRecording();
  } else {
    stopRecording();
  }
});

async function startRecording() {
  recordedChunks = [];
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const destination = audioContext.createMediaStreamDestination();

  if (localStream.getAudioTracks().length > 0) {
    const localAudioSource = audioContext.createMediaStreamSource(localStream);
    localAudioSource.connect(destination);
  }

  document.querySelectorAll('video').forEach((vid) => {
    if (vid !== localVideo && vid.srcObject && vid.srcObject.getAudioTracks().length > 0) {
      try {
        const remoteSource = audioContext.createMediaStreamSource(vid.srcObject);
        remoteSource.connect(destination);
      } catch (e) {}
    }
  });

  const activeVideoTrack = isScreenSharing && screenStream
    ? screenStream.getVideoTracks()[0]
    : (activeEffect !== 'none' && processedStream)
      ? processedStream.getVideoTracks()[0]
      : localStream.getVideoTracks()[0];

  if (!activeVideoTrack) {
    showToast('Cannot record without an active video or screen stream.');
    return;
  }

  const recordStream = new MediaStream();
  recordStream.addTrack(activeVideoTrack);
  destination.stream.getAudioTracks().forEach((track) => recordStream.addTrack(track));

  try {
    const options = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? { mimeType: 'video/webm;codecs=vp9' }
      : { mimeType: 'video/webm' };

    mediaRecorder = new MediaRecorder(recordStream, options);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = saveRecordingFile;
    mediaRecorder.start(1000);
    isRecording = true;

    recordBtn.classList.add('recording');
    recordBtn.querySelector('span').innerText = 'Stop Rec';
    recordingIndicator.classList.remove('hidden');
    showToast('Meeting recording started.');
  } catch (err) {
    console.error('Error starting MediaRecorder:', err);
    showToast('Failed to start recording.');
  }
}

function stopRecording() {
  if (!isRecording || !mediaRecorder) return;
  mediaRecorder.stop();
  isRecording = false;

  recordBtn.classList.remove('recording');
  recordBtn.querySelector('span').innerText = 'Record';
  recordingIndicator.classList.add('hidden');
  showToast('Recording saved. Preparing download...');
}

function saveRecordingFile() {
  if (recordedChunks.length === 0) return;
  const blob = new Blob(recordedChunks, { type: 'video/webm' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = `nexmeet-recording-${roomId}-${Date.now()}.webm`;
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 100);
}

// Hand Raise & Reactions
handBtn.addEventListener('click', () => {
  isHandRaised = !isHandRaised;
  localHandBadge.classList.toggle('hidden', !isHandRaised);
  handBtn.classList.toggle('active', isHandRaised);
  socket.emit('raise-hand', { raised: isHandRaised });
});

reactionToggleBtn.addEventListener('click', () => {
  reactionMenu.classList.toggle('hidden');
});

document.querySelectorAll('.emoji-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const emoji = btn.getAttribute('data-emoji');
    socket.emit('send-reaction', emoji);
    reactionMenu.classList.add('hidden');
  });
});

function attachAudioAnalyzer(stream, containerElement) {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (stream.getAudioTracks().length === 0) return;
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    setInterval(() => {
      if (stream.getAudioTracks().length === 0) {
        containerElement.classList.remove('active-speaker');
        return;
      }
      analyser.getByteFrequencyData(dataArray);
      let values = 0;
      for (let i = 0; i < dataArray.length; i++) values += dataArray[i];
      const average = values / dataArray.length;
      if (average > 25) {
        containerElement.classList.add('active-speaker');
      } else {
        containerElement.classList.remove('active-speaker');
      }
    }, 200);
  } catch (e) {
    console.error('Audio detection error:', e);
  }
}

function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit('send-message', text);
  chatInput.value = '';
}

sendMsgBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage();
});

function appendMessage({ userName, message, time }) {
  const msgEl = document.createElement('div');
  msgEl.className = 'chat-msg';
  msgEl.innerHTML = `
    <div class="sender">${userName} <span class="time">${time}</span></div>
    <div>${message}</div>
  `;
  chatMessages.appendChild(msgEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

leaveBtn.addEventListener('click', () => {
  if (isRecording) {
    stopRecording();
  }
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
  }
  if (rawCameraStream) {
    rawCameraStream.getTracks().forEach((track) => track.stop());
  }
  stopVirtualBackgroundPipeline();
  window.location.href = '/dashboard';
});

init();