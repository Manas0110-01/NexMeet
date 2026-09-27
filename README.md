NexMeet - Real-Time Video Conferencing Platform
NexMeet is a feature-rich, full-stack video conferencing application built with Node.js, Socket.io, WebRTC, and MongoDB Atlas. It delivers seamless peer-to-peer video and audio communication alongside advanced host moderation tools, collaborative whiteboarding, live reactions, virtual backgrounds, and meeting history analytics.

Live Application: https://nexmeet-1lbd.onrender.com

Key Features
Real-Time P2P Video & Audio: Powered by WebRTC and Socket.io signaling for smooth multi-user communication.

Host & Co-Host Controls: Host moderation tools including muting all participants, locking rooms, promoting co-hosts, and removing/kicking users.

Waiting Room & Security: Optional waiting room settings requiring host approval before participants can join active meetings.

Live Toast Notifications: Real-time pop-up notification banners for user entry, exit, kick events, and role updates.

Collaborative Whiteboard: Interactive drawing canvas with customizable colors, line sizes, eraser tools, and real-time synchronization.

Virtual Backgrounds & Blur: Built-in canvas pipeline supporting background blur and virtual presets (Office, Library, Studio, Gradients).

Meeting Recording: Record meetings locally (combining video and mixed audio streams) and download directly as a webm file.

Hand Raising & Reactions: Raise hands or trigger floating emojis during calls.

Dashboard & History: Secure authentication (JWT and bcrypt) with detailed past meeting histories and analytics tracking.

Tech Stack
Backend: Node.js, Express.js, Socket.io

Database: MongoDB Atlas, Mongoose ODM

Frontend: Vanilla JavaScript, HTML5, CSS3, WebRTC APIs, FontAwesome

Deployment: Render (Linux environment)

Local Development Setup
Clone the repository:

Bash
git clone https://github.com/Manas0110-01/NexMeet.git
cd NexMeet
Install dependencies:

Bash
npm install
Configure Environment Variables:
Create a .env file in the root directory and add your MongoDB Atlas connection string:

Code snippet
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/nexmeet?retryWrites=true&w=majority
PORT=3000
Run the application:

Bash
npm start
Open your browser and navigate to http://localhost:3000.

Project Structure
Plaintext
NexMeet/
├── models/             # Mongoose schemas (User.js, Meeting.js)
├── public/             # Frontend assets
│   ├── css/            # Stylesheets
│   ├── js/             # Client-side logic (room.js, auth, etc.)
│   ├── *.html          # UI Views (index, dashboard, room, login, etc.)
├── server.js           # Main Express & Socket.io server logic
├── package.json        # Project dependencies & scripts
└── README.md           # Project documentation
License
This project is open-source and available under the MIT License.
