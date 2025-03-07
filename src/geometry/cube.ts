
export const cubeVertexSize = 4 * 10; // Byte size of one cube vertex.
export const cubePositionOffset = 0;
export const cubeColorOffset = 4 * 4; // Byte offset of cube vertex color attribute.
export const cubeUVOffset = 4 * 8;
export const cubeVertexCount = 36;

// Format: [px,py,pz, nx,ny,nz, u,v] for each vertex
export const cubeVertexData = new Float32Array([
  // Front face
  -0.5, -0.5, 0.5, 0, 0, 1, 0, 0, // bottom-left
  0.5, -0.5, 0.5, 0, 0, 1, 1, 0, // bottom-right
  0.5, 0.5, 0.5, 0, 0, 1, 1, 1, // top-right
  -0.5, -0.5, 0.5, 0, 0, 1, 0, 0, // bottom-left
  0.5, 0.5, 0.5, 0, 0, 1, 1, 1, // top-right
  -0.5, 0.5, 0.5, 0, 0, 1, 0, 1, // top-left

  // Back face
  -0.5, -0.5, -0.5, 0, 0, -1, 1, 0, // bottom-left
  -0.5, 0.5, -0.5, 0, 0, -1, 1, 1, // top-left
  0.5, 0.5, -0.5, 0, 0, -1, 0, 1, // top-right
  -0.5, -0.5, -0.5, 0, 0, -1, 1, 0, // bottom-left
  0.5, 0.5, -0.5, 0, 0, -1, 0, 1, // top-right
  0.5, -0.5, -0.5, 0, 0, -1, 0, 0, // bottom-right

  // Top face
  -0.5, 0.5, -0.5, 0, 1, 0, 0, 1, // back-left
  -0.5, 0.5, 0.5, 0, 1, 0, 0, 0, // front-left
  0.5, 0.5, 0.5, 0, 1, 0, 1, 0, // front-right
  -0.5, 0.5, -0.5, 0, 1, 0, 0, 1, // back-left
  0.5, 0.5, 0.5, 0, 1, 0, 1, 0, // front-right
  0.5, 0.5, -0.5, 0, 1, 0, 1, 1, // back-right

  // Bottom face
  -0.5, -0.5, -0.5, 0, -1, 0, 0, 0, // back-left
  0.5, -0.5, -0.5, 0, -1, 0, 1, 0, // back-right
  0.5, -0.5, 0.5, 0, -1, 0, 1, 1, // front-right
  -0.5, -0.5, -0.5, 0, -1, 0, 0, 0, // back-left
  0.5, -0.5, 0.5, 0, -1, 0, 1, 1, // front-right
  -0.5, -0.5, 0.5, 0, -1, 0, 0, 1, // front-left

  // Right face
  0.5, -0.5, -0.5, 1, 0, 0, 1, 0, // bottom-back
  0.5, 0.5, -0.5, 1, 0, 0, 1, 1, // top-back
  0.5, 0.5, 0.5, 1, 0, 0, 0, 1, // top-front
  0.5, -0.5, -0.5, 1, 0, 0, 1, 0, // bottom-back
  0.5, 0.5, 0.5, 1, 0, 0, 0, 1, // top-front
  0.5, -0.5, 0.5, 1, 0, 0, 0, 0, // bottom-front

  // Left face
  -0.5, -0.5, -0.5, -1, 0, 0, 0, 0, // bottom-back
  -0.5, -0.5, 0.5, -1, 0, 0, 1, 0, // bottom-front
  -0.5, 0.5, 0.5, -1, 0, 0, 1, 1, // top-front
  -0.5, -0.5, -0.5, -1, 0, 0, 0, 0, // bottom-back
  -0.5, 0.5, 0.5, -1, 0, 0, 1, 1, // top-front
  -0.5, 0.5, -0.5, -1, 0, 0, 0, 1  // top-back
]);

// Position data (x, y, z, w)
export const positionArray = new Float32Array([
  1, -1, 1, 1,
  -1, -1, 1, 1,
  -1, -1, -1, 1,
  1, -1, -1, 1,
  1, -1, 1, 1,
  -1, -1, -1, 1,
  1, 1, 1, 1,
  1, -1, 1, 1,
  1, -1, -1, 1,
  1, 1, -1, 1,
  1, 1, 1, 1,
  1, -1, -1, 1,
  -1, 1, 1, 1,
  1, 1, 1, 1,
  1, 1, -1, 1,
  -1, 1, -1, 1,
  -1, 1, 1, 1,
  1, 1, -1, 1,
  -1, -1, 1, 1,
  -1, 1, 1, 1,
  -1, 1, -1, 1,
  -1, -1, -1, 1,
  -1, -1, 1, 1,
  -1, 1, -1, 1,
  1, 1, 1, 1,
  -1, 1, 1, 1,
  -1, -1, 1, 1,
  -1, -1, 1, 1,
  1, -1, 1, 1,
  1, 1, 1, 1,
  1, -1, -1, 1,
  -1, -1, -1, 1,
  -1, 1, -1, 1,
  1, 1, -1, 1,
  1, -1, -1, 1,
  -1, 1, -1, 1
]);

// Color data (r, g, b, a)
export const colorArray = new Float32Array([
  1, 0, 1, 1,
  1, 0, 1, 1,
  1, 0, 0, 1,
  1, 0, 0, 1,
  1, 0, 1, 1,
  0, 0, 0, 1,
  1, 1, 1, 1,
  1, 0, 1, 1,
  1, 0, 0, 1,
  1, 1, 0, 1,
  1, 1, 1, 1,
  1, 0, 0, 1,
  1, 1, 1, 1,
  1, 1, 1, 1,
  1, 1, 0, 1,
  1, 1, 0, 1,
  1, 1, 1, 1,
  1, 1, 0, 1,
  1, 0, 1, 1,
  0, 1, 1, 1,
  1, 1, 0, 1,
  1, 0, 0, 1,
  0, 0, 1, 1,
  0, 1, 0, 1,
  1, 1, 1, 1,
  0, 1, 1, 1,
  0, 0, 1, 1,
  0, 0, 1, 1,
  1, 0, 1, 1,
  1, 1, 1, 1,
  1, 0, 0, 1,
  0, 0, 0, 1,
  0, 1, 0, 1,
  1, 1, 0, 1,
  1, 0, 0, 1,
  0, 1, 0, 1
]);

// UV data (u, v)
export const uvArray = new Float32Array([
  0, 1,
  1, 1,
  1, 0,
  0, 0,
  0, 1,
  1, 0,
  0, 1,
  1, 1,
  1, 0,
  0, 0,
  0, 1,
  1, 0,
  0, 1,
  1, 1,
  1, 0,
  0, 0,
  0, 1,
  1, 0,
  0, 1,
  1, 1,
  1, 0,
  0, 0,
  0, 1,
  1, 0,
  0, 1,
  1, 1,
  1, 0,
  1, 0,
  0, 0,
  0, 1,
  0, 1,
  1, 1,
  1, 0,
  0, 0,
  0, 1,
  1, 0
]);


