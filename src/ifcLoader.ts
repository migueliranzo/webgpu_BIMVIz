export function createFileHandler(FILE) {
  const myWorker = new Worker(new URL("worker.ts", import.meta.url), { type: 'module' });
  const fileSize = FILE.length;
  myWorker.postMessage({ msg: 'parseFile', file: FILE });

  let geoResolve;
  let itemPropertiesResolve;
  let generalPropertiesResolve;
  let resolveCount = 0;

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
        resolveCount++;
        geoResolve({ parsedModelInstancesMap: x.data.instanceMap, parsedModelMeshCount: x.data.meshCount });
        break;
      }
      case 'generalPropertiesReady': {
        resolveCount++;
        generalPropertiesResolve(x.data.generalProperties)
        break;
      }
      case 'itemPropertiesReady': {
        resolveCount++;
        itemPropertiesResolve({ itemPropertiesMap: x.data.itemPropertiesMap, typesList: x.data.typesList })
        break;
      }
    }

    if (resolveCount == 3) {
      myWorker.terminate();
      myWorker.onmessage = null;
    }
  }

  return (() => {
    return {
      parseIfcFileWithWorker: () => ({
        geoPromise,
        itemPropertiesPromise,
        generalPropertiesPromise
      }),
      fileSize: () => fileSize
    }
  })
}

