const MESHTYPEUNDEFINED = 99;

let storedMeshData: { meshUniformsDataArray: Uint32Array };
let storedTypeData: { typesDataArray: Float32Array, typesBufferStrides: Map<any, any> };
const storedMultiTypeMeshes = new Map<any, any>;
let cachedResults = {
  typeIdInstanceGroupId: undefined,
  instanceExpressIds: undefined,
  meshTypeIdMap: undefined,
  typesIdStateMap: undefined
};

let createMeshDataResolve;
const createMeshDataPromise = new Promise<{ meshUniformsDataArray: Uint32Array }>(resolve => {
  createMeshDataResolve = resolve;
})

let createTypesDataResolve;
const createTypesDataPromise = new Promise<{ typesDataArray: Float32Array, typesBufferStrides: Map<any, any> }>(resolve => {
  createTypesDataResolve = resolve;
})

let createDataEventsResolve;
const createDataEventsPromise = new Promise(resolve => {
  createDataEventsResolve = resolve;
})

export function createModelServiceHandle({ instanceExpressIds, meshTypeIdMap, typesIdStateMap, modelTreeStructure, typeIdInstanceGroupId, dataEvents }) {
  cachedResults = {
    typeIdInstanceGroupId,
    instanceExpressIds,
    meshTypeIdMap,
    typesIdStateMap,
  }

  createTypesDataResolve(createTypesData(typesIdStateMap));
  createMeshDataResolve(createMeshData(instanceExpressIds, meshTypeIdMap, typesIdStateMap));
  createDataEventsResolve(dataEvents)
}

function createMeshData(instanceExpressIds: any, meshTypeIdMap, typesIdStateMap) {
  let meshLookUpIdsList = instanceExpressIds;
  const meshUniformsDataArray = new Uint32Array((4) * meshLookUpIdsList.length);

  for (let i = 0; i < meshLookUpIdsList.length; i++) {
    const offset = ((4 * 4) / 4) * i;
    const meshExpressId = meshLookUpIdsList[i];
    const meshTypesString = meshTypeIdMap.get(meshExpressId);
    let meshTypeId = MESHTYPEUNDEFINED;

    if (meshTypesString) {
      const meshTypesStrings = meshTypeIdMap.get(meshExpressId).split(',');
      if (meshTypesStrings.length > 1) {
        for (let typeString of meshTypesStrings) {
          storedMultiTypeMeshes.get(typeString)?.push(offset + 1);
        }
      }

      meshTypeId = typesIdStateMap.get(meshTypesStrings[0]).typeId;
    }

    meshUniformsDataArray[offset] = meshExpressId;
    meshUniformsDataArray[offset + 1] = meshTypeId;
    meshUniformsDataArray[offset + 2] = 1;
    meshUniformsDataArray[offset + 3] = 1;
  }

  const response = { meshUniformsDataArray }
  storedMeshData = response;
  return response;
}

function createTypesData(typesIdStateMap) {
  const typesBufferStrides = new Map<any, any>;
  const typesDataArray = new Float32Array(typesIdStateMap.size * 4); //uint State + vec3 color for now 

  let i = 0;
  typesIdStateMap.forEach((typeIdObject) => {
    storedMultiTypeMeshes.set(typeIdObject.stringType, []);
    const offset = (i * 4)
    typesDataArray.set([...typeIdObject.color], offset);
    typesDataArray.set([typeIdObject.state], offset + 3);
    typesBufferStrides.set(typeIdObject.typeId, { stride: offset * 4, stringType: typeIdObject.stringType })
    i++
  })

  const response = { typesDataArray, typesBufferStrides };
  storedTypeData = response;
  return response;
}


export function createMultitypeMeshesHandler() {
  let bufferWriteQueue = [];

  return (() => {
    const bufferWriteQueueState = {
      addToQueue: (wq) => bufferWriteQueue.push(wq),
      applyQueue: () => bufferWriteQueue.forEach((wq) => wq()),
      getQueueList: () => bufferWriteQueue,
      clearQueue: () => bufferWriteQueue = [],
    }
    return {
      bufferWriteQueueState
    };
  })
}

export function getMeshGroupsHandler() {
  return {
    getMeshUniformsData: () => {
      return createMeshDataPromise;
    },
    getTypeData: () => {
      return createTypesDataPromise
    },
    getDataEvents: () => {
      return createDataEventsPromise
    },
    getStoredMeshData: () => {
      return storedMeshData
    },
    getStoredTypeData: () => {
      return storedTypeData
    },
    getCachedResults: () => {
      return cachedResults;
    },

    storedMultiTypeMeshes,
  }
};
