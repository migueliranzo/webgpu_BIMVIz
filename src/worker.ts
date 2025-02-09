import { IfcAPI, Color, ms, IFCUNITASSIGNMENT, IFCRELCONNECTSPORTTOELEMENT, IFCFLOWSEGMENT, IFCDISTRIBUTIONPORT, IFCRELCONNECTSPORTS, IFCCABLESEGMENTTYPE, IFCRELDEFINESBYTYPE, IFCPIPESEGMENTTYPE, IFCPIPEFITTINGTYPE, IFCDUCTSEGMENT, IFCDUCTSEGMENTTYPE, IFCENERGYCONVERSIONDEVICETYPE, IFCENERGYCONVERSIONDEVICE, IFCCABLESEGMENT, IFCFLOWMOVINGDEVICETYPE, IFCFLOWMOVINGDEVICE, IFCFLOWTERMINAL, IFCFLOWTERMINALTYPE } from 'web-ifc';
import { mat4, vec4 } from 'wgpu-matrix';

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
  const instanceExpressIds: number[] = [];

  console.log(`Opening model took ${time} ms`);


  if (ifcAPI.GetModelSchema(modelID) == 'IFC2X3' ||
    ifcAPI.GetModelSchema(modelID) == 'IFC4' ||
    ifcAPI.GetModelSchema(modelID) == 'IFC4X3_RC4') {

    ifcAPI.StreamAllMeshes(modelID, (mesh, index, total) => {
      const numGeoms = mesh.geometries.size();
      const processedGeoms = [];
      instanceExpressIds.push(mesh.expressID);

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
      lookUpId++;
    });

    postMessage({ msg: 'geometryReady', instanceMap, meshCount: instanceExpressIds.length });


    //Construct itemProperties array by chunks
    const CHUNK_SIZE = 50;
    let itemPropertiesMap = new Map();
    for (let i = 0; i < instanceExpressIds.length; i += CHUNK_SIZE) {
      const chunk = instanceExpressIds.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map(async expressId => {
          const itemProperties = await ifcAPI.properties.getItemProperties(modelID, expressId, false);
          const propertySets = await ifcAPI.properties.getPropertySets(modelID, expressId, true);

          let processedPropertySets = propertySets.length ? {} : null;
          for (let i = 0; i < propertySets.length; i++) {
            const currentSet = propertySets[i];
            const properties = currentSet.HasProperties ? currentSet.HasProperties : currentSet.Quantities;

            const setName = currentSet.Name ? currentSet.Name.value : `Property set ${i}`;
            processedPropertySets[setName] = [];
            for (let e = 0; e < properties.length; e++) {
              const property = properties[e];
              const valKey = Object.keys(property).find((propKeyName) => propKeyName.toLowerCase().includes('value'));
              const propertyValue = property[valKey]?.value
              processedPropertySets[setName].push({ [property.Name.value]: propertyValue });
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

    const cableSegmentsTypesLineIds = ifcAPI.GetLineIDsWithType(modelID, IFCCABLESEGMENTTYPE)
    const pipeSegmentsTypesLineIds = ifcAPI.GetLineIDsWithType(modelID, IFCPIPESEGMENTTYPE)
    const pipeFittingTypesLineIds = ifcAPI.GetLineIDsWithType(modelID, IFCPIPEFITTINGTYPE)
    const energyConversionLineIds = ifcAPI.GetLineIDsWithType(modelID, IFCENERGYCONVERSIONDEVICE);
    const flowTerminalsLineIds = ifcAPI.GetLineIDsWithType(modelID, IFCFLOWTERMINAL);
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


    for (let flowTerminalLineId of flowTerminalsLineIds) {
      let flowTerminalLineObject = ifcAPI.GetLine(modelID, flowTerminalLineId);
      let pipeObjectPropertySets = await ifcAPI.properties.getPropertySets(modelID, flowTerminalLineObject.expressID);
      let itemPropertiesSet = pipeObjectPropertySets.find((propertySet) => propertySet.Name.value == 'PSet_Revit_Mechanical');
      itemPropertiesSet?.HasProperties.forEach((x) => {
        let revitVal = ifcAPI.GetLine(modelID, x.value);
        if (revitVal.Name.value == 'System Type') {
          meshTypeIdMap.set(flowTerminalLineObject.expressID, revitVal.NominalValue.value);
          return
        }
      })
    }

    for (let energyConversionTypesLineId of energyConversionLineIds) {
      let energyConversionTypesLineObject = ifcAPI.GetLine(modelID, energyConversionTypesLineId);
      let pipeObjectPropertySets = await ifcAPI.properties.getPropertySets(modelID, energyConversionTypesLineObject.expressID);
      let itemPropertiesSet = pipeObjectPropertySets.find((propertySet) => propertySet.Name.value == 'PSet_Revit_Mechanical');
      itemPropertiesSet.HasProperties.forEach((x) => {
        let revitVal = ifcAPI.GetLine(modelID, x.value);
        if (revitVal.Name.value == 'System Type') {
          meshTypeIdMap.set(energyConversionTypesLineObject.expressID, revitVal.NominalValue.value);
          return
        }
      })
    }

    for (let cableSegmentTypeLineId of cableSegmentsTypesLineIds) {
      let cableObject = ifcAPI.GetLine(modelID, cableSegmentTypeLineId);
      electricalSegmentsLineObjects.push(cableObject.expressID)
    }


    for (let defineByTypeLineId of defineByTypeLineIds) {
      const defineByTypeLineObject = ifcAPI.GetLine(modelID, defineByTypeLineId);
      const relatingTypeId = defineByTypeLineObject.RelatingType.value;

      if (electricalSegmentsLineObjects.includes(relatingTypeId)) {
        for (let object of defineByTypeLineObject.RelatedObjects) {
          let pipeObject = ifcAPI.GetLine(modelID, object.value);
          meshTypeIdMap.set(pipeObject.expressID, 'Electrical');
          if (!typesIdStateMap.has('Electrical')) {
            typesIdStateMap.set('Electrical', { typeId: typesIdStateMap.size, stringType: 'Electrical', state: 0, color: getMepHighlightColor(typesIdStateMap.size) })
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
              meshTypeIdMap.set(pipeObject.expressID, revitVal.NominalValue.value);
              if (!typesIdStateMap.has(revitVal.NominalValue.value)) {
                typesIdStateMap.set(revitVal.NominalValue.value, { typeId: typesIdStateMap.size, stringType: revitVal.NominalValue.value, state: 0, color: getMepHighlightColor(typesIdStateMap.size) })
              }
              return
            }
          })
        }
      }

      //Test remove
      meshTypeIdMap.set(647, 'Electrical');
      meshTypeIdMap.set(646, 'Electrical');
    }

    //Model tree structure
    const mapTree = (treeNode) => {
      return {
        type: treeNode.type,
        name: treeNode.Name ? treeNode.Name.value : 'noname',
        expressId: treeNode.expressID,
        children: treeNode.children.map((child) => mapTree(child))
      }
    }

    const modelTreeStructure = [mapTree(await ifcAPI.properties.getSpatialStructure(modelID, true))];
    const generalProperties = { instanceExpressIds, meshTypeIdMap, typesIdStateMap, modelTreeStructure };
    postMessage({ msg: 'generalPropertiesReady', generalProperties });
  } else {
    console.error("Error loading model, aborting")
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

function getMepHighlightColor(index) {
  const colors = [[1, 0, 1], [0, 1, 1], [1, 0, 0], [0, 0, 1], [0, 1, 0], [1, 1, 0]];

  if (index < colors.length) {
    return colors[index];
  }

  return colors[index % colors.length];
}
