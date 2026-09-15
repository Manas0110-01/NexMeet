const userGreeting = document.getElementById('userGreeting');
const logoutBtn = document.getElementById('logoutBtn');
const newMeetingBtn = document.getElementById('newMeetingBtn');
const joinMeetingBtn = document.getElementById('joinMeetingBtn');
const roomInput = document.getElementById('roomInput');

// Hardware Preview Elements
const dashPreviewVideo = document.getElementById('dashPreviewVideo');
const dashCameraOffPlaceholder = document.getElementById('dashCameraOffPlaceholder');
const dashToggleMicBtn = document.getElementById('dashToggleMicBtn');
const dashToggleCamBtn = document.getElementById('dashToggleCamBtn');
const micMeterFill = document.getElementById('micMeterFill');
const deviceStatusBadge = document.getElementById('deviceStatusBadge');
const recentRoomsList = document.getElementById('recentRoomsList');

// Clock Elements
const dashClock = document.getElementById('dashClock');
const dashDate = document.getElementById('dashDate');

// Analytics Stat Elements
const statTotalMeetings = document.getElementById('statTotalMeetings');
const statTotalMinutes = document.getElementById('statTotalMinutes');
const statUniqueParticipants = document.getElementById('statUniqueParticipants');
const historyTableBody = document.getElementById('historyTableBody');
const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');

let previewStream = new MediaStream();
let isPreviewCamOn = true;
let isPreviewMicOn = true;
let audioContext = null;
let analyser = null;
let animFrameId = null;

// Clock Updater
function updateClock() {
  const now = new Date();
  dashClock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  dashDate.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}
setInterval(updateClock, 1000);
updateClock();

// Authenticate and fetch profile
async function checkAuth() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) {
      window.location.href = '/login.html';
      return;
    }
    const data = await res.json();
    userGreeting.innerHTML = `<i class="fa-solid fa-circle-user"></i> Signed in as <strong>${data.user.name}</strong>`;
    localStorage.setItem('nexmeet_username', data.user.name);
  } catch (err) {
    window.location.href = '/login.html';
  }
}

// Log Out
logoutBtn.addEventListener('click', async () => {
  stopPreviewHardware();
  await fetch('/api/logout', { method: 'POST' });
  localStorage.removeItem('nexmeet_username');
  window.location.href = '/';
});

// Setup Live Hardware Preview & Mic Meter
async function initHardwarePreview() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    
    // Add tracks to our container stream
    stream.getTracks().forEach((track) => {
      previewStream.addTrack(track);
    });

    dashPreviewVideo.srcObject = previewStream;
    deviceStatusBadge.textContent = 'Devices Ready';
    deviceStatusBadge.style.color = '#2ed573';

    startAudioMeter(previewStream);
  } catch (err) {
    console.error('Camera/Mic permission denied:', err);
    deviceStatusBadge.textContent = 'Permission Denied';
    deviceStatusBadge.style.color = '#eb5545';
    dashCameraOffPlaceholder.classList.remove('hidden');
    isPreviewCamOn = false;
    isPreviewMicOn = false;
    updateButtonsUI();
  }
}

function startAudioMeter(stream) {
  if (stream.getAudioTracks().length === 0) return;

  try {
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function updateMeter() {
      if (!isPreviewMicOn || stream.getAudioTracks().length === 0) {
        micMeterFill.style.width = '0%';
      } else {
        analyser.getByteFrequencyData(dataArray);
        let values = 0;
        for (let i = 0; i < dataArray.length; i++) values += dataArray[i];
        const average = values / dataArray.length;
        const percent = Math.min(100, Math.round((average / 100) * 100));
        micMeterFill.style.width = `${percent}%`;
      }
      animFrameId = requestAnimationFrame(updateMeter);
    }
    updateMeter();
  } catch (e) {
    console.error('Audio meter init error:', e);
  }
}

function updateButtonsUI() {
  dashToggleCamBtn.classList.toggle('off', !isPreviewCamOn);
  dashToggleCamBtn.innerHTML = isPreviewCamOn
    ? '<i class="fa-solid fa-video"></i>'
    : '<i class="fa-solid fa-video-slash"></i>';
  dashCameraOffPlaceholder.classList.toggle('hidden', isPreviewCamOn);

  dashToggleMicBtn.classList.toggle('off', !isPreviewMicOn);
  dashToggleMicBtn.innerHTML = isPreviewMicOn
    ? '<i class="fa-solid fa-microphone"></i>'
    : '<i class="fa-solid fa-microphone-slash"></i>';
}

// True Hardware Release: Preview Camera Toggle
dashToggleCamBtn.addEventListener('click', async () => {
  if (isPreviewCamOn) {
    // Stop camera track completely to shut off hardware sensor and LED light
    previewStream.getVideoTracks().forEach((track) => {
      track.stop();
      previewStream.removeTrack(track);
    });
    dashPreviewVideo.srcObject = previewStream;
    isPreviewCamOn = false;
    updateButtonsUI();
    localStorage.setItem('nexmeet_pref_video', 'false');
  } else {
    // Re-acquire camera hardware from OS
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const newVideoTrack = camStream.getVideoTracks()[0];
      previewStream.addTrack(newVideoTrack);
      dashPreviewVideo.srcObject = previewStream;
      isPreviewCamOn = true;
      updateButtonsUI();
      localStorage.setItem('nexmeet_pref_video', 'true');
    } catch (err) {
      console.error('Failed to re-enable camera:', err);
      alert('Unable to access camera device.');
    }
  }
});

// True Hardware Release: Preview Microphone Toggle
dashToggleMicBtn.addEventListener('click', async () => {
  if (isPreviewMicOn) {
    // Stop microphone hardware sensor completely
    previewStream.getAudioTracks().forEach((track) => {
      track.stop();
      previewStream.removeTrack(track);
    });
    isPreviewMicOn = false;
    micMeterFill.style.width = '0%';
    updateButtonsUI();
    localStorage.setItem('nexmeet_pref_audio', 'false');
  } else {
    // Re-acquire microphone device from OS
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const newAudioTrack = micStream.getAudioTracks()[0];
      previewStream.addTrack(newAudioTrack);
      startAudioMeter(previewStream);
      isPreviewMicOn = true;
      updateButtonsUI();
      localStorage.setItem('nexmeet_pref_audio', 'true');
    } catch (err) {
      console.error('Failed to re-enable microphone:', err);
      alert('Unable to access microphone device.');
    }
  }
});

function stopPreviewHardware() {
  if (previewStream) {
    previewStream.getTracks().forEach((t) => t.stop());
  }
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close();
  }
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
  }
}

// Fetch MongoDB Meeting History & Analytics
async function fetchMeetingHistory() {
  try {
    const res = await fetch('/api/meetings/history');
    if (!res.ok) return;
    const data = await res.json();

    statTotalMeetings.textContent = data.analytics.totalMeetings;
    statTotalMinutes.textContent = `${data.analytics.totalMinutes}m`;
    statUniqueParticipants.textContent = data.analytics.uniqueParticipants;

    if (!data.meetings || data.meetings.length === 0) {
      historyTableBody.innerHTML = `
        <tr>
          <td colspan="5" class="table-empty">No meeting sessions recorded in MongoDB yet. Host a meeting to see history here!</td>
        </tr>
      `;
      return;
    }

    historyTableBody.innerHTML = '';
    data.meetings.forEach((m) => {
      const dateStr = new Date(m.startedAt).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const minutes = Math.floor((m.durationSeconds || 0) / 60);
      const seconds = (m.durationSeconds || 0) % 60;
      const durationStr = m.endedAt ? `${minutes}m ${seconds}s` : 'Active / Ongoing';
      const attendeeCount = (m.participants || []).length;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="room-badge">${m.roomId}</span></td>
        <td>${dateStr}</td>
        <td>${durationStr}</td>
        <td>${attendeeCount} Attendee${attendeeCount !== 1 ? 's' : ''}</td>
        <td>
          <button class="rejoin-link-btn" data-room="${m.roomId}">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> Rejoin
          </button>
        </td>
      `;

      tr.querySelector('.rejoin-link-btn').addEventListener('click', () => {
        navigateToRoom(m.roomId);
      });

      historyTableBody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error loading history:', err);
    historyTableBody.innerHTML = `
      <tr>
        <td colspan="5" class="table-empty">Failed to load meeting history from database.</td>
      </tr>
    `;
  }
}

refreshHistoryBtn.addEventListener('click', fetchMeetingHistory);

// Recent Rooms (Local)
function saveRecentRoom(roomId) {
  let recents = JSON.parse(localStorage.getItem('nexmeet_recent_rooms') || '[]');
  recents = recents.filter((id) => id !== roomId);
  recents.unshift(roomId);
  if (recents.length > 4) recents.pop();
  localStorage.setItem('nexmeet_recent_rooms', JSON.stringify(recents));
}

function loadRecentRooms() {
  const recents = JSON.parse(localStorage.getItem('nexmeet_recent_rooms') || '[]');
  if (recents.length === 0) {
    recentRoomsList.innerHTML = '<p class="no-recents">No quick rooms yet.</p>';
    return;
  }
  recentRoomsList.innerHTML = '';
  recents.forEach((roomId) => {
    const item = document.createElement('div');
    item.className = 'recent-room-item';
    item.innerHTML = `
      <span class="recent-room-code">${roomId}</span>
      <button class="recent-rejoin-btn" data-id="${roomId}">Rejoin</button>
    `;
    item.querySelector('.recent-rejoin-btn').addEventListener('click', () => {
      navigateToRoom(roomId);
    });
    recentRoomsList.appendChild(item);
  });
}

function navigateToRoom(roomId) {
  saveRecentRoom(roomId);
  stopPreviewHardware();
  window.location.href = `/room/${roomId}`;
}

newMeetingBtn.addEventListener('click', async () => {
  const res = await fetch('/api/create-room');
  if (res.status === 401) {
    window.location.href = '/login.html';
    return;
  }
  const data = await res.json();
  navigateToRoom(data.roomId);
});

joinMeetingBtn.addEventListener('click', () => {
  const room = roomInput.value.trim();
  if (!room) {
    alert('Please enter a room code.');
    return;
  }
  navigateToRoom(room);
});

roomInput.addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\s+/g, '');
});

checkAuth();
initHardwarePreview();
loadRecentRooms();
fetchMeetingHistory();