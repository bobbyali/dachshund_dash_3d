import * as THREE from 'three';
import { rabbits } from './main.js';

export class Radar {
    constructor(playerGroup) {
        this.group = new THREE.Group();

        // Scent Trail (faint line)
        const material = new THREE.LineBasicMaterial({
            color: 0x00FFFF,
            transparent: true,
            opacity: 0.3,
            linewidth: 2 // Note: linewidth is usually 1 on WebGL unless using Line2
        });

        const points = [];
        points.push(new THREE.Vector3(0, 0, 0));
        points.push(new THREE.Vector3(0, 0, -5));

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        this.line = new THREE.Line(geometry, material);
        this.group.add(this.line);

        // Attachment point above dog
        playerGroup.add(this.group);
        this.group.position.set(0, 0.4, -1); // Coming from mouth/nose
    }

    update(playerGroup) {
        if (rabbits.length === 0) {
            this.group.visible = false;
            return;
        }

        // Find closest rabbit
        let closestDist = Infinity;
        let closestRabbit = null;

        for (let r of rabbits) {
            if (r.isDestroyed) continue;
            let dist = playerGroup.position.distanceTo(r.group.position);
            if (dist < closestDist) {
                closestDist = dist;
                closestRabbit = r;
            }
        }

        if (closestRabbit) {
            this.group.visible = true;

            // Get rabbit position in player's local space
            const rabbitWorld = closestRabbit.group.position.clone();
            const playerWorld = new THREE.Vector3();
            this.group.getWorldPosition(playerWorld);

            const localTarget = closestRabbit.group.position.clone();
            this.group.parent.worldToLocal(localTarget);

            // Update line geometry
            // The line starts at 0,0,0 (relative to group)
            // End point is target relative to group
            const localEnd = closestRabbit.group.position.clone();
            this.group.worldToLocal(localEnd);

            const positions = this.line.geometry.attributes.position.array;
            positions[0] = 0; positions[1] = 0; positions[2] = 0;
            positions[3] = localEnd.x; positions[4] = localEnd.y; positions[5] = localEnd.z;
            this.line.geometry.attributes.position.needsUpdate = true;

            // Scent pulse opacity
            this.line.material.opacity = 0.2 + Math.abs(Math.sin(Date.now() * 0.003)) * 0.3;
        } else {
            this.group.visible = false;
        }
    }
}
