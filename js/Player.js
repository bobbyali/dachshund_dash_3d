import * as THREE from 'three';
import { GAME_BOUNDS, MAX_DEPTH, barkEffect, getTerrainHeight, audioCtx, sounds } from './main.js';
import { Radar } from './Radar.js';

function playSound(freq, type, duration) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

// Fallback Bark (if asset fails)
function playFallbackBark() {
    const duration = 0.2;
    const bufferSize = audioCtx.sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(1.0, audioCtx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    noise.start();
}

export function playCatchSound() {
    playSound(800, 'sine', 0.1);
}

export class Player {
    constructor(scene, camera) {
        this.camera = camera;
        this.baseSpeed = 12; // meters per second
        this.speed = this.baseSpeed;
        this.digSpeed = 8;
        this.firstPerson = false;

        // --- Boost ---
        this.boostTimer = 0;
        this.boostDuration = 2.0; // 2 seconds
        this.boostMultiplier = 1.6; // 1.6x speed boost

        // --- Audio ---
        this.pantTimer = 0;

        // --- Geometry ---
        this.group = new THREE.Group();
        this.visuals = new THREE.Group();
        this.group.add(this.visuals);

        const mat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const bodyGeo = new THREE.CylinderGeometry(0.3, 0.4, 2);
        bodyGeo.rotateX(Math.PI / 2);
        this.body = new THREE.Mesh(bodyGeo, mat);
        this.body.castShadow = true;
        this.visuals.add(this.body);

        const headGeo = new THREE.SphereGeometry(0.5, 16, 16);
        this.head = new THREE.Mesh(headGeo, mat);
        this.head.position.set(0, 0.4, -1);
        this.head.castShadow = true;
        this.visuals.add(this.head);

        const pawGeo = new THREE.BoxGeometry(0.15, 0.15, 0.3);
        this.pawL = new THREE.Mesh(pawGeo, mat);
        this.pawR = new THREE.Mesh(pawGeo, mat);
        this.pawL.position.set(-0.25, 0.0, -1.5);
        this.pawR.position.set(0.25, 0.0, -1.5);
        this.visuals.add(this.pawL);
        this.visuals.add(this.pawR);
        this.pawL.visible = false;
        this.pawR.visible = false;

        const legGeo = new THREE.BoxGeometry(0.2, 0.8, 0.2);
        this.legs = [];
        // Move front legs forward (pos[2] = -1.1 instead of -0.7)
        [[-0.3, -0.4, -1.1], [0.3, -0.4, -1.1], [-0.3, -0.4, 0.7], [0.3, -0.4, 0.7]].forEach(pos => {
            const leg = new THREE.Mesh(legGeo, mat);
            leg.position.set(...pos);
            leg.castShadow = true;
            this.visuals.add(leg);
            this.legs.push(leg);
        });

        // --- Ears ---
        const earGeo = new THREE.BoxGeometry(0.15, 0.6, 0.3);
        const earMat = new THREE.MeshStandardMaterial({ color: 0x5C4033 }); // Darker brown
        this.earL = new THREE.Mesh(earGeo, earMat);
        this.earR = new THREE.Mesh(earGeo, earMat);
        this.earL.position.set(-0.5, 0.2, -1);
        this.earR.position.set(0.5, 0.2, -1);
        this.earL.rotation.z = 0.2;
        this.earR.rotation.z = -0.2;
        this.visuals.add(this.earL);
        this.visuals.add(this.earR);

        // --- Tail ---
        const tailGeo = new THREE.CylinderGeometry(0.05, 0.1, 0.8);
        this.tail = new THREE.Mesh(tailGeo, mat);
        this.tail.position.set(0, 0.2, 1.3);
        this.tail.rotation.x = -Math.PI / 4;
        this.visuals.add(this.tail);

        this.group.position.y = 0.8;
        scene.add(this.group);

        this.keys = {};
        this.idleTimer = 0;
        this.lastWhineTime = 0;

        window.addEventListener('keydown', (e) => {
            if (e.key === ' ') e.preventDefault(); // Stop browser scrolling/button clicking
            this.keys[e.key.toLowerCase()] = true;
        });
        window.addEventListener('keyup', (e) => {
            if (e.key === ' ') e.preventDefault();
            this.keys[e.key.toLowerCase()] = false;
            if (e.key.toLowerCase() === 'c') this.firstPerson = !this.firstPerson;
            if (e.key === ' ') this.bark();
        });

        this.barkRadius = 15;
        this.isBarking = false;
        this.radar = new Radar(this.group);
        this.legTime = 0;
    }

    bark() {
        if (this.isBarking) return;
        this.isBarking = true;

        // Boost
        this.boostTimer = this.boostDuration;

        // Sound
        if (sounds.bark && sounds.bark.buffer) {
            sounds.bark.setLoop(false); // Ensure it doesn't loop
            if (sounds.bark.isPlaying) sounds.bark.stop();
            sounds.bark.play();
        } else {
            playFallbackBark();
        }

        barkEffect.classList.add('barking');
        setTimeout(() => barkEffect.classList.remove('barking'), 100);
        setTimeout(() => this.isBarking = false, 1500); // 1.5s cooldown
    }

    update(dt, scene) {
        // --- Boost Update ---
        if (this.boostTimer > 0) {
            this.boostTimer -= dt;
            this.speed = this.baseSpeed * this.boostMultiplier;
            // Visual feedback for boost
            this.body.material.emissive.setHex(0x330000);
        } else {
            this.speed = this.baseSpeed;
            this.body.material.emissive.setHex(0x000000);
        }

        let moved = false;
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.group.quaternion);
        forward.y = 0;
        forward.normalize();

        if (this.keys['w']) { this.group.position.addScaledVector(forward, this.speed * dt); moved = true; }
        if (this.keys['s']) { this.group.position.addScaledVector(forward, -this.speed * dt); moved = true; }
        if (this.keys['a']) { this.group.rotation.y += 2.5 * dt; moved = true; }
        if (this.keys['d']) { this.group.rotation.y -= 2.5 * dt; moved = true; }

        if (this.keys['j']) this.group.position.y -= this.digSpeed * dt;
        if (this.keys['k']) this.group.position.y += this.digSpeed * dt;

        const terrainY = getTerrainHeight(this.group.position.x, this.group.position.z);
        this.group.position.x = Math.max(-GAME_BOUNDS, Math.min(GAME_BOUNDS, this.group.position.x));
        this.group.position.z = Math.max(-GAME_BOUNDS, Math.min(GAME_BOUNDS, this.group.position.z));

        if (this.group.position.y >= terrainY - 0.5) {
            this.group.position.y = terrainY + 0.8;
            this.group.rotation.x = 0;
            this.body.material.color.setHex(0x8B4513);
        } else {
            this.group.position.y = Math.max(MAX_DEPTH, this.group.position.y);
            this.group.rotation.x = -Math.PI / 16;
            this.body.material.color.setHex(0x5C4033);
        }

        // --- Animations ---
        const animSpeed = moved ? (this.boostTimer > 0 ? 25 : 15) : 0;
        if (moved) {
            this.idleTimer = 0;
            this.legTime += dt * animSpeed;
            this.legs[0].rotation.x = Math.sin(this.legTime) * 0.7;
            this.legs[1].rotation.x = Math.sin(this.legTime + Math.PI) * 0.7;
            this.legs[2].rotation.x = Math.sin(this.legTime + Math.PI) * 0.7;
            this.legs[3].rotation.x = Math.sin(this.legTime) * 0.7;

            this.pawL.position.y = 0.0 + Math.sin(this.legTime) * 0.15;
            this.pawR.position.y = 0.0 + Math.sin(this.legTime + Math.PI) * 0.15;
            this.pawL.position.z = -1.5 + Math.cos(this.legTime) * 0.3;
            this.pawR.position.z = -1.5 + Math.cos(this.legTime + Math.PI) * 0.3;

            this.visuals.position.y = Math.abs(Math.sin(this.legTime)) * 0.2;

            // Wag tail while moving
            this.tail.rotation.z = Math.sin(this.legTime * 0.5) * 0.4;

            // Panting Sound (Real Audio) - Louder/More frequent
            if (sounds.pant && sounds.pant.buffer && !sounds.pant.isPlaying) {
                try { sounds.pant.play(); } catch (e) { }
            }
        } else {
            this.idleTimer += dt;
            // Whine if idle for > 5s
            if (this.idleTimer > 5.0 && (Date.now() - this.lastWhineTime > 8000)) {
                if (sounds.whine && sounds.whine.buffer) {
                    sounds.whine.play();
                    this.lastWhineTime = Date.now();
                }
            }

            this.legs.forEach(l => l.rotation.x = 0);
            this.pawL.position.y = 0.0; this.pawR.position.y = 0.0;
            this.pawL.position.z = -1.5; this.pawR.position.z = -1.5;
            this.visuals.position.y = 0;
            this.tail.rotation.z = 0;

            if (sounds.pant && sounds.pant.isPlaying) {
                sounds.pant.stop();
            }
        }

        if (this.firstPerson) {
            this.body.visible = false;
            this.head.visible = false;
            this.legs.forEach(l => l.visible = false);
            this.earL.visible = false;
            this.earR.visible = false;
            this.tail.visible = false;
            this.pawL.visible = true;
            this.pawR.visible = true;
            const camPos = new THREE.Vector3(0, 0.4 + this.visuals.position.y, -1.0).applyMatrix4(this.group.matrixWorld);
            this.camera.position.copy(camPos);
            this.camera.lookAt(camPos.clone().add(new THREE.Vector3(0, -0.3, -5).applyQuaternion(this.group.quaternion)));
        } else {
            this.body.visible = true;
            this.head.visible = true;
            this.legs.forEach(l => l.visible = true);
            this.earL.visible = true;
            this.earR.visible = true;
            this.tail.visible = true;
            this.pawL.visible = false;
            this.pawR.visible = false;
            const backOffset = new THREE.Vector3(0, 3, 5).applyQuaternion(this.group.quaternion);
            this.camera.position.copy(this.group.position).add(backOffset);
            this.camera.lookAt(this.group.position.x, this.group.position.y + 1, this.group.position.z);
        }

        this.radar.update(this.group);
    }
}
