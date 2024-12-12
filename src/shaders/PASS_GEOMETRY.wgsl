struct VertexOut {
  @builtin(position) position: vec4f,
  @location(1) worldPos: vec3f,
  @location(2) albedo: vec4f,
  @location(3) normal: vec3f 
}

struct Uniforms{
  mvpMatrix : mat4x4f,
  modelMatrix: mat4x4f,
  color: vec3f,
  id: u32
}

@binding(0) @group(0) var<uniform> uniforms: Uniforms;

@vertex 
fn vertex_main(@location(0) position: vec3f, @location(1) normal: vec3f, @location(2) uv: vec2f) -> VertexOut{

  var output : VertexOut;
  output.position = uniforms.mvpMatrix * vec4f(position, 1.0);
  output.worldPos = (uniforms.modelMatrix *  vec4f(position, 1.0)).xyz;
  output.normal = normalize(uniforms.modelMatrix * vec4(normal,0.0)).xyz;
  output.albedo = vec4(uniforms.color ,1.0);

  return output;
}

struct FragmentOutput {
    @location(0) worldPos : vec4 < f32>,
    @location(1) worldNormal : vec4 < f32>,
    @location(2) albedo : vec4 < f32>,
    @location(3) objectID: vec4 < u32>,
}

@fragment
fn fragment_main(input: VertexOut) -> FragmentOutput{
 var output: FragmentOutput;
  output.worldPos = vec4f(input.worldPos, 1.0); 
  output.worldNormal = vec4(input.normal, 1.0);
  output.albedo = input.albedo;
  output.objectID = vec4(uniforms.id);
 return output;
}
