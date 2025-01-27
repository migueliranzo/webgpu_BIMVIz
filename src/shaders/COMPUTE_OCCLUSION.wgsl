struct Boundbox {
min: vec4f, 
max: vec4f,
}

struct DrawCommandsBuffer {
  indexCount: u32,
    instanceCount: u32,
    firstIndex: u32,
    baseVertex: u32,
    firstInstance: u32,
}



struct DrawCommandsBufferTest {
  indexCount: f32,
    instanceCount: f32,
    firstIndex: f32,
    baseVertex: u32,
    firstInstance: u32,
}

//TODO: Probably will have to just send the multiplied one but for now just keep it here
struct Matrices {
 viewMatrix: mat4x4f,
  projectionMatrix: mat4x4f
}

struct InstanceUniforms {
  modelMatrix: mat4x4f,
  color: vec3f,
  id: u32,
  padding: mat3x3f
}

struct UniformOffsetBlock {
    offset: vec4f,
    padding1: mat3x4f,
    padding2: mat4x4f,
    padding3: mat4x4f,
    padding4: mat4x4f,
}

@group(0) @binding(0) var<storage, read_write> drawCommands: array<DrawCommandsBuffer>;
@group(0) @binding(1) var<storage, read> instnacesBoundboxes: array<Boundbox>; 
@group(1) @binding(0) var<uniform> matrices: Matrices;
@group(0) @binding(2) var hizTexture: texture_2d<f32>;
@group(0) @binding(3) var<storage, read_write> newCommands: array<DrawCommandsBufferTest>;
@group(0) @binding(4) var<storage, read_write> instanceUniforms: array<InstanceUniforms>;
@group(0) @binding(5) var<storage, read_write> instanceUniformsOffset: array<UniformOffsetBlock>;


//aaaa the workgroup size is key in compute shaders
@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {

    let instanceBox = instnacesBoundboxes[global_id.x];
    let instanceGroupDrawCommand = drawCommands[global_id.x];
    let instanceGroupUniformOffset = u32(instanceUniformsOffset[global_id.x].offset.x);
   // newCommands[global_id.x].indexCount = u32(instanceUniformsOffset[global_id.x].offset.x);

    let corners = array<vec4<f32>, 8>(
        vec4(instanceBox.min.x, instanceBox.min.y, instanceBox.min.z, 1.),
        vec4(instanceBox.max.x, instanceBox.min.y, instanceBox.min.z, 1.),
        vec4(instanceBox.min.x, instanceBox.max.y, instanceBox.min.z, 1.),
        vec4(instanceBox.max.x, instanceBox.max.y, instanceBox.min.z, 1.),
        vec4(instanceBox.min.x, instanceBox.min.y, instanceBox.max.z, 1.),
        vec4(instanceBox.max.x, instanceBox.min.y, instanceBox.max.z, 1.),
        vec4(instanceBox.min.x, instanceBox.max.y, instanceBox.max.z, 1.),
        vec4(instanceBox.max.x, instanceBox.max.y, instanceBox.max.z, 1.)
    );

    for (var e = 0u; e < instanceGroupDrawCommand.instanceCount; e = e + 1u) {
        let instanceUniform = instanceUniforms[u32(instanceUniformsOffset[global_id.x].offset.x) + e];
        let viewProj = matrices.projectionMatrix * matrices.viewMatrix * instanceUniform.modelMatrix;


        var projected = projectPoint(corners[0], viewProj);
        var minX = projected.x;
        var maxX = projected.x;
        var minY = projected.y;
        var maxY = projected.y;
        var minZ = projected.z;
        var maxZ = projected.z;

        var screenProjectedPoints = 0u;
        for (var i = 1u; i < 8u; i = i + 1u) {
            projected = projectPoint(corners[i], viewProj);
            if projected.x < 0.0 {
        continue;
            }
            minX = min(minX, projected.x);
            maxX = max(maxX, projected.x);
            minY = min(minY, projected.y);
            maxY = max(maxY, projected.y);
            minZ = min(minZ, projected.z);
            maxZ = max(maxZ, projected.z);
            screenProjectedPoints = screenProjectedPoints + 1u;
        }

        var isOccluded = true;

//Just so we can have access to them in after the if cases
        var boundsDepth: vec4f;
        var boundsDepthBtmLeft: vec4f;
        var boundsDepthBtmRight: vec4f ;
        var boundsDepthTopLeft: vec4f ;
        var boundsDepthTopRight: vec4f;
        var LOD: i32;
        var scaledTextureSize: vec2f;

        if screenProjectedPoints == 7 {
            //We have enough data to test for occlusion
            let textureSize = vec2<f32>(textureDimensions(hizTexture));
            let viewSizeX = (maxX - minX) * textureSize.x;
            let viewSizeY = (maxY - minY) * textureSize.y;
            LOD = min(i32(floor(log2(textureSize.x / max(viewSizeX, viewSizeY))) + 0.5), 4);  
            //LOD = 0;
            scaledTextureSize = vec2f(f32(u32(textureSize.x) >> u32(LOD)), f32(u32(textureSize.y) >> u32(LOD)));

            let centerUV = vec2<i32>(i32((minX + maxX) * 0.5 * scaledTextureSize.x), i32((minY + maxY) * 0.5 * scaledTextureSize.y));
            let bottomLeftUV = vec2<i32>(i32(((minX + ((maxX - minX) * 0.1)) * scaledTextureSize.x)), i32((maxY - ((maxY - minY) * 0.1)) * scaledTextureSize.y));
            let bottomRightUV = vec2<i32>(i32((maxX - ((maxX - minX) * 0.1)) * scaledTextureSize.x), i32((maxY - ((maxY - minY) * 0.1)) * scaledTextureSize.y));
            let topLeftUV = vec2<i32>(i32(((minX + ((maxX - minX) * 0.1)) * scaledTextureSize.x)), i32(((minY + ((maxX - minX) * 0.1)) * scaledTextureSize.y)));
            let topRightUV = vec2<i32>(i32(((maxX - ((maxX - minX) * 0.1)) * scaledTextureSize.x)), i32(((minY + ((maxX - minX) * 0.1)) * scaledTextureSize.y)));

            boundsDepth = textureLoad(hizTexture, centerUV, LOD);
            boundsDepthBtmLeft = textureLoad(hizTexture, bottomLeftUV, LOD);
            boundsDepthBtmRight = textureLoad(hizTexture, bottomRightUV, LOD);
            boundsDepthTopLeft = textureLoad(hizTexture, topLeftUV, LOD);
            boundsDepthTopRight = textureLoad(hizTexture, topRightUV, LOD);

            let testValue = minZ ;
            let th = .00;

            if (testValue - boundsDepth.x) < th {
           //Not occluded 
                isOccluded = false;
            } else if (testValue - boundsDepthBtmLeft.x) < th {
            //Not occluded

                isOccluded = false;
            } else if (testValue - boundsDepthBtmRight.x) < th {
            //Not occluded

                isOccluded = false;
            } else if (testValue - boundsDepthTopLeft.x) < th {
            //Not occluded

                isOccluded = false;
            } else if (testValue - boundsDepthTopRight.x) < th {
            //Not occluded

                isOccluded = false;
            } else {
            //Occluded

                isOccluded = true;
            }

            //Okay so now we occlude better and big objects should just go through BUT...
            //We still get some weird shit like there is this wall that for some reason gets detected as occluded so figure out why is that. 
            //This if bellow this text doesnt work unless we test for equality but that also doesnt fully fix things and also kills a bit of occlusion

            //But maybe we can say fuck it and just test all bounds for 0 meaning any object that doesnt bound exactly to the texture just gets discarded, but that doesnt fix
            //The fact that we still may not be occluding perfectly..... and maybe getting the HIz map up and running might fix some stuff but we need to properly cast the LOD 

            if boundsDepthBtmRight.x < 0.0 {
         // Object crosses screen boundary - consider it visible
                isOccluded = false;
            }
        } else if screenProjectedPoints > 0 && screenProjectedPoints < 7 {
            //Some points made it so probably the object is half visible, but we dont have enough data to asses it so mark as visible
            isOccluded = false;
        }

        if screenProjectedPoints == 0 {
            //Not 1 single point could be projected inside the screen space, object fully outside view frustrum
          //We shouldnt have to set it to true here in theory
        }



 //       newCommands[instanceGroupUniformOffset + e].indexCount = minX;
   //     newCommands[instanceGroupUniformOffset + e].instanceCount = maxX;
    //    newCommands[instanceGroupUniformOffset + e].baseVertex = screenProjectedPoints;
      //  newCommands[instanceGroupUniformOffset + e].firstIndex = maxY;
     //   newCommands[instanceGroupUniformOffset + e].firstInstance = u32(maxZ);

        //Max is the closest point to us, if max is more!? than the current projected depth it would mean that object is occluded

        //On depth the higher the value, no matter max or min..., the further it is. If the minZ!* is more than projectDepth, is occluded. 
       //The minZ would be the closest to use since is the one with less depth so less further

        //if minZ is greather  (further) than sampled depth then the object is behind something

        //There is some weird stuff since some objects that are far should be occluded....
        //Some objects get weird occlusion because their X and Y get scuffed

        if isOccluded {

           // instanceUniforms[instanceGroupUniformOffset + e].color = vec3f(maxX / 10, minX / 10, 1.);
            instanceUniforms[instanceGroupUniformOffset + e].color = vec3f(((minX + maxX) * 0.5 * 1024.) / 1000., ((minY + maxY) * 0.5 * 1024.) / 1000., boundsDepth.x);
  //          instanceUniforms[instanceGroupUniformOffset + e].color = vec3f(f32(screenProjectedPoints) / 10., boundsDepthBtmRight.x, boundsDepthBtmLeft.x);
           // instanceUniforms[instanceGroupUniformOffset + e].color = vec3f(scaledTextureSize.y, scaledTextureSize.x, boundsDepth.x);
           // instanceUniforms[instanceGroupUniformOffset + e].color = vec3f(maxX / 10, minX / 10, 1.);
          //  instanceUniforms[instanceGroupUniformOffset + e].color = vec3f(((minX + maxX) * 0.5 * textureSize.x) / 1000., ((minY + maxY) * 0.5 * textureSize.y) / 1000., boundsDepth.x);
   //         instanceUniforms[instanceGroupUniformOffset + e].color = vec3f(boundsDepth.x, 0., minZ);
           // instanceUniforms[instanceGroupUniformOffset + e].color = vec3f(minZ, boundsDepth.x, boundsDepthBtmLeft.x);
//            instanceUniforms[instanceGroupUniformOffset + e].color = vec3f(minZ, maxZ, 1.);
//            instanceUniforms[instanceGroupUniformOffset + e].color = vec3f(((minX + maxX) * 0.5 * textureSize.x) / 1000., ((minY + maxY) * 0.5 * textureSize.y) / 1000., boundsDepth.x);
   //         instanceUniforms[instanceGroupUniformOffset + e].color = vec3f(minZ, boundsDepthTopLeft.x, boundsDepthBtmLeft.x);
          //  instanceUniforms[instanceGroupUniformOffset + e].color = vec3f(((minX + maxX) * 0.5 * textureSize.x) / 1000., ((minY + maxY) * 0.5 * textureSize.y) / 1000., boundsDepth.x);
//            instanceUniforms[instanceGroupUniformOffset + e].color = vec3f(((minX + ((maxX - minX) * 0.1)) * textureSize.x) / 1000., ((minY + ((maxX - minX) * 0.1)) * textureSize.y) / 1000., boundsDepth.x); //Top left lol?
    //        instanceUniforms[instanceGroupUniformOffset + e].color = vec3f(((maxX - ((maxX - minX) * 0.1)) * textureSize.x) / 1000., ((minY + ((maxX - minX) * 0.1)) * textureSize.y) / 1000., boundsDepth.x); //Top right lel
  //          instanceUniforms[instanceGroupUniformOffset + e].color = vec3f(((minX + ((maxX - minX) * 0.1)) * textureSize.x) / 1000., ((maxY - ((maxY - minY) * 0.1)) * textureSize.y) / 1000., boundsDepth.x); //Bottom left lol?
      //      instanceUniforms[instanceGroupUniformOffset + e].color = vec3f(((maxX - ((maxX - minX) * 0.1)) * textureSize.x) / 1000., ((maxY - ((maxY - minY) * 0.1)) * textureSize.y) / 1000., boundsDepth.x); //Bottom right :)


    //        newCommands[u32(instanceUniformsOffset[global_id.x].x) + e].instanceCount = 22;
        } else {
            instanceUniforms[instanceGroupUniformOffset + e].color = vec3f(0., 1., 0.);

  //          instanceUniforms[instanceGroupUniformOffset + e].color = vec3f(scaledTextureSize.y, scaledTextureSize.x, boundsDepth.x);
           // instanceUniforms[instanceGroupUniformOffset + e].color = vec3f(minY / 10, f32(LOD), boundsDepth.x);
 //           instanceUniforms[instanceGroupUniformOffset + e].color = vec3f(0., minX / 1, maxX / 1);
          //  instanceUniforms[instanceGroupUniformOffset + e].color = vec3f(maxX / 10, minX / 10, 1.);
          //  instanceUniforms[instanceGroupUniformOffset + e].color = vec3f(maxX, minX, 0.);
//            instanceUniforms[instanceGroupUniformOffset + e].color = vec3f(((minX + maxX) * 0.5 * textureSize.x) / 1000., ((minY + maxY) * 0.5 * textureSize.y) / 1000., boundsDepth.x);

    ///        instanceUniforms[instanceGroupUniformOffset + e].color = vec3f(((minX + maxX) * 0.5 * textureSize.x) / 1000., ((minY + maxY) * 0.5 * textureSize.y) / 1000., boundsDepth.x);
  //          newCommands[u32(instanceUniformsOffset[global_id.x].x) + e].instanceCount = 11;
        }


       // instanceUniforms[instanceGroupUniformOffset + e].color = vec3f(1., 0., boundsDepth.x);
        if projected.y <= 0 {
          //  instanceUniforms[instanceGroupUniformOffset + e].color = vec3f(0., 1., 0.);

//            newCommands[u32(instanceUniformsOffset[global_id.x].x) + e].instanceCount = 69;
        }
    }
}

fn projectPoint(pos: vec4<f32>, viewProj: mat4x4<f32>) -> vec3<f32> {
    let clipSpace = viewProj * pos;
    let ndcSpace = clipSpace.xyz / clipSpace.w;
    // Convert from NDC [-1,1] to screen space [0,1]
    if clipSpace.w <= 0.0 {
        return vec3<f32>(-1.0); // or handle this case differently
    }
    return vec3<f32>(
        vec2(
            ndcSpace.x * 0.5 + 0.5,
            1.0 - (ndcSpace.y * 0.5 + 0.5) // Inverted Y
        ),
        ndcSpace.z
    );
}
 //       instanceUniforms[global_id.x].color = vec3f(maxZ, boundsDepth.x, 1.);
