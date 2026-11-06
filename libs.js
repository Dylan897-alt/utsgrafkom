/*
  LIBS : kumpulan fungsi bantu untuk matriks 4x4, vektor, dan util matematika.

  Semua matriks bertipe Float32Array(16) dengan urutan column-major (seperti yang diminta WebGL).

  Fungsi translate / scale / rotateX / rotateY / rotateZ / rotateAxis mengubah matriks "m"
  secara langsung (in-place) dengan cara POST-MULTIPLY:   m = m * Operasi
  Jadi kalau dipanggil berurutan:

      LIBS.translate(M, x, y, z);
      LIBS.rotateY(M, sudut);
      LIBS.scale(M, 2, 2, 2);

  hasilnya sama dengan  M = T * R * S  (skala dikenakan lebih dulu ke vertex, lalu rotasi, lalu translasi).
  Cara ini enak dipakai untuk hierarki badan -> lengan -> tangan.
*/
var LIBS = {
  degToRad: function (angle) {
    return (angle * Math.PI) / 180;
  },

  /*========================= PROYEKSI & KAMERA ========================= */
  // angle dalam derajat (field of view vertikal), a = lebar / tinggi
  get_projection: function (angle, a, zMin, zMax) {
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
    return new Float32Array(m);
  },

  // hasil = a * b
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

  // m = m * op  (dipakai oleh translate, scale, dan rotate di bawah)
  apply: function (m, op) {
    var hasil = LIBS.multiply(m, op);
    for (var i = 0; i < 16; i++) {
      m[i] = hasil[i];
    }
  },

  /*========================= TRANSFORMASI ========================= */
  translate: function (m, x, y, z) {
    var op = LIBS.get_I4();
    op[12] = x;
    op[13] = y;
    op[14] = z;
    LIBS.apply(m, op);
  },

  scale: function (m, x, y, z) {
    var op = LIBS.get_I4();
    op[0] = x;
    op[5] = y;
    op[10] = z;
    LIBS.apply(m, op);
  },

  // Rotasi terhadap sumbu sembarang (rumus Rodrigues)
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
    LIBS.rotateAxis(m, [1, 0, 0], angle);
  },

  rotateY: function (m, angle) {
    LIBS.rotateAxis(m, [0, 1, 0], angle);
  },

  rotateZ: function (m, angle) {
    LIBS.rotateAxis(m, [0, 0, 1], angle);
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
};
