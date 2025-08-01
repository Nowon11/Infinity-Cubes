const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static('.'));
app.use(express.json());

// Data storage (in production, use a real database)
let users = {};
let gameData = {};
let currentZone = 'Overworld';
let zoneTimer = 300; // 5 minutes in seconds
let zoneTimerInterval = null;
let connectedClients = new Set();
let chatHistory = []; // Store chat messages
let globalCubes = []; // Store global cubes
let globalCubeId = 1; // Global cube ID counter
let cubeAlerts = []; // Store cube alerts
let isDiamondStorm = false; // Track diamond storm status
let diamondStormTimeout = null; // Track diamond storm timeout
let lastZoneChangeTime = Date.now(); // Track when zone last changed

// Admin validation function
function isAdmin(username) {
  // Only allow admin access for the specific "Admin" user
  // In production, you might want to store admin status in the database
  return username === 'Admin';
}

// Load data from file
function loadData() {
  try {
    if (fs.existsSync('users.json')) {
      users = JSON.parse(fs.readFileSync('users.json', 'utf8'));
    }
    if (fs.existsSync('gameData.json')) {
      gameData = JSON.parse(fs.readFileSync('gameData.json', 'utf8'));
    }
    if (fs.existsSync('chatHistory.json')) {
      chatHistory = JSON.parse(fs.readFileSync('chatHistory.json', 'utf8'));
    }
    if (fs.existsSync('globalCubes.json')) {
      globalCubes = JSON.parse(fs.readFileSync('globalCubes.json', 'utf8'));
    }
    if (fs.existsSync('cubeAlerts.json')) {
      cubeAlerts = JSON.parse(fs.readFileSync('cubeAlerts.json', 'utf8'));
    }
    if (fs.existsSync('zoneState.json')) {
      const zoneState = JSON.parse(fs.readFileSync('zoneState.json', 'utf8'));
      currentZone = zoneState.zone || 'Overworld';
      lastZoneChangeTime = zoneState.lastZoneChangeTime || Date.now();
      
      // Calculate remaining time based on when zone last changed
      const timeSinceChange = Date.now() - lastZoneChangeTime;
      const elapsedSeconds = Math.floor(timeSinceChange / 1000);
      zoneTimer = Math.max(0, 300 - elapsedSeconds); // 5 minutes = 300 seconds
      
      console.log(`Loaded zone state: ${currentZone}, timer: ${zoneTimer}s`);
    }
  } catch (error) {
    console.log('No existing data found, starting fresh');
  }
}

// Save data to file
function saveData() {
  try {
    fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
    fs.writeFileSync('gameData.json', JSON.stringify(gameData, null, 2));
    fs.writeFileSync('chatHistory.json', JSON.stringify(chatHistory, null, 2));
    fs.writeFileSync('globalCubes.json', JSON.stringify(globalCubes, null, 2));
    fs.writeFileSync('cubeAlerts.json', JSON.stringify(cubeAlerts, null, 2));
    
    // Save zone state
    const zoneState = {
      zone: currentZone,
      lastZoneChangeTime: lastZoneChangeTime,
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync('zoneState.json', JSON.stringify(zoneState, null, 2));
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

// Load data on startup
loadData();

// Zone management functions
function startZoneTimer() {
  if (zoneTimerInterval) {
    clearInterval(zoneTimerInterval);
  }
  
  zoneTimerInterval = setInterval(() => {
    zoneTimer--;
    
    // Broadcast timer update to all connected clients
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'zoneTimerUpdate',
          timer: zoneTimer
        }));
      }
    });
    
    if (zoneTimer <= 0) {
      switchToRandomZone();
    }
  }, 1000);
}

function switchToRandomZone() {
  const zones = ['Overworld', 'Cave', 'Volcano', 'Space'];
  const currentIndex = zones.indexOf(currentZone);
  
  // Get a random zone that's different from current
  let randomZone;
  do {
    randomZone = zones[Math.floor(Math.random() * zones.length)];
  } while (randomZone === currentZone && zones.length > 1);
  
  currentZone = randomZone;
  zoneTimer = 300; // Reset timer to 5 minutes
  lastZoneChangeTime = Date.now(); // Update last change time
  
  // Save zone state
  saveData();
  
  // Broadcast zone change to all connected clients
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'zoneChange',
        zone: currentZone,
        timer: zoneTimer
      }));
    }
  });
  
  console.log(`Zone changed to: ${currentZone}`);
}

// Start the zone timer when server starts
startZoneTimer();

// Start keep-alive function
keepServerAlive();

// Keep server alive with periodic requests
function keepServerAlive() {
  // Send a request to ourselves every 5 minutes to keep the server awake
  setInterval(() => {
    const protocol = process.env.NODE_ENV === 'production' ? 'https:' : 'http:';
    const host = process.env.NODE_ENV === 'production' ? process.env.RENDER_EXTERNAL_HOSTNAME : 'localhost:3000';
    
    if (host) {
      const url = `${protocol}//${host}/health`;
      const client = protocol === 'https:' ? https : http;
      
      const req = client.get(url, (res) => {
        if (res.statusCode === 200) {
          console.log('Server keep-alive ping successful');
        }
      });
      
      req.on('error', (error) => {
        console.log('Server keep-alive ping failed:', error.message);
      });
      
      req.setTimeout(5000, () => {
        req.destroy();
        console.log('Server keep-alive ping timeout');
      });
    }
  }, 5 * 60 * 1000); // Every 5 minutes
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    zone: currentZone,
    zoneTimer: zoneTimer
  });
});

// Get current zone and timer
app.get('/zone', (req, res) => {
  res.json({
    zone: currentZone,
    timer: zoneTimer
  });
});

// User registration
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: 'Username must be 3-20 characters' });
  }
  
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  
  if (users[username]) {
    return res.status(400).json({ error: 'Username already exists' });
  }
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    users[username] = {
      password: hashedPassword,
      createdAt: new Date().toISOString()
    };
    
    // Initialize game data for new user
    gameData[username] = {
      points: '0',
      inventory: [],
      spawnRate: 100,
      luck: 100,
      rebirthMultiplier: 1.0,
      luckLevel: 0,
      spawnLevel: 0,
      currentZone: 'Overworld'
    };
    
    saveData();
    res.json({ success: true, message: 'Registration successful!' });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// User login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  const user = users[username];
  if (!user) {
    return res.status(400).json({ error: 'Invalid username or password' });
  }
  
  try {
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }
    
    res.json({ success: true, message: 'Login successful' });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Save game data
app.post('/save', (req, res) => {
  const { username, gameData: userGameData } = req.body;
  
  if (!username || !userGameData) {
    return res.status(400).json({ error: 'Invalid data' });
  }
  
  gameData[username] = userGameData;
  saveData();
  res.json({ success: true });
});

// Load game data
app.post('/load', (req, res) => {
  const { username } = req.body;
  
  if (!username) {
    return res.status(400).json({ error: 'Username required' });
  }
  
  const data = gameData[username] || {
    points: '0',
    inventory: [],
    spawnRate: 100,
    luck: 100,
    rebirthMultiplier: 1.0,
    luckLevel: 0,
    spawnLevel: 0,
    currentZone: 'Overworld'
  };
  
  res.json({ success: true, data });
});

// Get current zone
app.get('/zone', (req, res) => {
  res.json({ zone: currentZone });
});

// Set current zone
app.post('/zone', (req, res) => {
  const { zone } = req.body;
  if (zone) {
    currentZone = zone;
    // Broadcast zone change to all connected clients
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'zoneChange',
          zone: currentZone
        }));
      }
    });
  }
  res.json({ success: true });
});

// Get account info
app.post('/account-info', (req, res) => {
  const { username } = req.body;
  
  if (!username || !users[username]) {
    return res.status(400).json({ error: 'User not found' });
  }
  
  res.json({ 
    success: true, 
    createdAt: users[username].createdAt 
  });
});

// Change password
app.post('/change-password', async (req, res) => {
  const { username, currentPassword, newPassword } = req.body;
  
  if (!username || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'All fields required' });
  }
  
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  
  const user = users[username];
  if (!user) {
    return res.status(400).json({ error: 'User not found' });
  }
  
  try {
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    users[username].password = hashedNewPassword;
    
    saveData();
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Password change failed' });
  }
});

// Delete account
app.post('/delete-account', (req, res) => {
  const { username } = req.body;
  
  if (!username) {
    return res.status(400).json({ error: 'Username required' });
  }
  
  if (!users[username]) {
    return res.status(400).json({ error: 'User not found' });
  }
  
  try {
    delete users[username];
    delete gameData[username];
    saveData();
    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Account deletion failed' });
  }
});

// Get chat history
app.get('/chat-history', (req, res) => {
  res.json({ success: true, messages: chatHistory.slice(-50) }); // Last 50 messages
});

// Get cube alerts
app.get('/cube-alerts', (req, res) => {
  res.json({ success: true, alerts: cubeAlerts.slice(-50) }); // Last 50 alerts
});

// Clear chat history
app.post('/clear-chat', (req, res) => {
  chatHistory = [];
  cubeAlerts = [];
  saveData();
  res.json({ success: true, message: 'Chat history and cube alerts cleared' });
});

// Get global cubes
app.get('/global-cubes', (req, res) => {
  res.json({ success: true, cubes: globalCubes });
});

// Spawn global cube
app.post('/spawn-global-cube', (req, res) => {
  const { rarity, x, y, odds } = req.body;
  
  const globalCube = {
    id: globalCubeId++,
    rarity: rarity,
    x: x,
    y: y,
    timestamp: new Date().toISOString()
  };
  
  globalCubes.push(globalCube);
  
  // Keep only last 50 global cubes
  if (globalCubes.length > 50) {
    globalCubes = globalCubes.slice(-50);
  }
  
  // Broadcast to all clients
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'globalCubeSpawn',
        cube: globalCube
      }));
    }
  });
  
  // Send rare cube alert for global cube spawn
  const globalCubeAlert = {
    username: 'SYSTEM',
    rarity: rarity,
    odds: odds || 1, // Use provided odds, fallback to 1
    timestamp: new Date().toISOString()
  };
  cubeAlerts.push(globalCubeAlert);
  
  // Broadcast rare cube alert
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'rareCube',
        username: globalCubeAlert.username,
        rarity: globalCubeAlert.rarity,
        odds: globalCubeAlert.odds,
        timestamp: globalCubeAlert.timestamp
      }));
    }
  });
  
  saveData();
  res.json({ success: true, cube: globalCube });
});

// Collect global cube
app.post('/collect-global-cube', (req, res) => {
  const { cubeId, username } = req.body;
  
  const cubeIndex = globalCubes.findIndex(cube => cube.id === cubeId);
  if (cubeIndex !== -1) {
    const collectedCube = globalCubes.splice(cubeIndex, 1)[0];
    
    // Broadcast cube collection to all clients
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'globalCubeCollected',
          cubeId: cubeId,
          username: username
        }));
      }
    });
    
    saveData();
    res.json({ success: true, cube: collectedCube });
  } else {
    res.status(404).json({ error: 'Cube not found' });
  }
});

// Admin endpoints
app.post('/admin/spawn-cube', (req, res) => {
  const { username } = req.body;
  
  if (!isAdmin(username)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  // Admin cube spawning logic would go here
  res.json({ success: true, message: 'Admin cube spawned' });
});

app.post('/admin/clear-inventory', (req, res) => {
  const { username } = req.body;
  
  if (!isAdmin(username)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  // Admin inventory clearing logic would go here
  res.json({ success: true, message: 'Inventory cleared' });
});

app.post('/admin/give-points', (req, res) => {
  const { username, amount } = req.body;
  
  if (!isAdmin(username)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  // Admin points giving logic would go here
  res.json({ success: true, message: `Gave ${amount} points` });
});

app.post('/admin/set-zone', (req, res) => {
  const { username, zone } = req.body;
  
  if (!isAdmin(username)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  // Admin zone setting logic would go here
  res.json({ success: true, message: `Zone set to ${zone}` });
});

app.post('/admin/reset-zone-timer', (req, res) => {
  const { username } = req.body;
  
  if (!isAdmin(username)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  // Admin zone timer reset logic would go here
  res.json({ success: true, message: 'Zone timer reset' });
});

app.post('/admin/clear-chat', (req, res) => {
  const { username } = req.body;
  
  if (!isAdmin(username)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  chatHistory = [];
  cubeAlerts = [];
  saveData();
  res.json({ success: true, message: 'Chat and alerts cleared' });
});

app.post('/admin/send-message', (req, res) => {
  const { username, message } = req.body;
  
  if (!isAdmin(username)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  // Admin message sending logic would go here
  res.json({ success: true, message: 'Admin message sent' });
});

app.post('/admin/reset-player', (req, res) => {
  const { username, targetPlayer } = req.body;
  
  if (!isAdmin(username)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  // Admin player reset logic would go here
  res.json({ success: true, message: `Player ${targetPlayer} reset` });
});

app.post('/admin/max-upgrades', (req, res) => {
  const { username } = req.body;
  
  if (!isAdmin(username)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  // Admin max upgrades logic would go here
  res.json({ success: true, message: 'Upgrades maxed' });
});

app.post('/admin/set-spawn-rate', (req, res) => {
  const { username, spawnRate } = req.body;
  
  if (!isAdmin(username)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  // Admin spawn rate setting logic would go here
  res.json({ success: true, message: `Spawn rate set to ${spawnRate}%` });
});

app.post('/admin/debug-spawn', (req, res) => {
  const { username } = req.body;
  
  if (!isAdmin(username)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  // Admin debug spawn logic would go here
  res.json({ success: true, message: 'Debug spawn info' });
});

app.post('/admin/give-points-to-player', (req, res) => {
  const { username, targetPlayer, amount } = req.body;
  
  if (!isAdmin(username)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  // Admin give points to player logic would go here
  res.json({ success: true, message: `Gave ${amount} points to ${targetPlayer}` });
});

app.post('/admin/set-points-for-player', (req, res) => {
  const { username, targetPlayer, amount } = req.body;
  
  if (!isAdmin(username)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  // Admin set points for player logic would go here
  res.json({ success: true, message: `Set ${targetPlayer}'s points to ${amount}` });
});

app.post('/admin/spawn-global-cube', (req, res) => {
  const { username, rarity, x, y, odds } = req.body;
  
  if (!isAdmin(username)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  // Admin global cube spawning logic would go here
  res.json({ success: true, message: `Spawned global ${rarity} cube` });
});

// Admin endpoint to verify admin access
app.post('/admin/verify', (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'Username is required.' });
  }

  if (isAdmin(username)) {
    res.json({ success: true });
  } else {
    res.status(403).json({ error: 'You are not authorized to access admin features.' });
  }
});

// Admin endpoint to delete a user account
app.post('/admin/delete-account', (req, res) => {
  const { username, targetUser } = req.body;

  if (!isAdmin(username)) {
    return res.status(403).json({ error: 'You are not authorized to perform this action.' });
  }

  if (!targetUser) {
    return res.status(400).json({ error: 'Target username is required.' });
  }

  if (!users[targetUser]) {
    return res.status(404).json({ error: 'User not found.' });
  }

  if (targetUser === 'Admin') {
    return res.status(403).json({ error: 'The Admin account cannot be deleted.' });
  }

  // Delete user and their game data
  delete users[targetUser];
  delete gameData[targetUser];
  saveData();

  console.log(`Admin ${username} deleted account ${targetUser}`);
  res.json({ success: true, message: `Successfully deleted account: ${targetUser}` });
});

// Admin endpoint to start a diamond storm
app.post('/admin/start-diamond-storm', (req, res) => {
  const { username } = req.body;
  if (!isAdmin(username)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  // Start the storm globally
  startDiamondStorm();
  
  res.json({ success: true, message: 'Diamond storm started' });
});

// Admin endpoint to give diamonds
app.post('/admin/give-diamonds', (req, res) => {
  const { username, amount } = req.body;
  if (!isAdmin(username)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  // Give diamonds to the admin user
  if (gameData[username]) {
    gameData[username].diamonds = (gameData[username].diamonds || 0) + parseInt(amount);
    saveData();
    res.json({ success: true, message: `Gave ${amount} diamonds` });
  } else {
    res.status(404).json({ error: 'Admin user data not found' });
  }
});

// Start a diamond storm
function startDiamondStorm() {
  if (isDiamondStorm) return;
  
  isDiamondStorm = true;
  
  // Broadcast diamond storm start to all clients
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'diamondStorm',
        status: 'start'
      }));
    }
  });
  
  diamondStormTimeout = setTimeout(() => {
    isDiamondStorm = false;
    
    // Broadcast diamond storm end to all clients
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'diamondStorm',
          status: 'end'
        }));
      }
    });
  }, Math.random() * 30000 + 30000); // 30-60 seconds
}

// WebSocket connection handling
wss.on('connection', (ws) => {
  connectedClients.add(ws);
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'chat':
          // Store chat message
          const chatMessage = {
            username: data.username,
            message: data.message,
            timestamp: new Date().toISOString()
          };
          chatHistory.push(chatMessage);
          
          // Keep only last 100 messages
          if (chatHistory.length > 100) {
            chatHistory = chatHistory.slice(-100);
          }
          
          // Broadcast chat message to all clients
          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'chat',
                username: data.username,
                message: data.message,
                timestamp: chatMessage.timestamp
              }));
            }
          });
          
          saveData();
          break;
          
        case 'rareCube':
          // Save cube alert
          const cubeAlert = {
            username: data.username,
            rarity: data.rarity,
            odds: data.odds,
            timestamp: new Date().toISOString()
          };
          cubeAlerts.push(cubeAlert);
          
          // Keep only last 100 alerts
          if (cubeAlerts.length > 100) {
            cubeAlerts = cubeAlerts.slice(-100);
          }
          
          // Broadcast rare cube alert to all clients
          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'rareCube',
                username: data.username,
                rarity: data.rarity,
                odds: data.odds,
                timestamp: cubeAlert.timestamp
              }));
            }
          });
          
          saveData();
          break;
          
        case 'requestDiamondStorm':
          // Only start a diamond storm if one isn't already active
          if (!isDiamondStorm) {
            startDiamondStorm();
          }
          break;
          
        case 'getZoneInfo':
          // Send current zone and timer to the requesting client
          ws.send(JSON.stringify({
            type: 'zoneInfo',
            zone: currentZone,
            timer: zoneTimer
          }));
          break;
          
        case 'adminSetZone':
          // Admin zone change
          if (data.zone && ['Overworld', 'Cave', 'Volcano', 'Space'].includes(data.zone)) {
            currentZone = data.zone;
            zoneTimer = 300; // Reset timer to 5 minutes
            lastZoneChangeTime = Date.now(); // Update last change time
            
            // Save zone state
            saveData();
            
            // Broadcast zone change to all clients
            wss.clients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'zoneChange',
                  zone: currentZone,
                  timer: zoneTimer
                }));
              }
            });
            
            console.log(`Admin changed zone to: ${currentZone}`);
          }
          break;
          
        case 'adminResetZoneTimer':
          // Admin timer reset
          zoneTimer = 300; // Reset to 5 minutes
          
          // Broadcast timer update to all clients
          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'zoneTimerUpdate',
                timer: zoneTimer
              }));
            }
          });
          
          console.log('Admin reset zone timer');
          break;
          

      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    connectedClients.delete(ws);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 