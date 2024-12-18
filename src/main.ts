import { createActionsHandler } from './actions.ts';
import { renderer } from './renderer.ts'
import { IfcAPI, ms, IFCUNITASSIGNMENT } from 'web-ifc';
import { createDataViewModel } from './data_viewModel.ts';
import { createIfcModelHandler } from './ifcLoader.ts';

async function init() {
  if (!navigator.gpu) {
    throw Error("webGPU not supported");
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw Error("Couldn't request webGPU adapter");
  }

  //Just like we check if there is an adapter we should check if the worker API exists in the browser
  //if (window.Worker) { }

  const device = await adapter.requestDevice();

  const fileBuffer = await fetch('/20220421MODEL REV01.ifc').then((fileResponse) => fileResponse.arrayBuffer());
  let fileUint8Buffer = new Uint8Array(fileBuffer);
  const start = ms();
  const ifcModelHandler = createIfcModelHandler(fileUint8Buffer);
  //const loadedModelData = ifcModelHandler().parseIfcFile(); //2902
  const parseIfcFileWithWorkerHandle = ifcModelHandler().parseIfcFileWithWorker()();
  const loadedModelData = await parseIfcFileWithWorkerHandle.getGeometry(); //255

  const viewModelHandler = createDataViewModel({
    getDetailedProperties: (id: number) => ifcModelHandler().getDetailedProperties(id),
  });

  const actionHandler = createActionsHandler({
    getSelectedId: () => viewModelHandler().getSelectedId(),
    setSelectedId: (id: number) => viewModelHandler().setSelectedId(id)
  });

  const loadedItems = parseIfcFileWithWorkerHandle.getDataAttributes().then((x) => {
    viewModelHandler().setItemPropertiesArray(x);
    console.log("🛝", ms() - start);
  });

  console.log("🖌️", ms() - start);
  renderer(device, loadedModelData, actionHandler);
}

init();
