let meshInstanceMap: Map<any, any>;
let meshGroupsResolve;

const meshGroupsPromise = new Promise(resolve => {
  meshGroupsResolve = resolve;
})

export function createModelServiceHandle(generalProperties: { typesList: [], pipeGroups: Map<any, any>, revitTypesInversed: Map<any, any>, meshIdInstancesIdMap: Map<any, any>, meshTypeIdMap: Map<any, any>, typesIdStateMap: Map<any, any> }) {
  meshGroupsResolve({
    meshLookUpIdsList: generalProperties.instanceExpressIds,
    meshTypeIdMap: generalProperties.meshTypeIdMap,
    typesIdStateMap: generalProperties.typesIdStateMap,
  });
}

export function getMeshGroupsHandler() {
  return {
    getMeshGroups: () => {
      return meshGroupsPromise;
    }
  }
};
