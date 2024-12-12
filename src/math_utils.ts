import { mat4, vec3, Vec3 } from "wgpu-matrix";

export function getWorldMatrix(scale: Vec3, rotation: { x: number, y: number, z: number }, positon: Vec3) {
  const m = mat4.identity();

  mat4.translate(m, positon, m);
  mat4.rotateX(m, rotation.x, m);
  mat4.rotateY(m, rotation.y, m);
  mat4.rotateZ(m, rotation.z, m);
  mat4.scale(m, scale, m);

  return m;
}

export function getViewMatrix(eye: Vec3, target: Vec3) {
  const up = [0, 1, 0]; //010 or 0-10 if you want to look upside down!

  const lookAtMatrix = mat4.lookAt(eye, target, up);

  return lookAtMatrix;
}

export function getProjectionMatrix(width: number, height: number, fov: number = 60) {
  const fovInRadians = (fov / 180) * Math.PI;
  const aspect = width / height;
  const near = 0.1;
  const far = 100;

  return mat4.perspective(fovInRadians, aspect, near, far);
}

export function getMVPMatrix(scale: Vec3, rotation: { x: number, y: number, z: number }, position: Vec3, eye: Vec3, target: Vec3, width: number, height: number) {
  const worldMatrix = getWorldMatrix(scale, rotation, position);
  const viewMatrix = getViewMatrix(eye, target);
  const projectionMatrix = getProjectionMatrix(width, height)
  const mvpMatrix = mat4.identity();

  mat4.multiply(projectionMatrix, viewMatrix, mvpMatrix);
  mat4.multiply(mvpMatrix, worldMatrix, mvpMatrix);

  return mvpMatrix;
}
