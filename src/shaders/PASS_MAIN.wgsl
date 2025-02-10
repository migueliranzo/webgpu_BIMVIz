@vertex 
fn vertex_main(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4f {
    let vertexArray = array<vec2<f32>, 3>(
        vec2(-1, 3),
        vec2(3, -1),
        vec2(-1, -1),
    );
    return vec4f(vertexArray[vertexIndex], 0.0, 1.0);
}


struct LightInfo {
    position: vec3<f32>,
    intensity: f32,
    color: vec3<f32>,
    ambient: f32,
}



@group(0) @binding(0) var highlightTexture: texture_2d<f32>;
@group(0) @binding(1) var normalTexture: texture_2d<f32>;
@group(0) @binding(2) var albedoTexture: texture_2d<f32>;
@group(0) @binding(3) var idTexture: texture_2d<u32>;

const NUM_LIGHTS: i32 = 4;
const LIGHT_POSITIONS: array<vec3<f32>, 4> = array(
    vec3(0.0, 2.0, 0.0),
    vec3(1.0, 0.0, 2.0),
    vec3(-2.0, 0.0, 0.0),
    vec3(-1.0, 1.0, -2.0)
);
const LIGHT_INTENSITIES: array<f32, 4> = array(
    0.40,
    0.30,
    0.10,
    0.20
);
const LIGHT_COLORS: array<vec3<f32>, 4> = array(
    vec3(1.0, 1.0, 1.0),
    vec3(1.0, 1.0, 1.0),
    vec3(1.0, 1.0, 1.0),
    vec3(1.0, 1.0, 1.0)
);
const LIGHT_AMBIENTS: array<f32, 4> = array(
    0.3,  //Up 
    0.1,  //Front
    0.1,  //Left
    0.1   //Back
);

@fragment
fn fragment_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let textCoord = position.xy / vec2<f32>(textureDimensions(highlightTexture));
    let highlightValue = textureLoad(highlightTexture, vec2<i32>(textCoord * vec2<f32>(textureDimensions(highlightTexture))), 0).xyzw;
    let normal = normalize(textureLoad(normalTexture, vec2<i32>(textCoord * vec2<f32>(textureDimensions(normalTexture))), 0).xyz);//keep an eye on this normalization
    let albedo = textureLoad(albedoTexture, vec2<i32>(textCoord * vec2<f32>(textureDimensions(albedoTexture))), 0).xyzw;
    let idTexture = textureLoad(idTexture, vec2<i32>(textCoord * vec2<f32>(textureDimensions(idTexture))), 0).x;

    var final_color = vec3(0.0);

    for (var i = 0; i < NUM_LIGHTS; i++) {
        let light_dir = normalize(LIGHT_POSITIONS[i]);
        let diff = pow(max(dot(normal, light_dir), 0.0), 0.7);
        let ambient = LIGHT_AMBIENTS[i] * albedo.xyz;
        let diffuse = diff * LIGHT_INTENSITIES[i] * LIGHT_COLORS[i] * albedo.xyz;
        final_color += ambient + diffuse;
    }

    let output_color = select(
        vec4f(final_color, albedo.w),
        highlightValue,
        highlightValue.w != 0
    );


    return output_color;
}
