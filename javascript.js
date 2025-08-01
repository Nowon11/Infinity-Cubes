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
    // Load chat history when connected
    loadChatHistory();
    loadCubeAlerts();
    
    // Request current zone info
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'getZoneInfo' }));
    }
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
      
    case 'zoneTimerUpdate':
      zoneTimer = data.timer;
      updateZoneTimerDisplay();
      break;
      
    case 'zoneInfo':
      currentZone = data.zone;
      zoneTimer = data.timer;
      updateZoneDisplay();
      updateZoneTimerDisplay();
      break;
      
    case 'globalCubeSpawn':
      spawnGlobalCube(data.cube);
      break;
      
    case 'globalCubeCollected':
      removeGlobalCube(data.cubeId);
      break;
      
    case 'diamondStorm':
      if (data.status === 'start') {
        isDiamondStorm = true;
        addChatMessage('SYSTEM', 'A diamond storm is beginning!', new Date().toISOString());
      } else {
        isDiamondStorm = false;
        addChatMessage('SYSTEM', 'The diamond storm has ended.', new Date().toISOString());
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

// Load cube alerts
async function loadCubeAlerts() {
  if (isGuest) return;
  
  try {
    const response = await fetch('/cube-alerts');
    const data = await response.json();
    
    if (data.success) {
      const chatMessages = document.getElementById('chatMessages');
      if (chatMessages) {
        data.alerts.forEach(alert => {
          addRareCubeAlert(alert.username, alert.rarity, alert.odds, false);
        });
      }
    }
  } catch (error) {
    console.error('Failed to load cube alerts:', error);
  }
}

// Clear cube alerts from display
function clearCubeAlerts() {
  const chatMessages = document.getElementById('chatMessages');
  if (chatMessages) {
    // Remove only cube alerts, keep regular chat messages
    const alerts = chatMessages.querySelectorAll('.chat-alert');
    alerts.forEach(alert => alert.remove());
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
      craftedItems = data.data.craftedItems || [];
      equippedItem = data.data.equippedItem;
      
      // Apply equipped item stats if exists
      if (equippedItem) {
        const item = craftedItems.find(item => item.id === equippedItem);
        if (item) {
          applyItemStats(item);
        }
      }
      
      // Load workers
      diamonds = data.data.diamonds || 0;
      playerWorkers = data.data.playerWorkers || [];
      
      updateDisplays();
      updateZoneDisplay();
      updateZoneTimerDisplay();
      renderInventory();
      updateDiamondsDisplay(); // Update diamonds display after loading server data
    }
  } catch (error) {
    console.error('Failed to load server data:', error);
    // Fallback to local storage
    loadGameData();
    updateDiamondsDisplay(); // Update diamonds display after fallback
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
      zoneTimer: zoneTimer,
      craftedItems: craftedItems,
      equippedItem: equippedItem,
      diamonds: diamonds,
      playerWorkers: playerWorkers,
      activeWorkers: activeWorkers
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
  const chatSend = document.querySelector('.chat-send');
  const toggleBtn = document.querySelector('.chat-toggle');
  
  if (chatEnabled) {
    chatContainer.classList.add('collapsed');
    chatMessages.style.display = 'none';
    chatInput.style.display = 'none';
    chatSend.style.display = 'none';
    toggleBtn.textContent = '+';
    chatEnabled = false;
  } else {
    chatContainer.classList.remove('collapsed');
    chatMessages.style.display = 'flex';
    chatInput.style.display = 'block';
    chatSend.style.display = 'block';
    toggleBtn.textContent = '−';
    chatEnabled = true;
  }
}

// Make chat draggable
function makeChatDraggable() {
  const chatContainer = document.querySelector('.chat-container');
  const chatHeader = document.querySelector('.chat-header');
  
  if (!chatContainer || !chatHeader) return;
  
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  
  chatHeader.addEventListener('mousedown', function(e) {
    if (e.target.classList.contains('chat-toggle')) return; // Don't drag when clicking toggle
    
    isDragging = true;
    const rect = chatContainer.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    
    chatHeader.style.cursor = 'grabbing';
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    
    const newX = e.clientX - dragOffset.x;
    const newY = e.clientY - dragOffset.y;
    
    // Keep chat within viewport bounds
    const maxX = window.innerWidth - chatContainer.offsetWidth;
    const maxY = window.innerHeight - chatContainer.offsetHeight;
    
    chatContainer.style.left = Math.max(0, Math.min(newX, maxX)) + 'px';
    chatContainer.style.top = Math.max(0, Math.min(newY, maxY)) + 'px';
  });
  
  document.addEventListener('mouseup', function() {
    if (isDragging) {
      isDragging = false;
      chatHeader.style.cursor = 'grab';
    }
  });
  
  // Set initial cursor
  chatHeader.style.cursor = 'grab';
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

// Add Enter key support for chat
function handleChatKeyPress(event) {
  if (event.key === 'Enter') {
    sendChat();
  }
}

function addChatMessage(username, message, timestamp, scrollToBottom = true) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;
  
  const messageEl = document.createElement('div');
  messageEl.className = 'chat-message';
  
  const time = new Date(timestamp).toLocaleTimeString();
  
  messageEl.innerHTML = `
    <span class="timestamp">${time}</span><br>
    <span class="username">${username}</span>
    <span class="content">${message}</span>
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

  if (username === 'SYSTEM') {
    messageEl.innerHTML = `
      <span class="timestamp">${time}</span><br>
      <span class="content">A Global ${rarity} just spawned! (1 in ${rarities[rarity].odds})</span>
    `;
  } else {
    messageEl.innerHTML = `
      <span class="timestamp">${time}</span><br>
      <span class="username">${username}</span>
      <span class="content"> just got ${rarity}! (1 in ${odds})</span>
    `;
  }

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
    availableCubes: ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythical", "Godly", "Life", "Terminus"]
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
// type: 'default' for standard cubes, 'model' for custom 3D models.
// modelPath: path to the .glb model file (only for 'model' type).
// colliderPath: path to the clickable collider model (only for 'model' type).
// effectsPath: path to the visual effects model (only for 'model' type).
// glowAmount: size of glow in pixels (only for "glow" effect)
const rarities = {
  // Main Cubes
  "Common": { odds: 25, value: 10, size: 60, color: "#808080", type: 'default', effect: "none" },
  "Uncommon": { odds: 75, value: 20, size: 70, color: "#008000", type: 'default', effect: "none" },
  "Rare": { odds: 200, value: 50, size: 80, color: "#0000FF", type: 'default', effect: "none" },
  "Epic": { odds: 750, value: 100, size: 90, color: "#800080", type: 'default', effect: "none" },
  "Legendary": { odds: 1750, value: 200, size: 100, color: "#FFFF00", type: 'default', effect: "glow", glowAmount: 30 },
  "Mythical": { odds: 3000, value: 300, size: 110, color: "#FF0000", type: 'default', effect: "glow", glowAmount: 40 },
  "Godly": { odds: 5000, value: 500, size: 120, color: "#FFFFFF", type: 'default', effect: "glow", glowAmount: 50 },

  // Overworld Cubes
  "Life": { odds: 1000, value: 400, size: 80, color: "#90EE90", type: 'default', effect: "glow", glowAmount: 25 },
  
  "Terminus": { 
    odds: 300000000, 
    value: 7000000, 
    size: 100, 
    type: 'model', 
    modelPath: 'models/terminus.glb'
  }
};

// Upgrade Config - EDIT HERE TO CHANGE UPGRADE SCALING
const upgradeConfig = {
  luck: {
    baseCost: 1000n,
    costMultiplier: 1.4,
    increase: 10, // +10%
  },
  spawn: {
    baseCost: 2000n,
    costMultiplier: 1.5,
    increase: 20, // +20%
  },
  multiplier: {
    baseCost: 5000n,
    costMultiplier: 1.6,
    increase: 0.25, // +0.25x
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

// Show money popup when collecting cubes
function showMoneyPopup(amount, x, y) {
  const popup = document.createElement('div');
  popup.className = 'money-popup';
  popup.textContent = `+${abbreviateBigInt(amount)}`;
  popup.style.left = x + 'px';
  popup.style.top = y + 'px';
  
  document.body.appendChild(popup);
  
  // Remove the popup element after animation
  setTimeout(() => {
    if (popup.parentNode) {
      popup.parentNode.removeChild(popup);
    }
  }, 1500);
}

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

// ---- CLASSIC CUBE FUNCTIONS (RESTORED) ----

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
    
    const halfSize = size / 2;
    if (i === 0) face.style.transform = `translateZ(${halfSize}px)`;
    else if (i === 1) face.style.transform = `translateZ(-${halfSize}px)`;
    else if (i === 2) face.style.transform = `rotateX(90deg) translateZ(${halfSize}px)`;
    else if (i === 3) face.style.transform = `rotateX(-90deg) translateZ(${halfSize}px)`;
    else if (i === 4) face.style.transform = `rotateY(-90deg) translateZ(${halfSize}px)`;
    else if (i === 5) face.style.transform = `rotateY(90deg) translateZ(${halfSize}px)`;
    
    if (rarity.effect === "glow") {
      face.style.boxShadow = `0 0 ${rarity.glowAmount || 20}px ${rarity.color}`;
    }
    
    cubeEl.appendChild(face);
  }
  
  if (isInventory) {
    cubeEl.addEventListener('mousedown', startDrag);
    cubeEl.addEventListener('mouseenter', handleCubeHover);
    cubeEl.addEventListener('mousemove', updateTooltipPosition);
    cubeEl.addEventListener('mouseleave', hideTooltip);
  } else {
    cubeEl.addEventListener('click', () => collectCube(parseInt(cube.id, 10)));
    cubeEl.addEventListener('mouseenter', handleCubeHover);
    cubeEl.addEventListener('mousemove', updateTooltipPosition);
    cubeEl.addEventListener('mouseleave', hideTooltip);
  }
  
  return cubeEl;
}

// ---- UNIFIED TOOLTIP & CLICK HANDLERS ----

function handleCubeHover(event) {
  let cubeData;
  if (event.detail) { // Event from 3D Engine
    cubeData = event.detail;
  } else if (event.currentTarget) { // Event from CSS cube
    cubeData = {
      id: event.currentTarget.getAttribute('data-id'),
      rarity: event.currentTarget.getAttribute('data-rarity')
    };
  } else {
    return;
  }

  const rarity = rarities[cubeData.rarity];
  if (!rarity) return;

  const value = BigInt(rarity.value) * BigInt(Math.floor(rebirthMultiplier * 100)) / 100n;
  const tooltip = document.getElementById('tooltip');
  
  tooltip.innerHTML = `
    <div style="color: ${rarity.color}; font-weight: bold;">${cubeData.rarity}</div>
    <div>1 in ${rarity.odds}</div>
    <div>Worth: ${abbreviateBigInt(value)}</div>
  `;
  tooltip.style.display = 'block';
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('tooltip');
  if (tooltip.style.display === 'block') {
    tooltip.style.left = (event.clientX + 10) + 'px';
    tooltip.style.top = (event.clientY - 10) + 'px';
  }
}

function hideTooltip() {
  const tooltip = document.getElementById('tooltip');
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}

// This function handles clicks ONLY for 3D models from the engine
function handleCubeClick(event) {
  console.log('handleCubeClick called with event:', event);
  const cubeId = parseInt(event.detail.id, 10);
  console.log('Cube ID to collect:', cubeId);

  if (window.location.pathname.includes('get-cubes.html')) {
    console.log('On get-cubes page, calling collectCube');
    collectCube(cubeId);
  } else { // Inventory page
    console.log('On inventory page, calling trashCube');
    if (deleteMode) {
      trashCube(cubeId, true);
    } else {
      trashCube(cubeId, false);
    }
  }
}

function startDrag(event) {
  const cubeEl = event.currentTarget;
  if (!cubeEl) return;

  // Prevent default browser drag behavior
  event.preventDefault();

  let hasMoved = false;

  const onMouseMove = (e) => {
    // Only register a "move" if the mouse has moved a significant distance
    if (!hasMoved && (Math.abs(e.clientX - event.clientX) > 5 || Math.abs(e.clientY - event.clientY) > 5)) {
      hasMoved = true;
    }
    
    let newX = e.clientX - (cubeEl.offsetWidth / 2);
    let newY = e.clientY - (cubeEl.offsetHeight / 2);
    
    // Constrain to screen bounds
    const cubeSize = parseInt(cubeEl.style.width, 10);
    newX = Math.max(0, Math.min(newX, window.innerWidth - cubeSize));
    newY = Math.max(0, Math.min(newY, window.innerHeight - cubeSize));

    cubeEl.style.left = newX + 'px';
    cubeEl.style.top = newY + 'px';
  };

  const onMouseUp = (e) => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);

    const cubeId = parseInt(cubeEl.getAttribute('data-id'), 10);

    if (hasMoved) {
      // If moved, update its position in the inventory array
      const inventoryCube = inventory.find(c => c.id === cubeId);
      if (inventoryCube) {
        inventoryCube.x = parseFloat(cubeEl.style.left);
        inventoryCube.y = parseFloat(cubeEl.style.top);
        if (isGuest) saveGameData();
        else saveServerData();
      }
    } else {
      // If it hasn't moved, treat it as a click and ask to trash
      if (deleteMode) {
        trashCube(cubeId, true); // Instant delete in delete mode
      } else {
        trashCube(cubeId, false); // Confirm first
      }
    }
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}


// ---- HYBRID GAME LOGIC ----

function collectCube(cubeId) {
  hideTooltip();
  
  // First check if it's a CSS cube
  const cubeEl = document.querySelector(`[data-id="${cubeId}"]`);
  
  if (cubeEl) { // It's a CSS cube
    const rarity = cubeEl.getAttribute('data-rarity');
    const rarityData = rarities[rarity];
    
    if (rarity === "Diamond") {
      diamonds += rarityData.value;
      console.log(`Collected Diamond! Diamonds now: ${diamonds}`);
      updateDiamondsDisplay();
    } else if (rarity === "Big Diamond") {
      diamonds += rarityData.value;
      console.log(`Collected Big Diamond! Diamonds now: ${diamonds}`);
      updateDiamondsDisplay();
    } else {
      const value = BigInt(rarityData.value) * BigInt(Math.floor(rebirthMultiplier * 100)) / 100n;
      points += value;
      updatePointsDisplay();
      
      // Show money popup
      const rect = cubeEl.getBoundingClientRect();
      showMoneyPopup(value, rect.left + rect.width / 2, rect.top);
      
      inventory.push({ id: cubeId, rarity: rarity });
    }
    
    cubeEl.remove(); // Correctly remove the DOM element
    
    if (rarityData.odds >= 5000 && !isGuest && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'rareCube', username: currentUser, rarity: rarity, odds: rarityData.odds }));
    }
    
    if (isGuest) saveGameData();
    else saveServerData();

  } else { // It must be a 3D model
    const cubeData = Engine.cubes.find(c => c.id === cubeId);
    if (cubeData) {
      const rarityData = rarities[cubeData.rarity];
      
      if (cubeData.rarity === "Diamond") {
        diamonds += rarityData.value;
        console.log(`Collected 3D Diamond! Diamonds now: ${diamonds}`);
        updateDiamondsDisplay();
      } else if (cubeData.rarity === "Big Diamond") {
        diamonds += rarityData.value;
        console.log(`Collected 3D Big Diamond! Diamonds now: ${diamonds}`);
        updateDiamondsDisplay();
      } else {
        const value = BigInt(rarityData.value) * BigInt(Math.floor(rebirthMultiplier * 100)) / 100n;
        points += value;
        updatePointsDisplay();
        
        // Show money popup for 3D cubes
        const rect = Engine.renderer.domElement.getBoundingClientRect();
        const screenX = (cubeData.mesh.position.x + window.innerWidth / 2);
        const screenY = (-cubeData.mesh.position.y + window.innerHeight / 2);
        showMoneyPopup(value, screenX, screenY);
        
        // Save the 3D model's position when adding to inventory
        inventory.push({ 
          id: cubeId, 
          rarity: cubeData.rarity,
          x: cubeData.mesh.position.x + (window.innerWidth / 2),
          y: -cubeData.mesh.position.y + (window.innerHeight / 2)
        });
      }
      
      Engine.removeCube(cubeId);
      
      if (rarityData.odds >= 5000 && !isGuest && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'rareCube', username: currentUser, rarity: cubeData.rarity, odds: rarityData.odds }));
      }
      
      if (isGuest) saveGameData();
      else saveServerData();
    }
  }
}

// Trash cube from inventory
function trashCube(cubeId, instant = false) {
  hideTooltip();
  const cubeEl = document.querySelector(`[data-id="${cubeId}"]`);
  if (cubeEl) { // It's a CSS cube
    const proceed = instant ? true : confirm('Are you sure you want to trash this cube?');
    if (!proceed) return;
    
    inventory = inventory.filter(c => c.id !== cubeId);
    cubeEl.remove();
    playClickSound();
    
    if (isGuest) saveGameData();
    else saveServerData();
  } else { // It must be a 3D model
    const proceed = instant ? true : confirm('Are you sure you want to trash this cube?');
    if (!proceed) return;
    
    inventory = inventory.filter(c => c.id !== cubeId);
    Engine.removeCube(cubeId);
    playClickSound();
    
    if (isGuest) saveGameData();
    else saveServerData();
  }
}

function spawnCube() {
  const rarity = assignRarity();
  const rarityData = rarities[rarity];
  const cubeId = nextCubeId++;

  if (rarityData.type === 'model') {
    Engine.addCube({
      id: cubeId,
      rarity: rarity,
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
    });
  } else {
    const cube = {
      id: cubeId,
      rarity: rarity,
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
    };
    const cubeEl = createCubeElement(cube, false);
    
    // Correctly position the spawned cube
    cubeEl.style.left = cube.x + 'px';
    cubeEl.style.top = cube.y + 'px';

    const spawnArea = document.getElementById('spawnArea');
    if (spawnArea) {
      spawnArea.appendChild(cubeEl);
    }
  }
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
  // Clear any existing interval
  if (window.spawnInterval) {
    clearInterval(window.spawnInterval);
  }
  
  const baseInterval = 3000; // 3 seconds base
  const interval = Math.max(100, baseInterval / (spawnRate / 100)); // Minimum 100ms interval, can go higher
  
  console.log(`Starting spawn with rate: ${spawnRate}%, interval: ${interval}ms`);
  window.spawnInterval = setInterval(spawnCube, interval);
}

// Update spawning interval when spawn rate changes
function updateSpawningInterval() {
  if (window.location.pathname.includes('get-cubes.html') && window.spawnInterval) {
    clearInterval(window.spawnInterval);
    startSpawning();
  }
}

// Sidebar toggle function
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.classList.toggle('open');
  }
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
  } else if (tabName === 'events') {
    renderEventCubes();
  } else {
    renderZoneCubes(tabName);
  }
}

// Zone transition effect
function showZoneTransition(newZone) {
  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'zoneTransitionOverlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    z-index: 9999;
    display: flex;
    justify-content: center;
    align-items: center;
    opacity: 0;
    transition: opacity 0.5s ease;
  `;
  
  // Create message
  const message = document.createElement('div');
  message.style.cssText = `
    color: white;
    font-size: 2rem;
    font-weight: bold;
    text-align: center;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
    background: rgba(0, 0, 0, 0.6);
    padding: 20px 40px;
    border-radius: 10px;
    border: 2px solid #009aae;
  `;
  message.textContent = `Changing zone to: ${newZone}`;
  
  overlay.appendChild(message);
  document.body.appendChild(overlay);
  
  // Fade in
  setTimeout(() => {
    overlay.style.opacity = '1';
  }, 10);
  
  // Fade out after 2 seconds
  setTimeout(() => {
    overlay.style.opacity = '0';
    setTimeout(() => {
      document.body.removeChild(overlay);
    }, 500);
  }, 2000);
}

// Switch zones (now only used internally)
async function switchZone(zoneName) {
  if (zones[zoneName]) {
    // Show zone transition
    showZoneTransition(zoneName);
    
    // Update zone after a short delay
    setTimeout(() => {
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
          fetch('/zone', {
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
    }, 1000); // Wait for transition to start
  }
}

// Switch to random zone (now handled by server)
function switchToRandomZone() {
  // This function is now handled by the server
  // Client just requests zone info when needed
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
    updateSpawningInterval(); // Update spawning interval when spawn rate changes
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

// Rebirth function (now multiplier upgrade)
function rebirth() {
  const config = upgradeConfig.multiplier;
  const cost = getUpgradeCost('multiplier');
  
  if (points < cost) {
    alert('Not enough points to buy multiplier upgrade!');
    return;
  }
  
  points -= cost;
  rebirthMultiplier += config.increase;
  
  playClickSound();
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
  
  try {
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
        // Try fallback sound
        playFallbackSound();
      });
      
      // Load the audio
      audio.load();
    }
  } catch (error) {
    console.log(`Error in playAudioFile:`, error);
    playFallbackSound();
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
  
  const spawnLevelDisplay = document.getElementById('spawnLevelDisplay');
  if (spawnLevelDisplay) spawnLevelDisplay.textContent = spawnLevel;
  
  const luckDisplay = document.getElementById('luckDisplay');
  if (luckDisplay) luckDisplay.textContent = luck + '%';
  
  const luckLevelDisplay = document.getElementById('luckLevelDisplay');
  if (luckLevelDisplay) luckLevelDisplay.textContent = luckLevel;
  
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
  updateUpgradeButton('multiplier');
}

// Update a single upgrade button
function updateUpgradeButton(type) {
  const btn = document.getElementById(`${type}-upgrade-btn`);
  if (!btn) return;
  
  const config = upgradeConfig[type];
  const cost = getUpgradeCost(type);
  
  if (type === 'multiplier') {
    btn.textContent = `+${config.increase}x Multiplier: ${abbreviateBigInt(cost)}`;
  } else {
    btn.textContent = `+${config.increase}% ${type.charAt(0).toUpperCase() + type.slice(1)}: ${abbreviateBigInt(cost)}`;
  }
  
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

// Render inventory in 3D
function renderInventory() {
  const container = document.getElementById('inventoryContainer');
  if (!container) return;
  container.innerHTML = '';
  Engine.clearAllCubes(); // Clear any 3D models

  inventory.forEach(cube => {
    const rarityData = rarities[cube.rarity];
    
    // Ensure all cubes have a valid position
    if (cube.x === undefined || cube.y === undefined) {
      const size = rarityData ? (rarityData.size || 100) : 100;
      cube.x = Math.random() * (window.innerWidth - size);
      cube.y = Math.random() * (window.innerHeight - size);
    }
    
    if (rarityData && rarityData.type === 'model') {
      Engine.addCube({
        id: cube.id,
        rarity: cube.rarity,
        x: cube.x,
        y: cube.y
      });
    } else {
      const cubeEl = createCubeElement(cube, true);
      
      // Correctly position the inventory cube
      const size = rarityData ? (rarityData.size || 100) : 100;
      let x = cube.x || Math.random() * (window.innerWidth - size);
      let y = cube.y || Math.random() * (window.innerHeight - size);
      
      cubeEl.style.left = x + 'px';
      cubeEl.style.top = y + 'px';

      container.appendChild(cubeEl);
    }
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
  localStorage.setItem("craftedItems", JSON.stringify(craftedItems));
  localStorage.setItem("equippedItem", equippedItem);
  localStorage.setItem("diamonds", diamonds);
  localStorage.setItem("playerWorkers", JSON.stringify(playerWorkers));
  localStorage.setItem("activeWorkers", JSON.stringify(activeWorkers));
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
  
  // Load crafted items
  const storedCraftedItems = localStorage.getItem("craftedItems");
  craftedItems = storedCraftedItems ? JSON.parse(storedCraftedItems) : [];
  
  // Load equipped item and apply stats
  equippedItem = localStorage.getItem("equippedItem");
  if (equippedItem) {
    const item = craftedItems.find(item => item.id === equippedItem);
    if (item) {
      applyItemStats(item);
    }
  }
  
  // Load workers
  diamonds = parseInt(localStorage.getItem("diamonds")) || 0;
  const storedWorkers = localStorage.getItem("playerWorkers");
  playerWorkers = storedWorkers ? JSON.parse(storedWorkers) : [];
  
  // Load active workers
  const storedActiveWorkers = localStorage.getItem("activeWorkers");
  activeWorkers = storedActiveWorkers ? JSON.parse(storedActiveWorkers) : [null, null, null, null];
  
  updateDisplays();
  updateZoneDisplay();
  updateZoneTimerDisplay();
  renderInventory();
  updateDiamondsDisplay(); // Update diamonds display after loading game data
}

// Reset game
function reset() {
  const confirmReset = confirm('Are you sure you want to Hard Reset? This action cannot be undone and all your game data will be lost.');
  if (confirmReset) {
    points = 0n;
    inventory = [];
    spawnRate = 100;
    luck = 100;
    rebirthMultiplier = 1.0;
    nextCubeId = 1;
    luckLevel = 0;
    spawnLevel = 0;
    maxCubesOnScreen = 20;
    
    // Reset workers and diamonds
    playerWorkers = [];
    activeWorkers = [null, null, null, null];
    diamonds = 0;
    
    // Reset crafted items
    craftedItems = [];
    equippedItem = null;
    
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

// ============================================================================
// ADMIN FUNCTIONS - Only available for username "Admin"
// ============================================================================

// Toggle admin panel
// Toggle admin panel
async function toggleAdminPanel() {
  // Check if user is admin (simple client-side check for now)
  if (currentUser !== 'Admin') {
    console.log('Admin access denied');
    return;
  }
  
  const adminPanel = document.getElementById('adminPanel');
  if (adminPanel) {
    adminPanel.classList.toggle('show');
  }
}

// Admin: Spawn a cube
async function adminSpawnCube() {
  if (currentUser !== 'Admin') {
    alert('Admin access denied');
    return;
  }
  
  const rarity = prompt('Enter rarity:');
  if (!rarity || !rarities[rarity]) return alert('Invalid rarity!');

  const x = Math.random() * window.innerWidth;
  const y = Math.random() * window.innerHeight;
  
  const cube = {
    id: nextCubeId++,
    rarity: rarity,
    x: x,
    y: y
  };
  
  const cubeEl = createCubeElement(cube, false);
  cubeEl.style.left = x + 'px';
  cubeEl.style.top = y + 'px';
  
  const spawnArea = document.getElementById('spawnArea');
  if (spawnArea) {
    spawnArea.appendChild(cubeEl);
  }
  
  alert(`Spawned ${rarity} cube!`);
}

// Admin: Clear inventory
async function adminClearInventory() {
  if (currentUser !== 'Admin') {
    alert('Admin access denied');
    return;
  }
  
  if (confirm('Are you sure you want to clear the inventory?')) {
    inventory = [];
    Engine.clearAllCubes();
    if (isGuest) saveGameData();
    else saveServerData();
    alert('Inventory cleared!');
  }
}

// Admin: Give points
async function adminGivePoints() {
  if (currentUser !== 'Admin') {
    alert('Admin access denied');
    return;
  }
  
  const amount = prompt('Enter amount of points to give:');
  if (!amount || isNaN(amount)) {
    alert('Invalid amount!');
    return;
  }
  
  points += BigInt(amount);
  updatePointsDisplay();
  
  // Save data
  if (isGuest) {
    saveGameData();
  } else {
    saveServerData();
  }
  
  alert(`Gave ${amount} points!`);
}

// Admin: Set zone
function adminSetZone() {
  if (currentUser !== 'Admin') return;
  
  const zoneSelect = document.getElementById('adminZoneSelect');
  if (zoneSelect) {
    const newZone = zoneSelect.value;
    if (zones[newZone]) {
      // Send zone change request to server
      if (!isGuest && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'adminSetZone',
          zone: newZone
        }));
      }
      
      alert(`Zone change request sent to server!`);
    }
  }
}

// Admin: Reset zone timer
function adminResetZoneTimer() {
  if (currentUser !== 'Admin') return;
  
  // Send timer reset request to server
  if (!isGuest && ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'adminResetZoneTimer'
    }));
  }
  
  alert('Zone timer reset request sent to server!');
}

// Admin: Clear chat
async function adminClearChat() {
  if (currentUser !== 'Admin') return;
  
  try {
    const response = await fetch('/clear-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await response.json();
    
    if (data.success) {
      const chatMessages = document.getElementById('chatMessages');
      if (chatMessages) {
        // Remove all messages, including alerts
        chatMessages.innerHTML = '';
      }
      alert('Chat history and cube alerts cleared from server!');
    } else {
      alert('Failed to clear chat history and cube alerts');
    }
  } catch (error) {
    console.error('Error clearing chat:', error);
    alert('Error clearing chat history and cube alerts');
  }
}

// Admin: Send message
function adminSendMessage() {
  if (currentUser !== 'Admin') return;
  
  const messageInput = document.getElementById('adminMessage');
  if (messageInput && messageInput.value.trim()) {
    const message = messageInput.value.trim();
    
    if (!isGuest && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'chat',
        username: 'Admin',
        message: `[ADMIN] ${message}`
      }));
    }
    
    messageInput.value = '';
    alert('Admin message sent!');
  } else {
    alert('Please enter a message!');
  }
}

// Admin: Reset player
function adminResetPlayer() {
  if (currentUser !== 'Admin') return;
  
  if (confirm('Are you sure you want to reset the player? This will clear all progress.')) {
    reset();
    alert('Player reset!');
  }
}

// Admin: Max upgrades
function adminMaxUpgrades() {
  if (currentUser !== 'Admin') return;
  
  luck = 1000; // 1000% luck
  spawnRate = 1000; // 1000% spawn rate
  luckLevel = 50;
  spawnLevel = 50;
  
  updateDisplays();
  
  // Force restart spawning with new rate
  if (window.location.pathname.includes('get-cubes.html')) {
    if (window.spawnInterval) {
      clearInterval(window.spawnInterval);
    }
    startSpawning();
  }
  
  // Save data
  if (isGuest) {
    saveGameData();
  } else {
    saveServerData();
  }
  
  const baseInterval = 3000;
  const newInterval = Math.max(100, baseInterval / (spawnRate / 100));
  alert(`Upgrades maxed out! Luck: 1000%, Spawn Rate: 1000%\nNew spawn interval: ${newInterval}ms`);
}

// Admin: Set spawn rate
function adminSetSpawnRate() {
  if (currentUser !== 'Admin') return;
  
  const newRate = prompt('Enter spawn rate percentage (1-1000):');
  if (!newRate || isNaN(newRate) || newRate < 1 || newRate > 1000) {
    alert('Invalid spawn rate! Must be between 1 and 1000.');
    return;
  }
  
  spawnRate = parseInt(newRate);
  spawnLevel = Math.floor((spawnRate - 100) / 20); // Calculate level based on rate
  
  updateDisplays();
  
  // Force restart spawning with new rate
  if (window.location.pathname.includes('get-cubes.html')) {
    if (window.spawnInterval) {
      clearInterval(window.spawnInterval);
    }
    startSpawning();
  }
  
  // Save data
  if (isGuest) {
  saveGameData();
  } else {
    saveServerData();
  }
  
  const baseInterval = 3000;
  const newInterval = Math.max(100, baseInterval / (spawnRate / 100));
  alert(`Spawn rate set to ${spawnRate}%!\nNew spawn interval: ${newInterval}ms`);
}

// Admin: Debug spawn settings
function adminDebugSpawn() {
  if (currentUser !== 'Admin') return;
  
  const baseInterval = 3000;
  const currentInterval = Math.max(100, baseInterval / (spawnRate / 100));
  
  alert(`Current Spawn Settings:\nSpawn Rate: ${spawnRate}%\nBase Interval: ${baseInterval}ms\nCurrent Interval: ${currentInterval}ms\nSpawn Level: ${spawnLevel}`);
}

// Admin: Give points to another player
function adminGivePointsToPlayer() {
  if (currentUser !== 'Admin') return;
  
  const playerName = prompt('Enter player username:');
  if (!playerName) return;
  
  const amount = prompt('Enter amount of points to give:');
  if (!amount || isNaN(amount)) {
    alert('Invalid amount!');
    return;
  }
  
  // This would need server-side implementation
  // For now, just show what would happen
  alert(`Would give ${amount} points to ${playerName}\n\nNote: This requires server-side implementation to work with other players.`);
}

// Admin: Set points for another player
function adminSetPointsForPlayer() {
  if (currentUser !== 'Admin') return;
  
  const playerName = prompt('Enter player username:');
  if (!playerName) return;
  
  const amount = prompt('Enter new points amount:');
  if (!amount || isNaN(amount)) {
    alert('Invalid amount!');
    return;
  }
  
  // This would need server-side implementation
  // For now, just show what would happen
  alert(`Would set ${playerName}'s points to ${amount}\n\nNote: This requires server-side implementation to work with other players.`);
}

// Admin: Delete account
async function adminDeleteAccount() {
  const targetUser = prompt('Enter the username of the account to delete:');
  if (!targetUser) {
    return;
  }

  if (confirm(`Are you sure you want to permanently delete the account: ${targetUser}? This action cannot be undone.`)) {
    try {
      const response = await fetch('/admin/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: currentUser, // for admin authentication
          targetUser: targetUser
        })
      });

      const data = await response.json();

      if (data.success) {
        alert(data.message);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      alert('An error occurred while trying to delete the account.');
    }
  }
}

// Admin: Start Diamond Storm
async function adminStartDiamondStorm() {
  if (currentUser !== 'Admin') {
    alert('Admin access denied');
    return;
  }
  
  try {
    const response = await fetch('/admin/start-diamond-storm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser })
    });
    
    if (response.ok) {
      console.log('Diamond storm started globally');
      alert('Global diamond storm started!');
    } else {
      console.error('Failed to start diamond storm');
      alert('Failed to start diamond storm');
    }
  } catch (error) {
    console.error('Error starting diamond storm:', error);
    alert('Error starting diamond storm');
  }
}

// Admin: Give Diamonds
async function adminGiveDiamonds() {
  if (currentUser !== 'Admin') {
    alert('Admin access denied');
    return;
  }
  
  const amount = prompt('Enter amount of diamonds to give:');
  if (!amount || isNaN(amount)) {
    alert('Invalid amount!');
    return;
  }
  
  diamonds += parseInt(amount);
  updateDiamondsDisplay();
  
  // Save data
  if (isGuest) {
    saveGameData();
  } else {
    saveServerData();
  }
  
  alert(`Gave ${amount} diamonds!`);
}

// Global cube variables
let globalCubes = [];
let globalCubeElements = new Map(); // Map to track global cube elements

// Delete mode variables
let deleteMode = false;

// Spawn global cube
function spawnGlobalCube(cube) {
  const spawnArea = document.getElementById('spawnArea');
  if (!spawnArea) return;
  
  // Create global cube element
  const cubeEl = createCubeElement(cube, false);
  cubeEl.style.position = 'absolute';
  cubeEl.style.left = cube.x + 'px';
  cubeEl.style.top = cube.y + 'px';
  
  // Add click handler for global cube collection
  cubeEl.addEventListener('click', () => collectGlobalCube(cube.id));

  spawnArea.appendChild(cubeEl);
  globalCubeElements.set(cube.id, cubeEl);
  globalCubes.push(cube);
  
  // Play spawn sound
  playRaritySound(cube.rarity);
}

// Remove global cube
function removeGlobalCube(cubeId) {
  const cubeEl = globalCubeElements.get(cubeId);
  if (cubeEl) {
    cubeEl.remove();
    globalCubeElements.delete(cubeId);
  }
  
  globalCubes = globalCubes.filter(cube => cube.id !== cubeId);
}

// Collect global cube
async function collectGlobalCube(cubeId) {
  if (isGuest) return;
  
  try {
    const response = await fetch('/collect-global-cube', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cubeId: cubeId, username: currentUser })
    });
    
    const data = await response.json();
    
    if (data.success) {
      const cube = data.cube;
      const rarityData = rarities[cube.rarity];
      const value = BigInt(rarityData.value) * BigInt(Math.floor(rebirthMultiplier * 100)) / 100n;
      
      points += value;
      updatePointsDisplay();
      
      // Add to inventory
      const inventoryCube = {
        id: nextCubeId++,
        rarity: cube.rarity,
        x: Math.random() * (window.innerWidth - 100),
        y: Math.random() * (window.innerHeight - 100)
      };
      inventory.push(inventoryCube);
      
      // Play click sound
      playClickSound();
      
      // Save data
      saveServerData();
      
      // Remove from global cubes
      removeGlobalCube(cubeId);
    }
  } catch (error) {
    console.error('Failed to collect global cube:', error);
  }
}

// Load global cubes
async function loadGlobalCubes() {
  if (isGuest) return;
  
  try {
    const response = await fetch('/global-cubes');
    const data = await response.json();
    
    if (data.success) {
      globalCubes = data.cubes;
      
      // Render existing global cubes
      const spawnArea = document.getElementById('spawnArea');
      if (spawnArea) {
        globalCubes.forEach(cube => {
          spawnGlobalCube(cube);
        });
      }
    }
  } catch (error) {
    console.error('Failed to load global cubes:', error);
  }
}

// Spawn random global cube (for testing)
async function spawnRandomGlobalCube() {
  if (isGuest) return;
  
  const raritiesList = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythical', 'Godly'];
  const selectedRarity = prompt(`Enter rarity to spawn (${raritiesList.join(', ')}):`);
  
  if (!selectedRarity || !raritiesList.includes(selectedRarity)) {
    alert('Invalid rarity! Please enter a valid rarity.');
    return;
  }
  
  const x = Math.random() * (window.innerWidth - 100);
  const y = Math.random() * (window.innerHeight - 100);
  const rarityData = rarities[selectedRarity];
  
  try {
    const response = await fetch('/spawn-global-cube', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rarity: selectedRarity, x: x, y: y, odds: rarityData.odds })
    });
    
    const data = await response.json();
    
    if (data.success) {
      alert(`Spawned global ${selectedRarity} cube!`);
  } else {
      alert('Failed to spawn global cube');
    }
  } catch (error) {
    console.error('Error spawning global cube:', error);
    alert('Error spawning global cube');
  }
}

// Toggle delete mode
function toggleDeleteMode() {
  deleteMode = !deleteMode;
  const deleteModeBtn = document.getElementById('deleteModeBtn');
  
  if (deleteModeBtn) {
    if (deleteMode) {
      deleteModeBtn.textContent = 'Disable Delete Mode';
      deleteModeBtn.classList.add('active');
    } else {
      deleteModeBtn.textContent = 'Enable Delete Mode';
      deleteModeBtn.classList.remove('active');
    }
  }
}

function handleCubeDragEnd(event) {
  const cubeData = event.detail;
  if (!cubeData) return;

  const inventoryCube = inventory.find(c => c.id === cubeData.id);
  if (inventoryCube) {
    // Convert 3D world coordinates back to CSS pixel coordinates for saving
    inventoryCube.x = cubeData.mesh.position.x + (window.innerWidth / 2);
    inventoryCube.y = -cubeData.mesh.position.y + (window.innerHeight / 2);
    
    if (isGuest) {
      saveGameData();
    } else {
      saveServerData();
    }
  }
  
  // Re-enable outline on the dragged cube after drag ends
  if (Engine.outlinePass && cubeData.mesh) {
    Engine.outlinePass.selectedObjects = [cubeData.mesh];
  }
}

window.addEventListener('cubehover', handleCubeHover);
window.addEventListener('mousemove', updateTooltipPosition);
window.addEventListener('cubeleave', hideTooltip);
window.addEventListener('cubeclick', handleCubeClick);
window.addEventListener('cubedragend', handleCubeDragEnd); // Add listener for drag end

window.onload = function() {
  // Initialize the 3D engine first! This is crucial.
  const threeContainer = document.getElementById('three-container');
  if (threeContainer) {
    Engine.init(threeContainer);
  }

  // Now, initialize the game logic which depends on the engine
  initMultiplayer();
  
  if (window.location.pathname.includes('get-cubes.html')) {
    setTimeout(() => {
      startSpawning();
      if (!isGuest) loadGlobalCubes();
    }, 100);
  }
  
  // Start worker update loop (for diamond storms and worker logic)
  setInterval(updateWorkers, 1000);
  
  if (window.location.pathname.includes('cube-index.html')) {
    renderAllCubes();
  }
  
  if (window.location.pathname.includes('crafting.html')) {
    renderRecipes();
    renderCraftedItems();
  }
  
  if (window.location.pathname.includes('workers.html')) {
    renderCrates();
    renderWorkerIndex();
    updateDiamondsDisplay(); // Update diamonds display on workers page
  }
  
  // Add chat input Enter key listener
  const chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.addEventListener('keypress', handleChatKeyPress);
  }
  
  // Make chat draggable
  makeChatDraggable();
  
  // Add admin panel keyboard listener
  document.addEventListener('keydown', function(e) {
    if (e.key === '\\') {
      if (currentUser === 'Admin') {
        toggleAdminPanel();
      } else {
        console.log('Admin access denied');
      }
    }
  });
  
  // Update diamonds display globally
  updateDiamondsDisplay();
  
  // Load diamonds on page load
  loadDiamonds();
  
  // Ensure diamonds are displayed correctly after data loading
  setTimeout(() => {
    updateDiamondsDisplay();
  }, 100);
};

// ============================================================================
// CUBE INDEX FUNCTIONS
// ============================================================================

function createCubeCard(rarity) {
  const rarityData = rarities[rarity];
  const card = document.createElement('div');
  card.className = `cube-card ${rarity.toLowerCase()}`;
  
  const hasFound = inventory.some(cube => cube.rarity === rarity);
  const cubeCount = getCubeCount(rarity);
  
  // Create cube image using the classic CSS method
  const cubeImage = document.createElement('div');
  cubeImage.className = 'cube-image';
  
  // Handle model-based cubes that don't have color properties
  if (rarityData.type === 'model') {
    // For model cubes, create a 3D scene container
    cubeImage.innerHTML = `
      <div class="model-container" style="
        width: 80px; 
        height: 80px; 
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <canvas id="model-${rarity}" style="width: 100%; height: 100%;"></canvas>
      </div>
    `;
    
    // Initialize the 3D model after the DOM is ready
    setTimeout(() => {
      initModelPreview(rarity, `model-${rarity}`);
    }, 100);
  } else {
    // For regular cubes, create the CSS cube faces
    for (let i = 0; i < 6; i++) {
      const face = document.createElement('div');
      face.className = 'face';
      face.style.backgroundColor = rarityData.color;
      const halfSize = 40; // 80px / 2
      if (i === 0) face.style.transform = `translateZ(${halfSize}px)`;
      else if (i === 1) face.style.transform = `translateZ(-${halfSize}px)`;
      else if (i === 2) face.style.transform = `rotateX(90deg) translateZ(${halfSize}px)`;
      else if (i === 3) face.style.transform = `rotateX(-90deg) translateZ(${halfSize}px)`;
      else if (i === 4) face.style.transform = `rotateY(-90deg) translateZ(${halfSize}px)`;
      else if (i === 5) face.style.transform = `rotateY(90deg) translateZ(${halfSize}px)`;
      if (rarityData.effect === "glow") {
        face.style.boxShadow = `0 0 ${rarityData.glowAmount || 20}px ${rarityData.color}`;
      }
      cubeImage.appendChild(face);
    }
  }
  
  const value = BigInt(rarityData.value) * BigInt(Math.floor(rebirthMultiplier * 100)) / 100n;

  card.innerHTML = `
    ${cubeImage.outerHTML}
    <div class="cube-name" style="color: ${rarityData.color}">${rarity}</div>
    <div class="cube-rarity">Rarity</div>
    <div class="cube-odds">${rarity === 'Diamond' || rarity === 'Big Diamond' ? 'N/A' : `1 in ${rarityData.odds}`}</div>
    <div class="cube-value">Worth: ${abbreviateBigInt(value)}</div>
    <div class="cube-count">${rarity === 'Diamond' || rarity === 'Big Diamond' ? `Diamonds: ${diamonds}` : `Owned: ${cubeCount}`}</div>
    <div class="cube-status" style="color: ${hasFound ? '#7fce6b' : '#ff6b6b'}">
      ${hasFound ? '✓ Found' : '✗ Not Found'}
    </div>
  `;
  
  return card;
}

// Initialize 3D model preview for cube index
function initModelPreview(rarity, canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  
  const rarityData = rarities[rarity];
  if (!rarityData || rarityData.type !== 'model') return;
  
  // Create a mini Three.js scene for the preview
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
  renderer.setSize(80, 80);
  renderer.setClearColor(0x000000, 0);
  
  // Add lighting - same as main engine
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 5, 5);
  scene.add(directionalLight);
  
  // Position camera - same as main engine
  camera.position.z = 3;
  
  // Load the model using the same approach as the main engine
  const loader = new THREE.GLTFLoader();
  loader.load(rarityData.modelPath, (gltf) => {
    const model = gltf.scene;
    
    // Apply the same transformations as the main engine
    model.scale.setScalar(0.5); // Same scale as main engine
    model.position.set(0, 0, 0); // Center position
    
    // Add the model to the scene
    scene.add(model);
    
    // Animation loop - same rotation as main engine
    function animate() {
      requestAnimationFrame(animate);
      model.rotation.y += 0.01; // Same rotation speed
      renderer.render(scene, camera);
    }
    animate();
  }, undefined, (error) => {
    console.error('Error loading model for preview:', error);
  });
}

function renderAllCubes() {
  const container = document.getElementById('allCubesContainer');
  if (!container) return;
  
  container.innerHTML = '';
  
  const sortedRarities = Object.keys(rarities).sort((a, b) => rarities[b].odds - rarities[a].odds);
  
  sortedRarities.forEach(rarity => {
    const card = createCubeCard(rarity);
    container.appendChild(card);
  });
}

function renderZoneCubes(zoneName) {
  const container = document.getElementById(`${zoneName}Container`);
  if (!container) return;
  
  container.innerHTML = '';
  
  const zone = zones[zoneName.charAt(0).toUpperCase() + zoneName.slice(1)];
  if (!zone) return;
  
  const sortedCubes = zone.availableCubes.sort((a, b) => rarities[b].odds - rarities[a].odds);
  
  sortedCubes.forEach(rarity => {
    const card = createCubeCard(rarity);
    container.appendChild(card);
  });
}

function renderEventCubes() {
  const container = document.getElementById('eventsContainer');
  if (!container) return;
  
  container.innerHTML = '';
  
  const eventCubes = ["Diamond", "Big Diamond"];
  
  eventCubes.forEach(rarity => {
    const card = createCubeCard(rarity);
    container.appendChild(card);
  });
}

// ============================================================================
// WORKER SYSTEM
// ============================================================================

// Worker configuration
const workers = {
  "Common Worker": {
    rarity: "Common",
    interval: 5000, // 5 seconds
    maxRarity: "Rare",
    specialAbility: null
  },
  "Rare Worker": {
    rarity: "Rare",
    interval: 3000, // 3 seconds
    maxRarity: "Epic",
    specialAbility: null
  },
  "Epic Worker": {
    rarity: "Epic",
    interval: 1000, // 1 second
    maxRarity: "Legendary",
    specialAbility: null
  },
  "Summoner": {
    rarity: "Epic",
    interval: 2000, // 2 seconds
    maxRarity: "Epic",
    specialAbility: {
      name: "Summon",
      description: "Spawns 5 mid-rarity cubes every second"
    }
  },
  "Legendary Worker": {
    rarity: "Legendary",
    interval: 500, // 0.5 seconds
    maxRarity: "Godly",
    specialAbility: null
  },
  "Secret Worker": {
    rarity: "Secret",
    interval: 100, // 0.1 seconds
    maxRarity: "Godly",
    specialAbility: {
      name: "Diamond Finder",
      description: "Chance to spawn a Diamond with each cube pickup"
    }
  }
};

// Crate configuration
const crates = {
  "Common Crate": {
    cost: 100,
    odds: {
      "Common Worker": 69,
      "Rare Worker": 20,
      "Epic Worker": 9,
      "Summoner": 0,
      "Legendary Worker": 1,
      "Secret Worker": 0.01
    }
  },
  "Rare Crate": {
    cost: 250,
    odds: {
      "Common Worker": 40,
      "Rare Worker": 40,
      "Epic Worker": 19,
      "Summoner": 0,
      "Legendary Worker": 0.99,
      "Secret Worker": 0.01
    }
  },
  "Epic Crate": {
    cost: 500,
    odds: {
      "Common Worker": 10,
      "Rare Worker": 40,
      "Epic Worker": 40,
      "Summoner": 9.99,
      "Legendary Worker": 0,
      "Secret Worker": 0.01
    }
  },
  "Legendary Crate": {
    cost: 1000,
    odds: {
      "Common Worker": 0,
      "Rare Worker": 20,
      "Epic Worker": 40,
      "Summoner": 20,
      "Legendary Worker": 19.99,
      "Secret Worker": 0.01
    }
  }
};

// Player's workers
let playerWorkers = [];
let diamonds = 0;

// Diamond storm variables
let isDiamondStorm = false;

// Switch workers tabs
function switchWorkersTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.workers-tab-panel').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Remove active class from all buttons
  document.querySelectorAll('.workers-tab-button').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Show selected tab
  document.getElementById(tabName + '-tab').classList.add('active');
  event.target.classList.add('active');
  
  // Render the appropriate content
  if (tabName === 'crates') {
    renderCrates();
  } else if (tabName === 'index') {
    renderWorkerIndex();
  } else if (tabName === 'inventory') {
    renderWorkerInventory();
  }
}

// Render crates
function renderCrates() {
  const container = document.getElementById('cratesContainer');
  if (!container) return;
  
  container.innerHTML = '';
  
  Object.entries(crates).forEach(([crateName, crate]) => {
    const card = document.createElement('div');
    card.className = `crate-card ${crateName.split(' ')[0].toLowerCase()}`;
    
    card.innerHTML = `
      <h3>${crateName}</h3>
      <p>Cost: ${crate.cost} Diamonds</p>
      <button onclick="openCrateDetails('${crateName}')">View Details</button>
    `;
    
    container.appendChild(card);
  });
}

// Render worker index
function renderWorkerIndex() {
  const container = document.getElementById('workerIndexContainer');
  if (!container) return;
  
  container.innerHTML = '';
  
  const hasSecretWorker = playerWorkers.some(worker => worker.rarity === 'Secret');
  
  Object.entries(workers).forEach(([workerName, worker]) => {
    // Hide secret worker unless the player has it
    if (worker.rarity === 'Secret' && !hasSecretWorker) {
      return; // Skip this worker
    }
    
    const card = document.createElement('div');
    card.className = `worker-index-card ${worker.rarity.toLowerCase()}`;
    
    let specialAbilityHtml = '';
    if (worker.specialAbility) {
      specialAbilityHtml = `
        <div class="special-ability">
          <h4>Special Ability: ${worker.specialAbility.name}</h4>
          <p>${worker.specialAbility.description}</p>
        </div>
      `;
    }
    
    card.innerHTML = `
      <h3>${workerName}</h3>
      <p>Rarity: ${worker.rarity}</p>
      <p>Interval: ${worker.interval / 1000}s</p>
      <p>Max Rarity: ${worker.maxRarity}</p>
      ${specialAbilityHtml}
    `;
    
    container.appendChild(card);
  });
}

// Open a crate
function openCrate(crateName) {
  const crate = crates[crateName];
  if (!crate || diamonds < crate.cost) {
    alert('Not enough diamonds to open this crate!');
    return;
  }
  
  diamonds -= crate.cost;
  updateDiamondsDisplay();
  
  // Roll for worker using the crate's odds
  const roll = Math.random() * 100;
  let accumulatedOdds = 0;
  let workerWon = null;
  
  for (const [workerName, odds] of Object.entries(crate.odds)) {
    accumulatedOdds += odds;
    if (roll <= accumulatedOdds) {
      workerWon = workerName;
      break;
    }
  }
  
  if (workerWon) {
    // Add worker to player's collection
    playerWorkers.push({
      name: workerWon,
      ...workers[workerWon]
    });
    
    showCrateResult(workerWon);
  }
  
  // Save data
  if (isGuest) {
    saveGameData();
  } else {
    saveServerData();
  }
}

// Show crate opening result in modal
function showCrateResult(workerName) {
  const worker = workers[workerName];
  const modal = document.getElementById('crateModal');
  const content = document.getElementById('crateModalContent');
  
  content.innerHTML = `
    <h2>You got a ${worker.rarity} worker!</h2>
    <h3>${workerName}</h3>
    <p>Interval: ${worker.interval / 1000}s</p>
    <p>Max Rarity: ${worker.maxRarity}</p>
    ${worker.specialAbility ? `<p>Special Ability: ${worker.specialAbility.name}</p>` : ''}
  `;
  
  modal.style.display = 'block';
}

// Close crate modal
function closeCrateModal() {
  const modal = document.getElementById('crateModal');
  modal.style.display = 'none';
  
  // Process next crate if there are more in queue
  if (crateQueue.length > 0) {
    setTimeout(() => {
      processNextCrate();
    }, 500); // Small delay before next crate
  } else {
    isProcessingCrates = false;
  }
}

// Open crate details modal
function openCrateDetails(crateName) {
  const crate = crates[crateName];
  if (!crate) return;
  
  // Use the crate's odds directly instead of calculating
  const odds = {};
  let totalOdds = 0;
  
  // Calculate total odds
  Object.entries(crate.odds).forEach(([workerName, chance]) => {
    if (workerName !== "Secret Worker") { // Skip secret workers
      totalOdds += chance;
    }
  });
  
  // Convert to percentages
  Object.entries(crate.odds).forEach(([workerName, chance]) => {
    if (workerName !== "Secret Worker") { // Skip secret workers
      odds[workerName] = ((chance / totalOdds) * 100).toFixed(2);
    }
  });
  
  const modal = document.getElementById('crateModal');
  const content = document.getElementById('crateModalContent');
  
  content.innerHTML = `
    <div class="crate-details">
      <h2>${crateName}</h2>
      <p class="crate-cost">Cost: ${crate.cost} Diamonds</p>
      
      <div class="odds-section">
        <h3>Drop Rates:</h3>
        ${Object.entries(odds).map(([workerName, percentage]) => 
          `<div class="odds-item ${getWorkerRarity(workerName).toLowerCase()}">
            <span class="rarity-name">${workerName}</span>
            <span class="odds-percentage">${percentage}%</span>
          </div>`
        ).join('')}
      </div>
      
      <div class="quantity-section">
        <h3>Quantity:</h3>
        <div class="quantity-controls">
          <button onclick="changeQuantity(-1)" class="quantity-btn">-</button>
          <input type="number" id="crateQuantity" value="1" min="1" max="100" onchange="updateTotalCost()">
          <button onclick="changeQuantity(1)" class="quantity-btn">+</button>
        </div>
        <p class="total-cost">Total Cost: <span id="totalCost">${crate.cost}</span> Diamonds</p>
      </div>
      
      <div class="crate-actions">
        <button onclick="closeCrateModal()" class="cancel-btn">Cancel</button>
        <button onclick="buyCrates('${crateName}')" class="buy-btn">Buy Crates</button>
      </div>
    </div>
  `;
  
  modal.style.display = 'block';
}

// Helper function to get worker rarity
function getWorkerRarity(workerName) {
  const worker = workers[workerName];
  return worker ? worker.rarity : "Common";
}

// Worker inventory system
let activeWorkers = [null, null, null, null]; // 4 slots

// Render worker inventory
function renderWorkerInventory() {
  renderWorkerSlots();
  renderWorkerCollection();
}

// Render worker slots
function renderWorkerSlots() {
  for (let i = 0; i < 4; i++) {
    const slotContent = document.getElementById(`slot-${i}`);
    if (!slotContent) continue;
    
    slotContent.innerHTML = '';
    
    if (activeWorkers[i]) {
      const worker = activeWorkers[i];
      const workerDiv = document.createElement('div');
      workerDiv.className = `active-worker ${worker.rarity.toLowerCase()}`;
      workerDiv.draggable = true;
      workerDiv.ondragstart = (event) => dragWorker(event, 'slot', i);
      
      workerDiv.innerHTML = `
        <div class="worker-icon">${worker.name.charAt(0)}</div>
        <div class="worker-name">${worker.name}</div>
        <div class="worker-stats">
          <div>Interval: ${worker.interval / 1000}s</div>
          <div>Max: ${worker.maxRarity}</div>
        </div>
        <button onclick="removeWorker(${i})" class="remove-worker-btn">×</button>
      `;
      
      slotContent.appendChild(workerDiv);
    }
  }
}

// Render worker collection
function renderWorkerCollection() {
  const container = document.getElementById('workerCollectionContainer');
  if (!container) return;
  
  container.innerHTML = '';
  
  playerWorkers.forEach((worker, index) => {
    const card = document.createElement('div');
    card.className = `worker-collection-card ${worker.rarity.toLowerCase()}`;
    card.draggable = true;
    card.ondragstart = (event) => dragWorker(event, 'collection', index);
    
    card.innerHTML = `
      <div class="worker-icon">${worker.name.charAt(0)}</div>
      <div class="worker-name">${worker.name}</div>
      <div class="worker-rarity">${worker.rarity}</div>
      <div class="worker-stats">
        <div>Interval: ${worker.interval / 1000}s</div>
        <div>Max: ${worker.maxRarity}</div>
        ${worker.specialAbility ? `<div>Ability: ${worker.specialAbility.name}</div>` : ''}
      </div>
    `;
    
    container.appendChild(card);
  });
}

// Drag and drop functions
function dragWorker(event, source, index) {
  event.dataTransfer.setData('text/plain', JSON.stringify({ source, index }));
}

function allowDrop(event) {
  event.preventDefault();
}

function dropWorker(event) {
  event.preventDefault();
  const data = JSON.parse(event.dataTransfer.getData('text/plain'));
  const targetSlot = parseInt(event.currentTarget.dataset.slot);
  
  if (data.source === 'collection') {
    // Moving from collection to slot
    const worker = playerWorkers[data.index];
    if (activeWorkers[targetSlot]) {
      // Swap workers
      const temp = activeWorkers[targetSlot];
      activeWorkers[targetSlot] = worker;
      playerWorkers[data.index] = temp;
    } else {
      // Move worker to slot
      activeWorkers[targetSlot] = worker;
      playerWorkers.splice(data.index, 1);
    }
  } else if (data.source === 'slot') {
    // Moving between slots
    const sourceSlot = data.index;
    const temp = activeWorkers[sourceSlot];
    activeWorkers[sourceSlot] = activeWorkers[targetSlot];
    activeWorkers[targetSlot] = temp;
  }
  
  renderWorkerInventory();
  saveWorkerData();
}

// Remove worker from slot
function removeWorker(slotIndex) {
  if (activeWorkers[slotIndex]) {
    playerWorkers.push(activeWorkers[slotIndex]);
    activeWorkers[slotIndex] = null;
    renderWorkerInventory();
    saveWorkerData();
  }
}

// Save worker data
function saveWorkerData() {
  if (isGuest) {
    localStorage.setItem('activeWorkers', JSON.stringify(activeWorkers));
    saveGameData();
  } else {
    saveServerData();
  }
}

// Load worker data
function loadWorkerData() {
  const savedActiveWorkers = localStorage.getItem('activeWorkers');
  if (savedActiveWorkers) {
    activeWorkers = JSON.parse(savedActiveWorkers);
  }
}

// Change quantity
function changeQuantity(delta) {
  const input = document.getElementById('crateQuantity');
  const currentValue = parseInt(input.value) || 1;
  const newValue = Math.max(1, Math.min(100, currentValue + delta));
  input.value = newValue;
  updateTotalCost();
}

// Update total cost
function updateTotalCost() {
  const quantity = parseInt(document.getElementById('crateQuantity').value) || 1;
  const validQuantity = Math.max(1, Math.min(100, quantity));
  document.getElementById('crateQuantity').value = validQuantity;
  
  const crateName = document.querySelector('.crate-details h2').textContent;
  const crate = crates[crateName];
  const totalCost = crate.cost * validQuantity;
  document.getElementById('totalCost').textContent = totalCost;
}

// Single instance protection
const INSTANCE_KEY = 'infinity_cubes_instance';
const currentInstanceId = Math.random().toString(36).substr(2, 9);

// Check if another instance is running
function checkSingleInstance() {
  const existingInstance = localStorage.getItem(INSTANCE_KEY);
  if (existingInstance && existingInstance !== currentInstanceId) {
    // Another instance is running
    document.body.innerHTML = `
      <div style="
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        font-family: Arial, sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        text-align: center;
      ">
        <div style="
          background: rgba(0, 0, 0, 0.3);
          padding: 40px;
          border-radius: 15px;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
        ">
          <h1 style="margin: 0 0 20px 0; font-size: 2.5em;">⚠️ Instance Already Running</h1>
          <p style="font-size: 1.2em; margin: 0; line-height: 1.5;">
            You have another instance of Infinity Cubes running in another tab or window.<br>
            Please close the other instance before opening this one.
          </p>
          <p style="font-size: 1em; margin: 20px 0 0 0; opacity: 0.8;">
            This prevents conflicts and ensures your game data stays synchronized.
          </p>
        </div>
      </div>
    `;
    return false;
  }
  
  // Set this instance as active
  localStorage.setItem(INSTANCE_KEY, currentInstanceId);
  return true;
}

// Clean up instance on page unload
window.addEventListener('beforeunload', () => {
  const existingInstance = localStorage.getItem(INSTANCE_KEY);
  if (existingInstance === currentInstanceId) {
    localStorage.removeItem(INSTANCE_KEY);
  }
});

// Check single instance on page load
if (!checkSingleInstance()) {
  // Stop execution if another instance is running
  throw new Error('Another instance is running');
}

// Global variables for crate queue
let crateQueue = [];
let isProcessingCrates = false;

// Buy crates
function buyCrates(crateName) {
  const crate = crates[crateName];
  const quantity = parseInt(document.getElementById('crateQuantity').value) || 1;
  const totalCost = crate.cost * quantity;
  
  if (diamonds < totalCost) {
    alert('Not enough diamonds!');
    return;
  }
  
  diamonds -= totalCost;
  updateDiamondsDisplay();
  
  // Save data
  if (isGuest) {
    saveGameData();
  } else {
    saveServerData();
  }
  
  // Add crates to queue
  for (let i = 0; i < quantity; i++) {
    crateQueue.push(crateName);
  }
  
  closeCrateModal();
  
  // Start processing if not already processing
  if (!isProcessingCrates) {
    processNextCrate();
  }
}

// Process next crate in queue
function processNextCrate() {
  if (crateQueue.length === 0) {
    isProcessingCrates = false;
    return;
  }
  
  isProcessingCrates = true;
  const crateName = crateQueue.shift();
  openCrateWithCutscene(crateName);
}

// Open crate with cutscene
function openCrateWithCutscene(crateName) {
  const crate = crates[crateName];
  
  // Roll for worker using the crate's odds
  const roll = Math.random() * 100;
  let accumulatedOdds = 0;
  let workerWon = null;
  
  for (const [workerName, odds] of Object.entries(crate.odds)) {
    accumulatedOdds += odds;
    if (roll <= accumulatedOdds) {
      workerWon = workerName;
      break;
    }
  }
  
  if (workerWon) {
    // Add worker to player's collection
    playerWorkers.push({
      name: workerWon,
      ...workers[workerWon]
    });
    
    showCrateCutscene(workerWon, crateName);
  }
}

// Show crate cutscene
function showCrateCutscene(workerName, crateName) {
  const worker = workers[workerName];
  const modal = document.getElementById('crateModal');
  const content = document.getElementById('crateModalContent');
  
  content.innerHTML = `
    <div class="crate-cutscene">
      <div class="cutscene-header">
        <h2>Opening ${crateName}...</h2>
      </div>
      <div class="cutscene-content">
        <div class="clickable-crate">
          <div class="crate-box ${crateName.split(' ')[0].toLowerCase()}" id="clickableCrate" onclick="clickCrate()">
            <div class="crate-label">Click to Open!</div>
          </div>
        </div>
        <div class="explosion-effect" id="explosionEffect" style="display: none;">
          <div class="explosion"></div>
          <div class="sparkles"></div>
        </div>
        <div class="worker-reveal" id="workerReveal" style="display: none;">
          <h3>You got a ${worker.rarity} worker!</h3>
          <h4>${workerName}</h4>
          <p>Interval: ${worker.interval / 1000}s</p>
          <p>Max Rarity: ${worker.maxRarity}</p>
          ${worker.specialAbility ? `<p>Special Ability: ${worker.specialAbility.name}</p>` : ''}
        </div>
      </div>
      <div class="cutscene-actions">
        <button onclick="closeCrateModal()" class="continue-btn" id="continueBtn" style="display: none;">Continue</button>
      </div>
    </div>
  `;
  
  modal.style.display = 'block';
  
  // Initialize crate state
  window.crateClicks = 0;
  window.targetWorker = workerName;
  // Randomly choose tilt pattern: true = left first, false = right first
  window.tiltPattern = Math.random() > 0.5;
}

// Click crate function
function clickCrate() {
  const crate = document.getElementById('clickableCrate');
  
  window.crateClicks++;
  
  // Scale and tilt based on clicks
  const scale = 1 + (window.crateClicks * 0.2);
  
  // Alternating tilt pattern: left-right-left or right-left-right
  let tiltDirection;
  if (window.tiltPattern) {
    // Left first pattern: left, right, left
    tiltDirection = window.crateClicks === 1 ? -1 : window.crateClicks === 2 ? 1 : -1;
  } else {
    // Right first pattern: right, left, right
    tiltDirection = window.crateClicks === 1 ? 1 : window.crateClicks === 2 ? -1 : 1;
  }
  
  const tilt = window.crateClicks * 15 * tiltDirection;
  
  crate.style.transform = `scale(${scale}) rotate(${tilt}deg)`;
  
  if (window.crateClicks >= 3) {
    // Show explosion and reveal after 0.1 seconds
    setTimeout(() => {
      showExplosion();
    }, 100);
  }
}

// Show explosion effect
function showExplosion() {
  const crate = document.getElementById('clickableCrate');
  const explosion = document.getElementById('explosionEffect');
  const reveal = document.getElementById('workerReveal');
  
  // Hide crate
  crate.style.display = 'none';
  
  // Show explosion
  explosion.style.display = 'block';
  
  // After explosion animation, show reveal
  setTimeout(() => {
    explosion.style.display = 'none';
    reveal.style.display = 'block';
    document.getElementById('continueBtn').style.display = 'inline-block';
  }, 1500);
}

// Helper function to get rarity weight
function getRarityWeight(rarity) {
  const weights = {
    'Common': 1,
    'Rare': 2,
    'Epic': 3,
    'Legendary': 4,
    'Secret': 5
  };
  return weights[rarity] || 1;
}

// Update diamonds display
function updateDiamondsDisplay() {
  const diamondsEl = document.getElementById('diamonds');
  if (diamondsEl) {
    diamondsEl.textContent = `Diamonds: ${diamonds}`;
    console.log(`Updated diamonds display: ${diamonds}`);
  } else {
    console.log(`Diamonds element not found. Current diamonds: ${diamonds}`);
  }
}

// Load diamonds on page load
function loadDiamonds() {
  if (isGuest) {
    diamonds = parseInt(localStorage.getItem("diamonds")) || 0;
  }
  updateDiamondsDisplay();
}

// Spawn a diamond
function spawnDiamond() {
  const isBig = Math.random() < 0.2; // 20% chance for a big diamond
  const rarity = isBig ? "Big Diamond" : "Diamond";
  
  const diamond = {
    id: nextCubeId++,
    rarity: rarity,
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
  };
  
  const cubeEl = createCubeElement(diamond, false);
  cubeEl.style.left = diamond.x + 'px';
  cubeEl.style.top = diamond.y + 'px';
  
  const spawnArea = document.getElementById('spawnArea');
  if (spawnArea) {
    spawnArea.appendChild(cubeEl);
  }
}

// Main game loop update for workers
function updateWorkers() {
  playerWorkers.forEach(worker => {
    // Implement worker logic here (walking around, picking up cubes)
  });
  
  // Chance to start a diamond storm (only if not already in one)
  if (!isDiamondStorm && Math.random() < 0.001) {
    // Trigger global diamond storm via server
    if (!isGuest && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'requestDiamondStorm' }));
    }
  }
  
  // Spawn diamonds during a storm (separate from normal cubes)
  if (isDiamondStorm && Math.random() < 0.75) {
    spawnDiamond();
  }
}

// Add Diamond to rarities
  rarities["Diamond"] = { odds: 0, value: 5, size: 60, color: "#00BFFF", type: 'default', effect: "glow", glowAmount: 20 };
  rarities["Big Diamond"] = { odds: 0, value: 10, size: 100, color: "#00BFFF", type: 'default', effect: "glow", glowAmount: 40 };

// ============================================================================

// Crafting recipes configuration
const craftingRecipes = {
  "Common's Blessing": {
    name: "Common's Blessing",
    description: "A powerful artifact that enhances your luck and spawn rate",
    cost: {
      "Common": 50,
      "Uncommon": 20,
      "Rare": 5
    },
    stats: {
      luck: 10,
      spawnRate: 10
    },
    rarity: "Epic",
    color: "#800080"
  },
  "Uncommon's Might": {
    name: "Uncommon's Might",
    description: "Increases your multiplier and luck significantly",
    cost: {
      "Uncommon": 100,
      "Rare": 25,
      "Epic": 10
    },
    stats: {
      luck: 15,
      multiplier: 0.5
    },
    rarity: "Legendary",
    color: "#FFFF00"
  },
  "Rare's Fortune": {
    name: "Rare's Fortune",
    description: "Massively boosts all your stats",
    cost: {
      "Rare": 50,
      "Epic": 20,
      "Legendary": 5
    },
    stats: {
      luck: 25,
      spawnRate: 25,
      multiplier: 1.0
    },
    rarity: "Mythical",
    color: "#FF0000"
  }
};

// Player's crafted items inventory
let craftedItems = [];
let equippedItem = null;

// Get cube count from inventory
function getCubeCount(rarity) {
  return inventory.filter(cube => cube.rarity === rarity).length;
}

// Check if player can craft an item
function canCraftItem(recipeName) {
  const recipe = craftingRecipes[recipeName];
  if (!recipe) return false;
  
  for (const [rarity, count] of Object.entries(recipe.cost)) {
    if (getCubeCount(rarity) < count) {
      return false;
    }
  }
  return true;
}

// Craft an item
function craftItem(recipeName) {
  const recipe = craftingRecipes[recipeName];
  if (!recipe || !canCraftItem(recipeName)) {
    alert('Cannot craft this item! Check if you have enough cubes.');
    return;
  }
  
  // Remove cubes from inventory
  for (const [rarity, count] of Object.entries(recipe.cost)) {
    for (let i = 0; i < count; i++) {
      const index = inventory.findIndex(cube => cube.rarity === rarity);
      if (index !== -1) {
        inventory.splice(index, 1);
      }
    }
  }
  
  // Create the crafted item
  const craftedItem = {
    id: Date.now() + Math.random(),
    name: recipe.name,
    description: recipe.description,
    stats: recipe.stats,
    rarity: recipe.rarity,
    color: recipe.color,
    equipped: false
  };
  
  craftedItems.push(craftedItem);
  
  // Save data
  if (isGuest) {
    saveGameData();
  } else {
    saveServerData();
  }
  
  // Update displays
  updateDisplays();
  renderInventory();
  
  if (window.location.pathname.includes('crafting.html')) {
    renderRecipes();
    renderCraftedItems();
  }
  
  alert(`Successfully crafted ${recipe.name}!`);
}

// Equip an item
function equipItem(itemId) {
  // Unequip current item
  if (equippedItem) {
    const currentItem = craftedItems.find(item => item.id === equippedItem);
    if (currentItem) {
      currentItem.equipped = false;
      // Remove stats
      removeItemStats(currentItem);
    }
  }
  
  // Equip new item
  const newItem = craftedItems.find(item => item.id === itemId);
  if (newItem) {
    newItem.equipped = true;
    equippedItem = itemId;
    // Apply stats
    applyItemStats(newItem);
  }
  
  // Save data
  if (isGuest) {
    saveGameData();
  } else {
    saveServerData();
  }
  
  // Update displays
  updateDisplays();
  
  if (window.location.pathname.includes('crafting.html')) {
    renderCraftedItems();
  }
}

// Unequip current item
function unequipItem() {
  if (equippedItem) {
    const item = craftedItems.find(item => item.id === equippedItem);
    if (item) {
      item.equipped = false;
      removeItemStats(item);
      equippedItem = null;
      
      // Save data
      if (isGuest) {
        saveGameData();
      } else {
        saveServerData();
      }
      
      // Update displays
      updateDisplays();
      
      if (window.location.pathname.includes('crafting.html')) {
        renderCraftedItems();
      }
    }
  }
}

// Apply item stats
function applyItemStats(item) {
  if (item.stats.luck) luck += item.stats.luck;
  if (item.stats.spawnRate) spawnRate += item.stats.spawnRate;
  if (item.stats.multiplier) rebirthMultiplier += item.stats.multiplier;
}

// Remove item stats
function removeItemStats(item) {
  if (item.stats.luck) luck -= item.stats.luck;
  if (item.stats.spawnRate) spawnRate -= item.stats.spawnRate;
  if (item.stats.multiplier) rebirthMultiplier -= item.stats.multiplier;
}

// Switch crafting tabs
function switchCraftingTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.crafting-tab-panel').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Remove active class from all buttons
  document.querySelectorAll('.crafting-tab-button').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Show selected tab
  document.getElementById(tabName + '-tab').classList.add('active');
  event.target.classList.add('active');
  
  // Render the appropriate content
  if (tabName === 'recipes') {
    renderRecipes();
  } else if (tabName === 'inventory') {
    renderCraftedItems();
  }
}

// Render crafting recipes
function renderRecipes() {
  const container = document.getElementById('recipesContainer');
  if (!container) return;
  
  container.innerHTML = '';
  
  Object.entries(craftingRecipes).forEach(([recipeName, recipe]) => {
    const canCraft = canCraftItem(recipeName);
    const card = document.createElement('div');
    card.className = `recipe-card ${recipe.rarity.toLowerCase()}`;
    
    const costHtml = Object.entries(recipe.cost).map(([rarity, count]) => {
      const available = getCubeCount(rarity);
      const hasEnough = available >= count;
      return `<div class="cost-item ${hasEnough ? 'available' : 'insufficient'}">
        ${rarity}: ${available}/${count}
      </div>`;
    }).join('');
    
    const statsHtml = Object.entries(recipe.stats).map(([stat, value]) => {
      const symbol = stat === 'multiplier' ? 'x' : '%';
      return `<div class="stat-bonus">+${value}${symbol} ${stat}</div>`;
    }).join('');
    
    card.innerHTML = `
      <div class="recipe-header" style="color: ${recipe.color}">
        <h3>${recipe.name}</h3>
        <span class="recipe-rarity">${recipe.rarity}</span>
      </div>
      <div class="recipe-description">${recipe.description}</div>
      <div class="recipe-cost">
        <h4>Cost:</h4>
        ${costHtml}
      </div>
      <div class="recipe-stats">
        <h4>Bonuses:</h4>
        ${statsHtml}
      </div>
      <button class="craft-button ${canCraft ? 'available' : 'disabled'}" 
              onclick="craftItem('${recipeName}')" 
              ${!canCraft ? 'disabled' : ''}>
        ${canCraft ? 'Craft' : 'Cannot Craft'}
      </button>
    `;
    
    container.appendChild(card);
  });
}

// Render crafted items
function renderCraftedItems() {
  const container = document.getElementById('craftedItemsContainer');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (craftedItems.length === 0) {
    container.innerHTML = '<p class="no-items">No crafted items yet. Craft some items in the Recipes tab!</p>';
    return;
  }
  
  craftedItems.forEach(item => {
    const card = document.createElement('div');
    card.className = `crafted-item-card ${item.rarity.toLowerCase()} ${item.equipped ? 'equipped' : ''}`;
    
    const statsHtml = Object.entries(item.stats).map(([stat, value]) => {
      const symbol = stat === 'multiplier' ? 'x' : '%';
      return `<div class="stat-bonus">+${value}${symbol} ${stat}</div>`;
    }).join('');
    
    card.innerHTML = `
      <div class="item-header" style="color: ${item.color}">
        <h3>${item.name}</h3>
        <span class="item-rarity">${item.rarity}</span>
        ${item.equipped ? '<span class="equipped-badge">EQUIPPED</span>' : ''}
      </div>
      <div class="item-description">${item.description}</div>
      <div class="item-stats">
        <h4>Bonuses:</h4>
        ${statsHtml}
      </div>
      <div class="item-actions">
        <button class="item-details-btn" onclick="showItemDetails(${item.id})">Details</button>
        ${item.equipped ? 
          '<button class="unequip-btn" onclick="unequipItem()">Unequip</button>' : 
          '<button class="equip-btn" onclick="equipItem(' + item.id + ')">Equip</button>'
        }
      </div>
    `;
    
    container.appendChild(card);
  });
}

// Show item details modal
function showItemDetails(itemId) {
  const item = craftedItems.find(item => item.id === itemId);
  if (!item) return;
  
  const modal = document.getElementById('itemModal');
  const content = document.getElementById('itemModalContent');
  
  const statsHtml = Object.entries(item.stats).map(([stat, value]) => {
    const symbol = stat === 'multiplier' ? 'x' : '%';
    return `<div class="stat-bonus">+${value}${symbol} ${stat}</div>`;
  }).join('');
  
  content.innerHTML = `
    <div class="item-details">
      <h2 style="color: ${item.color}">${item.name}</h2>
      <p class="item-description">${item.description}</p>
      <div class="item-stats">
        <h3>Bonuses:</h3>
        ${statsHtml}
      </div>
      <div class="item-actions">
        ${item.equipped ? 
          '<button class="unequip-btn" onclick="unequipItem(); closeItemModal();">Unequip</button>' : 
          '<button class="equip-btn" onclick="equipItem(' + item.id + '); closeItemModal();">Equip</button>'
        }
      </div>
    </div>
  `;
  
  modal.style.display = 'block';
}

// Close item modal
function closeItemModal() {
  const modal = document.getElementById('itemModal');
  modal.style.display = 'none';
}

function goBack() {
  window.location.href = 'index.html';
}

// ============================================================================