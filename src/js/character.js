// character.js
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils';
import { A, D, S, W, DIRECTIONS, SPACE, ACTION_1, ACTION_2, ACTION_3 } from './utils';

export class CharacterControls {
    constructor(players, physicsWorld, scene, position, quaternion, model, playerHeight, pointerLockControls, camera, ws, isLocalPlayer = false, clientId = null) {
        this.players = players;
        this.physicsWorld = physicsWorld;
        this.scene = scene;
        this.position = position;
        this.quaternion = quaternion;
        this.model = SkeletonUtils.clone(model.scene);
        this.model.position.copy(position);
        this.animations = model.animations;
        this.mixer = new THREE.AnimationMixer(this.model);
        this.playerHeight = playerHeight;
        this.pointerLockControls = pointerLockControls;
        this.camera = camera;
        this.cameraQuaternion = { x: 0, y: 1, z: 0, w: 0 };
        this.savedFirstPersonQuaternion = new THREE.Quaternion(); // 用於保存第一人稱視角的四元數

        this.ws = ws;
        this.isLocalPlayer = isLocalPlayer;
        this.clientId = clientId;

        this.scene.add(this.model);
        this.init();

        // 新增的定時器變量
        this.lastInputHandleTime = 0;
        this.inputHandleInterval = 1000 / 15; // 每66.67毫秒處理一次輸入
    }

    getRandom(min, max) {
        return Math.random() * (max - min + 1) + min;
    }

    getRandomColor() {
        let h = Math.round(Math.random() * 360);
        let s = Math.round(Math.random() * 100);
        let l = Math.round(this.getRandom(50, 90));
        return `hsl(${h}, ${s}%, ${l}%)`;
    }

    // 更改指定名稱材質顏色的函數
    changeMaterialColorByName(character, materialName) {
        // 遍歷角色中的所有子對象以查找材質
        character.traverse((child) => {
            if (child.isMesh) {
                if (Array.isArray(child.material)) {
                    // 為每個材質克隆一個新的實例並設置顏色
                    child.material = child.material.map((material) => {
                        if (material.name === materialName) {
                            const uniqueMaterial = material.clone();
                            uniqueMaterial.color.setStyle(this.color);
                            return uniqueMaterial;
                        }
                        return material;
                    });
                } else if (child.material.name === materialName) {
                    // 克隆單一材質並設置顏色
                    const uniqueMaterial = child.material.clone();
                    uniqueMaterial.color.setStyle(this.color);
                    child.material = uniqueMaterial;
                }
            }
        });
    }

    init() {
        this.isFirstPerson = false; // 默認為第三人稱視角
        this.color = this.getRandomColor();
        this.changeMaterialColorByName(this.model, 'Main.005');
        this.radius = 0.65;
        this.height = this.playerHeight - this.radius * 2;
        this.currentAction = 'Idle';
        this.animationsMap = this.loadAnimations(this.animations, this.currentAction);
        this.fadeDuration = 0.3;
        this.walkDirection = new THREE.Vector3();
        this.jumpVelocity = 15; // 可根據需要調整跳躍力度
        this.runVelocity = 12;
        this.walkVelocity = 6;

        this.toggleRun = true;

        this.isOnGround = false;
        this.isJumping = false; // 是否允許跳躍
        this.isInAir = false; // 是否在空中
        this.lastGroundedTime = Date.now();

        this.neck = this.model.getObjectByName('Neck');
        this.neckRotationSpeed = 0.0005; // 可調整的脖子旋轉速度
        this.initNeckRotationX = this.neck.quaternion.x; // 初始化脖子角度
        this.neckRotationX = this.neck.quaternion.x; // 初始化脖子角度
        this.maxNeckRotationX = Math.PI / 4; // 脖子旋轉的最大角度
        this.lastNeckRotationX = null; // 儲存上一次的脖子旋轉角度
        this.rotationChangeThreshold = 0.01; // 角度變化的最小閾值
        this.isReturningToInitialPosition = false;

        this.isPlayingNoAnimation = false;
        this.isPlayingYesAnimation = false;
        this.isPlayingWaveAnimation = false;

        this.cameraTarget = new THREE.Vector3();

        this.rotationX = 0;
        this.rotationY = 0;

        // 初始化上一次的狀態
        this.lastPosition = { x: this.position.x, y: this.position.y, z: this.position.z };
        this.lastAction = 'Idle';
        this.lastQuaternion = { x: this.model.quaternion.x, y: this.model.quaternion.y, z: this.model.quaternion.z, w: this.model.quaternion.w };

        this.initPhysics();

        if (this.isLocalPlayer) {
            // 設置 worker.onmessage 來監聽 worker 傳來的訊息
            this.physicsWorld.worker.onmessage = (event) => {
                const message = event.data;
                switch (message.type) {
                    case 'movementApplied':
                        this.handleMovementApplied(message.data.translation);
                        this.isOnGround = message.data.isOnGround;
                        break;
                    case 'rotationApplied':
                        this.handleRotationApplied(message.data.rotation);
                        break;
                    case 'positionUpdated':
                        this.positionUpdated(message.data);
                        break;
                    case 'renderDebug':
                        this.physicsWorld.renderDebug(message.data);
                        break;
                    default:
                        break;
                }
            };
        }
    }

    initPhysics() {
        const { position, quaternion, radius, height } = this;
        const quaternionData = { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w };
        this.physicsWorld.createCharacter({ id: this.clientId, position, quaternion: quaternionData, radius, height });
    }

    loadAnimations(animations, currentAction) {
        const animationsMap = new Map();
        animations.filter(a => a.name !== 'TPose').forEach(a => {
            const action = this.mixer.clipAction(a);
            animationsMap.set(a.name, action);
            if (a.name === currentAction) {
                action.play();
            }
        });
        return animationsMap;
    }

    switchRunToggle() {
        this.toggleRun = !this.toggleRun;
    }

    switchHoldingToggle() {
        this.toggleHolding = !this.toggleHolding;
    }

    isAnyKeyPressed(keyArray, keysPressed) {
        return keyArray.some(key => keysPressed[key]);
    }

    update(delta, keysPressed) {
        // keysPressed 是按鍵的物件
        if (this.isLocalPlayer) {
            this.calculateMovementDirection(delta, keysPressed);
            this.handleJumpAndLand();
            this.handleActionChange(keysPressed);

            if (this.isFirstPerson) {
                this.updateForFirstPersonView();
            } else {
                this.updateForThirdPersonView(); // 更新相機位置
            }
        }

        this.hasChange();
        this.mixer.update(delta);

        // 後處理：在更新動畫後設置臉部骨架的角度
        const desiredRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -this.neckRotationX);
        this.neck.quaternion.copy(desiredRotation);
    }

    handleActionChange(keysPressed) {
        const directionPressed = DIRECTIONS.some(direction =>
            direction.some(key => keysPressed[key])
        );

        const isKeyPressed = (keyGroup) => keyGroup.some(key => keysPressed[key]);

        const pressedDirectionCount = DIRECTIONS.reduce((count, direction) => count + (isKeyPressed(direction) ? 1 : 0), 0);

        const isDirectionCombinationPressed = (keyGroup1, keyGroup2) =>
            this.isAnyKeyPressed(keyGroup1, keysPressed) && this.isAnyKeyPressed(keyGroup2, keysPressed);

        let play = '';

        if (this.isPlayingNoAnimation) {
            play = 'No';
        } else if (this.isPlayingYesAnimation) {
            play = 'Yes';
        } else if (this.isPlayingWaveAnimation) {
            play = 'Wave';
        } else {
            // 按下相反鍵時，會原地不動
            if (this.isAnyKeyPressed(ACTION_1, keysPressed) && this.isOnGround) {
                play = 'Yes';
                this.isPlayingYesAnimation = true;
            } else if (this.isAnyKeyPressed(ACTION_2, keysPressed) && this.isOnGround) {
                play = 'No';
                this.isPlayingNoAnimation = true;
            } else if (this.isAnyKeyPressed(ACTION_3, keysPressed) && this.isOnGround) {
                play = 'Wave';
                this.isPlayingWaveAnimation = true;
            } else if (isDirectionCombinationPressed(A, D) || isDirectionCombinationPressed(W, S)) {
                play = this.isHoldingItem ? 'Idle_Holding' : 'Idle';
            } else if (directionPressed) {
                if (this.toggleRun) {
                    play = this.isHoldingItem ? 'Run_Holding' : 'Run';
                } else {
                    play = this.isHoldingItem ? 'Walk_Holding' : 'Walk';
                }
            }
            else {
                play = this.isHoldingItem ? 'Idle_Holding' : 'Idle';
            }

            // 如果按了三顆方向鍵，就觸發跑步或走路
            if (pressedDirectionCount === 3) {
                if (this.toggleRun) {
                    play = this.isHoldingItem ? 'Run_Holding' : 'Run';
                } else {
                    play = this.isHoldingItem ? 'Walk_Holding' : 'Walk';
                }
            }

            // 跳躍中（持續執行）
            else if (this.isInAir) {
                play = 'Jump_Idle';
            }
        }

        // 播放動畫
        if (this.currentAction != play) {
            const toPlay = this.animationsMap.get(play);
            const current = this.animationsMap.get(this.currentAction);
            if (toPlay) {
                current.fadeOut(this.fadeDuration);
                toPlay.reset().fadeIn(this.fadeDuration).play();
                this.currentAction = play;

                if (play === 'No') {
                    toPlay.clampWhenFinished = true;
                    toPlay.loop = THREE.LoopOnce;
                    this.mixer.addEventListener('finished', (e) => {
                        if (e.action._clip.name === 'No') {
                            this.isPlayingNoAnimation = false;
                        }
                    });
                } else if (play === 'Yes') {
                    toPlay.clampWhenFinished = true;
                    toPlay.loop = THREE.LoopOnce;
                    this.mixer.addEventListener('finished', (e) => {
                        if (e.action._clip.name === 'Yes') {
                            this.isPlayingYesAnimation = false;
                        }
                    });
                } else if (play === 'Wave') {
                    toPlay.clampWhenFinished = true;
                    toPlay.loop = THREE.LoopOnce;
                    this.mixer.addEventListener('finished', (e) => {
                        if (e.action._clip.name === 'Wave') {
                            this.isPlayingWaveAnimation = false;
                        }
                    });
                }
            }
        }
    }

    // 更新跳躍狀態，確保 `Jump` 和 `Jump_Land` 只執行一次
    handleJumpAndLand() {
        const currentTime = Date.now();
        const timeSinceLastGrounded = currentTime - this.lastGroundedTime;

        // 根據是否在地面來設置 `isInAir`
        if (!this.isOnGround && timeSinceLastGrounded > 200) { // 假設200ms為緩衝時間
            this.isInAir = true;
        } else if (this.isOnGround) {
            this.isInAir = false;
            this.lastGroundedTime = currentTime;
        }

        if (this.isJumping) this.isInAir = true;
        if (this.isInAir) this.hasJumping = true;

        // 當角色落地且之前在空中時,執行 `Jump_Land`
        if (this.isOnGround && this.hasJumping) {
            this.isJumping = false;
        }
    }

    calculateMovementDirection(delta, keysPressed) {
        this.walkDirection.set(0, 0, 0);

        // 獲取鏡頭的前方和右側方向
        const cameraForward = new THREE.Vector3();
        this.camera.getWorldDirection(cameraForward);
        cameraForward.y = 0;
        cameraForward.normalize();

        const cameraRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), cameraForward);

        // 根據按鍵設置移動方向
        if (this.isAnyKeyPressed(W, keysPressed)) this.walkDirection.add(cameraForward);
        if (this.isAnyKeyPressed(S, keysPressed)) this.walkDirection.add(cameraForward.clone().negate());
        if (this.isAnyKeyPressed(A, keysPressed)) this.walkDirection.add(cameraRight);
        if (this.isAnyKeyPressed(D, keysPressed)) this.walkDirection.add(cameraRight.clone().negate());
        if (this.isAnyKeyPressed(SPACE, keysPressed) && !this.isJumping && this.isOnGround) {
            this.isJumping = true;
        }

        // 正規化方向，防止對角線移動過快
        this.walkDirection.normalize();
        this.applyMovement(delta);
    }

    applyMovement(delta) {
        if (this.isPlayingNoAnimation || this.isPlayingYesAnimation || this.isPlayingWaveAnimation) {
            this.isJumping = false; // 禁用跳躍
            this.walkDirection.set(0, 0, 0); // 停止移動
        }

        const velocity = this.toggleRun ? this.runVelocity : this.walkVelocity;
        const moveX = this.walkDirection.x * velocity * delta;
        const moveZ = this.walkDirection.z * velocity * delta;
        const data = {
            id: this.clientId,
            isFirstPerson: this.isFirstPerson,
            delta,
            moveX,
            moveZ,
            cameraQuaternion: this.cameraQuaternion,
            walkDirection: this.walkDirection,
            jumpVelocity: this.jumpVelocity,
            isJumping: this.isJumping
        };

        this.physicsWorld.worker.postMessage({ type: 'applyMovement', data });
    }

    handleMovementApplied(translation) {
        this.model.position.copy(translation);
    }

    handleRotationApplied(rotation) {
        const rotateQuaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
        this.model.quaternion.slerp(rotateQuaternion, 0.2);
    }

    hasChange() {
        function positionsAreClose(a, b, tolerance = 0.1) {
            return Math.abs(a - b) < tolerance;
        }

        const positionChanged =
            !positionsAreClose(this.lastPosition.x, this.model.position.x) ||
            !positionsAreClose(this.lastPosition.y, this.model.position.y) ||
            !positionsAreClose(this.lastPosition.z, this.model.position.z);

        const actionChanged = this.lastAction !== this.currentAction;

        function quaternionsAreClose(a, b, tolerance = 0.01) {
            return Math.abs(a.x - b.x) < tolerance &&
                Math.abs(a.y - b.y) < tolerance &&
                Math.abs(a.z - b.z) < tolerance &&
                Math.abs(a.w - b.w) < tolerance;
        }

        const rotationChanged = !quaternionsAreClose(this.lastQuaternion, this.model.quaternion);

        if (positionChanged || actionChanged || rotationChanged) {
            // 構造差異更新的數據
            const updateData = {
                type: "move", // 更新類型
                id: this.clientId, // 玩家ID
                position: { x: this.model.position.x, y: this.model.position.y, z: this.model.position.z },
                quaternion: {
                    x: this.model.quaternion.x,
                    y: this.model.quaternion.y,
                    z: this.model.quaternion.z,
                    w: this.model.quaternion.w
                },
                action: this.currentAction
            };

            // 更新上一次的狀態
            this.lastPosition = { ...updateData.position };
            this.lastQuaternion = { ...updateData.quaternion };
            if (actionChanged) {
                this.lastAction = updateData.action;
            }

            // 發送差異更新到服務器
            this.ws.send(JSON.stringify(updateData));
        }
    }


    // 視角相關
    updateForThirdPersonView() {
        const radius = 10; // 與角色的距離
        const x = radius * Math.sin(this.rotationX) * Math.cos(this.rotationY);
        const z = radius * Math.cos(this.rotationX) * Math.cos(this.rotationY);
        const y = radius * Math.sin(this.rotationY) + this.playerHeight;

        // 以角色為中心的相機位置
        this.camera.position.set(
            this.model.position.x + x,
            this.model.position.y + y,
            this.model.position.z + z
        );

        // 相機對焦角色位置
        this.camera.lookAt(this.model.position);
    }

    getHeadPosition() {
        const head = this.model.getObjectByName('Head');
        // 將相機的位置對齊頭部的位置
        return head.getWorldPosition(new THREE.Vector3());
    }

    updateForFirstPersonView() {
        const cameraDirection = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDirection);
        cameraDirection.y = 0;
        cameraDirection.normalize();

        const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), cameraDirection);
        this.cameraQuaternion = {
            x: targetQuaternion.x,
            y: targetQuaternion.y,
            z: targetQuaternion.z,
            w: targetQuaternion.w
        };

        this.savedFirstPersonQuaternion.copy(this.camera.quaternion);

        this.camera.position.lerp(this.getHeadPosition(), 0.5);
    }




    // 更新非本機玩家的位置及動畫
    positionUpdated({ id, position, quaternion }) {
        const player = this.players[id];
        if (player) {
            player.model.position.copy(position);
            player.model.quaternion.copy(quaternion);
        }
    }

    playAnimation(actionName) {
        const action = this.animationsMap.get(actionName);
        if (action && this.currentAction !== actionName) {
            if (this.currentAction) {
                const prevAction = this.animationsMap.get(this.currentAction);
                prevAction.fadeOut(this.fadeDuration);
            }
            this.currentAction = actionName;
            action.reset().fadeIn(this.fadeDuration).play();
        }
    }
}