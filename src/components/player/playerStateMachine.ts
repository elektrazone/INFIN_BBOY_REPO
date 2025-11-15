// src/components/player/playerStateMachine.ts
import * as BABYLON from "babylonjs";

export type PlayerState =
  | "Idle"
  | "Run"
  | "Strafe_L"
  | "Strafe_R"
  | "Slide"
  | "Jump"
  | "Fall"
  | "Getup"
  | "Run_Idle";

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
  ensureIdle: () => void;
  dispose: () => void;
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
const baseScrollSpeed = 102;

// Animation ranges config
const animationRanges = {
  Idle: buildLoopRange("Idle", 0),
  Run: buildLoopRange("Run", baseScrollSpeed),
  Slide: { start: 110, end: 154, loop: false, scroll: baseScrollSpeed },
  Jump: { start: 155, end: 181, loop: false, scroll: baseScrollSpeed },
  Strafe_L: buildLoopRange("Strafe_L", baseScrollSpeed),
  Strafe_R: buildLoopRange("Strafe_R", baseScrollSpeed),
  Run_Idle: { start: 222, end: 248, loop: false, scroll: 0 },
  Fall: { start: 249, end: 324, loop: false, scroll: baseScrollSpeed },
  Getup: { start: 325, end: 552, loop: false, scroll: baseScrollSpeed },
};

const blockingStates = new Set<PlayerState>([
  "Slide",
  "Jump",
  "Fall",
  "Getup",
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
      if (next === "Slide" || next === "Jump") setPlayerState("Run", true);
      else if (next === "Getup") setPlayerState("Idle", true);
      else if (next === "Run_Idle") setPlayerState("Idle", true);
    };

    let animationStarted = false;

    if (animationGroup) {
      const frameScale = animationGroupFrameRate / sourceFrameRate;
      const from = targetFrames.start * frameScale;
      const to = targetFrames.end * frameScale;

      animationGroup.reset();
      animationGroup.start(config.loop, 1, from, to, false);

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

    const idle = animationRanges.Idle;
    const frames = resolveFrames("Idle", idle);

    if (animationGroup) {
      const frameScale = animationGroupFrameRate / sourceFrameRate;
      animationGroup.reset();
      animationGroup.start(
        true,
        1,
        frames.start * frameScale,
        frames.end * frameScale,
        true
      );
      idleInitialized = true;
    } else if (playerSkeleton) {
      playerAnimatable = scene.beginAnimation(
        playerSkeleton,
        frames.start,
        frames.end,
        true
      );
      if (playerAnimatable) idleInitialized = true;
    }
  }

  function dispose() {
    stopCurrentAnimation();
  }

  return {
    currentState: currentPlayerState,
    setPlayerState,
    ensureIdle,
    dispose,
  };
}
