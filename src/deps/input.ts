//This code was taken from https://webgpu.github.io/webgpu-samples/?sample=cameras#input.ts
//
//Feel free to make modifications

import { cubeColorOffset } from "../geometry/cube";

// Input holds as snapshot of input state
export default interface Input {
  // Digital input (e.g keyboard state)
  readonly digital: {
    readonly forward: boolean;
    readonly backward: boolean;
    readonly left: boolean;
    readonly right: boolean;
    readonly up: boolean;
    readonly down: boolean;
    readonly shift: boolean;
  };
  // Analog input (e.g mouse, touchscreen)
  readonly analog: {
    x: number;
    y: number;
    zoom: number;
    touching: boolean;
  };
  readonly mouseHover: {
    readonly x: number,
    readonly y: number
  },
  readonly mouseClickState: {
    mousePress: {
      x: 0,
      y: 0,
    },
    mouseRelease: {
      x: 0,
      y: 0,
    },
    clickReg: number,
    lastClickReg: number,
  }
}

// InputHandler is a function that when called, returns the current Input state.
export type InputHandler = () => Input;

// createInputHandler returns an InputHandler by attaching event handlers to the window and canvas.
export function createInputHandler(
  window: Window,
  canvas: HTMLCanvasElement
): InputHandler {
  const digital = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    shift: false,
  };
  const analog = {
    x: 0,
    y: 0,
    zoom: 0,
  };
  const mouseClickState = {
    mousePress: {
      x: 0,
      y: 0,
    },
    mouseRelease: {
      x: 0,
      y: 0,
    },
    clickReg: {
      x: 0,
      y: 0,
    },
    lastClickReg: {
      x: 0,
      y: 0,
    }
  }
  const mouseHover = {
    x: 0,
    y: 0,
  }

  let mouseDown = false;

  const setDigital = (e: KeyboardEvent, value: boolean) => {
    switch (e.code) {
      case 'KeyW':
        digital.forward = value;
        e.preventDefault();
        e.stopPropagation();
        break;
      case 'KeyS':
        digital.backward = value;
        e.preventDefault();
        e.stopPropagation();
        break;
      case 'KeyA':
        digital.left = value;
        e.preventDefault();
        e.stopPropagation();
        break;
      case 'KeyD':
        digital.right = value;
        e.preventDefault();
        e.stopPropagation();
        break;
      case 'Space':
        digital.up = value;
        e.preventDefault();
        e.stopPropagation();
        break;
      case 'ShiftLeft':
        digital.shift = value;
        e.preventDefault();
        e.stopPropagation();
        break;
      case 'ControlLeft':
      case 'AltLeft':
        digital.down = value;
        e.preventDefault();
        e.stopPropagation();
        break;
    }
  };

  window.addEventListener('keydown', (e) => setDigital(e, true));
  window.addEventListener('keyup', (e) => setDigital(e, false));

  canvas.style.touchAction = 'pinch-zoom';
  canvas.addEventListener('pointerdown', (e) => {
    mouseClickState.mousePress = { x: e.offsetX, y: e.offsetY };
    mouseDown = true;
  });
  canvas.addEventListener('pointerup', (e) => {
    mouseClickState.mouseRelease = { x: e.offsetX, y: e.offsetY }
    mouseDown = false;
  });
  canvas.addEventListener('pointermove', (e) => {
    mouseDown = e.pointerType == 'mouse' ? (e.buttons & 1) !== 0 : true;
    if (mouseDown) {
      analog.x += e.movementX;
      analog.y += e.movementY;
    }
  });

  canvas.addEventListener('click', (e) => {
    let diffX = Math.abs(Math.abs(mouseClickState.mousePress.x) - Math.abs(e.offsetX));
    let diffY = Math.abs(Math.abs(mouseClickState.mousePress.y) - Math.abs(e.offsetY));
    if ((diffX + diffY) < 25 && !digital.shift) {
      //Not sure we need to keep track so accurately
      mouseClickState.lastClickReg = mouseClickState.clickReg;
      mouseClickState.clickReg = { x: e.offsetX, y: e.offsetY };
      //A 'bit' hacky but basically triggers a new hit on the same spot, for now will do, we are still figuring the most performant aproach
      //so its fine to not set everything in stone
      if (mouseClickState.lastClickReg.x == mouseClickState.clickReg.x) {
        mouseClickState.clickReg = { x: 10, y: mouseClickState.clickReg.y };
      }
    }
  })

  //Will change to anything but the wheel 
  canvas.addEventListener(
    'wheel',
    (e) => {
      // The scroll value varies substantially between user agents / browsers.
      // Just use the sign.
      analog.zoom += Math.sign(e.deltaY);
      e.preventDefault();
      e.stopPropagation();
    },
    { passive: false }
  );

  canvas.addEventListener('mousemove', (x) => {
    mouseHover.x = x.offsetX;
    mouseHover.y = x.offsetY;
  })

  canvas.addEventListener('mouseout', (x) => {
    mouseHover.x = 0;
    mouseHover.y = 0;
  })

  return () => {
    const out = {
      digital,
      analog: {
        x: analog.x,
        y: analog.y,
        zoom: analog.zoom,
        touching: mouseDown,
      },
      mouseHover,
      mouseClickState: {
        clickReg: mouseClickState.clickReg.x + mouseClickState.clickReg.y,
        lastClickReg: mouseClickState.lastClickReg.x + mouseClickState.lastClickReg.y,
      }
    };
    // Clear the analog values, as these accumulate.
    analog.x = 0;
    analog.y = 0;
    analog.zoom = 0;
    return out;
  };
}
