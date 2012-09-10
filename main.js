// REFERENCES:
// http://learningwebgl.com/blog/?page_id=1217
// http://codeflow.org/entries/2010/dec/09/minecraft-like-rendering-experiments-in-opengl-4/
// http://stackoverflow.com/questions/9046643/webgl-create-texture


// OpenGL rendering things!

var gl;

var mvMatrix = mat4.create();  // model-view matrix
var mvMatrixStack = [];
var pMatrix = mat4.create();   // projection matrix

// Game objects

var WORLD = {};
var PLAYER;

var PICKED = null;
var PICKED_FACE = 0;
var PICK_MAX = 8;
var WIREFRAME;

// Map chunk dimensions
var LOGNX = 4;
var LOGNY = 5;
var LOGNZ = 4;
var NX = 1 << LOGNX;
var NY = 1 << LOGNY;
var NZ = 1 << LOGNZ;
var CHUNKR = Math.sqrt(NX * NX + NY * NY);

var RENDER_STAT = new Stat('Render');
var UPDATE_STAT = new Stat('Update');
var FPS_STAT = new Stat('FPS');
FPS_STAT.invert = true;

var lastFrame = 0;
var lastUpdate = 0;

var LIGHT_MAX = 8;
var LIGHT_SUN = 6;
var LIGHT_LAMP = 8;
var LIGHT_MIN = 2;

var TERRAIN_TEXTURE;
var EYE_HEIGHT = 1.6;

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
    geometry: geometryEmpty,
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
    translucent: true,
    geometry: geometryBlock,
  },
  flower: {
    tile: 8,
    geometry: geometryDecalX,
  },
  lamp: {
    tile: 9,
    geometry: geometryDecalX,
    luminosity: LIGHT_LAMP,
  },
};
  
    
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


function getShader(gl, id) {
  var shaderScript = document.getElementById(id);
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
    alert('Could not initialise shaders');
  }
}

Shader.prototype.use = function () {
  gl.useProgram(this.program);
}

Shader.prototype.locate = function(variable) {
  var type = { a: 'Attrib', u: 'Uniform' }[variable[0]];
  this[variable] = gl['get' + type + 'Location'](this.program, variable);
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
        b.light = (y === NY-1) ? LIGHT_SUN : 0;
        b.dirty = true;
      }
    }
  }

  for (var n = 0; n < 4; ++n) {
    var x = this.chunkx + 
      Math.round(Math.abs(noise(this.chunkx, this.chunkz, n)) * NX);
    var z = this.chunkz + 
      Math.round(Math.abs(noise(this.chunkx, this.chunkz, n + 23.4)) * NZ);
    var t = topmost(x, z);
    if (t && t.y < NY-1)
      blockFacing(t, FACE_TOP).type = BLOCK_TYPES.flower;
  }

  this.ndirty = this.blocks.length;
}


Chunk.prototype.generateBuffers = function () {
  var positions = [];
  var textures = [];
  var lighting = [];
  var indices = [];
  for (var i = 0; i < this.blocks.length; ++i) {
    var b = this.blocks[i];
    if (!b.vertices) 
      b.type.geometry(b);
    var pindex = positions.length / 3;
    positions.push.apply(positions, b.vertices.positions);
    lighting.push.apply(lighting, b.vertices.lighting);
    textures.push.apply(textures, b.vertices.textures);
    for (var j = 0; j < b.vertices.indices.length; ++j)
      indices.push(pindex + b.vertices.indices[j]);
  }
  
  this.vertexPositionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexPositionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  this.vertexPositionBuffer.itemSize = 3;
  this.vertexPositionBuffer.numItems = positions.length / 3;

  this.vertexIndexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.vertexIndexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), 
                gl.STATIC_DRAW);
  this.vertexIndexBuffer.itemSize = 1;
  this.vertexIndexBuffer.numItems = indices.length;

  // One ST pair for every XYZ in the position buffer (I think)
  this.vertexTextureCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexTextureCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textures), gl.STATIC_DRAW);
  this.vertexTextureCoordBuffer.itemSize = 2;
  this.vertexTextureCoordBuffer.numItems = textures.length / 2;

  // One RGB triple for each XYZ in the position buffer
  this.vertexLightingBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexLightingBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lighting), gl.STATIC_DRAW);
  this.vertexLightingBuffer.itemSize = 3;
  this.vertexLightingBuffer.numItems = lighting.length / 3;

  this.ndirty = 0;
}


Chunk.prototype.bindBuffers = function () {
  gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexPositionBuffer);
  gl.vertexAttribPointer(SHADER.aVertexPosition,
                         this.vertexPositionBuffer.itemSize,
                         gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexTextureCoordBuffer);
  gl.vertexAttribPointer(SHADER.aTextureCoord,
                         this.vertexTextureCoordBuffer.itemSize,
                         gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexLightingBuffer);
  gl.vertexAttribPointer(SHADER.aLighting,
                         this.vertexLightingBuffer.itemSize,
                         gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.vertexIndexBuffer);
}


Chunk.prototype.render = function () {
  //SHADER.use();
  this.bindBuffers();
  gl.drawElements(gl.TRIANGLES, 
                  this.vertexIndexBuffer.numItems,
                  gl.UNSIGNED_SHORT, 
                  0);
}



Chunk.prototype.update = function () {
  this.visible = hDistance(PLAYER, this.centerPoint()) < PLAYER.viewDistance;
    /* This bit of frustum culling is buggy and very possibly unneccesary
    &&
    -signedHDistanceFromLine(PLAYER, 
                             PLAYER.yaw + PLAYER.horizontalFieldOfView/2,
                             this.centerPoint()) < CHUNKR &&
    signedHDistanceFromLine(PLAYER,
                            PLAYER.yaw - PLAYER.horizontalFieldOfView/2,
                            this.centerPoint()) < CHUNKR;
    */
  if (!this.visible) return;

  this.ndirty = 0;
  
  // This shitty method will propagate changes faster in some
  // directions than others
  var tops = {};
  for (var i = this.blocks.length-1; i >= 0; --i) {  
    // iteration runs from high y's to low
    var c = this.blocks[i];
    var xz = c.x + NX * c.z;
    c.uncovered = (typeof tops[xz] === 'undefined');
    if (c.uncovered && c.type.opaque)
      tops[xz] = c;
    if (c.dirty) {
      c.dirty = false;
      var ns = neighbors(c);
      var light;
      if (c.type.opaque) {
        light = 0;
      } else {
        light = c.type.luminosity || LIGHT_MIN;
        if (c.uncovered && light < LIGHT_SUN)
          light = LIGHT_SUN;
        neighbors(c, function (n) {
          light = Math.max(light, n.light - 1);
        });
      }
      if (c.light != light) {
        c.light = light;
        c.vertices = null;  // force re-geom
        neighbors(c, function (n) { n.invalidate() });
      }
    }
  }
  
  console.log('Update: ', this.chunkx, this.chunkz, ':', this.ndirty);
  this.generateBuffers();
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
  if (!chunk(result.chunkx, result.chunkz))
    result.unloaded = true;

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
  if (!result)
    result = new Chunk(chunkx, chunkz);
  return result;
}


function block(x, y, z) {
  var c = coords(x, y, z);
  if (!c.outofbounds && !c.unloaded) {
    return chunk(c.chunkx, c.chunkz).blocks[c.i];
  } else {
    // Manufacture an ad hoc temporary block
    return new Block(c);
  }
}

function blockFacing(b, face) {
  switch (face) {
  case FACE_FRONT:  return block(b.x, b.y, b.z-1);
  case FACE_BACK:   return block(b.x, b.y, b.z+1);
  case FACE_BOTTOM: return block(b.x, b.y-1, b.z);
  case FACE_TOP:    return block(b.x, b.y+1, b.z);
  case FACE_RIGHT:  return block(b.x-1, b.y, b.z);
  case FACE_LEFT:   return block(b.x+1, b.y, b.z);
  }
}

function neighbors(b, callback) {
  var result = [];
  function chk(dx, dy, dz, axis, sign, face) {
    var n = block(b.x + dx, b.y + dy, b.z + dz);
    result.push(n);
    if (callback) callback(n, axis, sign, face);
  }
  chk( 0, 0,-1, 2, 0, FACE_FRONT);
  chk( 0, 0,+1, 2, 1, FACE_BACK);
  chk( 0,-1, 0, 1, 0, FACE_BOTTOM);
  chk( 0,+1, 0, 1, 1, FACE_TOP);
  chk(-1, 0, 0, 0, 0, FACE_RIGHT);
  chk(+1, 0, 0, 0, 1, FACE_LEFT);
  return result;
}



function drawScene(camera) {
  if (!TERRAIN_TEXTURE.loaded)
    return;  // Wait for texture

  RENDER_STAT.start();

  SHADER.use();

  // Start from scratch
  gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Cull backfaces, which seems to not at all affect speed
  // gl.enable(gl.CULL_FACE);

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

  // Set matrix uniforms
  gl.uniformMatrix4fv(SHADER.uPMatrix,  false,  pMatrix);
  gl.uniformMatrix4fv(SHADER.uMVMatrix, false, mvMatrix);

  for (var i in WORLD)
    if (WORLD[i].visible)
      WORLD[i].render();

  if (PICKED && WIREFRAME) {

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
  if (!WIREFRAME && (PICKED !== waspicked || PICKED_FACE !== wasface)) {
    if (PICKED) PICKED.invalidate();
    if (waspicked) waspicked.invalidate();
  }
  
  var c = coords(PLAYER);
  makeChunk(c.chunkx - NX, c.chunkz);
  makeChunk(c.chunkx + NX, c.chunkz);
  makeChunk(c.chunkx, c.chunkz - NZ);
  makeChunk(c.chunkx, c.chunkz + NZ);
  makeChunk(c.chunkx - NX, c.chunkz - NZ);
  makeChunk(c.chunkx + NX, c.chunkz - NZ);
  makeChunk(c.chunkx - NX, c.chunkz + NZ);
  makeChunk(c.chunkx + NX, c.chunkz + NZ);
  
  for (var i in WORLD)
    if (WORLD[i].ndirty > 0)
      WORLD[i].update();
  
  UPDATE_STAT.end();
}


function processInput(avatar, elapsed) {
  var d = elapsed * 3;  // m/s: walk speed (per axis)
  var a = elapsed * 2;  // radians/s: spin rate
  
  // Movement keys
  if (KEYS.W || KEYS.A || KEYS.S || KEYS.D) {
    var ox = avatar.x, oy = avatar.y, oz = avatar.z;
    var px = d * Math.cos(-avatar.yaw);
    var pz = d * Math.sin(-avatar.yaw);
    if (KEYS.W) { avatar.x -= pz; avatar.z -= px; }
    if (KEYS.A) { avatar.x -= px; avatar.z += pz; }
    if (KEYS.S) { avatar.x += pz; avatar.z += px; }
    if (KEYS.D) { avatar.x += px; avatar.z -= pz; }
    
    // Check collisions
    if (frac(avatar.x) < avatar.radius && 
        (block(ox-1, oy,   oz).type.solid || 
         block(ox-1, oy+1, oz).type.solid)) {
      avatar.x = Math.floor(avatar.x) + avatar.radius;
    } else if (carf(avatar.x) < avatar.radius && 
               (block(ox+1, oy,   oz).type.solid || 
                block(ox+1, oy+1, oz).type.solid)) {
      avatar.x = Math.ceil(avatar.x) - avatar.radius;
    }
    if (frac(avatar.z) < avatar.radius && 
        (block(ox, oy, oz-1).type.solid || 
         block(ox, oy+1, oz-1).type.solid)) {
      avatar.z = Math.floor(avatar.z) + avatar.radius;
    } else if (carf(avatar.z) < avatar.radius && 
               (block(ox, oy, oz+1).type.solid || 
                block(ox, oy+1, oz+1).type.solid)) {
      avatar.z = Math.ceil(avatar.z) - avatar.radius;
    }
  }
  if (avatar.flying && (KEYS[' '] || KEYS.R))
    avatar.y += d;
  if (avatar.flying && (KEYS[16] || KEYS.F))
    avatar.y -= d;
  if (!avatar.flying && !avatar.falling && keyPressed(' ')) {
    avatar.dy = 5.5;
    avatar.falling = true;
    if (block(avatar).type.solid) 
      avatar.y = Math.floor(avatar.y + 1);
  }
  
  // Rotations
  if (KEYS.Q) avatar.yaw -= a;
  if (KEYS.E) avatar.yaw += a;
  if (KEYS.Z) avatar.pitch = Math.max(avatar.pitch - a, -Math.PI/2);
  if (KEYS.X) avatar.pitch = Math.min(avatar.pitch + a,  Math.PI/2);
  if (keyPressed('0')) avatar.yaw = avatar.pitch = 0;
  
  // Toggles
  if (keyPressed('T')) avatar.flying = !avatar.flying;
  if (keyPressed('\t') || keyPressed(27)) {
    avatar.mouselook = !avatar.mouselook;
    document.body.style.cursor = avatar.mouselook ? 'none' : '';
  }
}


function ballistics(entity, elapsed) {
  // Apply the laws of pseudo-physics
  if (!entity.flying) {
    var c = block(entity);
    if (!entity.falling) {
      if (c.type.solid) {
        // Rise from dirt at 3 m/s
        entity.y += 3 * elapsed;
        if (!block(entity).type.solid) {
          entity.y = Math.floor(entity.y);
        }
      } else if (!block(entity.x, 
                        entity.y-1,
                        entity.z).type.solid) {
        // Fall off cliff
        entity.falling = true;
        entity.dy = 0;
      }
    } else { // falling
      if (c.type.solid) {
        // Landed
        entity.dy = 0;
        entity.falling = false;
        entity.y = Math.floor(entity.y + 1);
      } else {
        // Still falling
        entity.dy -= 9.8 * elapsed;
        entity.y += entity.dy * elapsed;
      }
    }
  }
}


function pickp() { 
  return pick(PLAYER.x, 
              PLAYER.y + EYE_HEIGHT, 
              PLAYER.z, 
              PLAYER.pitch, 
              PLAYER.yaw);
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
  var timeNow = +new Date();
  if (!lastFrame) lastFrame = timeNow;
  FPS_STAT.end(lastFrame);
  var elapsed = (timeNow - lastFrame) / 1000;
  if (elapsed > 0.1) elapsed = 0.1;  // Limit lagdeath
  lastFrame = timeNow;

  requestAnimFrame(tick);

  drawScene(PLAYER);

  processInput(PLAYER, elapsed);
  ballistics(PLAYER, elapsed);

  var UPDATE_PERIOD_MS = 100;
  if (timeNow > lastUpdate + UPDATE_PERIOD_MS) {
    updateWorld();
    lastUpdate = timeNow;
  }

  var feedback = 
    RENDER_STAT + '<br>' + 
    FPS_STAT + '<br>' + 
    UPDATE_STAT + '<br>' +
    'Player: ' + PLAYER + '<br>' +
    'Light: ' + block(PLAYER).light;
  if (PICKED)
    feedback += '<br>Picked: ' + PICKED + ' @' + PICKED_FACE;
  document.getElementById('stats').innerHTML = feedback;
}


function handleLoadedTexture(texture) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, 
                gl.UNSIGNED_BYTE, texture.image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.bindTexture(gl.TEXTURE_2D, null);
  texture.loaded = true;
}


function topmost(x, z) {
  for (var y = NY-1; y >= 0; --y) {
    var c = block(x,y,z);
    if (c.type.solid) return c;
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

  this.light = LIGHT_MIN;
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
    else this.type = BLOCK_TYPES.air;

    // Caves
    if (Math.pow(noise(this.x/20, this.y/20, this.z/20), 3) < -0.1)
      this.type = BLOCK_TYPES.air;
  }
}

Block.prototype.invalidate = function () {
  this.dirty = true;
  this.vertices = null;
  if (this.chunk)
    ++this.chunk.ndirty;
}

Block.prototype.toString = function () {
  return '[' + this.x + ',' + this.y + ',' + this.z + ']';
}


function geometryEmpty(b) {
  b.vertices = _EMPTY_GEOMETRY;
}
var _EMPTY_GEOMETRY = {
  positions: [],
  lighting: [],
  textures: [],
  indices: [],
};


function geometryDecalX(b) {
  var v = b.vertices = {};

  var light = Math.max(LIGHT_MIN, Math.min(LIGHT_MAX, b.light||0))
    / LIGHT_MAX;
  if (b.y >= NY-1)
    light = 1;  // Account for topmost block against non-block
  if (!WIREFRAME && b === PICKED)
    light = 2;
  
  var L = 0.2;
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
    v.textures.push(b.type.tile,     15, 
                    b.type.tile + 1, 15, 
                    b.type.tile + 1, 16, 
                    b.type.tile,     16);
  }
  v.lighting = [];
  for (var i = 0; i < v.positions.length; ++i)
    v.lighting.push(light);
}


function geometryBlock(b) {
  var v = b.vertices = {
    positions: [],
    lighting: [],
    textures: [],
    indices: [],
  };
  
  var triplet = [b.x, b.y, b.z];
  function nabe(n, coord, sign, face) {
    if (!n.type.opaque) {
      var pindex = v.positions.length / 3;
      var corners = (face === 1 || face === 2 || face === 5) ?
        [0,0, 1,0, 1,1, 0,1] :
        [0,0, 0,1, 1,1, 1,0];
      var light = Math.max(LIGHT_MIN, Math.min(LIGHT_MAX, n.light||0))
        / LIGHT_MAX;
      if (b.y >= NY-1 && face === FACE_TOP) 
        light = 1;  // Account for topmost block against non-block
      if (!WIREFRAME && (b === PICKED && face === PICKED_FACE))
        light = 2;
      for (var ic = 0; ic < 12; ++ic) {
        var d = triplet[ic % 3];
        if (ic % 3 === coord)
          v.positions.push(d + sign);
        else
          v.positions.push(d + corners.shift());
        v.lighting.push(light);
      }
      
      v.indices.push(pindex, pindex + 1, pindex + 2,
                     pindex, pindex + 2, pindex + 3);
      
      v.textures.push(b.type.tile,     15, 
                      b.type.tile + 1, 15, 
                      b.type.tile + 1, 16, 
                      b.type.tile,     16);
      
    }
  }
  neighbors(b, nabe);
}


function Wireframe() {
  var vertices = [
    0,0,0, 1,0,0, 1,0,1, 0,0,1,  // bottom
    0,1,0, 1,1,0, 1,1,1, 0,1,1]; // top
  var indices = [
    4,5, 5,6, 6,7, 7,4,  // top
    0,1, 1,2, 2,3, 3,0,  // bottom
    0,4, 1,5, 2,6, 3,7]; // sides

  this.aPosBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, this.aPosBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  this.aPosBuffer.itemSize = 3;
  this.aPosBuffer.numItems = vertices.length / 3;

  this.indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), 
                gl.STATIC_DRAW);
  this.indexBuffer.itemSize = 1;
  this.indexBuffer.numItems = indices.length;
}


function Camera(init) {
  init = init || {};
  this.x = init.x || 0;
  this.y = init.y || 0;
  this.z = init.z || 0;
  this.yaw = init.yaw || 0;
  this.pitch = init.pitch || 0;
  this.horizontalFieldOfView = init.horizontalFieldOfView || Math.PI/4;
  this.viewDistance = init.viewDistance || 100;
}

Camera.prototype.toString = function () {
  return '&lt;' + this.x.toFixed(2) + ',' + this.y.toFixed(2) + ',' +
    this.z.toFixed(2) + '&gt &lt;' + this.yaw.toFixed(2) + ',' +
    this.pitch.toFixed(2) + '&gt';
}

function onLoad() {
  var canvas = document.getElementById('canvas');

  makeChunk(0,     0);
  makeChunk(0,   -NZ);
  makeChunk(-NX,   0);
  makeChunk(-NX, -NZ);

  // Create player

  PLAYER = new Camera();

  PLAYER.dy = 0;
  PLAYER.flying = false;
  PLAYER.mouselook = false;
  PLAYER.radius = 0.1;

  var c = topmost(PLAYER.x, PLAYER.z);
  if (c)
    PLAYER.y = c.y + 1;
  else 
    PLAYER.flying = true;

  initGL(canvas);

  SHADER = new Shader('shader');
  SHADER.use();
  SHADER.locate('aVertexPosition');
  gl.enableVertexAttribArray(SHADER.aVertexPosition);
  SHADER.locate('aTextureCoord');
  gl.enableVertexAttribArray(SHADER.aTextureCoord);
  SHADER.locate('aLighting');
  gl.enableVertexAttribArray(SHADER.aLighting);
  SHADER.locate('uSampler');
  SHADER.locate('uMVMatrix');
  SHADER.locate('uPMatrix');

  WIREFRAME = new Wireframe();

  WIREFRAME.shader = new Shader('wireframe');
  WIREFRAME.shader.locate('aPos');
  gl.enableVertexAttribArray(SHADER.aPos);
  WIREFRAME.shader.locate('uMVMatrix');
  WIREFRAME.shader.locate('uPMatrix');

  // Init texture

  TERRAIN_TEXTURE = gl.createTexture();
  TERRAIN_TEXTURE.image = new Image();
  TERRAIN_TEXTURE.image.onload = function() {
    handleLoadedTexture(TERRAIN_TEXTURE)
  }
  TERRAIN_TEXTURE.image.src = 'terrain.png';

  gl.clearColor(130/255, 202/255, 250/255, 1.0);  // Clear color is sky blue
  gl.enable(gl.DEPTH_TEST);                       // Enable Z-buffer

  // The following enable translucent blocks. But I need to render solids first and then semi-transparent ones in reverse-distance-order.
  //gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  //gl.enable(gl.BLEND);
  //gl.disable(gl.DEPTH_TEST);

  //gl.enable(gl.ALPHA_TEST);  // no dice in webgl

  window.addEventListener('keydown', onkeydown, true);
  window.addEventListener('keyup',   onkeyup,   true);
  window.addEventListener('mousemove', onmousemove, true);
  window.addEventListener('mousedown', onmousedown, true);
  document.oncontextmenu = function () { return false };
  /*
  window.addEventListener('mouseout', function (event) {
    event = event || window.event;
    var from = event.relatedTarget || event.toElement;
    console.log(from, from.nodeName);
    if (false && PLAYER.mouselook) {
      PLAYER.mouselook = !PLAYER.mouselook;
      document.body.style.cursor = PLAYER.mouselook ? 'none' : '';
    }});
*/

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
    if (c === 'L' && canvas.requestFullscreen && canvas.requestPointerLock)
      canvas.requestFullscreen();
    
    if (c === 'P' && PICKED) {
      var b = blockFacing(PICKED, PICKED_FACE);
      if (!b.outofbounds) {
        b.type = BLOCK_TYPES.lamp;
        b.invalidate();
      }
    }
  }

}

function onmousemove(event) {
  if (PLAYER.mouselook) {
    if (typeof lastX === 'undefined') {
      lastX = event.pageX;
      lastY = event.pageY;
    }
    var movementX = event.movementX || 
      event.mozMovementX || 
      event.webkitMovementX ||
      (event.pageX - lastX);
    var movementY = event.movementY || 
      event.mozMovementY ||
      event.webkitMovementY ||
      (event.pageY - lastY);
    var spinRate = 0.01;
    PLAYER.yaw += movementX * spinRate;
    PLAYER.pitch += movementY * spinRate;
    PLAYER.pitch = Math.max(Math.min(Math.PI/2, PLAYER.pitch), -Math.PI/2);
    lastX = event.pageX;
    lastY = event.pageY;
  }
}


function onmousedown(event) {
  event = event || window.event;
  if (event.preventDefault) event.preventDefault();
  if (PICKED) {
    if (event.button === 0) {
      PICKED.type = BLOCK_TYPES.air;
      PICKED.invalidate();
      neighbors(PICKED, function (n) { n.invalidate() });
    } else {
      var b = blockFacing(PICKED, PICKED_FACE);
      if (!b.outofbounds) {
        b.type = PICKED.type;
        b.invalidate();
      }
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
  var elapsed = +new Date() - startTime;
  this.value = this.alpha * this.value + (1-this.alpha) * elapsed;
  this.low = elapsed < this.low ? elapsed : 
    this.beta * this.low + (1 - this.beta) * this.value;
  this.high = elapsed > this.high ? elapsed : 
    this.beta * this.high + (1 - this.beta) * this.value;
}

Stat.prototype.toString = function () {
  var v = this.value, l = this.low, h = this.high;
  if (this.invert) {
    v = 1000/v;
    l = 1000/h;
    h = 1000/l;
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
