// physicsWorker.js
import * as RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";

class PhysicsWorld {
  constructor() {
    this.players = {}; // 存儲所有玩家的物理屬性
    this.world = null;
    this.gravity = -29.43;
  }

  async init() {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0.0, y: this.gravity, z: 0.0 });
    self.postMessage({ type: "initComplete" });
  }

  step() {
    this.world.step();
  }

  createScene(modelData) {
    modelData.forEach((data) => {
      const { vertices, indices } = data;
      if (!vertices) return; // 如果 vertices 未定義，則跳過
      const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed().setCanSleep(false);
      const rigidBody = this.world.createRigidBody(rigidBodyDesc);

      let colliderDesc;
      if (indices) {
        colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
      } else {
        colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, []);
      }
      this.world.createCollider(colliderDesc, rigidBody);

    });
  }

  createCharacter({ position, quaternion, radius, height }) {
    const bodyDesc =
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        position.x,
        position.y,
        position.z
      );
    const rigidBody = this.world.createRigidBody(bodyDesc);
    rigidBody.setRotation(quaternion);
    const colliderDesc = RAPIER.ColliderDesc.capsule(height / 2, radius);
    const collider = this.world.createCollider(colliderDesc, rigidBody);
    collider.setMass(100);

    this.characterController = this.initCharacterController();

    const rotation = rigidBody.rotation();
    self.postMessage({
      type: "rotationApplied",
      data: {
        rotation: {
          x: rotation.x,
          y: rotation.y,
          z: rotation.z,
          w: rotation.w,
        },
      },
    });

    return { rigidBody, collider };
  }

  initCharacterController() {
    const offset = 0.03; // 根據需要調整
    const characterController = this.world.createCharacterController(offset);
    characterController.setUp({ x: 0.0, y: 1.0, z: 0.0 });
    characterController.setMaxSlopeClimbAngle((90 * Math.PI) / 180);
    characterController.setMinSlopeSlideAngle((30 * Math.PI) / 180);
    characterController.enableAutostep(1, 0.3, true);
    characterController.enableSnapToGround(1);
    characterController.setApplyImpulsesToDynamicBodies(true);
    return characterController;
  }

  applyMovement({
    id,
    isFirstPerson,
    delta,
    walkDirection,
    moveX,
    moveZ,
    cameraQuaternion,
    jumpVelocity,
    isJumping,
  }) {
    const player = this.players[id];
    player.isJumping = isJumping;
    player.cameraQuaternion = cameraQuaternion;
    if (!this.characterController) return;

    const isOnGround = this.characterController.computedGrounded();

    if (isOnGround && isJumping) {
      player.verticalVelocity = jumpVelocity;
    } else if (isOnGround) {
      player.verticalVelocity = 0;
    }

    player.verticalVelocity += this.gravity * delta;

    const gravityEffect = player.verticalVelocity * delta;
    const desiredTranslation = { x: moveX, y: gravityEffect, z: moveZ };
    this.characterController.computeColliderMovement(
      player.collider,
      desiredTranslation
    );

    const correctedMovement = this.characterController.computedMovement();
    const currentPos = player.rigidBody.translation();
    const setMove = {
      x: currentPos.x + correctedMovement.x,
      y: currentPos.y + correctedMovement.y,
      z: currentPos.z + correctedMovement.z,
    };

    player.rigidBody.setNextKinematicTranslation({
      x: currentPos.x,
      y: setMove.y,
      z: currentPos.z,
    });

    if (walkDirection.x !== 0 || walkDirection.z !== 0) {
      player.rigidBody.setNextKinematicTranslation(setMove);
    }

    if (isFirstPerson) {
      player.rigidBody.setRotation(player.cameraQuaternion);
    } else if (
      !isFirstPerson &&
      (walkDirection.x !== 0 || walkDirection.z !== 0)
    ) {
      this.applyRotation({ id, walkDirection });
    }

    self.postMessage({
      type: "movementApplied",
      data: { translation: player.rigidBody.translation(), isOnGround },
    });

    const rotation = player.rigidBody.rotation();
    self.postMessage({
      type: "rotationApplied",
      data: {
        rotation: {
          x: rotation.x,
          y: rotation.y,
          z: rotation.z,
          w: rotation.w,
        },
      },
    });
  }

  applyRotation({ id, walkDirection }) {
    const player = this.players[id];
    let targetAngle = Math.atan2(-walkDirection.x, -walkDirection.z);
    player.rotateQuaternion.setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      targetAngle
    );
    player.rigidBody.setRotation(player.rotateQuaternion);
  }

  updatePosition({ id, position, quaternion }) {
    const player = this.players[id];
    if (player) {
      player.rigidBody.setNextKinematicTranslation(position);
      player.rigidBody.setRotation(quaternion);
      self.postMessage({
        type: "positionUpdated",
        data: {
          id,
          position: player.rigidBody.translation(),
          quaternion: player.rigidBody.rotation(),
        },
      });
    }
  }

  removeRigidBody(id) {
    const player = this.players[id];
    if (player) this.world.removeRigidBody(player.rigidBody);
  }

  update() {
    this.step();
  }

  debug() {
    const debugInfo = this.world.debugRender();
    const transferableDebugInfo = {
      vertices: debugInfo.vertices.buffer,
      colors: debugInfo.colors.buffer
    };
    self.postMessage({ type: 'renderDebug', data: debugInfo }, [transferableDebugInfo.vertices, transferableDebugInfo.colors]);
  }
}

const physicsWorld = new PhysicsWorld();

self.onmessage = (event) => {
  const message = event.data;
  switch (message.type) {
    case "init":
      physicsWorld.init();
      break;
    case "createDynamic":
      physicsWorld.createDynamic(message.data);
      break;
    case "createScene":
      physicsWorld.createScene(message.data);
      break;
    case "createCharacter":
      const { id, position, quaternion, radius, height } = message.data;
      const { rigidBody, collider } = physicsWorld.createCharacter({
        position,
        quaternion,
        radius,
        height,
      });
      physicsWorld.players[id] = {
        rigidBody,
        collider,
        verticalVelocity: 0,
        characterController: physicsWorld.initCharacterController(),
        rotateQuaternion: new THREE.Quaternion(),
        isJumping: false,
        cameraQuaternion: { x: 0, y: 1, z: 0, w: 0 },
      };
      break;
    case "applyMovement":
      physicsWorld.applyMovement(message.data);
      break;
    case "updatePosition":
      physicsWorld.updatePosition(message.data);
      break;
    case "removeRigidBody":
      physicsWorld.removeRigidBody(message.data);
      break;
    case "step":
      physicsWorld.update();
      break;
    case "debug":
      physicsWorld.debug();
      break;
    default:
      break;
  }
};
