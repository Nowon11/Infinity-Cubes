const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

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
let connectedClients = new Set();
let chatHistory = []; // Store chat messages

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
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

// Load data on startup
loadData();

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
    res.json({ success: true, message: 'Registration successful' });
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
          // Broadcast rare cube alert to all clients
          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'rareCube',
                username: data.username,
                rarity: data.rarity,
                odds: data.odds,
                timestamp: new Date().toISOString()
              }));
            }
          });
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