import { createActionsHandler } from './actions.ts';
import { renderer } from './renderer.ts'
import { IfcAPI, ms, IFCUNITASSIGNMENT } from 'web-ifc';
import { createDataViewModel, createItemspropertyarrayhandle } from './data_viewModel.ts';
import { createIfcModelHandler } from './ifcLoader.ts';
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
  const fileBuffer = await fetch('ifc/NBU_Duplex/NBU_Duplex-Apt_Eng-MEP.ifc').then((fileResponse) => fileResponse.arrayBuffer());
  let fileUint8Buffer = new Uint8Array(fileBuffer);
  const start = ms();
  console.log("🖌️", ms() - start);
  const ifcModelHandler = createIfcModelHandler(fileUint8Buffer);
  const parseIfcFileWithWorkerHandle = ifcModelHandler().parseIfcFileWithWorker();
  console.log(await parseIfcFileWithWorkerHandle.getGeometry)
  const { loadedModelData, meshCount } = await parseIfcFileWithWorkerHandle.getGeometry;
  console.log(loadedModelData)
  console.log(meshCount)

  const actionHandler = createActionsHandler();
  renderer(device, canvas, loadedModelData, actionHandler, meshCount);

  const generalProperties = await parseIfcFileWithWorkerHandle.getGeneralProperties;
  console.log(generalProperties)
  const viewModelHandler = createDataViewModel(generalProperties);
  createModelServiceHandle(generalProperties);

  const loadedItems = await parseIfcFileWithWorkerHandle.getDataAttributes;
  console.log(loadedItems)
  const itemspropertyarrayhandle = createItemspropertyarrayhandle(loadedItems);

  console.log(itemspropertyarrayhandle.getItemProperties(72375))
  viewModelHandler.updateRightSidePropsSync(itemspropertyarrayhandle.getItemProperties(72375))
  console.log("🛝", ms() - start);

  actionHandler.onChange((value: number) => {
    viewModelHandler.updateRightSidePropsSync(itemspropertyarrayhandle.getItemProperties(value));
  })
}

init();

