# Sound Effects Configuration

## How to Add New Sound Effects

1. **Add your audio file** to this folder (supports .mp3, .wav, .ogg)
2. **Edit `sound-config.js`** to add your sound:
   ```javascript
   const sounds = {
     "yourSound": { file: "your-sound.mp3", volume: 1.0 },
     // ... other sounds
   };
   ```
3. **Assign the sound to a rarity** in the same file:
   ```javascript
   const raritySounds = {
     "Common": { sound: "yourSound", volume: 0.5 },
     // ... other rarities
   };
   ```

## How to Disable Sounds

To disable sounds for specific rarities or the click sound, use the "none" option:

```javascript
// Disable sound for Common cubes
const raritySounds = {
  "Common": { sound: "none", volume: 0.0 },
  // ... other rarities
};

// Disable click sound
const clickSound = {
  sound: "none",
  volume: 0.0
};
```

## How to Change the Click Sound

To change the click sound (plays when collecting/trashing cubes and buying upgrades):

1. **Add your click sound file** to this folder
2. **Edit `sound-config.js`** to change the click sound:
   ```javascript
   const clickSound = {
     sound: "yourClickSound",  // must match a sound in the sounds object
     volume: 0.8
   };
   ```

## Current Sound Assignments

### Cube Rarity Sounds:
- **Common**: pop.mp3 (30% volume)
- **Uncommon**: pop.mp3 (40% volume)
- **Rare**: ding.mp3 (50% volume)
- **Epic**: ding.mp3 (60% volume)
- **Legendary**: chime.mp3 (70% volume)
- **Mythical**: boom.mp3 (50% volume)
- **Godly**: boom.mp3 (100% volume)

### Click Sound:
- **Click**: click.mp3 (80% volume) - plays when collecting/trashing cubes and buying upgrades

## Tips

- You can use the same sound file for multiple rarities with different volumes
- Volume ranges from 0.0 (silent) to 1.0 (full volume)
- Use "none" to disable sounds for specific rarities or the click sound
- If a sound file is missing, the game will use a fallback generated sound
- Supported formats: MP3, WAV, OGG 