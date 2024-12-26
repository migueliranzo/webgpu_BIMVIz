import { IfcAPI, Color, ms, IFCUNITASSIGNMENT } from 'web-ifc';
import { parsedIfcObject } from './worker';


const ifcAPI = new IfcAPI();
ifcAPI.SetWasmPath("../node_modules/web-ifc/");
await ifcAPI.Init();

//Worker test
const myWorker = new Worker(new URL("worker.ts", import.meta.url), { type: 'module' });


export function createIfcModelHandler(inputFile: Uint8Array) {
  let FILE = inputFile;

  const parseIfcFileWithWorker = function() {
    myWorker.postMessage({ msg: 'parseFile', file: FILE });

    const getGeometry = async function() {
      return await new Promise((resolve) => {
        myWorker.onmessage = (x) => {
          if (x.data.msg == 'geometryReady') {
            resolve(x.data.parsedIfcObj)
          }
        }
      })
    }

    const getDataAttributes = async function() {
      return await new Promise((resolve) => {
        myWorker.onmessage = (x) => {
          if (x.data.msg == 'itemPropertiesReady') {
            resolve(x.data.itemProperties)
          }
        }
      })
    }

    //I want to revisit if I truly need to return the whole clousure or not, like returning just the functions
    return (() => {
      return {
        getGeometry,
        getDataAttributes
      }
    })
  }


  const parseIfcFile = function() {
    let parsedIfcObj: parsedIfcObject = { geometries: [], vertSize: 0, indSize: 0 };
    const start = ms();
    const modelID = ifcAPI.OpenModel(FILE, { COORDINATE_TO_ORIGIN: true });
    const time = ms() - start;
    console.log(`Opening model took ${time} ms`);

    if (ifcAPI.GetModelSchema(modelID) == 'IFC2X3' ||
      ifcAPI.GetModelSchema(modelID) == 'IFC4' ||
      ifcAPI.GetModelSchema(modelID) == 'IFC4X3_RC4') {

      ifcAPI.StreamAllMeshes(modelID, (mesh, index, total) => {
        const numGeoms = mesh.geometries.size();
        const processedGeoms = [];
        //mesh.geometries isnt iterable and handles pointers to wasm
        for (let i = 0; i < numGeoms; i++) {
          let placedGeom = mesh.geometries.get(i);
          processedGeoms.push({
            color: placedGeom.color,
            flatTransform: placedGeom.flatTransformation,
            geometry: ifcAPI.GetGeometry(modelID, placedGeom.geometryExpressID),
          });
        }

        processedGeoms.reduce((_acc: parsedIfcObject, _curr) => {
          const vertexArray = ifcAPI.GetVertexArray(
            _curr.geometry.GetVertexData(),
            _curr.geometry.GetVertexDataSize()
          );
          const indexArray = ifcAPI.GetIndexArray(
            _curr.geometry.GetIndexData(),
            _curr.geometry.GetIndexDataSize()
          )
          _acc.geometries.push({
            lookUpId: mesh.expressID,
            color: _curr.color,
            flatTransform: _curr.flatTransform,
            vertexArray,
            indexArray
          })
          _acc.vertSize += vertexArray.byteLength;
          _acc.indSize += indexArray.byteLength;
          return _acc;
        }, parsedIfcObj);

        //still not working
        //mesh.delete()
      });

      let holder = [];
      parsedIfcObj.geometries.forEach(async (x) => {
        holder.push(await ifcAPI.properties.getItemProperties(modelID, x.lookUpId, true));
      })
      console.log(holder);

    }
    ifcAPI.CloseModel(modelID);

    return parsedIfcObj;
  }

  const getDetailedProperties = async function(expressID: number) {
    const start = ms();
    const modelID = ifcAPI.OpenModel(FILE);
    const time = ms() - start;
    console.log(`Opening model took ${time} ms`);
    const props = await ifcAPI.properties.getPropertySets(modelID, expressID, true);
    const itemProp = await ifcAPI.properties.getItemProperties(modelID, expressID, true);
    ifcAPI.CloseModel(modelID);
    return { props, itemProp };
  }

  return (() => {
    return {
      parseIfcFile,
      getDetailedProperties,
      parseIfcFileWithWorker
    }
  })

}

