// fps-controls.js
import * as THREE from 'three';

export class FPSControls {
  constructor(camera, domElement, options = {}) {
    this.camera     = camera;
    this.domElement = domElement;

    this.yaw         = options.yaw         ?? 0;
    this.pitch       = options.pitch       ?? 0;
    this.sensitivity = options.sensitivity ?? 0.002;
    this.speed       = options.speed       ?? 4.5;
    this.runMultiplier = options.runMultiplier ?? 2.0;
    this.enabled     = options.enabled     ?? true;

    const startPos = options.position ?? new THREE.Vector3(0, 1.65, 0);
    this.position  = new THREE.Vector3(startPos.x, startPos.y, startPos.z);

    this.isLocked = false;
    this.keys = { w: 0, a: 0, s: 0, d: 0, shift: 0 };

    this.onLock   = null;
    this.onUnlock = null;

    this._onClick = () => {
      if (!this.isLocked) this.requestLock();
    };

    this._onPointerLockChange = () => {
      this.isLocked = document.pointerLockElement === this.domElement;
      document.body.style.cursor = this.isLocked ? 'none' : 'default';
      if (this.isLocked) this.onLock?.(); else this.onUnlock?.();
    };

    this._onMouseMove = (e) => {
      if (!this.isLocked) return;
      this.yaw   -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity;
      this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch));
    };

    this._onKeyDown = (e) => {
      if (e.code === 'KeyW') this.keys.w = 1;
      else if (e.code === 'KeyA') this.keys.a = 1;
      else if (e.code === 'KeyS') this.keys.s = 1;
      else if (e.code === 'KeyD') this.keys.d = 1;
      else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.shift = 1;
    };

    this._onKeyUp = (e) => {
      if (e.code === 'KeyW') this.keys.w = 0;
      else if (e.code === 'KeyA') this.keys.a = 0;
      else if (e.code === 'KeyS') this.keys.s = 0;
      else if (e.code === 'KeyD') this.keys.d = 0;
      else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.shift = 0;
    };

    this.domElement.addEventListener('click', this._onClick);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    document.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);

    this.camera.rotation.order = 'YXZ';
    this.camera.position.copy(this.position);
  }

  requestLock() {
    const el = this.domElement;
    try {
      const p = el.requestPointerLock({ unadjustedMovement: true });
      if (p && typeof p.catch === 'function') {
        p.catch(() => { try { el.requestPointerLock(); } catch (e) {} });
      }
    } catch (e) {
      try { el.requestPointerLock(); } catch (e2) {}
    }
  }

  update(dt) {
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    if (this.isLocked && this.enabled) {
      const fwd = new THREE.Vector3(0, 0, -1).applyEuler(this.camera.rotation);
      fwd.y = 0; fwd.normalize();

      const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, this.yaw, 0));
      right.y = 0; right.normalize();

      const move = new THREE.Vector3();
      if (this.keys.w) move.add(fwd);
      if (this.keys.s) move.sub(fwd);
      if (this.keys.d) move.add(right);
      if (this.keys.a) move.sub(right);

      if (move.lengthSq() > 0) {
        move.normalize();
        const sp = this.speed * (this.keys.shift ? this.runMultiplier : 1);
        this.position.addScaledVector(move, sp * dt);
      }
    }

    this.camera.position.copy(this.position);
  }

  dispose() {
    this.domElement.removeEventListener('click', this._onClick);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    document.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }
}
