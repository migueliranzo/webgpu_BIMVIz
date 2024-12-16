#### Basic webgpu render current scope

 - Rendering of BIM models through IFC files
 - Basic picking -> to select elments 
    -We got hover working so we can build from there the picking
 - Basic camera controls -> Orbit 
    -Orbit camera added but lacking translate feature, can wait

## Current arquitecture notes
 - We have went for a g pass -> compute for effects and state -> main render pass
   The main idea behind it is we dont really benefit from separating the effects outside the main final render pass
   since we have per object state so we dont really need to depend on anything else for state applied effects, plus having
   multiple ifs doesnt relly affect perf as bad since close geometries share similar behaviour so gpu branch prediction should
   help a bit make it cheaper 


IMPORTANT THING ABOUT THE PROJECT AND DIFFERENTATION
The cool thing we could do is use compute shaders to deal with some BIM stuff since previously made
BIM visizualers on the web using webgl simply couldnt use compute shaders, so since we use webgpu 
and compute shaders are available we could try to use that to not only create a cool BIM viz but
actually do something better than already existing software. Just leaving this here...

### SHOULD I COPY OR RAW IMPLEMENT X FEATURE?

# How domain-specific is this component to BIM/3D visualization?

-High (like BIM file parsing): Build from scratch to gain deep understanding
-Low (like drag events): Okay to use existing implementations


# How likely am I to need to customize this in future work?

-High (like specialized BIM data structures): Build from scratch
-Low (like basic orbit controls): Use existing code with good understanding


# What's the learning-time-to-value ratio?

-High value per time spent (like understanding BIM format): Do it manually
-Low value per time spent (like reimplementing standard UI patterns): Use existing solutions
