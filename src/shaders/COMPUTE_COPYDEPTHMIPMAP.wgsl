
@group(0) @binding(0) var hizmipmapsTexture: texture_storage_2d<r32float, write>;
@compute @workgroup_size(1)
fn convertDepthToHiZ(@builtin(global_invocation_id) id: vec3<u32>) {
    let depth = textureLoad(depthTexture, vec2<i32>(id.xy), 0);
    //let testValue = (depth - 0.8) / (1.0 - 0.8);
    textureStore(hizmipmapsTexture, vec2<i32>(id.xy), vec4(depth, 0., 0., .0)); //test value is enhanced for visiblity
}
