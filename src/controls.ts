import * as pc from "playcanvas";

const MOVE_SPEED = 2.5;        // m/s
const RUN_MULT = 2.2;          // hold Shift on desktop
const LOOK_SENS = 0.12;        // deg per CSS pixel
const TOUCH_LOOK_SENS = 0.18;
const PINCH_FOV_MIN = 30;
const PINCH_FOV_MAX = 90;

export function isTouchDevice(): boolean {
  return (
    "ontouchstart" in window ||
    (navigator.maxTouchPoints ?? 0) > 0
  );
}

export function setupControls(
  app: pc.AppBase,
  camera: pc.Entity,
  canvas: HTMLCanvasElement,
): void {
  const yaw = { v: 0 };
  const pitch = { v: 0 };
  const move = { x: 0, y: 0, z: 0 };
  const keys = new Set<string>();
  let running = false;

  // Apply rotation each frame
  app.on("update", (dt: number) => {
    pitch.v = Math.max(-85, Math.min(85, pitch.v));
    camera.setLocalEulerAngles(pitch.v, yaw.v, 0);

    // Translate movement into camera-local space (ignoring pitch so WASD doesn't fly)
    const forward = new pc.Vec3(0, 0, -1);
    const right = new pc.Vec3(1, 0, 0);
    const yawRad = (yaw.v * Math.PI) / 180;
    forward.set(-Math.sin(yawRad), 0, -Math.cos(yawRad));
    right.set(Math.cos(yawRad), 0, -Math.sin(yawRad));

    let dx = 0;
    let dz = 0;
    if (keys.has("w") || move.z < 0) dz -= 1;
    if (keys.has("s") || move.z > 0) dz += 1;
    if (keys.has("a") || move.x < 0) dx -= 1;
    if (keys.has("d") || move.x > 0) dx += 1;

    const len = Math.hypot(dx, dz);
    if (len > 0) {
      dx /= len;
      dz /= len;
      const speed = MOVE_SPEED * (running ? RUN_MULT : 1) * dt;
      const pos = camera.getLocalPosition();
      pos.x += (forward.x * -dz + right.x * dx) * speed;
      pos.z += (forward.z * -dz + right.z * dx) * speed;
      camera.setLocalPosition(pos);
    }
  });

  // ---- Desktop ----
  if (!isTouchDevice()) {
    canvas.addEventListener("click", () => {
      canvas.requestPointerLock?.();
    });
    document.addEventListener("mousemove", (e) => {
      if (document.pointerLockElement !== canvas) return;
      yaw.v -= e.movementX * LOOK_SENS;
      pitch.v -= e.movementY * LOOK_SENS;
    });
    window.addEventListener("keydown", (e) => {
      keys.add(e.key.toLowerCase());
      if (e.key === "Shift") running = true;
    });
    window.addEventListener("keyup", (e) => {
      keys.delete(e.key.toLowerCase());
      if (e.key === "Shift") running = false;
    });
    return;
  }

  // ---- Touch ----
  // One finger = look, two fingers = pinch zoom (camera fov), three fingers = move forward.
  // For an MVP we keep it to one-finger drag look + a virtual joystick.
  let lastX = 0;
  let lastY = 0;
  let lookFingerId = -1;
  const pinch = { id1: -1, id2: -1, startDist: 0, startFov: 60 };

  canvas.addEventListener(
    "touchstart",
    (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (lookFingerId === -1) {
          lookFingerId = t.identifier;
          lastX = t.clientX;
          lastY = t.clientY;
        } else if (pinch.id1 === -1) {
          pinch.id1 = lookFingerId;
          pinch.id2 = t.identifier;
          const t1 = findTouch(e.touches, pinch.id1);
          const t2 = findTouch(e.touches, pinch.id2);
          if (t1 && t2) {
            pinch.startDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            pinch.startFov = camera.camera!.fov;
          }
        }
      }
      e.preventDefault();
    },
    { passive: false },
  );

  canvas.addEventListener(
    "touchmove",
    (e) => {
      if (pinch.id1 !== -1 && pinch.id2 !== -1) {
        const t1 = findTouch(e.touches, pinch.id1);
        const t2 = findTouch(e.touches, pinch.id2);
        if (t1 && t2) {
          const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
          const ratio = pinch.startDist / dist;
          const fov = Math.max(PINCH_FOV_MIN, Math.min(PINCH_FOV_MAX, pinch.startFov * ratio));
          camera.camera!.fov = fov;
        }
        e.preventDefault();
        return;
      }
      const touch = findTouch(e.touches, lookFingerId);
      if (!touch) return;
      const dx = touch.clientX - lastX;
      const dy = touch.clientY - lastY;
      lastX = touch.clientX;
      lastY = touch.clientY;
      yaw.v -= dx * TOUCH_LOOK_SENS;
      pitch.v -= dy * TOUCH_LOOK_SENS;
      e.preventDefault();
    },
    { passive: false },
  );

  canvas.addEventListener("touchend", (e) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === lookFingerId) lookFingerId = -1;
      if (t.identifier === pinch.id1 || t.identifier === pinch.id2) {
        pinch.id1 = -1;
        pinch.id2 = -1;
      }
    }
    if (lookFingerId === -1 && e.touches.length > 0) {
      lookFingerId = e.touches[0].identifier;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
    }
  });

  // Simple double-tap to step forward (since we don't have a joystick yet)
  let lastTap = 0;
  canvas.addEventListener("touchend", (e) => {
    const now = performance.now();
    if (now - lastTap < 300 && e.changedTouches.length === 1) {
      const yawRad = (yaw.v * Math.PI) / 180;
      const pos = camera.getLocalPosition();
      pos.x += -Math.sin(yawRad) * 1.5;
      pos.z += -Math.cos(yawRad) * 1.5;
      camera.setLocalPosition(pos);
    }
    lastTap = now;
  });
}

function findTouch(list: TouchList, id: number): Touch | null {
  for (let i = 0; i < list.length; i++) {
    if (list.item(i)?.identifier === id) return list.item(i);
  }
  return null;
}
