import { OrbitCamera } from "./deps/camera";

function createLocalEventEmitter(eventName: string) {
  // Using a DOM Event Target gives us a built-in event system
  const eventTarget = new EventTarget();

  addEventListener("resize", (event) => {
    const canvas = document.getElementById('canvas_main_render_target') as HTMLCanvasElement;
    canvas.width = document.body.clientWidth;
    canvas.height = document.body.clientHeight;
  });

  return {
    emit(value) {
      const event = new CustomEvent(eventName, { detail: value });
      eventTarget.dispatchEvent(event);
    },

    subscribe(callback) {
      const handler = (e) => callback(e.detail);
      eventTarget.addEventListener(eventName, handler);
      return () => eventTarget.removeEventListener(eventName, handler);
    }
  };
}

export function createActionsHandler() {
  const events = createLocalEventEmitter('change');
  const mepSystemChangeEvent = createLocalEventEmitter('mep');
  const viewModes = ['setFrontView', 'setRightView', 'setTopView', 'setLeftView', 'setBackView', 'setBottomView'];
  const mepSystems = ['0', '1', '2', '3', '4', '5']
  const viewBtn = {
    clickCount: 0,
  }
  const mepBtn = {
    clickCount: 0,
  }

  let selectedId: number;

  const createLeftActions = function(camera: OrbitCamera) {
    document.getElementById('changeViewBtn')!.addEventListener(('click'), (e) => {
      e.stopPropagation()
      camera[viewModes[viewBtn.clickCount++ % viewModes.length]]();
    })

    document.getElementById('changeMepModule')!.addEventListener(('click'), (e) => {
      e.stopPropagation()
      mepSystemChangeEvent.emit(mepBtn.clickCount++ % mepSystems.length)
    })

  }

  const updateSelectedId = function(id: number) {
    document.getElementById('rightSidePropertiesPanel')!.classList.add('translateFullyRigthX');
    if (id != selectedId && id > -1) {
      selectedId = id;
      document.getElementById('rightSidePropertiesPanel')!.classList.remove('translateFullyRigthX');
      events.emit(selectedId);
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
    onChange: events.subscribe,
    onMepSystemChange: mepSystemChangeEvent.subscribe,
  };

}


