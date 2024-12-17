// Note: The code in this file does not use the 'dst' output parameter of functions in the
// 'wgpu-matrix' library, so produces many temporary vectors and matrices.
// This is intentional, as this sample prefers readability over performance.
import { Mat4, Vec3, Vec4, mat4, vec3 } from 'wgpu-matrix';
import Input from './input';

// Common interface for camera implementations
export default interface Camera {
  // update updates the camera using the user-input and returns the view matrix.
  update(delta_time: number, input: Input): Mat4;

  // The camera matrix.
  // This is the inverse of the view matrix.
  matrix: Mat4;
  // Alias to column vector 0 of the camera matrix.
  right: Vec4;
  // Alias to column vector 1 of the camera matrix.
  up: Vec4;
  // Alias to column vector 2 of the camera matrix.
  back: Vec4;
  // Alias to column vector 3 of the camera matrix.
  position: Vec4;
}

// The common functionality between camera implementations
class CameraBase {
  // The camera matrix
  private matrix_ = new Float32Array([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
  ]);

  // The calculated view matrix
  private readonly view_ = mat4.create();

  // Aliases to column vectors of the matrix
  private right_ = new Float32Array(this.matrix_.buffer, 4 * 0, 4);
  private up_ = new Float32Array(this.matrix_.buffer, 4 * 4, 4);
  private back_ = new Float32Array(this.matrix_.buffer, 4 * 8, 4);
  private position_ = new Float32Array(this.matrix_.buffer, 4 * 12, 4);

  // Returns the camera matrix
  get matrix() {
    return this.matrix_;
  }
  // Assigns `mat` to the camera matrix
  set matrix(mat: Mat4) {
    mat4.copy(mat, this.matrix_);
  }

  // Returns the camera view matrix
  get view() {
    return this.view_;
  }
  // Assigns `mat` to the camera view
  set view(mat: Mat4) {
    mat4.copy(mat, this.view_);
  }

  // Returns column vector 0 of the camera matrix
  get right() {
    return this.right_;
  }
  // Assigns `vec` to the first 3 elements of column vector 0 of the camera matrix
  set right(vec: Vec3) {
    vec3.copy(vec, this.right_);
  }

  // Returns column vector 1 of the camera matrix
  get up() {
    return this.up_;
  }
  // Assigns `vec` to the first 3 elements of column vector 1 of the camera matrix
  set up(vec: Vec3) {
    vec3.copy(vec, this.up_);
  }

  // Returns column vector 2 of the camera matrix
  get back() {
    return this.back_;
  }
  // Assigns `vec` to the first 3 elements of column vector 2 of the camera matrix
  set back(vec: Vec3) {
    vec3.copy(vec, this.back_);
  }

  // Returns column vector 3 of the camera matrix
  get position() {
    return this.position_;
  }
  // Assigns `vec` to the first 3 elements of column vector 3 of the camera matrix
  set position(vec: Vec3) {
    vec3.copy(vec, this.position_);
  }
}

export class OrbitCamera extends CameraBase implements Camera {
  private distance = 0;
  private readonly worldUp = vec3.fromValues(0, 1, 0);
  private target = vec3.fromValues(0, 0, 0);
  private readonly verticalLimit = 0.01; //0.57 degrees

  rotationSpeed = 0.005;
  zoomSpeed = 0.1;
  translationSpeed = 0.002;
  constructor(options?: { position?: Vec3 }) {
    super();
    if (options?.position) {
      this.position = options.position;
      this.distance = vec3.len(this.position);
      this.back = vec3.normalize(this.position);
      this.recalculateVectors();
    }
  }

  // Standard view methods
  setFrontView() {
    // Looking towards negative Z
    this.back = vec3.fromValues(0, 0, 1);
    this.recalculateVectors();
    this.updatePosition();
  }

  setBackView() {
    // Looking towards positive Z
    this.back = vec3.fromValues(0, 0, -1);
    this.recalculateVectors();
    this.updatePosition();
  }

  setTopView() {
    // Looking down negative Y
    const angle = Math.PI / 2 - this.verticalLimit;
    this.back = vec3.fromValues(0, Math.sin(angle), Math.cos(angle));
    this.recalculateVectors();
    this.updatePosition();
  }

  setBottomView() {
    // Looking up positive Y
    const angle = Math.PI / 2 - this.verticalLimit;
    this.back = vec3.fromValues(0, -Math.sin(angle), -Math.cos(angle));
    this.recalculateVectors();
    this.updatePosition();
  }

  setRightView() {
    // Looking towards negative X
    this.back = vec3.fromValues(1, 0, 0);
    this.recalculateVectors();
    this.updatePosition();
  }

  setLeftView() {
    // Looking towards positive X
    this.back = vec3.fromValues(-1, 0, 0);
    this.recalculateVectors();
    this.updatePosition();
  }

  update(deltaTime: number, input: Input): Mat4 {
    const epsilon = 0.0000001;


    if (input.analog.touching) {

      if (input.digital.shift) {
        const moveScale = this.distance * this.translationSpeed;

        const rightMove = vec3.scale(this.right, -input.analog.x * moveScale);
        const upMove = vec3.scale(this.up, input.analog.y * moveScale);

        this.target = vec3.add(this.target, rightMove);
        this.target = vec3.add(this.target, upMove);

        this.position = vec3.add(this.target, vec3.scale(this.back, this.distance));
      } else {
        const movement = vec3.create();

        vec3.addScaled(movement, this.worldUp, -input.analog.x, movement);
        const verticalAxis = vec3.normalize(vec3.cross(this.worldUp, this.back));
        vec3.addScaled(movement, verticalAxis, -input.analog.y, movement);
        const magnitude = vec3.len(movement);

        if (magnitude > epsilon) {
          const rotationAngle = magnitude * this.rotationSpeed;
          const rotationAxis = vec3.normalize(movement);

          let newBack = rotate(this.back, rotationAxis, rotationAngle);
          newBack = vec3.normalize(newBack);


          const dotWithUp = Math.abs(vec3.dot(newBack, this.worldUp));
          if (dotWithUp < Math.cos(this.verticalLimit)) {
            this.back = newBack;
            this.recalculateVectors();
            this.updatePosition();
          }
        }
      }
    }

    if (input.analog.zoom !== 0 && !input.digital.shift) {
      this.distance *= 1 + input.analog.zoom * this.zoomSpeed;
      this.updatePosition();
    }

    const matrix = new Float32Array([
      this.right[0], this.right[1], this.right[2], 0,
      this.up[0], this.up[1], this.up[2], 0,
      this.back[0], this.back[1], this.back[2], 0,
      this.position[0], this.position[1], this.position[2], 1
    ]);

    this.matrix = matrix;

    this.view = mat4.invert(this.matrix);
    return this.view;
  }

  private recalculateVectors() {
    this.right = vec3.normalize(vec3.cross(this.worldUp, this.back));
    this.up = vec3.normalize(vec3.cross(this.back, this.right));
  }

  private updatePosition() {
    this.position = vec3.add(this.target, vec3.scale(this.back, this.distance));
  }
}


// Returns `x` clamped between [`min` .. `max`]
function clamp(x: number, min: number, max: number): number {
  return Math.min(Math.max(x, min), max);
}

// Returns `x` float-modulo `div`
function mod(x: number, div: number): number {
  return x - Math.floor(Math.abs(x) / div) * div * Math.sign(x);
}

// Returns `vec` rotated `angle` radians around `axis`
function rotate(vec: Vec3, axis: Vec3, angle: number): Vec3 {
  return vec3.transformMat4Upper3x3(vec, mat4.rotation(axis, angle));
}

// Returns the linear interpolation between 'a' and 'b' using 's'
function lerp(a: Vec3, b: Vec3, s: number): Vec3 {
  return vec3.addScaled(a, vec3.sub(b, a), s);
}
