import { OrbitCamera } from "./deps/camera";

function createLocalEventEmitter() {
  // Using a DOM Event Target gives us a built-in event system
  const eventTarget = new EventTarget();

  return {
    emit(value) {
      // Create a new event with our value
      const event = new CustomEvent('change', { detail: value });
      eventTarget.dispatchEvent(event);
    },

    subscribe(callback) {
      const handler = (e) => callback(e.detail);
      eventTarget.addEventListener('change', handler);
      // Return unsubscribe function to clean up
      return () => eventTarget.removeEventListener('change', handler);
    }
  };
}

export function createActionsHandler() {
  const events = createLocalEventEmitter();
  const viewModes = ['setFrontView', 'setRightView', 'setTopView', 'setLeftView', 'setBackView', 'setBottomView'];
  const viewBtn = {
    clickCount: 0,
  }

  let selectedId: number;

  const createLeftActions = function(camera: OrbitCamera) {
    document.getElementById('changeViewBtn')!.addEventListener(('click'), (e) => {
      camera[viewModes[viewBtn.clickCount++ % viewModes.length]]();
    })
  }

  const updateSelectedId = function(id: number) {
    document.getElementById('rightSidePropertiesPanel')!.classList.add('translateFullyRigthX');
    if (id != selectedId && id > 0) {
      selectedId = id;
      document.getElementById('rightSidePropertiesPanel')!.classList.remove('translateFullyRigthX');
      events.emit(selectedId);
      console.log(selectedId)
    }
  };

  const getSelectedId = function() {
    console.log("getting nothing");
  }

  return {
    viewBtnState: viewBtn,
    updateSelectedId,
    getSelectedId,
    createLeftActions,
    onChange: events.subscribe
  };

}


