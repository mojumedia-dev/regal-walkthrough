import * as pc from "playcanvas";

const MOVE_SPEED = 2.5;        // m/s
const RUN_MULT = 2.2;
const LOOK_SENS = 0.12;
const TOUCH_LOOK_SENS = 0.18;
const PINCH_FOV_MIN = 30;
const PINCH_FOV_MAX = 90;
const JOY_RADIUS = 44;          // px the knob can travel from center
const JOY_DEADZONE = 0.12;      // ignore tiny drift

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

  // Joystick output: -1..1 for both axes. y is forward (negative = forward).
  const joy = { x: 0, y: 0 };

  app.on("update", (dt: number) => {
    pitch.v = Math.max(-85, Math.min(85, pitch.v));
    camera.setLocalEulerAngles(pitch.v, yaw.v, 0);

    const yawRad = (yaw.v * Math.PI) / 180;
    const pitchRad = (pitch.v * Math.PI) / 180;

    let dx = 0;
    let dz = 0;
    let dy = 0;
    if (keys.has("w")) dz -= 1;
    if (keys.has("s")) dz += 1;
    if (keys.has("a")) dx -= 1;
    if (keys.has("d")) dx += 1;
    if (keys.has(" ")) dy += 1;

    // Joystick adds onto keyboard (in case both used in dev)
    dx += joy.x;
    dz += joy.y; // joy.y already negative for forward

    const len = Math.hypot(dx, dz);
    if (len > 0 || dy !== 0) {
      // Clamp magnitude so combined keys+joystick don't exceed full speed
      const mag = Math.min(1, len);
      const ux = len > 0 ? (dx / len) * mag : 0;
      const uz = len > 0 ? (dz / len) * mag : 0;
      const speed = MOVE_SPEED * (running ? RUN_MULT : 1) * dt;

      const forwardX = -Math.sin(yawRad) * Math.cos(pitchRad);
      const forwardY = -Math.sin(pitchRad);
      const forwardZ = -Math.cos(yawRad) * Math.cos(pitchRad);
      const rightX = Math.cos(yawRad);
      const rightZ = -Math.sin(yawRad);

      const pos = camera.getLocalPosition();
      pos.x += (forwardX * -uz + rightX * ux) * speed;
      pos.y += forwardY * -uz * speed + dy * speed;
      pos.z += (forwardZ * -uz + rightZ * ux) * speed;
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
  setupJoystick(joy);

  // Drag-to-look + two-finger pinch FOV. Touches that start on the joystick
  // are intercepted there and never reach this canvas listener.
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

function setupJoystick(joy: { x: number; y: number }) {
  const root = document.getElementById("joystick") as HTMLDivElement | null;
  const knob = document.getElementById("joystick-knob") as HTMLDivElement | null;
  if (!root || !knob) return;
  root.classList.add("visible");

  let activeId = -1;

  const setKnob = (kx: number, ky: number) => {
    knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
  };
  const reset = () => {
    activeId = -1;
    joy.x = 0;
    joy.y = 0;
    root.classList.remove("active");
    setKnob(0, 0);
  };

  root.addEventListener(
    "touchstart",
    (e) => {
      if (activeId !== -1) return;
      const t = e.changedTouches[0];
      activeId = t.identifier;
      root.classList.add("active");
      updateFromTouch(t.clientX, t.clientY);
      e.preventDefault();
      e.stopPropagation();
    },
    { passive: false },
  );

  root.addEventListener(
    "touchmove",
    (e) => {
      const t = findChangedTouch(e.changedTouches, activeId);
      if (!t) return;
      updateFromTouch(t.clientX, t.clientY);
      e.preventDefault();
      e.stopPropagation();
    },
    { passive: false },
  );

  const onEnd = (e: TouchEvent) => {
    const ended = findChangedTouch(e.changedTouches, activeId);
    if (!ended) return;
    reset();
    e.preventDefault();
    e.stopPropagation();
  };
  root.addEventListener("touchend", onEnd, { passive: false });
  root.addEventListener("touchcancel", onEnd, { passive: false });

  function updateFromTouch(clientX: number, clientY: number) {
    const rect = root!.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > JOY_RADIUS) {
      const k = JOY_RADIUS / dist;
      dx *= k;
      dy *= k;
    }
    setKnob(dx, dy);
    // Convert to -1..1
    let nx = dx / JOY_RADIUS;
    let ny = dy / JOY_RADIUS;
    // Apply deadzone for low drift
    const m = Math.hypot(nx, ny);
    if (m < JOY_DEADZONE) {
      nx = 0;
      ny = 0;
    }
    joy.x = nx;
    joy.y = ny;
  }
}

function findChangedTouch(list: TouchList, id: number): Touch | null {
  for (let i = 0; i < list.length; i++) {
    if (list.item(i)?.identifier === id) return list.item(i);
  }
  return null;
}

function findTouch(list: TouchList, id: number): Touch | null {
  for (let i = 0; i < list.length; i++) {
    if (list.item(i)?.identifier === id) return list.item(i);
  }
  return null;
}
