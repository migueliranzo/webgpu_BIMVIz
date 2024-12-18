import { OrbitCamera } from "./deps/camera";

export function createActionsHandler(selectedIdCallbacks: { setSelectedId: (id: number) => void, getSelectedId: () => number }) {
  const viewModes = ['setFrontView', 'setRightView', 'setTopView', 'setLeftView', 'setBackView', 'setBottomView'];
  const viewBtn = {
    clickCount: 0,
  }

  const createLeftActions = function(camera: OrbitCamera) {
    document.getElementById('changeViewBtn')!.addEventListener(('click'), (e) => {
      camera[viewModes[viewBtn.clickCount++ % viewModes.length]]();
    })
  }

  const updateSelectedId = function(id: number) {
    selectedIdCallbacks.setSelectedId(id);
  };
  const getSelectedId = function() {
    return selectedIdCallbacks.getSelectedId();
  }

  return (() => {
    return {
      viewBtnState: viewBtn,
      updateSelectedId,
      getSelectedId,
      createLeftActions
    };
  })
}


