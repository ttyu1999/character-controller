// physicsWorld.js
import * as THREE from 'three';

export class PhysicsWorld {
    constructor(scene, gui) {
        this.scene = scene;
        this.gui = gui;
        this.bodies = [];
        this.worker = new Worker(new URL('./physicsWorker.js', import.meta.url), { type: 'module' });
        this.physicsWorldInitComplete = false;

        this.worker.onmessage = (event) => {
            const message = event.data;
            switch (message.type) {
                case 'initComplete':
                    this.onInitComplete();
                    break;
                default:
                    break;
            }
        };

        this.mesh = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, vertexColors: true }));
        this.mesh.frustumCulled = false;
        this.scene.add(this.mesh);
        this.enabledDebug = false;

        this.worker.onmessage = (event) => {
            const message = event.data;
            if (message.type === 'debug') {
                this.renderDebug(message.data);
            }
        };
    }

    init() {
        this.debug = {
            debug: false,
        };
        this.gui.add(this.debug, 'debug').name('Debug').onChange(isApplied => {
            this.enabledDebug = isApplied;
        });

        return new Promise((resolve) => {
            this.worker.postMessage({ type: 'init' });
            this.worker.onmessage = (event) => {
                const message = event.data;
                if (message.type === 'initComplete') {
                    this.physicsWorldInitComplete = true;
                    resolve();
                }
            };
        });
    }

    onInitComplete() {
        this.physicsWorldInitComplete = true;
    }

    renderDebug(debugRender) {
        if (this.enabledDebug) {
            const { vertices, colors } = debugRender;

            this.mesh.geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            this.mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
            this.mesh.visible = true;
        } else {
            this.mesh.visible = false;
        }
    }

    step() {
        if (!this.physicsWorldInitComplete) return;
        this.worker.postMessage({ type: 'step' });
    }

    createScene(model) {
        const serializedModel = [];
        model.traverse(child => {
            if (child.isMesh && child.geometry && child.geometry.attributes.position) {
                serializedModel.push({
                    vertices: Array.from(child.geometry.attributes.position.array),
                    indices: child.geometry.index ? Array.from(child.geometry.index.array) : null
                });
            }
        });
        this.worker.postMessage({ type: 'createScene', data: serializedModel });
    }

    createCharacter(data) {
        this.worker.postMessage({ type: 'createCharacter', data });
    }

    update() {
        this.step();
        if (this.enabledDebug) {
            this.worker.postMessage({ type: 'debug' });
        }
    }
}
