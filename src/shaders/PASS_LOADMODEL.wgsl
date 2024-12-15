struct Uniforms {
  mvpMatrix: mat4x4<f32>, 
  color: vec4f
}

@binding(0) @group(0) var<uniform> uniforms : Uniforms;

@vertex 
fn vertex_main(@location(0) position: vec3f, @location(1) normal: vec3f) -> @builtin(position) vec4f {
    return uniforms.mvpMatrix * vec4<f32>(position, 1.0);
}

@fragment
fn fragment_main(@builtin(position) position: vec4f) -> @location(0) vec4f {

    return uniforms.color;
}


