@group(0) @binding(0) var<storage, read_write> hoverStates: array<f32>;
@group(0) @binding(1) var<uniform> mouseCoords: vec2<f32>;
@group(0) @binding(2) var objectIdTexture: texture_2d<u32>;


@compute @workgroup_size(1)
fn main() {
 let normalizedMouseCoords = mouseCoords /  vec2<f32>(textureDimensions(objectIdTexture));

  let objectID = textureLoad(objectIdTexture, vec2<i32 >(normalizedMouseCoords * vec2<f32 >(textureDimensions(objectIdTexture))), 0).r;

  if(f32(objectID) != hoverStates[9]){
    hoverStates[i32(hoverStates[9])] = 0.;
  hoverStates[9] = f32(objectID);
  }

  if(f32(objectID) > 0.){
   hoverStates[objectID] = 1.0; //f32(objectID); 
    }
}
