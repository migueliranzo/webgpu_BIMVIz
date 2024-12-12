#### Basic webgpu render current scope

 - Simple shaders for solid color rendering 
   -Working on this currently, lets just propose what three.js does where you can add a color and it will render
   said geo with the color, so It will be saved outside the geometry thats for sure, so we will then create an object that holds the geo and the color -> and it will eventually go from color to material if at all
          -So I have some deffered shading setup working, now I will add a forward pass to complete it and
          add some interaction?
          -Added the interaction!, we got a hover forward pass that picks up from the deffered and it all comes toegether at the end on
          the 'light pass'
 - Mesh load/rendering 
    -We render a cube for now so maybe expand to meshes next? or maybe focus on the BIM SIDE, we have to check this
 - Basic picking -> to select elments 
    -We got hover working so we can build from there the picking
 - Basic camera controls -> Orbit 
    -Orbit camera added but lacking translate feature, can wait


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
