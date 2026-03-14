import * as THREE from 'three';
import { Player } from './Player.js';
import { Rabbit } from './Rabbit.js';

// --- Game State ---
export const GAME_BOUNDS = 50; // -50 to 50 = 100m total width/depth
export const MAX_DEPTH = -20;
let score = 0;
let timeRemaining = 60; // 1 minute
let isGameOver = false;
let isGameStarted = false; // Declared here
let lastTime = 0;

// --- DOM Elements ---
const scoreDisplay = document.getElementById('score-display');
const timeDisplay = document.getElementById('time-display');
const gameOverScreen = document.getElementById('game-over');
const finalScoreDisplay = document.getElementById('final-score');
export const barkEffect = document.getElementById('bark-effect');

// --- Three.js Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // Sky blue
scene.fog = new THREE.FogExp2(0x87CEEB, 0.015);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(50, 100, 50);
dirLight.castShadow = true;
dirLight.shadow.camera.top = 100;
dirLight.shadow.camera.bottom = -100;
dirLight.shadow.camera.left = -100;
dirLight.shadow.camera.right = 100;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

// --- Environment ---
// Hilly Ground
const segments = 64;
const groundGeo = new THREE.PlaneGeometry(GAME_BOUNDS * 2.5, GAME_BOUNDS * 2.5, segments, segments);

// Procedural Hills
const pos = groundGeo.attributes.position;
export function getTerrainHeight(x, z) {
    // Taller, obvious rolling hills
    return Math.sin(x * 0.05) * Math.cos(z * 0.05) * 4.0 + Math.sin(x * 0.02) * 2.5;
}

for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    // PlaneGeometry sits flat on XY. We rotate it -90 on X later.
    // So its local Y maps to world -Z, and local Z maps to world Y.
    // Thus we set local Z to create elevation.
    pos.setZ(i, getTerrainHeight(px, -py));
}
groundGeo.computeVertexNormals();

const groundMat = new THREE.MeshStandardMaterial({
    color: 0x5CAD4A, // Brighter, inviting green
    roughness: 0.9,
    metalness: 0.1,
    flatShading: true, // Make hill facets visible
    polygonOffset: true,
    polygonOffsetFactor: -1, // Push away to prevent Z-fighting with dirt
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// --- Audio ---
export const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
export const listener = new THREE.AudioListener();
camera.add(listener);
export const audioLoader = new THREE.AudioLoader();
audioLoader.setCrossOrigin('anonymous'); // Critical for external assets

// --- Sound Managers ---
export const sounds = {
    bark: new THREE.Audio(listener),
    pant: new THREE.Audio(listener),
    music: new THREE.Audio(listener),
    yikes: new THREE.Audio(listener),
    catch: new THREE.Audio(listener),
    whine: new THREE.Audio(listener)
};

let musicEnabled = true;
let sfxEnabled = true;

function updateAudioVolumes() {
    if (musicEnabled) {
        if (sounds.music.buffer && !sounds.music.isPlaying && isGameStarted) {
            sounds.music.play();
        }
        sounds.music.setVolume(0.15);
    } else {
        if (sounds.music.isPlaying) {
            sounds.music.pause();
        }
        sounds.music.setVolume(0);
    }

    const sfxVol = sfxEnabled ? 1.0 : 0;
    sounds.bark.setVolume(sfxVol * 0.25); // Quieter bark
    sounds.pant.setVolume(sfxVol * 0.6);  // Louder panting
    sounds.yikes.setVolume(sfxVol * 0.6);
    sounds.whine.setVolume(sfxVol * 0.8); // Louder whines
}

// UI Setup
function setupUI() {
    const musicBtn = document.getElementById('music-toggle');
    const sfxBtn = document.getElementById('sfx-toggle');

    // Prevent spacebar from triggering the last-clicked button
    musicBtn.onfocus = e => e.target.blur();
    sfxBtn.onfocus = e => e.target.blur();

    // Prevent clicking buttons from locking the mouse or starting the game
    musicBtn.onmousedown = e => e.stopPropagation();
    sfxBtn.onmousedown = e => e.stopPropagation();

    musicBtn.onclick = (e) => {
        e.stopPropagation(); // Don't trigger game start if clicking toggle
        musicEnabled = !musicEnabled;
        musicBtn.innerText = `Music: ${musicEnabled ? 'ON 🎵' : 'OFF 🔇'}`;
        musicBtn.classList.toggle('off', !musicEnabled);
        updateAudioVolumes();
    };

    sfxBtn.onclick = (e) => {
        e.stopPropagation();
        sfxEnabled = !sfxEnabled;
        sfxBtn.innerText = `SFX: ${sfxEnabled ? 'ON 🔊' : 'OFF 🔇'}`;
        sfxBtn.classList.toggle('off', !sfxEnabled);
        updateAudioVolumes();
    };
}
setupUI();

// Underground (Dirt layer - moved much lower to avoid clipping)
const dirtGeo = new THREE.BoxGeometry(GAME_BOUNDS * 2.5, 50, GAME_BOUNDS * 2.5);
const dirtMat = new THREE.MeshStandardMaterial({ color: 0x5C4033 });
const dirt = new THREE.Mesh(dirtGeo, dirtMat);
dirt.position.y = -35; // Far below the lowest hills
scene.add(dirt);

// --- Music & Audio Loading ---
function setupAudio() {
    const splash = document.createElement('div');
    splash.id = "audio-start-hint";

    const img = document.createElement('img');
    img.id = "splash-image";
    img.src = "./assets/splash.png";
    splash.appendChild(img);

    const prompt = document.createElement('div');
    prompt.id = "start-prompt";
    prompt.innerHTML = "TAP TO START HUNT! 🐾";
    splash.appendChild(prompt);

    document.body.appendChild(splash);

    const startAudio = () => {
        if (isGameStarted) return;
        isGameStarted = true;

        audioCtx.resume().then(() => {
            splash.style.opacity = '0';
            setTimeout(() => {
                if (splash.parentNode) splash.parentNode.removeChild(splash);
            }, 800);

            // Background Music (Local)
            audioLoader.load('./assets/audio/music.mp3', (buffer) => {
                sounds.music.setBuffer(buffer);
                sounds.music.setLoop(true);
                updateAudioVolumes();
            }, undefined, (err) => console.error("Music load fail", err));

            // Real Dachshund Bark (Local)
            audioLoader.load('./assets/audio/bark.mp3', (buffer) => {
                sounds.bark.setBuffer(buffer);
                updateAudioVolumes();
            }, undefined, (err) => console.error("Bark load fail", err));

            // Panting (Local)
            audioLoader.load('./assets/audio/pant.mp3', (buffer) => {
                sounds.pant.setBuffer(buffer);
                sounds.pant.setLoop(true);
                updateAudioVolumes();
            }, undefined, (err) => console.error("Pant load fail", err));

            // Rabbit Yikes (Local)
            audioLoader.load('./assets/audio/yikes.mp3', (buffer) => {
                sounds.yikes.setBuffer(buffer);
                updateAudioVolumes();
            }, undefined, (err) => console.error("Yikes load fail", err));

            // Dog Whine (Local)
            audioLoader.load('./assets/audio/whine.mp3', (buffer) => {
                sounds.whine.setBuffer(buffer);
                updateAudioVolumes();
            }, undefined, (err) => console.error("Whine load fail", err));
        });
    };

    window.addEventListener('mousedown', startAudio);
}
setupAudio();

// Trees
function createTree(x, z) {
    const treeGrp = new THREE.Group();

    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 3);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.5;
    trunk.castShadow = true;
    trunk.receiveShadow = true;

    // Leaves
    const leavesGeo = new THREE.SphereGeometry(2.5, 7, 7);
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x228B22 });
    const leaves = new THREE.Mesh(leavesGeo, leavesMat);
    leaves.position.y = 4;
    leaves.castShadow = true;

    treeGrp.add(trunk);
    treeGrp.add(leaves);

    // Fix: Align with terrain height
    const y = getTerrainHeight(x, z);
    treeGrp.position.set(x, y, z);
    scene.add(treeGrp);
}

// Add random trees
for (let i = 0; i < 40; i++) {
    const x = (Math.random() - 0.5) * (GAME_BOUNDS * 2 - 10);
    const z = (Math.random() - 0.5) * (GAME_BOUNDS * 2 - 10);
    createTree(x, z);
}

// --- Entities ---
export const player = new Player(scene, camera);
export const rabbits = [];

// Spawn initial rabbits
for (let i = 0; i < 5; i++) {
    spawnRabbit();
}

function spawnRabbit() {
    if (rabbits.length > 10) return; // Cap at 10 active rabbits
    const r = new Rabbit(scene);
    rabbits.push(r);
}

// Particle System list
export const particles = [];

// --- Game Logic ---
export function addScore() {
    score++;
    scoreDisplay.innerText = `Score: ${score}`;
    spawnRabbit(); // Spawn a new one immediately
}

function updateTimer(dt) {
    if (isGameOver) return;

    timeRemaining -= dt;
    if (timeRemaining <= 0) {
        timeRemaining = 0;
        isGameOver = true;
        gameOverScreen.style.display = 'block';
        finalScoreDisplay.innerText = `You caught ${score} rabbits!`;
    }

    const minutes = Math.floor(timeRemaining / 60);
    const seconds = Math.floor(timeRemaining % 60);
    timeDisplay.innerText = `Time: ${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// --- Animation Loop ---
function animate(time) {
    requestAnimationFrame(animate);

    // Calculate delta time
    time *= 0.001; // Convert to seconds
    const dt = time - lastTime;
    lastTime = time;

    // Only update game state if started and not over
    if (isGameStarted && !isGameOver) {
        updateTimer(dt);
        player.update(dt, scene);

        // Update rules backward because we might remove them
        for (let i = rabbits.length - 1; i >= 0; i--) {
            rabbits[i].update(dt, player);
            if (rabbits[i].isDestroyed) {
                rabbits.splice(i, 1);
            }
        }

        for (let i = particles.length - 1; i >= 0; i--) {
            particles[i].update(dt);
            if (particles[i].life <= 0) {
                scene.remove(particles[i].mesh);
                particles.splice(i, 1);
            }
        }
    }

    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start loop
requestAnimationFrame(animate);
