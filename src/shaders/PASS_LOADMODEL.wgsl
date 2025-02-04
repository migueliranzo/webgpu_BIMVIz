//Different by instance same each pass
struct Uniforms {
  modelMatrix: mat4x4f,
  color: vec4f,
  id: u32,
  padding: mat2x4f
}

//Same by instance different each pass
struct ConstantUnifroms {
  viewMatrix: mat4x4f, 
  projectionMatrix: mat4x4f, 
}

struct MeshData {
  meshId: u32,
  typeId: u32,
  treeVisibilityToggle: u32,
  treeVisibilityHover: u32
}

struct typeState {
   color: vec3<f32>,
   state: f32,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(1) hightlight: vec4f,
  @location(2) albedo: vec4f,
  @location(3) normal: vec3f ,
  @location(4)  @interpolate(flat) id: u32,
}


@binding(0) @group(0) var<uniform> constantUnifroms: ConstantUnifroms;
@binding(0) @group(1) var<storage,read> instanceUniforms : array<Uniforms>;
@binding(0) @group(2) var<uniform> instanceIndexOffset: vec4<u32>;
@binding(0) @group(3) var<storage,read> meshUniforms : array<MeshData>;
@binding(1) @group(3) var<storage,read> typeStates : array<typeState>;
@binding(2) @group(3) var<storage, read> selectedID: array<f32>;

@vertex 
fn vertex_main(@location(0) position: vec3f, @location(1) normal: vec3f, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
    let instanceUniforms = instanceUniforms[instanceIndex + instanceIndexOffset.x];
    let meshData = meshUniforms[instanceUniforms.id];
    let instanceTypeState = typeStates[meshData.typeId];
    var output: VertexOutput;
    var mvpMatrix = constantUnifroms.projectionMatrix * constantUnifroms.viewMatrix * instanceUniforms.modelMatrix;
    output.position = mvpMatrix * vec4f(position, 1.0);
 //   output.hightlight = (instanceUniforms.modelMatrix * vec4f(position, 1.0)).xyz;
    output.normal = normalize(instanceUniforms.modelMatrix * vec4(normal, 0.0)).xyz;
    output.albedo = vec4(instanceUniforms.color);
    output.id = meshData.meshId;

    if dot(output.albedo, output.albedo) == 4.0 {

        output.albedo = vec4f(0.7, 0.7, 0.7, 1.);
    }


  //Visibility
    if meshData.treeVisibilityToggle == 0 {
        output.position = vec4f(0., 0., 0., 0.);
    }

  //Three hover
    if meshData.treeVisibilityHover == 0 {
//       output.hightlight = vec4(0.0, 1., 0., 0.5);
        output.albedo = vec4(0.0, 1., 0., 0.5);
    }

  //Type 
    if instanceTypeState.state == 1.0 {
 //       output.hightlight = vec4(instanceTypeState.color, 1.0);
        output.hightlight = vec4(1., 0.0, 1.0, .75);
    } else {
        output.hightlight = vec4(.0, 0.0, .0, .0);
    }

  //Object Hover
    if selectedID[2] == f32(meshData.meshId) {
        output.albedo = output.albedo + vec4(.0, 0., .15, .0);
    }

  //Clicked
    if selectedID[0] == f32(meshData.meshId) {
    //TODO blend/mix with default albedo to create a more softer and highlated effect, same way select color of btns are 75% their default color so it gives that selected effect :>
        output.albedo = output.albedo + vec4(.0, 0., .5, .0);
    }


    return output;
}

struct FragmentOutput {
    @location(0) hightlight: vec4<f32>,
    @location(1) worldNormal: vec4<f32>,
    @location(2) albedo: vec4<f32>,
    @location(3) objectID: vec4<u32>,
    @location(4) hoverHightlight: vec4<f32>,
}

@fragment
fn fragment_main(input: VertexOutput) -> FragmentOutput {

    var output: FragmentOutput;
    output.hightlight = input.hightlight;
    output.worldNormal = vec4(input.normal, 1.0);
    output.albedo = input.albedo;
    output.objectID = vec4(input.id);

    return output;
}


