/** Places the dashboard spot from yaw only; looking down never moves it away. */
@component
export class TrafficInsightHeadingFollow extends BaseScriptComponent {
    @input cameraObject: SceneObject;
    @input distanceCm: number = 100;
    @input belowHorizonDeg: number = 25;
    @input smoothing: number = 5;
    private heading: vec3 = new vec3(0, 0, -1);

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => this.updatePose(true));
        this.createEvent("LateUpdateEvent").bind(() => this.updatePose(false));
    }

    private updatePose(snap: boolean): void {
        if (!this.cameraObject) return;
        const cam = this.cameraObject.getTransform();
        const forward = cam.getWorldRotation().multiplyVec3(new vec3(0, 0, -1));
        const flat = new vec3(forward.x, 0, forward.z);
        if (flat.length > 0.01) {
            const target = flat.normalize();
            const blend = snap ? 1 : 1 - Math.exp(-Math.max(0, this.smoothing) * getDeltaTime());
            const mixed = vec3.lerp(this.heading, target, blend);
            this.heading = mixed.length > 0.01 ? mixed.normalize() : target;
        }
        const angle = this.belowHorizonDeg * Math.PI / 180;
        const eye = cam.getWorldPosition();
        const pos = eye.add(this.heading.uniformScale(this.distanceCm * Math.cos(angle)))
            .add(new vec3(0, -this.distanceCm * Math.sin(angle), 0));
        const transform = this.sceneObject.getTransform();
        transform.setWorldPosition(pos);
        transform.setWorldRotation(quat.lookAt(eye.sub(pos).normalize(), vec3.up()));
    }
}
