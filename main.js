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

var WORLD;
var PLAYER;
var PICKED = {};
var PICKED_FACE = 0;

var RENDERTIME = 0;
var FRAMETIME = 0;

var lastFrame = 0;
var lastUpdate = 0;

var LIGHT_MAX = 8;
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

function initGL(canvas) {
  try {
    gl = canvas.getContext("experimental-webgl");
    gl.data = {};  // holds variables
    gl.viewportWidth = canvas.width;
    gl.viewportHeight = canvas.height;
  } catch (e) {
  }
  if (!gl) {
    alert("Could not initialise WebGL, sorry...");
  }
}


function getShader(gl, id) {
  var shaderScript = document.getElementById(id);
  if (!shaderScript) return null;

  var str = "";
  var k = shaderScript.firstChild;
  while (k) {
    if (k.nodeType == 3) {
      str += k.textContent;
    }
    k = k.nextSibling;
  }

  var shader;
  if (shaderScript.type == "x-shader/x-fragment") {
    shader = gl.createShader(gl.FRAGMENT_SHADER);
  } else if (shaderScript.type == "x-shader/x-vertex") {
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


function initShaders() {
  var fragmentShader = getShader(gl, "shader-fs");
  var vertexShader   = getShader(gl, "shader-vs");

  gl.data.shaderProgram = gl.createProgram();
  gl.attachShader(gl.data.shaderProgram, vertexShader);
  gl.attachShader(gl.data.shaderProgram, fragmentShader);
  gl.linkProgram(gl.data.shaderProgram);

  if (!gl.getProgramParameter(gl.data.shaderProgram, gl.LINK_STATUS)) {
    alert("Could not initialise shaders");
  }

  gl.useProgram(gl.data.shaderProgram);

  function locate(variable) {
    var type = { a: 'Attrib', u: 'Uniform' }[variable[0]];
    gl.data[variable] = gl['get' + type + 'Location'](gl.data.shaderProgram, variable);
  }
  locate('aVertexPosition');
  gl.enableVertexAttribArray(gl.data.aVertexPosition);
  locate('aTextureCoord');
  gl.enableVertexAttribArray(gl.data.aTextureCoord);
  locate('aLighting');
  gl.enableVertexAttribArray(gl.data.aLighting);
  locate('uSampler');
  locate('uMVMatrix');
  locate('uPMatrix');
}



function mvPushMatrix() {
  var copy = mat4.create();
  mat4.set(mvMatrix, copy);
  mvMatrixStack.push(copy);
}

function mvPopMatrix() {
  if (mvMatrixStack.length == 0) {
    throw "Invalid popMatrix!";
  }
  mvMatrix = mvMatrixStack.pop();
}


function chunkToBuffers() {
  var vertices = [];
  var textures = [];
  var indices = [];
  var lighting = [];
  for (var x = 0; x < WORLD.NX; ++x) {
    for (var z = 0; z < WORLD.NZ; ++z) {
      for (var y = WORLD.NY-1; y >= 0; --y) {
        var triplet = [x,y,z];
        var c = block(x,y,z); 
        if (c.tile) {
          function nabe(n, coord, sign, face) {
            if (!n.tile) {
              var vindex = vertices.length / 3;
              var corners = [-1,-1, +1,-1, +1,+1, -1,+1];
              var light = Math.max(LIGHT_MIN, Math.min(LIGHT_MAX, n.light||0))
                / LIGHT_MAX;
              if (c.y >= WORLD.NY-1 && face === FACE_TOP) 
                light = 1;  // Account for topmost block against non-block
              if (c === PICKED && face === PICKED_FACE) 
                light = 2;
              for (var ic = 0; ic < 12; ++ic) {
                var d = triplet[ic % 3];
                if (ic % 3 === coord)
                  vertices.push(d + sign/2);
                else
                  vertices.push(d + corners.shift() * sign / 2);
                lighting.push(light);
              }
              
              indices.push(vindex, vindex + 1, vindex + 2,
                           vindex, vindex + 2, vindex + 3);

              textures.push(c.tile,     15, 
                            c.tile + 1, 15, 
                            c.tile + 1, 16, 
                            c.tile,     16);
            }
          }
          neighbors(c, nabe);
        }
      }
    }
  }

  WORLD.vertexPositionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, WORLD.vertexPositionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  WORLD.vertexPositionBuffer.itemSize = 3;
  WORLD.vertexPositionBuffer.numItems = vertices.length / 3;

  WORLD.vertexIndexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, WORLD.vertexIndexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), 
                gl.STATIC_DRAW);
  WORLD.vertexIndexBuffer.itemSize = 1;
  WORLD.vertexIndexBuffer.numItems = indices.length;

  WORLD.vertexTextureCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, WORLD.vertexTextureCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textures), gl.STATIC_DRAW);
  WORLD.vertexTextureCoordBuffer.itemSize = 2;
  WORLD.vertexTextureCoordBuffer.numItems = textures.length / 2;

  WORLD.vertexLightingBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, WORLD.vertexLightingBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lighting), gl.STATIC_DRAW);
  WORLD.vertexLightingBuffer.itemSize = 3;
  WORLD.vertexLightingBuffer.numItems = lighting.length / 3;
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
      x: x % WORLD.NX,
      y: (x >> WORLD.LOGNX) % WORLD.NY,
      z: (x >> (WORLD.LOGNX + WORLD.LOGNY)) % WORLD.NZ
    }
  } else {
    result = {
      x: Math.floor(x),
      y: Math.floor(y),
      z: Math.floor(z)
    }
  }
  if (result.x < 0 || result.x >= WORLD.NX || 
      result.y < 0 || result.y >= WORLD.NY || 
      result.z < 0 || result.z >= WORLD.NZ)
    result.outofbounds = true;
  else
    result.i = result.x + result.y * WORLD.NX + result.z * WORLD.NX * WORLD.NY;
  return result;
}

function block(x, y, z) {
  var c = coords(x, y, z);
  if (!c.outofbounds) {
    return WORLD.map[c.i];
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
  chk( 0, 0,-1, 2, -1, FACE_FRONT);
  chk( 0, 0,+1, 2, +1, FACE_BACK);
  chk( 0,-1, 0, 1, -1, FACE_BOTTOM);
  chk( 0,+1, 0, 1, +1, FACE_TOP);
  chk(-1, 0, 0, 0, -1, FACE_RIGHT);
  chk(+1, 0, 0, 0, +1, FACE_LEFT);
  return result;
}



function drawScene() {
  if (!TERRAIN_TEXTURE.loaded)
    return;  // Wait for texture

  var atstart = +new Date();

  // Start from scratch
  gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Cull backfaces, which seems to not at all affect speed
  // gl.enable(gl.CULL_FACE);

  // Set up the projection
  mat4.perspective(45, gl.viewportWidth / gl.viewportHeight, 0.1, 100.0,
                   pMatrix);

  // Position for player
  mat4.identity(mvMatrix);
  mat4.rotateX(mvMatrix, PLAYER.pitch);
  mat4.rotateY(mvMatrix, PLAYER.yaw);
  mat4.translate(mvMatrix, [-PLAYER.x, -PLAYER.y, -PLAYER.z]);
  mat4.translate(mvMatrix, [0.5, 0.5 - EYE_HEIGHT, 0.5]);

  // Render the world

  gl.bindBuffer(gl.ARRAY_BUFFER, WORLD.vertexPositionBuffer);
  gl.vertexAttribPointer(gl.data.aVertexPosition,
                         WORLD.vertexPositionBuffer.itemSize,
                         gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, WORLD.vertexTextureCoordBuffer);
  gl.vertexAttribPointer(gl.data.aTextureCoord,
                         WORLD.vertexTextureCoordBuffer.itemSize,
                         gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, WORLD.vertexLightingBuffer);
  gl.vertexAttribPointer(gl.data.aLighting,
                         WORLD.vertexLightingBuffer.itemSize,
                         gl.FLOAT, false, 0, 0);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, TERRAIN_TEXTURE);
  gl.uniform1i(gl.data.uSampler, 0);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, WORLD.vertexIndexBuffer);

  // Set matrix uniforms
  gl.uniformMatrix4fv(gl.data.uPMatrix,  false,  pMatrix);
  gl.uniformMatrix4fv(gl.data.uMVMatrix, false, mvMatrix);

  gl.drawElements(gl.TRIANGLES, WORLD.vertexIndexBuffer.numItems,
                  gl.UNSIGNED_SHORT, 0);

  var alpha = 0.9;
  RENDERTIME = RENDERTIME * alpha + (1-alpha) * (+new Date() - atstart);
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

function animate() {
  var timeNow = +new Date();
  if (lastFrame) {
    var elapsed = timeNow - lastFrame;
    var alpha = 0.9;
    FRAMETIME = FRAMETIME * alpha + (1-alpha) * elapsed;

    var d = elapsed * .003;
    var a = elapsed * .002;
    var m = mat4.create();

    // Movement keys
    if (KEYS.W || KEYS.A || KEYS.S || KEYS.D) {
      var ox = PLAYER.x, oy = PLAYER.y, oz = PLAYER.z;
      var px = d * Math.cos(-PLAYER.yaw);
      var pz = d * Math.sin(-PLAYER.yaw);
      if (KEYS.W) { PLAYER.x -= pz; PLAYER.z -= px; }
      if (KEYS.A) { PLAYER.x -= px; PLAYER.z += pz; }
      if (KEYS.S) { PLAYER.x += pz; PLAYER.z += px; }
      if (KEYS.D) { PLAYER.x += px; PLAYER.z -= pz; }

      // Check collisions
      if (frac(PLAYER.x) < PLAYER.radius && 
          (block(ox-1, oy,   oz).tile || block(ox-1, oy+1, oz).tile)) {
        PLAYER.x = Math.floor(PLAYER.x) + PLAYER.radius;
      } else if (carf(PLAYER.x) < PLAYER.radius && 
                 (block(ox+1, oy,   oz).tile || block(ox+1, oy+1, oz).tile)) {
        PLAYER.x = Math.ceil(PLAYER.x) - PLAYER.radius;
      }
      if (frac(PLAYER.z) < PLAYER.radius && 
          (block(ox, oy, oz-1).tile || block(ox, oy+1, oz-1).tile)) {
        PLAYER.z = Math.floor(PLAYER.z) + PLAYER.radius;
      } else if (carf(PLAYER.z) < PLAYER.radius && 
                 (block(ox, oy, oz+1).tile || block(ox, oy+1, oz+1).tile)) {
        PLAYER.z = Math.ceil(PLAYER.z) - PLAYER.radius;
      }
    }
    if (PLAYER.flying && (KEYS[' '] || KEYS.R))
      PLAYER.y += d;
    if (PLAYER.flying && (KEYS[16] || KEYS.F))
      PLAYER.y -= d;
    if (!PLAYER.flying && !PLAYER.falling && keyPressed(' ')) {
      PLAYER.dy = 5.5;
      PLAYER.falling = true;
      if (block(PLAYER).tile) 
        PLAYER.y = Math.floor(PLAYER.y + 1);
    }

    // Rotations
    if (KEYS.Q) PLAYER.yaw -= a;
    if (KEYS.E) PLAYER.yaw += a;
    if (KEYS.Z) PLAYER.pitch = Math.max(PLAYER.pitch - a, -Math.PI/2);
    if (KEYS.X) PLAYER.pitch = Math.min(PLAYER.pitch + a,  Math.PI/2);
    if (keyPressed('0')) PLAYER.yaw = PLAYER.pitch = 0;

    // Toggles
    if (keyPressed('T')) PLAYER.flying = !PLAYER.flying;
    if (keyPressed('\t') || keyPressed(27)) {
      PLAYER.mouselook = !PLAYER.mouselook;
      document.body.style.cursor = PLAYER.mouselook ? 'none' : '';
    }

    // Physics
    if (!PLAYER.flying) {
      var c = block(PLAYER);
      if (!PLAYER.falling) {
        if (c.tile) {
          // Rise from dirt
          PLAYER.y += d;
          if (!block(PLAYER).tile) {
            PLAYER.y = Math.floor(PLAYER.y);
          }
        } else if (!block(PLAYER.x, 
                          PLAYER.y-1,
                          PLAYER.z).tile) {
          // Fall off cliff
          PLAYER.falling = true;
          PLAYER.dy = 0;
        }
      } else { // falling
        if (c.tile) {
          // Landed
          PLAYER.dy = 0;
          PLAYER.falling = false;
          PLAYER.y = Math.floor(PLAYER.y + 1);
        } else {
          // Still falling
          PLAYER.dy -= 9.8 * elapsed / 1000;
          PLAYER.y += PLAYER.dy * elapsed / 1000;
        }
      }
    }
  }
  lastFrame = timeNow;

  var UPDATE_PERIOD_MS = 100;
  if (timeNow > lastUpdate + UPDATE_PERIOD_MS) {
    // This shitty method will propagate changes faster in some
    // directions than others
    var dirty = 0;

    var waspicked = PICKED;
    var wasface = PICKED_FACE;
    PICKED = pickp() || {};
    if (PICKED !== waspicked || PICKED_FACE !== wasface)
      ++dirty;

    for (var x = 0; x < WORLD.NX; ++x) {
      for (var z = 0; z < WORLD.NZ; ++z) {
        var top = true;
        for (var y = WORLD.NY-1; y >= 0; --y) {
          var c = block(x,y,z);
          top = top && !c.tile;

          if (c.dirty) {
            ++dirty;
            c.dirty = false;
            var ns = neighbors(c);
            var light;
            if (top) {
              light = LIGHT_MAX;
            } else {
              light = LIGHT_MIN;
              for (var i = 0; i < ns.length; ++i) {
                if (!ns[i].tile)
                  light = Math.max(light, ns[i].light - 1);
              }
            }
            if (c.light != light) {
              c.light = light;
              for (var i = 0; i < ns.length; ++i) 
                if (ns[i].light < light-1)
                  ns[i].dirty = true;
            }
          }
        }
      }
    }
    lastUpdate = timeNow;
    if (dirty) {
      console.log('Update ', dirty);
      chunkToBuffers();
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
  var ph = 1 / Math.cos(pitch);
  var px = ph / Math.sin(yaw);
  var pz = -ph / Math.cos(yaw);

  function next(w, pw) { 
    return pw * (pw < 0 ? Math.ceil(w-1) - w : Math.floor(w+1) - w);
  }
  
  for (var i = 0; i < 3000; ++i) {
    // check out of bounds
    if ((px < 0 ? x < 0 : x > WORLD.NX + 1) ||
        (py < 0 ? y < 0 : y > WORLD.NY + 1) ||
        (pz < 0 ? z < 0 : z > WORLD.NZ + 1)) {
      break;
    }
    var b = block(x,y,z);
    if (b.tile) 
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
    x += h / px;
    y += h / py;
    z += h / pz;
  }
  return null;
}


function tick() {
  requestAnimFrame(tick);
  drawScene();
  animate();

  var feedback = 
    //'Render: ' + RENDERTIME.toFixed(2) + 'ms<br>' +
    '' + (1000/FRAMETIME).toFixed(2) + ' FPS<br>Player: ' +
    '&lt;' + PLAYER.x.toFixed(2) + ' ' + PLAYER.y.toFixed(2) + ' ' +
    PLAYER.z.toFixed(2) + '&gt &lt;' + PLAYER.yaw.toFixed(2) + ' ' +
    PLAYER.pitch.toFixed(2) + '&gt';
  if (PICKED && PICKED.tile)
    feedback += '<br>' + 'Picked: ' + PICKED + ' @' + PICKED_FACE;
  document.getElementById('stats').innerHTML = feedback;
}


function handleLoadedTexture(texture) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture.image);
    //gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, texture.image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.bindTexture(gl.TEXTURE_2D, null);
  texture.loaded = true;
}


function topmost(x, z) {
  for (var y = WORLD.NY-1; y >= 0; --y) {
    var c = block(x,y,z);
    if (c.tile) return c;
  }
  return null;
}


function Block(coord) {
  this.x = coord.x;
  this.y = coord.y;
  this.z = coord.z;

  this.i = coord.i;
  this.outofbounds = coord.outofbounds;

  this.light = LIGHT_MIN;
  this.dirty = true;
}

Block.prototype.generateTerrain = function () {
  if (this.y == 0) {
    this.tile = 6;
  } else {
    var n = pinkNoise(this.x, this.y, this.z, 32, 2) + 
      (2 * this.y - WORLD.NY) / WORLD.NY;
    if (n < 0) this.tile = 3;
    if (n < -0.1) this.tile = 2;
    if (n < -0.2) this.tile = 1;
  
    // Caves
    if (Math.pow(noise(this.x/20, this.y/20, this.z/20), 3) < -0.1)
      this.tile = 0;
  }
}

Block.prototype.toString = function () {
  return '[' + this.x + ' ' + this.y + ' ' + this.z + ']';
}


function onLoad() {
  var canvas = document.getElementById("canvas");

  // Create world map
  WORLD = {
    LOGNX: 4,
    LOGNY: 4,
    LOGNZ: 4,
  }
  WORLD.NX = 1 << WORLD.LOGNX;
  WORLD.NY = 1 << WORLD.LOGNY;
  WORLD.NZ = 1 << WORLD.LOGNZ;
  WORLD.NNN = WORLD.NX * WORLD.NY * WORLD.NZ;
  WORLD.map = Array(WORLD.NNN);
  // Fill the map with terrain
  for (var x = 0; x < WORLD.NX; ++x) {
    for (var y = 0; y < WORLD.NY; ++y) {
      for (var z = 0; z < WORLD.NZ; ++z) {
        var c = coords(x, y, z);
        WORLD.map[c.i] = new Block(c);
        WORLD.map[c.i].generateTerrain();
      }
    }
  }
  // Initialize lighting
  for (var x = 0; x < WORLD.NX; ++x) {
    for (var z = 0; z < WORLD.NZ; ++z) {
      block(x, WORLD.NY-1, z).light = LIGHT_MAX;
      for (var y = WORLD.NY-2; y >= 0; --y) {
        var c = block(x,y,z);
        c.light = 0;
        c.dirty = true;
      }
    }
  }

  // Create player

  PLAYER = {
    x: WORLD.NX/2, 
    y: WORLD.NY/2, 
    z: WORLD.NZ/2,
    dy: 0,
    yaw: 0,
    pitch: 0,
    flying: false,
    mouselook: false,
    radius: 0.1,
  };
  var c = topmost(PLAYER.x, PLAYER.z);
  if (c)
    PLAYER.y = c.y + 1;
  else 
    PLAYER.flying = true;

  initGL(canvas);
  initShaders();
  chunkToBuffers();

  // Init texture

  TERRAIN_TEXTURE = gl.createTexture();
  TERRAIN_TEXTURE.image = new Image();
  TERRAIN_TEXTURE.image.onload = function() {
    handleLoadedTexture(TERRAIN_TEXTURE)
  }
  TERRAIN_TEXTURE.image.src = "terrain.png";

  gl.clearColor(130/255, 202/255, 250/255, 1.0);  // Clear color is sky blue
  gl.enable(gl.DEPTH_TEST);                       // Enable Z-buffer

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
}

function onmousemove(event) {
  if (PLAYER.mouselook && typeof lastX !== 'undefined') {
    var xDelta = event.pageX - lastX;
    var yDelta = event.pageY - lastY;
    PLAYER.yaw += xDelta * 0.005;
    PLAYER.pitch += yDelta * 0.005;
    PLAYER.pitch = Math.max(Math.min(Math.PI/2, PLAYER.pitch), -Math.PI/2);
  }
  lastX = event.pageX;
  lastY = event.pageY;
}
function onmousedown(event) {
  event = event || window.event;
  if (event.preventDefault) event.preventDefault();
  if (PICKED && PICKED.tile) {
    if (event.button === 0) {
      PICKED.tile = 0;
      PICKED.dirty = true;
    } else {
      var b = blockFacing(PICKED, PICKED_FACE);
      if (!b.outofbounds) {
        b.tile = PICKED.tile;
        b.dirty = true;
        neighbors(b, function (n) { n.dirty = true; });
      }
    }
  }
  return false;
}
