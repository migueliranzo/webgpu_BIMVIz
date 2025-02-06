@group(0) @binding(0) var<storage, read_write> hoverStates: array<f32>;
@group(0) @binding(1) var<uniform> mouseCoords: vec4<f32>;
@group(0) @binding(2) var objectIdTexture: texture_2d<u32>;
@group(0) @binding(3) var<storage, read_write> selectedObject: vec4<f32>;


@compute @workgroup_size(1)
fn main() {
   //Calculate current hovered object based on mouse input 
    let normalizedMouseCoords = mouseCoords.xy / vec2<f32>(textureDimensions(objectIdTexture));
    let textureDims = vec2<f32>(textureDimensions(objectIdTexture));
    let pixelCoords = vec2<i32>(normalizedMouseCoords * textureDims);
    let hoveringObjectID = textureLoad(objectIdTexture, pixelCoords, 0).r;
    
    //Click states
    let lastClickCoord = mouseCoords.z;
    let prevClickCoord = mouseCoords.w;
    let hoveredID = f32(hoveringObjectID);
    let lastHoveredID = hoverStates[arrayLength(&hoverStates)];
    
    //Update hovered object Id only on change 
    let shouldUpdateHover = hoveredID != lastHoveredID;
    hoverStates[i32(lastHoveredID)] = select(
        hoverStates[i32(lastHoveredID)],
        0.0,
        shouldUpdateHover
    );

    hoverStates[arrayLength(&hoverStates)] = select(
        lastHoveredID,
        hoveredID,
        shouldUpdateHover
    );

    selectedObject.z = select(
        selectedObject.z,
        hoveredID,
        shouldUpdateHover
    );
    
    //Check if hover is valid
    let isValidObject = hoveredID > 0.0;
    hoverStates[hoveringObjectID] = select(
        hoverStates[hoveringObjectID],
        1.0,
        isValidObject
    );
    
    //Account for click selection/deselection
    let isNewClick = lastClickCoord != selectedObject.y;
    let isSameObject = hoveredID == selectedObject.x;

    let deselectedState = vec4<f32>(-1.0, lastClickCoord, 0.0, 1.0);
    let selectedState = vec4<f32>(hoveredID, lastClickCoord, 0.0, 1.0);
    
    //Update only if new click was detected 
    selectedObject = select(
        selectedObject,
        select(selectedState, deselectedState, isSameObject),
        isNewClick
    );
}

