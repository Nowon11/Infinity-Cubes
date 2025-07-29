// ============================================================================
// MULTIPLAYER SYSTEM
// ============================================================================

let ws = null;
let currentUser = null;
let isGuest = false;
let chatEnabled = true;

// Initialize multiplayer system
function initMultiplayer() {
  // Check if user is logged in
  currentUser = localStorage.getItem('currentUser');
  isGuest = localStorage.getItem('isGuest') === 'true';
  
  if (!currentUser && !isGuest) {
    // Redirect to login if not authenticated
    window.location.href = 'login.html';
    return;
  }
  
  // Connect to WebSocket if not guest
  if (!isGuest) {
    connectWebSocket();
  }
  
  // Load data from server if not guest, otherwise use local storage
  if (!isGuest) {
    loadServerData();
  } else {
    loadGameData();
  }
}

// Connect to WebSocket server
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  ws = new WebSocket(wsUrl);
  
  ws.onopen = function() {
    console.log('Connected to server');
  };
  
  ws.onmessage = function(event) {
    try {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  };
  
  ws.onclose = function() {
    console.log('Disconnected from server');
    // Try to reconnect after 5 seconds
    setTimeout(connectWebSocket, 5000);
  };
  
  ws.onerror = function(error) {
    console.error('WebSocket error:', error);
  };
}

// Handle WebSocket messages
function handleWebSocketMessage(data) {
  switch (data.type) {
    case 'chat':
      addChatMessage(data.username, data.message, data.timestamp);
      break;
      
    case 'rareCube':
      addRareCubeAlert(data.username, data.rarity, data.odds);
      break;
      
    case 'zoneChange':
      if (data.zone !== currentZone) {
        currentZone = data.zone;
        updateZoneDisplay();
        // Clear spawn area when zone changes
        const spawnArea = document.getElementById('spawnArea');
        if (spawnArea) {
          spawnArea.innerHTML = '';
        }
      }
      break;
  }
}

// Load chat history
async function loadChatHistory() {
  if (isGuest) return;
  
  try {
    const response = await fetch('/chat-history');
    const data = await response.json();
    
    if (data.success) {
      const chatMessages = document.getElementById('chatMessages');
      if (chatMessages) {
        data.messages.forEach(msg => {
          addChatMessage(msg.username, msg.message, msg.timestamp, false);
        });
      }
    }
  } catch (error) {
    console.error('Failed to load chat history:', error);
  }
}

// Load data from server
async function loadServerData() {
  try {
    const response = await fetch('/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Load server data
      points = BigInt(data.data.points || '0');
      inventory = data.data.inventory || [];
      spawnRate = data.data.spawnRate || 100;
      luck = data.data.luck || 100;
      rebirthMultiplier = data.data.rebirthMultiplier || 1.0;
      luckLevel = data.data.luckLevel || 0;
      spawnLevel = data.data.spawnLevel || 0;
      nextCubeId = data.data.nextCubeId || 1;
      maxCubesOnScreen = data.data.maxCubesOnScreen || 20;
      currentZone = data.data.currentZone || 'Overworld';
      zoneTimer = data.data.zoneTimer || 300;
      
      updateDisplays();
      updateZoneDisplay();
      updateZoneTimerDisplay();
      renderInventory();
    }
  } catch (error) {
    console.error('Failed to load server data:', error);
    // Fallback to local storage
    loadGameData();
  }
}

// Save data to server
async function saveServerData() {
  if (isGuest) return;
  
  try {
    const gameData = {
      points: points.toString(),
      inventory: inventory,
      spawnRate: spawnRate,
      luck: luck,
      rebirthMultiplier: rebirthMultiplier,
      luckLevel: luckLevel,
      spawnLevel: spawnLevel,
      nextCubeId: nextCubeId,
      maxCubesOnScreen: maxCubesOnScreen,
      currentZone: currentZone,
      zoneTimer: zoneTimer
    };
    
    await fetch('/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser, gameData: gameData })
    });
  } catch (error) {
    console.error('Failed to save server data:', error);
  }
}

// Chat functions
function toggleChat() {
  const chatContainer = document.querySelector('.chat-container');
  const chatMessages = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const toggleBtn = document.querySelector('.chat-toggle');
  
  if (chatEnabled) {
    chatContainer.style.height = '50px';
    chatMessages.style.display = 'none';
    chatInput.style.display = 'none';
    toggleBtn.textContent = '+';
    chatEnabled = false;
  } else {
    chatContainer.style.height = '400px';
    chatMessages.style.display = 'flex';
    chatInput.style.display = 'block';
    toggleBtn.textContent = '−';
    chatEnabled = true;
  }
}

function sendChat() {
  const chatInput = document.getElementById('chatInput');
  const message = chatInput.value.trim();
  
  if (!message || isGuest) return;
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'chat',
      username: currentUser,
      message: message
    }));
  }
  
  chatInput.value = '';
}

function addChatMessage(username, message, timestamp, scrollToBottom = true) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;
  
  const messageEl = document.createElement('div');
  messageEl.className = 'chat-message';
  
  const time = new Date(timestamp).toLocaleTimeString();
  
  messageEl.innerHTML = `
    <span class="username">${username}</span>
    <span class="timestamp">${time}</span>
    <div class="content">${message}</div>
  `;
  
  chatMessages.appendChild(messageEl);
  
  if (scrollToBottom) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

function addRareCubeAlert(username, rarity, odds) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;
  
  const messageEl = document.createElement('div');
  messageEl.className = 'chat-message chat-alert';
  
  const time = new Date().toLocaleTimeString();
  
  messageEl.innerHTML = `
    <span class="username">${username}</span>
    <span class="timestamp">${time}</span>
    <div class="content">just got ${rarity}! (1 in ${odds})</div>
  `;
  
  chatMessages.appendChild(messageEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Logout function
function logout() {
  localStorage.removeItem('currentUser');
  localStorage.removeItem('isGuest');
  window.location.href = 'login.html';
}

// ============================================================================
// ZONE CONFIGURATION - EDIT HERE TO ADD NEW ZONES
// ============================================================================

// Zone definitions with available cubes and their odds
const zones = {
  "Overworld": {
    name: "Overworld",
    color: "#4CAF50",
    availableCubes: ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythical", "Godly"]
  },
  "Cave": {
    name: "Cave", 
    color: "#795548",
    availableCubes: ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythical", "Godly"]
  },
  "Volcano": {
    name: "Volcano",
    color: "#FF5722", 
    availableCubes: ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythical", "Godly"]
  },
  "Space": {
    name: "Space",
    color: "#9C27B0",
    availableCubes: ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythical", "Godly"]
  }
};

// ============================================================================
// CUBE CONFIGURATION - EDIT HERE TO ADD NEW CUBES
// ============================================================================

// Rarity definitions with odds and values
// To add a new cube: add it here, then add it to rarityOrder in assignRarity()
// Effects: "none", "glow", "mist" - Colors: any CSS color name or hex code
const rarities = {
  "Common": { odds: 25, value: 1, size: 60, color: "gray", effect: "none" },
  "Uncommon": { odds: 75, value: 5, size: 70, color: "green", effect: "none" },
  "Rare": { odds: 200, value: 25, size: 80, color: "blue", effect: "none" },
  "Epic": { odds: 750, value: 100, size: 90, color: "purple", effect: "none" },
  "Legendary": { odds: 1750, value: 200, size: 100, color: "yellow", effect: "glow" },
  "Mythical": { odds: 3000, value: 300, size: 110, color: "red", effect: "glow" },
  "Godly": { odds: 5000, value: 500, size: 120, color: "white", effect: "glow" }
  
  // Add your new cube here! Example:
  // "Super": { odds: 10000, value: 1000, size: 130, color: "cyan", effect: "glow" }
};

// Upgrade Config - EDIT HERE TO CHANGE UPGRADE SCALING
const upgradeConfig = {
  luck: {
    baseCost: 1000n,
    costMultiplier: 1.8,
    increase: 10, // +10%
  },
  spawn: {
    baseCost: 2000n,
    costMultiplier: 2.0,
    increase: 20, // +20%
  }
};

// ============================================================================
// GAME VARIABLES
// ============================================================================

let points = 0n;
let inventory = []; // Array of cube objects
let spawnRate = 100; // percentage (increased from 100)
let luck = 100; // percentage
let rebirthMultiplier = 1.0; // rebirth multiplier
let nextCubeId = 1;
let maxCubesOnScreen = 20; // maximum cubes that can be on screen at once
let currentZone = "Overworld"; // current active zone
let zoneTimer = 300; // 5 minutes in seconds
let zoneTimerInterval = null; // interval for zone timer

// Sound system
let soundsEnabled = true;
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
let audioElements = {}; // Cache for audio elements

// Current upgrade levels
let luckLevel = 0;
let spawnLevel = 0;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Helper function to abbreviate large BigInt numbers
function abbreviateBigInt(value) {
  const suffixes = ["", " K", " M", " B", " T", " Qa", " Qi", " Sx", " Sp", " Oc", " No", " Dc", " Ud", " Dd", " Td", " Qd", " Qn", " Sxd", " Spd", " Ocd", " Nod", " Dcd"];
  let str = value.toString();
  const len = str.length;
  if (len <= 3) return str;
  let tier = Math.floor((len - 1) / 3);
  if (tier >= suffixes.length) tier = suffixes.length - 1;
  const digitsBeforeDecimal = len - tier * 3;
  const mainPart = str.slice(0, digitsBeforeDecimal);
  let decimalPart = "";
  if (digitsBeforeDecimal < 3) {
    decimalPart = "." + str.slice(digitsBeforeDecimal, digitsBeforeDecimal + 1);
  }
  return mainPart + decimalPart + suffixes[tier];
}

// Assign rarity based on luck and current zone
// IMPORTANT: When adding a new cube, add it to this array in order of rarity (best first)
function assignRarity() {
  const zone = zones[currentZone];
  const availableCubes = zone.availableCubes;
  
  // Create rarity order based on available cubes in current zone
  const rarityOrder = availableCubes.sort((a, b) => {
    // Sort by odds (lower odds = rarer = better)
    return rarities[a].odds - rarities[b].odds;
  });
  
  while (true) {
    for (let rarity of rarityOrder) {
      const odds = rarities[rarity].odds;
      if (Math.random() < (luck / 100) / odds) {
        return rarity;
      }
    }
  }
}

// Create a cube element
function createCubeElement(cube, isInventory = false) {
  const cubeEl = document.createElement('div');
  cubeEl.classList.add('cube');
  cubeEl.setAttribute('data-id', cube.id);
  cubeEl.setAttribute('data-rarity', cube.rarity);
  
  const rarity = rarities[cube.rarity];
  const size = rarity.size;
  
  cubeEl.style.width = `${size}px`;
  cubeEl.style.height = `${size}px`;
  
  // Create faces
  for (let i = 0; i < 6; i++) {
    const face = document.createElement('div');
    face.classList.add('face');
    face.style.backgroundColor = rarity.color;
    
    // Position faces based on cube size
    const halfSize = size / 2;
    if (i === 0) face.style.transform = `translateZ(${halfSize}px)`;
    else if (i === 1) face.style.transform = `translateZ(-${halfSize}px)`;
    else if (i === 2) face.style.transform = `rotateX(90deg) translateZ(${halfSize}px)`;
    else if (i === 3) face.style.transform = `rotateX(-90deg) translateZ(${halfSize}px)`;
    else if (i === 4) face.style.transform = `rotateY(-90deg) translateZ(${halfSize}px)`;
    else if (i === 5) face.style.transform = `rotateY(90deg) translateZ(${halfSize}px)`;
    
    // Apply glow effect to individual faces
    if (rarity.effect === "glow") {
      face.style.boxShadow = `0 0 30px ${rarity.color}`;
    }
    // "none" effect means no special styling
    
    cubeEl.appendChild(face);
  }
  
  // Add event listeners
  if (isInventory) {
    // Inventory cube events - use mousedown for dragging, no click event
    cubeEl.addEventListener('mousedown', startDrag);
    cubeEl.addEventListener('mouseenter', showTooltip);
    cubeEl.addEventListener('mousemove', updateTooltip);
    cubeEl.addEventListener('mouseleave', hideTooltip);
  } else {
    // Spawn area cube events
    cubeEl.addEventListener('click', () => collectCube(cube.id));
    cubeEl.addEventListener('mouseenter', showTooltip);
    cubeEl.addEventListener('mousemove', updateTooltip);
    cubeEl.addEventListener('mouseleave', hideTooltip);
  }
  
  return cubeEl;
}

// Show tooltip
function showTooltip(event) {
  const cube = event.target.closest('.cube');
  if (!cube) return;
  
  const rarity = cube.getAttribute('data-rarity');
  const rarityData = rarities[rarity];
  const value = BigInt(rarityData.value) * BigInt(Math.floor(rebirthMultiplier * 100)) / 100n;
  
  const tooltip = document.getElementById('tooltip');
  tooltip.innerHTML = `
    <div style="color: ${rarityData.color}; font-weight: bold;">${rarity}</div>
    <div>1 in ${rarityData.odds}</div>
    <div>Worth: ${abbreviateBigInt(value)}</div>
  `;
  
  tooltip.style.display = 'block';
  updateTooltip(event);
}

// Update tooltip position
function updateTooltip(event) {
  const tooltip = document.getElementById('tooltip');
  if (tooltip.style.display === 'block') {
    // Position tooltip next to mouse
    const x = event.clientX + 10;
    const y = event.clientY - 10;
    
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  }
}

// Hide tooltip
function hideTooltip() {
  const tooltip = document.getElementById('tooltip');
  tooltip.style.display = 'none';
}

// Collect cube from spawn area
function collectCube(cubeId) {
  const cubeEl = document.querySelector(`[data-id="${cubeId}"]`);
  if (!cubeEl) return;
  
  // Hide tooltip when collecting
  hideTooltip();
  
  const rarity = cubeEl.getAttribute('data-rarity');
  const rarityData = rarities[rarity];
  const value = BigInt(rarityData.value) * BigInt(Math.floor(rebirthMultiplier * 100)) / 100n;
  
  points += value;
  updatePointsDisplay();
  
  // Add to inventory with full screen positioning
  const cubeSize = rarities[rarity].size;
  let x = Math.random() * (window.innerWidth - cubeSize);
  let y = Math.random() * (window.innerHeight - cubeSize);
  
  const cube = {
    id: nextCubeId++,
    rarity: rarity,
    x: x,
    y: y
  };
  inventory.push(cube);
  
  // Remove from spawn area
  cubeEl.remove();
  
  // Send rare cube alert if rarity is 1 in 5000 or higher
  if (rarityData.odds >= 5000 && !isGuest && ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'rareCube',
      username: currentUser,
      rarity: rarity,
      odds: rarityData.odds
    }));
  }
  
  // Save data (server or local)
  if (isGuest) {
    saveGameData();
  } else {
    saveServerData();
  }
}

// Trash cube from inventory
function trashCube(cubeId) {
  // Hide tooltip when trashing
  hideTooltip();
  
  const confirmTrash = confirm('Are you sure you want to trash this cube?');
  if (!confirmTrash) return;
  
  inventory = inventory.filter(c => c.id !== cubeId);
  
  // Remove from inventory display
  const cubeEl = document.querySelector(`[data-id="${cubeId}"]`);
  if (cubeEl) cubeEl.remove();
  
  // Play click sound when trashing
  playClickSound();
  
  // Save data (server or local)
  if (isGuest) {
  saveGameData();
  } else {
    saveServerData();
  }
}

// Start dragging inventory cube
function startDrag(event) {
  const cube = event.target.closest('.cube');
  if (!cube) return;
  
  let isDragging = false;
  let startX, startY;
  let hasMoved = false;
  
  // Prevent the click event from firing
  event.preventDefault();
  event.stopPropagation();
  
  const onMouseMove = (e) => {
    if (!isDragging) {
      isDragging = true;
      startX = e.clientX - cube.offsetLeft;
      startY = e.clientY - cube.offsetTop;
    }
    
    // Calculate new position
    let newX = e.clientX - startX;
    let newY = e.clientY - startY;
    
    // Get cube size for boundary calculations
    const cubeSize = parseInt(cube.style.width) || 60;
    
    // Constrain to screen edges only
    newX = Math.max(0, Math.min(newX, window.innerWidth - cubeSize));
    newY = Math.max(0, Math.min(newY, window.innerHeight - cubeSize));
    
    cube.style.left = newX + 'px';
    cube.style.top = newY + 'px';
    hasMoved = true;
  };
  
  const onMouseUp = (e) => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    
    // If we moved significantly, don't trash
    if (hasMoved) {
      e.preventDefault();
      e.stopPropagation();
    } else {
      // If we didn't move, it was a click - trash the cube
      const cubeId = cube.getAttribute('data-id');
      if (cubeId) {
        trashCube(cubeId);
      }
    }
  };
  
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

// Spawn a cube in the spawn area
function spawnCube() {
  const spawnArea = document.getElementById('spawnArea');
  if (!spawnArea) return;
  
  // Check if we need to remove the oldest cube
  const existingCubes = spawnArea.querySelectorAll('.cube');
  if (existingCubes.length >= maxCubesOnScreen) {
    // Remove the oldest cube (first one in the DOM)
    const oldestCube = existingCubes[0];
    oldestCube.remove();
  }
  
  const rarity = assignRarity();
  
  // Generate position, avoiding upgrades panel
  let x, y;
  let attempts = 0;
  const maxAttempts = 50;
  
  do {
    x = Math.random() * (window.innerWidth - 50); // Use almost full screen
    y = Math.random() * (window.innerHeight - 50); // Use almost full screen
    attempts++;
  } while (isInUpgradesArea(x, y) && attempts < maxAttempts);
  
  const cube = {
    id: nextCubeId++,
    rarity: rarity,
    x: x,
    y: y
  };
  
  const cubeEl = createCubeElement(cube, false);
  cubeEl.style.position = 'absolute';
  cubeEl.style.left = cube.x + 'px';
  cubeEl.style.top = cube.y + 'px';
  
  spawnArea.appendChild(cubeEl);
  
  // Play spawn sound based on rarity
  playRaritySound(rarity);
}

// Check if position is in upgrades area
function isInUpgradesArea(x, y) {
  // Approximate upgrades panel area (bottom right)
  const panelWidth = 350;
  const panelHeight = 200;
  const panelX = window.innerWidth - panelWidth - 20;
  const panelY = window.innerHeight - panelHeight - 20;
  
  return x >= panelX && x <= panelX + panelWidth && 
         y >= panelY && y <= panelY + panelHeight;
}

// Start cube spawning
function startSpawning() {
  const baseInterval = 3000; // 3 seconds base
  const interval = baseInterval / (spawnRate / 100);
  
  setInterval(spawnCube, interval);
}

// Switch upgrade tabs
function switchTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.tab-panel').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Remove active class from all buttons
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Show selected tab
  document.getElementById(tabName + '-tab').classList.add('active');
  event.target.classList.add('active');
}

// Switch index tabs
function switchIndexTab(tabName) {
  // Hide all index tabs
  document.querySelectorAll('.index-tab-panel').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Remove active class from all index buttons
  document.querySelectorAll('.index-tab-button').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Show selected tab
  document.getElementById(tabName + '-tab').classList.add('active');
  event.target.classList.add('active');
  
  // Render the appropriate content
  if (tabName === 'all-cubes') {
    renderAllCubes();
  } else {
    renderZoneCubes(tabName);
  }
}

// Switch zones (now only used internally)
async function switchZone(zoneName) {
  if (zones[zoneName]) {
    currentZone = zoneName;
    updateZoneDisplay();
    
    // Clear spawn area when switching zones
    const spawnArea = document.getElementById('spawnArea');
    if (spawnArea) {
      spawnArea.innerHTML = '';
    }
    
    // Update server zone if not guest
    if (!isGuest) {
      try {
        await fetch('/zone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ zone: zoneName })
        });
      } catch (error) {
        console.error('Failed to update server zone:', error);
      }
    }
    
    // Save data (server or local)
    if (isGuest) {
      saveGameData();
    } else {
      saveServerData();
    }
  }
}

// Switch to random zone
function switchToRandomZone() {
  const zoneNames = Object.keys(zones);
  const currentIndex = zoneNames.indexOf(currentZone);
  
  // Get a random zone that's different from current
  let randomZone;
  do {
    randomZone = zoneNames[Math.floor(Math.random() * zoneNames.length)];
  } while (randomZone === currentZone && zoneNames.length > 1);
  
  switchZone(randomZone);
  resetZoneTimer();
}

// Start zone timer
function startZoneTimer() {
  if (zoneTimerInterval) {
    clearInterval(zoneTimerInterval);
  }
  
  zoneTimerInterval = setInterval(() => {
    zoneTimer--;
    updateZoneTimerDisplay();
    
    if (zoneTimer <= 0) {
      switchToRandomZone();
    }
  }, 1000);
}

// Reset zone timer to 5 minutes
function resetZoneTimer() {
  zoneTimer = 300; // 5 minutes
  updateZoneTimerDisplay();
}

// Update zone timer display
function updateZoneTimerDisplay() {
  const timerDisplay = document.getElementById('zoneTimerDisplay');
  if (timerDisplay) {
    const minutes = Math.floor(zoneTimer / 60);
    const seconds = zoneTimer % 60;
    timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}

// Update zone display
function updateZoneDisplay() {
  const zoneDisplay = document.getElementById('zoneDisplay');
  if (zoneDisplay) {
    const zone = zones[currentZone];
    zoneDisplay.innerHTML = `
      <div class="zone-info">
        <div class="zone-name" style="color: ${zone.color}">${zone.name}</div>
      </div>
    `;
  }
}

// Get the current cost of an upgrade
function getUpgradeCost(type) {
  const config = upgradeConfig[type];
  const level = type === 'luck' ? luckLevel : spawnLevel;
  const cost = config.baseCost * BigInt(Math.floor(Math.pow(config.costMultiplier, level)));
  return cost;
}

// Universal upgrade function
function buyUpgrade(type) {
  const config = upgradeConfig[type];
  const cost = getUpgradeCost(type);
  
  if (points < cost) return;
  
  points -= cost;
  
  if (type === 'luck') {
    luck += config.increase;
    luckLevel++;
  } else if (type === 'spawn') {
    spawnRate += config.increase;
    spawnLevel++;
  }
  
  playClickSound();
  updateDisplays();
  
  // Save data (server or local)
  if (isGuest) {
    saveGameData();
  } else {
    saveServerData();
  }
}

// Rebirth function
function rebirth() {
  if (points < 100000n || inventory.length === 0) {
    alert('You need at least 100k points and at least one cube to rebirth!');
    return;
  }
  
  const confirmRebirth = confirm('Are you sure you want to rebirth? This will remove all your cubes and 100k points, but give you a permanent 2x multiplier!');
  if (!confirmRebirth) return;
  
  points -= 100000n;
  inventory = [];
  rebirthMultiplier += 1.0;
  
  // Play boom sound for rebirth
  playAudioFile('boom.mp3', 1.0);
  
  // Clear inventory display
  const container = document.getElementById('inventoryContainer');
  if (container) container.innerHTML = '';
  
  updateDisplays();
  
  // Save data (server or local)
  if (isGuest) {
    saveGameData();
  } else {
    saveServerData();
  }
}

// Sound functions
function playAudioFile(filename, volume = 1.0) {
  console.log(`playAudioFile called with ${filename} at volume ${volume}`);
  if (!soundsEnabled || !filename) {
    console.log('Sounds disabled or no filename');
    return;
  }
  
  // Scale volume: 1.0 = normal volume, 0.0 = silent
  const scaledVolume = Math.min(Math.max(volume, 0.0), 1.0);
  
  if (audioElements[filename]) {
    console.log(`Using cached audio element for ${filename}`);
    const audio = audioElements[filename];
    audio.volume = scaledVolume;
    audio.currentTime = 0;
    audio.play().catch(error => {
      console.log(`Failed to play ${filename}:`, error);
    });
  } else {
    console.log(`Loading audio file: ${filename}`);
    const audio = new Audio(`sounds/${filename}`);
    audio.volume = scaledVolume;
    
    audio.addEventListener('canplaythrough', () => {
      console.log(`Successfully loaded ${filename}`);
      audioElements[filename] = audio;
      audio.play().catch(error => {
        console.log(`Failed to play ${filename}:`, error);
      });
    });
    
    audio.addEventListener('error', (error) => {
      console.log(`Failed to load audio file ${filename}:`, error);
    });
  }
}

function playFallbackSound() {
  // No fallback sound - just return silently
  return;
}

function playClickSound() {
  if (clickSound.sound === "none") {
    return; // No sound
  }
  const soundInfo = sounds[clickSound.sound];
  if (soundInfo && soundInfo.file !== null) {
    playAudioFile(soundInfo.file, clickSound.volume);
  }
}

function playRaritySound(rarity) {
  console.log(`Attempting to play sound for ${rarity}`);
  const soundConfig = raritySounds[rarity];
  console.log('Sound config:', soundConfig);
  
  if (soundConfig && soundConfig.sound !== "none") {
    const soundInfo = sounds[soundConfig.sound];
    console.log('Sound info:', soundInfo);
    
    if (soundInfo && soundInfo.file !== null) {
      console.log(`Playing ${soundInfo.file} at volume ${soundConfig.volume}`);
      playAudioFile(soundInfo.file, soundConfig.volume);
    } else {
      console.log('Sound file is null or sound not found');
    }
  } else {
    console.log('Sound is "none" or config not found');
  }
}

// Update all displays
function updateDisplays() {
  updatePointsDisplay();
  
  // Update stats displays if they exist
  const spawnDisplay = document.getElementById('spawnRateDisplay');
  if (spawnDisplay) spawnDisplay.textContent = spawnRate + '%';
  
  const luckDisplay = document.getElementById('luckDisplay');
  if (luckDisplay) luckDisplay.textContent = luck + '%';
  
  const multiplierDisplay = document.getElementById('multiplierDisplay');
  if (multiplierDisplay) multiplierDisplay.textContent = rebirthMultiplier.toFixed(1) + 'x';
  
  const rebirthMultiDisplay = document.getElementById('rebirthMulti');
  if (rebirthMultiDisplay) rebirthMultiDisplay.textContent = rebirthMultiplier.toFixed(1);
  
  // Update points display (works for both pages)
  const pointsEl = document.getElementById('points');
  if (pointsEl) pointsEl.textContent = abbreviateBigInt(points);
  
  // Update upgrade buttons
  updateUpgradeButton('luck');
  updateUpgradeButton('spawn');
}

// Update a single upgrade button
function updateUpgradeButton(type) {
  const btn = document.getElementById(`${type}-upgrade-btn`);
  if (!btn) return;
  
  const config = upgradeConfig[type];
  const cost = getUpgradeCost(type);
  
  btn.textContent = `+${config.increase}% ${type.charAt(0).toUpperCase() + type.slice(1)}: ${abbreviateBigInt(cost)}`;
  
  if (points >= cost) {
    btn.disabled = false;
    btn.style.borderColor = '#7fce6b'; // Purchasable
  } else {
    btn.disabled = true;
    btn.style.borderColor = '#555'; // Not purchasable
  }
}

// Update points display
function updatePointsDisplay() {
  const pointsEl = document.getElementById('points');
  if (pointsEl) pointsEl.textContent = abbreviateBigInt(points);
}

// Render inventory
function renderInventory() {
  const container = document.getElementById('inventoryContainer');
  if (!container) return;
  
  container.innerHTML = '';
  
  inventory.forEach(cube => {
    const cubeEl = createCubeElement(cube, true);
    cubeEl.style.position = 'absolute';
    
    // Use saved position or generate new one
    const cubeSize = rarities[cube.rarity].size;
    let x = cube.x || Math.random() * (window.innerWidth - cubeSize);
    let y = cube.y || Math.random() * (window.innerHeight - cubeSize);
    
    // Ensure position is within bounds
    x = Math.max(0, Math.min(x, window.innerWidth - cubeSize));
    y = Math.max(0, Math.min(y, window.innerHeight - cubeSize));
    
    cubeEl.style.left = x + 'px';
    cubeEl.style.top = y + 'px';
    
    container.appendChild(cubeEl);
  });
}

// Create a cube card for the index
function createCubeCard(rarity) {
  const rarityData = rarities[rarity];
  const card = document.createElement('div');
  card.className = `cube-card ${rarity.toLowerCase()}`;
  
  // Check if player has found this cube
  const hasFound = inventory.some(cube => cube.rarity === rarity);
  
  // Create cube image
  const cubeImage = document.createElement('div');
  cubeImage.className = 'cube-image';
  
  // Create faces for the cube image
  for (let i = 0; i < 6; i++) {
    const face = document.createElement('div');
    face.className = 'face';
    face.style.backgroundColor = rarityData.color;
    
    // Position faces
    const halfSize = 40; // 80px / 2
    if (i === 0) face.style.transform = `translateZ(${halfSize}px)`;
    else if (i === 1) face.style.transform = `translateZ(-${halfSize}px)`;
    else if (i === 2) face.style.transform = `rotateX(90deg) translateZ(${halfSize}px)`;
    else if (i === 3) face.style.transform = `rotateX(-90deg) translateZ(${halfSize}px)`;
    else if (i === 4) face.style.transform = `rotateY(-90deg) translateZ(${halfSize}px)`;
    else if (i === 5) face.style.transform = `rotateY(90deg) translateZ(${halfSize}px)`;
    
    // Apply glow effect to individual faces
    if (rarityData.effect === "glow") {
      face.style.boxShadow = `0 0 30px ${rarityData.color}`;
    }
    
    cubeImage.appendChild(face);
  }
  
  // Create card content
  const value = BigInt(rarityData.value) * BigInt(Math.floor(rebirthMultiplier * 100)) / 100n;
  
  card.innerHTML = `
    ${cubeImage.outerHTML}
    <div class="cube-name" style="color: ${rarityData.color}">${rarity}</div>
    <div class="cube-rarity">Rarity</div>
    <div class="cube-odds">1 in ${rarityData.odds}</div>
    <div class="cube-value">Worth: ${abbreviateBigInt(value)}</div>
    <div class="cube-status" style="color: ${hasFound ? '#7fce6b' : '#ff6b6b'}">
      ${hasFound ? '✓ Found' : '✗ Not Found'}
    </div>
  `;
  
  return card;
}

// Render all cubes in the index
function renderAllCubes() {
  const container = document.getElementById('allCubesContainer');
  if (!container) return;
  
  container.innerHTML = '';
  
  // Sort rarities by odds (rarest first) - Godly should be leftmost
  const sortedRarities = Object.keys(rarities).sort((a, b) => {
    return rarities[b].odds - rarities[a].odds;
  });
  
  sortedRarities.forEach(rarity => {
    const card = createCubeCard(rarity);
    container.appendChild(card);
  });
}

// Render zone cubes in the index
function renderZoneCubes(zoneName) {
  const container = document.getElementById(zoneName + 'Container');
  if (!container) return;
  
  container.innerHTML = '';
  
  const zone = zones[zoneName.charAt(0).toUpperCase() + zoneName.slice(1)];
  if (!zone) return;
  
  // Sort available cubes by rarity (rarest first) - rarest should be leftmost
  const sortedCubes = zone.availableCubes.sort((a, b) => {
    return rarities[b].odds - rarities[a].odds;
  });
  
  sortedCubes.forEach(rarity => {
    const card = createCubeCard(rarity);
    container.appendChild(card);
  });
}

// Save game data (local storage for guests)
function saveGameData() {
  localStorage.setItem("points", points.toString());
  localStorage.setItem("inventory", JSON.stringify(inventory));
  localStorage.setItem("spawnRate", spawnRate);
  localStorage.setItem("luck", luck);
  localStorage.setItem("rebirthMultiplier", rebirthMultiplier);
  localStorage.setItem("nextCubeId", nextCubeId);
  localStorage.setItem("luckLevel", luckLevel);
  localStorage.setItem("spawnLevel", spawnLevel);
  localStorage.setItem("maxCubesOnScreen", maxCubesOnScreen);
  localStorage.setItem("currentZone", currentZone);
  localStorage.setItem("zoneTimer", zoneTimer);
}

// Load game data (local storage for guests)
function loadGameData() {
  const storedPoints = localStorage.getItem("points");
  points = storedPoints ? BigInt(storedPoints) : 0n;
  
  const storedInventory = localStorage.getItem("inventory");
  inventory = storedInventory ? JSON.parse(storedInventory) : [];
  
  spawnRate = parseInt(localStorage.getItem("spawnRate")) || 100;
  luck = parseInt(localStorage.getItem("luck")) || 100;
  rebirthMultiplier = parseFloat(localStorage.getItem("rebirthMultiplier")) || 1.0;
  nextCubeId = parseInt(localStorage.getItem("nextCubeId")) || 1;
  luckLevel = parseInt(localStorage.getItem("luckLevel")) || 0;
  spawnLevel = parseInt(localStorage.getItem("spawnLevel")) || 0;
  maxCubesOnScreen = parseInt(localStorage.getItem("maxCubesOnScreen")) || 20;
  
  let loadedZone = localStorage.getItem("currentZone");
  // If no saved zone or invalid zone, pick a random one
  if (!loadedZone || !zones[loadedZone]) {
    const zoneNames = Object.keys(zones);
    loadedZone = zoneNames[Math.floor(Math.random() * zoneNames.length)];
  }
  currentZone = loadedZone;
  
  zoneTimer = parseInt(localStorage.getItem("zoneTimer")) || 300;
  
  updateDisplays();
  updateZoneDisplay();
  updateZoneTimerDisplay();
  renderInventory();
}

// Reset game
function reset() {
  const resetYN = prompt("Are you sure you want to Hard Reset? Type 'yes' to confirm.");
  if (resetYN && resetYN.toLowerCase() === "yes") {
    points = 0n;
    inventory = [];
    spawnRate = 100;
    luck = 100;
    rebirthMultiplier = 1.0;
    nextCubeId = 1;
    luckLevel = 0;
    spawnLevel = 0;
    maxCubesOnScreen = 20;
    
    // Pick a random zone for the reset
    const zoneNames = Object.keys(zones);
    currentZone = zoneNames[Math.floor(Math.random() * zoneNames.length)];
    zoneTimer = 300;
    
    // Clear displays
    const container = document.getElementById('inventoryContainer');
    if (container) container.innerHTML = '';
    
    const spawnArea = document.getElementById('spawnArea');
    if (spawnArea) spawnArea.innerHTML = '';
    
    updateDisplays();
    updateZoneDisplay();
    updateZoneTimerDisplay();
    
    // Save data (server or local)
    if (isGuest) {
    saveGameData();
    } else {
      saveServerData();
    }
  }
}

// Initialize game
window.onload = function() {
  initMultiplayer(); // Call initMultiplayer on load
  
  // Start spawning if on get-cubes page
  if (window.location.pathname.includes('get-cubes.html')) {
    startSpawning();
    startZoneTimer();
    
    // Load chat history and add keyboard support
    if (!isGuest) {
      loadChatHistory();
    }
    
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
      chatInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          sendChat();
        }
      });
    }
  }
  
  // Initialize cube index if on index page
  if (window.location.pathname.includes('cube-index.html')) {
    renderAllCubes();
  }
};