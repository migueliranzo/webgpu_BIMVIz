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

  //Ifc2x3_Duplex_MEP
  //20220421MODEL REV01
  const fileBuffer = await fetch('ifc/NBU_Duplex/NBU_Duplex-Apt_Eng-HVAC.ifc').then((fileResponse) => fileResponse.arrayBuffer());
  let fileUint8Buffer = new Uint8Array(fileBuffer);
  const start = ms();
  const ifcModelHandler = createIfcModelHandler(fileUint8Buffer);
  const parseIfcFileWithWorkerHandle = ifcModelHandler().parseIfcFileWithWorker();
  const loadedModelData = await parseIfcFileWithWorkerHandle.getGeometry;
  console.log(loadedModelData)

  const viewModelHandler = createDataViewModel();
  const actionHandler = createActionsHandler();

  console.log("🖌️", ms() - start);
  renderer(device, canvas, loadedModelData, actionHandler);

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

