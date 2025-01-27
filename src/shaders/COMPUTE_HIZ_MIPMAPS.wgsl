@group(0) @binding(0) var previousLevel: texture_2d<f32>;
@group(0) @binding(1) var currentLevel:texture_storage_2d<r32float,write>;
//@group(0) @binding(1) var currentLevel:texture_storage_2d<rgba16float,write>;

@compute @workgroup_size(8,8) 
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coords = vec2<i32>(global_id.xy);
    let prevCoords = coords * 2;

    let z00 = textureLoad(previousLevel, prevCoords + vec2<i32>(1, 1), 0).r;
    let z01 = textureLoad(previousLevel, prevCoords + vec2<i32>(1, 3), 0).r;
    let z10 = textureLoad(previousLevel, prevCoords + vec2<i32>(1, 1), 0).r;
    let z11 = textureLoad(previousLevel, prevCoords + vec2<i32>(3, 3), 0).r;

    let maxZ = max(max(z00, z01), max(z10, z11));

    textureStore(currentLevel, coords, vec4<f32>(maxZ, 0., 0., 0.));
}

//TODO: I am very curious in how does the same bindgroup allow for in a same compute shader file to bind to different textures
//how does the code know that this bindings down here correlate with the entry point bellow it? 
@group(0) @binding(0) var depthTexture: texture_depth_2d;
@group(0) @binding(1) var hizmipmapsTexture: texture_storage_2d<r32float, write>;
//@group(0) @binding(1) var hizmipmapsTexture: texture_storage_2d<rgba16float, write>;
@compute @workgroup_size(1)
fn convertDepthToHiZ(@builtin(global_invocation_id) id: vec3<u32>) {
    let depth = textureLoad(depthTexture, vec2<i32>(id.xy), 0);
//    let testValue = (depth - 0.8) / (1.0 - 0.8);
    textureStore(hizmipmapsTexture, vec2<i32>(id.xy), vec4(depth, 0., 0., .0)); //test value is enhanced for visiblity
}
