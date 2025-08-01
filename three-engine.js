// ============================================================================
// THREE.JS ENGINE - MANAGES 3D SCENE AND OBJECTS
// ============================================================================

let GLTFLoader;
let AnimationMixer;

const Engine = {
  scene: null,
  camera: null,
  renderer: null,
  composer: null, // For post-processing
  outlinePass: null, // For hover outline effect
  cubes: [], // Array to hold 3D cube objects
  raycaster: null,
  mouse: null,
  intersected: null,
  mixers: [], // Array to hold animation mixers
  isDragging: false,
  draggedCube: null,
  clickTimeout: null,
  mouseDownPos: null, // Track initial mouse position
  
  init: function(container) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.camera = new THREE.OrthographicCamera(window.innerWidth / -2, window.innerWidth / 2, window.innerHeight / 2, window.innerHeight / -2, 1, 2000);
    this.camera.position.z = 1000;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    this.scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    this.scene.add(directionalLight);
    
    // Post-processing setup
    this.composer = new THREE.EffectComposer(this.renderer);
    const renderPass = new THREE.RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // Outline Pass for hover effect
    this.outlinePass = new THREE.OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), this.scene, this.camera);
    this.outlinePass.edgeStrength = 3; // Stronger line for visibility
    this.outlinePass.edgeGlow = 0; // No glow
    this.outlinePass.edgeThickness = 1; // Thin outline
    this.outlinePass.visibleEdgeColor.set('#ffffff');
    this.outlinePass.hiddenEdgeColor.set('#ffffff');
    this.composer.addPass(this.outlinePass);
    
    const bloomPass = new THREE.UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.5,  // strength
      0.4,  // radius
      0.85  // threshold
    );
    this.composer.addPass(bloomPass);
    
    const copyPass = new THREE.ShaderPass(THREE.CopyShader);
    copyPass.renderToScreen = true;
    this.composer.addPass(copyPass);
    
    // Loaders
    GLTFLoader = new THREE.GLTFLoader();
    AnimationMixer = THREE.AnimationMixer;

    // Mouse interaction setup
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.intersected = null;
    
    // Add event listeners to the renderer's DOM element
    this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e), false);
    this.renderer.domElement.addEventListener('mousedown', (e) => this.onMouseDown(e), false);
    this.renderer.domElement.addEventListener('mouseup', (e) => this.onMouseUp(e), false);
    
    console.log('3D Engine initialized with mouse events attached');
    
    // Handle window resize
    window.addEventListener('resize', () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      this.camera.left = width / -2;
      this.camera.right = width / 2;
      this.camera.top = height / 2;
      this.camera.bottom = height / -2;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
      this.composer.setSize(width, height);
    });

    // Start the animation loop
    this.animate();
  },

  animate: function() {
    requestAnimationFrame(() => this.animate());
    
    // Update animation mixers
    const deltaTime = 0.016; // Approximate 60fps
    this.mixers.forEach(mixer => {
      mixer.update(deltaTime);
    });
    
    // Rotate existing cubes
    this.cubes.forEach(cube => {
      if (cube.mesh && !cube.mixer) { // Only rotate if no animation mixer
        cube.mesh.rotation.x += 0.01;
        cube.mesh.rotation.y += 0.01;
      }
    });
    
    this.composer.render();
  },

  addCube: function(config) {
    const rarity = rarities[config.rarity];
    if (!rarity) return;

    console.log(`Adding cube: ${config.rarity}, type: ${rarity.type}`);

    if (rarity.type === 'model' && rarity.colliderPath) {
      console.log(`Loading dual-model cube: ${config.rarity}`);
      
      // Load the collider model (clickable)
      GLTFLoader.load(rarity.colliderPath, (colliderGltf) => {
        console.log(`Collider model loaded successfully: ${rarity.colliderPath}`);
        const colliderModel = colliderGltf.scene;
        
        // Scale the collider model to match the configured size
        const box = new THREE.Box3().setFromObject(colliderModel);
        const size = box.getSize(new THREE.Vector3());
        const scale = rarity.size / size.y; // Scale based on height
        colliderModel.scale.set(scale, scale, scale);

        const worldX = config.x - (window.innerWidth / 2);
        const worldY = -config.y + (window.innerHeight / 2);
        colliderModel.position.set(worldX, worldY, config.z || 0);
        
        // Set up animations for collider if they exist
        let mixer = null;
        if (colliderGltf.animations && colliderGltf.animations.length > 0) {
          mixer = new AnimationMixer(colliderModel);
          colliderGltf.animations.forEach((clip) => {
            mixer.clipAction(clip).play();
          });
          this.mixers.push(mixer);
        }
        
        // Load the effects model (visual only, not clickable)
        if (rarity.effectsPath) {
          GLTFLoader.load(rarity.effectsPath, (effectsGltf) => {
            console.log(`Effects model loaded successfully: ${rarity.effectsPath}`);
            const effectsModel = effectsGltf.scene;
            
            // Scale the effects model to match the collider
            const effectsBox = new THREE.Box3().setFromObject(effectsModel);
            const effectsSize = effectsBox.getSize(new THREE.Vector3());
            const effectsScale = rarity.size / effectsSize.y;
            effectsModel.scale.set(effectsScale, effectsScale, effectsScale);
            
            // Position effects model at same position as collider
            effectsModel.position.set(worldX, worldY, config.z || 0);
            
            // Set up animations for effects if they exist
            if (effectsGltf.animations && effectsGltf.animations.length > 0) {
              const effectsMixer = new AnimationMixer(effectsModel);
              effectsGltf.animations.forEach((clip) => {
                effectsMixer.clipAction(clip).play();
              });
              this.mixers.push(effectsMixer);
            }
            
            // Add effects model to scene (not clickable)
            this.scene.add(effectsModel);
            
          }, undefined, (error) => {
            console.error(`An error happened loading effects model ${rarity.effectsPath}`, error);
          });
        }
        
        const cubeObj = { id: config.id, rarity: config.rarity, mesh: colliderModel, mixer: mixer };
        this.cubes.push(cubeObj);
        this.scene.add(colliderModel);
        console.log(`Dual-model cube added to scene. Total cubes: ${this.cubes.length}`);

      }, undefined, (error) => {
        console.error(`An error happened loading collider model ${rarity.colliderPath}`, error);
      });

    } else if (rarity.type === 'model' && rarity.modelPath) {
      // Fallback for single model (legacy support)
      console.log(`Loading single model: ${rarity.modelPath}`);
      GLTFLoader.load(rarity.modelPath, (gltf) => {
        console.log(`Model loaded successfully: ${rarity.modelPath}`);
        const model = gltf.scene;
        
        // Scale the model to match the configured size
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const scale = rarity.size / size.y; // Scale based on height
        model.scale.set(scale, scale, scale);

        const worldX = config.x - (window.innerWidth / 2);
        const worldY = -config.y + (window.innerHeight / 2);
        model.position.set(worldX, worldY, config.z || 0);
        
        // Set up animations if they exist
        let mixer = null;
        if (gltf.animations && gltf.animations.length > 0) {
          mixer = new AnimationMixer(model);
          gltf.animations.forEach((clip) => {
            mixer.clipAction(clip).play();
          });
          this.mixers.push(mixer);
        }
        
        const cubeObj = { id: config.id, rarity: config.rarity, mesh: model, mixer: mixer };
        this.cubes.push(cubeObj);
        this.scene.add(model);
        console.log(`Single model added to scene. Total cubes: ${this.cubes.length}`);

      }, undefined, (error) => {
        console.error(`An error happened loading ${rarity.modelPath}`, error);
      });

    } else if (rarity.type === 'default') {
      const geometry = new THREE.BoxGeometry(rarity.size, rarity.size, rarity.size);
      
      // Create material with glow effect if specified
      let material;
      if (rarity.effect === "glow") {
        material = new THREE.MeshStandardMaterial({ 
          color: rarity.color,
          emissive: rarity.color,
          emissiveIntensity: 0.3
        });
      } else {
        material = new THREE.MeshStandardMaterial({ color: rarity.color });
      }
      
      const cube = new THREE.Mesh(geometry, material);
      
      const worldX = config.x - (window.innerWidth / 2);
      const worldY = -config.y + (window.innerHeight / 2);
      cube.position.set(worldX, worldY, config.z || 0);
      
      const cubeObj = { id: config.id, rarity: config.rarity, mesh: cube };
      this.cubes.push(cubeObj);
      this.scene.add(cube);
      console.log(`3D default cube added to scene. Total cubes: ${this.cubes.length}`);
    }
  },

  removeCube: function(cubeId) {
    const cubeIndex = this.cubes.findIndex(cube => cube.id === cubeId);
    if (cubeIndex !== -1) {
      const cube = this.cubes[cubeIndex];
      
      // Remove from scene
      this.scene.remove(cube.mesh);
      
      // Dispose of geometry and material to prevent memory leaks
      if (cube.mesh.geometry) cube.mesh.geometry.dispose();
      if (cube.mesh.material) {
        if (Array.isArray(cube.mesh.material)) {
          cube.mesh.material.forEach(material => material.dispose());
        } else {
          cube.mesh.material.dispose();
        }
      }
      
      // Remove mixer if it exists
      if (cube.mixer) {
        const mixerIndex = this.mixers.indexOf(cube.mixer);
        if (mixerIndex !== -1) {
          this.mixers.splice(mixerIndex, 1);
        }
      }
      
      // Remove from cubes array
      this.cubes.splice(cubeIndex, 1);
    }
  },

  clearAllCubes: function() {
    this.cubes.forEach(cube => {
      this.scene.remove(cube.mesh);
      if (cube.mesh.geometry) cube.mesh.geometry.dispose();
      if (cube.mesh.material) {
        if (Array.isArray(cube.mesh.material)) {
          cube.mesh.material.forEach(material => material.dispose());
        } else {
          cube.mesh.material.dispose();
        }
      }
    });
    
    this.cubes = [];
    this.mixers = [];
  },

  onMouseDown: function(event) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Store initial mouse position
    this.mouseDownPos = { x: event.clientX, y: event.clientY };
    
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.cubes.map(cube => cube.mesh), true);
    
    if (intersects.length > 0) {
      let topLevelObject = intersects[0].object;
      while (topLevelObject.parent && topLevelObject.parent !== this.scene) {
        topLevelObject = topLevelObject.parent;
      }
      
      const cube = this.cubes.find(c => c.mesh === topLevelObject);
      if (cube) {
        // Only allow dragging on the inventory page (not get-cubes page)
        if (window.location.pathname.includes('index.html')) {
          // Start dragging immediately
          this.isDragging = true;
          this.draggedCube = cube;
          // Keep the outline visible during drag
          this.outlinePass.selectedObjects = [cube.mesh];
        }
      }
    }
  },

  onMouseMove: function(event) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Only allow dragging on the inventory page
    if (this.isDragging && this.draggedCube && window.location.pathname.includes('index.html')) {
      const worldX = this.mouse.x * (window.innerWidth / 2);
      const worldY = this.mouse.y * (window.innerHeight / 2);
      this.draggedCube.mesh.position.x = worldX;
      this.draggedCube.mesh.position.y = worldY;
      return; // Return early when dragging to avoid interference
    }
    
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.cubes.map(cube => cube.mesh), true);
    
    if (intersects.length > 0) {
      let topLevelObject = intersects[0].object;
      while (topLevelObject.parent && topLevelObject.parent !== this.scene) {
        topLevelObject = topLevelObject.parent;
      }

      if (this.intersected !== topLevelObject) {
        this.intersected = topLevelObject;
        this.outlinePass.selectedObjects = [this.intersected];
      }
      
      const cube = this.cubes.find(c => c.mesh === topLevelObject);
      if (cube) {
        window.dispatchEvent(new CustomEvent('cubehover', { detail: cube }));
      }

    } else {
      if (this.intersected) {
        this.intersected = null;
        this.outlinePass.selectedObjects = [];
        window.dispatchEvent(new CustomEvent('cubeleave'));
      }
    }
  },

  onMouseUp: function(event) {
    // Check if mouse moved significantly (more than 5 pixels)
    const hasMoved = this.mouseDownPos && (
      Math.abs(event.clientX - this.mouseDownPos.x) > 5 || 
      Math.abs(event.clientY - this.mouseDownPos.y) > 5
    );
    
    if (this.isDragging && this.draggedCube && hasMoved) {
      // Drag ended, save the new position
      window.dispatchEvent(new CustomEvent('cubedragend', { detail: this.draggedCube }));
      
      // Update mouse position for proper raycaster state
      this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      
      // After dragging, ensure the object is still considered "intersected"
      // so it can be interacted with again immediately.
      this.intersected = this.draggedCube.mesh;
      this.outlinePass.selectedObjects = [this.intersected];

    } else {
      // If not dragging or didn't move much, it was a click
      const intersects = this.raycaster.intersectObjects(this.cubes.map(cube => cube.mesh), true);
      if (intersects.length > 0) {
        let topLevelObject = intersects[0].object;
        while (topLevelObject.parent && topLevelObject.parent !== this.scene) {
          topLevelObject = topLevelObject.parent;
        }
        const cube = this.cubes.find(c => c.mesh === topLevelObject);
        if (cube) {
          // On inventory page, clicking should trash the cube
          if (window.location.pathname.includes('index.html')) {
            window.dispatchEvent(new CustomEvent('cubeclick', { detail: cube }));
          } else {
            // On get-cubes page, clicking should collect the cube
            window.dispatchEvent(new CustomEvent('cubeclick', { detail: cube }));
          }
        }
      }
    }
    this.isDragging = false;
    this.draggedCube = null;
    this.mouseDownPos = null;
  }
}; 