import { IfcAPI, Color, ms, IFCUNITASSIGNMENT, IFCRELCONNECTSPORTTOELEMENT, IFCFLOWSEGMENT, IFCDISTRIBUTIONPORT, IFCRELCONNECTSPORTS } from 'web-ifc';

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
  const modelID = ifcAPI.OpenModel(FILE, { COORDINATE_TO_ORIGIN: true });
  const time = ms() - start;
  let lookUpId = 0;
  const instanceMap = new Map();
  const instanceExpressIds: number[] = [];

  console.log(`Opening model took ${time} ms`);

  if (ifcAPI.GetModelSchema(modelID) == 'IFC2X3' ||
    ifcAPI.GetModelSchema(modelID) == 'IFC4' ||
    ifcAPI.GetModelSchema(modelID) == 'IFC4X3_RC4') {

    let test = ifcAPI.GetLineIDsWithType(modelID, 987401354) //get all lines with type ifcFlowSegment 
    let pipe = ifcAPI.GetLine(modelID, test.get(29))
    console.log(test.get(29))
    console.log(pipe)

    let port = ifcAPI.GetLine(modelID, 986652);
    let port1 = ifcAPI.GetLine(modelID, 986651);
    console.log(port, port1)

    ifcAPI.StreamAllMeshes(modelID, (mesh, index, total) => {
      const numGeoms = mesh.geometries.size();
      const processedGeoms = [];
      lookUpId++;
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

        if (!instanceMap.has(geometryKey)) {
          instanceMap.set(geometryKey, {
            baseGeometry: {
              vertexArray,
              indexArray
            },
            instances: []
          })
        }

        instanceMap.get(geometryKey).instances.push({
          meshExpressId: mesh.expressID,
          lookUpId: lookUpId,
          color: processedGeometry.color,
          flatTransform: processedGeometry.flatTransform,
        });
      })
      //still not working
      //mesh.delete()
    });

    console.log(instanceMap)
    postMessage({ msg: 'geometryReady', instanceMap });

    const CHUNK_SIZE = 50;
    const itemProperties = [];
    for (let i = 0; i < instanceExpressIds.length; i += CHUNK_SIZE) {
      const chunk = instanceExpressIds.slice(i, i + CHUNK_SIZE);
      const chunkResults = await Promise.all(
        chunk.map(async curr => {
          //Goes faster with recursive false, but with recursive true or a big model/slow device the async worker aproach shines much more
          const [itemProperties] = await Promise.all([
            //ifcAPI.properties.getPropertySets(modelID, curr.meshExpressId, true),
            ifcAPI.properties.getItemProperties(modelID, curr, false),
          ]);
          return { itemProperties };
        })
      );

      itemProperties.push(...chunkResults);
      console.log((i + chunk.length) / instanceExpressIds.length)
    }


    console.log(itemProperties);
    postMessage({ msg: 'itemPropertiesReady', itemProperties });

    let typesList = ifcAPI.GetAllTypesOfModel(modelID);

    const pipeGroups = getWaterPipesGroups();

    const generalProperties = { typesList, grouping: pipeGroups };
    postMessage({ msg: 'generalPropertiesReady', generalProperties });

  }

  ifcAPI.CloseModel(modelID);

  //Grouping functions
  function getWaterPipesGroups() {
    const connectsPortToElementObjects = ifcAPI.GetLineIDsWithType(modelID, IFCRELCONNECTSPORTTOELEMENT);
    const connectsPortsObjects = ifcAPI.GetLineIDsWithType(modelID, IFCRELCONNECTSPORTS);

    const portToFlowSegment = new Map();
    // Fill it from IFCRELCONNECTSPORTTOELEMENT
    for (let test of connectsPortToElementObjects) {
      let rel = ifcAPI.GetLine(modelID, test);
      portToFlowSegment.set(rel.RelatingPort.value, rel.RelatedElement.value);
    };

    // Create a map for our disjoint set
    const parent = new Map();
    const rank = new Map();

    // Initialize each flow segment as its own set
    const allFlowSegments = new Set([...portToFlowSegment.values()]);
    allFlowSegments.forEach(flowSegment => {
      parent.set(flowSegment, flowSegment);
      rank.set(flowSegment, 0);
    });

    // Find with path compression
    function find(x) {
      if (parent.get(x) !== x) {
        parent.set(x, find(parent.get(x)));
      }
      return parent.get(x);
    }

    // Union by rank
    function union(x, y) {
      let rootX = find(x);
      let rootY = find(y);

      if (rootX !== rootY) {
        if (rank.get(rootX) < rank.get(rootY)) {
          [rootX, rootY] = [rootY, rootX];
        }
        parent.set(rootY, rootX);
        if (rank.get(rootX) === rank.get(rootY)) {
          rank.set(rootX, rank.get(rootX) + 1);
        }
      }
    }

    // Process IFCRELCONNECTSPORTS to union flow segments
    for (let test of connectsPortsObjects) {
      let connectsPortsObject = ifcAPI.GetLine(modelID, test);
      const flowSegment1 = portToFlowSegment.get(connectsPortsObject.RelatingPort.value);
      const flowSegment2 = portToFlowSegment.get(connectsPortsObject.RelatedPort.value);

      if (flowSegment1 && flowSegment2) {
        union(flowSegment1, flowSegment2);
      }
    };

    // Create final grouping
    const grouping = new Map();
    let groupId = 0;
    const groupIds = new Map();

    allFlowSegments.forEach(flowSegment => {
      const root = find(flowSegment);
      if (!groupIds.has(root)) {
        groupIds.set(root, groupId++);
      }
      grouping.set(flowSegment, groupIds.get(root));
    });

    // Now grouping maps each flow segment to its group ID
    console.log(grouping);

    return grouping;
  }
}

function generateGeometryHash(vertexArray: number[]) {
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
