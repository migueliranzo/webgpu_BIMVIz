struct Boundbox {
min: vec4f, 
max: vec4f,
} 

//struct Vertex {
//@location(0) position: vec3f, 
//@location(1) normal: vec3f,
//}

//Wait.... float32x3 is not the same as vec3<f32>? should be lol?

//struct Vertex {
 //position: vec3<f32>, 
// normal: vec3<f32>,
 //   padding: vec2<f32>,
//}

struct Vertex {
    a: f32,
    b: f32,
    c: f32,
    d: f32,
    e: f32,
    f: f32
}

struct Uniforms {
  modelMatrix: mat4x4f,
  color: vec3f,
  id: u32,
  padding: mat3x3f
}


struct ConstantUniforms {
  viewMatrix: mat4x4f, 
  projectionMatrix: mat4x4f, 
}

struct DrawCommandsBuffer {
  indexCount: u32,
    instanceCount: u32,
    firstIndex: u32,
    baseVertex: u32,
    firstInstance: u32,
}

@group(0) @binding(0) var<storage, read_write> instnacesBoundboxes: array<Boundbox>;
@group(0) @binding(1) var<storage, read> vertexBuffer: array<Vertex>;
@group(0) @binding(2) var<storage, read> indexBuffer: array<u32>;
@group(0) @binding(3) var<storage, read> instanceUniforms: array<Uniforms>;
@group(0) @binding(4) var<uniform> constantUniforms: ConstantUniforms;
@group(0) @binding(5) var<storage, read> drawCommands: array<DrawCommandsBuffer>;
@group(0) @binding(6) var<storage, read_write> instanceBoxesOffsets: array<u32>;



@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let instanceGroupDrawCommand = drawCommands[global_id.x];

    let instanceGroupIndex = global_id.x;
    
    //TODO: Find proper way to set extreme values
    var boundingBox: Boundbox;
    boundingBox.min = vec4f(88888888888888888.0, 88888888888888888.0, 88888888888888888.0, 1.0);
    boundingBox.max = vec4f(-88888888888888888.0, -88888888888888888.0, -88888888888888888.0, 1.0);

    let startIndex = instanceGroupDrawCommand.firstIndex;
    let indexCount = instanceGroupDrawCommand.indexCount;
    let baseVertex = instanceGroupDrawCommand.baseVertex;

    let instanceCount = instanceGroupDrawCommand.instanceCount;
    //var accOffset = 0u;

   // if instanceGroupIndex != 0 {

    //    accOffset = instanceBoxesOffsets[instanceGroupIndex - 1u];
   // }

   // for (var e = 0u; e < instanceCount; e = e + 1u) {

    for (var i = 0u; i < indexCount; i = i + 1u) {
        let vertexIndex = indexBuffer[startIndex + i];
        let vertexBufferOffset = baseVertex + vertexIndex;
        boundingBox.min.x = min(boundingBox.min.x, vertexBuffer[vertexBufferOffset].a);
        boundingBox.min.y = min(boundingBox.min.y, vertexBuffer[vertexBufferOffset].b);
        boundingBox.min.z = min(boundingBox.min.z, vertexBuffer[vertexBufferOffset].c);

        boundingBox.max.x = max(boundingBox.max.x, vertexBuffer[vertexBufferOffset].a);
        boundingBox.max.y = max(boundingBox.max.y, vertexBuffer[vertexBufferOffset].b);
        boundingBox.max.z = max(boundingBox.max.z, vertexBuffer[vertexBufferOffset].c);
        //boundingBox.min.x = min(boundingBox.min.x, vertexBuffer[vertexBufferOffset].a);
        //boundingBox.min.y = min(boundingBox.min.y, vertexBuffer[vertexBufferOffset].b);
        //boundingBox.min.z = min(boundingBox.min.z, vertexBuffer[vertexBufferOffset].c);

        //boundingBox.max.x = max(boundingBox.max.x, vertexBuffer[vertexBufferOffset].a);
        //boundingBox.max.y = max(boundingBox.max.y, vertexBuffer[vertexBufferOffset].b);
        //boundingBox.max.z = max(boundingBox.max.z, vertexBuffer[vertexBufferOffset].c);
    }

   // instnacesBoundboxes[accOffset + e] = boundingBox;
    instnacesBoundboxes[instanceGroupIndex] = boundingBox;
   // }

    //instanceBoxesOffsets[instanceGroupIndex] = accOffset + instanceCount;
}
