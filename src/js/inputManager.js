import * as THREE from 'three';
import { SHIFT, ENTER, V } from './utils';

export class InputManager {
    constructor(gameManager, camera, pointerLockControls, deviceType, touchSupported) {
        this.gameManager = gameManager;
        this.camera = camera;
        this.pointerLockControls = pointerLockControls;
        this.deviceType = deviceType;
        this.touchSupported = touchSupported;
        this.maxDistance = document.getElementById('move-joystick').offsetWidth;  // 搖桿活動半徑

        this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
        this.PI_2 = Math.PI / 2;

        this.keysPressed = {};

        const keys = [...SHIFT, ...ENTER, ...V];

        this.lastKeyPressTime = {};
        keys.forEach(key => {
            this.lastKeyPressTime[key] = 0;
        });
        this.keyPressInterval = 300; // 300毫秒

        this.ws = this.gameManager.ws;
    }

    init() {
        this.joystickActive = false;
        this.joystickTouchId = null;
        this.lastTouchX = 0;
        this.lastTouchY = 0;

        document.addEventListener('keydown', this.handleKeyDown.bind(this), false);
        document.addEventListener('click', this.handleClick.bind(this), false);
        document.addEventListener('keyup', this.handleKeyUp.bind(this), false);
        document.addEventListener('mousemove', this.handleMouseMove.bind(this), false);
        document.getElementById('jump-icon').addEventListener('touchstart', () => {
            this.keysPressed[' '] = true;
        }, false);
        document.getElementById('jump-icon').addEventListener('touchend', () => {
            this.keysPressed[' '] = false;
        }, false);
        document.getElementById('yes-icon').addEventListener('touchstart', () => {
            this.keysPressed['1'] = true;
        }, false);
        document.getElementById('yes-icon').addEventListener('touchend', () => {
            this.keysPressed['1'] = false;
        }, false);
        document.getElementById('no-icon').addEventListener('touchstart', () => {
            this.keysPressed['2'] = true;
        }, false);
        document.getElementById('no-icon').addEventListener('touchend', () => {
            this.keysPressed['2'] = false;
        }, false);
        document.getElementById('wave-icon').addEventListener('touchstart', () => {
            this.keysPressed['3'] = true;
        }, false);
        document.getElementById('wave-icon').addEventListener('touchend', () => {
            this.keysPressed['3'] = false;
        }, false);
        document.getElementById('view-icon').addEventListener('touchstart', () => {
            this.keysPressed['v'] = true;
        }, false);
        document.getElementById('view-icon').addEventListener('touchend', () => {
            this.keysPressed['v'] = false;
        }, false);
        
        if (this.touchSupported) {
            document.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
            document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
            document.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
        }
    }

    updateJoystick(touch, joystick, stick) {
        const centerX = joystick.offsetLeft + joystick.offsetWidth / 2;
        const centerY = joystick.offsetTop + joystick.offsetHeight / 2;
    
        let dx = touch.clientX - centerX;
        let dy = touch.clientY - centerY;
        let distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > this.maxDistance) {
            dx = dx / distance * this.maxDistance;
            dy = dy / distance * this.maxDistance;
        }

        const currentTransform = stick.style.transform.match(/translate\((.*)px, (.*)px\)/);
        const currentX = currentTransform ? parseFloat(currentTransform[1]) : 0;
        const currentY = currentTransform ? parseFloat(currentTransform[2]) : 0;
    
        const moveX = (dx - currentX) * 0.5;  // 平滑移動
        const moveY = (dy - currentY) * 0.5;
    
        const newX = currentX + moveX;
        const newY = currentY + moveY;
    
        stick.style.transform = `translate(calc(-50% + ${newX}px), calc(-50% + ${newY}px))`;

        this.keysPressed['w'] = dy < -this.maxDistance * 0.2;
        this.keysPressed['s'] = dy > this.maxDistance * 0.2;
        this.keysPressed['a'] = dx < -this.maxDistance * 0.2;
        this.keysPressed['d'] = dx > this.maxDistance * 0.2;
    }

    handleTouchStart(event) {
        for (let touch of event.touches) {
            if (this.isTouchInJoystick(touch) && this.joystickTouchId === null) {
                this.joystickActive = true;
                this.joystickTouchId = touch.identifier;  // 記錄觸摸點 ID
                this.updateJoystick(touch, document.getElementById('move-joystick'), document.getElementById('move-stick'));
                event.preventDefault();
            } else {
                this.lastTouchX = touch.clientX;
                this.lastTouchY = touch.clientY;
            }
        }
    }

    handleTouchMove(event) {
        for (let touch of event.touches) {
            if (touch.identifier === this.joystickTouchId && this.joystickActive) {
                this.updateJoystick(touch, document.getElementById('move-joystick'), document.getElementById('move-stick'));
            } else {
                const touchX = touch.clientX;
                const touchY = touch.clientY;
                const deltaX = touchX - this.lastTouchX;
                const deltaY = touchY - this.lastTouchY;
                this.lastTouchX = touchX;
                this.lastTouchY = touchY;

                Object.values(this.gameManager.players).forEach(player => {
                    if (player && player.isLocalPlayer) {
                        if (player.isFirstPerson) {
                            const newNeckRotationX = Math.min(Math.max(player.neckRotationX - deltaY * player.neckRotationSpeed * 3, -player.maxNeckRotationX), player.maxNeckRotationX);

                            const hasSignificantChange = player.lastNeckRotationX === null || Math.abs(newNeckRotationX - player.lastNeckRotationX) > player.rotationChangeThreshold;

                            const now = Date.now();
                            if (hasSignificantChange && now - player.lastSocketUpdateTime >= player.socketUpdateInterval) {
                                player.lastSocketUpdateTime = now;
                                player.lastNeckRotationX = newNeckRotationX;

                                const updateData = {
                                    type: "neckRotationX", 
                                    id: player.clientId, 
                                    neckRotationX: newNeckRotationX
                                };

                                player.ws.send(JSON.stringify(updateData));
                            }

                            const updateData = {
                                type: "neckRotationX", 
                                id: player.clientId, 
                                neckRotationX: newNeckRotationX
                            };

                            player.ws.send(JSON.stringify(updateData));

                            player.neckRotationX = newNeckRotationX;

                            this.euler.setFromQuaternion(this.camera.quaternion);

                            this.euler.y -= deltaX * 0.003;
                            this.euler.x -= deltaY * 0.003;

                            this.euler.x = Math.max(-this.PI_2, Math.min(this.PI_2, this.euler.x));

                            this.camera.quaternion.setFromEuler(this.euler);
                        } else {
                            player.rotationX -= deltaX * 0.005; 
                            player.rotationY += deltaY * 0.005;

                            player.rotationY = Math.max(0, Math.min(Math.PI / 2, player.rotationY));
                        }
                    }
                });
            }
        }
    
        event.preventDefault(); // 阻止默認行為
    }

    handleTouchEnd(event) {
        const stick = document.getElementById('move-stick');
        for (let touch of event.changedTouches) {
            if (touch.identifier === this.joystickTouchId) {
                this.joystickActive = false;
                this.joystickTouchId = null;
                stick.style.transform = `translate(-50%, -50%)`;
                this.keysPressed['w'] = false;
                this.keysPressed['a'] = false;
                this.keysPressed['s'] = false;
                this.keysPressed['d'] = false;
                event.preventDefault(); // 阻止默認行為
            }
        }
    }

    isTouchInJoystick(touch) {
        const joystick = document.getElementById('move-joystick');
        const rect = joystick.getBoundingClientRect();
        return (
            touch.clientX >= rect.left &&
            touch.clientX <= rect.right &&
            touch.clientY >= rect.top &&
            touch.clientY <= rect.bottom
        );
    }

    handleMouseMove(event) {
        Object.values(this.gameManager.players).forEach(player => {
            if (player && player.isLocalPlayer) {
                if (!this.pointerLockControls.isLocked || !this.gameManager.connectionActive) return;

                // 滑鼠 Y 軸移動量控制脖子旋轉
                if (player.isFirstPerson) {
                    const deltaY = event.movementY || event.mozMovementY || event. webkitMovementY || 0;

                    const newNeckRotationX = Math.min(Math.max(player.neckRotationX - deltaY * player.neckRotationSpeed, -player.maxNeckRotationX), player.maxNeckRotationX);

                    // 檢查變化量是否超過閾值
                    const hasSignificantChange = player.lastNeckRotationX === null || Math.abs(newNeckRotationX - player.lastNeckRotationX) > player.rotationChangeThreshold;

                    // 僅在角度變化超過閾值且達到時間間隔時發送
                    const now = Date.now();
                    if (hasSignificantChange && now - player.lastSocketUpdateTime >= player.socketUpdateInterval) {
                        player.lastSocketUpdateTime = now;
                        player.lastNeckRotationX = newNeckRotationX;

                        // 構造要傳遞的數據
                        const updateData = {
                            type: "neckRotationX", // 更新類型
                            id: player.clientId, // 玩家ID
                            neckRotationX: newNeckRotationX
                        };

                        // 發送差異更新到伺服器
                        player.ws.send(JSON.stringify(updateData));
                    }

                    const updateData = {
                        type: "neckRotationX", // 更新類型
                        id: player.clientId, // 玩家ID
                        neckRotationX: newNeckRotationX
                    };

                    // 發送差異更新到伺服器
                    player.ws.send(JSON.stringify(updateData));

                    // 更新當前的脖子旋轉
                    player.neckRotationX = newNeckRotationX;
                } else {
                    player.rotationX -= event.movementX * 0.0005; // 滑鼠靈敏度
                    player.rotationY += event.movementY * 0.0005;

                    // 限制垂直旋轉角度，只能在0 ~ 90度這個區間旋轉
                    player.rotationY = Math.max(0, Math.min(Math.PI / 2, player.rotationY));
                }
            }
        });
    }

    handleKeyDown(event) {
        const key = event.key.toLowerCase();
        const now = Date.now();
        
        if ([...SHIFT, ...ENTER, ...V].includes(key) && now - this.lastKeyPressTime[key] < this.keyPressInterval) {
            // 如果距離上次按鍵小於300毫秒，則忽略這次按鍵
            return;
        }

        this.keysPressed[key] = true;
        this.lastKeyPressTime[key] = now; // 更新上次按鍵時間
    }

    handleClick() {
        if (!this.gameManager.connectionActive) return;
        if (this.deviceType === 'Desktop' && !this.touchSupported) {
            this.pointerLockControls.lock();
        }
    }

    handleKeyUp(event) {
        const key = event.key.toLowerCase();
        this.keysPressed[key] = false;
    }

    // 處理切換視角的邏輯
    handleViewToggle(player) {
        if (player.isLocalPlayer) {
            if (player.isFirstPerson) {
                this.switchToThirdPersonView(player);
            } else {
                this.switchToFirstPersonView(player);
            }
        }
    }

    // 從第三人稱切換到第一人稱視角
    switchToFirstPersonView(player) {
        player.model.visible = false; // 隱藏角色模型，以模擬第一人稱視角

        const direction = new THREE.Vector3();
        player.model.getWorldDirection(direction); // 獲取玩家面向的方向
        const newPosition = player.model.position.clone().add(direction.multiplyScalar(1)); // 計算新的攝影機位置
        this.camera.position.set(newPosition.x, newPosition.y + player.playerHeight, newPosition.z); // 更新攝影機位置以匹配頭部位置

        this.camera.lookAt(player.model.position.x, player.model.position.y + player.playerHeight, player.model.position.z); // 攝影機朝向玩家的面向方向 

        if (this.deviceType === 'Desktop' && !this.touchSupported) {
            this.pointerLockControls.lock(); // 啟用指針鎖定控制，適合第一人稱視角操作
        }
        player.isFirstPerson = true; // 更新玩家的視角狀態
    }

    // 從第一人稱切換到第三人稱視角
    switchToThirdPersonView(player) {
        player.model.visible = true; // 顯示角色模型，以模擬第三人稱視角

        player.isFirstPerson = false; // 更新玩家的視角狀態

        player.isReturningToInitialPosition = true;

        // 使用角色的旋轉角度來計算相機的位置
        const radius = 10; // 與角色的距離
        const offset = new THREE.Vector3(0, 0, radius);
        offset.applyQuaternion(player.model.quaternion);

        // 設置相機位置為角色位置加上偏移量
        this.camera.position.copy(player.model.position).add(offset);

        // 設置相機朝向角色
        this.camera.lookAt(player.model.position);

        // 保存相機的當前旋轉角度
        player.rotationX = Math.atan2(this.camera.position.x - player.model.position.x, this.camera.position.z - player.model.position.z);
        player.rotationY = 0;

        player.neckRotationX = player.initNeckRotationX;
        const updateData = {
            type: "neckRotationX", // 更新類型
            id: player.clientId, // 玩家ID
            neckRotationX: player.neckRotationX
        };

        // 發送差異更新到伺服器
        this.ws.send(JSON.stringify(updateData));
    }

    isAnyKeyPressed(keyArray) {
        return keyArray.some(key => this.keysPressed[key]);
    }

    resetKeysPressed(keys) {
        keys.forEach(key => this.keysPressed[key] = false);
    }

    update() {
        Object.values(this.gameManager.players).forEach(player => {
            if (player && player.isLocalPlayer) {
                if (this.isAnyKeyPressed(SHIFT)) {
                    player.switchRunToggle();
                    this.resetKeysPressed(SHIFT);
                }
                if (this.isAnyKeyPressed(V)) {
                    this.handleViewToggle(player);
                    this.resetKeysPressed(V);
                }
            }
        });
    }
}
