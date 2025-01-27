struct ConstantUniforms {
    viewMatrix: mat4x4f,
    projectionMatrix: mat4x4f,
}

struct BoundBox {
    min: vec4f,
    max: vec4f,
}


struct Uniforms {
  modelMatrix: mat4x4f,
  color: vec3f,
  id: u32,
  padding: mat3x3f
}

// These vertices define the corners of a unit cube from 0 to 1
// We'll transform them based on the bounding box min/max in the vertex shader
const CUBE_VERTICES = array<vec3f, 8>(
    vec3f(0.0, 0.0, 0.0),  // 0: min point
    vec3f(1.0, 0.0, 0.0),  // 1: x-extended
    vec3f(0.0, 1.0, 0.0),  // 2: y-extended
    vec3f(1.0, 1.0, 0.0),  // 3: xy-extended
    vec3f(0.0, 0.0, 1.0),  // 4: z-extended
    vec3f(1.0, 0.0, 1.0),  // 5: xz-extended
    vec3f(0.0, 1.0, 1.0),  // 6: yz-extended
    vec3f(1.0, 1.0, 1.0)   // 7: xyz-extended (max point)
);

// These indices define the lines that make up the cube
// Each pair of indices defines a line
const CUBE_INDICES = array<u32, 24>(
    0, 1,  // bottom face edges
    0, 2,
    1, 3,
    2, 3,
    4, 5,  // top face edges
    4, 6,
    5, 7,
    6, 7,
    0, 4,  // vertical edges
    1, 5,
    2, 6,
    3, 7
);

@binding(0) @group(0) var<uniform> constantUniforms: ConstantUniforms;
@binding(1) @group(0) var<storage, read> instanceBoundboxes: array<BoundBox>;
@binding(2) @group(0) var<storage, read> instanceUniforms: array<Uniforms>;

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f,
}

@vertex
fn vertex_main(
    @builtin(vertex_index) vertexIndex: u32,
    @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
    // Get the current bound box for this instance
   //The thing is this takes the bounding box from where it isnt...
    let boundBox = instanceBoundboxes[instanceIndex] ;
    let boundBoxInstanceUniforms = instanceUniforms[instanceIndex];
    
    // Get the line vertex index from the CUBE_INDICES array
    let lineIndex = CUBE_INDICES[vertexIndex];
    // Get the base vertex position from CUBE_VERTICES
    let baseVertex = CUBE_VERTICES[lineIndex];
    
    // Transform the unit cube vertex to the bound box space
    let scale = boundBox.max.xyz - boundBox.min.xyz;
    let position = boundBox.min.xyz + (baseVertex * scale);
    
    // Transform to clip space
    let worldPos = vec4f(position, 1.0);
    let clipPos = constantUniforms.projectionMatrix * constantUniforms.viewMatrix * boundBoxInstanceUniforms.modelMatrix * worldPos;

    var output: VertexOutput;
    output.position = clipPos;



    // Color each instance differently based on index
    // This helps visualize different boxes
    output.color = vec4f(
        f32(instanceIndex % 2u),
        f32((instanceIndex / 2u) % 2u),
        f32((instanceIndex / 4u) % 2u),
        1.0
    );


    output.color = vec4f(boundBoxInstanceUniforms.color, 1.0);

    return output;
}

@fragment
fn fragment_main(in: VertexOutput) -> @location(0) vec4f {
    return in.color;
}
