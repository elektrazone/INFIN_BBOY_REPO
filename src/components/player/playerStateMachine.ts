// src/components/player/playerStateMachine.ts
import * as BABYLON from "@babylonjs/core";

export type PlayerState =
  | "Idle"
  | "Run"
  | "Strafe_L"
  | "Strafe_R"
  | "Slide"
  | "Jump"
  | "Fall"
  | "Getup"
  | "Run_Idle"
  | "Death"
  | "Cheer"
  | "Wave"
  | "Right_turn";

export interface PlayerStateMachineConfig {
  scene: BABYLON.Scene;
  playerRoot: BABYLON.TransformNode;
  playerSkeleton: BABYLON.Nullable<BABYLON.Skeleton>;
  animationGroup: BABYLON.Nullable<BABYLON.AnimationGroup>;
  setScrollSpeed: (speed: number) => void;
}

export interface PlayerStateMachine {
  currentState: PlayerState;
  setPlayerState: (next: PlayerState, force?: boolean) => void;
  playStateWithCallback: (state: PlayerState, onComplete: () => void) => void;
  ensureIdle: () => void;
  pauseAnimation: () => void;
  resumeAnimation: () => void;
  dispose: () => void;
  setAllowAirStrafe: (allow: boolean) => void;
  readonly canStrafe: boolean;
}

// Loop ranges
const loopFrameRanges: Record<
  Extract<PlayerState, "Idle" | "Run" | "Strafe_L" | "Strafe_R">,
  [number, number]
> = {
  Idle: [0, 88],
  Run: [89, 109],
  Strafe_L: [182, 201],
  Strafe_R: [202, 221],
};

function buildLoopRange(state: keyof typeof loopFrameRanges, scroll: number) {
  const [start, end] = loopFrameRanges[state];
  return { start, end, loop: true, scroll };
}

const sourceFrameRate = 24;
const baseScrollSpeed = 75; // Increased for faster pacing

// Animation ranges config
const animationRanges = {
  Idle: buildLoopRange("Idle", 0),
  Run: buildLoopRange("Run", baseScrollSpeed),
  Slide: { start: 110, end: 154, loop: false, scroll: baseScrollSpeed },
  Jump: { start: 155, end: 181, loop: false, scroll: baseScrollSpeed, allowStrafe: false },
  Strafe_L: buildLoopRange("Strafe_L", baseScrollSpeed),
  Strafe_R: buildLoopRange("Strafe_R", baseScrollSpeed),
  Run_Idle: { start: 222, end: 248, loop: false, scroll: 0 },

  // Y" FIX: scroll = 0 durante Fall e Getup
  Fall: { start: 249, end: 324, loop: false, scroll: 0, allowStrafe: false },
  Getup: { start: 325, end: 552, loop: false, scroll: 0, allowStrafe: false },
  Death: { start: 249, end: 324, loop: false, scroll: 0, allowStrafe: false },
  Cheer: { start: 533, end: 622, loop: false, scroll: 0, allowStrafe: false },
  Wave: { start: 623, end: 635, loop: false, scroll: 0, allowStrafe: false },
  Right_turn: { start: 636, end: 675, loop: false, scroll: 0, allowStrafe: false },
};

const blockingStates = new Set<PlayerState>([
  "Slide",
  "Jump",
  "Fall",
  "Getup",
  "Death",
  "Cheer",
  "Wave",
  "Right_turn",
]);

export function createPlayerStateMachine(
  config: PlayerStateMachineConfig
): PlayerStateMachine {
  const {
    scene,
    playerRoot,
    playerSkeleton,
    animationGroup,
    setScrollSpeed,
  } = config;

  let currentPlayerState: PlayerState = "Idle";
  let idleInitialized = false;
  let allowAirStrafe = false;

  let playerAnimatable: BABYLON.Nullable<BABYLON.Animatable> = null;
  let animationGroupEndObs: BABYLON.Nullable<
    BABYLON.Observer<BABYLON.AnimationGroup>
  > = null;
  let animatableEndObs: BABYLON.Nullable<
    BABYLON.Observer<BABYLON.Animatable>
  > = null;

  let animationGroupFrameRate = sourceFrameRate;

  if (animationGroup) {
    const firstTarget = animationGroup.targetedAnimations[0];
    if (firstTarget?.animation?.framePerSecond) {
      animationGroupFrameRate = firstTarget.animation.framePerSecond;
    }
  }

  function ensureSkeletonRanges() {
    if (!playerSkeleton) return;

    (Object.keys(animationRanges) as PlayerState[]).forEach((state) => {
      if (!playerSkeleton!.getAnimationRange(state)) {
        const { start, end } = animationRanges[state];
        playerSkeleton!.createAnimationRange(state, start, end);
      }
    });
  }
  ensureSkeletonRanges();

  function resolveFrames(state: PlayerState, fallback: any) {
    if (playerSkeleton) {
      const named = playerSkeleton.getAnimationRange(state);
      if (named) return { start: named.from, end: named.to };
    }
    return { start: fallback.start, end: fallback.end };
  }

  function stopCurrentAnimation() {
    if (playerAnimatable && animatableEndObs) {
      playerAnimatable.onAnimationEndObservable.remove(animatableEndObs);
      animatableEndObs = null;
    }

    if (animationGroup && animationGroupEndObs) {
      animationGroup.onAnimationGroupEndObservable.remove(animationGroupEndObs);
      animationGroupEndObs = null;
    }

    if (animationGroup) animationGroup.stop();
    if (playerAnimatable) playerAnimatable.stop();

    playerAnimatable = null;
  }

  function setPlayerState(next: PlayerState, force = false) {
    if (!force && currentPlayerState === next) return;
    if (!force && blockingStates.has(currentPlayerState)) return;

    const config = animationRanges[next];
    const targetFrames = resolveFrames(next, config);

    // If unloaded
    if (!playerSkeleton && !animationGroup) {
      currentPlayerState = next;
      setScrollSpeed(config.scroll);
      return;
    }

    stopCurrentAnimation();
    setScrollSpeed(config.scroll);

    const handleEnd = () => {
      if (next === "Slide") setPlayerState("Run", true);
      else if (next === "Fall") setPlayerState("Getup", true);
      // Y" FIX: dopo GETUP torniamo subito a RUN
      else if (next === "Getup") setPlayerState("Run", true);
      else if (next === "Run_Idle") setPlayerState("Idle", true);
      else if (next === "Cheer" || next === "Wave" || next === "Right_turn") setPlayerState("Run", true);
      // Death state does not transition
    };

    let animationStarted = false;

    if (animationGroup) {
      const frameScale = animationGroupFrameRate / sourceFrameRate;
      const from = targetFrames.start * frameScale;
      const to = targetFrames.end * frameScale;

      animationGroup.reset();
      animationGroup.start(config.loop, 1.5, from, to, false);

      animationStarted = true;

      if (!config.loop) {
        animationGroupEndObs =
          animationGroup.onAnimationGroupEndObservable.addOnce(() => {
            animationGroupEndObs = null;
            handleEnd();
          });
      }
    } else if (playerSkeleton) {
      playerAnimatable = scene.beginAnimation(
        playerSkeleton,
        targetFrames.start,
        targetFrames.end,
        config.loop,
        1
      );

      if (playerAnimatable) {
        animationStarted = true;
        if (!config.loop) {
          animatableEndObs =
            playerAnimatable.onAnimationEndObservable.addOnce(() => {
              animatableEndObs = null;
              handleEnd();
            });
        }
      }
    }

    currentPlayerState = next;
  }

  function ensureIdle() {
    if (idleInitialized) return;

    // Force stop any running animations first
    stopCurrentAnimation();

    // Reset current state to Idle
    currentPlayerState = "Idle";
    setScrollSpeed(0);

    const idle = animationRanges.Idle;
    const frames = resolveFrames("Idle", idle);

    if (animationGroup) {
      const frameScale = animationGroupFrameRate / sourceFrameRate;
      animationGroup.reset();
      animationGroup.stop(); // Ensure fully stopped
      animationGroup.start(
        true,      // loop
        1,         // speed
        frames.start * frameScale,
        frames.end * frameScale,
        true       // isAdditive
      );
      idleInitialized = true;
      console.log("✅ Player initialized to Idle animation");
    } else if (playerSkeleton) {
      playerAnimatable = scene.beginAnimation(
        playerSkeleton,
        frames.start,
        frames.end,
        true
      );
      if (playerAnimatable) {
        idleInitialized = true;
        console.log("✅ Player initialized to Idle animation (skeleton)");
      }
    }
  }

  /**
   * Play a state animation and call the callback when it ends.
   * Used for intro sequences where we need to chain animations.
   */
  function playStateWithCallback(state: PlayerState, onComplete: () => void) {
    const config = animationRanges[state];
    const targetFrames = resolveFrames(state, config);

    stopCurrentAnimation();
    setScrollSpeed(config.scroll);

    currentPlayerState = state;

    if (animationGroup) {
      const frameScale = animationGroupFrameRate / sourceFrameRate;
      const from = targetFrames.start * frameScale;
      const to = targetFrames.end * frameScale;

      animationGroup.reset();
      animationGroup.start(config.loop, 1.5, from, to, false);

      if (!config.loop) {
        animationGroupEndObs =
          animationGroup.onAnimationGroupEndObservable.addOnce(() => {
            animationGroupEndObs = null;
            onComplete();
          });
      } else {
        // For looping animations, we need a different approach
        // Play one full cycle then call callback
        const durationFrames = to - from;
        const durationSeconds = durationFrames / (animationGroupFrameRate * 1.5); // 1.5 is speed
        setTimeout(() => {
          onComplete();
        }, durationSeconds * 1000);
      }
    } else if (playerSkeleton) {
      playerAnimatable = scene.beginAnimation(
        playerSkeleton,
        targetFrames.start,
        targetFrames.end,
        config.loop,
        1
      );

      if (playerAnimatable) {
        if (!config.loop) {
          animatableEndObs =
            playerAnimatable.onAnimationEndObservable.addOnce(() => {
              animatableEndObs = null;
              onComplete();
            });
        } else {
          // For looping, use timeout
          const durationFrames = targetFrames.end - targetFrames.start;
          const durationSeconds = durationFrames / sourceFrameRate;
          setTimeout(() => {
            onComplete();
          }, durationSeconds * 1000);
        }
      }
    }
  }

  function dispose() {
    stopCurrentAnimation();
  }

  function pauseAnimation() {
    if (animationGroup) {
      animationGroup.pause();
    }
    if (playerAnimatable) {
      playerAnimatable.pause();
    }
  }

  function resumeAnimation() {
    if (animationGroup) {
      animationGroup.play();
    }
    if (playerAnimatable) {
      playerAnimatable.restart();
    }
  }

  return {
    get currentState() {
      return currentPlayerState;
    },
    get canStrafe() {
      const cfg = animationRanges[currentPlayerState];
      // Override for Air states if enabled
      if (allowAirStrafe && (currentPlayerState === "Jump" || currentPlayerState === "Fall")) {
        return true;
      }
      // Default true if undefined
      return (cfg as any).allowStrafe !== false;
    },
    setPlayerState,
    playStateWithCallback,
    setAllowAirStrafe: (allow: boolean) => {
      allowAirStrafe = allow;
    },
    ensureIdle,
    pauseAnimation,
    resumeAnimation,
    dispose,
  };
}
