import { createActionsHandler } from './actions.ts';
import { renderer } from './renderer.ts'
import { IfcAPI, ms, IFCUNITASSIGNMENT } from 'web-ifc';
import { createDataViewModel, createItemspropertyarrayhandle } from './data_viewModel.ts';
import { createFileHandler } from './ifcLoader.ts';
import { createModelServiceHandle } from './testHandler.ts';


async function init() {
  if (!navigator.gpu) {
    throw Error("webGPU not supported");
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw Error("Couldn't request webGPU adapter");
  }

  const device = await adapter.requestDevice();
  const canvas = document.getElementById('canvas_main_render_target') as HTMLCanvasElement;
  canvas.width = document.body.clientWidth;
  canvas.height = document.body.clientHeight;

  //20220421MODEL REV01
  //Water and plumbing -> NBU_Duplex-Apt_Eng-HVAC.ifc
  //Heating and electricity -> NBU_Duplex-Apt_Eng-MEP.ifc
  //Arquitecture -> NBU_Duplex-Apt_Arch.ifc
  //NBU_MedicalClinic/NBU_MedicalClinic_Eng-MEP-Optimized.ifc
  //NBU_MedicalClinic/NBU_MedicalClinic_Eng-HVAC.ifc
  //NBU_MedicalClinic/NBU_MedicalClinic_Arch-Optimized.ifc
  //NBU_MedicalClinic/NBU_MedicalClinic_Eng-ELE.ifc
  const fileBuffer = await fetch('ifc/NBU_Duplex/NBU_Duplex-Apt_Eng-MEP.ifc').then((fileResponse) => fileResponse.arrayBuffer());
  const fileBufferArch = await fetch('ifc/NBU_Duplex/NBU_Duplex-Apt_Arch.ifc').then((fileResponse) => fileResponse.arrayBuffer());
  const fileUint8Buffer = new Uint8Array(fileBuffer);
  const fileUint8BufferArch = new Uint8Array(fileBufferArch);
  const filesToParse = [fileUint8Buffer, fileUint8BufferArch];

  const start = ms();

  const modelInstancesPromises = [];
  const modelPropertiesPromises = [];
  const modelItemsPropertiesPromises = [];

  for (let fileBuffer of filesToParse) {
    const fileHandler = createFileHandler(fileBuffer)().parseIfcFileWithWorker;
    modelInstancesPromises.push(fileHandler().geoPromise)
    modelItemsPropertiesPromises.push(fileHandler().itemPropertiesPromise)
    modelPropertiesPromises.push(fileHandler().generalPropertiesPromise)
  }

  const meshLookUpIdOffsets = [0]
  const modelInstances = await Promise.all(modelInstancesPromises);
  console.log(modelInstances)
  const { parsedModelInstancesMap, parsedModelMeshCount } = modelInstances.reduce((merged, obj) => {
    meshLookUpIdOffsets.push(merged.parsedModelMeshCount)
    const parsedModelInstancesMap = new Map([...merged.parsedModelInstancesMap, ...obj.parsedModelInstancesMap]);
    const parsedModelMeshCount = merged.parsedModelMeshCount + obj.parsedModelMeshCount;
    merged = { parsedModelInstancesMap, parsedModelMeshCount };
    return merged;
  });
  console.log(meshLookUpIdOffsets)
  const actionHandler = createActionsHandler();

  console.log("🖌️", ms() - start);
  renderer(device, canvas, parsedModelInstancesMap, actionHandler, parsedModelMeshCount, meshLookUpIdOffsets);

  const modelGeneralProperties = await Promise.all(modelPropertiesPromises)
  const mergedModelGeneralProperties = modelGeneralProperties.reduce((merged, obj) => {
    Object.entries(obj).forEach(([key, value]) => {
      if (value instanceof Map) {
        merged[key] = merged[key] instanceof Map ? new Map([...merged[key], ...value]) : new Map(value);
      }
      else if (Array.isArray(value)) {
        merged[key] = merged[key] ? [...merged[key], ...value] : [...value];
      }
      else if (value.hasOwnProperty('children')) {
        merged[key] = !merged[key] ? [value] : Array.isArray(merged[key]) ? [...merged[key], value] : [merged[key], value];
      }
      else {
        merged[key] = value;
      }
    });
    return merged;
  })

  const modelItemsProperties = await Promise.all(modelItemsPropertiesPromises)
  const { itemPropertiesMap, typesList } = modelItemsProperties.reduce((merged, obj) => {
    Object.entries(obj).forEach(([key, value]) => {
      if (value instanceof Map) {
        merged[key] = merged[key] instanceof Map ? new Map([...merged[key], ...value]) : new Map(value);
      }
      else if (Array.isArray(value)) {
        merged[key] = merged[key] ? [...merged[key], ...value] : [...value];
      }
      else {
        merged[key] = value;
      }
    });
    return merged;
  },)

  const viewModelHandler = createDataViewModel(typesList);
  createModelServiceHandle(mergedModelGeneralProperties);

  const itemspropertyarrayhandle = createItemspropertyarrayhandle(itemPropertiesMap);

  console.log(itemspropertyarrayhandle.getItemProperties(5598))
  viewModelHandler.updateRightSidePropsSync(itemspropertyarrayhandle.getItemProperties(5598))
  console.log("🛝", ms() - start);

  actionHandler.onChange((value: number) => {
    viewModelHandler.updateRightSidePropsSync(itemspropertyarrayhandle.getItemProperties(value));
  })
}

init();

