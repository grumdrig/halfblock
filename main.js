// REFERENCES:
// http://learningwebgl.com/blog/?page_id=1217
// http://codeflow.org/entries/2010/dec/09/minecraft-like-rendering-experiments-in-opengl-4/

// OpenGL rendering things!

var gl;

var mvMatrix = mat4.create();  // model-view matrix
var mvMatrixStack = [];
var pMatrix = mat4.create();   // projection matrix

// Game objects

var WORLD;
var PLAYER;
var PICKED = {};

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
          function nabe(coord, sign) {
            var nc = [x,y,z];
            nc[coord] += sign;
            var n = block(nc);
            if (!n.tile) {
              var vindex = vertices.length / 3;
              var corners = [-1,-1, +1,-1, +1,+1, -1,+1];
              var light = Math.max(LIGHT_MIN, Math.min(LIGHT_MAX, c.light||0))
                / LIGHT_MAX;
              if (c === PICKED) light = 2;
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
          for (var co = 0; co < 3; ++co)
            for (var s = -1; s <= 1; s += 2)
              nabe(co, s);
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

function coords(i) {
    return {
      x: i % WORLD.NX,
      y: (i >> WORLD.LOGNX) % WORLD.NY,
      z: (i >> (WORLD.LOGNX + WORLD.LOGNY)) % WORLD.NZ
    }
}


function index(x, y, z) {
  if (typeof x === 'object') {
    if (typeof x.x === 'undefined') {
      // assuming vec3 or array
      z = x[2];
      y = x[1];
      x = x[0];
    } else {
      z = x.z;
      y = x.y;
      x = x.x;
    }
  }
  if (typeof y === 'undefined') return x;
  z = Math.floor(z);
  y = Math.floor(y);
  x = Math.floor(x);
  if (x < 0 || y < 0 || z < 0 ||
      x >= WORLD.NX || y >= WORLD.NY || z >= WORLD.NZ) return null;
  return x + y * WORLD.NX + z * WORLD.NX * WORLD.NY;
}

function block(x, y, z) {
  return WORLD.map[index(x,y,z)] || {};
}

function neighbors(x, y, z) {
  var result = [];
  var i = index(x-1, y, z); if (i) result.push(block(i));
  var i = index(x+1, y, z); if (i) result.push(block(i));
  var i = index(x, y-1, z); if (i) result.push(block(i));
  var i = index(x, y+1, z); if (i) result.push(block(i));
  var i = index(x, y, z-1); if (i) result.push(block(i));
  var i = index(x, y, z+1); if (i) result.push(block(i));
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
  mat4.translate(mvMatrix, vec3.negate(PLAYER.position, [0,0,0]));
  mat4.translate(mvMatrix, [0, -EYE_HEIGHT, 0]);

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


function animate() {
  var timeNow = +new Date();
  if (lastFrame) {
    var elapsed = timeNow - lastFrame;
    var alpha = 0.9;
    FRAMETIME = FRAMETIME * alpha + (1-alpha) * elapsed;

    var d = elapsed * .003;
    var a = elapsed * .002;
    var m = mat4.create();

    if (KEYS.T === 1) {
      PLAYER.flying = !PLAYER.flying;
      ++KEYS.T;
    }

    var facing = quat4.create([0,0,0,1]);
    quat4.rotateY(facing, -PLAYER.yaw);
    if (KEYS.A)   
      vec3.add(PLAYER.position, quat4.multiplyVec3(facing, [-d, 0, 0]));
    if (KEYS.D)   
      vec3.add(PLAYER.position, quat4.multiplyVec3(facing, [ d, 0, 0]));
    if (KEYS.W)   
      vec3.add(PLAYER.position, quat4.multiplyVec3(facing, [ 0, 0,-d]));
    if (KEYS.S)   
      vec3.add(PLAYER.position, quat4.multiplyVec3(facing, [ 0, 0, d]));
    if (PLAYER.flying && (KEYS[' '] || KEYS.R))
      PLAYER.position[1] += d;
    if (PLAYER.flying && (KEYS[16] || KEYS.F))
      PLAYER.position[1] -= d;
    if (!PLAYER.flying && !PLAYER.falling && keyPressed(' ')) {
      PLAYER.dy = 5.5;
      PLAYER.falling = true;
      if (block(PLAYER.position).tile) 
        PLAYER.position[1] = Math.floor(PLAYER.position[1] + 1);
    }
    // http://content.gpwiki.org/index.php/OpenGL%3aTutorials%3aUsing_Quaternions_to_represent_rotation
    // TODO though: can just do the math the simple way

    if (KEYS.Q) PLAYER.yaw -= a;
    if (KEYS.E) PLAYER.yaw += a;
    if (KEYS.Z) PLAYER.pitch = Math.max(PLAYER.pitch - a, -Math.PI/2);
    if (KEYS.X) PLAYER.pitch = Math.min(PLAYER.pitch + a,  Math.PI/2);

    if (keyPressed('\t'))
      PLAYER.mouselook = !PLAYER.mouselook;

    if (!PLAYER.flying) {
      var c = block(PLAYER.position);
      if (!PLAYER.falling) {
        if (c.tile) {
          // Rise from dirt
          PLAYER.position[1] += d;
          if (!block(PLAYER.position).tile) {
            PLAYER.position[1] = Math.floor(PLAYER.position[1]);
          }
        } else if (!block(PLAYER.position[0], 
                          PLAYER.position[1]-1,
                          PLAYER.position[2]).tile) {
          // Fall off cliff
          PLAYER.falling = true;
          PLAYER.dy = 0;
        }
      } else { // falling
        if (c.tile) {
          // Landed
          PLAYER.dy = 0;
          PLAYER.falling = false;
          PLAYER.position[1] = Math.floor(PLAYER.position[1] + 1);
        } else {
          // Still falling
          PLAYER.dy -= 9.8 * elapsed / 1000;
          PLAYER.position[1] += PLAYER.dy * elapsed / 1000;
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
    PICKED = pickp() || {};
    if (PICKED !== waspicked) {
      ++dirty;
      //console.log('Picked', PICKED.x, PICKED.y, PICKED.z);
    }

    for (var x = 0; x < WORLD.NX; ++x) {
      for (var z = 0; z < WORLD.NZ; ++z) {
        var top = true;
        for (var y = WORLD.NY-1; y >= 0; --y) {
          var c = block(x,y,z);
          top = top && !c.tile;

          if (c.dirty) {
            ++dirty;
            c.dirty = false;
            var ns = neighbors(x,y,z);
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

function pickp(verbose) { 
  return pick(PLAYER.position[0] + 0.5, 
              PLAYER.position[1] + 0.5 + EYE_HEIGHT, 
              PLAYER.position[2] + 0.5, 
              PLAYER.pitch, 
              PLAYER.yaw,
              verbose) || {};
}
function pick(x, y, z, pitch, yaw, verbose) {
  // Compute length of ray which projects to length 1 on each axis
  var py = -1 / Math.sin(pitch);
  var ph = 1 / Math.cos(pitch);
  var px = ph / Math.sin(yaw);
  var pz = -ph / Math.cos(yaw);

  function next(w, pw) { 
    return pw * (pw < 0 ? Math.ceil(w-1) - w : Math.floor(w+1) - w);
  }
  
  for (var i = 0; i < 3000; ++i) {
    if (verbose) console.log('PK', x, y, z);
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
    var h = Math.min(dx, dy, dz) * 1.001;
    if (verbose) console.log('   K', dx, dy, dz, h);
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

  document.getElementById('stats').innerHTML = 
    'Render: ' + RENDERTIME.toFixed(2) + ' ms &mdash; ' +
    'Frame: ' + FRAMETIME.toFixed(2) + ' ms    ';
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


// Entry point for body.onload
function webGLStart() {
  var canvas = document.getElementById("canvas");

  // Create world map
  WORLD = {
    NBLOCKS: 0,
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
        var n = pinkNoise(x,y,z, 32, 2) + (2*y-WORLD.NY)/WORLD.NY;
        var t = WORLD.map[index(x,y,z)] = { 
          x: x, y: y, z: z, 
          i: index(x,y,z),
          id: ++WORLD.NBLOCKS
        };
        if (n < 0) t.tile = 3;
        if (n < -0.1) t.tile = 2;
        if (n < -0.2) t.tile = 1;

        if (Math.pow(noise(x/20, y/20, z/20), 2) < 0.01)
          t.tile = 0;

        if (y == 0) t.tile = 6;
      }
    }
  }
  // Initialize lighing
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
    position: vec3.create([WORLD.NX/2, WORLD.NY/2, WORLD.NZ/2]),
    dy: 0,
    yaw: 0,
    pitch: 0,
    flying: false,
    mouselook: false,
  };
  var c = topmost(PLAYER.position[0], PLAYER.position[2]);
  if (c)
    PLAYER.position[1] = c.y + 1;
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
  //canvas.addEventListener('oncontextmenu', function () { console.log('OCM');return false }, true);

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
  if (PICKED && PICKED.tile) {
    PICKED.tile = 0;
    PICKED.dirty = true;
    neighbors(PICKED).forEach(function (n) { n.dirty = true; });
  }
}
