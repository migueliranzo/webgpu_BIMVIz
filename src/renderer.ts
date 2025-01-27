import ifcModelShaderCode from './shaders/PASS_LOADMODEL.wgsl?raw';
import computeForwardCode from './shaders/COMPUTE_HOVER.wgsl?raw'
import mainPassShaderCode from './shaders/PASS_DIRECTLIGHT.wgsl?raw'
import computeBoundingCode from './shaders/COMPUTE_VERTEX.wgsl?raw'
import computeOcclusionCode from './shaders/COMPUTE_OCCLUSION.wgsl?raw'
import computeHizMipMapsCode from './shaders/COMPUTE_HIZ_MIPMAPS.wgsl?raw'
import testBoundingBoxesCode from './shaders/PASS_BOUNDINGBOXES.wgsl?raw'
import { cubeVertexData, } from './geometry/cube.ts';
import { getMVPMatrix, getProjectionMatrix, getViewMatrix, getWorldMatrix } from './math_utils.ts';
import { createInputHandler } from './deps/input.ts';
import { OrbitCamera } from './deps/camera.ts';
import { createActionsHandler } from './actions.ts'
import { vec3, mat4 } from 'wgpu-matrix'
import { createModelServiceHandle, getMeshGroupsHandler } from './testHandler.ts';

export async function renderer(device: GPUDevice, canvas: HTMLCanvasElement, loadedModel: Map<number, { baseGeometry: { indexArray, vertexArray }, instances: [] }>, actionHandler: any, meshCount: number, meshLookUpIdOffsets: number[]) {
  const ALIGNED_SIZE = 256;
  const MAT4_SIZE = 4 * 16;
  const VEC4_SIZE = 4 * 4;
  const VEC3_SIZE = 4 * 3;
  const VEC2_SIZE = 4 * 2;

  //Getting the context stuff here for now, not sure where it will go
  const context = canvas.getContext('webgpu')!;
  let canvasW = canvas.width;
  let canvasH = canvas.height;

  //Camera 
  const cameraSettings = {
    eye: vec3.create(2., 2.2, 8.0),
    target: vec3.create(0., 0.8, 2.)
  }

  const initialCameraPosition = cameraSettings.eye;
  const camera = new OrbitCamera({ position: initialCameraPosition })
  const inputHandler = createInputHandler(window, canvas);
  actionHandler.createLeftActions(camera);

  //Shader modules
  const ifcModelshaderModule = device.createShaderModule({
    code: ifcModelShaderCode,
  })

  const computeHoverShaderModule = device.createShaderModule({
    code: computeForwardCode,
  })

  const computeBoundingBoxesModule = device.createShaderModule({
    code: computeBoundingCode,
  })

  const computeOcclusionModule = device.createShaderModule({
    code: computeOcclusionCode,
  })

  const computeHizMipMapsModule = device.createShaderModule({
    code: computeHizMipMapsCode,
  })

  const mainPassShaderModule = device.createShaderModule({
    code: mainPassShaderCode
  })

  const testBoundingBoxesModule = device.createShaderModule({
    code: testBoundingBoxesCode
  })

  context.configure({
    device: device,
    format: navigator.gpu.getPreferredCanvasFormat(),
    alphaMode: 'premultiplied',
  })

  //we loop here unless we need this data somehwere else as well
  let verCountLd = 0;
  let indCountLd = 0;
  let instancesCountLd = 0;
  loadedModel.forEach((x) => {
    verCountLd += x.baseGeometry.vertexArray.byteLength;
    indCountLd += x.baseGeometry.indexArray.byteLength;
    instancesCountLd += x.instances.length;
  })

  //Buffer creation
  const drawIndirectCommandBuffer = device.createBuffer({
    size: (loadedModel.size * 5) * 4,
    usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    label: 'drawCommandBuffer'
  })

  const filteredDrawIndirectCommandBuffer = device.createBuffer({
    size: (instancesCountLd * 5) * 4, //Revert back to loadmodel.size if at all, we went with instance count to use this buffer for testing
    usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    label: 'filteredDrawCommandBuffer'
  })

  const mouseCoordsBuffer = device.createBuffer({
    size: VEC4_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  })

  const computeHoverOutputBuffer = device.createBuffer({
    size: loadedModel.size * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
  })

  const computeBindingBoxesOutputBuffer = device.createBuffer({
    size: instancesCountLd * (VEC4_SIZE + VEC4_SIZE), //box.min box.max xyz(w/p)
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
  })

  const viewProjectionMatrixBuffer = device.createBuffer({
    size: MAT4_SIZE + MAT4_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label: 'occlisionCOmmands'
  })

  const computeSelectedIdStagingBuffer = device.createBuffer({
    size: VEC4_SIZE,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
  })

  const computeSelectedIdBuffer = device.createBuffer({
    size: VEC4_SIZE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
  })

  //TODO: Is storage in vertex/index buffer even okay?
  const ifcModelVertexBuffer = device.createBuffer({
    size: verCountLd,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
    label: 'instanceVertexBuffer'
  })

  const ifcModelIndexBuffer = device.createBuffer({
    size: indCountLd,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
    label: 'instanceIndexBuffer'
  })

  const gBufferConstantsUniform = device.createBuffer({
    size: MAT4_SIZE + MAT4_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label: 'gBufferConstantUniformsBuffer'
  })

  const gBufferInstanceOffsetBuffer = device.createBuffer({
    size: ALIGNED_SIZE * loadedModel.size, //Couldnt this be smaller? is over 128? -> Thing is Dynamic offsets have to be 256 aligned 
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
    label: 'gBufferInstanceOffsetBuffer'
  })

  //awful naming btw, just do instanceUniforms, rm constant
  const gBufferInstnaceConstantsBuffer = device.createBuffer({
    size: instancesCountLd * (ALIGNED_SIZE / 2),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    label: 'gBufferInstnaceConstantsBuffer'
  })

  const testBoundingBoxOffsetsBuffer = device.createBuffer({
    size: loadedModel.size * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
  })

  const gBufferMeshUniformBuffer = device.createBuffer({
    size: meshCount * 8,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'gBufferMeshUniformBuffer'
  })

  const typeStatesBuffer = device.createBuffer({
    size: ALIGNED_SIZE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'typeStatesBuffer'
  })

  //G Buffer textures
  const positionTexture = device.createTexture({
    size: { width: canvasW, height: canvasH },
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    format: 'rgba16float',
  });

  const albedoTexture = device.createTexture({
    size: { width: canvasW, height: canvasH },
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    format: 'rgba8unorm',
  });
  const normalTexture = device.createTexture({
    size: { width: canvasW, height: canvasH },
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    format: 'rgba16float',
  });
  const idTexture = device.createTexture({
    size: { width: canvasW, height: canvasH },
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    format: 'r32uint'
  })

  const depthTexture = device.createTexture({
    size: { width: canvasW, height: canvasH },
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });

  const [maxPowerOf2SizeW, maxPowerOf2SizeH] = [canvasW, canvasH].map((x) => Math.pow(2, Math.floor(Math.log2(x))));
  const numMipLevels = 5 //TODO: to calculate properly

  const hizMipMapsTexture = device.createTexture({
    size: { width: maxPowerOf2SizeW, height: maxPowerOf2SizeH },
    format: 'r32float',
    //format: 'rgba16float',
    dimension: '2d',
    sampleCount: 1,
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
    //mipLevelCount: Math.log2(Math.max(canvasW, canvasH))
    mipLevelCount: numMipLevels,
  })

  //Bind groups - layouts
  const gBufferConstantsBindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'uniform', minBindingSize: MAT4_SIZE + MAT4_SIZE }
    },
    {
      binding: 1,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'read-only-storage' }
    },
    {
      binding: 2,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'read-only-storage' }
    }
    ],
    label: 'gBufferConstantsBindGroupLayout'
  });

  const gBufferInstanceOffsetBindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'uniform', minBindingSize: VEC4_SIZE, hasDynamicOffset: true }
    }],
    label: 'gBufferInstanceOffsetBindGroupLayout'
  });

  const gBufferInstanceConstantFormsBindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'read-only-storage' },
    }],
    label: 'gBufferInstanceConstantFormsBindGroupLayout'
  });

  const gBufferMeshUniformBindgroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'read-only-storage' }
    }, {
      binding: 1,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'read-only-storage' }
    }
    ]
  })

  const testBoundingBoxesBindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'uniform', minBindingSize: MAT4_SIZE + MAT4_SIZE }
    },
    {
      binding: 1,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'read-only-storage' }
    },
    {
      binding: 2,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'read-only-storage' }
    },
    ],
    label: 'testBoundingBoxesBindGroupLayout'
  })


  const mainPassBindgroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          sampleType: 'float',
        },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          sampleType: 'float',
        },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          sampleType: 'float',
        },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          sampleType: 'uint',
        },
      },
      {
        binding: 4,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {
          type: 'read-only-storage'
        }
      }
    ]
  })


  const computeHoverBindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.COMPUTE,
      buffer: {
        type: 'storage'
      }
    },
    {
      binding: 1,
      visibility: GPUShaderStage.COMPUTE,
      buffer: {
        type: 'uniform', minBindingSize: VEC4_SIZE
      }
    },
    {
      binding: 2,
      visibility: GPUShaderStage.COMPUTE,
      texture: {
        sampleType: 'uint'
      }
    },
    {
      binding: 3,
      visibility: GPUShaderStage.COMPUTE,
      buffer: {
        type: 'storage',
      }
    },
    ]
  })

  const computeBoundingBoxesBindingGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.COMPUTE,
      buffer: {
        type: 'storage',
      }
    },
    {
      binding: 1,
      visibility: GPUShaderStage.COMPUTE,
      buffer: {
        type: 'read-only-storage',
      },
    },
    {
      binding: 2,
      visibility: GPUShaderStage.COMPUTE,
      buffer: {
        type: 'read-only-storage',
      },
    },
    {
      binding: 3,
      visibility: GPUShaderStage.COMPUTE,
      buffer: {
        type: 'read-only-storage',
      },
    },
    {
      binding: 4,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: 'uniform', minBindingSize: MAT4_SIZE + MAT4_SIZE }
    },
    {
      binding: 5,
      visibility: GPUShaderStage.COMPUTE,
      buffer: {
        type: 'read-only-storage'
      }
    },
    {
      binding: 6,
      visibility: GPUShaderStage.COMPUTE,
      buffer: {
        type: 'storage'
      }
    }
    ]
  })

  const viewProBindingGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.COMPUTE,
      buffer: {
        type: 'uniform'
      }
    }]
  })

  const computeOcclusionBindingGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.COMPUTE,
      buffer: {
        type: 'storage',
      }
    },
    {
      binding: 1,
      visibility: GPUShaderStage.COMPUTE,
      buffer: {
        type: 'read-only-storage',
      },
    },
    {
      binding: 2,
      visibility: GPUShaderStage.COMPUTE,
      texture: { sampleType: 'unfilterable-float' }
    },
    {
      binding: 3,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: 'storage' }
    },
    {
      binding: 4,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: 'storage' }
    },
    {
      binding: 5,
      visibility: GPUShaderStage.COMPUTE,
      buffer: {
        type: 'storage'
      }
    }
    ]
  })

  const computeHizMipMapsBindingGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.COMPUTE,
      texture: {
        sampleType: 'unfilterable-float', //Kinda weird might cause issues? Cant be float for some reason
        //sampleType: 'float',
        viewDimension: '2d',
      }
    },
    {
      binding: 1,
      visibility: GPUShaderStage.COMPUTE,
      storageTexture: {
        access: 'write-only',
        format: 'r32float',
        //format: 'rgba16float',
        viewDimension: '2d'
      }
    },
    ]
  })

  const computeDepthToFloatBindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.COMPUTE,
      texture: {
        sampleType: 'depth'
      }
    },
    {
      binding: 1,
      visibility: GPUShaderStage.COMPUTE,
      storageTexture: {
        access: 'write-only',
        //format: 'rgba16float'
        format: 'r32float'
      }
    }
    ]
  })

  //Bind groups - creation
  const gBufferConstantsBindGroup = device.createBindGroup({
    layout: gBufferConstantsBindGroupLayout,
    entries: [{
      binding: 0,
      resource: {
        buffer: gBufferConstantsUniform,
        size: MAT4_SIZE + MAT4_SIZE,
        offset: 0
      }
    },
    {
      binding: 1,
      resource: {
        buffer: filteredDrawIndirectCommandBuffer,
      }
    },
    {
      binding: 2,
      resource: {
        buffer: gBufferInstanceOffsetBuffer,
        offset: 256
        //size: ALIGNED_SIZE,
      }
    }
    ]
  });


  const testBoundingBoxesBindGroup = device.createBindGroup({
    layout: testBoundingBoxesBindGroupLayout,
    entries: [{
      binding: 0,
      resource: {
        buffer: gBufferConstantsUniform,
        size: MAT4_SIZE + MAT4_SIZE,
        offset: 0
      }
    },
    {
      binding: 1,
      resource: {
        buffer: computeBindingBoxesOutputBuffer,
      }
    },
    {
      binding: 2,
      resource: {
        buffer: gBufferInstnaceConstantsBuffer,
      }
    },
    ]
  });

  const gBufferInstanceOffsetBindGroup = device.createBindGroup({
    layout: gBufferInstanceOffsetBindGroupLayout,
    entries: [{
      binding: 0,
      resource: {
        buffer: gBufferInstanceOffsetBuffer,
        size: ALIGNED_SIZE,
        offset: 0
      }
    }]
  });

  const gBufferInstanceConstantsBindGroup = device.createBindGroup({
    layout: gBufferInstanceConstantFormsBindGroupLayout,
    entries: [{
      binding: 0,
      resource: {
        buffer: gBufferInstnaceConstantsBuffer,
      }
    }]
  });

  const gBufferMeshUniformBindGroup = device.createBindGroup({
    layout: gBufferMeshUniformBindgroupLayout,
    entries: [{
      binding: 0,
      resource: {
        buffer: gBufferMeshUniformBuffer,
      }
    },
    {
      binding: 1,
      resource: {
        buffer: typeStatesBuffer,
      }
    }
    ]
  })

  const mainPassBindgroup = device.createBindGroup({
    layout: mainPassBindgroupLayout,
    entries: [
      { binding: 0, resource: positionTexture.createView() },
      { binding: 1, resource: normalTexture.createView() },
      { binding: 2, resource: albedoTexture.createView() },
      { binding: 3, resource: idTexture.createView() },
      { binding: 4, resource: { buffer: computeSelectedIdBuffer } },
    ]
  })


  const computeHoverBindGroup = device.createBindGroup({
    layout: computeHoverBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: computeHoverOutputBuffer,
        }
      },
      {
        binding: 1,
        resource: {
          buffer: mouseCoordsBuffer,
          offset: 0,
          size: VEC4_SIZE,
        }
      },
      {
        binding: 2,
        resource: idTexture.createView()
      },
      {
        binding: 3,
        resource: {
          buffer: computeSelectedIdBuffer,
        }
      }
    ]
  })

  const computeBoundingBoxesBindGroup = device.createBindGroup({
    layout: computeBoundingBoxesBindingGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: computeBindingBoxesOutputBuffer,
        }
      },
      {
        binding: 1,
        resource: {
          buffer: ifcModelVertexBuffer,
        }
      },
      {
        binding: 2,
        resource: {
          buffer: ifcModelIndexBuffer
        }
      },
      {
        binding: 3,
        resource: {
          buffer: gBufferInstnaceConstantsBuffer
        }
      },
      {
        binding: 4,
        resource: {
          buffer: gBufferConstantsUniform
        }
      },
      {
        binding: 5,
        resource: {
          buffer: drawIndirectCommandBuffer
        }
      },
      {
        binding: 6,
        resource: {
          buffer: testBoundingBoxOffsetsBuffer,
        }
      }

    ],
  });

  const viewProBindingGroup = device.createBindGroup({
    layout: viewProBindingGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: viewProjectionMatrixBuffer,
        }
      }
    ]
  })

  const computeOcclusionBindingGroup = device.createBindGroup({
    layout: computeOcclusionBindingGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: drawIndirectCommandBuffer,
        }
      },
      {
        binding: 1,
        resource: {
          buffer: computeBindingBoxesOutputBuffer
        }
      },
      {
        binding: 2,
        resource: hizMipMapsTexture.createView()
      },
      {
        binding: 3,
        resource: {
          buffer: filteredDrawIndirectCommandBuffer
        }
      },
      {
        binding: 4,
        resource: {
          buffer: gBufferInstnaceConstantsBuffer
        }
      },
      {
        binding: 5,
        resource: {
          buffer: gBufferInstanceOffsetBuffer,
        }
      }
    ],
  });


  //Pipelines
  const mainPassPipeline = function() {
    const mainPassPipelineLayout: GPURenderPipelineDescriptor = {
      vertex: {
        module: mainPassShaderModule,
        entryPoint: 'vertex_main',
      },
      fragment: {
        module: mainPassShaderModule,
        entryPoint: 'fragment_main',
        targets: [
          { format: navigator.gpu.getPreferredCanvasFormat() }],
      },
      layout: device.createPipelineLayout({
        bindGroupLayouts: [mainPassBindgroupLayout],
      })
    }
    return device.createRenderPipeline(mainPassPipelineLayout)
  }();


  const testBoundingBoxesPipeline = function() {
    const testBoundingBoxesPipelineLayout: GPURenderPipelineDescriptor = {
      vertex: {
        module: testBoundingBoxesModule,
        entryPoint: 'vertex_main',
      },
      fragment: {
        module: testBoundingBoxesModule,
        entryPoint: 'fragment_main',
        targets: [
          { format: navigator.gpu.getPreferredCanvasFormat() }],
      },
      layout: device.createPipelineLayout({
        bindGroupLayouts: [testBoundingBoxesBindGroupLayout],
      }),
      primitive: {
        topology: 'line-list'
      }
    }
    return device.createRenderPipeline(testBoundingBoxesPipelineLayout)
  }();

  const gBufferPipeline = function() {
    const vertexBuffers: GPUVertexBufferLayout[] = [{
      attributes: [{
        shaderLocation: 0,
        offset: 0,
        format: 'float32x3',
      }, {
        shaderLocation: 1,
        offset: 4 * 3,
        format: 'float32x3'
      }],
      arrayStride: 4 * (3 + 3),
      stepMode: 'vertex'
    }];

    const pipelineDescriptor: GPURenderPipelineDescriptor = {
      vertex: {
        module: ifcModelshaderModule,
        entryPoint: 'vertex_main',
        buffers: vertexBuffers,
      },
      fragment: {
        module: ifcModelshaderModule,
        entryPoint: 'fragment_main',
        targets: [
          { format: 'rgba16float' }, // worldPos
          { format: 'rgba16float' }, // worldNormal
          { format: 'rgba8unorm' }, // albedo
          { format: 'r32uint' }, // Ids 
        ]
      },
      primitive: {
        topology: 'triangle-list',
        //frontFace: 'ccw',
        cullMode: 'back'
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less-equal',
        format: 'depth24plus',
        depthBias: -1,
      },
      layout: device.createPipelineLayout({
        bindGroupLayouts: [gBufferConstantsBindGroupLayout, gBufferInstanceConstantFormsBindGroupLayout, gBufferInstanceOffsetBindGroupLayout, gBufferMeshUniformBindgroupLayout],
      }),
    }
    return device.createRenderPipeline(pipelineDescriptor);
  }();

  const computeHoverPipeline = function() {
    const computePipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [computeHoverBindGroupLayout],
      }),
      compute: {
        module: computeHoverShaderModule,
        entryPoint: 'main'
      }
    })
    return computePipeline;
  }();

  const computeBoundingBoxesPipeline = function() {
    const computePipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [computeBoundingBoxesBindingGroupLayout],
      }),
      compute: {
        module: computeBoundingBoxesModule,
        entryPoint: 'main'
      }
    })
    return computePipeline;
  }();



  const computeOcclusionPipeline = function() {
    const computePipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [computeOcclusionBindingGroupLayout, viewProBindingGroupLayout],
      }),
      compute: {
        module: computeOcclusionModule,
        entryPoint: 'main'
      }
    })
    return computePipeline;
  }();

  const computeHizMipMapsPipeline = function() {
    const computePipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [computeHizMipMapsBindingGroupLayout],
      }),
      compute: {
        module: computeHizMipMapsModule,
        entryPoint: 'main'
      }
    })
    return computePipeline;
  }();

  const computeDepthToFloatPipeline = function() {
    const computePipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [computeDepthToFloatBindGroupLayout],
      }),
      compute: {
        module: computeHizMipMapsModule,
        entryPoint: 'convertDepthToHiZ'
      }
    })
    return computePipeline;
  }();


  //Render passes
  const clearColor = { r: 0.0, g: 0.5, b: 1.0, a: 1.0 }
  const mainPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [{
      clearValue: clearColor,
      loadOp: 'load',
      storeOp: 'store',
      view: context.getCurrentTexture().createView()
    }]
  }

  const ifcModelPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view: positionTexture.createView(),
        clearValue: clearColor,
        loadOp: 'clear',
        storeOp: 'store',
      },
      {
        view: normalTexture.createView(),
        clearValue: clearColor,
        loadOp: 'clear',
        storeOp: 'store',
      },
      {
        view: albedoTexture.createView(),
        clearValue: clearColor,
        loadOp: 'clear',
        storeOp: 'store',
      },
      {
        view: idTexture.createView(),
        clearValue: clearColor,
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
    depthStencilAttachment: {
      view: depthTexture.createView(),
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  };

  //TODO: Cleanup and/or encapsulation
  let _offsetGeo = 0;
  let _offsetIndex = 0;
  let _offsetIndexBytes = 0;
  let _offsetGeoBytes = 0;
  let testI = 0;
  let instanceI = 0;
  let instanceGroupI = 0;
  let firstInstanceOffset = 0;
  const proMat = getProjectionMatrix(canvasW, canvasH);
  let vertexDataArray = new Float32Array(verCountLd / 4);
  const commandArray = new Uint32Array(loadedModel.size * 5);
  let indexDataArray = new Uint32Array(indCountLd / 4);
  let instanceDataArray = new ArrayBuffer(instancesCountLd * (16 * 4 + 3 * 4 + 1 * 4 + 12 * 4));
  let instanceDataArrayFloatView = new Float32Array(instanceDataArray);
  let instanceDataArrayUintView = new Uint32Array(instanceDataArray);
  let instanceUniformOffsetDataArray = new Float32Array((loadedModel.size * ALIGNED_SIZE) / 4);
  const meshGroupsIds = new Float32Array(loadedModel.size * MAT4_SIZE);
  let meshLookUpIdOffsetIndex = 0;
  loadedModel.forEach((instanceGroup) => {
    commandArray[testI] = instanceGroup.baseGeometry.indexArray.length; //Index count
    commandArray[testI + 1] = instanceGroup.instances.length; //Instance count
    commandArray[testI + 2] = _offsetIndex; //Index buffer offset was  _offsetIndex
    commandArray[testI + 3] = _offsetGeo//base vertex? was _offsetGeo
    commandArray[testI + 4] = 0;  //first instance? was firstInstanceOffset

    //Why are we saving this as a vec4, its literally just a number, fix
    instanceUniformOffsetDataArray.set(Float32Array.of(firstInstanceOffset, 0, 0, 0), instanceGroupI * (ALIGNED_SIZE / 4));
    vertexDataArray.set(instanceGroup.baseGeometry.vertexArray, _offsetGeoBytes / 4);
    indexDataArray.set(instanceGroup.baseGeometry.indexArray, _offsetIndexBytes / 4);
    firstInstanceOffset += instanceGroup.instances.length;

    //But shouldnt this be uniforms per instance group instead of per instance and lookup?
    instanceGroup.instances.forEach((instance: { color, flatTransform, lookUpId, meshExpressId }) => {
      let currOffset = ((16 * 4 + 3 * 4 + 1 * 4 + 12 * 4) / 4) * instanceI;
      instanceDataArrayFloatView.set(instance.flatTransform, currOffset);
      instanceDataArrayFloatView.set([instance.color.x, instance.color.y, instance.color.z], currOffset + 16)
      instanceDataArrayUintView.set([(instance.lookUpId) + meshLookUpIdOffsets[meshLookUpIdOffsetIndex]], currOffset + 16 + 3);
      instanceI++;
      if (instance.lookUpId == meshLookUpIdOffsets[meshLookUpIdOffsetIndex + 1]) meshLookUpIdOffsetIndex += 1;
    })

    _offsetGeo += instanceGroup.baseGeometry.vertexArray.length / 6;
    _offsetIndexBytes += instanceGroup.baseGeometry.indexArray.byteLength;
    _offsetIndex += instanceGroup.baseGeometry.indexArray.length;
    _offsetGeoBytes += instanceGroup.baseGeometry.vertexArray.byteLength
    instanceGroupI++;
    testI += 5;
  })

  //Static buffers write
  device.queue.writeBuffer(gBufferInstanceOffsetBuffer, 0, instanceUniformOffsetDataArray)
  device.queue.writeBuffer(gBufferInstnaceConstantsBuffer, 0, instanceDataArray)
  device.queue.writeBuffer(drawIndirectCommandBuffer, 0, commandArray);
  device.queue.writeBuffer(gBufferConstantsUniform, 64, proMat);
  device.queue.writeBuffer(ifcModelVertexBuffer, 0, vertexDataArray);
  device.queue.writeBuffer(ifcModelIndexBuffer, 0, indexDataArray);

  console.log(instancesCountLd)

  let typesStatesBufferStrides = new Map<any, any>;
  {
    getMeshGroupsHandler().getMeshGroups().then(({ meshLookUpIdsList, meshTypeIdMap, typesIdStateMap }) => {
      console.log(meshLookUpIdsList, meshTypeIdMap, typesIdStateMap);
      const meshUniformsDataArray = new Uint32Array((2) * meshLookUpIdsList.length);
      for (let i = 0; i < meshLookUpIdsList.length; i++) {
        let offset = ((2 * 4) / 4) * i;
        let stringType = meshTypeIdMap.get(meshLookUpIdsList[i]) ? meshTypeIdMap.get(meshLookUpIdsList[i]) : 'noGroup';
        meshUniformsDataArray[offset] = meshLookUpIdsList[i];
        meshUniformsDataArray[offset + 1] = typesIdStateMap.get(stringType) ? typesIdStateMap.get(stringType).typeId : 99; //??? BTW we can add the arquitecture walls and all meshses really into a group so we can , say fade them all when enabling cable view for example, I honestly dont think is worth going through the trouble of separating each wall group n stuff, at least for now
      }

      const typeStatesDataArray = new Float32Array(typesIdStateMap.size * 4); //uint State + vec3 color for now
      let i = 0;
      typesIdStateMap.forEach((typeIdObject) => {
        let offset = (i * 4)
        typeStatesDataArray.set([...typeIdObject.color], offset);
        typeStatesDataArray.set([typeIdObject.state], offset + 3);
        typesStatesBufferStrides.set(typeIdObject.typeId, { stride: offset * 4, stringType: typeIdObject.stringType })
        i++
      })

      device.queue.writeBuffer(typeStatesBuffer, 0, typeStatesDataArray)
      device.queue.writeBuffer(gBufferMeshUniformBuffer, 0, meshUniformsDataArray)

      //So this is how we will do the dynamic toggle of types-> works for pipeTypes for now
      //let testType = typesStatesBufferStrides.get(1);
      //device.queue.writeBuffer(typeStatesBuffer, testType.stride + 12, new Float32Array([1]))
    })
  }

  let previousSelectedId = 0;
  const updateId = (currentId: number) => {
    if (currentId != previousSelectedId) {
      actionHandler.updateSelectedId(currentId);
      previousSelectedId = currentId;
    }
  }

  let lastFrameMS = Date.now()
  const fpsElem = document.querySelector("#fps")!;
  let frameCount = 0;

  const boundingBoxTestData = new Float32Array([
    -5, 0, -5, 1,
    5, 1, 5, 1,
    -4.5, 0, -4.5, 1,
    -4, 5, -4, 1,
    4, 0, -4.5, 1,
    4.5, 5, -4, 1,
    -4.5, 0, 4, 1,
    -4, 5, 4.5, 1,
    4, 0, 4, 1,
    4.5, 5, 4.5, 1,
    -1, 3, -1, 1,
    1, 4, 1, 1,
    -0.5, 6, -0.5, 1,
    0.5, 6.5, 0.5, 1,
    1, 6, -0.5, 1,
    2, 6.5, 0.5, 1,
    2.5, 6, -0.5, 1,
    3.5, 6.5, 0.5, 1,
    3.5, 5.75, -0.75, 1,
    4.5, 6.75, 0.75, 1,
  ])

  //Okay so we do project boxes, that works, we also can transform them, that works...
  //Next test case would be... lets output the same box for every object and see if they get properly placed and transformed, 
  //if we see our model with bounding boxes each representing the center of an object where we would expect them to see we can conclude the issue is we just generate faulty boxes

  async function render() {
    frameCount++;
    const now = Date.now();
    const deltaTime = (now - lastFrameMS) / 1000;
    const commandEnconder = device.createCommandEncoder();
    lastFrameMS = now;
    const fps = 1 / deltaTime;             // compute frames per second
    fpsElem.textContent = fps.toFixed(1);
    let cameraMatrix = camera.update(deltaTime, { ...inputHandler() });


    let canvasView = context.getCurrentTexture().createView();
    mainPassDescriptor.colorAttachments[0].view = canvasView;

    //Bounding box calculation
    //TODO: Testing ofc remove this form loop
    const tempEncoderPass = device.createCommandEncoder()
    const tempEncoder = tempEncoderPass.beginComputePass();
    tempEncoder.setPipeline(computeBoundingBoxesPipeline);
    tempEncoder.setBindGroup(0, computeBoundingBoxesBindGroup)
    tempEncoder.dispatchWorkgroups(loadedModel.size);
    tempEncoder.end();



    //Copy depth texture to mipmap level 0
    const tempEncoderDepthToFloat = tempEncoderPass.beginComputePass();
    tempEncoderDepthToFloat.setPipeline(computeDepthToFloatPipeline);
    //Constantly creating Bindgroups?
    let computeDepthToFloatBindGroup = device.createBindGroup({
      layout: computeDepthToFloatBindGroupLayout,
      entries: [{
        binding: 0,
        resource: depthTexture.createView()
      },
      {
        binding: 1,
        resource: hizMipMapsTexture.createView({ baseMipLevel: 0, mipLevelCount: 1 })
      }
      ]
    })
    tempEncoderDepthToFloat.setBindGroup(0, computeDepthToFloatBindGroup);
    tempEncoderDepthToFloat.dispatchWorkgroups(canvasW, canvasH);
    tempEncoderDepthToFloat.end();


    //HI-Z creation -- for testing we dont really need it now since we are only testing the first level, and we also want to make this more blocky remember 
    const tempEncoder3 = tempEncoderPass.beginComputePass();
    tempEncoder3.setPipeline(computeHizMipMapsPipeline);

    let workgroupSizePerDim = 8; //compute workgroup size (8,8)
    for (let i = 1; i < numMipLevels; i++) {
      let invocationCountX = maxPowerOf2SizeW / (2 * i);
      let invocationCountY = maxPowerOf2SizeH / (2 * i);
      let workgroupCountX = (invocationCountX + workgroupSizePerDim - 1) / workgroupSizePerDim;
      let workgroupCountY = (invocationCountY + workgroupSizePerDim - 1) / workgroupSizePerDim;
      //Constantly creating Bindgroups?
      let computeHizMipMapsBindingGroup = device.createBindGroup({
        layout: computeHizMipMapsBindingGroupLayout,
        entries: [{
          binding: 0,
          resource: hizMipMapsTexture.createView({ baseMipLevel: i - 1, mipLevelCount: 1 })
        },
        {
          binding: 1,
          resource: hizMipMapsTexture.createView({ baseMipLevel: i, mipLevelCount: 1 })
        },
        ]
      });
      tempEncoder3.setBindGroup(0, computeHizMipMapsBindingGroup);
      tempEncoder3.dispatchWorkgroups(workgroupCountX, workgroupCountY, 1);
    }

    tempEncoder3.end();

    //if (frameCount < 500) {
    //console.log("GOOO")
    const tempEncoder2 = tempEncoderPass.beginComputePass();
    tempEncoder2.setPipeline(computeOcclusionPipeline);
    tempEncoder2.setBindGroup(0, computeOcclusionBindingGroup)
    device.queue.writeBuffer(viewProjectionMatrixBuffer, 0, new Float32Array([...cameraMatrix, ...proMat]))
    tempEncoder2.setBindGroup(1, viewProBindingGroup);
    tempEncoder2.dispatchWorkgroups(loadedModel.size);
    tempEncoder2.end();
    //}


    device.queue.submit([tempEncoderPass.finish()]);

    const gBufferPassEncoder = commandEnconder.beginRenderPass(ifcModelPassDescriptor);
    gBufferPassEncoder.setPipeline(gBufferPipeline);
    let _dynamicOffset = 0;

    gBufferPassEncoder.setVertexBuffer(0, ifcModelVertexBuffer, 0);
    gBufferPassEncoder.setIndexBuffer(ifcModelIndexBuffer, 'uint32', 0);
    gBufferPassEncoder.setBindGroup(0, gBufferConstantsBindGroup);
    gBufferPassEncoder.setBindGroup(1, gBufferInstanceConstantsBindGroup);
    gBufferPassEncoder.setBindGroup(3, gBufferMeshUniformBindGroup);

    let incr = 0;
    loadedModel.forEach((instanceGroup) => {
      gBufferPassEncoder.setBindGroup(2, gBufferInstanceOffsetBindGroup, [_dynamicOffset * ALIGNED_SIZE]);
      _dynamicOffset++;
      gBufferPassEncoder.drawIndexedIndirect(drawIndirectCommandBuffer, incr * (4 * 5));
      incr++;
    });

    gBufferPassEncoder.end();

    const computePassEncoder = commandEnconder.beginComputePass();
    computePassEncoder.setPipeline(computeHoverPipeline);
    device.queue.writeBuffer(mouseCoordsBuffer, 0, Float32Array.of(inputHandler().mouseHover.x, inputHandler().mouseHover.y, inputHandler().mouseClickState.clickReg, inputHandler().mouseClickState.lastClickReg));
    computePassEncoder.setBindGroup(0, computeHoverBindGroup);
    computePassEncoder.dispatchWorkgroups(Math.ceil(1000 / 64));
    computePassEncoder.end();

    const mainPassEncoder = commandEnconder.beginRenderPass(mainPassDescriptor);
    mainPassEncoder.setPipeline(mainPassPipeline);
    mainPassEncoder.setBindGroup(0, mainPassBindgroup);
    mainPassEncoder.draw(3)
    mainPassEncoder.end();

    //This just handles reading the data on JS for testing purposes
    commandEnconder.copyBufferToBuffer(
      computeSelectedIdBuffer,
      0,
      computeSelectedIdStagingBuffer,
      0,
      VEC4_SIZE,
    )

    device.queue.submit([commandEnconder.finish()]);


    //const testBoundingBoxEncoder = device.createCommandEncoder();
    //const testBoundingBoxPass = testBoundingBoxEncoder.beginRenderPass(mainPassDescriptor);
    //testBoundingBoxPass.setPipeline(testBoundingBoxesPipeline);

    device.queue.writeBuffer(gBufferConstantsUniform, 0, cameraMatrix);
    //testBoundingBoxPass.setBindGroup(0, testBoundingBoxesBindGroup);
    //
    ////Test case
    ////device.queue.writeBuffer(computeBindingBoxesOutputBuffer, 0, boundingBoxTestData)
    //
    //testBoundingBoxPass.draw(24, instancesCountLd);
    //testBoundingBoxPass.end();
    //
    //device.queue.submit([testBoundingBoxEncoder.finish()]);

    await computeSelectedIdStagingBuffer.mapAsync(
      GPUMapMode.READ,
      0,
      VEC4_SIZE
    );

    const copyArrayBuffer = computeSelectedIdStagingBuffer.getMappedRange(0, VEC4_SIZE);
    const data = copyArrayBuffer.slice();
    //console.log(new Float32Array(data));
    updateId(new Float32Array(data)[0])
    computeSelectedIdStagingBuffer.unmap();

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

}
