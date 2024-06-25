// main.js
import * as THREE from 'three';
import * as dat from 'dat.gui';
import { initializeScene, onWindowResize } from './sceneSetup';
import { PhysicsWorld } from './physicsWorld';
import { ModelLoader } from './modelLoader';
import { GameManager } from './gameManager';
import { InputManager } from './inputManager';

async function main() {
    const { scene, camera, renderer, pointerLockControls, csm } = initializeScene();
    onWindowResize(camera, renderer);

    const deviceType = detectDevice();
    const touchSupported = isTouchDevice();

    const gui = new dat.GUI();

    const physicsWorld = new PhysicsWorld(scene, gui);
    
    let gameManager;
    let inputManager;

    async function loadModels() {
        const modelLoader = new ModelLoader(scene);
        try {
            // 加載模型
            const models = await modelLoader.loadModels();
            const { collider, character } = models;

            // 生成地圖碰撞
            physicsWorld.createScene(collider.scene);

            // 玩家及顧客邏輯
            gameManager = new GameManager(scene, physicsWorld, character, pointerLockControls, camera, deviceType, touchSupported);

            inputManager = new InputManager(gameManager, camera, pointerLockControls, deviceType, touchSupported);
            inputManager.init();
        } catch (error) {
            console.error('加載模型出錯：', error);
        }
    }
    
    async function initPhysics() {
        await physicsWorld.init();
        await loadModels();
    }
    
    initPhysics();

    // 物理世界更新循環
    const clock = new THREE.Clock();

    function update() {
        if (!physicsWorld.physicsWorldInitComplete) return;

        const deltaTime = clock.getDelta();
    
        physicsWorld.update(deltaTime);
        if (gameManager?.connectionActive) {
            Object.values(gameManager.players).forEach(player => {
                player.update(deltaTime, inputManager.keysPressed);
            });
            if (inputManager) inputManager.update();
        }
    
        csm.update();
        renderer.render(scene, camera);
    }
    
    renderer.setAnimationLoop(update);


    function detectDevice() {
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    
        // 檢測各種移動裝置
        if (/android/i.test(userAgent)) {
            return "Android";
        }
    
        if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
            return "iOS";
        }
    
        if (/Windows Phone/i.test(userAgent) || /IEMobile/i.test(userAgent)) {
            return "Windows Phone";
        }
    
        return "Desktop"; // 默認是桌電
    }
    
    function isTouchDevice() {
        return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0);
    }
    
}

main();