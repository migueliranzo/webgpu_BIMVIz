@vertex 
fn vertex_main(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4f {
    let vertexArray = array<vec2<f32>, 3>(
        vec2(-1, 3),
        vec2(3, -1),
        vec2(-1, -1),
    );
    return vec4f(vertexArray[vertexIndex], 0.0, 1.0);
}

@group(0) @binding(0) var highlightTexture: texture_2d<f32>;
@group(0) @binding(1) var normalTexture: texture_2d<f32>;
@group(0) @binding(2) var albedoTexture: texture_2d<f32>;
@group(0) @binding(3) var idTexture: texture_2d<u32>;

@fragment
fn fragment_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let textCoord = position.xy / vec2<f32>(textureDimensions(highlightTexture));
    let highlightValue = textureLoad(highlightTexture, vec2<i32>(textCoord * vec2<f32>(textureDimensions(highlightTexture))), 0).xyzw;
    let normalTexture = normalize(textureLoad(normalTexture, vec2<i32>(textCoord * vec2<f32>(textureDimensions(normalTexture))), 0).xyz);//keep an eye on this normalization
    let albedoTexture = textureLoad(albedoTexture, vec2<i32>(textCoord * vec2<f32>(textureDimensions(albedoTexture))), 0).xyzw;
    let idTexture = textureLoad(idTexture, vec2<i32>(textCoord * vec2<f32>(textureDimensions(idTexture))), 0).x;

    var outputcolor = albedoTexture;

    var highlight = vec4f(0.);
    //if hoverStates[idTexture] > 0. {
    //    highlight = vec3f(1.0);
   // }

//    if selectedID[0] == f32(idTexture) && selectedID[0] != 0 {
 //       highlight = vec4f(vec3f(1.0), 0.);
 //   }

    if highlightValue.w != 0 {
 //       outputcolor = vec4f(1., 0., 1.0, .7);
        outputcolor = highlightValue;
    }

    return vec4f(outputcolor + highlight);
}
