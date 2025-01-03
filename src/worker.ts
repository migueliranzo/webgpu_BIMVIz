import { IfcAPI, Color, ms, IFCUNITASSIGNMENT } from 'web-ifc';

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

  let parsedIfcObj: parsedIfcObject = { geometries: [], vertSize: 0, indSize: 0 };
  const start = ms();
  const modelID = ifcAPI.OpenModel(FILE, { COORDINATE_TO_ORIGIN: true });
  const time = ms() - start;
  let lookUpId = 0;
  const instanceMap = new Map();

  console.log(`Opening model took ${time} ms`);

  if (ifcAPI.GetModelSchema(modelID) == 'IFC2X3' ||
    ifcAPI.GetModelSchema(modelID) == 'IFC4' ||
    ifcAPI.GetModelSchema(modelID) == 'IFC4X3_RC4') {

    ifcAPI.StreamAllMeshes(modelID, (mesh, index, total) => {
      const numGeoms = mesh.geometries.size();
      const processedGeoms = [];
      for (let i = 0; i < numGeoms; i++) {
        lookUpId++;
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
          meshExpressId: mesh.expressID,
          lookUpId: lookUpId,
          color: _curr.color,
          flatTransform: _curr.flatTransform,
          vertexArray,
          indexArray
        })
        _acc.vertSize += vertexArray.byteLength;
        _acc.indSize += indexArray.byteLength;

        let geometryKey = (vertexArray.byteLength * 31 + vertexArray[0] * 37 + vertexArray[vertexArray.length - 1] * 41) | 0;

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
          color: _curr.color,
          flatTransform: _curr.flatTransform,
        });

        return _acc;
      }, parsedIfcObj);


      //still not working
      //mesh.delete()
    });

    console.log(parsedIfcObj)
    //postMessage({ msg: 'geometryReady', parsedIfcObj });
    postMessage({ msg: 'geometryReady', instanceMap });

    const CHUNK_SIZE = 50;
    const itemProperties = [];


    //Revisit the setup here because with lookupId instead of meshExpressID goes better so maybe now promises can be waited better than now
    for (let i = 0; i < parsedIfcObj.geometries.length; i += CHUNK_SIZE) {
      const chunk = parsedIfcObj.geometries.slice(i, i + CHUNK_SIZE);
      const chunkResults = await Promise.all(
        chunk.map(async curr => {
          const [itemProperties] = await Promise.all([
            //ifcAPI.properties.getPropertySets(modelID, curr.meshExpressId, true),
            ifcAPI.properties.getItemProperties(modelID, curr.meshExpressId, false)
          ]);
          return { itemProperties };
        })
      );


      itemProperties.push(...chunkResults);
      console.log((i + chunk.length) / parsedIfcObj.geometries.length)
    }

    postMessage({
      msg: 'itemPropertiesReady',
      itemProperties
    });
    itemProperties;
  }

  ifcAPI.CloseModel(modelID);
}
