// ============================================================================
// SOUND CONFIGURATION - EDIT HERE TO ADD NEW SOUNDS
// ============================================================================

// Add your sound effects here
// Format: "soundName": { file: "filename.mp3", volume: 1.0 }
const sounds = {
  "none": { file: null, volume: 0.0 }, // No sound
  "boom": { file: "boom.mp3", volume: 1.0 },
  "click": { file: "click.mp3", volume: 0.8 },
  "pop": { file: "pop.mp3", volume: 0.6 },
  "ding": { file: "ding.mp3", volume: 0.7 },
  "chime": { file: "chime.mp3", volume: 0.9 },
  "sparkle": { file: "sparkle.mp3", volume: 0.5 }
  // Add your new sound here! Example:
  // "super": { file: "super.mp3", volume: 1.0 }
};

// ============================================================================
// CUBE SOUND ASSIGNMENTS - EDIT HERE TO ASSIGN SOUNDS TO CUBES
// ============================================================================

// Assign sounds to rarities
// You can assign the same sound to multiple rarities with different volumes
const raritySounds = {
  "Common": { sound: "none", volume: 0 },
  "Uncommon": { sound: "none", volume: 0 },
  "Rare": { sound: "none", volume: 0 },
  "Epic": { sound: "none", volume: 0 },
  "Legendary": { sound: "none", volume: 0 },
  "Mythical": { sound: "none", volume: 0 },
  "Godly": { sound: "boom", volume: 0.5 }
  // Add your new cube here! Example:
  // "Super": { sound: "super", volume: 1.0 }
};

// Click sound configuration (plays when collecting/trashing cubes and buying upgrades)
const clickSound = {
  sound: "none",
  volume: 0.0
};

// ============================================================================
// EXPORT FOR USE IN MAIN GAME
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sounds, raritySounds, clickSound };
} 