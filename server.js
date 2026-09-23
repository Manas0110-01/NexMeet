const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidV4 } = require('uuid');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const User = require('./models/User');
const Meeting = require('./models/Meeting');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const JWT_SECRET = 'nexmeet_secret_jwt_key_99887766';
const MONGO_URI = process.env.MONGO_URI;
mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB Compass (Database: nexmeet)'))
  .catch((err) => console.error('MongoDB connection error:', err));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(cookieParser());

function requireAuth(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.redirect('/login.html');

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.clearCookie('token');
    return res.redirect('/login.html');
  }
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Auth Endpoints
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({ name, email, password: hashedPassword });
    await newUser.save();

    const token = jwt.sign({ id: newUser._id, name: newUser.name, email: newUser.email }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });

    res.json({ success: true, user: { id: newUser._id, name: newUser.name, email: newUser.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign({ id: user._id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });

    res.json({ success: true, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.get('/api/me', (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ user: null });
  try {
    const user = jwt.verify(token, JWT_SECRET);
    res.json({ user });
  } catch (err) {
    res.status(401).json({ user: null });
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// Room Creation & Meeting History API
const roomMetadata = {};

app.get('/api/create-room', requireAuth, async (req, res) => {
  try {
    const roomId = uuidV4().slice(0, 8);
    roomMetadata[roomId] = {
      hostUserId: req.user.id,
      hostName: req.user.name,
      locked: false,
      startedAt: new Date()
    };

    // Save session in MongoDB
    const meeting = new Meeting({
      roomId,
      hostUserId: req.user.id,
      hostName: req.user.name,
      startedAt: roomMetadata[roomId].startedAt,
      participants: [{
        name: req.user.name,
        userId: req.user.id,
        joinedAt: roomMetadata[roomId].startedAt
      }]
    });
    await meeting.save();

    res.json({ roomId });
  } catch (err) {
    console.error('Error recording meeting:', err);
    res.status(500).json({ error: 'Failed to initialize meeting' });
  }
});

// Fetch Meeting Analytics & History for Logged-In User
app.get('/api/meetings/history', requireAuth, async (req, res) => {
  try {
    const meetings = await Meeting.find({ hostUserId: req.user.id })
      .sort({ startedAt: -1 })
      .limit(10);

    const totalMeetings = meetings.length;
    let totalSeconds = 0;
    const participantSet = new Set();

    meetings.forEach((m) => {
      totalSeconds += m.durationSeconds || 0;
      (m.participants || []).forEach((p) => {
        if (p.name) participantSet.add(p.name);
      });
    });

    const totalMinutes = Math.round(totalSeconds / 60);

    res.json({
      meetings,
      analytics: {
        totalMeetings,
        totalMinutes,
        uniqueParticipants: participantSet.size
      }
    });
  } catch (err) {
    console.error('Failed to load meeting history:', err);
    res.status(500).json({ error: 'Could not fetch history' });
  }
});

app.get('/room/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// Real-Time Socket Signaling & Session Tracking
const rooms = {};

io.on('connection', (socket) => {
  socket.on('join-room', async ({ roomId, userName, userId, isAudioOn, isVideoOn }) => {
    if (roomMetadata[roomId] && roomMetadata[roomId].locked) {
      const isHost = roomMetadata[roomId].hostUserId === userId;
      if (!isHost) {
        socket.emit('room-locked-error');
        return;
      }
    }

    socket.join(roomId);
    socket.userName = userName || 'Guest';
    socket.roomId = roomId;
    socket.userId = userId;

    const isHost = roomMetadata[roomId] && roomMetadata[roomId].hostUserId === userId;
    socket.isHost = isHost;

    if (!rooms[roomId]) rooms[roomId] = [];

    const participantInfo = {
      id: socket.id,
      name: socket.userName,
      isHost,
      audio: isAudioOn !== false,
      video: isVideoOn !== false,
      hand: false
    };
    rooms[roomId].push(participantInfo);

    // Save joining participant to MongoDB meeting history
    try {
      await Meeting.updateOne(
        { roomId },
        {
          $addToSet: {
            participants: {
              name: socket.userName,
              userId: userId || null,
              joinedAt: new Date()
            }
          }
        }
      );
    } catch (e) {
      console.error('Participant DB update error:', e);
    }

    socket.emit('role-assignment', {
      isHost,
      isLocked: roomMetadata[roomId] ? roomMetadata[roomId].locked : false
    });

    socket.to(roomId).emit('user-connected', {
      socketId: socket.id,
      userName: socket.userName,
      isHost,
      audio: participantInfo.audio,
      video: participantInfo.video,
      hand: false
    });

    socket.emit('participant-roster', rooms[roomId]);
    const existingUsers = rooms[roomId].filter((u) => u.id !== socket.id);
    socket.emit('all-users', existingUsers);

    socket.on('media-status-change', ({ audio, video }) => {
      const user = rooms[roomId]?.find((u) => u.id === socket.id);
      if (user) {
        if (typeof audio === 'boolean') user.audio = audio;
        if (typeof video === 'boolean') user.video = video;
      }
      io.to(roomId).emit('user-media-status-updated', {
        socketId: socket.id,
        audio,
        video
      });
    });

    socket.on('toggle-lock-room', () => {
      if (!socket.isHost) return;
      if (roomMetadata[roomId]) {
        roomMetadata[roomId].locked = !roomMetadata[roomId].locked;
        io.to(roomId).emit('room-lock-status', roomMetadata[roomId].locked);
      }
    });

    socket.on('host-mute-all', () => {
      if (!socket.isHost) return;
      socket.to(roomId).emit('force-mute');
    });

    socket.on('kick-participant', (targetSocketId) => {
      if (!socket.isHost) return;
      io.to(targetSocketId).emit('kicked-from-room');
    });

    socket.on('send-message', (message) => {
      io.to(roomId).emit('create-message', {
        userName: socket.userName,
        message,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    });

    socket.on('raise-hand', (data) => {
      const user = rooms[roomId]?.find((u) => u.id === socket.id);
      if (user) user.hand = data.raised;

      io.to(roomId).emit('user-raised-hand', {
        socketId: socket.id,
        userName: socket.userName,
        raised: data.raised
      });
    });

    socket.on('send-reaction', (reaction) => {
      io.to(roomId).emit('display-reaction', {
        userName: socket.userName,
        reaction
      });
    });

    socket.on('whiteboard-draw', (drawData) => {
      socket.to(roomId).emit('whiteboard-draw', drawData);
    });

    socket.on('whiteboard-clear', () => {
      socket.to(roomId).emit('whiteboard-clear');
    });

    socket.on('sending-signal', (payload) => {
      io.to(payload.userToSignal).emit('user-joined-signal', {
        signal: payload.signal,
        callerId: payload.callerId,
        callerName: socket.userName
      });
    });

    socket.on('returning-signal', (payload) => {
      io.to(payload.callerId).emit('receiving-returned-signal', {
        signal: payload.signal,
        id: socket.id
      });
    });

    socket.on('ice-candidate', (payload) => {
      io.to(payload.target).emit('ice-candidate', {
        candidate: payload.candidate,
        from: socket.id
      });
    });

    socket.on('disconnect', async () => {
      if (rooms[roomId]) {
        rooms[roomId] = rooms[roomId].filter((u) => u.id !== socket.id);

        // When room completely empties, calculate duration and mark as ended in MongoDB
        if (rooms[roomId].length === 0) {
          const endedAt = new Date();
          const startedAt = roomMetadata[roomId]?.startedAt || endedAt;
          const durationSeconds = Math.max(0, Math.round((endedAt - new Date(startedAt)) / 1000));

          try {
            await Meeting.updateOne(
              { roomId },
              { $set: { endedAt, durationSeconds } }
            );
          } catch (e) {
            console.error('Error closing meeting document:', e);
          }

          delete rooms[roomId];
          delete roomMetadata[roomId];
        }
      }
      io.to(roomId).emit('participant-left', socket.id);
      socket.to(roomId).emit('user-disconnected', socket.id);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`NexMeet server listening on http://localhost:${PORT}`);
});