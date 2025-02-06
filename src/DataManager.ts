const ALIGNED_SIZE = 256;

export function processInstanceGroups(shortedInstanceGroups: Map<any, any>, meshLookUpIdOffsets: number[], modelAttributes: { verCount: number, indCount: number, instancesCount: number, instanceGroupsCount: number }) {
  let _offsetGeo = 0;
  let _offsetIndex = 0;
  let _offsetIndexBytes = 0;
  let _offsetGeoBytes = 0;
  let testI = 0;
  let instanceI = 0;
  let instanceGroupI = 0;
  let firstInstanceOffset = 0;

  const vertexDataArray = new Float32Array(modelAttributes.verCount / 4);
  const drawCommandsDataArray = new Uint32Array(modelAttributes.instanceGroupsCount * 5);
  const indexDataArray = new Uint32Array(modelAttributes.indCount / 4);
  const instanceUniformsOffsetsDataArray = new Uint32Array((modelAttributes.instanceGroupsCount * ALIGNED_SIZE) / 4);
  const instanceDataArray = new ArrayBuffer(modelAttributes.instancesCount * (16 * 4 + 3 * 4 + 1 * 4 + 12 * 4));
  let instanceDataArrayFloatView = new Float32Array(instanceDataArray);
  let instanceDataArrayUintView = new Uint32Array(instanceDataArray);
  let meshLookUpIdOffsetIndex = 0;

  const drawCalls = new Map();


  const processInstanceGroupsRenameAndRefactorWeDontNeedThisFnNameAnymore = (instanceGroup, _i) => {
    drawCalls.set(_i, { offset: instanceGroupI });
    const instanceType = instanceGroup.instances ? 'instances' : 'transparentInstances';
    drawCommandsDataArray[testI] = instanceGroup.baseGeometry.indexArray.length; //Index count
    drawCommandsDataArray[testI + 1] = instanceGroup[instanceType].length; //Instance count
    drawCommandsDataArray[testI + 2] = _offsetIndex; //Index buffer offset was  _offsetIndex
    drawCommandsDataArray[testI + 3] = _offsetGeo//base vertex? was _offsetGeo
    drawCommandsDataArray[testI + 4] = 0;  //first instance? was firstInstanceOffset

    instanceUniformsOffsetsDataArray[instanceGroupI * (ALIGNED_SIZE / 4)] = firstInstanceOffset;
    vertexDataArray.set(instanceGroup.baseGeometry.vertexArray, _offsetGeoBytes / 4);
    indexDataArray.set(instanceGroup.baseGeometry.indexArray, _offsetIndexBytes / 4);
    firstInstanceOffset += instanceGroup[instanceType].length;

    instanceGroup[instanceType].forEach((instance: { color, flatTransform, lookUpId, meshExpressId }) => {
      let currOffset = ((16 * 4 + 3 * 4 + 1 * 4 + 12 * 4) / 4) * instanceI;
      instanceDataArrayFloatView.set(instance.flatTransform, currOffset);
      instanceDataArrayFloatView.set([instance.color.x, instance.color.y, instance.color.z, instance.color.w], currOffset + 16)
      instanceDataArrayUintView.set([(instance.lookUpId) + meshLookUpIdOffsets[meshLookUpIdOffsetIndex]], currOffset + 16 + 4);
      if (instance.lookUpId + 1 == meshLookUpIdOffsets[meshLookUpIdOffsetIndex + 1] && instanceI != 0) meshLookUpIdOffsetIndex += 1;
      instanceI++;
    })

    _offsetGeo += instanceGroup.baseGeometry.vertexArray.length / 6;
    _offsetIndexBytes += instanceGroup.baseGeometry.indexArray.byteLength;
    _offsetIndex += instanceGroup.baseGeometry.indexArray.length;
    _offsetGeoBytes += instanceGroup.baseGeometry.vertexArray.byteLength
    instanceGroupI++;
    testI += 5;
  }

  shortedInstanceGroups.forEach((instanceGroup, _i) => processInstanceGroupsRenameAndRefactorWeDontNeedThisFnNameAnymore(instanceGroup, _i));

  return {
    instanceUniformsOffsetsDataArray,
    instanceDataArray,
    drawCommandsDataArray,
    vertexDataArray,
    indexDataArray,
    drawCalls
  }
}
