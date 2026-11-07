/*
  LIBS : Unified library untuk Grafika Komputer (WebGL)
  Menggabungkan seluruh fungsi matematika matriks 4x4, vektor, utilitas transformasi,
  serta generator geometri 3D prosedural dari libs.js dan libs3.js.
  Mendukung model Sprout (UTS) dan Spike (3D WebGL).
*/

var LIBS = {
  degToRad: function (angle) {
    return (angle * Math.PI) / 180;
  },

  radToDeg: function (angle) {
    return (angle * 180) / Math.PI;
  },

  /*========================= PROYEKSI & KAMERA ========================= */
  get_projection: function (angle, a, zMin, zMax) {
    if (zMin >= 1) {
      // Formula proyeksi template Sprout (libs3.js)
      var tan = Math.tan(LIBS.degToRad(0.5 * angle));
      var A = -(zMax + zMin) / (zMax - zMin);
      var B = (-2 * zMax * zMin) / (zMax - zMin);

      return [
        0.5 / tan, 0, 0, 0,
        0, (0.5 * a) / tan, 0, 0,
        0, 0, A, -1,
        0, 0, B, 0,
      ];
    }

    // Formula proyeksi standar WebGL / Spike (libs.js)
    var f = 1 / Math.tan(LIBS.degToRad(angle) / 2);
    return new Float32Array([
      f / a, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (zMax + zMin) / (zMin - zMax), -1,
      0, 0, (2 * zMax * zMin) / (zMin - zMax), 0,
    ]);
  },

  look_at: function (eye, center, up) {
    var z = LIBS.vec_normalize(LIBS.vec_sub(eye, center));
    var x = LIBS.vec_normalize(LIBS.vec_cross(up, z));
    var y = LIBS.vec_cross(z, x);
    return new Float32Array([
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -LIBS.vec_dot(x, eye), -LIBS.vec_dot(y, eye), -LIBS.vec_dot(z, eye), 1,
    ]);
  },

  /*========================= MATRIKS DASAR ========================= */
  get_I4: function () {
    return new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);
  },

  set_I4: function (m) {
    m[0] = 1; m[1] = 0; m[2] = 0; m[3] = 0;
    m[4] = 0; m[5] = 1; m[6] = 0; m[7] = 0;
    m[8] = 0; m[9] = 0; m[10] = 1; m[11] = 0;
    m[12] = 0; m[13] = 0; m[14] = 0; m[15] = 1;
  },

  copy: function (m) {
    var out = new Float32Array(m);
    if (m._mode) out._mode = m._mode;
    return out;
  },

  // Perkalian matriks 4x4 (Column-Major)
  multiply: function (a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) {
      for (var r = 0; r < 4; r++) {
        var s = 0;
        for (var k = 0; k < 4; k++) {
          s += a[k * 4 + r] * b[c * 4 + k];
        }
        o[c * 4 + r] = s;
      }
    }
    return o;
  },

  // m = m * op (Post-multiply untuk Spike / script.js)
  apply: function (m, op) {
    m._mode = 'post';
    var hasil = LIBS.multiply(m, op);
    for (var i = 0; i < 16; i++) {
      m[i] = hasil[i];
    }
  },

  /*========================= TRANSFORMASI TRANSLASI ========================= */
  // Post-multiply translate untuk script.js (M = M * T)
  translate: function (m, x, y, z) {
    var op = LIBS.get_I4();
    op[12] = x;
    op[13] = y;
    op[14] = z;
    LIBS.apply(m, op);
  },

  // Translasi langsung untuk sprout.js (libs3.js)
  translateX: function (m, t) {
    m[12] += t;
  },

  translateY: function (m, t) {
    m[13] += t;
  },

  translateZ: function (m, t) {
    m[14] += t;
  },

  set_position: function (m, x, y, z) {
    m[12] = x;
    m[13] = y;
    m[14] = z;
  },

  /*========================= TRANSFORMASI SKALA ========================= */
  // Post-multiply scale untuk script.js (M = M * S)
  scale: function (m, x, y, z) {
    var op = LIBS.get_I4();
    op[0] = x;
    op[5] = y;
    op[10] = z;
    LIBS.apply(m, op);
  },

  // Skala sumbu individual untuk sprout.js (libs3.js)
  scaleX: function (m, t) {
    m[0] *= t;
    m[1] *= t;
    m[2] *= t;
  },

  scaleY: function (m, t) {
    m[4] *= t;
    m[5] *= t;
    m[6] *= t;
  },

  scaleZ: function (m, t) {
    m[8] *= t;
    m[9] *= t;
    m[10] *= t;
  },

  /*========================= TRANSFORMASI ROTASI ========================= */
  // Rotasi terhadap sumbu sembarang (rumus Rodrigues) untuk script.js
  rotateAxis: function (m, axis, angle) {
    var x = axis[0], y = axis[1], z = axis[2];
    var l = Math.hypot(x, y, z) || 1;
    x /= l;
    y /= l;
    z /= l;

    var c = Math.cos(angle);
    var s = Math.sin(angle);
    var t = 1 - c;

    var op = new Float32Array([
      t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0,
      t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0,
      t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0,
      0, 0, 0, 1,
    ]);
    LIBS.apply(m, op);
  },

  rotateX: function (m, angle) {
    if (m && m._mode === 'post') {
      LIBS.rotateAxis(m, [1, 0, 0], angle);
    } else {
      var c = Math.cos(angle);
      var s = Math.sin(angle);

      var m1 = m[1], m5 = m[5], m9 = m[9];
      var m2 = m[2], m6 = m[6], m10 = m[10];

      m[1] = m1 * c + m2 * s;
      m[5] = m5 * c + m6 * s;
      m[9] = m9 * c + m10 * s;

      m[2] = m2 * c - m1 * s;
      m[6] = m6 * c - m5 * s;
      m[10] = m10 * c - m9 * s;
    }
  },

  rotateY: function (m, angle) {
    if (m && m._mode === 'post') {
      LIBS.rotateAxis(m, [0, 1, 0], angle);
    } else {
      var c = Math.cos(angle);
      var s = Math.sin(angle);

      var m0 = m[0], m4 = m[4], m8 = m[8];
      var m2 = m[2], m6 = m[6], m10 = m[10];

      m[0] = m0 * c - m2 * s;
      m[4] = m4 * c - m6 * s;
      m[8] = m8 * c - m10 * s;

      m[2] = m2 * c + m0 * s;
      m[6] = m6 * c + m4 * s;
      m[10] = m10 * c + m8 * s;
    }
  },

  rotateZ: function (m, angle) {
    if (m && m._mode === 'post') {
      LIBS.rotateAxis(m, [0, 0, 1], angle);
    } else {
      var c = Math.cos(angle);
      var s = Math.sin(angle);

      var m0 = m[0], m4 = m[4];
      var m1 = m[1], m5 = m[5];

      m[0] = m0 * c - m1 * s;
      m[4] = m4 * c - m5 * s;

      m[1] = m0 * s + m1 * c;
      m[5] = m4 * s + m5 * c;
    }
  },

  // Memutar sumbu +Y objek supaya menghadap ke arah d (d harus sudah dinormalisasi)
  align_y: function (m, d) {
    var axis = [d[2], 0, -d[0]];
    if (Math.hypot(axis[0], axis[1], axis[2]) < 1e-4) return;
    var angle = Math.acos(Math.max(-1, Math.min(1, d[1])));
    LIBS.rotateAxis(m, axis, angle);
  },

  // Matriks normal 3x3 (kofaktor dari bagian 3x3 kiri-atas matriks model)
  normal_matrix: function (m) {
    var a00 = m[0], a10 = m[1], a20 = m[2];
    var a01 = m[4], a11 = m[5], a21 = m[6];
    var a02 = m[8], a12 = m[9], a22 = m[10];

    return new Float32Array([
      a11 * a22 - a12 * a21,
      -(a01 * a22 - a02 * a21),
      a01 * a12 - a02 * a11,

      -(a10 * a22 - a12 * a20),
      a00 * a22 - a02 * a20,
      -(a00 * a12 - a02 * a10),

      a10 * a21 - a11 * a20,
      -(a00 * a21 - a01 * a20),
      a00 * a11 - a01 * a10,
    ]);
  },

  /*========================= VEKTOR ========================= */
  vec_sub: function (a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  },

  vec_cross: function (a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  },

  vec_dot: function (a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  },

  vec_normalize: function (a) {
    var l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },

  /*========================= UTIL ========================= */
  clamp: function (x, a, b) {
    return Math.min(b, Math.max(a, x));
  },

  lerp: function (a, b, t) {
    return a + (b - a) * t;
  },

  smoothstep: function (a, b, x) {
    var t = LIBS.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  },

  /*========================= HELPER PEMBUATAN GEOMETRI 3D ========================= */

  // 1. Bola / Sphere & Ellipsoid (radius bisa berupa angka atau array [rx, ry, rz])
  createSphere: function (slices, stacks, radius, color) {
    var vertices = [];
    var faces = [];
    var rx = Array.isArray(radius) ? radius[0] : radius;
    var ry = Array.isArray(radius) ? radius[1] : radius;
    var rz = Array.isArray(radius) ? radius[2] : radius;
    var rCol = color[0], gCol = color[1], bCol = color[2], aCol = color[3] ?? 1.0;

    for (var i = 0; i <= stacks; i++) {
      var lat = (Math.PI * i) / stacks - Math.PI / 2;
      var sinLat = Math.sin(lat);
      var cosLat = Math.cos(lat);

      for (var j = 0; j <= slices; j++) {
        var lon = (2 * Math.PI * j) / slices;
        var sinLon = Math.sin(lon);
        var cosLon = Math.cos(lon);

        var x = rx * cosLat * cosLon;
        var y = ry * sinLat;
        var z = rz * cosLat * sinLon;

        var nx = rx !== 0 ? (cosLat * cosLon) / (rx * rx) : 0;
        var ny = ry !== 0 ? sinLat / (ry * ry) : 0;
        var nz = rz !== 0 ? (cosLat * sinLon) / (rz * rz) : 0;
        var len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len > 0) { nx /= len; ny /= len; nz /= len; }

        vertices.push(x, y, z, rCol, gCol, bCol, aCol, nx, ny, nz);
      }
    }

    for (var i = 0; i < stacks; i++) {
      for (var j = 0; j < slices; j++) {
        var first = i * (slices + 1) + j;
        var second = first + slices + 1;
        faces.push(first, second, first + 1);
        faces.push(second, second + 1, first + 1);
      }
    }

    return { vertex: vertices, faces: faces };
  },

  // 2. Kaca Pelindung Kepala: Elliptic Paraboloid
  createEllipticParaboloid: function (slices, rings, rx, rz, height, color) {
    var vertices = [];
    var faces = [];

    for (var r = 0; r <= rings; r++) {
      var u = r / rings; // 0 di puncak, 1 di alas
      var y = height * (1.0 - u * u);
      var radiusX = rx * u;
      var radiusZ = rz * u;

      for (var s = 0; s <= slices; s++) {
        var theta = (2 * Math.PI * s) / slices;
        var cosT = Math.cos(theta);
        var sinT = Math.sin(theta);

        var x = radiusX * cosT;
        var z = radiusZ * sinT;

        var nx = rx !== 0 ? (2 * height * u * cosT) / rx : 0;
        var ny = 1.0;
        var nz = rz !== 0 ? (2 * height * u * sinT) / rz : 0;
        var len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len > 0) { nx /= len; ny /= len; nz /= len; }

        vertices.push(x, y, z, color[0], color[1], color[2], color[3] ?? 1.0, nx, ny, nz);
      }
    }

    for (var r = 0; r < rings; r++) {
      for (var s = 0; s < slices; s++) {
        var first = r * (slices + 1) + s;
        var second = first + slices + 1;
        faces.push(first, second, first + 1);
        faces.push(second, second + 1, first + 1);
      }
    }

    return { vertex: vertices, faces: faces };
  },

  // 3. Silinder Modifikasi / Tabung (open=true untuk silinder terbuka tanpa tutup atas/bawah)
  createCylinder: function (slices, stacks, rTop, rBottom, height, color, open) {
    var vertices = [];
    var faces = [];
    var rCol = color[0], gCol = color[1], bCol = color[2], aCol = color[3] ?? 1.0;

    // Permukaan Samping
    for (var i = 0; i <= stacks; i++) {
      var v = i / stacks;
      var y = height * (0.5 - v);
      var r = rTop + (rBottom - rTop) * v;

      for (var j = 0; j <= slices; j++) {
        var theta = (2 * Math.PI * j) / slices;
        var cosT = Math.cos(theta);
        var sinT = Math.sin(theta);

        var x = r * cosT;
        var z = r * sinT;

        var nx = cosT;
        var ny = (rBottom - rTop) / height;
        var nz = sinT;
        var len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len > 0) { nx /= len; ny /= len; nz /= len; }

        vertices.push(x, y, z, rCol, gCol, bCol, aCol, nx, ny, nz);
      }
    }

    for (var i = 0; i < stacks; i++) {
      for (var j = 0; j < slices; j++) {
        var first = i * (slices + 1) + j;
        var second = first + slices + 1;
        faces.push(first, second, first + 1);
        faces.push(second, second + 1, first + 1);
      }
    }

    if (!open) {
      // Penutup Atas
      if (rTop > 0) {
        var topCenterIdx = vertices.length / 10;
        vertices.push(0, height / 2, 0, rCol, gCol, bCol, aCol, 0, 1, 0);
        for (var j = 0; j <= slices; j++) {
          var theta = (2 * Math.PI * j) / slices;
          vertices.push(rTop * Math.cos(theta), height / 2, rTop * Math.sin(theta), rCol, gCol, bCol, aCol, 0, 1, 0);
        }
        for (var j = 0; j < slices; j++) {
          faces.push(topCenterIdx, topCenterIdx + 1 + j, topCenterIdx + 2 + j);
        }
      }

      // Penutup Bawah
      if (rBottom > 0) {
        var botCenterIdx = vertices.length / 10;
        vertices.push(0, -height / 2, 0, rCol, gCol, bCol, aCol, 0, -1, 0);
        for (var j = 0; j <= slices; j++) {
          var theta = (2 * Math.PI * j) / slices;
          vertices.push(rBottom * Math.cos(theta), -height / 2, rBottom * Math.sin(theta), rCol, gCol, bCol, aCol, 0, -1, 0);
        }
        for (var j = 0; j < slices; j++) {
          faces.push(botCenterIdx, botCenterIdx + 2 + j, botCenterIdx + 1 + j);
        }
      }
    }

    return { vertex: vertices, faces: faces };
  },

  // 4. Mesh Daun Mengikuti Kurva
  createCurvedLeaf: function (uSteps, vSteps, width, length, color) {
    var vertices = [];
    var faces = [];

    for (var j = 0; j <= vSteps; j++) {
      var v = j / vSteps;
      var z = v * length;
      var w = Math.sin(Math.PI * v) * width;
      var y = Math.sin(Math.PI * v) * 0.35 - v * 0.15;

      for (var i = 0; i <= uSteps; i++) {
        var u = (i / uSteps) * 2 - 1;
        var x = u * w;
        var yCurr = y - u * u * 0.12;

        var nx = -u * 0.4;
        var ny = 0.9;
        var nz = -0.2;
        var len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx /= len; ny /= len; nz /= len;

        vertices.push(x, yCurr, z, color[0], color[1], color[2], color[3] ?? 1.0, nx, ny, nz);
      }
    }

    for (var j = 0; j < vSteps; j++) {
      for (var i = 0; i < uSteps; i++) {
        var first = j * (uSteps + 1) + i;
        var second = first + uSteps + 1;
        faces.push(first, second, first + 1);
        faces.push(second, second + 1, first + 1);
      }
    }

    return { vertex: vertices, faces: faces };
  },

  // 5. Kotak / Balok / Kertas Sticky Note
  createBox: function (dx, dy, dz, color) {
    var hx = dx / 2, hy = dy / 2, hz = dz / 2;
    var r = color[0], g = color[1], b = color[2], a = color[3] ?? 1.0;

    var vertices = [
      // Depan
      -hx, -hy,  hz,  r, g, b, a,  0, 0, 1,
       hx, -hy,  hz,  r, g, b, a,  0, 0, 1,
       hx,  hy,  hz,  r, g, b, a,  0, 0, 1,
      -hx,  hy,  hz,  r, g, b, a,  0, 0, 1,
      // Belakang
      -hx, -hy, -hz,  r, g, b, a,  0, 0, -1,
      -hx,  hy, -hz,  r, g, b, a,  0, 0, -1,
       hx,  hy, -hz,  r, g, b, a,  0, 0, -1,
       hx, -hy, -hz,  r, g, b, a,  0, 0, -1,
      // Atas
      -hx,  hy, -hz,  r, g, b, a,  0, 1, 0,
      -hx,  hy,  hz,  r, g, b, a,  0, 1, 0,
       hx,  hy,  hz,  r, g, b, a,  0, 1, 0,
       hx,  hy, -hz,  r, g, b, a,  0, 1, 0,
      // Bawah
      -hx, -hy, -hz,  r, g, b, a,  0, -1, 0,
       hx, -hy, -hz,  r, g, b, a,  0, -1, 0,
       hx, -hy,  hz,  r, g, b, a,  0, -1, 0,
      -hx, -hy,  hz,  r, g, b, a,  0, -1, 0,
      // Kanan
       hx, -hy, -hz,  r, g, b, a,  1, 0, 0,
       hx,  hy, -hz,  r, g, b, a,  1, 0, 0,
       hx,  hy,  hz,  r, g, b, a,  1, 0, 0,
       hx, -hy,  hz,  r, g, b, a,  1, 0, 0,
      // Kiri
      -hx, -hy, -hz,  r, g, b, a, -1, 0, 0,
      -hx, -hy,  hz,  r, g, b, a, -1, 0, 0,
      -hx,  hy,  hz,  r, g, b, a, -1, 0, 0,
      -hx,  hy, -hz,  r, g, b, a, -1, 0, 0,
    ];

    var faces = [
       0,  1,  2,    0,  2,  3, // Depan
       4,  5,  6,    4,  6,  7, // Belakang
       8,  9, 10,    8, 10, 11, // Atas
      12, 13, 14,   12, 14, 15, // Bawah
      16, 17, 18,   16, 18, 19, // Kanan
      20, 21, 22,   20, 22, 23, // Kiri
    ];

    return { vertex: vertices, faces: faces };
  },

  // 6. Permukaan Lingkaran / Disc & Annulus (Cincin)
  createDisc: function (slices, radius, color, innerRadius) {
    var vertices = [];
    var faces = [];
    var rCol = color[0], gCol = color[1], bCol = color[2], aCol = color[3] ?? 1.0;
    var r0 = innerRadius || 0;

    if (r0 <= 0.0001) {
      // Titik pusat
      vertices.push(0, 0, 0, rCol, gCol, bCol, aCol, 0, 1, 0);

      // Pinggiran lingkaran
      for (var i = 0; i <= slices; i++) {
        var theta = (2 * Math.PI * i) / slices;
        var x = radius * Math.cos(theta);
        var z = radius * Math.sin(theta);
        vertices.push(x, 0, z, rCol, gCol, bCol, aCol, 0, 1, 0);
      }

      for (var i = 0; i < slices; i++) {
        faces.push(0, i + 1, i + 2);
      }
    } else {
      // Cincin / Annulus
      for (var i = 0; i <= slices; i++) {
        var theta = (2 * Math.PI * i) / slices;
        var s = Math.sin(theta), c = Math.cos(theta);
        vertices.push(r0 * s, 0, r0 * c, rCol, gCol, bCol, aCol, 0, 1, 0);
        vertices.push(radius * s, 0, radius * c, rCol, gCol, bCol, aCol, 0, 1, 0);
      }
      for (var i = 0; i < slices; i++) {
        var a = 2 * i;
        faces.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }

    return { vertex: vertices, faces: faces };
  },

  // 7. Torus / Donut (untuk kerah syal & cincin)
  createTorus: function (slices, tubeSlices, R, r, color) {
    var vertices = [];
    var faces = [];
    var rCol = color[0], gCol = color[1], bCol = color[2], aCol = color[3] ?? 1.0;

    for (var i = 0; i <= slices; i++) {
      var phi = (i / slices) * 2 * Math.PI;
      var cp = Math.cos(phi), sp = Math.sin(phi);

      for (var j = 0; j <= tubeSlices; j++) {
        var theta = (j / tubeSlices) * 2 * Math.PI;
        var ct = Math.cos(theta), st = Math.sin(theta);

        var x = (R + r * ct) * cp;
        var y = r * st;
        var z = (R + r * ct) * sp;

        var nx = ct * cp;
        var ny = st;
        var nz = ct * sp;

        vertices.push(x, y, z, rCol, gCol, bCol, aCol, nx, ny, nz);
      }
    }

    for (var i = 0; i < slices; i++) {
      for (var j = 0; j < tubeSlices; j++) {
        var a = i * (tubeSlices + 1) + j;
        var b = a + tubeSlices + 1;
        faces.push(a, b, a + 1);
        faces.push(b, b + 1, a + 1);
      }
    }

    return { vertex: vertices, faces: faces };
  },

  // 7b. Syal V Tick (mengikuti kontur badan)
  createScarf: function (color) {
    var v = [], f = [], NU = 72, NV = 14, yTop = 0.8, dmin = 0.25, dmax = 1.0;
    var rCol = color[0], gCol = color[1], bCol = color[2], aCol = color[3] ?? 1.0;
    function tubR(y) { return 1.6 + 0.25 * (y - 0.15) / 0.7; }
    function bellyR(y) { var k = (y + 0.15) / 0.95; return k * k < 1 ? 1.6 * Math.sqrt(1 - k * k) : 0; }
    function R(y) { return (y >= 0.15 ? Math.max(tubR(y), bellyR(y)) : bellyR(y)) + 0.05; }
    for (var i = 0; i <= NU; i++) {
      var u = (i / NU) * 2 * Math.PI, d = dmin + (dmax - dmin) * (1 - Math.abs(Math.sin(u)));
      for (var j = 0; j <= NV; j++) {
        var y = yTop - (d * j) / NV, r = R(y);
        var nx = Math.sin(u), ny = 0.15, nz = Math.cos(u);
        var l = Math.hypot(nx, ny, nz) || 1;
        v.push(r * Math.sin(u), y, r * Math.cos(u), rCol, gCol, bCol, aCol, nx / l, ny / l, nz / l);
      }
    }
    for (var i = 0; i < NU; i++) {
      for (var j = 0; j < NV; j++) {
        var a = i * (NV + 1) + j, b = (i + 1) * (NV + 1) + j;
        f.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    return { vertex: v, faces: f };
  },

  // 8. Hiperboloid (Tanduk bom Tick)
  createHyperboloid: function (slices, stacks, a, c, h, sz, color) {
    var vertices = [];
    var faces = [];
    var rCol = color[0], gCol = color[1], bCol = color[2], aCol = color[3] ?? 1.0;

    for (var j = 0; j <= stacks; j++) {
      var y = -h + (2 * h * j) / stacks;
      var r = a * Math.sqrt(1 + (y * y) / (c * c));

      for (var i = 0; i <= slices; i++) {
        var ph = (i / slices) * 2 * Math.PI;
        var x = r * Math.cos(ph);
        var z = sz * r * Math.sin(ph);

        var nx = x / (a * a);
        var ny = -y / (c * c);
        var nz = z / (sz * sz * a * a);
        var len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len > 0) { nx /= len; ny /= len; nz /= len; }

        vertices.push(x, y, z, rCol, gCol, bCol, aCol, nx, ny, nz);
      }
    }

    for (var j = 0; j < stacks; j++) {
      for (var i = 0; i < slices; i++) {
        var p = j * (slices + 1) + i;
        var q = p + slices + 1;
        faces.push(p, p + 1, q + 1);
        faces.push(p, q + 1, q);
      }
    }

    return { vertex: vertices, faces: faces };
  },

  // 9. HoledCap (Penutup tanduk bom berlubang)
  createHoledCap: function (slices, rx, rz, hr, hz, y, ny, color) {
    var vertices = [];
    var faces = [];
    var rCol = color[0], gCol = color[1], bCol = color[2], aCol = color[3] ?? 1.0;
    var Na = Math.floor(slices / 2);
    var Nc = Math.floor(slices / 2);

    [1, -1].forEach(function (s) {
      var B = [];
      var base = vertices.length / 10;
      for (var k = 0; k <= Na; k++) {
        var ph = (Math.PI * k) / Na;
        B.push([rx * Math.cos(ph), s * rz * Math.sin(ph)]);
      }
      for (var k = 1; k < Nc; k++) {
        B.push([-rx + (2 * rx * k) / Nc, 0]);
      }
      var N = B.length;
      for (var k = 0; k < N; k++) {
        var th = Math.atan2(B[k][1] - s * hz, B[k][0]);
        vertices.push(B[k][0], y, B[k][1], rCol, gCol, bCol, aCol, 0, ny, 0);
        vertices.push(hr * Math.cos(th), y, s * hz + hr * Math.sin(th), rCol, gCol, bCol, aCol, 0, ny, 0);
      }
      for (var k = 0; k < N; k++) {
        var b0 = base + 2 * k;
        var b1 = base + 2 * ((k + 1) % N);
        faces.push(b0 + 1, b0, b1);
        faces.push(b0 + 1, b1, b1 + 1);
      }
    });

    return { vertex: vertices, faces: faces };
  },

  // 10. Tube kurva Catmull-Rom (Sumbu bom)
  createTube: function (points, radius, tSeg, rSeg, color) {
    var P = [points[0]].concat(points, [points[points.length - 1]]);
    var m = points.length - 1;
    var rCol = color[0], gCol = color[1], bCol = color[2], aCol = color[3] ?? 1.0;

    function at(t) {
      var k = Math.min(m - 1, Math.floor(t * m));
      var u = t * m - k;
      var p0 = P[k], p1 = P[k + 1], p2 = P[k + 2], p3 = P[k + 3];
      var o = [];
      for (var d = 0; d < 3; d++) {
        o.push(
          0.5 *
            (2 * p1[d] +
              (-p0[d] + p2[d]) * u +
              (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * u * u +
              (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * u * u * u)
        );
      }
      return o;
    }

    function norm3(v) {
      var l = Math.hypot(v[0], v[1], v[2]) || 1;
      return [v[0] / l, v[1] / l, v[2] / l];
    }

    var vertices = [];
    var faces = [];

    for (var j = 0; j <= tSeg; j++) {
      var t = j / tSeg;
      var p = at(t);
      var q = at(Math.min(1, t + 0.01));
      var q0 = at(Math.max(0, t - 0.01));
      var T = norm3([q[0] - q0[0], q[1] - q0[1], q[2] - q0[2]]);
      var Bv = norm3([T[1], -T[0], 0]);
      var Nv = [
        Bv[1] * T[2] - Bv[2] * T[1],
        Bv[2] * T[0] - Bv[0] * T[2],
        Bv[0] * T[1] - Bv[1] * T[0],
      ];

      for (var i = 0; i <= rSeg; i++) {
        var a = (i / rSeg) * 2 * Math.PI;
        var ca = Math.cos(a), sa = Math.sin(a);
        var nx = ca * Nv[0] + sa * Bv[0];
        var ny = ca * Nv[1] + sa * Bv[1];
        var nz = ca * Nv[2] + sa * Bv[2];

        vertices.push(
          p[0] + radius * nx,
          p[1] + radius * ny,
          p[2] + radius * nz,
          rCol, gCol, bCol, aCol,
          nx, ny, nz
        );
      }
    }

    for (var j = 0; j < tSeg; j++) {
      for (var i = 0; i < rSeg; i++) {
        var a0 = j * (rSeg + 1) + i;
        var b0 = a0 + rSeg + 1;
        faces.push(a0, a0 + 1, b0 + 1);
        faces.push(a0, b0 + 1, b0);
      }
    }

    return { vertex: vertices, faces: faces };
  },

  // 11. CrownCuff (Gelang mahkota berlekuk di ekor bom)
  createCrownCuff: function (slices, stacks, r0, r1, height, notch, numNotches, color) {
    var vertices = [];
    var faces = [];
    var rCol = color[0], gCol = color[1], bCol = color[2], aCol = color[3] ?? 1.0;
    var NU = slices || 80;
    var NV = stacks || 8;

    for (var i = 0; i <= NU; i++) {
      var th = (i / NU) * 2 * Math.PI;
      var fr = ((i / NU) * numNotches) % 1;
      var edge = height - notch * (1 - Math.abs(2 * fr - 1));

      for (var j = 0; j <= NV; j++) {
        var y = (edge * j) / NV;
        var r = r0 + (r1 - r0) * (y / height);

        var nx = Math.sin(th);
        var ny = (r0 - r1) / height;
        var nz = Math.cos(th);
        var len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;

        vertices.push(r * Math.sin(th), y, r * Math.cos(th), rCol, gCol, bCol, aCol, nx, ny, nz);
      }
    }

    for (var i = 0; i < NU; i++) {
      for (var j = 0; j < NV; j++) {
        var a = i * (NV + 1) + j;
        var b = (i + 1) * (NV + 1) + j;
        faces.push(a, b, a + 1);
        faces.push(b, b + 1, a + 1);
      }
    }

    return { vertex: vertices, faces: faces };
  },

  /*========================= MATRIKS TRANSFORMASI FUNGSIONAL ========================= */
  translation: function (x, y, z) {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
  },
  scaling: function (x, y, z) {
    return new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]);
  },
  rotationX: function (a) {
    var c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
  },
  rotationY: function (a) {
    var c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
  },
  rotationZ: function (a) {
    var c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  },
  rotationAxis: function (axis, angle) {
    var l = Math.hypot(axis[0], axis[1], axis[2]) || 1;
    var x = axis[0] / l, y = axis[1] / l, z = axis[2] / l;
    var c = Math.cos(angle), s = Math.sin(angle), C = 1 - c;
    return new Float32Array([
      x * x * C + c,     y * x * C + z * s, z * x * C - y * s, 0,
      x * y * C - z * s, y * y * C + c,     z * y * C + x * s, 0,
      x * z * C + y * s, y * z * C - x * s, z * z * C + c,     0,
      0,                 0,                 0,                 1,
    ]);
  },
  fromTo: function (a, b) {
    function norm3(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
    var aN = norm3(a), bN = norm3(b);
    var vx = aN[1] * bN[2] - aN[2] * bN[1], vy = aN[2] * bN[0] - aN[0] * bN[2], vz = aN[0] * bN[1] - aN[1] * bN[0];
    var c = aN[0] * bN[0] + aN[1] * bN[1] + aN[2] * bN[2], R;
    if (c < -0.99999) {
      var u = Math.abs(aN[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      var ax = norm3([aN[1] * u[2] - aN[2] * u[1], aN[2] * u[0] - aN[0] * u[2], aN[0] * u[1] - aN[1] * u[0]]);
      R = [
        [2 * ax[0] * ax[0] - 1, 2 * ax[0] * ax[1],     2 * ax[0] * ax[2]],
        [2 * ax[1] * ax[0],     2 * ax[1] * ax[1] - 1, 2 * ax[1] * ax[2]],
        [2 * ax[2] * ax[0],     2 * ax[2] * ax[1],     2 * ax[2] * ax[2] - 1]
      ];
    } else {
      var k = 1 / (1 + c);
      R = [
        [1 - k * (vy * vy + vz * vz), -vz + k * vx * vy,       vy + k * vx * vz],
        [vz + k * vx * vy,         1 - k * (vx * vx + vz * vz), -vx + k * vy * vz],
        [-vy + k * vx * vz,        vx + k * vy * vz,         1 - k * (vx * vx + vy * vy)]
      ];
    }
    var m = LIBS.get_I4();
    for (var col = 0; col < 3; col++) {
      for (var row = 0; row < 3; row++) {
        m[col * 4 + row] = R[row][col];
      }
    }
    return m;
  },
  mul: function (a, b) {
    return LIBS.multiply(a, b);
  },
};
