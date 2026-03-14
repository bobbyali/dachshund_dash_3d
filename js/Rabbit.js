import * as THREE from 'three';
import { GAME_BOUNDS, addScore, particles, getTerrainHeight, sounds } from './main.js';

export class ParticleSystem {
    constructor(scene, position) {
        this.mesh = new THREE.Group();
        this.particles = [];
        this.life = 1.0;

        const colors = [0xFF0000, 0xFFA500, 0xFFFF00, 0x008000, 0x0000FF, 0x4B0082, 0xEE82EE];
        for (let i = 0; i < 40; i++) {
            const geo = new THREE.SphereGeometry(0.1, 4, 4);
            const mat = new THREE.MeshBasicMaterial({ color: colors[i % colors.length] });
            const p = new THREE.Mesh(geo, mat);
            p.userData.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 8,
                (Math.random() + 0.5) * 8,
                (Math.random() - 0.5) * 8
            );
            this.mesh.add(p);
            this.particles.push(p);
        }
        this.mesh.position.copy(position);
        scene.add(this.mesh);
    }

    update(dt) {
        this.life -= dt;
        this.particles.forEach(p => {
            p.position.addScaledVector(p.userData.velocity, dt);
            p.userData.velocity.y -= 9.8 * dt; // gravity
            p.scale.multiplyScalar(0.95);
        });
    }
}

export class Rabbit {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.isDestroyed = false;
        this.speed = 9;
        this.zigTime = 0;
        this.zigDir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
        this.isFrozen = false;
        this.isPanicked = false;

        // --- Body ---
        const mat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF });
        const bodyGeo = new THREE.SphereGeometry(0.4, 16, 16);
        this.body = new THREE.Mesh(bodyGeo, mat);
        this.body.castShadow = true;
        this.group.add(this.body);

        const headGeo = new THREE.SphereGeometry(0.3, 16, 16);
        this.head = new THREE.Mesh(headGeo, mat);
        this.head.position.set(0, 0.4, -0.4);
        this.head.castShadow = true;
        this.group.add(this.head);

        const earGeo = new THREE.CapsuleGeometry(0.06, 0.5);
        const earL = new THREE.Mesh(earGeo, mat);
        earL.position.set(-0.15, 0.8, -0.4);
        earL.rotation.z = -0.3;
        const earR = new THREE.Mesh(earGeo, mat);
        earR.position.set(0.15, 0.8, -0.4);
        earR.rotation.z = 0.3;
        this.group.add(earL);
        this.group.add(earR);

        const legGeo = new THREE.SphereGeometry(0.15, 8, 8);
        [[-0.2, -0.3, -0.3], [0.2, -0.3, -0.3], [-0.2, -0.3, 0.3], [0.2, -0.3, 0.3]].forEach(p => {
            const leg = new THREE.Mesh(legGeo, mat);
            leg.position.set(...p);
            this.group.add(leg);
        });

        // Panic Indicator (!)
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'red';
        ctx.font = 'bold 60px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('!', 32, 50);
        const tex = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: tex });
        this.panicSprite = new THREE.Sprite(spriteMat);
        this.panicSprite.scale.set(1, 1, 1);
        this.panicSprite.position.y = 1.2;
        this.panicSprite.visible = false;
        this.group.add(this.panicSprite);

        const x = (Math.random() - 0.5) * (GAME_BOUNDS * 1.5);
        const z = (Math.random() - 0.5) * (GAME_BOUNDS * 1.5);
        this.group.position.set(x, getTerrainHeight(x, z) + 0.4, z);
        scene.add(this.group);
    }

    destroy() {
        if (this.isDestroyed) return;
        this.isDestroyed = true;
        particles.push(new ParticleSystem(this.scene, this.group.position));
        this.scene.remove(this.group);
        addScore();

        // Yikes sound
        if (sounds.yikes && sounds.yikes.buffer) {
            if (sounds.yikes.isPlaying) sounds.yikes.stop();
            sounds.yikes.play();
        }
    }

    update(dt, player) {
        if (this.isDestroyed) return;

        const distToPlayer = this.group.position.distanceTo(player.group.position);

        // --- Bark Logic ---
        if (player.isBarking && distToPlayer < 15) {
            this.isFrozen = true;
            this.group.position.y = getTerrainHeight(this.group.position.x, this.group.position.z) + 1.5; // Jump in fright
            setTimeout(() => this.isFrozen = false, 1000);
        }

        // --- Panic logic ---
        if (distToPlayer < 10) {
            if (!this.isPanicked) {
                this.isPanicked = true;
                this.panicSprite.visible = true;
                // Play yikes sound when panic starts
                if (sounds.yikes && sounds.yikes.buffer) {
                    if (sounds.yikes.isPlaying) sounds.yikes.stop();
                    sounds.yikes.play();
                }
            }
        } else {
            this.isPanicked = false;
            this.panicSprite.visible = false;
        }

        if (!this.isFrozen) {
            // Flee from dog
            const fleeDir = new THREE.Vector3().subVectors(this.group.position, player.group.position).normalize();
            fleeDir.y = 0;

            this.zigTime += dt;
            if (this.zigTime > 0.8) {
                this.zigTime = 0;
                this.zigDir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
            }

            const moveDir = fleeDir.lerp(this.zigDir, 0.4).normalize();
            this.group.position.addScaledVector(moveDir, this.speed * dt);

            // Look direction
            this.group.lookAt(this.group.position.clone().add(moveDir));
            this.group.rotateY(Math.PI);

            // Ground stick
            const ty = getTerrainHeight(this.group.position.x, this.group.position.z);
            if (this.group.position.y > ty + 0.5) {
                this.group.position.y -= 10 * dt; // Gravity
            } else {
                this.group.position.y = ty + 0.4;
            }
        }

        // Clamp
        this.group.position.x = Math.max(-GAME_BOUNDS, Math.min(GAME_BOUNDS, this.group.position.x));
        this.group.position.z = Math.max(-GAME_BOUNDS, Math.min(GAME_BOUNDS, this.group.position.z));

        // --- Catch Logic ---
        if (distToPlayer < 6.0) {
            this.destroy();
        }
    }
}
