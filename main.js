// REFERENCES:
// http://learningwebgl.com/blog/?page_id=1217
// http://codeflow.org/entries/2010/dec/09/minecraft-like-rendering-experiments-in-opengl-4/

var gl;

function initGL(canvas) {
  try {
    gl = canvas.getContext("experimental-webgl");
    gl.data = {};  // holds variables
    gl.viewportWidth = canvas.width;
    gl.viewportHeight = canvas.height;
  } catch (e) {
  }
  if (!gl) {
    alert("Could not initialise WebGL, sorry :-(");
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
  locate('aVertexNormal');
  gl.enableVertexAttribArray(gl.data.aVertexNormal);
  locate('aTextureCoord');
  gl.enableVertexAttribArray(gl.data.aTextureCoord);
  locate('uAmbientColor');
  locate('uLightingDirection');
  locate('uDirectionalColor');
  locate('uTile');
  locate('uSampler');
  locate('uMVMatrix');
  locate('uPMatrix');
  locate('uNMatrix');

}



var mvMatrix = mat4.create();  // model-view matrix
var mvMatrixStack = [];
var pMatrix = mat4.create();   // projection matrix

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


function setMatrixUniforms() {
  gl.uniformMatrix4fv(gl.data.uPMatrix,  false,  pMatrix);
  gl.uniformMatrix4fv(gl.data.uMVMatrix, false, mvMatrix);

  var mmat = mat4.create();
  mat4.rotateY(mvMatrix, -PLAYER.yaw, mmat);
  mat4.rotateX(mmat, -PLAYER.pitch);
  var normalMatrix = mat3.create();
  mat4.toInverseMat3(mmat, normalMatrix);
  mat3.transpose(normalMatrix);
  gl.uniformMatrix3fv(gl.data.uNMatrix, false, normalMatrix);
}


function degToRad(degrees) {
  return degrees * Math.PI / 180;
}


var cubeVertexPositionBuffer;
var cubeVertexNormalBuffer;
var cubeVertexTextureCoordBuffer;
var cubeVertexIndexBuffer;

function initBuffers() {

  //
  // Cube
  //

  cubeVertexPositionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeVertexPositionBuffer);
  var vertices = [
              // Front face
              -1, -1,  1,
               1, -1,  1,
               1,  1,  1,
              -1,  1,  1,

              // Back face
              -1, -1, -1,
              -1,  1, -1,
               1,  1, -1,
               1, -1, -1,

              // Top face
              -1,  1, -1,
              -1,  1,  1,
               1,  1,  1,
               1,  1, -1,

              // Bottom face
              -1, -1, -1,
               1, -1, -1,
               1, -1,  1,
              -1, -1,  1,

              // Right face
               1, -1, -1,
               1,  1, -1,
               1,  1,  1,
               1, -1,  1,

              // Left face
              -1, -1, -1,
              -1, -1,  1,
              -1,  1,  1,
              -1,  1, -1
              ];
  for (var i = 0; i < vertices.length; ++i) vertices[i] /= 2;
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  cubeVertexPositionBuffer.itemSize = 3;
  cubeVertexPositionBuffer.numItems = 24;


  cubeVertexIndexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeVertexIndexBuffer);
  var cubeVertexIndices = [
                           0, 1, 2,      0, 2, 3,    // Front face
                           4, 5, 6,      4, 6, 7,    // Back face
                           8, 9, 10,     8, 10, 11,  // Top face
                           12, 13, 14,   12, 14, 15, // Bottom face
                           16, 17, 18,   16, 18, 19, // Right face
                           20, 21, 22,   20, 22, 23  // Left face
                           ];
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,
                new Uint16Array(cubeVertexIndices),
                gl.STATIC_DRAW);
  cubeVertexIndexBuffer.itemSize = 1;
  cubeVertexIndexBuffer.numItems = 36;



  cubeVertexNormalBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeVertexNormalBuffer);
  var vertexNormals = [
    // Front face
     0,  0,  1,
     0,  0,  1,
     0,  0,  1,
     0,  0,  1,
    // Back face
     0,  0, -1,
     0,  0, -1,
     0,  0, -1,
     0,  0, -1,
    // Top face
     0,  1,  0,
     0,  1,  0,
     0,  1,  0,
     0,  1,  0,
    // Bottom face
     0, -1,  0,
     0, -1,  0,
     0, -1,  0,
     0, -1,  0,
    // Right face
     1,  0,  0,
     1,  0,  0,
     1,  0,  0,
     1,  0,  0,
    // Left face
    -1,  0,  0,
    -1,  0,  0,
    -1,  0,  0,
    -1,  0,  0,
  ];
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertexNormals), gl.STATIC_DRAW);
  cubeVertexNormalBuffer.itemSize = 3;
  cubeVertexNormalBuffer.numItems = 24;
  console.log(cubeVertexNormalBuffer);


  cubeVertexTextureCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeVertexTextureCoordBuffer);
  var textureCoords = [
    // Front face
    0, 0,
    1, 0,
    1, 1,
    0, 1,
    // Back face
    1, 0,
    1, 1,
    0, 1,
    0, 0,
    // Top face
    0, 1,
    0, 0,
    1, 0,
    1, 1,
    // Bottom face
    1, 1,
    0, 1,
    0, 0,
    1, 0,
    // Right face
    1, 0,
    1, 1,
    0, 1,
    0, 0,
    // Left face
    0, 0,
    1, 0,
    1, 1,
    0, 1,
  ];
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoords), gl.STATIC_DRAW);
  cubeVertexTextureCoordBuffer.itemSize = 2;
  cubeVertexTextureCoordBuffer.numItems = 24;
}


// The world
var CHUNK = 16;  // Dimension of chunks
var LOGCHUNK = 4;
var CCCHUNK = CHUNK * CHUNK * CHUNK;
var WORLD = Array(CCCHUNK);
for (var i = 0; i < CCCHUNK; ++i)
  WORLD[i] = choice(12) ? undefined : { tile: choice(4) };
var NOWHERE = false;

function choice(n) {
  if (!n) n = 2;
  return Math.floor(Math.random() * n);
}

function coords(i) {
    return {
      x: i % CHUNK,
      y: (i >> LOGCHUNK) % CHUNK,
      z: (i >> (2*LOGCHUNK)) % CHUNK
    }
}

function chunk(x, y, z) {
  if (typeof y === 'undefined') {
    var c = coords(x);
    x = c.x; y = c.y; z = c.z;
  }
  if (x < 0 || y < 0 || z < 0 ||
      x >= CHUNK || y >= CHUNK || z >= CHUNK) return NOWHERE;
  var i = x * CHUNK * CHUNK + y * CHUNK + z;
  return WORLD[i];
}


// Rotation of the objects
var PLAYER = {
  position: vec3.create([0,0,-10]),
  yaw: 0,
  pitch: 0
};

function drawScene() {
  var atstart = +new Date();

  // Start from scratch
  gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Set up the projection
  mat4.perspective(45, gl.viewportWidth / gl.viewportHeight, 0.1, 100.0,
                   pMatrix);

  // Position for player
  mat4.identity(mvMatrix);
  mat4.rotateX(mvMatrix, PLAYER.pitch);
  mat4.rotateY(mvMatrix, PLAYER.yaw);
  mat4.translate(mvMatrix, PLAYER.position);

  // Render the world as cubes

  gl.bindBuffer(gl.ARRAY_BUFFER, cubeVertexPositionBuffer);
  gl.vertexAttribPointer(gl.data.aVertexPosition,
                         cubeVertexPositionBuffer.itemSize,
                         gl.FLOAT, false, 0, 0);


  gl.bindBuffer(gl.ARRAY_BUFFER, cubeVertexNormalBuffer);
  gl.vertexAttribPointer(gl.data.aVertexNormal,
                         cubeVertexNormalBuffer.itemSize,
                         gl.FLOAT, false, 0, 0);

  gl.uniform3f(gl.data.uAmbientColor, 0.2, 0.2, 0.2);

  var adjustedLD = vec3.create();
  vec3.normalize([1, -1, -0.5], adjustedLD);
  vec3.scale(adjustedLD, -1);
  gl.uniform3fv(gl.data.uLightingDirection, adjustedLD);

  gl.uniform3f(gl.data.uDirectionalColor, 0.8, 0.8, 0.8);


  gl.bindBuffer(gl.ARRAY_BUFFER, cubeVertexTextureCoordBuffer);
  gl.vertexAttribPointer(gl.data.vTextureCoord,
                         cubeVertexTextureCoordBuffer.itemSize,
                         gl.FLOAT, false, 0, 0);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, TERRAIN);
  gl.uniform1i(gl.data.uSampler, 0);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeVertexIndexBuffer);

  for (var i = 0; i < CCCHUNK; ++i) {
    var ch = chunk(i);
    if (ch) {
      var c = coords(i);
      // if (!chunk(c.x-1, c.y, c.z)) {
      mvPushMatrix();
      mat4.translate(mvMatrix, [c.x - CHUNK/2, CHUNK/2 - c.y, c.z - CHUNK/2]);
      setMatrixUniforms();
      gl.uniform2f(gl.data.uTile, ch.tile, 15);
      gl.drawElements(gl.TRIANGLES, cubeVertexIndexBuffer.numItems,
                      gl.UNSIGNED_SHORT, 0);
      mvPopMatrix();
    }
  }

  var atend = +new Date();
  var alpha = 0.9;
  RENDERTIME = RENDERTIME * alpha + (1-alpha) * (atend-atstart);
  document.getElementById('stats').innerText = RENDERTIME.toFixed(2) + ' ms';
}

var RENDERTIME = 0;

quat4.rotateX = function (quat, angle, dest) {
  if (!dest) dest = quat;
  quat4.multiply(quat, [Math.sin(angle/2), 0, 0, Math.cos(angle/2)]);
}
quat4.rotateY = function (quat, angle, dest) {
  if (!dest) dest = quat;
  quat4.multiply(quat, [0, Math.sin(angle/2), 0, Math.cos(angle/2)]);
}

var lastTime = 0;

function animate() {
  var timeNow = new Date().getTime();
  if (lastTime != 0) {
    var elapsed = timeNow - lastTime;

    var d = elapsed * .003;
    var a = elapsed * .002;
    var m = mat4.create();

    var facing = quat4.create([0,0,0,1]);
    quat4.rotateY(facing, -PLAYER.yaw);
    if (KEYS.A)   vec3.add(PLAYER.position, quat4.multiplyVec3(facing, [ d, 0, 0]));
    if (KEYS.D)   vec3.add(PLAYER.position, quat4.multiplyVec3(facing, [-d, 0, 0]));
    if (KEYS.W)   vec3.add(PLAYER.position, quat4.multiplyVec3(facing, [ 0, 0, d]));
    if (KEYS.S)   vec3.add(PLAYER.position, quat4.multiplyVec3(facing, [ 0, 0,-d]));
    if (KEYS[32]) vec3.add(PLAYER.position, quat4.multiplyVec3(facing, [ 0,-d, 0]));
    if (KEYS[16]) vec3.add(PLAYER.position, quat4.multiplyVec3(facing, [ 0, d, 0]));

    // http://content.gpwiki.org/index.php/OpenGL%3aTutorials%3aUsing_Quaternions_to_represent_rotation
    if (KEYS.Q) PLAYER.yaw -= a;
    if (KEYS.E) PLAYER.yaw += a;
    if (KEYS.R) PLAYER.pitch = Math.max(PLAYER.pitch - a, -Math.PI/2);
    if (KEYS.F) PLAYER.pitch = Math.min(PLAYER.pitch + a,  Math.PI/2);
  }
  lastTime = timeNow;
}


function tick() {
  requestAnimFrame(tick);
  drawScene();
  animate();
}


function handleLoadedTexture(texture) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture.image);
    //gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, texture.image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

var TERRAIN;

// Entry point for body.onload
function webGLStart() {
  var canvas = document.getElementById("canvas");
  initGL(canvas);
  initShaders();
  initBuffers();

  // Init texture

  TERRAIN = gl.createTexture();
  TERRAIN.image = new Image();
  TERRAIN.image.onload = function() {
    handleLoadedTexture(TERRAIN)
  }
  TERRAIN.image.src = "terrain.png";


  gl.clearColor(0.0, 0.0, 0.0, 1.0);  // Clear is blackness
  gl.enable(gl.DEPTH_TEST);           // Enable Z-buffer

  window.addEventListener('keydown', onkeydown, true);
  window.addEventListener('keyup',   onkeyup,   true);
  window.addEventListener('mousemove', onmousemove, true);
  window.addEventListener('mousedown', onmousedown, true);
  window.addEventListener('mouseup', onmouseup, true);

  tick();
}

var KEYS = {};

function onkeydown(event) { onkeyup(event, true); }

function onkeyup(event, imeandown) {
  event = event || window.event;
  if (event.preventDefault)
    event.preventDefault();

  var k = event.keyCode;
  var c = String.fromCharCode(k).toUpperCase();

  KEYS[k] = KEYS[c] = imeandown;
}

var lastX, lastY;
function onmousemove(event) {
  if (typeof lastX !== 'undefined') {
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
  PLAYER.yaw = PLAYER.pitch = 0;
}
function onmouseup(event) {
}
