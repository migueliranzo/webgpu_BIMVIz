struct Boundbox {
min: vec4f, 
max: vec4f,
} 

struct Vertex {
@location(0) position: vec3f, 
@location(1) normal: vec3f,
}

@group(0) @binding(0) var<storage, read_write> instnacesBoundboxes: array<Boundbox>;
@group(0) @binding(1) var<storage, read> vertexBuffer: array<Vertex>;
@group(0) @binding(2) var<storage, read> indexBuffer: array<u32>;


//aaaa the workgroup size is key in compute shaders
@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let geometryIndex = global_id.x;
    // Compute and store bounds for each unique geometry
    let instanceIndex = global_id.x;
    
    // Initialize bounding box with extreme values
    // We use vec4f to match our Boundbox structure, setting w to 1.0
    var boundingBox: Boundbox;
    boundingBox.min = vec4f(88888888888888888.0, 88888888888888888.0, 88888888888888888, 1.0);
    boundingBox.max = vec4f(-88888888888888888.0, -88888888888888888.0, -88888888888888888.0, 1.0);
    
    // Let's say each instance has these values (you'll need to provide these)
    let startIndex = instanceIndex * 3u;  // Assuming triangles, 3 indices per triangle
    let indexCount = 3u;  // For now, just process one triangle per instance
    
    // Process each vertex of this instance's geometry
    for (var i = 0u; i < indexCount; i = i + 1u) {
        // Get the vertex index from the index buffer
        let vertexIndex = indexBuffer[startIndex + i];
        
        // Get the vertex position
        let vertexPos = vertexBuffer[vertexIndex].position;
        
        // Update min and max for each dimension
        boundingBox.min.x = min(boundingBox.min.x, vertexPos.x);
        boundingBox.min.y = min(boundingBox.min.y, vertexPos.y);
        boundingBox.min.z = min(boundingBox.min.z, vertexPos.z);

        boundingBox.max.x = max(boundingBox.max.x, vertexPos.x);
        boundingBox.max.y = max(boundingBox.max.y, vertexPos.y);
        boundingBox.max.z = max(boundingBox.max.z, vertexPos.z);
    }
    //boundingBox.min.x = f32(global_id.x);
    // Store the computed bounding box for this instance
    instnacesBoundboxes[instanceIndex] = boundingBox;
}
