import { IfcAPI, Color, ms, IFCUNITASSIGNMENT, IFCRELCONNECTSPORTTOELEMENT, IFCFLOWSEGMENT, IFCDISTRIBUTIONPORT, IFCRELCONNECTSPORTS, IFCCABLESEGMENTTYPE, IFCRELDEFINESBYTYPE, IFCPIPESEGMENTTYPE, IFCPIPEFITTINGTYPE, IFCDUCTSEGMENT, IFCDUCTSEGMENTTYPE } from 'web-ifc';

export interface parsedIfcObject {
  geometries: parsedGeometryData[],
  vertSize: number,
  indSize: number
}

export interface parsedGeometryData {
  lookUpId: number,
  meshExpressId: number,
  color: Color,
  flatTransform: number[],
  vertexArray: Float32Array,
  indexArray: Uint32Array,
}



onmessage = (x) => {
  if (x.data.msg == 'parseFile') {
    parseIfcFile(x.data.file)
  }
}


const parseIfcFile = async function(FILE: Uint8Array) {
  const ifcAPI = new IfcAPI();
  ifcAPI.SetWasmPath("../node_modules/web-ifc/");
  await ifcAPI.Init();
  const start = ms();
  const modelID = ifcAPI.OpenModel(FILE, { COORDINATE_TO_ORIGIN: false });
  const time = ms() - start;
  let lookUpId = 0;
  const instanceMap = new Map();
  const meshIdInstancesIdMap = new Map();
  const instanceExpressIds: number[] = [];

  console.log(`Opening model took ${time} ms`);


  if (ifcAPI.GetModelSchema(modelID) == 'IFC2X3' ||
    ifcAPI.GetModelSchema(modelID) == 'IFC4' ||
    ifcAPI.GetModelSchema(modelID) == 'IFC4X3_RC4') {

    ifcAPI.StreamAllMeshes(modelID, (mesh, index, total) => {
      const numGeoms = mesh.geometries.size();
      const processedGeoms = [];
      instanceExpressIds.push(mesh.expressID);
      //meshIdInstancesIdMap.set(lookUpId, { expressId: mesh.expressID })

      for (let i = 0; i < numGeoms; i++) {
        let placedGeom = mesh.geometries.get(i);
        processedGeoms.push({
          color: placedGeom.color,
          flatTransform: placedGeom.flatTransformation,
          geometry: ifcAPI.GetGeometry(modelID, placedGeom.geometryExpressID),
        });
      }

      processedGeoms.forEach((processedGeometry) => {
        const vertexArray = ifcAPI.GetVertexArray(
          processedGeometry.geometry.GetVertexData(),
          processedGeometry.geometry.GetVertexDataSize()
        );
        const indexArray = ifcAPI.GetIndexArray(
          processedGeometry.geometry.GetIndexData(),
          processedGeometry.geometry.GetIndexDataSize()
        )

        const geometryKey = generateGeometryHash(vertexArray);

        let group = processedGeometry.color.w != 1 ? 'transparentInstances' : 'instances';
        if (!instanceMap.has(geometryKey)) {
          instanceMap.set(geometryKey, {
            baseGeometry: {
              vertexArray,
              indexArray
            },
            [group]: []
          })
        }
        instanceMap.get(geometryKey)[group]?.push({
          meshExpressId: mesh.expressID,
          lookUpId: lookUpId,
          color: processedGeometry.color,
          flatTransform: processedGeometry.flatTransform,
        });
      })
      //still not working
      //mesh.delete()
      lookUpId++;
    });

    console.log(instanceMap)
    postMessage({ msg: 'geometryReady', instanceMap, meshCount: instanceExpressIds.length });


    //Construct itemProperties array by chunks
    const CHUNK_SIZE = 50;
    let itemPropertiesMap = new Map();
    for (let i = 0; i < instanceExpressIds.length; i += CHUNK_SIZE) {
      const chunk = instanceExpressIds.slice(i, i + CHUNK_SIZE);
      const chunkResults = await Promise.all(
        chunk.map(async expressId => {
          const itemProperties = await ifcAPI.properties.getItemProperties(modelID, expressId, false);
          const propertySets = await ifcAPI.properties.getPropertySets(modelID, expressId, true);

          let processedPropertySets = {};
          if (propertySets.length == 0) return
          for (let i = 0; i < propertySets.length; i++) {
            processedPropertySets[propertySets[i].Name.value] = [];
            for (let e = 0; e < propertySets[i].HasProperties.length; e++) {
              processedPropertySets[propertySets[i].Name.value].push({ [propertySets[i].HasProperties[e].Name.value]: propertySets[i].HasProperties[e].NominalValue.value });
            }
          }
          itemPropertiesMap.set(expressId, { processedPropertySets, itemProperties })
        })
      );
      console.log((i + chunk.length) / instanceExpressIds.length);
    }


    //Size of the itemsProperties 457728 - 0.4MB
    //Size of the propertySet Map 25675117 - 25MB
    //Size of processed propertySet 2822555 - 2.8MB

    let typesList = ifcAPI.GetAllTypesOfModel(modelID);
    console.log(itemPropertiesMap)
    postMessage({ msg: 'itemPropertiesReady', itemPropertiesMap, typesList });

    //Pipe grouping -- Make grouping function probably
    const cableSegmentsTypesLineIds = ifcAPI.GetLineIDsWithType(modelID, IFCCABLESEGMENTTYPE)
    const pipeSegmentsTypesLineIds = ifcAPI.GetLineIDsWithType(modelID, IFCPIPESEGMENTTYPE)
    const pipeFittingTypesLineIds = ifcAPI.GetLineIDsWithType(modelID, IFCPIPEFITTINGTYPE)
    const defineByTypeLineIds = ifcAPI.GetLineIDsWithType(modelID, IFCRELDEFINESBYTYPE);
    const pipeSegmentsLineObjects = [];
    const electricalSegmentsLineObjects = [];
    const meshTypeIdMap = new Map();
    const typesIdStateMap = new Map();

    for (let pipeSegmentTypeLineId of pipeSegmentsTypesLineIds) {
      let pipeSegmentTypeLineObject = ifcAPI.GetLine(modelID, pipeSegmentTypeLineId);
      pipeSegmentsLineObjects.push(pipeSegmentTypeLineObject.expressID)
    }

    //Pipe fittings going into the same as pipes for now -> Update: Hard to color them if we go by revit string...
    for (let pipeFittingTypesLineId of pipeFittingTypesLineIds) {
      let pipeSegmentTypeLineObject = ifcAPI.GetLine(modelID, pipeFittingTypesLineId);
      pipeSegmentsLineObjects.push(pipeSegmentTypeLineObject.expressID)
    }

    for (let cableSegmentTypeLineId of cableSegmentsTypesLineIds) {
      let cableObject = ifcAPI.GetLine(modelID, cableSegmentTypeLineId);
      electricalSegmentsLineObjects.push(cableObject.expressID)
    }

    //const revitTypes = new Map();
    //revitTypes.set("Electrical", { objects: [] })
    const revitTypesInversed = new Map();
    const pipeTypeColor = [[.9, .9, 0.], [.9, 0, 0], [0.5, 0.5, 0.5], [0.5, 0.5, 0.2], [0., 0., .9], [.9, 0., .9], [0.3, 1.0, 0.1]]

    for (let defineByTypeLineId of defineByTypeLineIds) {
      let defineByTypeLineObject = ifcAPI.GetLine(modelID, defineByTypeLineId);
      let relatingTypeId = defineByTypeLineObject.RelatingType.value;
      if (electricalSegmentsLineObjects.includes(relatingTypeId)) {
        for (let object of defineByTypeLineObject.RelatedObjects) {
          let pipeObject = ifcAPI.GetLine(modelID, object.value);
          revitTypesInversed.set(pipeObject.expressID, 'Electrical');
          meshTypeIdMap.set(pipeObject.expressID, 'Electrical');
          if (!typesIdStateMap.has('Electrical')) {
            typesIdStateMap.set('Electrical', { typeId: typesIdStateMap.size, stringType: 'Electrical', state: 0, color: pipeTypeColor[typesIdStateMap.size] })
          }
        }
      }

      if (pipeSegmentsLineObjects.includes(relatingTypeId)) {
        for (let object of defineByTypeLineObject.RelatedObjects) {
          let pipeObject = ifcAPI.GetLine(modelID, object.value);
          let pipeObjectPropertySets = await ifcAPI.properties.getPropertySets(modelID, object.value);
          let itemPropertiesSet = pipeObjectPropertySets.find((propertySet) => propertySet.Name.value == 'PSet_Revit_Mechanical');
          itemPropertiesSet.HasProperties.forEach((x) => {
            let revitVal = ifcAPI.GetLine(modelID, x.value);
            if (revitVal.Name.value == 'System Type') {
              revitTypesInversed.set(pipeObject.expressID, revitVal.NominalValue.value);
              meshTypeIdMap.set(pipeObject.expressID, revitVal.NominalValue.value);
              if (!typesIdStateMap.has(revitVal.NominalValue.value)) {
                typesIdStateMap.set(revitVal.NominalValue.value, { typeId: typesIdStateMap.size, stringType: revitVal.NominalValue.value, state: 0, color: pipeTypeColor[typesIdStateMap.size] })
              }
              return
            }
          })
        }
      }
    }

    //Model tree structure
    const mapTree = (treeNode) => {
      return {
        name: treeNode.type,
        expressId: treeNode.expressID,
        children: treeNode.children.map((child) => mapTree(child))
      }
    }

    const modelTreeStructure = mapTree(await ifcAPI.properties.getSpatialStructure(modelID, true));

    //Just adding everything here for now, surely it wont become a problem later -> it did.
    const generalProperties = { revitTypesInversed, instanceExpressIds, meshTypeIdMap, typesIdStateMap, modelTreeStructure };
    postMessage({ msg: 'generalPropertiesReady', generalProperties });
  }

  ifcAPI.CloseModel(modelID);
}

function generateGeometryHash(vertexArray: Float32Array) {
  //We try to align our aproach to cache by blocks to make it cheaper for the CPU while mantaining uniqueness 
  const BLOCK_SIZE = 32;
  let hash = 0;

  for (let blockStart = 0; blockStart < vertexArray.length - BLOCK_SIZE; blockStart += BLOCK_SIZE) {
    let blockHash = 0;
    //The idea is to sequentially process the data by blocks to make it cpu-predictable
    for (let i = 0; i < BLOCK_SIZE; i++) {
      blockHash = (blockHash + vertexArray[blockStart + i] * 31) >>> 0;
    }
    hash = (hash * 37 + blockHash) >>> 0;
  }

  //if array length is not divisible by BLOCK_SIZE we get the remaining vertex values
  const remainingStart = Math.floor(vertexArray.length / BLOCK_SIZE) * BLOCK_SIZE;
  for (let i = remainingStart; i < vertexArray.length; i++) {
    hash = (hash * 31 + vertexArray[i]) >>> 0;
  }

  return hash;
}
