import { transform } from "typescript";
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

function setUpMepSelectionPanel(typesIdStateMap, mepSelectionDialog: HTMLDivElement, changeMepModuleBtn: HTMLElement, mepSystemChangeEvent, toggledMepSystems: Set<any>) {
  mepSelectionDialog.addEventListener(('click'), (e) => e.stopPropagation())
  mepSelectionDialog.replaceChildren();
  if (!typesIdStateMap.size) {
    changeMepModuleBtn.classList.add('disabled');
    return;
  }

  const mepPanelContainer = document.createElement('div');
  mepPanelContainer.classList.add('mepPanelContainer')

  typesIdStateMap.forEach((typeObj) => {
    const row = document.createElement('div');
    row.style.color = 'black';
    row.classList.add('flex', 'gap-5', 'justify-between');
    const typeName = document.createElement('div');
    typeName.innerText = typeObj.stringType;
    const typeToggleBtn = document.createElement('div');
    typeToggleBtn.style.cursor = 'pointer';
    typeToggleBtn.innerText = 'disabled'
    typeToggleBtn.classList.add('red');
    typeToggleBtn.addEventListener(('click'), (e) => {
      e.stopPropagation();
      typeToggleBtn.innerText == 'enabled' ? typeToggleBtn.innerText = 'disabled' : typeToggleBtn.innerText = 'enabled';
      typeToggleBtn.classList.toggle('green');
      typeToggleBtn.classList.toggle('red');
      toggledMepSystems.has(typeObj.typeId) ? toggledMepSystems.delete(typeObj.typeId) : toggledMepSystems.add(typeObj.typeId);
      mepSystemChangeEvent.emit(toggledMepSystems)
    })
    row.appendChild(typeName);
    row.appendChild(typeToggleBtn);
    mepPanelContainer.appendChild(row);
  })

  const mepSelectionDialogCloseBtn = document.createElement('span')
  mepSelectionDialog.classList.add('mepSelectionDialog', 'rounded-md', 'hidden');
  mepSelectionDialogCloseBtn.classList.add('mepSelectionDialogCloseBtn')
  mepSelectionDialogCloseBtn.innerText = 'X';
  mepSelectionDialogCloseBtn.addEventListener(('click'), (e) => {
    e.stopPropagation()
    mepSelectionDialog.classList.add('hidden')
    changeMepModuleBtn.classList.toggle('active')
  })

  const panelHeader = document.createElement('div');
  panelHeader.innerText = 'Mep Systems';
  panelHeader.style.textAlign = 'center';
  panelHeader.style.fontWeight = 'bold';
  panelHeader.appendChild(mepSelectionDialogCloseBtn);

  const btnX = changeMepModuleBtn.offsetLeft + changeMepModuleBtn.offsetWidth;
  //const btnY = changeMepModuleBtn.offsetTop;
  const btnY = 0;
  const marginLeft = 8;

  mepSelectionDialog.style.setProperty('left', `${btnX + marginLeft}px`);
  mepSelectionDialog.style.setProperty('top', `${btnY}px`)

  mepSelectionDialog.appendChild(panelHeader);
  mepSelectionDialog.appendChild(mepPanelContainer)
  changeMepModuleBtn.appendChild(mepSelectionDialog);
}

export function createActionsHandler() {
  const onSelectedIdChangeEventEmitter = createLocalEventEmitter('onSelectedIdChangeEventEmitter');
  const mepSelectionDialog = document.createElement('div');
  const mepSystemChangeEvent = createLocalEventEmitter('mep');
  const viewModes = ['setFrontView', 'setRightView', 'setTopView', 'setLeftView', 'setBackView', 'setBottomView'];
  const viewModesMatrix = [
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1],
    [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1],
    [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1],
  ];
  const toggledMepSystems = new Set;
  const viewBtn = {
    clickCount: 0,
  }
  let cameraRef = null;

  const LEFTSIDETREESTRUCTUREPANELELEMENT = document.getElementById('leftSideTreeStructurePanel');
  const changeMepModuleBtn = document.getElementById('changeMepModuleBtn')!;
  const changeViewBtn = document.getElementById('changeViewBtn')!;
  const toggleProjectViewBtn = document.getElementById('toggleProjectThreeViewBtn')!;

  changeMepModuleBtn.addEventListener(('click'), (e) => {
    e.stopPropagation();
    mepSelectionDialog.classList.toggle('hidden');
    changeMepModuleBtn.classList.toggle('active');
    deselectTreeView();
  })

  toggleProjectViewBtn.addEventListener(('click'), (e) => {
    e.stopPropagation();
    LEFTSIDETREESTRUCTUREPANELELEMENT!.classList.toggle('hidden');
    toggleProjectViewBtn.classList.toggle('active')
    deselectMepPanel();
  })

  changeViewBtn.addEventListener(('click'), (e) => {
    e.stopPropagation()
    const prevClickCount = viewBtn.clickCount ? viewBtn.clickCount - 1 : viewModes.length;
    const clickCount = viewBtn.clickCount++;
    document.querySelector(`.${viewModes[(prevClickCount % viewModes.length)]}`).classList.remove('cubeFaceClicked');
    cameraRef[viewModes[clickCount % viewModes.length]]();
    document.querySelector('.changeViewBtnGhostCube')!.style.transform = `matrix3d(${viewModesMatrix[clickCount % viewModesMatrix.length]})`;
    document.querySelector(`.${viewModes[clickCount % viewModes.length]}`)?.classList.add('cubeFaceClicked');
  })

  const updateActionsCameraRef = function(camera: OrbitCamera) {
    cameraRef = camera;
  }

  function deselectTreeView() {
    LEFTSIDETREESTRUCTUREPANELELEMENT!.classList.contains('hidden') ? null : LEFTSIDETREESTRUCTUREPANELELEMENT!.classList.add('hidden');
    toggleProjectViewBtn.classList.contains('active') ? toggleProjectViewBtn.classList.remove('active') : null;
  }

  function deselectMepPanel() {
    mepSelectionDialog.classList.contains('hidden') ? null : mepSelectionDialog.classList.add('hidden');
    changeMepModuleBtn.classList.contains('active') ? changeMepModuleBtn.classList.remove('active') : null;
  }


  const updateSelectedId = function(newSelectedId: number) {
    if (newSelectedId == -1 || newSelectedId == 0) {
      document.getElementById('rightSidePropertiesPanel')!.classList.add('translateFullyRigthX');
      document.getElementById('rightSidePropertiesPanelContainer')!.style.pointerEvents = 'none';
    } else {
      document.getElementById('rightSidePropertiesPanel')!.classList.remove('translateFullyRigthX');
      document.getElementById('rightSidePropertiesPanelContainer')!.style.pointerEvents = 'all';
      onSelectedIdChangeEventEmitter.emit(newSelectedId);
    }

  };


  return {
    viewBtnState: viewBtn,
    updateSelectedId,
    updateActionsCameraRef,
    onSelectedIdChange: onSelectedIdChangeEventEmitter.subscribe,
    onMepSystemChange: mepSystemChangeEvent.subscribe,
    setUpMepSelectionPanel: (typesIdStateMap) => setUpMepSelectionPanel(typesIdStateMap, mepSelectionDialog, changeMepModuleBtn, mepSystemChangeEvent, toggledMepSystems)
  };

}


