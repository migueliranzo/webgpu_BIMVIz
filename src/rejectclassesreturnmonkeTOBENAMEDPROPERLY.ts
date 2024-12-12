import { vec3 } from "wgpu-matrix"
import { getWorldMatrix } from "./math_utils"

//Not sure about getting this here 

type Transform = {
  scale: Float32Array,
  position: Float32Array,
  rotation: { x: number, y: number, z: number }, //TODO do properly whenever we want accurate rotation
  //parent?: Transform,
  //children: Transform[]
}

interface transformObject {
  setPosition: (x: number, y: number, z: number) => void;
  getModelMatrix: () => Float32Array,
  setRotation: (x: number, y: number, z: number) => void;
  setScale: (x: number, y: number, z: number) => void;
}

const getTransformObject = (): transformObject => {
  const transform = {
    scale: vec3.create(1, 1, 1),
    position: vec3.create(0, 0, 0),
    rotation: { x: 0, y: 0, z: 0 }
  }

  const getModelMatrix = () => {
    return getWorldMatrix(transform.scale, transform.rotation, transform.position);
  }

  const setPosition = (x: number, y: number, z: number) => {
    transform.position = vec3.create(x, y, z);
  }

  const setRotation = (x: number, y: number, z: number) => {
    transform.rotation = { x, y, z };
  }

  const setScale = (x: number, y: number, z: number) => {
    transform.scale = vec3.create(x, y, z);
  }

  return {
    getModelMatrix,
    setPosition,
    setRotation,
    setScale
  }
}

type AttributeDataFormat =
  | Float32Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint8ClampedArray
  | Uint16Array
  | Uint32Array;

interface Attribute {
  data: AttributeDataFormat,
  size: number,
  divisor?: number,
}

type geoAttribute = { [key: string]: Attribute };

interface Geometry {
  attributes: geoAttribute;
}

interface BufferGeometry {
  vertexBuffer: GPUBuffer,
  vertexData: Float32Array
}

//Dont really need such thing for now?
export const geometryUtils = {
  //createGeometry: (attributes: geoAttribute) => {
  //  return { attributes };
  //},
  createBufferGeometry: (geoVertexData: Float32Array, device: GPUDevice): BufferGeometry => {
    //Should we just write it here as well? do it for the funs
    const vertexBuffer = device.createBuffer({
      size: geoVertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(vertexBuffer, 0, geoVertexData);
    return {
      vertexBuffer: vertexBuffer,
      vertexData: geoVertexData,
    }
  }
}

//Not implemented yet
interface Material {
  color: Float32Array,
}

//interface Mesh {
//  geometry: Geometry,
//  material: Material,
//}

interface MeshBase {
  geometry: BufferGeometry
  material: Material
}

type Mesh = MeshBase & transformObject;

export const meshUtils = () => {
  const createMesh = (geometry: BufferGeometry, material: Material): Mesh => {
    const transform = getTransformObject();
    return {
      geometry,
      material,
      ...transform
    }
  }

  return {
    createMesh,
  }
}

//For now we arent mixing the pipeline to the manger as we want to do that properly,
//but the worflow should you create a pipeline through the manager and then add objects to it 
//so when the drawing comes you can set X pipeline and draw objects form X pipeline
//
//or even more 'advanced' to just call pipmanager.draw which will then do what we do on the 
//render loop but automatically since it has all the data it needs, the pipeline, its objects, and the 
//bind groups (TODO), but for now we only have 1 pipeline so lets just take it easy and not abstract too early
export const createPipelineManager = () => {
  let forwardObjects: Mesh[] = [];
  let deferredObjects: Mesh[] = [];

  const addForward = (mesh: Mesh) => {
    forwardObjects.push(mesh);
  }

  const addDeferred = (mesh: Mesh) => {
    deferredObjects.push(mesh);
  }

  const removeForward = (mesh: number) => {
    console.log("TODO")
  }

  const MAYBECREATEFORWARDPIPELINE = () => {
    let initialOffset = 0;
    let struct = [4, 4, 2]
    let format = 'float32x4';
    let format2 = 'float32x2';
    let att = struct.map((x, _id, arr) => {
      return {
        shaderLocation: _id,
        offset: struct.slice(0, _id).reduce(
          (acc, curr) => acc + curr,
          initialOffset),
        format: '????'
      }
    })
  }
  const getForward = () => forwardObjects;
  const getDeferred = () => deferredObjects;

  return {
    addForward,
    removeForward,
    getForward,
    addDeferred,
    getDeferred,
  }

}
