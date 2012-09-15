// REFERENCES:
// http://learningwebgl.com/blog/?page_id=1217
// http://codeflow.org/entries/2010/dec/09/minecraft-like-rendering-experiments-in-opengl-4/
// http://stackoverflow.com/questions/9046643/webgl-create-texture
// http://www.opengl.org/wiki/Tutorial2:_VAOs,_VBOs,_Vertex_and_Fragment_Shaders_(C_/_SDL)

// TODO: race cars
// TODO: flags
// TODO: tonkatsu
// TODO: rice
// TODO: edamame
// TODO: miso soup

// OpenGL rendering things!

var gl;

var mvMatrix = mat4.create();  // model-view matrix
var mvMatrixStack = [];
var pMatrix = mat4.create();   // projection matrix

// Game objects

var WORLD = {};
var AVATAR;

var PICKED = null;
var PICKED_FACE = 0;
var PICK_MAX = 8;
var WIREFRAME;

var PARTICLES;

// Map chunk dimensions
var LOGNX = 4;
var LOGNY = 5;
var LOGNZ = 4;
var NX = 1 << LOGNX;
var NY = 1 << LOGNY;
var NZ = 1 << LOGNZ;
var CHUNK_RADIUS = Math.sqrt(NX * NX + NZ * NZ);
var UPDATE_PERIOD = 0.1;  // sec

var RENDER_STAT = new Stat('Render');
var UPDATE_STAT = new Stat('Update');
var FPS_STAT = new Stat('FPS');
FPS_STAT.invert = true;

var lastFrame = 0;
var lastUpdate = 0;

var GRAVITY = 23;  // m/s/s
var PARTICLE_GRAVITY = 6.4; // m/s/s
var VJUMP = 7.7;   // m/s

var LIGHT_MAX = 8;
var LIGHT_SUN = 6;
var LIGHT_MIN = 2;

var TERRAIN_TEXTURE;
var EYE_HEIGHT = 1.62;

var KEYS = {};

var lastX, lastY;

var FACE_FRONT = 0;
var FACE_BACK = 1;
var FACE_BOTTOM = 2;
var FACE_TOP = 3;
var FACE_RIGHT = 4;
var FACE_LEFT = 5;


var BLOCK_TYPES = {
  air: {
    tile: 0,
    empty: true,
    opaque: false,
  },
  rock: {
    tile: 1,
    solid: true,
    opaque: true,
    geometry: geometryBlock,
  },
  dirt: {
    tile: 2,
    solid: true,
    opaque: true,
    geometry: geometryBlock,
  },
  grass: {
    tile: 3,
    solid: true,
    opaque: true,
    geometry: geometryBlock,
  },
  flag: {
    tile: 4,
    solid: true,
    opaque: true,
    geometry: geometryBlock,
  },
  testpattern: {
    tile: 5,
    solid: true,
    opaque: true,
    geometry: geometryBlock,
  },
  bedrock: {
    tile:6,
    solid: true,
    opaque: true,
    geometry: geometryBlock,
  },
  ice: {
    tile: 7,
    solid: true,
    translucent: [36,205,205,0.5],
    geometry: geometryBlock,
  },
  flower: {
    tile: 8,
    geometry: geometryDecalX,
    margin: 0.2,
    update: updateResting,
  },
  lamp: {
    tile: 9,
    geometry: geometryDecalX,
    luminosity: 8,
    margin: 0.2,
    update: updateResting,
  },
  candy: {
    tile: 10,
    solid: true,
    opaque: true,
    geometry: geometryBlock,
  },
  jelly: {
    tile: 14,
    liquid: true,
    translucent: [154,40,155,0.85],
    geometry: geometryBlock,
    viscosity: 0.85,
  },
  rope: {
    tile: function () { 
      return [(this.neighbor(FACE_BOTTOM).type === this.type) ? 0 : 1, 2] 
    },
    liquid: true,
    geometry: geometryDecalX,
    update: function updateHanging() {
      var nt = this.neighbor(FACE_TOP).type;
      if (!nt.solid && nt !== this.type)
        this.changeType();
    },
  },
};
var NBLOCKTYPES = 0;
for (var i in BLOCK_TYPES) {
  BLOCK_TYPES[i].index = NBLOCKTYPES++;
  BLOCK_TYPES[i].name = i;
}
for (var i in BLOCK_TYPES)
  BLOCK_TYPES[BLOCK_TYPES[i].index] = BLOCK_TYPES[i];

function updateResting() {
  var nt = this.neighbor(FACE_BOTTOM).type;
  if (!nt.solid)
    this.changeType();
}


function initGL(canvas) {
  var problem = '';
  try {
    gl = canvas.getContext('experimental-webgl') ||
      canvas.getContext('webgl');
    if (gl) {
      gl.viewportWidth = canvas.width;
      gl.viewportHeight = canvas.height;
    }
  } catch (e) {
    problem = e;
  }
  if (!gl) {
    alert('Unable to initialize WebGL...\n' + problem);
  }
}

function $(id) { return document.getElementById(id) }


function getShader(gl, id) {
  var shaderScript = $(id);
  if (!shaderScript) return null;

  var str = '';
  var k = shaderScript.firstChild;
  while (k) {
    if (k.nodeType == 3) {
      str += k.textContent;
    }
    k = k.nextSibling;
  }

  var shader;
  if (shaderScript.type == 'x-shader/x-fragment') {
    shader = gl.createShader(gl.FRAGMENT_SHADER);
  } else if (shaderScript.type == 'x-shader/x-vertex') {
    shader = gl.createShader(gl.VERTEX_SHADER);
  } else {
    return null;
  }

  gl.shaderSource(shader, str);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert(gl.getShaderInfoLog(shader));
    return null;
  }

  return shader;
}


function Shader(shader) {
  var fragmentShader = getShader(gl, shader + '-fs');
  var vertexShader   = getShader(gl, shader + '-vs');

  this.program = gl.createProgram();
  gl.attachShader(this.program, vertexShader);
  gl.attachShader(this.program, fragmentShader);
  gl.linkProgram(this.program);

  if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
    alert('Could not initialize shaders');
  }
}

Shader.prototype.use = function () {
  gl.useProgram(this.program);
}

Shader.prototype.locate = function(variable) {
  var type = { a: 'Attrib', u: 'Uniform' }[variable[0]];
  this[variable] = gl['get' + type + 'Location'](this.program, variable);
  if (type === 'Attrib')
    gl.enableVertexAttribArray(this[variable]);
}



function mvPushMatrix() {
  var copy = mat4.create();
  mat4.set(mvMatrix, copy);
  mvMatrixStack.push(copy);
}

function mvPopMatrix() {
  if (mvMatrixStack.length == 0) {
    throw 'Invalid popMatrix!';
  }
  mvMatrix = mvMatrixStack.pop();
}


function Chunk(x, z) {
  x &= ~(NX - 1);
  z &= ~(NZ - 1);
  this.chunkx = x;
  this.chunkz = z;

  this.blocks = Array(NX * NY * NZ);

  this.lastUpdate = 0;

  WORLD[this.chunkx + ',' + this.chunkz] = this;

  // Generate blocks
  for (var ix = 0; ix < NX; ++ix) {
    var x = ix + this.chunkx;
    for (var y = 0; y < NY; ++y) {
      for (var iz = 0; iz < NZ; ++iz) {
        var z = iz + this.chunkz;
        var c = coords(x, y, z);
        var b = this.blocks[c.i] = new Block(c, this);
        b.generateTerrain();
      }
    }
  }

  // Plant some flowers
  for (var n = 0; n < 4; ++n) {
    var x = this.chunkx + 
      Math.round(Math.abs(noise(this.chunkx, this.chunkz, n)) * NX);
    var z = this.chunkz + 
      Math.round(Math.abs(noise(this.chunkx, this.chunkz, n + 23.4)) * NZ);
    var t = topmost(x, z);
    if (t && t.y < NY-1)
      t.neighbor(FACE_TOP).type = BLOCK_TYPES.flower;
  }

  // Initial quick lighting update, some of which we can know accurately
  this.ndirty = 0;
  for (var x = 0; x < NX; ++x) {
    for (var z = 0; z < NZ; ++z) {
      var unsheltered = true;
      for (var y = NY-1; y >= 0; --y) {
        var c = coords(x, y, z);
        var b = this.blocks[c.i];
        b.light = Math.max(b.type.luminosity || 0,
                           b.opaque ? 0 : unsheltered ? LIGHT_SUN : LIGHT_MIN);
        b.dirty = !unsheltered;
        if (b.dirty) ++this.ndirty;
        unsheltered = unsheltered && !b.opaque;
      }
    }
  }
  // Do a few updates to avoid having to recreate the geometry a bunch of 
  // times when we're updating in bulk
  //for (var i = 0; i < 10 && this.ndirty > 50; ++i)
  //  this.update();
}


Chunk.prototype.generateBuffers = function () {
  var opaques = {}, translucents = {};
  for (var i = 0; i < this.blocks.length; ++i) {
    var b = this.blocks[i];
    if (b.type.geometry) {
      if (!b.vertices) 
        b.type.geometry(b);
      var dest = b.type.translucent ? translucents : opaques;
      if (!dest.indices) {
        dest.aVertexPosition = [];
        dest.aTextureCoord = [];
        dest.aLighting = [];
        dest.indices = [];
      }
      var pindex = dest.aVertexPosition.length / 3;
      dest.aVertexPosition.push.apply(dest.aVertexPosition, 
                                      b.vertices.positions);
      dest.aLighting.push.apply(dest.aLighting, b.vertices.lighting);
      dest.aTextureCoord.push.apply(dest.aTextureCoord, b.vertices.textures);
      for (var j = 0; j < b.vertices.indices.length; ++j)
        dest.indices.push(pindex + b.vertices.indices[j]);
    }
  }
  
  function makebufs(set) {
    if (!set.indices) return null;
    return {
      aVertexPosition: makeBuffer(set.aVertexPosition, 3),
      aTextureCoord:   makeBuffer(set.aTextureCoord, 2),
      aLighting:       makeBuffer(set.aLighting, 3),
      indices:         makeElementArrayBuffer(set.indices)
    };
  }
  this.opaqueBuffers = makebufs(opaques);
  this.translucentBuffers = makebufs(translucents);
}


function pointToAttribute(shader, buffers, attribute) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers[attribute]);
  gl.vertexAttribPointer(shader[attribute],
                         buffers[attribute].itemSize,
                         gl.FLOAT, false, 0, 0);
}


function renderChunkBuffers(buffers) {
  pointToAttribute(SHADER, buffers, 'aVertexPosition');
  pointToAttribute(SHADER, buffers, 'aTextureCoord');
  pointToAttribute(SHADER, buffers, 'aLighting');
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);
  gl.drawElements(gl.TRIANGLES, 
                  buffers.indices.numItems,
                  gl.UNSIGNED_SHORT, 
                  0);
}


Chunk.prototype.updatePeriod = function () {
  return Math.max(UPDATE_PERIOD, 2 * this.hdistance / AVATAR.viewDistance);
}

Chunk.prototype.update = function () {
  this.ndirty = 0;
  this.lastUpdate = AVATAR.clock();
  
  // This shitty method will propagate block updates faster in some
  // directions than others
  var tops = {};
  for (var i = this.blocks.length-1; i >= 0; --i) {  
    // iteration runs from high y's to low
    var c = this.blocks[i];
    var xz = c.x + NX * c.z;
    c.uncovered = !tops[xz];
    if (c.uncovered && c.type.opaque)
      tops[xz] = c;
    if (c.dirty)
      c.update();
  }
}


Chunk.prototype.centerPoint = function () {
  return {x: this.chunkx + NX / 2,
          y: NY / 2,
          z: this.chunkz + NZ / 2};
}


function hDistance(p, q) {
  return Math.sqrt((p.x - q.x) * (p.x - q.x) + 
                   (p.z - q.z) * (p.z - q.z));
}

function signedHDistanceFromLine(a, angle, p) {
  // returns distance from line through point A at given angle to point P
  return (p.z - a.z) * Math.sin(angle) - (p.x - a.x) * Math.cos(angle);
}


function choice(n) {
  if (!n) n = 2;
  return Math.floor(Math.random() * n);
}


function coords(x, y, z) {
  var result;
  if (typeof x === 'object') {
    if (typeof x.x === 'undefined') {
      // assuming array or vector
      result = {
        x: x[0],
        y: x[1],
        z: x[2]
      };
    } else {
      result = {
        x: x.x,
        y: x.y,
        z: x.z
      };
    }
    result.z = Math.floor(result.z);
    result.y = Math.floor(result.y);
    result.x = Math.floor(result.x);
  } else if (typeof y === 'undefined') {
    result = {
      x: x % NX,
      y: (x >> LOGNX) % NY,
      z: (x >> (LOGNX + LOGNY)) % NZ
    }
  } else {
    result = {
      x: Math.floor(x),
      y: Math.floor(y),
      z: Math.floor(z)
    }
  }

  result.chunkx = result.x & ~(NX - 1);
  result.chunkz = result.z & ~(NZ - 1);

  var dx = result.x - result.chunkx;
  var dz = result.z - result.chunkz;
  result.i = dx + (result.y << LOGNX) + (dz << (LOGNX + LOGNY));

  if (result.y < 0 || result.y >= NY)
    result.outofbounds = true;

  return result;
}


function chunk(chunkx, chunkz) {
  chunkx &= ~(NX - 1);
  chunkz &= ~(NZ - 1);
  return WORLD[chunkx + ',' + chunkz];
}


function makeChunk(chunkx, chunkz) {
  chunkx &= ~(NX - 1);
  chunkz &= ~(NZ - 1);
  var result = chunk(chunkx, chunkz);
  if (!result) {
    // New chunk needed
    result = new Chunk(chunkx, chunkz);

    // Invalidate edges of neighboring chunks
    if (chunk(chunkx - NX, chunkz))
      for (var y = 0; y < NY; ++y)
        for (var z = 0; z < NZ; ++z)
          block(chunkx - 1, y, chunkz + z).invalidate();
    if (chunk(chunkx + NX, chunkz))
      for (var y = 0; y < NY; ++y)
        for (var z = 0; z < NZ; ++z)
          block(chunkx + NX, y, chunkz + z).invalidate();
    if (chunk(chunkx, chunkz - NZ))
      for (var y = 0; y < NY; ++y)
        for (var x = 0; x < NX; ++x)
          block(chunkx + x, y, chunkz - 1).invalidate();
    if (chunk(chunkx, chunkz + NZ))
      for (var y = 0; y < NY; ++y)
        for (var x = 0; x < NX; ++x)
          block(chunkx + x, y, chunkz + NZ).invalidate();
  }
  return result;
}


function block(x, y, z) {
  var co = coords(x, y, z);
  if (!co.outofbounds) {
    var ch = chunk(co.chunkx, co.chunkz);
    if (ch) return ch.blocks[co.i];
  }
  // Manufacture an ad hoc temporary block
  return new Block(co);
}

var _DZ = NX * NY;
var _DY = NX;
var _DX = 1;
Block.prototype.neighbor = function (face) {
  switch (face) {
  case FACE_FRONT: 
    return this.z-this.chunk.chunkz > 0 ? 
      this.chunk.blocks[this.i - _DZ] : block(this.x, this.y,this. z-1);
  case FACE_BACK:  
    return this.z-this.chunk.chunkz < NZ-1 ? 
      this.chunk.blocks[this.i + _DZ] : block(this.x, this.y, this.z+1);
  case FACE_BOTTOM:
    return this.y > 0 ? 
      this.chunk.blocks[this.i - _DY] : block(this.x, this.y-1, this.z);
  case FACE_TOP:   
    return this.y < NY-1 ? 
      this.chunk.blocks[this.i + _DY] : block(this.x, this.y+1, this.z);
  case FACE_RIGHT: 
    return this.x-this.chunk.chunkx > 0 ? 
      this.chunk.blocks[this.i - _DX] : block(this.x-1, this.y, this.z);
  case FACE_LEFT:  
    return this.x-this.chunk.chunkx < NX-1 ? 
      this.chunk.blocks[this.i + _DX] : block(this.x+1, this.y, this.z);
  }
}

// Calls back callback(neighbor, face)
Block.prototype.eachNeighbor = function (callback) {
  callback(this.neighbor(FACE_FRONT),  FACE_FRONT);
  callback(this.neighbor(FACE_BACK),   FACE_BACK);
  callback(this.neighbor(FACE_BOTTOM), FACE_BOTTOM);
  callback(this.neighbor(FACE_TOP),    FACE_TOP);
  callback(this.neighbor(FACE_RIGHT),  FACE_RIGHT);
  callback(this.neighbor(FACE_LEFT),   FACE_LEFT);
}



function drawScene(camera) {
  if (!TERRAIN_TEXTURE.loaded)
    return;  // Wait for texture

  RENDER_STAT.start();

  SHADER.use();

  // Start from scratch
  if (AVATAR.y + EYE_HEIGHT >= 0)
    gl.clearColor(0.5, 0.8, 0.98, 0);  // Clear color is sky blue
  else
    gl.clearColor(0,0,0,0);  // Look into the void
  gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
  gl.enable(gl.DEPTH_TEST);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Set up the projection
  var aspectRatio = gl.viewportWidth / gl.viewportHeight;
  mat4.perspective(camera.horizontalFieldOfView / aspectRatio * 180 / Math.PI, 
                   aspectRatio,
                   0.1,                  // near clipping plane
                   camera.viewDistance,  // far clipping plane
                   pMatrix);

  // Position for camera
  mat4.identity(mvMatrix);
  mat4.rotateX(mvMatrix, camera.pitch);
  mat4.rotateY(mvMatrix, camera.yaw);
  mat4.translate(mvMatrix, [-camera.x, -camera.y, -camera.z]);
  mat4.translate(mvMatrix, [0, -EYE_HEIGHT, 0]);

  // Render the world

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, TERRAIN_TEXTURE);
  gl.uniform1i(SHADER.uSampler, 0);

  var headblock = block(AVATAR.x, AVATAR.y + EYE_HEIGHT, AVATAR.z);
  if (headblock.type.translucent) {
    var rgba = headblock.type.translucent;
    $('stats').style.backgroundColor = 'rgba(' + rgba.join(',') + ')';
  } else {
    $('stats').style.backgroundColor = '';
  }
  
  // Set matrix uniforms
  gl.uniformMatrix4fv(SHADER.uPMatrix,  false,  pMatrix);
  gl.uniformMatrix4fv(SHADER.uMVMatrix, false, mvMatrix);
  

  // Render opaque blocks
  gl.disable(gl.CULL_FACE);  // don't cull backfaces (decals are 1-sided)
  for (var i in WORLD) {
    var c = WORLD[i];
    if (c.visible && c.opaqueBuffers)
      renderChunkBuffers(c.opaqueBuffers);
  }

  // Render particles
  PARTICLES.render();

  // Render translucent blocks
  SHADER.use();
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.BLEND);
  gl.enable(gl.CULL_FACE);  // cull backfaces!
  for (var i in WORLD) {
    var c = WORLD[i];
    if (c.visible && c.translucentBuffers)
      renderChunkBuffers(c.translucentBuffers);
  }
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);

  // Render block selection indicator
  if (PICKED) {
    mvPushMatrix();
    mat4.translate(mvMatrix, [PICKED.x, PICKED.y, PICKED.z]);

    WIREFRAME.shader.use();

    gl.lineWidth(2);

    gl.uniformMatrix4fv(WIREFRAME.shader.uPMatrix,  false,  pMatrix);
    gl.uniformMatrix4fv(WIREFRAME.shader.uMVMatrix, false, mvMatrix);

    gl.bindBuffer(gl.ARRAY_BUFFER, WIREFRAME.aPosBuffer);
    gl.vertexAttribPointer(WIREFRAME.shader.aPos,
                           WIREFRAME.aPosBuffer.itemSize,
                           gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, WIREFRAME.indexBuffer);
    gl.drawElements(gl.LINES, 
                    WIREFRAME.indexBuffer.numItems,
                    gl.UNSIGNED_SHORT, 
                    0);

    gl.enable(gl.DEPTH_TEST);
    mvPopMatrix();
  }

  RENDER_STAT.end();
}

quat4.rotateX = function (quat, angle, dest) {
  if (!dest) dest = quat;
  quat4.multiply(quat, [Math.sin(angle/2), 0, 0, Math.cos(angle/2)]);
}
quat4.rotateY = function (quat, angle, dest) {
  if (!dest) dest = quat;
  quat4.multiply(quat, [0, Math.sin(angle/2), 0, Math.cos(angle/2)]);
}


function keyPressed(k) {
  if (KEYS[k] === 1) {
    ++KEYS[k];
    return true;
  }
  return false;
}

function frac(x) { return x - Math.floor(x); }
function carf(x) { return Math.ceil(x) - x; }


function updateWorld() {
  UPDATE_STAT.start();
  var waspicked = PICKED;
  var wasface = PICKED_FACE;
  PICKED = pickp();
  
  var c = coords(AVATAR);
  makeChunk(c.chunkx, c.chunkz);
  makeChunk(c.chunkx - NX, c.chunkz);
  makeChunk(c.chunkx + NX, c.chunkz);
  makeChunk(c.chunkx, c.chunkz - NZ);
  makeChunk(c.chunkx, c.chunkz + NZ);
  makeChunk(c.chunkx - NX, c.chunkz - NZ);
  makeChunk(c.chunkx + NX, c.chunkz - NZ);
  makeChunk(c.chunkx - NX, c.chunkz + NZ);
  makeChunk(c.chunkx + NX, c.chunkz + NZ);
  
  for (var i in WORLD) {
    var c = WORLD[i];
    c.hdistance = Math.max(0, hDistance(AVATAR, c.centerPoint())-CHUNK_RADIUS);
    c.visible = (c.hdistance < AVATAR.viewDistance);
    if (c.ndirty > 0 &&
        AVATAR.clock() > c.lastUpdate + c.updatePeriod()) {
      c.update();
      console.log('Update: ', c.chunkx, c.chunkz, ':', c.ndirty);
      c.generateBuffers();
    }
  }  
  UPDATE_STAT.end();
}


function processInput(avatar, elapsed) {
  var ddp = avatar.ACCELERATION * elapsed;
  avatar.swimming = avatar.falling && block(avatar).type.liquid;
  
  // Drag
  if (!(KEYS.W || KEYS.A || KEYS.S || KEYS.D)) {
    if (avatar.dx > 0) avatar.dx = Math.max(0, avatar.dx - ddp);
    if (avatar.dx < 0) avatar.dx = Math.min(0, avatar.dx + ddp);
    if (avatar.dz > 0) avatar.dz = Math.max(0, avatar.dz - ddp);
    if (avatar.dz < 0) avatar.dz = Math.min(0, avatar.dz + ddp);
  }

  // Movement keys
  var ax = ddp * Math.cos(-avatar.yaw);
  var az = ddp * Math.sin(-avatar.yaw);
  if (KEYS.W) { avatar.dx -= az; avatar.dz -= ax; }
  if (KEYS.A) { avatar.dx -= ax; avatar.dz += az; }
  if (KEYS.S) { avatar.dx += az; avatar.dz += ax; }
  if (KEYS.D) { avatar.dx += ax; avatar.dz -= az; }
  
  if (avatar.flying || avatar.swimming) {
    // Fly up and down
    if (KEYS[' '])
      avatar.dy += ddp;
    else if (KEYS[16]) // shift
      avatar.dy -= ddp;
    else if (avatar.dy > 0) 
      avatar.dy = Math.max(0, avatar.dy - elapsed * avatar.ACCELERATION);
    else
      avatar.dy = Math.min(0, avatar.dy + elapsed * avatar.ACCELERATION);
  }

  // Rotations
  var da = avatar.SPIN_RATE * elapsed;
  if (KEYS.Q) avatar.yaw -= da;
  if (KEYS.E) avatar.yaw += da;
  if (KEYS.Z) avatar.pitch = Math.max(avatar.pitch - da, -Math.PI/2);
  if (KEYS.X) avatar.pitch = Math.min(avatar.pitch + da,  Math.PI/2);

  // Limit speed
  var h = sqr(avatar.dx) + sqr(avatar.dz);
  if (avatar.flying || avatar.swimming) h += sqr(avatar.dy);
  h = Math.sqrt(h);
  
  var vmax = (avatar.flying ? avatar.FLY_MAX : avatar.WALK_MAX) *
    (1 - (block(avatar).type.viscosity||0));
  var f = h / vmax;
  if (f > 1) {
    avatar.dx /= f;
    avatar.dz /= f;
    if (avatar.flying || avatar.swimming) avatar.dy /= f;
  }
}


function toggleMouselook() {
  AVATAR.mouselook = !AVATAR.mouselook;
  document.body.style.cursor = AVATAR.mouselook ? 'none' : '';
  $('warning').style.display = AVATAR.mouselook ? 'none' : '';
  if (!AVATAR.mouselook) lastX = null;
}


function ballistics(e, elapsed) {
  // Apply the laws of pseudo-physics

  if (e.dx || e.dz) {
    // Move and check collisions
    var ox = e.x, oy = e.y, oz = e.z;
    e.x += e.dx * elapsed;
    e.z += e.dz * elapsed;

    function blocked(x,y,z) { 
      for (var i = 0; Math.floor(y + i) < y + e.height; ++i)
        if (block(x, y+i, z).type.solid)
          return true;
      return false;
    }

    // Check NSEW collisions
    if (e.dx < 0 && blocked(e.x - e.radius, e.y, e.z))
      e.x = Math.max(e.x, Math.floor(e.x) + e.radius);
    if (e.dx > 0 && blocked(e.x + e.radius, e.y, e.z))
      e.x = Math.min(e.x, Math.ceil(e.x) - e.radius);
    if (e.dz < 0 && blocked(e.x, e.y, e.z - e.radius))
      e.z = Math.max(e.z, Math.floor(e.z) + e.radius);
    if (e.dz > 0 && blocked(e.x, e.y, e.z + e.radius))
      e.z = Math.min(e.z, Math.ceil(e.z) - e.radius);
    
    // Check corner collisions
    var cw = (e.dx < 0 && frac(e.x) < e.radius);
    var ce = (e.dx > 0 && carf(e.x) > e.radius);
    var cs = (e.dz < 0 && frac(e.z) < e.radius);
    var cn = (e.dz > 0 && carf(e.z) > e.radius);
    if (cw && cs && blocked(e.x - e.radius, e.y, e.z - e.radius)) {
      // sw corner collision
      if (frac(e.x) > frac(e.z))
        e.x = Math.max(e.x, Math.floor(e.x) + e.radius);
      else
        e.z = Math.max(e.z, Math.floor(e.z) + e.radius);
    } else if (cw && cn && blocked(e.x - e.radius, e.y, e.z + e.radius)) {
      // nw corner collision
      if (frac(e.x) > carf(e.z))
        e.x = Math.max(e.x, Math.floor(e.x) + e.radius);
      else
        e.z = Math.min(e.z, Math.ceil(e.z) - e.radius);
    } else if (ce && cn && blocked(e.x + e.radius, e.y, e.z + e.radius)) {
      // ne corner collision
      if (carf(e.x) > carf(e.z))
        e.x = Math.min(e.x, Math.ceil(e.x) - e.radius);
      else
        e.z = Math.min(e.z, Math.ceil(e.z) - e.radius);
    } else if (ce && cs && blocked(e.x + e.radius, e.y, e.z - e.radius)) {
      // se corner collision
      if (carf(e.x) > frac(e.z))
        e.x = Math.min(e.x, Math.ceil(e.x) - e.radius);
      else
        e.z = Math.max(e.z, Math.floor(e.z) + e.radius);
    }
  }

  // Fall
  if (e.falling && !(e.swimming && (KEYS[' '] || KEYS[16])))
    e.dy -= GRAVITY * elapsed;

  e.y += e.dy * elapsed;

  if (block(e).type.solid && (e.flying || e.falling)) {
    // Landed
    e.flying = e.falling = false;
    e.dy = 0;
    e.y = Math.floor(e.y + 1);
  }

  if (!e.falling && !e.flying && !block(e.x, e.y-1, e.z).type.solid) {
    // Fall off cliff
    e.falling = true;
    e.y = Math.floor(e.y) - 0.001;  // be in empty block below
    e.dy = 0;
  }
  
  if ((e.flying || e.falling) &&
      (e.dy > 0 && block(e.x, e.y + e.height, e.z).type.solid)) {
    // Bump head
    e.y = Math.min(e.y, Math.floor(e.y + e.height) - e.height);
    e.dy = 0;
  }
}


function pickp() { 
  return pick(AVATAR.x, 
              AVATAR.y + EYE_HEIGHT, 
              AVATAR.z, 
              AVATAR.pitch, 
              AVATAR.yaw);
}
function pick(x, y, z, pitch, yaw) {
  // Compute length of ray which projects to length 1 on each axis
  var py = -1 / Math.sin(pitch);
  var ph =  1 / Math.cos(pitch);
  var px =  ph / Math.sin(yaw);
  var pz = -ph / Math.cos(yaw);

  var dist = 0;

  function next(w, pw) { 
    return pw * (pw < 0 ? Math.ceil(w-1) - w : Math.floor(w+1) - w);
  }
  
  for (var i = 0; i < 3000; ++i) {
    // check out of bounds
    if (py < 0 ? y < 0 : y > NY + 1)
      break;
    if (dist > PICK_MAX)
      break;
    var b = block(x,y,z);
    if (!b.type.empty) 
      return b;

    var dx = next(x, px);
    var dy = next(y, py);
    var dz = next(z, pz);
    var h = 1.001;
    if (dz < dx && dz < dy) {
      h *= dz;
      PICKED_FACE = pz > 0 ? 0 : 1;
    } else if (dy < dx) {
      h *= dy;
      PICKED_FACE = py > 0 ? 2 : 3;
    } else {
      h *= dx;
      PICKED_FACE = px > 0 ? 4 : 5;
    }
    dist += h;
    x += h / px;
    y += h / py;
    z += h / pz;
  }
  return null;
}


function tick() {
  // Monkey with the clock
  var timeNow = AVATAR.clock();
  if (!lastFrame) lastFrame = timeNow;
  var elapsed = (timeNow - lastFrame) / 1000;
  FPS_STAT.add(elapsed);
  if (elapsed > 0.1) elapsed = 0.1;  // Limit lagdeath
  lastFrame = timeNow;

  requestAnimFrame(tick);

  drawScene(AVATAR);

  processInput(AVATAR, elapsed);
  ballistics(AVATAR, elapsed);

  PARTICLES.tick(elapsed);

  if (timeNow > lastUpdate + UPDATE_PERIOD) {
    updateWorld();
    lastUpdate = timeNow;
  }

  var feedback = 
    RENDER_STAT + '<br>' + 
    FPS_STAT + '<br>' + 
    UPDATE_STAT + '<br>' +
    'Player: ' + AVATAR + '<br>' +
    'Light: ' + block(AVATAR).light;
  if (PICKED) {
    feedback += '<br>Picked: ' + PICKED + ' @' + PICKED_FACE;
    var pf = PICKED.neighbor(PICKED_FACE);
    if (pf) feedback += ' &rarr; ' + pf;
  }
  var keys = '';
  for (var k in KEYS) if (KEYS[k]) keys += ' ' + escape(k);
  if (keys.length > 0) feedback += '<br>Keys: ' + keys;
  $('stats').innerHTML = feedback;
}


function handleLoadedTexture(texture) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  //gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, 
                gl.UNSIGNED_BYTE, texture.image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  // These help not at all with texture atlas bleeding problem
  //gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  //gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  texture.loaded = true;
}


function topmost(x, z) {
  for (var y = NY-1; y >= 0; --y) {
    var b = block(x,y,z);
    if (b.type.solid) return b;
  }
  return null;
}


function Block(coord, chunk) {
  this.x = coord.x;
  this.y = coord.y;
  this.z = coord.z;

  this.i = coord.i;
  this.outofbounds = coord.outofbounds;
  this.chunk = chunk;

  this.light = coord.y >= NY ? LIGHT_SUN : 0;
  this.dirty = true;

  this.type = BLOCK_TYPES.air;
}


Block.prototype.generateTerrain = function () {
  if (this.y == 0) {
    this.type = BLOCK_TYPES.bedrock;
  } else {
    var n = pinkNoise(this.x, this.y, this.z, 32, 2) + 
      (2 * this.y - NY) / NY;
    if (n < -0.2) this.type = BLOCK_TYPES.rock;
    else if (n < -0.1) this.type = BLOCK_TYPES.dirt;
    else if (n < 0) this.type = BLOCK_TYPES.grass;
    else if (this.y < NY / 4) this.type = BLOCK_TYPES.jelly;
    else this.type = BLOCK_TYPES.air;

    if (Math.pow(noise(this.x/10, this.y/10, this.z/10 + 1000), 3) < -0.12)
      this.type = BLOCK_TYPES.candy;

    // Caves
    if (Math.pow(noise(this.x/20, this.y/20, this.z/20), 3) < -0.1)
      this.type = BLOCK_TYPES.air;
  }
}

Block.prototype.invalidate = function (andNeighbors) {
  if (!this.dirty) {
    this.dirty = true;
    this.vertices = null;
    if (this.chunk)
      ++this.chunk.ndirty;
  }
  if (andNeighbors)
    this.eachNeighbor(function (n) { n.invalidate() });
}

Block.prototype.update = function () {
  if (this.type.update)
    this.type.update.apply(this);
  this.dirty = false;
  var light;
  if (this.type.opaque) {
    light = 0;
  } else {
    light = this.type.luminosity || LIGHT_MIN;
    if (this.uncovered && light < LIGHT_SUN)
      light = LIGHT_SUN;
    this.eachNeighbor(function (n) {
      light = Math.max(light, n.light - 1);
    });
  }
  if (this.light != light) {
    this.light = light;
    this.vertices = null;  // force re-geom
    this.eachNeighbor(function (n) { n.invalidate() });
  }
}

Block.prototype.changeType = function (newType) {
  this.type = newType || BLOCK_TYPES.air;
  this.invalidate(true);
  if (this.type === BLOCK_TYPES.air) {
    for (var i = 0; i < 50; ++i) {
      var p = PARTICLES.spawn({
        x0: PICKED.x + 0.5, 
        y0: PICKED.y + 0.5, 
        z0: PICKED.z + 0.5});
      //PARTICLES.bounceParticle(p);
    }
  }
}

Block.prototype.tile = function () {
  var tile = this.type.tile;
  if (typeof tile === 'function')
    tile = tile.apply(this);
  if (typeof tile === 'number') 
    return {s: tile,    t: 0};
  else // assume array
    return {s: tile[0], t:tile[1]};
}

Block.prototype.toString = function () {
  return this.type.name + ' [' + this.x + ',' + this.y + ',' + this.z + '] ' +
    '&#9788;' + this.light + (this.outofbounds ? ' OOB' : '');
}


var ZERO = 0.01, ONE = 1-ZERO;

function geometryDecalX(b) {
  var v = b.vertices = {};

  var light = Math.max(LIGHT_MIN, Math.min(LIGHT_MAX, b.light||0))
    / LIGHT_MAX;
  if (b.y >= NY-1)
    light = 1;  // Account for topmost block against non-block
  
  var L = b.type.margin || 0;
  var R = 1 - L;
  var H = R - L;
  v.positions = [b.x + L,   b.y,     b.z + 0.5,
                 b.x + R,   b.y,     b.z + 0.5,
                 b.x + R,   b.y + H, b.z + 0.5,
                 b.x + L,   b.y + H, b.z + 0.5,
                 b.x + 0.5, b.y,     b.z + L,
                 b.x + 0.5, b.y,     b.z + R,
                 b.x + 0.5, b.y + H, b.z + R,
                 b.x + 0.5, b.y + H, b.z + L];
  v.indices = [0, 1, 2,  0, 2, 3,
               4, 5, 6,  4, 6, 7];
  v.textures = [];
  for (var i = 0; i < 2; ++i) {
    var tile = b.tile();
    v.textures.push(tile.s + ZERO, tile.t + ONE, 
                    tile.s + ONE,  tile.t + ONE, 
                    tile.s + ONE,  tile.t + ZERO, 
                    tile.s + ZERO, tile.t + ZERO);
  }
  v.lighting = [];
  for (var i = 0; i < v.positions.length; ++i)
    v.lighting.push(light);
}


var _FACES = [
  [[0,0,0], [1,0,0], [1,1,0], [0,1,0]],  // front
  [[1,0,1], [0,0,1], [0,1,1], [1,1,1]],  // back
  [[0,0,1], [1,0,1], [1,0,0], [0,0,0]],  // bottom
  [[0,1,0], [1,1,0], [1,1,1], [0,1,1]],  // top
  [[0,0,1], [0,0,0], [0,1,0], [0,1,1]],  // right
  [[1,0,0], [1,0,1], [1,1,1], [1,1,0]]]; // left

function geometryBlock(b) {
  var v = b.vertices = {
    positions: [],
    lighting: [],
    textures: [],
    indices: [],
  };

  for (var face = 0; face < 6; ++face) {
    var n = b.neighbor(face);
    var omit = n.type.opaque;
    // This test isnt reliable until invalidate() invalidates neighbors 
    // of translucents better...I think maybe?
    omit = omit || (b.type.translucent && b.type === n.type);
    if (!omit) {
      // Compute light on this face
      var light = Math.max(LIGHT_MIN, Math.min(1000, n.light||0));
      light /= LIGHT_MAX;

      // Add vertices
      var pindex = v.positions.length / 3;
      var f = _FACES[face];
      for (var i = 3; i >= 0; --i) {
        v.positions.push(b.x + f[i][0], b.y + f[i][1], b.z + f[i][2]);
        // One RGB lighting triple for each XYZ in the position buffer
        v.lighting.push(light, light, light);
      }
      
      // Set textures per vertex: one ST pair for each vertex
      var tile = b.tile();
      v.textures.push(tile.s + ONE,  tile.t + ZERO, 
                      tile.s + ZERO, tile.t + ZERO, 
                      tile.s + ZERO, tile.t + ONE, 
                      tile.s + ONE,  tile.t + ONE);

      // Describe triangles
      v.indices.push(pindex, pindex + 1, pindex + 2,
                     pindex, pindex + 2, pindex + 3);
    }
  }
}


function Wireframe() {
  var vertices = [
    0,0,0, 1,0,0, 1,0,1, 0,0,1,  // bottom
    0,1,0, 1,1,0, 1,1,1, 0,1,1]; // top
  var indices = [
    4,5, 5,6, 6,7, 7,4,  // top
    0,1, 1,2, 2,3, 3,0,  // bottom
    0,4, 1,5, 2,6, 3,7]; // sides

  this.aPosBuffer = makeBuffer(vertices, 3);

  this.indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), 
                gl.STATIC_DRAW);
  this.indexBuffer.itemSize = 1;
  this.indexBuffer.numItems = indices.length;
}


function Entity(init) {
  init = init || {};
  this.x = init.x || 0;
  this.y = init.y || 0;
  this.z = init.z || 0;
  this.dx = this.dy = this.dz = 0;
  this.yaw = init.yaw || 0;
  this.pitch = init.pitch || 0;
  this.horizontalFieldOfView = init.horizontalFieldOfView || Math.PI/3;
  this.viewDistance = init.viewDistance || 50;
  this.birthday = +new Date();
  this.flying = this.falling = false;
  this.radius = 0.3;
  this.height = 1.8;
  this.WALK_MAX = 4.3; // m/s
  this.FLY_MAX = 10.8; // m/s
  this.SPIN_RATE = 2;  // radians/s
  this.ACCELERATION = 20;  // m/s^2
}

Entity.prototype.clock = function () {
  return +new Date() - this.birthday;
}

Entity.prototype.toString = function () {
  var result = '[' + this.x.toFixed(2) + ',' + this.y.toFixed(2) + ',' +
                 this.z.toFixed(2) + '] ';
  result += '&lt;' + this.yaw.toFixed(2) + ',' + this.pitch.toFixed(2) + '&gt';
  result += ' +[' + this.dx.toFixed(2) + ',' + this.dy.toFixed(2) + ',' + 
                this.dz.toFixed(2) + '] ';
  result += (this.flying ? 'F' : this.falling ? 'f' : 'w');
  if (this.swimming) result += 's';
  return result;
}

function onLoad() {
  var canvas = $('canvas');

  makeChunk(0, 0);

  // Create player

  AVATAR = new Entity({x:NX/2 - 0.5, y:NY/2, z:NZ/2 + 0.5});
  AVATAR.mouselook = false;
  AVATAR.lastHop = 0;

  var b = topmost(AVATAR.x, AVATAR.z);
  if (b)
    AVATAR.y = b.y + 1;
  else 
    AVATAR.flying = true;

  initGL(canvas);

  SHADER = new Shader('shader');
  SHADER.use();
  SHADER.locate('aVertexPosition');
  SHADER.locate('aTextureCoord');
  SHADER.locate('aLighting');
  SHADER.locate('uSampler');
  SHADER.locate('uMVMatrix');
  SHADER.locate('uPMatrix');

  WIREFRAME = new Wireframe();

  WIREFRAME.shader = new Shader('wireframe');
  WIREFRAME.shader.locate('aPos');
  WIREFRAME.shader.locate('uMVMatrix');
  WIREFRAME.shader.locate('uPMatrix');

  PARTICLES = new ParticleSystem();

  // Init texture

  TERRAIN_TEXTURE = gl.createTexture();
  TERRAIN_TEXTURE.image = new Image();
  TERRAIN_TEXTURE.image.onload = function() {
    handleLoadedTexture(TERRAIN_TEXTURE)
  }
  TERRAIN_TEXTURE.image.src = 'terrain.png';

  window.addEventListener('keydown', onkeydown, true);
  window.addEventListener('keyup',   onkeyup,   true);
  window.addEventListener('mousemove', onmousemove, true);
  window.addEventListener('mousedown', onmousedown, true);
  document.oncontextmenu = function () { return false };
  window.addEventListener('mouseout', function (event) {
    if (AVATAR.mouselook) {
      event = event || window.event;
      var from = event.relatedTarget || event.toElement;
      if (!from)
        toggleMouselook();
    }
  });
  $('reticule').addEventListener('mousemove', function (event) {
    if (!AVATAR.mouselook) {
      toggleMouselook();
      document.body.focus();  // get focus out of debug tools area
    }
  }, true);

  document.addEventListener('fullscreenchange', fullscreenChange, false);
  document.addEventListener('mozfullscreenchange', fullscreenChange, false);
  document.addEventListener('webkitfullscreenchange', fullscreenChange, false);
  
  document.addEventListener('pointerlockchange', pointerLockChange, false);
  document.addEventListener('mozpointerlockchange', pointerLockChange, false);
  document.addEventListener('webkitpointerlockchange',pointerLockChange,false);
  
  document.addEventListener('pointerlockerror', pointerLockError, false);
  document.addEventListener('mozpointerlockerror', pointerLockError, false);
  document.addEventListener('webkitpointerlockerror', pointerLockError, false);

  canvas.requestFullscreen = 
    canvas.requestFullscreen || 
    canvas.mozRequestFullscreen || 
    canvas.mozRequestFullScreen ||
    canvas.webkitRequestFullscreen;

  canvas.requestPointerLock = 
    canvas.requestPointerLock ||
    canvas.mozRequestPointerLock || 
    canvas.webkitRequestPointerLock;
  
  tick();
}


function onkeyup(event) { onkeydown(event, 0); }

function onkeydown(event, count) {
  event = event || window.event;
  if (event.preventDefault)
    event.preventDefault();

  var k = event.keyCode;
  var c = String.fromCharCode(k).toUpperCase();

  if (typeof count === 'undefined') 
    count = (KEYS[k] || 0) + 1;

  KEYS[k] = KEYS[c] = count;

  if (count === 1) {
    if (c === ' ') {
      if (AVATAR.clock() < AVATAR.lastHop + 500) {
        // Toggle flying
        AVATAR.flying = !AVATAR.flying;
        if (AVATAR.flying) AVATAR.falling = false;
      } else if (!AVATAR.flying && !AVATAR.falling) {
        // Jump!
        AVATAR.dy = VJUMP;
        AVATAR.falling = true;
      }
      AVATAR.lastHop = AVATAR.clock();
    }

    if (c === '0') 
      AVATAR.yaw = AVATAR.pitch = 0;
  
    if (c === '\t' || k === 27) // tab or escape
      toggleMouselook();

    if (c === 'L' && canvas.requestFullscreen && canvas.requestPointerLock)
      canvas.requestFullscreen();
    
    if (c === 'K' && PICKED) {
      for (var i = 0; i < 10; ++i) {
        var f = PICKED.neighbor(PICKED_FACE);
        var p = PARTICLES.spawn({x0: f.x+0.5, y0: f.y+0.5, z0: f.z+0.5});
        PARTICLES.bounceParticle(p);
      }
    }

    if (k === 190 || k === 221 || c === 'I') { // I, right paren/brace/bracket
      var tooli = AVATAR.tool ? (AVATAR.tool.index + 1) % NBLOCKTYPES : 1;
      pickTool(tooli);
    }
    
    if (k === 188 || k === 219) {  // left paren/brace//bracket
      var tooli = AVATAR.tool ? 
        (NBLOCKTYPES + AVATAR.tool.index - 1) % NBLOCKTYPES : NBLOCKTYPES - 1;
      pickTool(tooli);
    }
  }
}

function onmousemove(event) {
  if (AVATAR.mouselook) {
    var movementX, movementY;
    if (typeof lastX === 'undefined' || lastX === null) {
      movementX = movementY = 0;
    } else {
      movementX = event.movementX || 
        event.mozMovementX || 
        event.webkitMovementX ||
        (event.pageX - lastX);
      movementY = event.movementY || 
        event.mozMovementY ||
        event.webkitMovementY ||
        (event.pageY - lastY);
    }
    var spinRate = 0.01;
    AVATAR.yaw += movementX * spinRate;
    AVATAR.pitch += movementY * spinRate;
    AVATAR.pitch = Math.max(Math.min(Math.PI/2, AVATAR.pitch), -Math.PI/2);
    lastX = event.pageX;
    lastY = event.pageY;
  }
}


function onmousedown(event) {
  event = event || window.event;
  if (event.preventDefault) event.preventDefault();
  if (PICKED && AVATAR.mouselook) {
    if (event.button === 0) {
      PICKED.changeType();
    } else {
      var b = PICKED.neighbor(PICKED_FACE);
      if (!b.outofbounds)
        b.changeType(AVATAR.tool || PICKED.type);
    }
  }
  return false;
}


function Stat(name, alpha, beta) {
  this.name = name;
  this.alpha = alpha || 0.95;
  this.beta = beta || 0.99;
  this.low = 0;
  this.high = 0;
  this.value = 0;
  this.places = 1;
}

Stat.prototype.start = function () {
  this.startTime = +new Date();
}

Stat.prototype.end = function (startTime) {
  if (typeof startTime === 'undefined') startTime = this.startTime;
  this.add(+new Date() - startTime);
}

Stat.prototype.add = function (value) {
  this.value = this.alpha * this.value + (1-this.alpha) * value;
  this.low = value < this.low ? value : 
    this.beta * this.low + (1 - this.beta) * this.value;
  this.high = value > this.high ? value : 
    this.beta * this.high + (1 - this.beta) * this.value;
}

Stat.prototype.toString = function () {
  var v = this.value, l = this.low, h = this.high;
  if (this.invert) {
    v = 1/v;
    l = 1/h;
    h = 1/l;
  }
  return this.name + ': ' + v.toFixed(this.places) +  
    ' (' + l.toFixed(this.places) + ' ' + h.toFixed(this.places) + ')';
}

function fullscreenChange() {
  if ((document.webkitFullscreenElement || 
       document.mozFullscreenElement ||
       document.mozFullScreenElement) === canvas) {
    // Element is fullscreen, now we can request pointer lock
    canvas.requestPointerLock();
  }
}


function pointerLockChange() {
  if ((document.mozPointerLockElement ||
       document.webkitPointerLockElement) === canvas) {
    console.log("Pointer Lock was successful.");
  } else {
    console.log("Pointer Lock was lost.");
  }
}


function pointerLockError() {
  console.log("Error while locking pointer.");
}

function tweak() { return (Math.random() - 0.5) }

ParticleSystem.prototype.spawn = function (init) {
  var rewind = Math.random();
  var p = {
    dx: 2 * tweak(),
    dy: 0.5 + 3 * Math.random(),
    dz: 2 * tweak(),
    x0: 0,
    y0: 0,
    z0: 0,
    id: PARTICLES.nextID++,
    birthday: AVATAR.clock()/1000 - rewind,
    life: rewind + 0.5 + Math.random() / 2,
  };
  for (var i in p)
    if (typeof init[i] !== 'undefined')
      p[i] = init[i];
  this.add(p);
  return p;
}

function ParticleSystem() {
  this.nextID = 1;
  this.particles = {};
  this.shader = new Shader('particle');
  this.shader.locate('aInitialPos');
  this.shader.locate('aVelocity');
  this.shader.locate('aBirthday');
  this.shader.locate('uClock');
  this.shader.locate('uGravity');
  this.shader.locate('uMVMatrix');
  this.shader.locate('uPMatrix');
}

ParticleSystem.prototype.add = function (p) {
  this.particles[p.id] = p;
  delete this.buffers;
}

ParticleSystem.prototype.remove = function (p) {
  delete this.particles[p.id];
  delete this.buffers;
}

ParticleSystem.prototype.tick = function (elapsed) {
  for (var i in this.particles) {
    var p = this.particles[i];
    p.life -= elapsed;
    if (p.life < 0)
      PARTICLES.remove(p);
  }
}

ParticleSystem.prototype.bounceParticle = function (p) {
  // Collide with whatever face will get hit first
  var tx = ((p.dx > 0) ? carf(p.x0) : frac(p.x0)) / p.dx;
  var tz = ((p.dz > 0) ? carf(p.z0) : frac(p.z0)) / p.dz;
  var ty = p.dy + Math.sqrt(p.dy * p.dy + 2 * PARTICLE_GRAVITY * frac(p.y0)) / 
    2 * PARTICLE_GRAVITY;
  var t = Math.min(tx, ty, tz);
  if (t < p.life) {
    var np = this.spawn({
      x0: p.x0 + t * p.dx,
      y0: p.y0 + t * p.dy - 0.5 * PARTICLE_GRAVITY * t * t,
      z0: p.z0 + t * p.dz,
      dy: p.dy - PARTICLE_GRAVITY * t,
      life: p.life - t,
      birthday: p.birthday + t});
    p.life -= t;
    var DAMPING = 0.5;
    if (t === tx)
      np.dx *= -DAMPING;
    else if (t === tz)
      np.dz *= -DAMPING;
    else
      np.dy *= -DAMPING;
    return np;
  }
}

function makeBuffer(data, itemsize) {
  var buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  buffer.itemSize = itemsize;
  buffer.numItems = data.length / itemsize;
  return buffer;
}

function makeElementArrayBuffer(data) {
  var buffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data), 
                gl.STATIC_DRAW);
  buffer.itemSize = 1;
  buffer.numItems = data.length;
  return buffer;
}

ParticleSystem.prototype.render = function () {

  this.shader.use();

  if (!this.buffers) {
    var aInitialPos = [];
    var aVelocity = [];
    var aBirthday = [];
    for (var i in this.particles) {
      var p = this.particles[i];
      aInitialPos.push(p.x0, p.y0, p.z0);
      aVelocity.push(p.dx, p.dy, p.dz);
      aBirthday.push(p.birthday);
    }
    this.buffers = {};
    this.buffers.aInitialPos = makeBuffer(aInitialPos, 3);
    this.buffers.aVelocity = makeBuffer(aVelocity, 3);
    this.buffers.aBirthday = makeBuffer(aBirthday, 1);
  }

  gl.uniform1f(this.shader.uClock, parseFloat(AVATAR.clock()/1000));
  gl.uniform1f(this.shader.uGravity, PARTICLE_GRAVITY);
  gl.uniformMatrix4fv(this.shader.uPMatrix,  false,  pMatrix);
  gl.uniformMatrix4fv(this.shader.uMVMatrix, false, mvMatrix);

  gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.aInitialPos);
  gl.vertexAttribPointer(this.shader.aInitialPos,
                         this.buffers.aInitialPos.itemSize,
                         gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.aVelocity);
  gl.vertexAttribPointer(this.shader.aVelocity,
                         this.buffers.aVelocity.itemSize,
                         gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.aBirthday);
  gl.vertexAttribPointer(this.shader.aBirthday,
                         this.buffers.aBirthday.itemSize,
                         gl.FLOAT, false, 0, 0);
 
  gl.drawArrays(gl.POINTS, 0, this.buffers.aInitialPos.numItems);
}


function pickTool(blocktype) {
  if (typeof blocktype !== 'object') 
    blocktype = BLOCK_TYPES[blocktype];
  if (blocktype === BLOCK_TYPES.air)
    blocktype = null;
  AVATAR.tool = blocktype;
  $('toolname').innerText = blocktype ? blocktype.name : '';
  var toolcan = $('tool');
  var ctx = toolcan.getContext('2d');
  ctx.clearRect(0, 0, toolcan.width, toolcan.height);
  if (blocktype) {
    var sample = new Block({x:0,y:-1000,z:0});
    sample.type = blocktype;
    var tile = sample.tile();
    ctx.drawImage($('terrain'), 
                  16 * tile.s, 16 * tile.t,  16, 16,
                  0, 0,                      toolcan.width, toolcan.height);
  }
}


function sqr(x) { return x * x }

