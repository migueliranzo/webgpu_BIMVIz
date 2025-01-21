//Different by instance same each pass
struct Uniforms {
  modelMatrix: mat4x4f,
  color: vec3f,
  id: u32,
  padding: mat3x3f
}

struct Boundbox {
min: vec4f, 
max: vec4f,
}

//Same by instance different each pass
struct ConstantUnifroms {
  viewMatrix: mat4x4f, 
  projectionMatrix: mat4x4f, 
}

struct MeshData {
  meshId: u32,
  typeId: u32
}

struct typeState {
   color: vec3<f32>,
   state: f32,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(1) worldPos: vec3f,
  @location(2) albedo: vec4f,
  @location(3) normal: vec3f ,
  @location(4)  @interpolate(flat) id: u32,
}


@binding(0) @group(0) var<uniform> constantUnifroms: ConstantUnifroms;
@binding(0) @group(1) var<storage,read> instanceUniforms : array<Uniforms>;
@binding(0) @group(2) var<uniform> instanceIndexOffset: vec4f;
@binding(0) @group(3) var<storage,read> meshUniforms : array<MeshData>;
@binding(1) @group(3) var<storage,read> typeStates : array<typeState>;
@group(0) @binding(1) var<storage, read> instnacesBoundboxes: array<Boundbox>; 

//Lmao use the global invocation id as we do in the compute pass to index and remove the instanceIndexOffsetBuffer!!!
@vertex 
fn vertex_main(@location(0) position: vec3f, @location(1) normal: vec3f, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
    let instanceUniforms = instanceUniforms[instanceIndex + u32(instanceIndexOffset.x)];
    let meshData = meshUniforms[instanceUniforms.id];
    let instanceBoundBox = instnacesBoundboxes[instanceIndex + u32(instanceIndexOffset.x)];
    let instanceTypeState = typeStates[meshData.typeId];
    var output: VertexOutput;
    var mvpMatrix = constantUnifroms.projectionMatrix * constantUnifroms.viewMatrix * instanceUniforms.modelMatrix;
    output.position = mvpMatrix * vec4f(position, 1.0) ;
    output.worldPos = (instanceUniforms.modelMatrix * vec4f(position, 1.0)).xyz;
    output.normal = normalize(instanceUniforms.modelMatrix * vec4(normal, 0.0)).xyz;
    output.albedo = vec4(instanceUniforms.color, 1.0);
    output.id = meshData.meshId;
    if instanceTypeState.state == 1. {
        output.albedo = vec4(instanceTypeState.color, 1.0);
    }

    if instanceUniforms.id != 69 {
       // output.position = vec4f(0., 0., 0., 0.0);
    }
    return output;
}

struct FragmentOutput {
    @location(0) worldPos: vec4<f32>,
    @location(1) worldNormal: vec4<f32>,
    @location(2) albedo: vec4<f32>,
    @location(3) objectID: vec4<u32>,
}

@fragment
fn fragment_main(input: VertexOutput) -> FragmentOutput {

    var output: FragmentOutput;
    output.worldPos = vec4f(input.worldPos, 1.0);
    output.worldNormal = vec4(input.normal, 1.0);
    output.albedo = input.albedo;
    output.objectID = vec4(input.id);

    return output;
}


