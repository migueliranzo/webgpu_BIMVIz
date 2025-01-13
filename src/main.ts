import { createActionsHandler } from './actions.ts';
import { renderer } from './renderer.ts'
import { IfcAPI, ms, IFCUNITASSIGNMENT } from 'web-ifc';
import { createDataViewModel, createItemspropertyarrayhandle } from './data_viewModel.ts';
import { createIfcModelHandler } from './ifcLoader.ts';


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
  const fileBuffer = await fetch('ifc/NBU_Duplex/NBU_Duplex-Apt_Eng-MEP.ifc').then((fileResponse) => fileResponse.arrayBuffer());
  let fileUint8Buffer = new Uint8Array(fileBuffer);
  const start = ms();
  const ifcModelHandler = createIfcModelHandler(fileUint8Buffer);
  const parseIfcFileWithWorkerHandle = ifcModelHandler().parseIfcFileWithWorker();
  const loadedModelData: Map<any, any> = await parseIfcFileWithWorkerHandle.getGeometry;
  console.log(loadedModelData)

  const generalProperties = await parseIfcFileWithWorkerHandle.getGeneralProperties;
  let transformedLoadModel = new Map<any, any>;
  loadedModelData.forEach((value, key) => {
    let y = value.instances.map((instance) => instance = { ...instance, pipeGroupId: generalProperties.pipeGroups.get(instance.meshExpressId) })
    transformedLoadModel.set(key, { baseGeometry: value.baseGeometry, instances: y })
  })

  console.log(transformedLoadModel);

  const viewModelHandler = createDataViewModel(generalProperties);
  const actionHandler = createActionsHandler();

  console.log("🖌️", ms() - start);
  renderer(device, canvas, transformedLoadModel, actionHandler, generalProperties.electricPipesIDs);

  const loadedItems = await parseIfcFileWithWorkerHandle.getDataAttributes;
  const itemspropertyarrayhandle = createItemspropertyarrayhandle(loadedItems);

  console.log(itemspropertyarrayhandle.getItemProperties(612))
  viewModelHandler.updateRightSidePropsSync(itemspropertyarrayhandle.getItemProperties(612))
  console.log("🛝", ms() - start);

  actionHandler.onChange((value: number) => {
    viewModelHandler.updateRightSidePropsSync(itemspropertyarrayhandle.getItemProperties(value));
  })
}

init();

