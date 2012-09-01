
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
    var type = { 'a': 'Attrib', 'u': 'Uniform' }[variable[0]];
    gl.data[variable] = gl['get' + type + 'Location'](gl.data.shaderProgram, variable);
  }
  locate('aVertexPosition');
  locate('aVertexColor');
  locate('uMVMatrix');
  locate('uPMatrix');

  gl.enableVertexAttribArray(gl.data.aVertexPosition);
  gl.enableVertexAttribArray(gl.data.aVertexColor);
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
}


function degToRad(degrees) {
  return degrees * Math.PI / 180;
}


var cubeVertexPositionBuffer;
var cubeVertexColorBuffer;
var cubeVertexIndexBuffer;

function initBuffers() {

  //
  // Cube
  //

  cubeVertexPositionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeVertexPositionBuffer);
  var vertices = [
              // Front face
              -1.0, -1.0,  1.0,
              1.0, -1.0,  1.0,
              1.0,  1.0,  1.0,
              -1.0,  1.0,  1.0,

              // Back face
              -1.0, -1.0, -1.0,
              -1.0,  1.0, -1.0,
              1.0,  1.0, -1.0,
              1.0, -1.0, -1.0,

              // Top face
              -1.0,  1.0, -1.0,
              -1.0,  1.0,  1.0,
              1.0,  1.0,  1.0,
              1.0,  1.0, -1.0,

              // Bottom face
              -1.0, -1.0, -1.0,
              1.0, -1.0, -1.0,
              1.0, -1.0,  1.0,
              -1.0, -1.0,  1.0,

              // Right face
              1.0, -1.0, -1.0,
              1.0,  1.0, -1.0,
              1.0,  1.0,  1.0,
              1.0, -1.0,  1.0,

              // Left face
              -1.0, -1.0, -1.0,
              -1.0, -1.0,  1.0,
              -1.0,  1.0,  1.0,
              -1.0,  1.0, -1.0
              ];
  for (var i = 0; i < vertices.length; ++i) vertices[i] /= 2;
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  cubeVertexPositionBuffer.itemSize = 3;
  cubeVertexPositionBuffer.numItems = 24;

  cubeVertexColorBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeVertexColorBuffer);
  colors = [
            [1.0, 0.0, 0.0, 1.0], // Front face
            [1.0, 1.0, 0.0, 1.0], // Back face
            [0.0, 1.0, 0.0, 1.0], // Top face
            [1.0, 0.5, 0.5, 1.0], // Bottom face
            [1.0, 0.0, 1.0, 1.0], // Right face
            [0.0, 0.0, 1.0, 1.0]  // Left face
            ];
  var unpackedColors = [];
  for (var i in colors) {
    var color = colors[i];
    for (var j=0; j < 4; j++) {
      unpackedColors = unpackedColors.concat(color);
    }
  }
  gl.bufferData(gl.ARRAY_BUFFER,
                new Float32Array(unpackedColors),
                gl.STATIC_DRAW);
  cubeVertexColorBuffer.itemSize = 4;
  cubeVertexColorBuffer.numItems = 24;

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
}


// The world
var CHUNK = 16;  // Dimension of chunks
var LOGCHUNK = 4;
var CCCHUNK = CHUNK * CHUNK * CHUNK;
var WORLD = Array(CCCHUNK);
for (var i = 0; i < CCCHUNK; ++i)
  WORLD[i] = !choice(12);
var NOWHERE = false;

function choice(n) {
  if (!n) n = 2;
  return Math.floor(Math.random() * n);
}

function coords(i) {
    return {
      z: i % CHUNK,
      y: (i >> LOGCHUNK) % CHUNK,
      x: (i >> (2*LOGCHUNK)) % CHUNK
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
var rCube = 0;

function drawScene() {
  // Start from scratch
  gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Set up the projection
  mat4.perspective(45, gl.viewportWidth / gl.viewportHeight, 0.1, 100.0,
                   pMatrix);

  mat4.identity(mvMatrix);

  // Move camera back a ways
  mat4.translate(mvMatrix, [0, 0, -30]);

  // Rotate the world
  mat4.rotate(mvMatrix, degToRad(rCube), [1, 1, 1]);

  // Render the cube as triangles

  for (var i = 0; i < CCCHUNK; ++i) {
    if (chunk(i)) {
      var c = coords(i);
      // if (!chunk(c.x-1, c.y, c.z)) {
      mvPushMatrix();
      mat4.translate(mvMatrix, [c.x - CHUNK/2, CHUNK/2 - c.y, c.z- CHUNK/2]);
      drawCube();
      mvPopMatrix();
    }
  }
}

function drawCube() {
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeVertexPositionBuffer);
  gl.vertexAttribPointer(gl.data.aVertexPosition,
                         cubeVertexPositionBuffer.itemSize,
                         gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, cubeVertexColorBuffer);
  gl.vertexAttribPointer(gl.data.aVertexColor,
                         cubeVertexColorBuffer.itemSize,
                         gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeVertexIndexBuffer);
  setMatrixUniforms();
  gl.drawElements(gl.TRIANGLES, cubeVertexIndexBuffer.numItems,
                  gl.UNSIGNED_SHORT, 0);
}


var lastTime = 0;

function animate() {
  var timeNow = new Date().getTime();
  if (lastTime != 0) {
    var elapsed = timeNow - lastTime;

    rCube -= (75 * elapsed) / 1000.0;
  }
  lastTime = timeNow;
}


function tick() {
  requestAnimFrame(tick);
  drawScene();
  animate();
}


// Entry point for body.onload
function webGLStart() {
  var canvas = document.getElementById("canvas");
  initGL(canvas);
  initShaders();
  initBuffers();

  gl.clearColor(0.0, 0.0, 0.0, 1.0);  // Clear is blackness
  gl.enable(gl.DEPTH_TEST);           // Enable Z-buffer

  tick();
}
