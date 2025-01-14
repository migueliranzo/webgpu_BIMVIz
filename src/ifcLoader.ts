import { IfcAPI, Color, ms, IFCUNITASSIGNMENT } from 'web-ifc';
import { parsedIfcObject } from './worker';


//const ifcAPI = new IfcAPI();
//ifcAPI.SetWasmPath("../node_modules/web-ifc/");
//await ifcAPI.Init();

const myWorker = new Worker(new URL("worker.ts", import.meta.url), { type: 'module' });

export function createIfcModelHandler(inputFile: Uint8Array) {
  let FILE = inputFile;

  const parseIfcFileWithWorker = function() {
    myWorker.postMessage({ msg: 'parseFile', file: FILE });
    let geoResolve;
    let itemPropertiesResolve;
    let generalPropertiesResolve;

    const geoPromise = new Promise(resolve => {
      geoResolve = resolve;
    })

    const itemPropertiesPromise = new Promise(resolve => {
      itemPropertiesResolve = resolve;
    })

    const generalPropertiesPromise = new Promise(resolve => {
      generalPropertiesResolve = resolve;
    })

    myWorker.onmessage = (x) => {
      switch (x.data.msg) {

        case 'geometryReady': {
          geoResolve({ loadedModelData: x.data.instanceMap, meshCount: x.data.meshCount });
          break;
        }
        case 'generalPropertiesReady': {
          generalPropertiesResolve(x.data.generalProperties)
          break;
        }
        case 'itemPropertiesReady': {
          itemPropertiesResolve(x.data.itemPropertiesMap)
          //myWorker.terminate(); TODO: uncomment when testing stops
          //myWorker.onmessage = null;TODO: uncomment when testing stops
          break;
        }
      }

    }

    return {
      getGeometry: geoPromise,
      getDataAttributes: itemPropertiesPromise,
      getGeneralProperties: generalPropertiesPromise
    }
  }


  //TODO: since we parse basic properties a method for more advanced ones wouldnt be weird
  const getDetailedProperties = async function(expressID: number) {
    return;
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
      getDetailedProperties,
      parseIfcFileWithWorker
    }
  })

}

