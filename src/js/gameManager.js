// gameManager.js
import * as THREE from 'three';
import { CharacterControls } from './character';

export class GameManager {
    constructor(scene, physicsWorld, character, pointerLockControls, camera, deviceType, touchSupported) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.character = character;
        this.pointerLockControls = pointerLockControls;
        this.camera = camera;
        this.deviceType = deviceType;
        this.touchSupported = touchSupported;

        this.players = {};
        this.playerHeight = 3.35;
        this.playerOnGround = this.playerHeight / 2;
        this.playerOnGround = 8;
        this.clientId = null;
        this.wsUrl = 'wss://a-resume.fly.dev'; // WebSocket URL
        // this.wsUrl = 'ws://localhost:3000'; // WebSocket URL
        this.ws = null;

        this.timeoutId = null;
        this.TIMEOUT_DURATION = 3 * 60 * 1000; // 定義自動斷線時間（3分鐘）
        this.connectionActive = true; // 連線中

        this.setupReconnectListener();
        this.openWebSocket(); // 初始連接
    }

    // 封裝 WebSocket 連接
    openWebSocket() {
        this.ws = new WebSocket(this.wsUrl);
        this.ws.onopen = () => {
            console.log('連接到服務器');
            this.connectionActive = true;
            this.setupActivityListener();
        };

        this.ws.onclose =  () => {
            console.log('WebSocket 連接已關閉');
            this.connectionActive = false; // 更新連線狀態
            document.getElementById('modal').showModal(); // 顯示重新連接的模態框
            if (this.deviceType === 'Desktop' && !this.touchSupported) {
                this.pointerLockControls.unlock();
            }
        };

        this.ws.onmessage = (event) => {
            if (event.data instanceof Blob) {
                event.data.text().then((text) => {
                    this.processMessage(JSON.parse(text));
                });
            } else {
                this.processMessage(JSON.parse(event.data));
            }
        };
    }

    resetTimeout() {
        if (!this.connectionActive) return;
        clearTimeout(this.timeoutId);
        this.timeoutId = setTimeout(() => {
            this.ws.close();
        }, this.TIMEOUT_DURATION);
    }

    setupActivityListener() {
        // 監聽常見的用戶活動
        ['mousemove', 'keydown', 'touchstart', 'touchmove', 'click'].forEach(event => {
            document.addEventListener(event, () => this.resetTimeout(), { passive: true });
        });
    
        // 初始化計時器
        this.resetTimeout();
    }

    // 設置重新連接的按鈕監聽器
    setupReconnectListener() {
        document.getElementById('connection').addEventListener('click', () => {
            if (!this.connectionActive) {
                console.log('重新連接中...');

                // 清除所有角色後重新連線
                Object.values(this.players).forEach(player => {
                    if (player.model) this.scene.remove(player.model);
                    this.physicsWorld.worker.postMessage({
                        type: 'removeRigidBody',
                        data: player.clientId
                    });
                });
                this.players = {};

                this.openWebSocket(); // 重新創建 WebSocket 連接
            }
        });
    }

    processMessage(data) {
        // 根據data.type處理不同類型的消息
        if (data.type === 'assignId') {
            this.clientId = data.id;
            // 創建本地玩家
            this.addPlayer(data.id, { x: 0, y: this.playerOnGround, z: 0 }, true);
        } else if (data.type === 'newPlayer' && data.id !== this.clientId) {
            // 新加入的玩家
            this.addPlayer(data.id, { x: 0, y: this.playerOnGround, z: 0 }, false);
        } else if (data.type === 'existingPlayers') {
            // 處理現有玩家信息
            data.players.forEach(playerInfo => {
                // 確保不重新添加自己，並且該玩家尚未存在於玩家列表中
                if (playerInfo.id !== this.clientId && !this.players[playerInfo.id]) {
                    const q = playerInfo.quaternion;
                    this.addPlayer(playerInfo.id, playerInfo.position, false, new THREE.Quaternion(q.x, q.y, q.z, q.w));
                }
            });
        } else if (data.type === 'playerLeft') {
            // 玩家離開
            const player = this.players[data.id];
            if (player) {
                if (player.model) this.scene.remove(player.model);
                this.physicsWorld.worker.postMessage({
                    type: 'removeRigidBody',
                    data: data.id
                });
                delete this.players[data.id];
            }
        } else if (data.type === 'move') {
            // 更新玩家位置
            const { id, position, quaternion } = data;
            const player = this.players[id];
            if (player && !player.isLocalPlayer) {
                this.physicsWorld.worker.postMessage({
                    type: 'updatePosition',
                    data: { id, position, quaternion }
                });

                if (player.currentAction !== data.action) {
                    player.playAnimation(data.action);
                }
            }
        } else if (data.type === 'neckRotationX') {
            const player = this.players[data.id];
            if (player && !player.isLocalPlayer) {
                player.neckRotationX = data.neckRotationX;
            }
        }
    }

    addPlayer(id, position, isLocalPlayer, quaternion = new THREE.Quaternion(0, 0, 0, 1)) {
        const newPlayer = new CharacterControls(
            this.players,
            this.physicsWorld,
            this.scene,
            position,
            quaternion,
            this.character,
            this.playerHeight,
            this.pointerLockControls,
            this.camera,
            this.ws,
            isLocalPlayer,
            id,
        );
        this.players[id] = newPlayer;
    }
}