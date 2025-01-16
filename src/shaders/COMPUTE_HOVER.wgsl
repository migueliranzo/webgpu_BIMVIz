//TODO: The way the bindings are handled here is quite different than in the other shaders, take a closer look and compare with main gBufferPass
@group(0) @binding(0) var<storage, read_write> hoverStates: array<f32>;
@group(0) @binding(1) var<uniform> mouseCoords: vec4<f32>;
@group(0) @binding(2) var objectIdTexture: texture_2d<u32>;
@group(0) @binding(3) var<storage, read_write> selectedObject: vec4<f32>;


@compute @workgroup_size(1)
fn main() {
    let normalizedMouseCoords = mouseCoords.xy / vec2<f32>(textureDimensions(objectIdTexture));
    let hoveringObjectID = textureLoad(objectIdTexture, vec2<i32 >(normalizedMouseCoords * vec2<f32 >(textureDimensions(objectIdTexture))), 0).r;
    let lastClickCoord = mouseCoords.z;
    let prevClickCoord = mouseCoords.w;

    if f32(hoveringObjectID) != hoverStates[arrayLength(&hoverStates)] {
        hoverStates[i32(hoverStates[arrayLength(&hoverStates)])] = 0.;
        hoverStates[arrayLength(&hoverStates)] = f32(hoveringObjectID);
    }

    if f32(hoveringObjectID) > 0. {
        hoverStates[hoveringObjectID] = 1.0; //f32(objectID); 
    }
        //This would mean a new click has been registered
    if lastClickCoord != selectedObject.y {
            //if we are clicking on the same objectID we deselect
        if f32(hoveringObjectID) == selectedObject.x {
            selectedObject = vec4(f32(-1), lastClickCoord, 0, 1);
        } else {
            selectedObject = vec4(f32(hoveringObjectID), lastClickCoord, 0, 1);
        }
    }
}

