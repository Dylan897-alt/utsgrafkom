function main() {
  var CANVAS = document.getElementById("mycanvas");
  CANVAS.width = window.innerWidth;
  CANVAS.height = window.innerHeight;

  // Inisialisasi WebGL
  var GL;
  GL = CANVAS.getContext("webgl", { antialias: true });
  if (!GL) {
    alert("WebGL tidak didukung");
    return false;
  }

  // Ekstensi supaya index boleh 32-bit (Uint32Array / GL.UNSIGNED_INT)
  var EXT = GL.getExtension("OES_element_index_uint");
  if (!EXT) {
    alert("Ekstensi OES_element_index_uint tidak didukung");
    return false;
  }

  // Ekstensi turunan (fwidth), dipakai untuk garis tipis di badan kaktus
  GL.getExtension("OES_standard_derivatives");

  /*========================= SHADERS ========================= */
  var shader_vertex_source = `
    attribute vec3 position;
    attribute vec3 normal;
    uniform mat4 Pmatrix, Vmatrix, Mmatrix;
    uniform mat3 Nmatrix;

    varying vec3 vNormal;
    varying vec3 vView;

    void main(void) {
        vec4 worldPos = Mmatrix * vec4(position, 1.0);
        gl_Position = Pmatrix * Vmatrix * worldPos;

        // Nmatrix dipakai untuk mentransformasikan normal, worldPos untuk posisi vertex
        vNormal = Nmatrix * normal;
        vView = worldPos.xyz;
    }`;

  var shader_fragment_source = `
    #extension GL_OES_standard_derivatives : enable
    precision mediump float;

    varying vec3 vNormal;
    varying vec3 vView;

    uniform vec3 base_color, second_color, eye_position;
    uniform float render_mode, specular_amount, alpha;

    void main(void) {
        // render_mode 2 : langit (gradasi dari bawah ke atas)
        if (render_mode > 1.5 && render_mode < 2.5) {
            gl_FragColor = vec4(mix(second_color, base_color, clamp(vView.y / 45., 0., 1.)), 1.);
            return;
        }

        // render_mode 3 : bayangan di tanah
        if (render_mode > 2.5 && render_mode < 3.5) {
            gl_FragColor = vec4(0., 0., 0., .32);
            return;
        }

        // render_mode 4 : warna polos tanpa pencahayaan (matahari, awan, cahaya Ulti)
        if (render_mode > 3.5 && render_mode < 4.5) {
            gl_FragColor = vec4(base_color, 1.);
            return;
        }

        vec3 color = base_color;

        // render_mode 1 : tanah gurun (motif bergelombang + lingkaran gelap + kabut di kejauhan)
        if (render_mode > .5 && render_mode < 1.5) {
            float d = length(vView.xz);
            float k = .5 + .5 * sin(vView.x * 1.3) * sin(vView.z * 1.3);
            color = mix(base_color, base_color * 1.12, k * .5);
            color = mix(color, base_color * .75, smoothstep(.35, 0., abs(d - 3.2)));
            color = mix(color, second_color, smoothstep(14., 36., d));
        }

        // render_mode 6 : garis-garis tipis vertikal pada badan kaktus
        if (render_mode > 5.5 && render_mode < 6.5) {
            float ang = atan(vNormal.z, vNormal.x);
            float f = abs(sin((ang - 1.5708) * 3.0));
            #ifdef GL_OES_standard_derivatives
            float w = clamp(fwidth(f), .001, .015) * .75;
            #else
            float w = .004;
            #endif
            float line = 1. - smoothstep(.03 - w, .03 + w, f);
            color = mix(color, color * .4, line * .5);
        }

        vec3 V = normalize(eye_position - vView);    // Arah ke kamera
        vec3 N = normalize(vNormal);
        if (dot(N, V) < 0.) N = -N;                  // Permukaan tipis kelihatan dari dua sisi

        vec3 L = normalize(vec3(.5, 1., .6));        // Arah menuju cahaya
        float lambert = max(dot(N, L), 0.);

        // Ambient (hemisphere: bawah keunguan, atas kebiruan) + diffuse
        vec3 hemi = mix(vec3(.35, .25, .4), vec3(.6, .7, .8), N.y * .5 + .5);
        vec3 I = color * (hemi * .55 + vec3(1., .95, .85) * lambert * .75);

        // Specular (Blinn-Phong)
        I += vec3(1.) * pow(max(dot(N, normalize(L + V)), 0.), 36.) * specular_amount;

        // Rim light tipis di tepi objek
        I += vec3(.6, .8, 1.) * pow(1. - max(dot(N, V), 0.), 3.) * .22;

        gl_FragColor = vec4(I, alpha);
    }`;

  var compile_shader = function (source, type, typeString) {
    var shader = GL.createShader(type);
    GL.shaderSource(shader, source);
    GL.compileShader(shader);
    if (!GL.getShaderParameter(shader, GL.COMPILE_STATUS)) {
      alert(
        "ERROR IN " + typeString + " SHADER : " + GL.getShaderInfoLog(shader),
      );
      return false;
    }
    return shader;
  };

  var shader_vertex = compile_shader(
    shader_vertex_source,
    GL.VERTEX_SHADER,
    "VERTEX",
  );
  var shader_fragment = compile_shader(
    shader_fragment_source,
    GL.FRAGMENT_SHADER,
    "FRAGMENT",
  );

  var SHADER_PROGRAM = GL.createProgram();
  GL.attachShader(SHADER_PROGRAM, shader_vertex);
  GL.attachShader(SHADER_PROGRAM, shader_fragment);
  GL.linkProgram(SHADER_PROGRAM);

  var _position = GL.getAttribLocation(SHADER_PROGRAM, "position");
  GL.enableVertexAttribArray(_position);

  var _normal = GL.getAttribLocation(SHADER_PROGRAM, "normal");
  GL.enableVertexAttribArray(_normal);

  var _Pmatrix = GL.getUniformLocation(SHADER_PROGRAM, "Pmatrix");
  var _Vmatrix = GL.getUniformLocation(SHADER_PROGRAM, "Vmatrix");
  var _Mmatrix = GL.getUniformLocation(SHADER_PROGRAM, "Mmatrix");
  var _Nmatrix = GL.getUniformLocation(SHADER_PROGRAM, "Nmatrix");

  var _base_color = GL.getUniformLocation(SHADER_PROGRAM, "base_color");
  var _second_color = GL.getUniformLocation(SHADER_PROGRAM, "second_color");
  var _eye_position = GL.getUniformLocation(SHADER_PROGRAM, "eye_position");
  var _render_mode = GL.getUniformLocation(SHADER_PROGRAM, "render_mode");
  var _specular_amount = GL.getUniformLocation(SHADER_PROGRAM, "specular_amount");
  var _alpha = GL.getUniformLocation(SHADER_PROGRAM, "alpha");

  GL.useProgram(SHADER_PROGRAM);

  /*========================= MATRIX ========================= */
  var PROJMATRIX = LIBS.get_projection(
    49,
    CANVAS.width / CANVAS.height,
    0.1,
    300,
  );
  var VIEWMATRIX = LIBS.get_I4();
  var VPMATRIX = LIBS.get_I4(); // Proyeksi * View, dipakai untuk mengubah titik 3D ke posisi layar
  var IDENTITY = LIBS.get_I4(); // Matriks identitas (jangan diubah isinya)

  var resize = function () {
    CANVAS.width = window.innerWidth;
    CANVAS.height = window.innerHeight;
    PROJMATRIX = LIBS.get_projection(
      49,
      CANVAS.width / CANVAS.height,
      0.1,
      300,
    );
  };
  window.addEventListener("resize", resize, false);

  // Matriks hasil dari matriks induk lalu translasi (tx,ty,tz) dan skala (sx,sy,sz)
  var matrix_TS = function (parent, tx, ty, tz, sx, sy, sz) {
    var M = LIBS.copy(parent);
    LIBS.translate(M, tx, ty, tz);
    LIBS.scale(M, sx, sy, sz);
    return M;
  };

  var matrix_rotX = function (angle) {
    var M = LIBS.get_I4();
    LIBS.rotateX(M, angle);
    return M;
  };

  /*========================= KURVA BEZIER & MESH PARAMETRIK ========================= */
  var TAU = Math.PI * 2;

  // Kurva Bezier kubik (P berisi 4 titik kontrol, t dari 0 sampai 1)
  var bezier = function (P, t) {
    var s = 1 - t;
    var hasil = [];
    for (var k = 0; k < P[0].length; k++) {
      hasil.push(
        s * s * s * P[0][k] +
          3 * s * s * t * P[1][k] +
          3 * s * t * t * P[2][k] +
          t * t * t * P[3][k],
      );
    }
    return hasil;
  };

  // Membuat mesh dari fungsi parametrik fn(u, v) -> [x, y, z]
  // Normal dihitung dari turunan numerik. Format vertex: posisi(3) + normal(3)
  var buat_mesh = function (fn, nu, nv) {
    var vertices = [];
    var indices = [];

    for (var j = 0; j <= nv; j++) {
      for (var i = 0; i <= nu; i++) {
        var u = i / nu;
        var v = j / nv;
        var p = fn(u, v);

        var vv = Math.min(Math.max(v, 0.002), 0.998);
        var e = 0.002;
        var du = LIBS.vec_sub(fn(u + e, vv), fn(u - e, vv));
        var dv = LIBS.vec_sub(fn(u, vv + e), fn(u, vv - e));
        var n = LIBS.vec_normalize(LIBS.vec_cross(du, dv));

        vertices.push(p[0], p[1], p[2], n[0], n[1], n[2]);
      }
    }

    for (var j = 0; j < nv; j++) {
      for (var i = 0; i < nu; i++) {
        var a = j * (nu + 1) + i;
        var b = a + 1;
        var c = a + nu + 1;
        var d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    return kirim_ke_buffer(vertices, indices);
  };

  var kirim_ke_buffer = function (vertices, indices) {
    var vertex_buffer = GL.createBuffer();
    GL.bindBuffer(GL.ARRAY_BUFFER, vertex_buffer);
    GL.bufferData(
      GL.ARRAY_BUFFER,
      new Float32Array(vertices),
      GL.STATIC_DRAW,
    );

    var faces_buffer = GL.createBuffer();
    GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, faces_buffer);
    GL.bufferData(
      GL.ELEMENT_ARRAY_BUFFER,
      new Uint32Array(indices),
      GL.STATIC_DRAW,
    );

    return { vertex: vertex_buffer, faces: faces_buffer, count: indices.length };
  };

  // Tabung yang mengikuti kurva Bezier P dengan jari-jari radius(v)
  var buat_tabung = function (P, radius, nu, nv) {
    return buat_mesh(function (u, v) {
      var c = bezier(P, v);
      var Tg = LIBS.vec_normalize(
        LIBS.vec_sub(
          bezier(P, Math.min(v + 0.01, 1)),
          bezier(P, Math.max(v - 0.01, 0)),
        ),
      );
      var N = LIBS.vec_normalize(
        LIBS.vec_cross(Tg, Math.abs(Tg[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]),
      );
      var B = LIBS.vec_cross(Tg, N);
      var a = u * TAU;
      var r = radius(v);

      return [
        c[0] + r * (Math.cos(a) * N[0] + Math.sin(a) * B[0]),
        c[1] + r * (Math.cos(a) * N[1] + Math.sin(a) * B[1]),
        c[2] + r * (Math.cos(a) * N[2] + Math.sin(a) * B[2]),
      ];
    }, nu, nv);
  };

  // Kotak (Power Box) dengan normal per sisi
  var buat_kotak = function () {
    var F = [
      [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
      [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
      [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]],
      [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
      [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]],
      [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
    ];

    var vertices = [];
    var indices = [];
    var vi = 0;

    for (var f = 0; f < F.length; f++) {
      var n = F[f][0];
      var vs = F[f][1];
      for (var k = 0; k < 4; k++) {
        vertices.push(vs[k][0], vs[k][1], vs[k][2], n[0], n[1], n[2]);
      }
      indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      vi += 4;
    }

    return kirim_ke_buffer(vertices, indices);
  };

  /*========================= MESH OBJEK ========================= */
  // Objek 1: Ellipsoid (dipakai juga untuk mata, tangan, awan, matahari, dll.)
  var SPHERE = buat_mesh(function (u, v) {
    return [
      Math.cos(u * TAU) * Math.sin(v * Math.PI),
      Math.cos(v * Math.PI),
      Math.sin(u * TAU) * Math.sin(v * Math.PI),
    ];
  }, 32, 20);

  // Objek 2: Kerucut
  var CONE = buat_mesh(function (u, v) {
    return [(1 - v) * Math.cos(u * TAU), v, (1 - v) * Math.sin(u * TAU)];
  }, 20, 6);

  // Objek 3: Badan (profil dua kurva Bezier yang disatukan, diputar mengelilingi sumbu Y)
  var BADAN_1 = [[0, 0], [0.95, 0], [1.0, 0.35], [1.0, 1.0]];
  var BADAN_2 = [[1.0, 1.0], [1.0, 1.65], [0.95, 2.0], [0, 2.0]];
  var profil = function (v) {
    return v < 0.5 ? bezier(BADAN_1, v * 2) : bezier(BADAN_2, (v - 0.5) * 2);
  };

  var BODY = buat_mesh(function (u, v) {
    var p = profil(v);
    var a = u * TAU;
    return [p[0] * Math.cos(a), p[1], p[0] * Math.sin(a)];
  }, 40, 40);

  // Celana pendek (dari pinggul sampai paha)
  var CELANA_P = [[0.68, 0], [0.95, 0.02], [1.03, 0.18], [0.98, 0.35]];
  var PANTS = buat_mesh(function (u, v) {
    var p = bezier(CELANA_P, v);
    var a = u * TAU;
    return [p[0] * Math.cos(a), p[1], p[0] * Math.sin(a)];
  }, 32, 14);

  // Objek 4: Elliptic paraboloid (y = 1 - x^2 - z^2), dipakai untuk duri
  var PARABOLOID = buat_mesh(function (u, v) {
    var p = 1 - v;
    var a = u * TAU;
    return [p * Math.cos(a), 1 - p * p, p * Math.sin(a)];
  }, 16, 8);

  // Mulut, lengan, kaki (tabung mengikuti kurva Bezier)
  var MOUTH_P = [[-0.34, 0.07, 0], [-0.17, -0.17, 0], [0.17, -0.17, 0], [0.34, 0.07, 0]];
  var MOUTH = buat_tabung(MOUTH_P, function (v) {
    return 0.075 + 0.035 * Math.sin(v * Math.PI);
  }, 12, 16);

  var ARM_P = [[0, 0, 0], [0.1, -0.2, 0.05], [0.16, -0.42, 0.09], [0.14, -0.56, 0.15]];
  var ARM = buat_tabung(ARM_P, function (v) {
    return 0.22 * (1 - 0.17 * v);
  }, 16, 24);

  var LEG_P = [[0, 0, 0], [0.03, -0.2, 0.04], [0, -0.4, 0.015], [0.015, -0.53, 0.06]];
  var LEG = buat_tabung(LEG_P, function (v) {
    return 0.2 * (1 - 0.15 * v);
  }, 14, 18);
  var LEGLEN = 0.53;

  // Tanah berbentuk piringan
  var GROUND = buat_mesh(function (u, v) {
    return [45 * v * Math.cos(u * TAU), 0, 45 * v * Math.sin(u * TAU)];
  }, 64, 24);

  // Power Box
  var BOX = buat_kotak();
  var HANDLE_P = [[-0.55, 0, 0], [-0.62, 0.95, 0], [0.62, 0.95, 0], [0.55, 0, 0]];
  var HANDLE = buat_tabung(HANDLE_P, function (v) {
    return 0.13;
  }, 10, 16);

  /*========================= DATA PERMUKAAN BADAN ========================= */
  // Titik-titik profil badan, dipakai untuk menempelkan duri, mata, dan rompi tepat di permukaan
  var PROFIL = [];
  for (var i = 0; i <= 400; i++) {
    PROFIL.push(profil(i / 400));
  }

  // Mengembalikan jari-jari badan (r) dan normal profil (nr, ny) pada ketinggian y
  var permukaan = function (y) {
    var terbaik = 0;
    var jarak_terbaik = 9;
    for (var i = 0; i < PROFIL.length; i++) {
      var d = Math.abs(PROFIL[i][1] - y);
      if (d < jarak_terbaik) {
        jarak_terbaik = d;
        terbaik = i;
      }
    }

    var i0 = Math.max(terbaik - 1, 0);
    var i1 = Math.min(terbaik + 1, 400);
    var dr = PROFIL[i1][0] - PROFIL[i0][0];
    var dy = PROFIL[i1][1] - PROFIL[i0][1];
    var l = Math.hypot(dr, dy) || 1;

    return { r: PROFIL[terbaik][0], nr: dy / l, ny: -dr / l };
  };

  // Duri-duri di badan (4 baris, kiri-kanan)
  var SPIKES = [];
  var SPIKE_DEF = [[1.92, 0.55], [1.5, 0.65], [1.05, 0.8], [0.55, 0.85]];
  for (var i = 0; i < SPIKE_DEF.length; i++) {
    var sy_ = SPIKE_DEF[i][0];
    var sa_ = SPIKE_DEF[i][1];
    var sp_ = permukaan(sy_);
    var sudut_duri = [sa_, Math.PI - sa_];

    for (var j = 0; j < 2; j++) {
      var ang = sudut_duri[j];
      var d = LIBS.vec_normalize([
        sp_.nr * Math.cos(ang),
        sp_.ny,
        sp_.nr * Math.sin(ang),
      ]);
      SPIKES.push({
        p: [
          sp_.r * Math.cos(ang) - 0.04 * d[0],
          sy_ - 0.04 * d[1],
          sp_.r * Math.sin(ang) - 0.04 * d[2],
        ],
        d: d,
      });
    }
  }

  // Posisi mata (z dihitung dari bentuk badan pada y = 1.6)
  var EYE_R = permukaan(1.6).r;

  /* Rompi punggung: selimut mengikuti profil badan dari sisi kiri -> punggung -> sisi kanan, terbuka di depan.
     Busur dari pusat punggung (-z) sebesar +-VEST_A (~120 derajat) sehingga ujungnya sedikit melewati lengan
     dan benar-benar menutupi pangkal lengan. */
  var VEST_Y0 = 0.5;
  var VEST_Y1 = 1.6;
  var VEST_OFF = 0.07;
  var VEST_A = 2.1;

  var vest_radius = function (y) {
    return permukaan(y).r + VEST_OFF;
  };

  var vest_point = function (a, y, r) {
    return [r * Math.sin(a), y, -r * Math.cos(a)];
  };

  var VEST_SHELL = buat_mesh(function (u, v) {
    var a = LIBS.lerp(-VEST_A, VEST_A, u);
    var y = LIBS.lerp(VEST_Y0, VEST_Y1, v);
    var r = vest_radius(y) + 0.04 * Math.sin(v * Math.PI);
    return vest_point(a, y, r);
  }, 40, 14);

  // Pinggiran atas dan bawah rompi (tabung tipis mengikuti busur)
  var buat_hem = function (y) {
    return buat_mesh(function (u, v) {
      var a = LIBS.lerp(-VEST_A, VEST_A, v);
      var r = vest_radius(y);
      var c = vest_point(a, y, r);
      var d = [Math.sin(a), 0, -Math.cos(a)];
      var q = u * TAU;
      var w = 0.09;
      return [
        c[0] + w * Math.cos(q) * d[0],
        c[1] + w * Math.sin(q),
        c[2] + w * Math.cos(q) * d[2],
      ];
    }, 10, 40);
  };
  var VEST_HEM_LO = buat_hem(VEST_Y0);
  var VEST_HEM_HI = buat_hem(VEST_Y1);

  // Pinggiran kiri dan kanan rompi (bagian depan yang terbuka)
  var buat_tepi = function (a) {
    return buat_mesh(function (u, v) {
      var y = LIBS.lerp(VEST_Y0, VEST_Y1, v);
      var c = vest_point(a, y, vest_radius(y));
      var d = [Math.sin(a), 0, -Math.cos(a)];
      var tg = [Math.cos(a), 0, Math.sin(a)];
      var q = u * TAU;
      var w = 0.12;
      return [
        c[0] + w * (Math.cos(q) * d[0] + Math.sin(q) * tg[0]),
        c[1] + w * (Math.cos(q) * d[1] + Math.sin(q) * tg[1]),
        c[2] + w * (Math.cos(q) * d[2] + Math.sin(q) * tg[2]),
      ];
    }, 10, 16);
  };
  var VEST_EDGE_R = buat_tepi(VEST_A);
  var VEST_EDGE_L = buat_tepi(-VEST_A);

  /*========================= LINGKUNGAN ========================= */
  // Generator angka acak sederhana supaya posisi dekorasi selalu sama setiap dijalankan
  var seed = 7;
  var rnd = function () {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  var ROCKS = [];
  for (var i = 0; i < 14; i++) {
    var a = rnd() * TAU;
    var r = 6 + rnd() * 13;
    ROCKS.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, s: 0.25 + rnd() * 0.5 });
  }

  var CACTI = [];
  for (var i = 0; i < 7; i++) {
    CACTI.push({
      a: i * 0.9 + 0.3,
      r: 8 + (i % 3) * 2.2,
      s: 0.35 + 0.1 * (i % 3),
      i: i,
    });
  }

  var MESAS = [];
  for (var i = 0; i < 6; i++) {
    MESAS.push({ a: i * 1.05 + 0.4, s: 5 + (i % 3) * 2 });
  }

  var CLOUDS = [];
  for (var i = 0; i < 6; i++) {
    CLOUDS.push({ a: i * 1.1, y: 20 + (i % 3) * 4, s: 3 + (i % 2) * 1.5 });
  }

  // Duri-duri yang muncul melingkar saat Ulti
  var ULTI_RING = [];
  for (var i = 0; i < 12; i++) {
    var a = (i / 12) * TAU + rnd() * 0.2;
    ULTI_RING.push({
      a: a,
      r: 1.7 + rnd() * 1.0,
      h: 1.1 + rnd() * 0.6,
      ph: rnd() * 3,
    });
  }

  // Tetesan air dari penyiram saat tumbuh
  var DROPS = [];
  for (var i = 0; i < 7; i++) {
    DROPS.push({ i: i, ox: (rnd() - 0.5) * 0.5, oz: (rnd() - 0.5) * 0.5, ph: rnd() });
  }

  /*========================= EVENTS ========================= */
  var THETA = 0.55, // sudut kamera horizontal
    PHI = 0.3, // sudut kamera vertikal
    DIST = 7; // jarak kamera
  var drag = false;
  var x_prev, y_prev;

  var mouseDown = function (e) {
    drag = true;
    x_prev = e.clientX;
    y_prev = e.clientY;
    CANVAS.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  var mouseUp = function (e) {
    drag = false;
  };

  var mouseMove = function (e) {
    if (!drag) return false;
    THETA -= (e.clientX - x_prev) * 0.008;
    PHI = Math.max(0.02, Math.min(1.3, PHI + (e.clientY - y_prev) * 0.006));
    x_prev = e.clientX;
    y_prev = e.clientY;
    e.preventDefault();
  };

  var mouseWheel = function (e) {
    e.preventDefault();
    DIST = Math.max(4, Math.min(22, DIST * (1 + e.deltaY * 0.001)));
  };

  CANVAS.addEventListener("pointerdown", mouseDown, false);
  CANVAS.addEventListener("pointerup", mouseUp, false);
  CANVAS.addEventListener("pointermove", mouseMove, false);
  CANVAS.addEventListener("wheel", mouseWheel, { passive: false });

  var keys = {};
  var paused = false;

  var keyDown = function (e) {
    keys[e.code] = true;
    if (e.code === "Space") {
      paused = !paused;
      e.preventDefault();
    }
  };

  var keyUp = function (e) {
    keys[e.code] = false;
  };

  window.addEventListener("keydown", keyDown, false);
  window.addEventListener("keyup", keyUp, false);

  /*========================= STATE GAME ========================= */
  var t = 0; // waktu animasi (berhenti saat dijeda)
  var last = 0;

  var growBtn = document.getElementById("growBtn");
  var growPanel = document.getElementById("growUi");
  var uiPanel = document.getElementById("ui");
  var ultiBtn = document.getElementById("ultiBtn");
  var flashEl = document.getElementById("flash");
  var objEl = document.getElementById("obj");

  // Tahap pertumbuhan: seed -> growing -> spike
  var stage = "seed";
  var stageStart = 0;
  var GROW_DUR = 2.6;

  // State karakter: idle, walk, wave, skill, ulti
  var state = "idle";
  var stateStart = 0;
  var walkPhase = 0;
  var posX = 0,
    posZ = 0,
    facing = 0;
  var castX = 0,
    castZ = 0,
    castFacing = 0;
  var DUR = { idle: 1e9, walk: 1e9, wave: 1.8, skill: 1.9, ulti: 2.4 };

  /* Alur permainan: kaktus kecil (musuh) -> Skill auto-aim -> Power Box -> Ulti 2x -> flash -> reset */
  var enemyState = "none"; // none, growing, alive, dying, dead
  var enemyTime = 0;
  var enemyX = 0,
    enemyZ = 0;
  var skillHasTarget = false;
  var skillDist = 2.7;
  var aimFacing = 0;
  var ultiClicks = 0;
  var flash = null; // data efek flash Ulti (null = tidak aktif)

  var boxSpawned = false;
  var boxState = "none"; // none, falling, ground, opening, fading, done
  var boxPos = [0, 0, 0];
  var boxT = 0;
  var ultiUnlocked = false;

  var objTxt = "";
  var setObj = function (s) {
    if (s !== objTxt) {
      objTxt = s;
      objEl.textContent = s;
    }
  };

  var spawnEnemy = function () {
    var a = rnd() * TAU;
    enemyX = posX + Math.sin(a) * 4.5;
    enemyZ = posZ + Math.cos(a) * 4.5;
    enemyState = "growing";
    enemyTime = t;
  };

  var setIdleBtn = function () {
    var tombol = document.querySelectorAll("#ui button");
    for (var i = 0; i < tombol.length; i++) {
      tombol[i].classList.remove("active");
    }
    document.querySelector('#ui button[data-s="idle"]').classList.add("active");
  };

  var startFlash = function () {
    if (flash) return;
    flash = { t0: t, reset: false, cx: 0, cy: 0 };
    uiPanel.style.display = "none";
    flashEl.style.display = "block";
    flashEl.style.pointerEvents = "auto";
    flashEl.style.opacity = 1;
  };

  var resetGame = function () {
    stage = "seed";
    stageStart = t;
    state = "idle";
    stateStart = t;
    posX = 0;
    posZ = 0;
    facing = 0;
    castFacing = 0;
    enemyState = "none";
    skillHasTarget = false;
    boxSpawned = false;
    boxState = "none";
    ultiUnlocked = false;
    ultiClicks = 0;
    ultiBtn.disabled = true;
    ultiBtn.textContent = "Ulti (Super) 🔒";
    setIdleBtn();
    for (var k in keys) {
      keys[k] = false;
    }
    uiPanel.style.display = "none";
    growPanel.style.display = "flex";
  };

  // Mengubah titik 3D dunia menjadi posisi piksel di layar
  var projectPt = function (p) {
    var m = VPMATRIX;
    var x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
    var y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    var w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    return [
      (x / w * 0.5 + 0.5) * window.innerWidth,
      (1 - (y / w * 0.5 + 0.5)) * window.innerHeight,
    ];
  };

  // Mengubah titik lokal karakter (l) menjadi titik dunia, sesuai posisi & arah hadap saat casting
  var worldPt = function (cx, cz, fac, l) {
    var c = Math.cos(fac);
    var s = Math.sin(fac);
    return [cx + l[0] * c + l[2] * s, l[1], cz - l[0] * s + l[2] * c];
  };

  growBtn.onclick = function () {
    if (stage !== "seed") return;
    stage = "growing";
    stageStart = t;
    growPanel.style.display = "none";
  };

  uiPanel.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b || stage !== "spike" || b.disabled || flash) return;

    var kind = b.dataset.s;

    if (kind === "ulti") {
      ultiClicks++;
      if (ultiClicks >= 2) {
        startFlash();
        return;
      }
      b.textContent = "Ulti ⚡ klik 1x lagi!";
    }

    state = kind;
    stateStart = t;
    castX = posX;
    castZ = posZ;
    castFacing = facing;
    skillHasTarget = false;
    skillDist = 2.7;

    // Skill otomatis mengarah ke kaktus kecil
    if (kind === "skill" && (enemyState === "growing" || enemyState === "alive")) {
      var dx = enemyX - posX;
      var dz = enemyZ - posZ;
      aimFacing = Math.atan2(dx, dz);
      skillDist = Math.max(1, Math.hypot(dx, dz) - 0.3);
      skillHasTarget = true;
    }

    var tombol = document.querySelectorAll("#ui button");
    for (var i = 0; i < tombol.length; i++) {
      tombol[i].classList.toggle("active", tombol[i] === b);
    }
  });

  /*========================= WARNA & DRAW ========================= */
  var HAZE = [0.97, 0.86, 0.7];

  // Menggambar satu mesh dengan matriks model M, warna, dan opsi tambahan
  // opt: mode (jenis shader), spec (kilap), alpha (transparansi), color2 (warna kedua)
  var gambar = function (mesh, M, color, opt) {
    opt = opt || {};

    GL.bindBuffer(GL.ARRAY_BUFFER, mesh.vertex);
    GL.vertexAttribPointer(_position, 3, GL.FLOAT, false, 4 * (3 + 3), 0);
    GL.vertexAttribPointer(_normal, 3, GL.FLOAT, false, 4 * (3 + 3), 4 * 3);
    GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, mesh.faces);

    GL.uniformMatrix4fv(_Mmatrix, false, M);
    GL.uniformMatrix3fv(_Nmatrix, false, LIBS.normal_matrix(M));
    GL.uniform3fv(_base_color, color);
    GL.uniform3fv(_second_color, opt.color2 || HAZE);
    GL.uniform1f(_render_mode, opt.mode || 0);
    GL.uniform1f(_specular_amount, opt.spec == null ? 0.25 : opt.spec);
    GL.uniform1f(_alpha, opt.alpha == null ? 1 : opt.alpha);

    GL.drawElements(GL.TRIANGLES, mesh.count, GL.UNSIGNED_INT, 0);
  };

  /*========================= POWER BOX ========================= */
  var gambarPeti = function (M, alpha) {
    var sc = 0.42;
    var BLU = [0.2, 0.24, 0.86];
    var YEL = [0.98, 0.8, 0.22];
    var YEL2 = [0.92, 0.6, 0.16];
    var RED = [0.85, 0.14, 0.14];
    var DK = [0.08, 0.08, 0.08];
    var SIGN = [-1, 1];

    // Bagian bawah (biru) dan atas (kuning)
    gambar(BOX, matrix_TS(M, 0, -sc * 0.55, 0, sc, sc * 0.45, sc), BLU, { spec: 0.4, alpha: alpha });
    gambar(BOX, matrix_TS(M, 0, sc * 0.425, 0, sc, sc * 0.575, sc), YEL, { spec: 0.4, alpha: alpha });

    // Paku merah di 8 sudut
    for (var i = 0; i < 2; i++) {
      for (var j = 0; j < 2; j++) {
        for (var k = 0; k < 2; k++) {
          gambar(
            SPHERE,
            matrix_TS(M, SIGN[i] * sc * 0.88, SIGN[j] * sc * 0.88, SIGN[k] * sc * 0.88, sc * 0.28, sc * 0.28, sc * 0.28),
            RED,
            { spec: 0.5, alpha: alpha },
          );
        }
      }
    }

    // Paku merah kecil di sisi atas
    var SISI = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < SISI.length; i++) {
      gambar(
        SPHERE,
        matrix_TS(M, SISI[i][0] * sc * 0.88, sc * 0.95, SISI[i][1] * sc * 0.88, sc * 0.2, sc * 0.2, sc * 0.2),
        RED,
        { spec: 0.5, alpha: alpha },
      );
    }

    // Pegangan di atas peti
    var hm = LIBS.copy(M);
    LIBS.translate(hm, 0, sc * 1.0, 0);
    gambar(HANDLE, matrix_TS(hm, 0, 0, 0, sc, sc, sc), BLU, { spec: 0.5, alpha: alpha });
    for (var i = 0; i < 2; i++) {
      gambar(SPHERE, matrix_TS(hm, SIGN[i] * sc * 0.55, 0, 0, sc * 0.2, sc * 0.2, sc * 0.2), RED, { spec: 0.5, alpha: alpha });
    }

    // Wajah peti: mata, alis, mulut
    var fz = sc * 1.03;
    for (var i = 0; i < 2; i++) {
      var s = SIGN[i];
      gambar(SPHERE, matrix_TS(M, s * sc * 0.32, sc * 0.22, fz, sc * 0.17, sc * 0.17, sc * 0.06), DK, { spec: 0.3, alpha: alpha });

      var alis = LIBS.copy(M);
      LIBS.translate(alis, s * sc * 0.32, sc * 0.47, fz * 0.98);
      LIBS.rotateZ(alis, s * 0.6);
      LIBS.scale(alis, sc * 0.2, sc * 0.05, sc * 0.05);
      gambar(SPHERE, alis, DK, { spec: 0.3, alpha: alpha });
    }
    gambar(SPHERE, matrix_TS(M, 0, -sc * 0.08, fz + 0.02, sc * 0.36, sc * 0.24, sc * 0.08), YEL2, { spec: 0.4, alpha: alpha });

    // Ornamen kecil di sisi kanan
    var ornamen = LIBS.copy(M);
    LIBS.translate(ornamen, sc * 1.02, sc * 0.08, 0);
    LIBS.rotateZ(ornamen, 0.12);
    LIBS.scale(ornamen, sc * 0.09, sc * 0.32, sc * 0.15);
    gambar(BOX, ornamen, RED, { spec: 0.5, alpha: alpha });
  };

  /*========================= DRAWING ========================= */
  GL.enable(GL.DEPTH_TEST);
  GL.depthFunc(GL.LEQUAL);
  GL.clearDepth(1.0);
  GL.enable(GL.BLEND);
  GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);

  var animate = function (time) {
    requestAnimationFrame(animate);

    var dt = Math.min((time - last) / 1000, 0.05);
    last = time;
    if (!paused) t += dt;

    GL.viewport(0, 0, CANVAS.width, CANVAS.height);
    GL.clearColor(0.6, 0.75, 0.9, 1.0);
    GL.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);

    /*----- Tahap pertumbuhan selesai -> mulai permainan -----*/
    if (stage === "growing" && t - stageStart > GROW_DUR) {
      stage = "spike";
      uiPanel.style.display = "flex";
      if (enemyState === "none") spawnEnemy();
    }

    /*----- Waktu berjalan state karakter -----*/
    var st = t - stateStart;
    if (state !== "idle" && state !== "walk" && st > DUR[state]) {
      state = "idle";
      stateStart = t;
      st = 0;
      setIdleBtn();
    }

    // Saat Skill, badan berputar pelan menghadap kaktus kecil
    if (state === "skill" && skillHasTarget && st < 0.6) {
      var selisih = aimFacing - facing;
      while (selisih > Math.PI) selisih -= TAU;
      while (selisih < -Math.PI) selisih += TAU;
      facing += selisih * Math.min(dt * 10, 1);
      castFacing = facing;
    }

    /*----- Gerak WASD -----*/
    if (stage === "spike" && (state === "idle" || state === "walk")) {
      var mx = 0,
        mz = 0;
      if (keys.KeyW || keys.ArrowUp) mz -= 1;
      if (keys.KeyS || keys.ArrowDown) mz += 1;
      if (keys.KeyA || keys.ArrowLeft) mx -= 1;
      if (keys.KeyD || keys.ArrowRight) mx += 1;

      if (mx || mz) {
        var panjang = Math.hypot(mx, mz);
        mx /= panjang;
        mz /= panjang;
        posX += mx * 2.6 * dt;
        posZ += mz * 2.6 * dt;

        var target = Math.atan2(mx, mz);
        var selisih2 = target - facing;
        while (selisih2 > Math.PI) selisih2 -= TAU;
        while (selisih2 < -Math.PI) selisih2 += TAU;
        facing += selisih2 * Math.min(dt * 8, 1);

        state = "walk";
        walkPhase += dt * 7.5;
      } else if (state === "walk") {
        state = "idle";
      }
    }

    /*----- Kamera -----*/
    var eye = [
      posX + DIST * Math.cos(PHI) * Math.sin(THETA),
      1.8 + DIST * Math.sin(PHI),
      posZ + DIST * Math.cos(PHI) * Math.cos(THETA),
    ];
    VIEWMATRIX = LIBS.look_at(eye, [posX, 1.4, posZ], [0, 1, 0]);
    VPMATRIX = LIBS.multiply(PROJMATRIX, VIEWMATRIX);

    GL.uniformMatrix4fv(_Pmatrix, false, PROJMATRIX);
    GL.uniformMatrix4fv(_Vmatrix, false, VIEWMATRIX);
    GL.uniform3fv(_eye_position, eye);

    /*----- Langit, matahari, awan (tidak menulis depth) -----*/
    GL.depthMask(false);

    gambar(SPHERE, matrix_TS(IDENTITY, 0, 0, 0, 90, 90, 90), [0.28, 0.55, 0.95], { mode: 2 });
    gambar(SPHERE, matrix_TS(IDENTITY, -40, 28, -55, 5, 5, 5), [1, 0.95, 0.6], { mode: 4 });

    var BAGIAN_AWAN = [[0, 0, 1], [1.6, -0.3, 0.7], [-1.6, -0.2, 0.75]];
    for (var i = 0; i < CLOUDS.length; i++) {
      var c = CLOUDS[i];
      var ca = c.a + t * 0.02;
      var cm = LIBS.get_I4();
      LIBS.translate(cm, Math.cos(ca) * 55, c.y, Math.sin(ca) * 55);
      LIBS.rotateY(cm, -ca);

      for (var j = 0; j < BAGIAN_AWAN.length; j++) {
        var q = BAGIAN_AWAN[j];
        gambar(
          SPHERE,
          matrix_TS(cm, q[0] * c.s, q[1] * c.s, 0, c.s * q[2] * 1.3, c.s * 0.45 * q[2], c.s * q[2]),
          [1, 1, 1],
          { mode: 4 },
        );
      }
    }

    GL.depthMask(true);

    /*----- Tanah, mesa, batu, kaktus -----*/
    gambar(GROUND, IDENTITY, [0.93, 0.78, 0.5], { mode: 1, spec: 0 });

    for (var i = 0; i < MESAS.length; i++) {
      var ms = MESAS[i];
      gambar(
        CONE,
        matrix_TS(IDENTITY, Math.cos(ms.a) * 32, 0, Math.sin(ms.a) * 32, ms.s, ms.s * 0.9, ms.s),
        [0.72, 0.42, 0.26],
        { spec: 0 },
      );
    }

    for (var i = 0; i < ROCKS.length; i++) {
      var rk = ROCKS[i];
      gambar(
        SPHERE,
        matrix_TS(IDENTITY, rk.x, 0, rk.z, rk.s * 1.3, rk.s * 0.7, rk.s),
        [0.62, 0.48, 0.38],
        { spec: 0.05 },
      );
    }

    for (var i = 0; i < CACTI.length; i++) {
      var ck = CACTI[i];
      var cb = LIBS.get_I4();
      LIBS.translate(cb, Math.cos(ck.a) * ck.r, 0, Math.sin(ck.a) * ck.r);
      LIBS.rotateY(cb, ck.i);
      LIBS.rotateZ(cb, 0.04 * Math.sin(t * 1.5 + ck.i)); // bergoyang pelan
      LIBS.scale(cb, ck.s, ck.s * 1.3, ck.s);

      gambar(BODY, cb, [0.3, 0.6, 0.16]);
      gambar(ARM, matrix_TS(cb, 0.7, 0.9, 0.04, 1, 1, 1), [0.3, 0.6, 0.16]);
      gambar(SPHERE, matrix_TS(cb, 0, 2.3, 0, 0.28, 0.18, 0.28), [0.95, 0.4, 0.6]);
    }

    /*----- Kaktus kecil musuh: tumbuh dari tanah, hancurkan dengan Skill (auto-aim) -----*/
    if (enemyState === "growing" || enemyState === "alive" || enemyState === "dying") {
      var ea = t - enemyTime;
      if (enemyState === "growing" && ea > 1.6) enemyState = "alive";

      // Duri Skill mengenai kaktus kecil
      if (
        state === "skill" &&
        skillHasTarget &&
        st >= 1.1 &&
        (enemyState === "growing" || enemyState === "alive")
      ) {
        enemyState = "dying";
        enemyTime = t;
        skillHasTarget = false;
      }

      var ea2 = t - enemyTime;
      var dying = enemyState === "dying";

      var g = dying
        ? Math.max(0, 1 - LIBS.smoothstep(0, 0.6, ea2))
        : LIBS.smoothstep(0, 1.5, ea2) *
          (1 + 0.12 * Math.sin(LIBS.clamp(ea2 / 1.5, 0, 1) * Math.PI));
      var shake = dying
        ? Math.sin(ea2 * 70) * 0.06 * (1 - LIBS.clamp(ea2 / 0.6, 0, 1))
        : 0;
      var gm = dying ? g : Math.min(1, ea2 / 0.4);
      var gg = Math.max(g, 0.001);
      var GC = [0.3, 0.62, 0.2];

      var em = LIBS.get_I4();
      LIBS.translate(em, enemyX + shake, 0, enemyZ);
      LIBS.rotateY(em, 0.6);
      LIBS.scale(em, gg, gg, gg);

      // Gundukan tanah
      gambar(SPHERE, matrix_TS(IDENTITY, enemyX, 0, enemyZ, 0.6 * gm, 0.13 * gm, 0.6 * gm), [0.5, 0.34, 0.2], { spec: 0 });

      // Badan
      gambar(BODY, matrix_TS(em, 0, 0, 0, 0.36, 0.34, 0.36), GC, { mode: 6, spec: 0.3 });

      // Dua lengan
      var SISI_L = [1, -1];
      for (var i = 0; i < 2; i++) {
        var es = SISI_L[i];
        var lengan = LIBS.copy(em);
        LIBS.translate(lengan, es * 0.3, 0.2, 0);
        LIBS.rotateZ(lengan, -es * 0.9);
        LIBS.scale(lengan, 0.13, 0.15, 0.13);
        gambar(BODY, lengan, GC, { mode: 6, spec: 0.3 });
      }

      // Bunga di atas
      gambar(SPHERE, matrix_TS(em, 0, 0.7, 0, 0.13, 0.1, 0.13), [0.95, 0.4, 0.6], { spec: 0.4 });

      // Duri kecil melingkar
      for (var i = 0; i < 6; i++) {
        var duri = LIBS.copy(em);
        LIBS.rotateY(duri, (i * TAU) / 6);
        LIBS.translate(duri, 0.35, 0.2 + 0.18 * (i % 2), 0);
        LIBS.rotateZ(duri, -1.4);
        LIBS.scale(duri, 0.03, 0.12, 0.03);
        gambar(CONE, duri, [0.95, 0.93, 0.7], { spec: 0.3 });
      }

      // Lingkaran merah penanda target
      if (!dying) {
        var pr = 0.8 + 0.08 * Math.sin(t * 6);
        gambar(SPHERE, matrix_TS(IDENTITY, enemyX, 0.03, enemyZ, pr, 0.005, pr), [1, 0.25, 0.2], { spec: 0, alpha: 0.45 });
      }

      // Pecahan saat hancur
      if (dying) {
        for (var i = 0; i < 10; i++) {
          var pa = (i / 10) * TAU;
          var pv = 1.6 + 0.4 * (i % 3);
          var partX = enemyX + Math.cos(pa) * pv * ea2;
          var partZ = enemyZ + Math.sin(pa) * pv * ea2;
          var partY = 0.35 + 3.2 * ea2 - 5 * ea2 * ea2;
          var partS = 0.07 * (1 - LIBS.clamp(ea2 / 0.9, 0, 1));

          if (partY > 0 && partS > 0) {
            gambar(
              SPHERE,
              matrix_TS(IDENTITY, partX, partY, partZ, partS, partS, partS),
              i % 2 ? [0.3, 0.62, 0.2] : [0.95, 0.4, 0.6],
              { spec: 0.3 },
            );
          }
        }
        if (ea2 > 0.9) enemyState = "dead";
      }
    }

    /*----- Power Box muncul setelah kaktus kecil hancur -----*/
    if (!boxSpawned && enemyState === "dead") {
      boxSpawned = true;
      boxState = "falling";
      boxT = t;
      boxPos = [enemyX + (rnd() - 0.5) * 1.5, 8, enemyZ + (rnd() - 0.5) * 1.5];
    }

    if (boxState === "falling") {
      var ft = LIBS.clamp((t - boxT) / 1.1, 0, 1);
      boxPos[1] = 8 * (1 - ft) * (1 - ft) + 0.35;
      if (ft >= 1) boxState = "ground";
    }

    if (boxState === "ground") {
      var jarak = Math.hypot(posX - boxPos[0], posZ - boxPos[2]);
      if (jarak < 1.3) {
        boxState = "opening";
        boxT = t;
      }
    }

    if (boxState !== "none" && boxState !== "done") {
      var bm = LIBS.get_I4();
      LIBS.translate(bm, boxPos[0], boxPos[1], boxPos[2]);
      LIBS.rotateY(bm, 0.3 * Math.sin(t * 0.8));

      if (boxState === "falling" || boxState === "ground") {
        gambarPeti(bm, 1);
      } else if (boxState === "opening") {
        var op = LIBS.clamp((t - boxT) / 0.6, 0, 1);
        var wob = Math.sin(op * TAU * 3) * 0.14 * (1 - op);

        var pm = LIBS.copy(bm);
        LIBS.translate(pm, 0, 0.08 * Math.sin(op * Math.PI), 0);
        LIBS.rotateZ(pm, wob);
        gambarPeti(pm, 1);

        // Kilauan emas keluar dari peti
        for (var i = 0; i < 6; i++) {
          var ka = (i / 6) * TAU + op * 2;
          var kr = op * 0.9;
          var ks = 0.05 + 0.04 * op;
          gambar(
            SPHERE,
            matrix_TS(bm, Math.cos(ka) * kr, 0.3 + op * 0.7, Math.sin(ka) * kr, ks, ks, ks),
            [1, 0.9, 0.3],
            { spec: 0.6 },
          );
        }

        if (op >= 1) {
          boxState = "fading";
          boxT = t;
        }
      } else if (boxState === "fading") {
        var fp = LIBS.clamp((t - boxT) / 0.9, 0, 1);
        var al = 1 - fp;
        gambarPeti(matrix_TS(bm, 0, fp * 0.7, 0, 1, 1, 1), al);

        if (fp >= 1) {
          boxState = "done";
          ultiUnlocked = true;
          ultiBtn.disabled = false;
          ultiBtn.textContent = "Ulti (Super)";
        }
      }
    }

    /*========================= KARAKTER SPIKE ========================= */
    var growP =
      stage === "seed"
        ? 0
        : stage === "growing"
          ? LIBS.clamp((t - stageStart) / GROW_DUR, 0, 1)
          : 1;
    var smallScale = 0.26;
    var bodyGrow = stage === "spike" ? 1 : LIBS.lerp(smallScale, 1, LIBS.smoothstep(0, 1, growP));
    var limbT = Math.max(stage === "spike" ? 1 : LIBS.smoothstep(0.2, 1, growP), 0.0005);

    var G = [0.52, 0.88, 0.22];
    var bodyY = 0.05 * Math.sin(t * 2);
    var sx = 1;
    var sy = 1 + 0.014 * Math.sin(t * 2);
    var lean = LIBS.get_I4();
    var armAngL = 0.1 * Math.sin(t * 1.5);
    var armAngR = 0.1 * Math.sin(t * 1.5 + 2.4);
    var armLiftBoth = 0;
    var legAngL = 0.03 * Math.sin(t * 1.1);
    var legAngR = 0.03 * Math.sin(t * 1.1 + 1.6);
    var shadowScale = 1;

    if (state === "walk") {
      legAngL = Math.sin(walkPhase) * 0.7;
      legAngR = Math.sin(walkPhase + Math.PI) * 0.7;
      armAngL = Math.sin(walkPhase + Math.PI) * 0.4;
      armAngR = Math.sin(walkPhase) * 0.4;
      bodyY = 0.04 + 0.05 * Math.abs(Math.sin(walkPhase * 2));
    } else if (state === "wave") {
      var pw = LIBS.smoothstep(0, 0.25, st) - LIBS.smoothstep(1.55, 1.8, st);
      armAngR = 1.35 * pw + Math.sin(st * 9) * 0.35 * pw;
      lean = LIBS.get_I4();
      LIBS.rotateY(lean, 0.12 * pw);
    } else if (state === "skill") {
      var ang;
      if (st < 0.5) {
        var p1 = LIBS.smoothstep(0, 0.5, st);
        ang = -0.75 * p1;
        lean = matrix_rotX(0.15 * p1);
      } else if (st < 0.7) {
        var p2 = LIBS.smoothstep(0.5, 0.7, st);
        ang = LIBS.lerp(-0.75, 1.55, p2);
        lean = matrix_rotX(LIBS.lerp(0.15, -0.1, p2));
      } else {
        var p3 = LIBS.smoothstep(0.7, 1.0, st);
        ang = LIBS.lerp(1.55, 0, p3);
        lean = matrix_rotX(LIBS.lerp(-0.1, 0, p3));
      }
      armAngR = ang;
    } else if (state === "ulti") {
      var pu = LIBS.smoothstep(0, 0.4, st) - LIBS.smoothstep(2.0, 2.4, st);
      armLiftBoth = pu * 2.3;

      if (st < 0.4) {
        // Jongkok dulu
        var pj = LIBS.smoothstep(0, 0.38, st);
        sy = 1 - 0.24 * pj;
        bodyY = 0;
      } else if (st < 1.6) {
        // Melompat tinggi
        var at = (st - 0.4) / 1.2;
        bodyY = Math.sin(at * Math.PI) * 1.5;
        sy = 1 + 0.12 * Math.sin(at * Math.PI);
        legAngL = legAngR = -0.5 * Math.sin(at * Math.PI);
      } else {
        // Mendarat
        var at2 = LIBS.smoothstep(1.6, 1.9, st);
        bodyY = (1 - at2) * 0.15 * Math.sin(at2 * Math.PI + 3.14);
        sy = 1 - 0.06 * (1 - at2);
      }
      shadowScale = 1 - LIBS.clamp(bodyY / 1.5, 0, 1) * 0.7;
    }

    // Menjaga volume badan: kalau menciut ke bawah, melebar ke samping
    sx = 1 / Math.sqrt(Math.max(sy, 0.2));
    sx *= bodyGrow;
    sy *= bodyGrow;

    // B = matriks akar badan, BL = B yang ikut mengecil saat anggota badan belum tumbuh
    var B = LIBS.get_I4();
    LIBS.translate(B, posX, LEGLEN * bodyGrow + bodyY, posZ);
    LIBS.rotateY(B, facing);
    LIBS.scale(B, sx, sy, sx);
    B = LIBS.multiply(B, lean);

    var BL = LIBS.copy(B);
    LIBS.scale(BL, limbT, limbT, limbT);

    // Bayangan di tanah
    gambar(
      SPHERE,
      matrix_TS(IDENTITY, posX, 0.02, posZ, 1.05 * shadowScale * bodyGrow, 0.01, 1.05 * shadowScale * bodyGrow),
      [0, 0, 0],
      { mode: 3 },
    );

    // Kaki (kiri & kanan) beserta telapaknya
    var SISI_K = [[1, legAngL], [-1, legAngR]];
    for (var i = 0; i < 2; i++) {
      var ls = SISI_K[i][0];
      var lang = SISI_K[i][1];

      var LM = LIBS.copy(BL);
      LIBS.translate(LM, ls * 0.34, 0, 0);
      LIBS.rotateX(LM, lang);

      gambar(LEG, LM, [0.32, 0.47, 0.26], { spec: 0.25 });

      var ujung = bezier(LEG_P, 1);
      gambar(
        SPHERE,
        matrix_TS(LM, ujung[0], ujung[1], ujung[2], 0.25, 0.14, 0.32),
        [0.26, 0.39, 0.21],
        { spec: 0.15 },
      );
    }

    // Badan utama
    gambar(BODY, B, G, { spec: 0.35, mode: 6 });

    // Celana pendek, sabuk tipis, dan kancing
    gambar(PANTS, matrix_TS(BL, 0, 0.05, 0, 1, 1, 1), [0.62, 0.35, 0.13], { spec: 0.2 });
    gambar(CONE, matrix_TS(BL, 0, 0.37, 0, 1.0, 0.022, 1.0), [0.42, 0.22, 0.08], { spec: 0.1 });
    gambar(SPHERE, matrix_TS(BL, 0, 0.33, 0.63, 0.08, 0.1, 0.05), [0.35, 0.18, 0.05], { spec: 0.1 });

    // Mata (berkedip tiap 3.3 detik) dan mulut
    var bl = t % 3.3;
    var blink = bl > 3.15 ? 1 - Math.sin(((bl - 3.15) / 0.15) * Math.PI) * 0.9 : 1;
    var D = [0.08, 0.14, 0.02];

    var SISI_M = [-1, 1];
    for (var i = 0; i < 2; i++) {
      var ex_ = SISI_M[i] * 0.36;
      var ez_ = Math.sqrt(Math.max(EYE_R * EYE_R - ex_ * ex_, 0)) * 0.98;
      gambar(SPHERE, matrix_TS(BL, ex_, 1.6, ez_, 0.16, 0.23 * blink, 0.11), D, { spec: 0.5 });
    }
    gambar(MOUTH, matrix_TS(BL, 0, 1.2, 1.0, 1, 1 + 0.15 * Math.abs(bodyY), 0.8), D, { spec: 0.5 });

    // Duri di badan: elliptic paraboloid
    for (var i = 0; i < SPIKES.length; i++) {
      var sk = SPIKES[i];
      var SM = LIBS.copy(B);
      LIBS.translate(SM, sk.p[0], sk.p[1], sk.p[2]);
      LIBS.align_y(SM, sk.d);
      LIBS.rotateY(SM, sk.d[0] * 3);
      LIBS.scale(SM, 0.05, 0.26, 0.02);
      gambar(PARABOLOID, SM, [0.2, 0.4, 0.19], { spec: 0.3 });
    }

    // Lengan (kanan & kiri) beserta tangannya
    var SISI_A = [[1, armAngR], [-1, armAngL]];
    for (var i = 0; i < 2; i++) {
      var as = SISI_A[i][0];
      var aang = SISI_A[i][1];

      var AM = LIBS.copy(BL);
      LIBS.translate(AM, as * 1.04, 0.98, 0.06);
      LIBS.rotateX(AM, -aang - armLiftBoth);
      LIBS.rotateZ(AM, as * 0.08);

      gambar(ARM, AM, G, { spec: 0.3 });

      var tangan = bezier(ARM_P, 1);
      gambar(SPHERE, matrix_TS(AM, tangan[0], tangan[1], tangan[2], 0.3, 0.27, 0.3), G, { spec: 0.35 });
    }

    /* ROMPI UNGU: menyelimuti punggung sampai menutupi pangkal kedua lengan, depan terbuka */
    var PURPLE = [0.42, 0.12, 0.68];
    gambar(VEST_SHELL, BL, PURPLE, { spec: 0.35 });
    gambar(VEST_HEM_LO, BL, PURPLE, { spec: 0.35 });
    gambar(VEST_HEM_HI, BL, PURPLE, { spec: 0.35 });
    gambar(VEST_EDGE_R, BL, PURPLE, { spec: 0.35 });
    gambar(VEST_EDGE_L, BL, PURPLE, { spec: 0.35 });

    // Kancing bunga kuning di tepi rompi dekat lengan (kanan & kiri)
    for (var i = 0; i < 2; i++) {
      var ks_ = SISI_M[i];
      var va = ks_ * (VEST_A - 0.18);
      var vr = vest_radius(1.0) + 0.06;

      var KM = LIBS.copy(BL);
      LIBS.translate(KM, vr * Math.sin(va), 1.0, -vr * Math.cos(va));
      LIBS.rotateY(KM, Math.PI - va);
      LIBS.scale(KM, 0.09, 0.09, 0.04);
      gambar(SPHERE, KM, [1.0, 0.82, 0.1], { spec: 0.6 });
    }

    // Bunga di atas kepala (diam, tidak berputar)
    var F = LIBS.copy(BL);
    LIBS.translate(F, 0, 2.0, 0);
    LIBS.rotateAxis(F, [0.25, 1, 0.2], 0.3);

    for (var i = 0; i < 6; i++) {
      var kelopak = LIBS.copy(F);
      LIBS.rotateY(kelopak, (i * TAU) / 6);
      LIBS.translate(kelopak, 0.2, 0.08, 0);
      LIBS.scale(kelopak, 0.26, 0.28, 0.26);
      gambar(SPHERE, kelopak, [0.93, 0.3, 0.1], { spec: 0.45 });
    }
    gambar(SPHERE, matrix_TS(F, 0, 0.24, 0, 0.24, 0.26, 0.24), [0.98, 0.55, 0.15], { spec: 0.5 });

    /*----- Penyiram air saat tumbuh -----*/
    if (stage === "growing") {
      var canM = LIBS.get_I4();
      LIBS.translate(canM, posX - 0.75, 2.6, posZ - 0.1);
      LIBS.rotateAxis(canM, [1, 0, 0.15], -0.65);

      gambar(CONE, matrix_TS(canM, 0, 0, 0, 0.32, 0.55, 0.32), [0.55, 0.55, 0.6], { spec: 0.5 });
      gambar(SPHERE, matrix_TS(canM, 0, 0.55, 0, 0.12, 0.28, 0.12), [0.55, 0.55, 0.6], { spec: 0.5 });

      for (var i = 0; i < DROPS.length; i++) {
        var dp = DROPS[i];
        var dph = (t * 1.4 + dp.ph) % 1;
        var dy = LIBS.lerp(2.55, 0.15, dph);
        gambar(
          SPHERE,
          matrix_TS(IDENTITY, posX - 0.55 + dp.ox * dph, dy, posZ - 0.05 + dp.oz * dph, 0.045, 0.09, 0.045),
          [0.35, 0.65, 0.95],
          { spec: 0.6 },
        );
      }
    }

    /*----- Efek Skill: bola kaktus melayang lalu duri muncul dari tanah -----*/
    if (state === "skill" && st > 0.6) {
      var start = [0.75, 1.2, 0.4];
      var end = [0, 0.06, skillDist];
      var flightP = LIBS.clamp((st - 0.6) / 0.5, 0, 1);

      if (flightP < 1) {
        var titik = [
          LIBS.lerp(start[0], end[0], flightP),
          LIBS.lerp(start[1], end[1], flightP),
          LIBS.lerp(start[2], end[2], flightP),
        ];
        titik[1] += Math.sin(flightP * Math.PI) * 0.9;

        var pos = worldPt(castX, castZ, castFacing, titik);
        var spin = st * 14;

        gambar(SPHERE, matrix_TS(IDENTITY, pos[0], pos[1], pos[2], 0.16, 0.16, 0.16), [0.3, 0.55, 0.15], { spec: 0.5 });

        for (var i = 0; i < 3; i++) {
          var dm = LIBS.get_I4();
          LIBS.translate(dm, pos[0], pos[1], pos[2]);
          LIBS.rotateY(dm, spin + (i * TAU) / 3);
          LIBS.translate(dm, 0.18, 0, 0);
          LIBS.rotateZ(dm, -1.6);
          LIBS.scale(dm, 0.06, 0.22, 0.06);
          gambar(CONE, dm, [0.9, 0.93, 0.7], { spec: 0.4 });
        }
      } else {
        var bp = LIBS.clamp((st - 1.1) / 0.5, 0, 1);
        var burst = LIBS.smoothstep(0, 0.15, bp) * (1 - LIBS.smoothstep(0.6, 1, bp));
        var ep = worldPt(castX, castZ, castFacing, end);

        for (var i = 0; i < 6; i++) {
          var ba = (i / 6) * TAU;
          var pp = worldPt(castX, castZ, castFacing, [
            end[0] + Math.cos(ba) * 0.35,
            0,
            end[2] + Math.sin(ba) * 0.35,
          ]);
          gambar(
            CONE,
            matrix_TS(IDENTITY, pp[0], pp[1], pp[2], 0.1 * burst + 0.02, 0.55 * burst + 0.02, 0.1 * burst + 0.02),
            [0.93, 0.96, 0.72],
            { spec: 0.4 },
          );
        }
        gambar(SPHERE, matrix_TS(IDENTITY, ep[0], 0.02, ep[2], 0.4 * burst, 0.02, 0.4 * burst), [0.3, 0.15, 0.05], { spec: 0 });
      }
    }

    /*----- Efek Ulti: duri raksasa melingkar mengelilingi Spike -----*/
    if (state === "ulti" && st > 0.35 && st < 2.1) {
      var ub = LIBS.smoothstep(0.35, 0.65, st) * (1 - LIBS.smoothstep(1.7, 2.1, st));

      for (var i = 0; i < ULTI_RING.length; i++) {
        var sp = ULTI_RING[i];
        var wobU = 1 + 0.08 * Math.sin(t * 6 + sp.ph);
        var up = worldPt(castX, castZ, castFacing, [Math.cos(sp.a) * sp.r, 0, Math.sin(sp.a) * sp.r]);

        var um = LIBS.get_I4();
        LIBS.translate(um, up[0], up[1], up[2]);
        LIBS.rotateY(um, sp.a + castFacing);
        LIBS.scale(um, 0.22 * ub * wobU, sp.h * ub, 0.22 * ub * wobU);
        gambar(CONE, um, [0.85, 0.9, 0.6], { spec: 0.4 });
      }
    }

    /*----- Teks tujuan -----*/
    if (flash) setObj("");
    else if (stage === "seed") setObj("Siram air untuk menumbuhkan kaktus menjadi Spike");
    else if (stage === "growing") setObj("Tumbuh...");
    else if (enemyState === "growing" || enemyState === "alive")
      setObj("Hancurkan kaktus kecil dengan Skill (otomatis mengarah ke target)");
    else if (enemyState === "dying") setObj("");
    else if (boxState !== "done" && boxState !== "opening" && boxState !== "fading")
      setObj("Ambil Power Box! (WASD)");
    else if (ultiUnlocked && ultiClicks === 0) setObj("Ulti terbuka! Klik Ulti 2x");
    else if (ultiClicks === 1) setObj("Klik Ulti sekali lagi!");
    else setObj("");

    /*----- FLASH ULTI: dari pusat badan Spike menyebar sampai menutupi layar 3 detik, lalu reset ke awal -----*/
    if (flash) {
      var e = t - flash.t0;
      var cen = [posX, LEGLEN * bodyGrow + bodyY + 1.0, posZ];

      if (e < 1.3) {
        // Bola cahaya membesar di 3D + lingkaran putih menyebar di layar
        var pp2 = projectPt(cen);
        flash.cx = pp2[0];
        flash.cy = pp2[1];

        var fs = 0.2 + 2.6 * LIBS.smoothstep(0, 1.3, e);
        GL.disable(GL.DEPTH_TEST);
        gambar(SPHERE, matrix_TS(IDENTITY, cen[0], cen[1], cen[2], fs, fs, fs), [1, 1, 0.9], { mode: 4 });
        GL.enable(GL.DEPTH_TEST);

        var W = window.innerWidth;
        var H = window.innerHeight;
        var far = Math.max(
          Math.hypot(flash.cx, flash.cy),
          Math.hypot(W - flash.cx, flash.cy),
          Math.hypot(flash.cx, H - flash.cy),
          Math.hypot(W - flash.cx, H - flash.cy),
        );
        var Rr = LIBS.smoothstep(0, 1.3, e) * (far / 0.8 + 20);

        flashEl.style.background =
          "radial-gradient(circle at " + flash.cx + "px " + flash.cy + "px, " +
          "rgba(255,255,255,1) 0px, rgba(255,255,255,1) " + Rr * 0.8 + "px, " +
          "rgba(255,244,190,0) " + Rr + "px)";
      } else if (e < 4.3) {
        // Layar tertutup penuh selama 3 detik, di sini game di-reset diam-diam
        if (!flash.reset) {
          resetGame();
          flash.reset = true;
        }
        flashEl.style.background = "#fff";
      } else if (e < 5.3) {
        flashEl.style.opacity = String(1 - (e - 4.3));
      } else {
        flashEl.style.display = "none";
        flashEl.style.pointerEvents = "none";
        flash = null;
      }
    }

    GL.flush();
  };

  animate(0);
}

window.addEventListener("load", main);
