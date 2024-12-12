struct VertexOut {
  @builtin(position) position: vec4f,
  @location(1) worldPos: vec3f,
  @location(2) fragCoord: vec2f,
}


struct Uniforms{
  mvpMatrix : mat4x4f,
}

@group(0) @binding(3) var<uniform> uniforms: Uniforms;

@vertex 
fn vertex_main(@location(0) position: vec3f, @location(1) normal: vec3f, @location(2) uv: vec2f) -> VertexOut{

  var output : VertexOut;
  output.fragCoord = (uniforms.mvpMatrix * vec4f(position,1.0)).xy;
  output.position =  uniforms.mvpMatrix   * vec4f(position, 1.0);
  return output;
}

@group(0) @binding(0) var  positionTexture: texture_2d<f32>;
@group(0) @binding(1) var albedoTexture: texture_2d<f32>;
@group(0) @binding(2) var normalTexture : texture_2d<f32>;
@group(0) @binding(4) var<storage> hoverStates: array<f32>;

@fragment
fn fragment_main(input: VertexOut) -> @location(0)vec4f{
  let fragCoord = input.position.xy;
  let texCoord = fragCoord / vec2<f32>(textureDimensions(positionTexture));
  let normal = normalize(textureLoad(normalTexture, vec2<i32 >(texCoord * vec2<f32 >(textureDimensions(normalTexture))), 0).xyz);
  let albedo = textureLoad(albedoTexture, vec2<i32 >(texCoord * vec2<f32 >(textureDimensions(albedoTexture))), 0).rgb;
  let position = textureLoad(positionTexture, vec2<i32 >(texCoord * vec2<f32 >(textureDimensions(positionTexture))), 0).xyz;
  let test = hoverStates[2];
  //return vec4f(texCoord, 0.,1.0);
  return vec4f(normal + vec3(test),1.0);
}
