// modelLoader.js
import { Box3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

export class ModelLoader {
    constructor(scene) {
        this.scene = scene;
        this.loader = new GLTFLoader();

        // 創建一個 DRACOLoader 實例
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
        dracoLoader.setDecoderConfig({ type: 'js' });
        this.loader.setDRACOLoader(dracoLoader);
    }

    load(url) {
        return new Promise((resolve, reject) => {
            this.loader.load(url, (gltf) => {
                resolve(gltf);
            }, undefined, (error) => {
                reject(error);
            });
        });
    }

    async loadModels() {
        try {
            const [collider, scene, character] = await Promise.all([
                this.load('./assets/collider.glb'),
                this.load('./assets/castle2.glb'),
                this.load('./assets/character.glb')
            ]);

            [scene.scene, character.scene].forEach(model => {
                model.traverse(function (child) {
                    if (child.isMesh && child.name !== 'Sphere__0') {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
            });

            this.scene.add(scene.scene);

            // 回傳加載的模型，以便在其他地方使用
            return { collider, scene, character };
        } catch (error) {
            console.error('加載模型出錯：', error);
            return null;
        }
    }
}