import { renderer } from './renderer.ts'
import { IfcAPI, ms, IFCUNITASSIGNMENT } from 'web-ifc';

async function init() {


  if (!navigator.gpu) {
    throw Error("webGPU not supported");
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw Error("Couldn't request webGPU adapter");
  }

  const device = await adapter.requestDevice();



  //Fetching of BIM model
  const ifcAPI = new IfcAPI();
  ifcAPI.SetWasmPath("../node_modules/web-ifc/");
  await ifcAPI.Init();

  let fileResponse = await fetch('/20220421MODEL REV01.ifc');
  let fileArrayBuffer = await fileResponse.arrayBuffer();
  let uInt8FileArray = new Uint8Array(fileArrayBuffer);

  //We get geometry data!!!!!
  async function LoadModel(data: Uint8Array) {
    const modelMeshVert: any = { geometries: [], vertSize: 0, indSize: 0 };
    const start = ms();
    const modelID = ifcAPI.OpenModel(data, { COORDINATE_TO_ORIGIN: true });
    const time = ms() - start;
    console.log(`Opening model took ${time} ms`);

    if (ifcAPI.GetModelSchema(modelID) == 'IFC2X3' ||
      ifcAPI.GetModelSchema(modelID) == 'IFC4' ||
      ifcAPI.GetModelSchema(modelID) == 'IFC4X3_RC4') {

      //console.log("Trying StreamMeshes with FacetedBrep...");
      ifcAPI.StreamAllMeshes(modelID, (mesh, index, total) => {
        // Get the number of geometries this mesh has
        const numGeometries = mesh.geometries.size();
        //console.log(`Mesh ${index + 1}/${total} has ${numGeometries} geometries`);
        // Iterate using the .get() method
        for (let i = 0; i < numGeometries; i++) {
          const geom = mesh.geometries.get(i);
          const geometry = ifcAPI.GetGeometry(modelID, geom.geometryExpressID);

          let vertexArray = ifcAPI.GetVertexArray(
            geometry.GetVertexData(),
            geometry.GetVertexDataSize()
          )
          let indexArray = ifcAPI.GetIndexArray(
            geometry.GetIndexData(),
            geometry.GetIndexDataSize()
          )

          modelMeshVert.vertSize += vertexArray.byteLength;
          modelMeshVert.indSize += indexArray.byteLength;
          modelMeshVert.geometries.push({ color: geom.color, flatTransform: geom.flatTransformation, vertexArray, indexArray });

          //console.log(`Geometry ${i}:`, geom, vertexArray);

          geometry.delete();
        }
        // Don't forget to clean up
        //mesh.delete() NOT WORKING FOR SOME DEVLISH REASON
      });

    }
    ifcAPI.CloseModel(modelID);

    return modelMeshVert;
  }

  let loadedModelVer = await LoadModel(uInt8FileArray)
  renderer(device, loadedModelVer);
}

init();


