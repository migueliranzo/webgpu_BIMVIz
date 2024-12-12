import { renderer } from './renderer.ts'

async function init() {


  if (!navigator.gpu) {
    throw Error("webGPU not supported");
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw Error("Couldn't request webGPU adapter");
  }

  const device = await adapter.requestDevice();

  renderer(device);

}

init();


