struct Boundbox {
min: vec4f, 
max: vec4f,
}

struct DrawCommandsBuffer {
  indexCount: u32,
    instanceCount: u32,
    firstIndex: u32,
    firstInstance: u32,
}

//TODO: Probably will have to just send the multiplied one but for now just keep it here
struct Matrices {
 viewMatrix: mat4x4f,
  projectionMatrix: mat4x4f
}

struct InstanceUniforms {
  modelMatrix: mat4x4f,
  color: vec3f,
  id: u32,
  padding: mat3x3f
}

@group(0) @binding(0) var<storage, read_write> command: array<DrawCommandsBuffer>;
@group(0) @binding(1) var<storage, read> instnacesBoundboxes: array<Boundbox>; 
@group(0) @binding(2) var<uniform> matrices: Matrices;
@group(0) @binding(3) var hizTexture: texture_2d<f32>;
@group(0) @binding(4) var<storage, read_write> newCommands: array<DrawCommandsBuffer>;
@group(0) @binding(5) var<storage, read_write> instanceUniforms: array<InstanceUniforms>;


//aaaa the workgroup size is key in compute shaders
@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {

    let instanceBox = instnacesBoundboxes[global_id.x];

    let corners = array<vec4<f32>, 8>(
        vec4(instanceBox.min.x, instanceBox.min.y, instanceBox.min.z, 1.),
        vec4(instanceBox.max.x, instanceBox.min.y, instanceBox.min.z, 1.),
        vec4(instanceBox.min.x, instanceBox.max.y, instanceBox.min.z, 1.),
        vec4(instanceBox.max.x, instanceBox.max.y, instanceBox.min.z, 1.),
        vec4(instanceBox.min.x, instanceBox.min.y, instanceBox.max.z, 1.),
        vec4(instanceBox.max.x, instanceBox.min.y, instanceBox.max.z, 1.),
        vec4(instanceBox.min.x, instanceBox.max.y, instanceBox.max.z, 1.),
        vec4(instanceBox.max.x, instanceBox.max.y, instanceBox.max.z, 1.)
    );

    let viewProj = matrices.projectionMatrix * matrices.viewMatrix * instanceUniforms[global_id.x].modelMatrix;

    var projected = projectPoint(corners[0], viewProj);
    var minX = projected.x;
    var maxX = projected.x;
    var minY = projected.y;
    var maxY = projected.y;
    var minZ = projected.z;
    var maxZ = projected.z;


    for (var i = 1u; i < 8u; i = i + 1u) {
        projected = projectPoint(corners[i], viewProj);
        if projected.x < 0.0 {
        continue;
        }
        minX = min(minX, projected.x);
        maxX = max(maxX, projected.x);
        minY = min(minY, projected.y);
        maxY = max(maxY, projected.y);
        minZ = min(minZ, projected.z);
        maxZ = max(maxZ, projected.z);
    }

    let textureSize = vec2<f32>(textureDimensions(hizTexture));

    let centerUV = vec2<i32>(
        i32((minX + maxX) * 0.5 * textureSize.x),
        i32((minY + maxY) * 0.5 * textureSize.y)
    );

    let boundsDepth = textureLoad(hizTexture, centerUV, 0) ;

    if (maxZ + 0.01) < boundsDepth.x {
        instanceUniforms[global_id.x].color = vec3f(1., 0., 0.);
    } else {
        instanceUniforms[global_id.x].color = vec3f(0., 1., 0.);
    }


    if projected.y <= 0 {
        instanceUniforms[global_id.x].color = vec3f(0., 1., 0.);
    }
}

fn projectPoint(pos: vec4<f32>, viewProj: mat4x4<f32>) -> vec3<f32> {
    let clipSpace = viewProj * pos;
    let ndcSpace = clipSpace.xyz / clipSpace.w;
    // Convert from NDC [-1,1] to screen space [0,1]
    if clipSpace.w <= 0.0 {
        return vec3<f32>(-1.0); // or handle this case differently
    }
    return vec3<f32>(
        (ndcSpace.xy * 0.5 + 0.5), // xy in [0,1]
        ndcSpace.z                  // Keep z in NDC space for depth
    );
}
 //       instanceUniforms[global_id.x].color = vec3f(maxZ, boundsDepth.x, 1.);
