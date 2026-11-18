// TrafficInsightLazyFollow
// Owns the pose of AlertIconRoot: eases it toward a camera-local offset each
// LateUpdate (exponential smoothing) and billboards its local +Z toward the camera.
// Never touches visibility - the alert UI module owns the content children.

import { tiError, tiLog } from "./TrafficInsightSceneContracts";

@component
export class TrafficInsightLazyFollow extends BaseScriptComponent {
  @input cameraObject: SceneObject; // the scene Camera object
  @input offsetCm: vec3 = new vec3(10, -16, -100); // camera-local offset: right, low, ~1 m ahead
  @input @widget(new SliderWidget(0.5, 12, 0.5)) followSmoothing: number = 4.0;
  @input faceCamera: boolean = true;

  private camT: Transform | null = null;
  private myT: Transform | null = null;

  onAwake(): void {
    this.myT = this.getSceneObject().getTransform();
    if (!this.cameraObject) {
      tiError("TrafficInsightLazyFollow: cameraObject input is not set");
      return;
    }
    this.camT = this.cameraObject.getTransform();
    this.createEvent("OnStartEvent").bind(() => this.snapToTarget());
    this.createEvent("LateUpdateEvent").bind(() => this.onLateUpdate());
  }

  /** Jump straight to camera pose + offset (called when the alert starts). */
  snapToTarget(): void {
    if (!this.camT || !this.myT) {
      return;
    }
    const target = this.computeTarget();
    this.myT.setWorldPosition(target);
    this.applyBillboard(target);
    tiLog("TrafficInsightLazyFollow: snapped to camera offset");
  }

  /** This object's current world position expressed in the camera's local frame. */
  getCameraLocalOffset(): vec3 {
    if (!this.camT || !this.myT) {
      return vec3.zero();
    }
    return this.camT.getInvertedWorldTransform().multiplyPoint(this.myT.getWorldPosition());
  }

  private computeTarget(): vec3 {
    return this.camT.getWorldTransform().multiplyPoint(this.offsetCm);
  }

  private onLateUpdate(): void {
    if (!this.camT || !this.myT) {
      return;
    }
    const target = this.computeTarget();
    const current = this.myT.getWorldPosition();
    const t = 1 - Math.exp(-Math.max(0, this.followSmoothing) * getDeltaTime());
    const pos = vec3.lerp(current, target, t);
    this.myT.setWorldPosition(pos);
    this.applyBillboard(pos);
  }

  private applyBillboard(pos: vec3): void {
    if (!this.faceCamera) {
      return;
    }
    const toCam = this.camT.getWorldPosition().sub(pos);
    if (toCam.length < 1e-4) {
      return;
    }
    let up = this.camT.up;
    if (up.length < 1e-4) {
      up = vec3.up();
    }
    // quat.lookAt aligns local +Z with the given forward, so +Z (UI front) faces the camera.
    this.myT.setWorldRotation(quat.lookAt(toCam.normalize(), up));
  }
}
