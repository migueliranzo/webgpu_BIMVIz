@vertex 
fn vertex_main(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4f{
    let vertexArray = array<vec2<f32>, 3>(
      vec2(-1,3),
      vec2(3,-1),
      vec2(-1,-1),
  );    
  return vec4f(vertexArray[vertexIndex],0.0 ,1.0);
}

@group(0) @binding(0) var positionTexture: texture_2d<f32>;
@group(0) @binding(1) var normalTexture: texture_2d<f32>;
@group(0) @binding(2) var albedoTexture: texture_2d<f32>;
//We will need to add depth texture

@fragment
fn fragment_main(@builtin(position) position:vec4<f32>) -> @location(0) vec4<f32>{
  let textCoord = position.xy / vec2<f32>(textureDimensions(positionTexture));
  let positionTexture =  textureLoad(positionTexture, vec2<i32>(textCoord * vec2<f32>(textureDimensions(positionTexture) )),0).xyz;
  let normalTexture =  normalize(textureLoad(normalTexture, vec2<i32>(textCoord * vec2<f32>(textureDimensions(normalTexture) )),0).xyz);
  let albedoTexture =  textureLoad(albedoTexture, vec2<i32>(textCoord * vec2<f32>(textureDimensions(albedoTexture) )),0).xyz;

  return vec4f(albedoTexture,1.0);
}
