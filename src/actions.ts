import { OrbitCamera } from "./deps/camera";

export function createActionsHandler(camera: OrbitCamera) {
  const viewModes = ['setFrontView', 'setRightView', 'setTopView', 'setLeftView', 'setBackView', 'setBottomView'];
  const viewBtn = {
    clickCount: 0,
  }

  document.getElementById('changeViewBtn')!.addEventListener(('click'), (e) => {
    camera[viewModes[viewBtn.clickCount++ % viewModes.length]]();
  })

  return (() => {
    return {
      viewBtnState: viewBtn,
    };
  })
}


