// src/components/player/playerController.ts
import * as BABYLON from "babylonjs";

import { loadPlayerModel } from "./playerModel";
import {
  PlayerState,
  createPlayerStateMachine,
} from "./playerStateMachine";

export interface PlayerController {
  handleKeyDown(event: KeyboardEvent): void;
  handleKeyUp(event: KeyboardEvent): void;
  ensureIdle(): void;
  dispose(): void;
}

export function setupPlayerController(
  scene: BABYLON.Scene,
  camera: BABYLON.ArcRotateCamera,
  modelRoot: string,
  shadowGenerator: BABYLON.ShadowGenerator,
  setScrollSpeed: (speed: number) => void
): PlayerController {
  // INTERNAL STATE
  const keyState = {
    forward: false,
    left: false,
    right: false,
    slide: false,
    jump: false,
  };

  let debugOverrideState: PlayerState | null = null;

  const debugKeyMap = {
    Digit1: "Idle",
    Digit2: "Run",
    Digit3: "Slide",
    Digit4: "Jump",
    Digit5: "Run_Idle",
  } as const;

  // LATERAL MOTION VARIABLES
  const lateralRange = 40;
  const lateralSpeed = 40;
  const lateralReturnSpeed = 40;

  function lateralClamp(v: number) {
    return Math.max(-lateralRange, Math.min(lateralRange, v));
  }

  const lateralState = { target: 0 };

  // PLAYER DATA
  let playerRoot: BABYLON.TransformNode | null = null;

  // STATE MACHINE (lazy init)
  let stateMachine: ReturnType<typeof createPlayerStateMachine> | null =
    null;

  // --------------------------
  // INPUT: KEY DOWN
  // --------------------------
  function handleKeyDown(event: KeyboardEvent) {
    const debugState = debugKeyMap[event.code as keyof typeof debugKeyMap];
    if (debugState) {
      event.preventDefault();
      triggerDebugState(debugState);
      return;
    }

    if (event.code === "Digit0") {
      event.preventDefault();
      triggerDebugState(null);
      return;
    }

    switch (event.code) {
      case "ArrowUp":
      case "KeyW":
        keyState.forward = true;
        break;
      case "ArrowLeft":
      case "KeyA":
        keyState.left = true;
        break;
      case "ArrowRight":
      case "KeyD":
        keyState.right = true;
        break;
      case "ArrowDown":
      case "KeyS":
        keyState.slide = true;
        break;
      case "Space":
        event.preventDefault();
        keyState.jump = true;
        break;
    }
  }

  // --------------------------
  // INPUT: KEY UP
  // --------------------------
  function handleKeyUp(event: KeyboardEvent) {
    switch (event.code) {
      case "ArrowUp":
      case "KeyW":
        keyState.forward = false;
        break;
      case "ArrowLeft":
      case "KeyA":
        keyState.left = false;
        break;
      case "ArrowRight":
      case "KeyD":
        keyState.right = false;
        break;
      case "ArrowDown":
      case "KeyS":
        keyState.slide = false;
        break;
      case "Space":
        event.preventDefault();
        keyState.jump = false;
        break;
    }
  }

  // --------------------------------
  // DEBUG OVERRIDE STATE
  // --------------------------------
  function triggerDebugState(state: PlayerState | null) {
    keyState.forward = false;
    keyState.left = false;
    keyState.right = false;
    keyState.slide = false;
    keyState.jump = false;

    debugOverrideState = state;

    if (state && stateMachine) {
      stateMachine.setPlayerState(state, true);
    } else if (stateMachine) {
      stateMachine.setPlayerState("Idle", true);
    }
  }

  // --------------------------------
  // MAIN INPUT → STATE MACHINE LOGIC
  // --------------------------------
  function updateMovementState() {
    if (!playerRoot || !stateMachine) return;

    if (debugOverrideState) return;

    const moveLeft = keyState.left && !keyState.right;
    const moveRight = keyState.right && !keyState.left;
    const shouldSlide = keyState.slide;
    const shouldRun = keyState.forward;

    let triggeredJump = false;

    if (keyState.jump) {
      stateMachine.setPlayerState("Jump");
      triggeredJump = true;
      keyState.jump = false;
    }

    if (triggeredJump) return;

    if (shouldSlide) stateMachine.setPlayerState("Slide");
    else if (moveLeft) stateMachine.setPlayerState("Strafe_L");
    else if (moveRight) stateMachine.setPlayerState("Strafe_R");
    else if (shouldRun) stateMachine.setPlayerState("Run");
    else stateMachine.setPlayerState("Idle");
  }

  // --------------------------------
  // LATERAL MOTION OBSERVER
  // --------------------------------
  const motionObserver = scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;

    updateMovementState();
    if (!playerRoot) return;

    const pos = playerRoot.position.clone();

    if (keyState.left && !keyState.right) {
      lateralState.target = lateralClamp(
        lateralState.target - lateralSpeed * dt
      );
    } else if (keyState.right && !keyState.left) {
      lateralState.target = lateralClamp(
        lateralState.target + lateralSpeed * dt
      );
    } else {
      const dir = Math.sign(-lateralState.target);
      const adj = dir * lateralReturnSpeed * dt;
      if (Math.abs(adj) > Math.abs(lateralState.target)) {
        lateralState.target = 0;
      } else {
        lateralState.target += adj;
      }
    }

    pos.x = lateralState.target;
    playerRoot.position = pos;
  });

  // --------------------------------
  // LOAD PLAYER MODEL
  // --------------------------------
  loadPlayerModel(
    scene,
    camera,
    modelRoot,
    shadowGenerator,
    (model) => {
      playerRoot = model.playerRoot;

      // CREATE STATE MACHINE
      stateMachine = createPlayerStateMachine({
        scene,
        playerRoot: model.playerRoot,
        playerSkeleton: model.playerSkeleton,
        animationGroup: model.playerAnimationGroup,
        setScrollSpeed,
      });

      stateMachine.ensureIdle();
    }
  );

  // --------------------------------
  // DISPOSE
  // --------------------------------
  function dispose() {
    if (motionObserver) {
      scene.onBeforeRenderObservable.remove(motionObserver);
    }
    if (stateMachine) stateMachine.dispose();
    playerRoot?.dispose();
  }

  return {
    handleKeyDown,
    handleKeyUp,
    ensureIdle: () => stateMachine?.ensureIdle(),
    dispose,
  };
}
