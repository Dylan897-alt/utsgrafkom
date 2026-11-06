/* =====================================================================
   TICK (Brawl Stars) - WebGL murni + LIBS
   Semua bagian dibuat dari permukaan kuadrik:
   ellipsoid, cylinder, truncated cone, hyperboloid satu lembar, tube mengikuti kurva
   Format vertex: [x y z | nx ny nz | r g b]  (9 float)
   ===================================================================== */

/* ---------------- helper kecil ---------------- */
function rgb(h) { return [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255]; }
function norm3(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function pushV(v, p, n, c) { v.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2]); }

/* ---------------- GENERATOR GEOMETRI ---------------- */

// ELLIPSOID: x²/a² + y²/b² + z²/c² = 1
function generateEllipsoid(a, b, c, stack, step, col) {
    var vertices = [], faces = [];
    for (var i = 0; i <= stack; i++) {
        var u = i / stack * Math.PI - Math.PI / 2;
        for (var j = 0; j <= step; j++) {
            var v = j / step * 2 * Math.PI - Math.PI;
            var x = a * Math.cos(v) * Math.cos(u), y = b * Math.sin(u), z = c * Math.sin(v) * Math.cos(u);
            pushV(vertices, [x, y, z], norm3([x / (a * a), y / (b * b), z / (c * c)]), col);
        }
    }
    for (var i = 0; i < stack; i++)
        for (var j = 0; j < step; j++) {
            var first = i * (step + 1) + j, second = first + 1, third = first + step + 1, fourth = third + 1;
            faces.push(first, second, fourth, first, fourth, third);
        }
    return { vertices: vertices, faces: faces };
}

// CYLINDER / TRUNCATED CONE (rt = rb -> cylinder, rt != rb -> kerucut terpotong), sumbu = Y
function generateCylinder(rt, rb, h, seg, col, open) {
    var v = [], f = [], hh = h / 2, sl = (rb - rt) / h, i, t, s, c, n;
    for (i = 0; i <= seg; i++) {
        t = i / seg * 2 * Math.PI; s = Math.sin(t); c = Math.cos(t); n = norm3([s, sl, c]);
        pushV(v, [rt * s, hh, rt * c], n, col);
        pushV(v, [rb * s, -hh, rb * c], n, col);
    }
    for (i = 0; i < seg; i++) { var a = 2 * i; f.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    if (!open) {
        [[rt, hh, 1], [rb, -hh, -1]].forEach(function (cp) {
            if (cp[0] <= 0) return;
            var base = v.length / 9, nn = [0, cp[2], 0];
            pushV(v, [0, cp[1], 0], nn, col);
            for (i = 0; i <= seg; i++) {
                t = i / seg * 2 * Math.PI;
                pushV(v, [cp[0] * Math.sin(t), cp[1], cp[0] * Math.cos(t)], nn, col);
            }
            for (i = 0; i < seg; i++) f.push(base, base + 1 + i, base + 2 + i);
        });
    }
    return { vertices: v, faces: f };
}

// cincin datar (annulus) di bidang XZ, r0 = 0 -> cakram
function generateAnnulus(r0, r1, seg, col) {
    var v = [], f = [], n = [0, 1, 0];
    for (var i = 0; i <= seg; i++) {
        var t = i / seg * 2 * Math.PI, s = Math.sin(t), c = Math.cos(t);
        pushV(v, [r0 * s, 0, r0 * c], n, col);
        pushV(v, [r1 * s, 0, r1 * c], n, col);
    }
    for (var i = 0; i < seg; i++) { var a = 2 * i; f.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    return { vertices: v, faces: f };
}

// HYPERBOLOID SATU LEMBAR (dinding): (x² + (z/sz)²)/a² - y²/c² = 1, y dari -h..h. sz memipihkan penampang
function generateHyperboloid(a, c, h, sz, stack, seg, col) {
    var v = [], f = [];
    for (var j = 0; j <= stack; j++) {
        var y = -h + 2 * h * j / stack, r = a * Math.sqrt(1 + y * y / (c * c));
        for (var i = 0; i <= seg; i++) {
            var ph = i / seg * 2 * Math.PI, x = r * Math.cos(ph), z = sz * r * Math.sin(ph);
            pushV(v, [x, y, z], norm3([x / (a * a), -y / (c * c), z / (sz * sz * a * a)]), col);
        }
    }
    for (var j = 0; j < stack; j++)
        for (var i = 0; i < seg; i++) {
            var p = j * (seg + 1) + i, q = p + seg + 1;
            f.push(p, p + 1, q + 1, p, q + 1, q);
        }
    return { vertices: v, faces: f };
}

// Tutup hyperboloid berbentuk elips dengan 2 LUBANG TEMBUS (diskretisasi: tiap belahan elips = strip
// antara lingkaran lubang dan tepi belahan elips)
function generateHoledCap(rx, rz, hr, hz, y, ny, seg, col) {
    var v = [], f = [], Na = seg / 2, Nc = seg / 2, n = [0, ny, 0];
    [1, -1].forEach(function (s) {
        var B = [], k, base = v.length / 9;
        for (k = 0; k <= Na; k++) { var ph = Math.PI * k / Na; B.push([rx * Math.cos(ph), s * rz * Math.sin(ph)]); }
        for (k = 1; k < Nc; k++) B.push([-rx + 2 * rx * k / Nc, 0]);
        var N = B.length;
        for (k = 0; k < N; k++) {
            var th = Math.atan2(B[k][1] - s * hz, B[k][0]);
            pushV(v, [B[k][0], y, B[k][1]], n, col);
            pushV(v, [hr * Math.cos(th), y, s * hz + hr * Math.sin(th)], n, col);
        }
        for (k = 0; k < N; k++) {
            var b0 = base + 2 * k, b1 = base + 2 * ((k + 1) % N);
            f.push(b0 + 1, b0, b1, b0 + 1, b1, b1 + 1);
        }
    });
    return { vertices: v, faces: f };
}

// TUBE mengikuti kurva Catmull-Rom (sumbu/tali bom)
function generateTube(pts, radius, tSeg, rSeg, col) {
    var P = [pts[0]].concat(pts, [pts[pts.length - 1]]), m = pts.length - 1;
    function at(t) {
        var k = Math.min(m - 1, Math.floor(t * m)), u = t * m - k, p0 = P[k], p1 = P[k + 1], p2 = P[k + 2], p3 = P[k + 3], o = [];
        for (var d = 0; d < 3; d++)
            o.push(0.5 * ((2 * p1[d]) + (-p0[d] + p2[d]) * u + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * u * u +
                          (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * u * u * u));
        return o;
    }
    var v = [], f = [];
    for (var j = 0; j <= tSeg; j++) {
        var t = j / tSeg, p = at(t), q = at(Math.min(1, t + 0.01)), q0 = at(Math.max(0, t - 0.01));
        var T = norm3([q[0] - q0[0], q[1] - q0[1], q[2] - q0[2]]);
        var Bv = norm3([T[1], -T[0], 0]);  // T x (0,0,1)
        var Nv = [Bv[1] * T[2] - Bv[2] * T[1], Bv[2] * T[0] - Bv[0] * T[2], Bv[0] * T[1] - Bv[1] * T[0]];
        for (var i = 0; i <= rSeg; i++) {
            var a = i / rSeg * 2 * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
            var n = [ca * Nv[0] + sa * Bv[0], ca * Nv[1] + sa * Bv[1], ca * Nv[2] + sa * Bv[2]];
            pushV(v, [p[0] + radius * n[0], p[1] + radius * n[1], p[2] + radius * n[2]], n, col);
        }
    }
    for (var j = 0; j < tSeg; j++)
        for (var i = 0; i < rSeg; i++) {
            var a0 = j * (rSeg + 1) + i, b0 = a0 + rSeg + 1;
            f.push(a0, a0 + 1, b0 + 1, a0, b0 + 1, b0);
        }
    return { vertices: v, faces: f };
}

// Syal berbentuk V, mengikuti permukaan badan
function generateScarf(col) {
    var v = [], f = [], NU = 72, NV = 14, yTop = 0.8, dmin = 0.25, dmax = 1.0;
    function tubR(y) { return 1.6 + 0.25 * (y - 0.15) / 0.7; }
    function bellyR(y) { var k = (y + 0.15) / 0.95; return k * k < 1 ? 1.6 * Math.sqrt(1 - k * k) : 0; }
    function R(y) { return (y >= 0.15 ? Math.max(tubR(y), bellyR(y)) : bellyR(y)) + 0.05; }
    for (var i = 0; i <= NU; i++) {
        var u = i / NU * 2 * Math.PI, d = dmin + (dmax - dmin) * (1 - Math.abs(Math.sin(u)));
        for (var j = 0; j <= NV; j++) {
            var y = yTop - d * j / NV, r = R(y);
            pushV(v, [r * Math.sin(u), y, r * Math.cos(u)], norm3([Math.sin(u), 0.15, Math.cos(u)]), col);
        }
    }
    for (var i = 0; i < NU; i++)
        for (var j = 0; j < NV; j++) { var a = i * (NV + 1) + j, b = (i + 1) * (NV + 1) + j; f.push(a, b, a + 1, b, b + 1, a + 1); }
    return { vertices: v, faces: f };
}

// Manset kain berbentuk MAHKOTA: truncated cone berongga, tepi atas bergerigi (N puncak)
function generateCrownCuff(r0, r1, L, notch, N, col) {
    var v = [], f = [], NU = 80, NV = 8;
    for (var i = 0; i <= NU; i++) {
        var th = i / NU * 2 * Math.PI, fr = ((i / NU) * N) % 1, edge = L - notch * (1 - Math.abs(2 * fr - 1));
        for (var j = 0; j <= NV; j++) {
            var y = edge * j / NV, r = r0 + (r1 - r0) * (y / L);
            pushV(v, [r * Math.sin(th), y, r * Math.cos(th)], norm3([Math.sin(th), (r0 - r1) / L, Math.cos(th)]), col);
        }
    }
    for (var i = 0; i < NU; i++)
        for (var j = 0; j < NV; j++) { var a = i * (NV + 1) + j, b = (i + 1) * (NV + 1) + j; f.push(a, b, a + 1, b, b + 1, a + 1); }
    return { vertices: v, faces: f };
}


/* ===================================================================== */
function main() {
    /** @type {HTMLCanvasElement} */
    var CANVAS = document.getElementById("mycanvas");
    CANVAS.width = window.innerWidth;
    CANVAS.height = window.innerHeight;

    /*===================== GET WEBGL CONTEXT ===================== */
    /** @type {WebGLRenderingContext} */
    var GL;
    try {
        GL = CANVAS.getContext("webgl", { antialias: true });
    } catch (e) {
        alert("WebGL context cannot be initialized");
        return false;
    }

    /*========================= SHADERS ========================= */
    var shader_vertex_source = `
        attribute vec3 position;
        attribute vec3 normal;
        attribute vec3 color;
        uniform mat4 Pmatrix, Vmatrix, Mmatrix;
        uniform vec3 uLight;
        varying vec3 vColor, vN, vL, vPos;

        void main(void) {
            vec4 vp = Vmatrix * Mmatrix * vec4(position, 1.);
            gl_Position = Pmatrix * vp;
            vPos = vp.xyz;
            vN = (Vmatrix * Mmatrix * vec4(normal, 0.)).xyz;
            vL = (Vmatrix * vec4(uLight, 0.)).xyz;
            vColor = color;
        }`;

    var shader_fragment_source = `
        precision mediump float;
        varying vec3 vColor, vN, vL, vPos;

        void main(void) {
            vec3 V = normalize(-vPos);
            vec3 n = normalize(vN);
            if (dot(n, V) < 0.) n = -n;          // pencahayaan dua sisi
            vec3 l = normalize(vL);
            float d = max(dot(n, l), 0.);
            float s = pow(max(dot(n, normalize(l + V)), 0.), 40.) * 0.25;
            gl_FragColor = vec4(vColor * (0.55 + 0.6 * d) + s, 1.);
        }`;

    var compile_shader = function (source, type, typeString) {
        var shader = GL.createShader(type);
        GL.shaderSource(shader, source);
        GL.compileShader(shader);
        if (!GL.getShaderParameter(shader, GL.COMPILE_STATUS)) {
            alert("ERROR IN " + typeString + " SHADER: " + GL.getShaderInfoLog(shader));
            return false;
        }
        return shader;
    };
    var shader_vertex = compile_shader(shader_vertex_source, GL.VERTEX_SHADER, "VERTEX");
    var shader_fragment = compile_shader(shader_fragment_source, GL.FRAGMENT_SHADER, "FRAGMENT");

    var SHADER_PROGRAM = GL.createProgram();
    GL.attachShader(SHADER_PROGRAM, shader_vertex);
    GL.attachShader(SHADER_PROGRAM, shader_fragment);
    GL.linkProgram(SHADER_PROGRAM);

    var _position = GL.getAttribLocation(SHADER_PROGRAM, "position");
    GL.enableVertexAttribArray(_position);
    var _normal = GL.getAttribLocation(SHADER_PROGRAM, "normal");
    GL.enableVertexAttribArray(_normal);
    var _color = GL.getAttribLocation(SHADER_PROGRAM, "color");
    GL.enableVertexAttribArray(_color);

    var _Pmatrix = GL.getUniformLocation(SHADER_PROGRAM, "Pmatrix");
    var _Vmatrix = GL.getUniformLocation(SHADER_PROGRAM, "Vmatrix");
    var _Mmatrix = GL.getUniformLocation(SHADER_PROGRAM, "Mmatrix");
    var _uLight = GL.getUniformLocation(SHADER_PROGRAM, "uLight");

    GL.useProgram(SHADER_PROGRAM);
    GL.uniform3fv(_uLight, norm3([0.5, 0.9, 0.7]));

    /*======================== BUFFER & SCENE GRAPH ======================== */
    function makeMesh(geo, cull) {
        var vb = GL.createBuffer();
        GL.bindBuffer(GL.ARRAY_BUFFER, vb);
        GL.bufferData(GL.ARRAY_BUFFER, new Float32Array(geo.vertices), GL.STATIC_DRAW);
        var fb = GL.createBuffer();
        GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, fb);
        GL.bufferData(GL.ELEMENT_ARRAY_BUFFER, new Uint16Array(geo.faces), GL.STATIC_DRAW);
        return { vb: vb, fb: fb, count: geo.faces.length, cull: cull || null };
    }

    var Tr = LIBS.translation, RX = LIBS.rotationX, RY = LIBS.rotationY, RZ = LIBS.rotationZ;
    var Y = [0, 1, 0], Z = [0, 0, 1];
    function M() { var m = LIBS.get_I4(); for (var i = 0; i < arguments.length; i++) m = LIBS.mul(m, arguments[i]); return m; }
    function orientY(d) { return LIBS.fromTo(Y, norm3(d)); }

    // node: { mesh, base, off, rot, scl, kids, world }
    function add(parent, mesh, base) {
        var n = { mesh: mesh || null, base: base || LIBS.get_I4(), off: [0, 0, 0], rot: [0, 0, 0], scl: [1, 1, 1], kids: [], world: LIBS.get_I4() };
        if (parent) parent.kids.push(n);
        return n;
    }
    function drawMesh(m, W) {
        GL.uniformMatrix4fv(_Mmatrix, false, new Float32Array(W));
        if (m.cull) { GL.enable(GL.CULL_FACE); GL.cullFace(m.cull === "front" ? GL.FRONT : GL.BACK); }
        else GL.disable(GL.CULL_FACE);
        GL.bindBuffer(GL.ARRAY_BUFFER, m.vb);
        GL.vertexAttribPointer(_position, 3, GL.FLOAT, false, 4 * 9, 0);
        GL.vertexAttribPointer(_normal, 3, GL.FLOAT, false, 4 * 9, 4 * 3);
        GL.vertexAttribPointer(_color, 3, GL.FLOAT, false, 4 * 9, 4 * 6);
        GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, m.fb);
        GL.drawElements(GL.TRIANGLES, m.count, GL.UNSIGNED_SHORT, 0);
    }
    function drawNode(n, pw) {
        var l = LIBS.mul(Tr(n.off[0], n.off[1], n.off[2]), n.base);
        if (n.rot[0] || n.rot[1] || n.rot[2]) l = LIBS.mul(l, M(RZ(n.rot[2]), RY(n.rot[1]), RX(n.rot[0])));
        if (n.scl[0] != 1 || n.scl[1] != 1 || n.scl[2] != 1) l = LIBS.mul(l, LIBS.scaling(n.scl[0], n.scl[1], n.scl[2]));
        n.world = LIBS.mul(pw, l);
        if (n.mesh) drawMesh(n.mesh, n.world);
        for (var i = 0; i < n.kids.length; i++) drawNode(n.kids[i], n.world);
    }

    /*======================== KARAKTER TICK ========================
       Setiap bagian langsung memanggil function generator kuadrik:
       generateEllipsoid, generateCylinder (cylinder / kerucut terpotong),
       generateHyperboloid, generateTube, dst.  makeMesh() = membuat buffer GL.
       ================================================================ */
    var NAVY = 0x343f80, PERI = 0x8d9de6, PERI2 = 0x5a67b0, YEL = 0xffc62a;
    var STACK = 24, STEP = 40, SEG = 40;                       // resolusi mesh
    var HA = 1.35, HB = 1.3, HC = 1.3;                         // semi-axis ellipsoid kepala

    var world = add(null);
    var tick = add(world, null, Tr(0, 1.8, 0));
    var root = add(tick);
    var screws = [];                                           // daftar baut X (dibangun di akhir)
    var swings = [];                                           // node bahu (untuk ayunan tangan)

    /* ---------- BADAN: ellipsoid (perut) + kerucut terpotong (tub) + cylinder (rim) + syal ---------- */
    add(root, makeMesh(generateEllipsoid(1.6, 0.95, 1.55, STACK, STEP, rgb(NAVY))), Tr(0, -0.15, 0));
    add(root, makeMesh(generateCylinder(1.85, 1.6, 0.7, SEG, rgb(PERI2))), Tr(0, 0.5, 0));
    add(root, makeMesh(generateCylinder(1.95, 1.95, 0.35, SEG, rgb(PERI))), Tr(0, 0.95, 0));
    [0.41, 0.64, -0.41, -0.64].forEach(function (u) {          // alur pada rim
        [0, Math.PI].forEach(function (o) {
            var a = u + o;
            add(root, makeMesh(generateCylinder(0.022, 0.022, 0.3, 8, rgb(0x6a76c4))), Tr(1.955 * Math.sin(a), 0.95, 1.955 * Math.cos(a)));
        });
    });
    add(root, makeMesh(generateScarf(rgb(0xe0264f))));          // syal V

    /* ---------- LENCANA: cylinder kuning + ellipsoid pipih hitam ---------- */
    var badge = add(root, null, Tr(0, 0.25, 1.74));
    add(badge, makeMesh(generateCylinder(0.42, 0.42, 0.1, SEG, rgb(YEL))), RX(Math.PI / 2));
    add(badge, makeMesh(generateEllipsoid(0.4, 0.065, 0.015, 12, 24, rgb(0x111111))), Tr(0, 0.085, 0.056));      // pita mata
    add(badge, makeMesh(generateEllipsoid(0.075, 0.075, 0.015, 12, 24, rgb(0x111111))), Tr(-0.14, -0.02, 0.056)); // mata
    add(badge, makeMesh(generateEllipsoid(0.075, 0.075, 0.015, 12, 24, rgb(0x111111))), Tr(0.14, -0.02, 0.056));
    add(badge, makeMesh(generateEllipsoid(0.13, 0.03, 0.015, 12, 24, rgb(0x111111))), Tr(0, -0.14, 0.056));      // senyum

    /* ---------- EKOR: simpul (kerucut terpotong) + manset mahkota bergerigi ---------- */
    var tg = add(root, null, M(Tr(0, -0.62, -1.25), LIBS.fromTo(Y, norm3([0, -0.8, -0.6]))));
    add(tg, makeMesh(generateCylinder(0.46, 0.52, 0.6, SEG, rgb(0x3a4688))), Tr(0, 0.05, 0));
    [0.1, 0.22].forEach(function (y) { add(tg, makeMesh(generateCylinder(0.53, 0.53, 0.03, SEG, rgb(0x5d69b0))), Tr(0, y, 0)); });
    var cuff = add(tg, makeMesh(generateCrownCuff(0.34, 0.46, 0.6, 0.2, 5, rgb(0xf2a888)), "back"), Tr(0, 0.3, 0));   // sisi luar
    add(tg, makeMesh(generateCrownCuff(0.34, 0.46, 0.6, 0.2, 5, rgb(0xc4553a)), "front"), Tr(0, 0.3, 0));             // sisi dalam
    [-0.07, 0.07].forEach(function (x) {                       // jahitan "#"
        add(cuff, makeMesh(generateCylinder(0.012, 0.012, 0.2, 8, rgb(0xd9703c))), Tr(x, 0.3, 0.405));
    });
    [0.25, 0.35].forEach(function (y) {
        add(cuff, makeMesh(generateCylinder(0.012, 0.012, 0.2, 8, rgb(0xd9703c))), M(Tr(0, y, 0.38 + 0.12 * y / 0.6), RZ(Math.PI / 2)));
    });

    /* ---------- KEPALA: ellipsoid + mata (ellipsoid) + gigi (ellipsoid) ---------- */
    function onHead(x, y, inset) {                       // matriks di permukaan ellipsoid kepala, menghadap normalnya
        var z = HC * Math.sqrt(Math.max(0, 1 - (x / HA) * (x / HA) - (y / HB) * (y / HB))) * inset;
        return M(Tr(x, y, z), LIBS.fromTo(Z, norm3([x / (HA * HA), y / (HB * HB), z / (HC * HC)])));
    }
    var head = add(root, makeMesh(generateEllipsoid(HA, HB, HC, STACK, STEP, rgb(NAVY))), Tr(0, 1.55, 0));
    [-1, 1].forEach(function (s) {
        var eye = add(head, makeMesh(generateEllipsoid(0.38, 0.5, 0.15, STACK, STEP, rgb(0xfff7fb))), M(onHead(s * 0.92, 0.42, 0.97), RZ(-s * 0.2)));   // mata: lebar, tinggi, pipih, puncak miring ke luar
        add(eye, makeMesh(generateEllipsoid(0.17, 0.34, 0.05, STACK, STEP, rgb(0x000000))), Tr(s * 0.07, -0.03, 0.13));   // pupil hitam besar, bergeser ke luar
    });
    var mouth = add(head, makeMesh(generateEllipsoid(0.7, 0.26, 0.25, STACK, STEP, rgb(0xffffff))), onHead(0, -0.12, 0.88));   // gigi: lebar ke samping
    [-0.35, 0, 0.35].forEach(function (x) {      // 3 garis gigi
        add(mouth, makeMesh(generateCylinder(0.012, 0.012, 0.4, 8, rgb(0xaab2d8))), Tr(x, 0, 0.25 * Math.sqrt(1 - (x / 0.7) * (x / 0.7)) + 0.004));
    });

    /* ---------- SUMBU: tube TEBAL mengikuti kurva (oranye), keluar dari kepala lewat kolar ---------- */
    var fuse = add(head, null, Tr(0, HB - 0.25, 0));
    add(fuse, makeMesh(generateTube([[0, -0.15, 0], [0.035, 0.15, 0], [0.035, 0.4, 0], [0, 0.65, 0]], 0.17, 32, 24, rgb(0xffa31a))));   // kurva Catmull-Rom
    add(fuse, makeMesh(generateCylinder(0.23, 0.32, 0.18, SEG, rgb(0x3f4b94))), Tr(0, 0.24, 0));        // kolar biru di pangkal (kerucut terpotong)
    add(fuse, makeMesh(generateCylinder(0.215, 0.215, 0.04, SEG, rgb(0x2f3870))), Tr(0, 0.34, 0));         // cincin tipis

    /* ---------- TANDUK: hyperboloid satu lembar (dipipihkan) + 2 lubang tembus ---------- */
    var hA = 0.4, hC = 0.3, hH = 0.28, hSz = 1.7, hRE = hA * Math.sqrt(1 + hH * hH / (hC * hC));
    var horn = add(add(fuse, null, M(Tr(0, 0.95, 0), RZ(0.25))), null, RZ(-Math.PI / 2));   // sumbu hyperboloid = arah lubang
    add(horn, makeMesh(generateHyperboloid(hA, hC, hH, hSz, 24, 64, rgb(0xffb82e))));                    // dinding
    add(horn, makeMesh(generateHoledCap(hRE, hRE * hSz, 0.24, 0.38, hH, 1, 64, rgb(0xffb82e))));        // tutup atas berlubang
    add(horn, makeMesh(generateHoledCap(hRE, hRE * hSz, 0.24, 0.38, -hH, -1, 64, rgb(0xffb82e))));      // tutup bawah berlubang
    [0.38, -0.38].forEach(function (z) {                                                                  // dinding lubang tembus
        add(horn, makeMesh(generateCylinder(0.24, 0.24, 2 * hH, SEG, rgb(0xf08a1c), true)), Tr(0, 0, z));
    });

    /* ---------- TANGAN kiri & kanan (simetris): bahu + leher (kerucut terpotong) + meriam ---------- */
    [-1, 1].forEach(function (side) {
        var d2 = norm3([side * 0.45, -0.85, 0.25]), dir = norm3([side * 0.75, 0.5, 0.45]);
        var c = [d2[0] * 1.75, d2[1] * 1.75, d2[2] * 1.75];
        var swing = add(add(root, null, Tr(side * 1.9, 1.0, 0.1)));
        swings.push(swing);

        // bahu kuning (ellipsoid) + cincin oranye (cylinder berongga)
        add(swing, makeMesh(generateEllipsoid(0.68, 0.58, 0.62, STACK, STEP, rgb(0xffb82e))), Tr(side * 0.05, 0.05, 0));
        var ring = add(swing, null, M(Tr(d2[0] * 0.45, d2[1] * 0.45, d2[2] * 0.45), orientY(d2)));
        add(ring, makeMesh(generateCylinder(0.6, 0.6, 0.2, SEG, rgb(0xffc01e), true)));
        add(ring, makeMesh(generateCylinder(0.5, 0.5, 0.2, SEG, rgb(0xf0700f), true)));
        add(ring, makeMesh(generateAnnulus(0.5, 0.6, SEG, rgb(0xffc01e))), Tr(0, 0.1, 0));
        add(ring, makeMesh(generateAnnulus(0.5, 0.6, SEG, rgb(0xffc01e))), Tr(0, -0.1, 0));

        // leher: kerucut terpotong + 2 cincin kolar
        var neck = add(swing, null, orientY(d2));
        add(neck, makeMesh(generateCylinder(0.42, 0.26, 0.62, SEG, rgb(0x9aa6e0))), Tr(0, 0.31, 0));
        add(neck, makeMesh(generateCylinder(0.42, 0.42, 0.1, SEG, rgb(0x2f3870))), Tr(0, 0.62, 0));
        add(neck, makeMesh(generateCylinder(0.5, 0.5, 0.2, SEG, rgb(0x2f3870))), Tr(0, 0.76, 0));

        // meriam: badan bola (ellipsoid) + bibir (cylinder & kerucut terpotong) + kerucut belakang
        var cannon = add(swing, null, M(Tr(c[0], c[1], c[2]), orientY(dir)));
        add(cannon, makeMesh(generateEllipsoid(1, 1, 1, STACK, STEP, rgb(0x4b5596))));
        var lip = add(cannon, null, Tr(0, 0.93, 0));
        add(lip, makeMesh(generateCylinder(0.7, 0.7, 0.64, SEG, rgb(0x8d9de6), true)));
        add(lip, makeMesh(generateCylinder(0.52, 0.72, 0.22, SEG, rgb(0x9fadee), true)), Tr(0, 0.43, 0));
        add(lip, makeMesh(generateAnnulus(0.4, 0.52, SEG, rgb(0xa9b6f2))), Tr(0, 0.54, 0));
        add(lip, makeMesh(generateCylinder(0.4, 0.4, 0.45, SEG, rgb(0x1a1f45), true)), Tr(0, 0.315, 0));
        add(lip, makeMesh(generateAnnulus(0, 0.4, SEG, rgb(0x0a0d24))), Tr(0, 0.09, 0));
        add(lip, makeMesh(generateCylinder(0.706, 0.706, 0.03, SEG, rgb(0x6a76c4), true)), Tr(0, 0.12, 0));
        add(lip, makeMesh(generateAnnulus(0.44, 0.46, SEG, rgb(0x6a76c4))), Tr(0, 0.542, 0));
        add(cannon, makeMesh(generateCylinder(0.62, 0.4, 0.5, SEG, rgb(0x5a66aa))), Tr(0, -1.1, 0));

        // baut X di belakang dan di depan meriam
        [[side * 0.2, -0.15, -0.95], [-side * 0.25, -0.1, 0.95]].forEach(function (d) {
            d = norm3(d);
            screws.push({ parent: swing, r: 0.36, matrix: M(Tr(c[0] + d[0] * 0.97, c[1] + d[1] * 0.97, c[2] + d[2] * 0.97), orientY(d)) });
        });
    });

    /* ---------- KAKI kiri & kanan: cylinder (pangkal) + 2 ellipsoid ---------- */
    var legs = [];
    [-0.95, 0.95].forEach(function (x) {
        var s = Math.sign(x), leg = add(root, null, M(Tr(x, -0.8, 0.1), RZ(-s * 0.08)));
        add(leg, makeMesh(generateCylinder(0.36, 0.36, 0.42, SEG, rgb(0xb0434d))), RZ(Math.PI / 2));
        add(leg, makeMesh(generateEllipsoid(0.3, 0.34, 0.3, STACK, STEP, rgb(0xa8404a))), Tr(0, -0.42, 0.02));
        add(leg, makeMesh(generateEllipsoid(0.25, 0.24, 0.25, STACK, STEP, rgb(0x9a3a44))), Tr(s * 0.04, -0.78, 0.1));
        screws.push({ parent: leg, r: 0.22, matrix: M(Tr(s * 0.215, 0, 0), orientY([s, 0, 0])) });
        legs.push(leg);
    });
    var legL = legs[0], legR = legs[1];

    /* ---------- BAUT X: cylinder + cakram + 2 ellipsoid pipih menyilang ---------- */
    screws.forEach(function (sc) {
        var g = add(sc.parent, null, sc.matrix), r = sc.r;
        add(g, makeMesh(generateCylinder(r * 1.1, r * 1.1, 0.1, SEG, rgb(0x2a326e))));
        add(g, makeMesh(generateCylinder(r, r, 0.02, SEG, rgb(0xc9d1f7))), Tr(0, 0.06, 0));
        add(g, makeMesh(generateEllipsoid(r * 0.67, 0.03, r * 0.15, 12, 24, rgb(0x1b2150))), M(Tr(0, 0.075, 0), RY(Math.PI / 4)));
        add(g, makeMesh(generateEllipsoid(r * 0.67, 0.03, r * 0.15, 12, 24, rgb(0x1b2150))), M(Tr(0, 0.075, 0), RY(-Math.PI / 4)));
    });

    /* ---------- PELURU MERIAM (cannonball): ellipsoid kecil ---------- */
    var bulletMesh = makeMesh(generateEllipsoid(0.25, 0.25, 0.25, 12, 16, rgb(0x111111)));
    var bullets = [];                       // { node, vx,vy,vz, life }
    var shootCooldown = 0;                  // detik sampai bisa tembak lagi
    var shootRecoil = 0;                    // 0..1 animasi mundur

    /* pose awal (diam) */
    legL.rot[0] = 0.1; legR.rot[0] = 0.1;
    tick.base = Tr(0, 1.8, 0);

    /*======================== KAMERA: HANYA DRAG ======================== */
    var PROJMATRIX = LIBS.get_projection(40, CANVAS.width / CANVAS.height, 1, 200);
    var VIEWMATRIX = LIBS.get_I4();

    var THETA = 0.3, PHI = 0.25, ZOOM = 14;      // THETA: kiri-kanan, PHI: atas-bawah
    var drag = false, x_prev, y_prev;

    var mouseDown = function (e) { drag = true; x_prev = e.pageX; y_prev = e.pageY; e.preventDefault(); return false; };
    var mouseUp = function () { drag = false; };
    var mouseMove = function (e) {
        if (!drag) return false;
        THETA += (e.pageX - x_prev) * 2 * Math.PI / CANVAS.width;
        PHI += (e.pageY - y_prev) * 2 * Math.PI / CANVAS.height;
        PHI = Math.min(1.45, Math.max(-0.1, PHI));
        x_prev = e.pageX; y_prev = e.pageY; e.preventDefault();
    };
    CANVAS.addEventListener("mousedown", mouseDown, false);
    CANVAS.addEventListener("mouseup", mouseUp, false);
    CANVAS.addEventListener("mouseout", mouseUp, false);
    CANVAS.addEventListener("mousemove", mouseMove, false);
    // dukungan layar sentuh
    CANVAS.addEventListener("touchstart", function (e) { var t = e.touches[0]; mouseDown({ pageX: t.pageX, pageY: t.pageY, preventDefault: function () { e.preventDefault(); } }); }, { passive: false });
    CANVAS.addEventListener("touchmove", function (e) { var t = e.touches[0]; mouseMove({ pageX: t.pageX, pageY: t.pageY, preventDefault: function () { e.preventDefault(); } }); }, { passive: false });
    CANVAS.addEventListener("touchend", mouseUp, false);
    window.addEventListener("resize", function () {
        CANVAS.width = window.innerWidth; CANVAS.height = window.innerHeight;
        PROJMATRIX = LIBS.get_projection(40, CANVAS.width / CANVAS.height, 1, 200);
    });

    /*========================= DRAWING ========================= */
    GL.enable(GL.DEPTH_TEST);
    GL.depthFunc(GL.LEQUAL);
    GL.clearColor(0.0, 0.0, 0.0, 1.0);
    GL.clearDepth(1.0);

    /*======================== GERAK KARAKTER (hanya saat tombol ditekan) ======================== */
    var keys = {}, px = 0, pz = 0, heading = 0, phase = 0, walk = 0, time_prev = 0;
    window.addEventListener("keydown", function (e) {
        keys[e.key.toLowerCase()] = true;
        if (e.key === " ") { keys[" "] = true; e.preventDefault(); }
        if (e.key.indexOf("Arrow") === 0) e.preventDefault();
    }, false);
    window.addEventListener("keyup", function (e) {
        keys[e.key.toLowerCase()] = false;
        if (e.key === " ") keys[" "] = false;
    }, false);

    var animate = function (time) {
        var dt = Math.min((time - time_prev) / 1000, 0.05); time_prev = time;
        var timeSec = time / 1000;                              // waktu total dalam detik
        GL.viewport(0, 0, CANVAS.width, CANVAS.height);
        GL.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);

        // arah gerak relatif terhadap arah kamera (THETA)
        var fx = Math.sin(THETA), fz = -Math.cos(THETA), rx = Math.cos(THETA), rz = Math.sin(THETA), mx = 0, mz = 0;
        if (keys.arrowup || keys.w) { mx += fx; mz += fz; }
        if (keys.arrowdown || keys.s) { mx -= fx; mz -= fz; }
        if (keys.arrowright || keys.d) { mx += rx; mz += rz; }
        if (keys.arrowleft || keys.a) { mx -= rx; mz -= rz; }
        var moving = (mx !== 0 || mz !== 0);
        if (moving) {
            var l = Math.hypot(mx, mz); mx /= l; mz /= l;
            px += mx * 3 * dt; pz += mz * 3 * dt;
            var r = Math.hypot(px, pz); if (r > 7) { px *= 7 / r; pz *= 7 / r; }
            var d = Math.atan2(mx, mz) - heading; d = Math.atan2(Math.sin(d), Math.cos(d));
            heading += d * Math.min(1, dt * 10);
            phase += dt * 10;
        }
        walk += ((moving ? 1 : 0) - walk) * Math.min(1, dt * 10);

        /* ===== TEMBAK (spasi) ===== */
        shootCooldown = Math.max(0, shootCooldown - dt);
        if (keys[" "] && shootCooldown <= 0) {
            shootCooldown = 0.35;
            shootRecoil = 1.0;

            var shootDir = [Math.sin(heading), 0.35, Math.cos(heading)];
            var sdl = Math.hypot(shootDir[0], shootDir[1], shootDir[2]);
            shootDir = [shootDir[0] / sdl, shootDir[1] / sdl, shootDir[2] / sdl];
            var speed = 18;

            [-1, 1].forEach(function (side) {
                var d2 = norm3([side * 0.45, -0.85, 0.25]);
                var dir = norm3([side * 0.75, 0.5, 0.45]);
                var c = [d2[0] * 1.75, d2[1] * 1.75, d2[2] * 1.75];

                var muzzleLocal = [
                    side * 1.9 + c[0] + dir[0] * 2.6,
                    1.8 + 1.0 + c[1] + dir[1] * 2.6,
                    0.1 + c[2] + dir[2] * 2.6
                ];
                var cs = Math.cos(heading), sn = Math.sin(heading);
                var wx = px + muzzleLocal[0] * cs + muzzleLocal[2] * sn;
                var wy = muzzleLocal[1];
                var wz = pz - muzzleLocal[0] * sn + muzzleLocal[2] * cs;

                var bNode = add(world, bulletMesh, Tr(wx, wy, wz));
                bullets.push({
                    node: bNode,
                    vx: shootDir[0] * speed,
                    vy: shootDir[1] * speed,
                    vz: shootDir[2] * speed,
                    life: 2.0
                });
            });
        }

        // recoil menurun
        shootRecoil = Math.max(0, shootRecoil - dt * 5);

        // update peluru
        for (var bi = bullets.length - 1; bi >= 0; bi--) {
            var b = bullets[bi];
            b.life -= dt;
            b.node.off[0] += b.vx * dt;
            b.node.off[1] += b.vy * dt;
            b.node.off[2] += b.vz * dt;
            b.vy -= 4.0 * dt;
            if (b.life <= 0) {
                var idx = world.kids.indexOf(b.node);
                if (idx >= 0) world.kids.splice(idx, 1);
                bullets.splice(bi, 1);
            }
        }

        /* ===== ANIMASI SELURUH BADAN ===== */
        tick.base = M(Tr(px, 1.8, pz), RY(heading));

        var recoilEase = shootRecoil * shootRecoil;   // ease-out

        // --- (2) IDLE BREATHING: napas pelan saat diam ---
        var breathe = Math.sin(timeSec * 1.8) * (1 - walk);   // -1..1, hilang saat jalan
        var breatheY = 1 + breathe * 0.015;                   // skala Y naik turun sedikit
        var breatheXZ = 1 - breathe * 0.008;                  // skala XZ kebalikannya

        // --- (1) SQUASH & STRETCH saat tembak ---
        var squashT = Math.sin(shootRecoil * Math.PI);         // 0->1->0 selama recoil
        var squashY = 1 - squashT * 0.12;                      // Y mengecil (squash)
        var squashXZ = 1 + squashT * 0.06;                     // XZ membesar

        // --- (4) LANDING SQUASH saat jalan: bouncy walk ---
        var landingPhase = Math.cos(phase * 2);                 // 2x frekuensi langkah
        var landSquash = landingPhase * walk * 0.04;
        var walkSquashY = 1 - landSquash;
        var walkSquashXZ = 1 + landSquash * 0.5;

        // gabungkan semua scaling ke root
        root.scl = [
            breatheXZ * squashXZ * walkSquashXZ,
            breatheY  * squashY  * walkSquashY,
            breatheXZ * squashXZ * walkSquashXZ
        ];

        // translasi & rotasi recoil
        root.off[2] = -recoilEase * 0.3;
        root.off[1] = Math.abs(Math.sin(phase)) * 0.12 * walk + recoilEase * 0.15;
        root.rot[0] = -recoilEase * 0.18;
        root.rot[2] = Math.sin(phase) * 0.04 * walk;

        // kaki
        legL.rot[0] = 0.1 + Math.sin(phase) * 0.7 * walk + recoilEase * 0.15;
        legR.rot[0] = 0.1 - Math.sin(phase) * 0.7 * walk + recoilEase * 0.15;

        // --- (3) CANNON PUMP: meriam membesar sesaat saat tembak ---
        var pumpT = shootRecoil > 0.7 ? (shootRecoil - 0.7) / 0.3 : 0;
        var pumpScale = 1 + pumpT * 0.18;
        swings[0].scl = [pumpScale, pumpScale, pumpScale];
        swings[1].scl = [pumpScale, pumpScale, pumpScale];

        // tangan rotasi: mundur saat tembak
        swings[0].rot[0] = Math.sin(phase + Math.PI) * 0.25 * walk - recoilEase * 0.5;
        swings[1].rot[0] = Math.sin(phase) * 0.25 * walk - recoilEase * 0.5;
        swings[0].rot[2] = 0;
        swings[1].rot[2] = 0;

        // kepala: tersentak + scaling
        head.off[1] = -recoilEase * 0.1;
        head.rot[0] = -recoilEase * 0.15;
        var headBob = 1 + squashT * 0.05;
        head.scl = [headBob, 1 - squashT * 0.04, headBob];

        // V = T(0,0,-zoom) * Rx(PHI) * Ry(THETA) * T(0,-2.2,0)
        VIEWMATRIX = M(Tr(0, 0, -ZOOM), RX(PHI), RY(THETA), Tr(0, -2.2, 0));
        GL.uniformMatrix4fv(_Pmatrix, false, new Float32Array(PROJMATRIX));
        GL.uniformMatrix4fv(_Vmatrix, false, new Float32Array(VIEWMATRIX));

        drawNode(world, LIBS.get_I4());

        GL.flush();
        window.requestAnimationFrame(animate);
    };
    animate(0);
}
window.addEventListener('load', main);
