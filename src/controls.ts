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
  const keys = new Set<string>();
  let running = false;
  // Mobile "hold to walk" button state (also drives desktop W behavior is via keys)
  let walking = false;

  app.on("update", (dt: number) => {
    pitch.v = Math.max(-85, Math.min(85, pitch.v));
    camera.setLocalEulerAngles(pitch.v, yaw.v, 0);

    const yawRad = (yaw.v * Math.PI) / 180;
    const pitchRad = (pitch.v * Math.PI) / 180;

    let dx = 0;
    let dz = 0;
    let dy = 0;
    if (keys.has("w") || walking) dz -= 1;
    if (keys.has("s")) dz += 1;
    if (keys.has("a")) dx -= 1;
    if (keys.has("d")) dx += 1;
    if (keys.has(" ")) dy += 1;
    if (keys.has("shift") && (dx || dz || dy)) {/* run handled below */}

    const len = Math.hypot(dx, dz);
    if (len > 0 || dy !== 0) {
      if (len > 0) {
        dx /= len;
        dz /= len;
      }
      const speed = MOVE_SPEED * (running ? RUN_MULT : 1) * dt;
      const pos = camera.getLocalPosition();
      // Walk button glides along the camera's gaze (so you walk where you look,
      // including up/down stairs). Strafe stays purely horizontal.
      const forwardX = -Math.sin(yawRad) * Math.cos(pitchRad);
      const forwardY = -Math.sin(pitchRad);
      const forwardZ = -Math.cos(yawRad) * Math.cos(pitchRad);
      const rightX = Math.cos(yawRad);
      const rightZ = -Math.sin(yawRad);
      pos.x += (forwardX * -dz + rightX * dx) * speed;
      pos.y += forwardY * -dz * speed + dy * speed;
      pos.z += (forwardZ * -dz + rightZ * dx) * speed;
      camera.setLocalPosition(pos);
    }
  });

  // ---- Desktop ----
  if (!isTouchDevice()) {
    canvas.addEventListener("click", () => canvas.requestPointerLock?.());
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
  // Show the on-screen Walk button only on touch devices.
  const walkBtn = document.getElementById("walk-btn") as HTMLButtonElement | null;
  if (walkBtn) {
    walkBtn.classList.add("visible");
    const press = (e: Event) => {
      walking = true;
      walkBtn.classList.add("active");
      e.preventDefault();
      e.stopPropagation();
    };
    const release = (e: Event) => {
      walking = false;
      walkBtn.classList.remove("active");
      e.preventDefault();
      e.stopPropagation();
    };
    walkBtn.addEventListener("touchstart", press, { passive: false });
    walkBtn.addEventListener("touchend", release, { passive: false });
    walkBtn.addEventListener("touchcancel", release, { passive: false });
    // Also support mouse for emulators / desktop touch testing
    walkBtn.addEventListener("mousedown", press);
    walkBtn.addEventListener("mouseup", release);
    walkBtn.addEventListener("mouseleave", release);
  }

  // Drag-to-look + two-finger pinch FOV. We track touches that originate on
  // the canvas only; touches starting on the walk button are handled above.
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
}

function findTouch(list: TouchList, id: number): Touch | null {
  for (let i = 0; i < list.length; i++) {
    if (list.item(i)?.identifier === id) return list.item(i);
  }
  return null;
}
