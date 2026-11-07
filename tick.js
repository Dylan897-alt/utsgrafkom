// tick.js - Karakter Tick (Brawl Stars) 3D WebGL
// Bentuk, proporsi, dan hierarki 100% identik dengan versi awal asli
// Semua generator geometri menggunakan LIBS dari libs.js
// Ukuran disesuaikan setara Spike & Sprout (skala global S = 0.52)
// Dilengkapi animasi idle breathing, eye blink, jalan IJKL, tembak U, scaling O, dan mati P / Ulti Spike

function initTick(GL) {
    /* ================================================================
       1. SHADER PROGRAM (Lambert + Blinn-Phong dua sisi)
    ================================================================ */
    var shader_vertex_source = `
        attribute vec3 position;
        attribute vec4 color;
        attribute vec3 normal;
        uniform mat4 Pmatrix, Vmatrix, Mmatrix;
        uniform vec3 uLight;
        varying vec4 vColor;
        varying vec3 vN, vL, vPos;

        void main(void) {
            vec4 vp = Vmatrix * Mmatrix * vec4(position, 1.0);
            gl_Position = Pmatrix * vp;
            vPos = vp.xyz;
            vN = (Vmatrix * Mmatrix * vec4(normal, 0.0)).xyz;
            vL = (Vmatrix * vec4(uLight, 0.0)).xyz;
            vColor = color;
        }`;

    var shader_fragment_source = `
        precision mediump float;
        varying vec4 vColor;
        varying vec3 vN, vL, vPos;

        void main(void) {
            vec3 V = normalize(-vPos);
            vec3 n = normalize(vN);
            if (dot(n, V) < 0.0) n = -n;
            vec3 l = normalize(vL);
            float d = max(dot(n, l), 0.0);
            float s = pow(max(dot(n, normalize(l + V)), 0.0), 40.0) * 0.25;
            gl_FragColor = vec4(vColor.rgb * (0.55 + 0.60 * d) + s, vColor.a);
        }`;

    function compile_shader(source, type, typeString) {
        var shader = GL.createShader(type);
        GL.shaderSource(shader, source);
        GL.compileShader(shader);
        if (!GL.getShaderParameter(shader, GL.COMPILE_STATUS)) {
            console.error("ERROR IN " + typeString + " SHADER: " + GL.getShaderInfoLog(shader));
            return null;
        }
        return shader;
    }

    var shader_vertex = compile_shader(shader_vertex_source, GL.VERTEX_SHADER, "VERTEX");
    var shader_fragment = compile_shader(shader_fragment_source, GL.FRAGMENT_SHADER, "FRAGMENT");
    if (!shader_vertex || !shader_fragment) return null;

    var SHADER_PROGRAM = GL.createProgram();
    GL.attachShader(SHADER_PROGRAM, shader_vertex);
    GL.attachShader(SHADER_PROGRAM, shader_fragment);
    GL.linkProgram(SHADER_PROGRAM);
    if (!GL.getProgramParameter(SHADER_PROGRAM, GL.LINK_STATUS)) {
        console.error("Tick program link error: " + GL.getProgramInfoLog(SHADER_PROGRAM));
        return null;
    }

    var _position = GL.getAttribLocation(SHADER_PROGRAM, "position");
    var _normal   = GL.getAttribLocation(SHADER_PROGRAM, "normal");
    var _color    = GL.getAttribLocation(SHADER_PROGRAM, "color");

    var _Pmatrix  = GL.getUniformLocation(SHADER_PROGRAM, "Pmatrix");
    var _Vmatrix  = GL.getUniformLocation(SHADER_PROGRAM, "Vmatrix");
    var _Mmatrix  = GL.getUniformLocation(SHADER_PROGRAM, "Mmatrix");
    var _uLight   = GL.getUniformLocation(SHADER_PROGRAM, "uLight");

    /* ================================================================
       2. SCENE GRAPH & MESH BUILDER
    ================================================================ */
    function rgb(h) {
        return [
            ((h >> 16) & 255) / 255,
            ((h >> 8) & 255) / 255,
            (h & 255) / 255,
            1.0
        ];
    }

    function norm3(v) {
        var l = Math.hypot(v[0], v[1], v[2]) || 1;
        return [v[0] / l, v[1] / l, v[2] / l];
    }

    function makeMesh(geo, cull) {
        var verts = geo.vertex || geo.vertices;
        var vb = GL.createBuffer();
        GL.bindBuffer(GL.ARRAY_BUFFER, vb);
        GL.bufferData(GL.ARRAY_BUFFER, new Float32Array(verts), GL.STATIC_DRAW);

        var fb = GL.createBuffer();
        GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, fb);
        GL.bufferData(GL.ELEMENT_ARRAY_BUFFER, new Uint16Array(geo.faces), GL.STATIC_DRAW);

        return { vb: vb, fb: fb, count: geo.faces.length, cull: cull || null };
    }

    var Tr = LIBS.translation, RX = LIBS.rotationX, RY = LIBS.rotationY, RZ = LIBS.rotationZ;
    var Y = [0, 1, 0], Z = [0, 0, 1];

    function M() {
        var m = LIBS.get_I4();
        for (var i = 0; i < arguments.length; i++) m = LIBS.mul(m, arguments[i]);
        return m;
    }

    function orientY(d) {
        return LIBS.fromTo(Y, norm3(d));
    }

    // node: { mesh, base, off, rot, rotAxis, rotAngle, scl, kids, world, parent }
    function add(parent, mesh, base) {
        var n = {
            mesh: mesh || null,
            base: base || LIBS.get_I4(),
            off: [0, 0, 0],
            rot: [0, 0, 0],
            rotAxis: null,
            rotAngle: 0,
            scl: [1, 1, 1],
            kids: [],
            world: LIBS.get_I4(),
            parent: parent || null
        };
        if (parent) parent.kids.push(n);
        return n;
    }

    function getNodeWorld(node) {
        var chain = [];
        var curr = node;
        while (curr) {
            chain.unshift(curr);
            curr = curr.parent;
        }
        var W = LIBS.get_I4();
        for (var i = 0; i < chain.length; i++) {
            var n = chain[i];
            var l = LIBS.mul(Tr(n.off[0], n.off[1], n.off[2]), n.base);
            if (n.rotAxis && n.rotAngle) l = LIBS.mul(l, LIBS.rotationAxis(n.rotAxis, n.rotAngle));
            if (n.rot[0] || n.rot[1] || n.rot[2]) l = LIBS.mul(l, M(RZ(n.rot[2]), RY(n.rot[1]), RX(n.rot[0])));
            if (n.scl[0] !== 1 || n.scl[1] !== 1 || n.scl[2] !== 1) l = LIBS.mul(l, LIBS.scaling(n.scl[0], n.scl[1], n.scl[2]));
            W = LIBS.mul(W, l);
        }
        return W;
    }

    function drawMesh(m, W) {
        GL.uniformMatrix4fv(_Mmatrix, false, new Float32Array(W));
        if (m.cull) {
            GL.enable(GL.CULL_FACE);
            GL.cullFace(m.cull === "front" ? GL.FRONT : GL.BACK);
        } else {
            GL.disable(GL.CULL_FACE);
        }

        GL.bindBuffer(GL.ARRAY_BUFFER, m.vb);
        var stride = 40; // 10 float: pos(3), color(4), normal(3)
        GL.vertexAttribPointer(_position, 3, GL.FLOAT, false, stride, 0);
        GL.vertexAttribPointer(_color, 4, GL.FLOAT, false, stride, 12);
        GL.vertexAttribPointer(_normal, 3, GL.FLOAT, false, stride, 28);

        GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, m.fb);
        GL.drawElements(GL.TRIANGLES, m.count, GL.UNSIGNED_SHORT, 0);
    }

    function drawNode(n, pw) {
        var l = LIBS.mul(Tr(n.off[0], n.off[1], n.off[2]), n.base);
        if (n.rotAxis && n.rotAngle) l = LIBS.mul(l, LIBS.rotationAxis(n.rotAxis, n.rotAngle));
        if (n.rot[0] || n.rot[1] || n.rot[2]) l = LIBS.mul(l, M(RZ(n.rot[2]), RY(n.rot[1]), RX(n.rot[0])));
        if (n.scl[0] !== 1 || n.scl[1] !== 1 || n.scl[2] !== 1) l = LIBS.mul(l, LIBS.scaling(n.scl[0], n.scl[1], n.scl[2]));
        n.world = LIBS.mul(pw, l);
        if (n.mesh) drawMesh(n.mesh, n.world);
        for (var i = 0; i < n.kids.length; i++) drawNode(n.kids[i], n.world);
    }

    /* ================================================================
       3. HIERARKI MODEL KARAKTER TICK (PERSIS DENGAN VERSI ASLI)
    ================================================================ */
    var NAVY = 0x343f80, PERI = 0x8d9de6, PERI2 = 0x5a67b0, YEL = 0xffc62a;
    var STACK = 24, STEP = 40, SEG = 40;
    var HA = 1.35, HB = 1.3, HC = 1.3;

    var world = add(null);
    var tickNode = add(world, null, Tr(0, 1.8, 0));
    var root = add(tickNode);

    var screws = [];
    var swings = [];
    var eyeNodes = [];
    var cannonNodes = [];
    var lipNodes = [];

    /* ---------- BADAN: ellipsoid (perut) + kerucut terpotong (tub) + cylinder (rim) + syal ---------- */
    add(root, makeMesh(LIBS.createSphere(STEP, STACK, [1.6, 0.95, 1.55], rgb(NAVY))), Tr(0, -0.15, 0));
    add(root, makeMesh(LIBS.createCylinder(SEG, 4, 1.85, 1.6, 0.7, rgb(PERI2), false)), Tr(0, 0.5, 0));
    add(root, makeMesh(LIBS.createCylinder(SEG, 4, 1.95, 1.95, 0.35, rgb(PERI), false)), Tr(0, 0.95, 0));
    [0.41, 0.64, -0.41, -0.64].forEach(function (u) {
        [0, Math.PI].forEach(function (o) {
            var a = u + o;
            add(root, makeMesh(LIBS.createCylinder(8, 2, 0.022, 0.022, 0.3, rgb(0x6a76c4), false)), Tr(1.955 * Math.sin(a), 0.95, 1.955 * Math.cos(a)));
        });
    });
    add(root, makeMesh(LIBS.createScarf(rgb(0xe0264f)))); // Syal V asli yang pas membungkus badan

    /* ---------- LENCANA: cylinder kuning + muka bajak laut / angry icon ---------- */
    var badge = add(root, null, Tr(0, 0.25, 1.74));
    add(badge, makeMesh(LIBS.createCylinder(SEG, 2, 0.42, 0.42, 0.1, rgb(YEL), false)), RX(Math.PI / 2));
    add(badge, makeMesh(LIBS.createSphere(24, 12, [0.4, 0.065, 0.015], rgb(0x111111))), Tr(0, 0.085, 0.056));
    add(badge, makeMesh(LIBS.createSphere(24, 12, [0.075, 0.075, 0.015], rgb(0x111111))), Tr(-0.14, -0.02, 0.056));
    add(badge, makeMesh(LIBS.createSphere(24, 12, [0.075, 0.075, 0.015], rgb(0x111111))), Tr(0.14, -0.02, 0.056));
    add(badge, makeMesh(LIBS.createSphere(24, 12, [0.13, 0.03, 0.015], rgb(0x111111))), Tr(0, -0.14, 0.056));

    /* ---------- EKOR: simpul (kerucut terpotong) + manset mahkota bergerigi ---------- */
    var tg = add(root, null, M(Tr(0, -0.62, -1.25), LIBS.fromTo(Y, norm3([0, -0.8, -0.6]))));
    add(tg, makeMesh(LIBS.createCylinder(SEG, 4, 0.46, 0.52, 0.6, rgb(0x3a4688), false)), Tr(0, 0.05, 0));
    [0.1, 0.22].forEach(function (y) {
        add(tg, makeMesh(LIBS.createCylinder(SEG, 2, 0.53, 0.53, 0.03, rgb(0x5d69b0), false)), Tr(0, y, 0));
    });
    var cuff = add(tg, makeMesh(LIBS.createCrownCuff(80, 8, 0.34, 0.46, 0.6, 0.2, 5, rgb(0xf2a888)), "back"), Tr(0, 0.3, 0));
    add(tg, makeMesh(LIBS.createCrownCuff(80, 8, 0.34, 0.46, 0.6, 0.2, 5, rgb(0xc4553a)), "front"), Tr(0, 0.3, 0));
    [-0.07, 0.07].forEach(function (x) {
        add(cuff, makeMesh(LIBS.createCylinder(8, 2, 0.012, 0.012, 0.2, rgb(0xd9703c), false)), Tr(x, 0.3, 0.405));
    });
    [0.25, 0.35].forEach(function (y) {
        add(cuff, makeMesh(LIBS.createCylinder(8, 2, 0.012, 0.012, 0.2, rgb(0xd9703c), false)), M(Tr(0, y, 0.38 + 0.12 * y / 0.6), RZ(Math.PI / 2)));
    });

    /* ---------- KEPALA: ellipsoid + mata + mulut ---------- */
    function onHead(x, y, inset) {
        var z = HC * Math.sqrt(Math.max(0, 1 - (x / HA) * (x / HA) - (y / HB) * (y / HB))) * inset;
        return M(Tr(x, y, z), LIBS.fromTo(Z, norm3([x / (HA * HA), y / (HB * HB), z / (HC * HC)])));
    }
    var head = add(root, makeMesh(LIBS.createSphere(STEP, STACK, [HA, HB, HC], rgb(NAVY))), Tr(0, 1.55, 0));

    // Mata Kiri & Kanan (dengan node simpan untuk animasi kedipan)
    [-1, 1].forEach(function (s) {
        var eye = add(head, makeMesh(LIBS.createSphere(STEP, STACK, [0.38, 0.5, 0.15], rgb(0xfff7fb))), M(onHead(s * 0.92, 0.42, 0.97), RZ(-s * 0.2)));
        add(eye, makeMesh(LIBS.createSphere(STEP, STACK, [0.17, 0.34, 0.05], rgb(0x000000))), Tr(s * 0.07, -0.03, 0.13));
        eyeNodes.push(eye);
    });

    // Mulut dengan gigi
    var mouth = add(head, makeMesh(LIBS.createSphere(STEP, STACK, [0.7, 0.26, 0.25], rgb(0xffffff))), onHead(0, -0.12, 0.88));
    [-0.35, 0, 0.35].forEach(function (x) {
        add(mouth, makeMesh(LIBS.createCylinder(8, 2, 0.012, 0.012, 0.4, rgb(0xaab2d8), false)), Tr(x, 0, 0.25 * Math.sqrt(Math.max(0, 1 - (x / 0.7) * (x / 0.7))) + 0.004));
    });

    /* ---------- SUMBU: tube tebal mengikuti kurva 3D Catmull-Rom ---------- */
    var fuse = add(head, null, Tr(0, HB - 0.25, 0));
    var fuseCurve3D = [
        [0.0,  -0.15,  0.0],
        [0.0,   0.34,  0.0],
        [0.10,  0.58,  0.11],
        [-0.07, 0.84,  0.07],
        [0.0,   1.04,  0.0]
    ];
    add(fuse, makeMesh(LIBS.createTube(fuseCurve3D, 0.17, 36, 24, rgb(0xffa31a))));
    add(fuse, makeMesh(LIBS.createCylinder(SEG, 4, 0.23, 0.32, 0.18, rgb(0x3f4b94), false)), Tr(0, 0.24, 0));
    add(fuse, makeMesh(LIBS.createCylinder(SEG, 2, 0.215, 0.215, 0.04, rgb(0x2f3870), false)), Tr(0, 0.34, 0));

    /* ---------- TANDUK: hyperboloid + penutup berlubang ---------- */
    var hA = 0.4, hC = 0.3, hH = 0.28, hSz = 1.7, hRE = hA * Math.sqrt(1 + hH * hH / (hC * hC));
    var horn = add(add(fuse, null, M(Tr(0, 1.07, 0), RZ(0.25))), null, RZ(-Math.PI / 2));
    add(horn, makeMesh(LIBS.createHyperboloid(64, 24, hA, hC, hH, hSz, rgb(0xffb82e))));
    add(horn, makeMesh(LIBS.createHoledCap(64, hRE, hRE * hSz, 0.24, 0.38, hH, 1, rgb(0xffb82e))));
    add(horn, makeMesh(LIBS.createHoledCap(64, hRE, hRE * hSz, 0.24, 0.38, -hH, -1, rgb(0xffb82e))));
    [0.38, -0.38].forEach(function (z) {
        add(horn, makeMesh(LIBS.createCylinder(SEG, 2, 0.24, 0.24, 2 * hH, rgb(0xf08a1c), true)), Tr(0, 0, z));
    });

    /* ---------- TANGAN KIRI & KANAN: bahu kuning + meriam lengkap dengan baut X ---------- */
    [-1, 1].forEach(function (side) {
        var d2 = norm3([side * 0.45, -0.85, 0.25]);
        var dir = norm3([side * 0.75, 0.5, 0.45]);
        var c = [d2[0] * 1.75, d2[1] * 1.75, d2[2] * 1.75];
        var swing = add(add(root, null, Tr(side * 1.9, 1.0, 0.1)));
        swings.push(swing);

        // Bahu kuning (ellipsoid) + cincin oranye
        add(swing, makeMesh(LIBS.createSphere(STEP, STACK, [0.74, 0.65, 0.66], rgb(0xffb82e))), Tr(0, 0.05, 0));
        var ring = add(swing, null, M(Tr(d2[0] * 0.38, d2[1] * 0.38, d2[2] * 0.38), orientY(d2)));
        add(ring, makeMesh(LIBS.createCylinder(SEG, 4, 0.62, 0.62, 0.22, rgb(0xffc01e), true)));
        add(ring, makeMesh(LIBS.createCylinder(SEG, 4, 0.50, 0.50, 0.22, rgb(0xf0700f), true)));
        add(ring, makeMesh(LIBS.createDisc(SEG, 0.62, rgb(0xffc01e), 0.50)), Tr(0, 0.11, 0));
        add(ring, makeMesh(LIBS.createDisc(SEG, 0.62, rgb(0xffc01e), 0.50)), Tr(0, -0.11, 0));

        // Leher lengan
        var neck = add(swing, null, orientY(d2));
        add(neck, makeMesh(LIBS.createCylinder(SEG, 4, 0.42, 0.26, 0.62, rgb(0x9aa6e0), false)), Tr(0, 0.31, 0));
        add(neck, makeMesh(LIBS.createCylinder(SEG, 2, 0.42, 0.42, 0.1, rgb(0x2f3870), false)), Tr(0, 0.62, 0));
        add(neck, makeMesh(LIBS.createCylinder(SEG, 2, 0.5, 0.5, 0.2, rgb(0x2f3870), false)), Tr(0, 0.76, 0));

        // Meriam: bola meriam + laras + bibir moncong + kerucut belakang
        var cannon = add(swing, null, Tr(c[0], c[1], c[2]));
        cannonNodes.push(cannon);
        add(cannon, makeMesh(LIBS.createSphere(STEP, STACK, [1, 1, 1], rgb(0x4b5596))));
        var barrel = add(cannon, null, orientY(dir));
        var lip = add(barrel, null, Tr(0, 0.93, 0));
        lipNodes.push(lip);
        add(lip, makeMesh(LIBS.createCylinder(SEG, 4, 0.7, 0.7, 0.64, rgb(0x8d9de6), true)));
        add(lip, makeMesh(LIBS.createCylinder(SEG, 4, 0.52, 0.72, 0.22, rgb(0x9fadee), true)), Tr(0, 0.43, 0));
        add(lip, makeMesh(LIBS.createDisc(SEG, 0.52, rgb(0xa9b6f2), 0.4)), Tr(0, 0.54, 0));
        add(lip, makeMesh(LIBS.createCylinder(SEG, 4, 0.4, 0.4, 0.45, rgb(0x1a1f45), true)), Tr(0, 0.315, 0));
        add(lip, makeMesh(LIBS.createDisc(SEG, 0.4, rgb(0x0a0d24), 0)), Tr(0, 0.09, 0));
        add(lip, makeMesh(LIBS.createCylinder(SEG, 2, 0.706, 0.706, 0.03, rgb(0x6a76c4), true)), Tr(0, 0.12, 0));
        add(lip, makeMesh(LIBS.createDisc(SEG, 0.46, rgb(0x6a76c4), 0.44)), Tr(0, 0.542, 0));
        add(barrel, makeMesh(LIBS.createCylinder(SEG, 4, 0.62, 0.4, 0.5, rgb(0x5a66aa), false)), Tr(0, -1.1, 0));

        // Baut X di samping meriam (menempel langsung pada cannon agar berputar bersama meriam)
        [[side * 0.2, -0.15, -0.95], [-side * 0.25, -0.1, 0.95]].forEach(function (d) {
            d = norm3(d);
            screws.push({ parent: cannon, r: 0.36, matrix: M(Tr(d[0] * 0.97, d[1] * 0.97, d[2] * 0.97), orientY(d)) });
        });
    });

    /* ---------- KAKI KIRI & KANAN ---------- */
    var legs = [];
    [-0.95, 0.95].forEach(function (x) {
        var s = Math.sign(x), leg = add(root, null, M(Tr(x, -0.8, 0.1), RZ(-s * 0.08)));
        add(leg, makeMesh(LIBS.createCylinder(SEG, 4, 0.36, 0.36, 0.42, rgb(0xb0434d), false)), RZ(Math.PI / 2));
        add(leg, makeMesh(LIBS.createSphere(STEP, STACK, [0.3, 0.34, 0.3], rgb(0xa8404a))), Tr(0, -0.42, 0.02));
        add(leg, makeMesh(LIBS.createSphere(STEP, STACK, [0.25, 0.24, 0.25], rgb(0x9a3a44))), Tr(s * 0.04, -0.78, 0.1));
        screws.push({ parent: leg, r: 0.22, matrix: M(Tr(s * 0.215, 0, 0), orientY([s, 0, 0])) });
        legs.push(leg);
    });
    var legL = legs[0], legR = legs[1];

    /* ---------- PEMBUATAN BAUT X LENGKAP (Cakram + 2 Ellipsoid Menyilang) ---------- */
    screws.forEach(function (sc) {
        var g = add(sc.parent, null, sc.matrix), r = sc.r;
        add(g, makeMesh(LIBS.createCylinder(SEG, 2, r * 1.1, r * 1.1, 0.1, rgb(0x2a326e), false)));
        add(g, makeMesh(LIBS.createCylinder(SEG, 2, r, r, 0.02, rgb(0xc9d1f7), false)), Tr(0, 0.06, 0));
        add(g, makeMesh(LIBS.createSphere(24, 12, [r * 0.67, 0.03, r * 0.15], rgb(0x1b2150))), M(Tr(0, 0.075, 0), RY(Math.PI / 4)));
        add(g, makeMesh(LIBS.createSphere(24, 12, [r * 0.67, 0.03, r * 0.15], rgb(0x1b2150))), M(Tr(0, 0.075, 0), RY(-Math.PI / 4)));
    });

    /* ---------- PELURU & SISTEM TEMBAKAN (GANTIAN KIRI & KANAN) ---------- */
    // Peluru meriam bom bulat hitam solid terlihat jelas
    var bulletMesh = makeMesh(LIBS.createSphere(16, 12, 0.42, rgb(0x181822)));
    var bullets = [];
    var shootState = "idle"; // "idle", "raise", "hold", "recoil"
    var shootTimer = 0;
    var shootCooldown = 0;
    var shootRecoil = 0;
    var shootArm = 0;        // 0 = tangan kiri (swings[0]), 1 = tangan kanan (swings[1])
    var firingArm = 0;       // tangan yang sedang aktif dalam animasi tembak
    var RAISE_DUR  = 0.45;   // durasi mengangkat tangan ke atas
    var HOLD_DUR   = 0.25;   // durasi tangan DIAM di atas (membidik)
    var RECOIL_DUR = 0.40;   // durasi recoil & tangan turun kembali ke awal

    // Pose default
    legL.rot[0] = 0.1; legR.rot[0] = 0.1;

    // State animasi tambahan
    var deathProgress = 0;
    var blinkTimer   = 3.0;
    var blinkPhase   = 0;
    var breathTimer  = 0;
    var idleTwirlTimer = 0;
    var twirlArm       = 0;     // 0 = tangan kiri, 1 = tangan kanan
    var isTwirling     = false;
    var twirlProgress  = 0;
    var TWIRL_INTERVAL = 4.2;   // jeda setiap ~4.2 detik saat diam
    var TWIRL_DUR      = 0.85;  // durasi putar 360 derajat mengelilingi rotary axis

    // Skala dasar agar setara dengan Spike & Sprout
    var BASE_SCALE = 0.52;

    function getBaseY(scale) {
        // Pada model unscaled, kaki paling bawah di Y ≈ -1.58.
        // Dengan tickNode.Y = 1.62 * S * scale, kaki menapak di tanah (y ≈ 0.02)
        return 1.62 * BASE_SCALE * scale;
    }

    /* ================================================================
       4. UPDATE & RENDER API
    ================================================================ */
    return {
        PROGRAM: SHADER_PROGRAM,

        update: function (dt, t, params) {
            var px           = params.px;
            var pz           = params.pz;
            var heading      = params.heading;
            var walk         = params.walk;
            var phase        = params.phase;
            var isDead       = params.isDead;
            var shootTrigger = params.shootTrigger;
            var scale        = params.scale || 1.0;

            breathTimer += dt;

            // --- STATUS MATI / HIDUP ---
            if (isDead) {
                deathProgress = Math.min(1.0, deathProgress + dt * 1.6);
            } else {
                deathProgress = Math.max(0.0, deathProgress - dt * 2.2);
            }
            var aliveFactor = Math.max(0, 1.0 - deathProgress);

            // --- SISTEM TEMBAK 4 TAHAP: ANGKAT -> DIAM MEMBIDIK -> TEMBAK -> KEMBALI KE AWAL ---
            shootCooldown = Math.max(0, shootCooldown - dt);
            if (shootTrigger && shootState === "idle" && shootCooldown <= 0 && aliveFactor > 0.5) {
                shootState = "raise"; // 1. Mulai angkat tangan
                shootTimer = 0;
                firingArm = shootArm; // Kunci tangan yang menembak giliran ini (0=kiri, 1=kanan)
            }

            var armRaiseAngle = 0;
            var armRaiseY = 0;
            var recoilShock = 0;

            if (shootState === "raise") {
                // Tahap 1: Mengangkat tangan dengan kecepatan natural manusia (~0.45 detik)
                shootTimer += dt;
                var p = Math.min(1.0, shootTimer / RAISE_DUR);
                // Kurva smoothstep (ease-in-out natural)
                var ease = p * p * (3.0 - 2.0 * p);
                armRaiseAngle = ease * 0.52;
                armRaiseY = ease * 0.35 * aliveFactor;

                if (shootTimer >= RAISE_DUR) {
                    // Tahap 2: Tangan sudah di atas -> sekarang DIAM sejenak membidik
                    shootState = "hold";
                    shootTimer = 0;
                }
            } else if (shootState === "hold") {
                // Tahap 2: Tangan DIAM di posisi atas membidik ke depan (~0.25 detik)
                shootTimer += dt;
                armRaiseAngle = 0.52;
                armRaiseY = 0.35 * aliveFactor;

                if (shootTimer >= HOLD_DUR) {
                    // Tahap 3: Selesai diam membidik -> SEKARANG TEMBAK!
                    shootState = "recoil";
                    shootTimer = 0;
                    shootCooldown = 0.25;

                    var curS = BASE_SCALE * scale;
                    // Tembak dari moncong tangan yang sedang aktif
                    var side = (firingArm === 0) ? -1 : 1;
                    var d2 = norm3([side * 0.45, -0.85, 0.25]);
                    var dir = norm3([side * 0.75, 0.5, 0.45]);
                    var c = [d2[0] * 1.75, d2[1] * 1.75, d2[2] * 1.75];

                    // Posisi moncong memperhitungkan tangan yang sedang terangkat
                    var muzzleLocal = [
                        (side * 1.9 + c[0] + dir[0] * 2.6) * curS,
                        (getBaseY(scale) + (1.0 + 0.35 + c[1] + dir[1] * 2.6) * curS),
                        (0.1 + c[2] + dir[2] * 2.6) * curS
                    ];
                    var cs = Math.cos(heading), sn = Math.sin(heading);
                    var wx = px + muzzleLocal[0] * cs + muzzleLocal[2] * sn;
                    var wy = muzzleLocal[1];
                    var wz = pz - muzzleLocal[0] * sn + muzzleLocal[2] * cs;

                    // Arah peluru melesat ke depan dengan sedikit lengkungan parabola
                    var shootDir = [Math.sin(heading) + side * 0.08, 0.35, Math.cos(heading)];
                    var sdl = Math.hypot(shootDir[0], shootDir[1], shootDir[2]);
                    shootDir = [shootDir[0] / sdl, shootDir[1] / sdl, shootDir[2] / sdl];
                    var speed = 18.0;

                    var bNode = add(world, bulletMesh, Tr(wx, wy, wz));
                    bNode.scl = [curS, curS, curS];
                    bullets.push({
                        node: bNode,
                        x: wx, y: wy, z: wz,
                        vx: shootDir[0] * speed,
                        vy: shootDir[1] * speed,
                        vz: shootDir[2] * speed,
                        life: 3.0
                    });

                    // Ganti giliran untuk tembakan berikutnya (kiri -> kanan -> kiri -> ...)
                    shootArm = 1 - shootArm;
                }
            } else if (shootState === "recoil") {
                // Tahap 4: Hentakan tembakan lalu tangan turun kembali ke posisi semula (~0.40 detik)
                shootTimer += dt;
                var p = Math.min(1.0, shootTimer / RECOIL_DUR);
                var recPhase = 1.0 - p; // 1.0 -> 0.0

                // Sentakan recoil sesaat di awal tembakan
                var kick = Math.sin(p * Math.PI) * Math.exp(-p * 3.5);
                recoilShock = kick * aliveFactor;

                armRaiseAngle = recPhase * 0.52 - kick * 0.15;
                armRaiseY = recPhase * 0.35 * aliveFactor;

                if (shootTimer >= RECOIL_DUR) {
                    // Tangan sudah kembali ke posisi awal, siap menembak giliran selanjutnya
                    shootState = "idle";
                    shootTimer = 0;
                }
            }

            // Update posisi peluru di dunia nyata (parabola balistik)
            for (var bi = bullets.length - 1; bi >= 0; bi--) {
                var b = bullets[bi];
                b.life -= dt;
                b.x += b.vx * dt;
                b.y += b.vy * dt;
                b.z += b.vz * dt;
                b.vy -= 9.8 * dt; // Gravitasi alami (jatuh ke lantai secara realistis)

                // Update posisi visual simpul peluru
                b.node.base = Tr(b.x, b.y, b.z);
                b.node.off  = [0, 0, 0];

                // Hapus peluru HANYA jika waktu habis ATAU telah mendarat di lantai arena (y <= 0.15)
                if (b.life <= 0 || b.y <= 0.15) {
                    var idx = world.kids.indexOf(b.node);
                    if (idx >= 0) world.kids.splice(idx, 1);
                    bullets.splice(bi, 1);
                }
            }

            // --- ANIMASI MATI: KARAKTER JATUH KE DEPAN (RIGID BODY) TANPA TEMBUS LANTAI ---
            var deathAxis = [1, 0, 0]; // Sumbu X untuk jatuh tersungkur ke depan
            var deathShake = 0;
            var deathFallAngle = 0;
            var deathDropY = 0;

            if (deathProgress > 0) {
                var fallEase = Math.sin(deathProgress * Math.PI * 0.5);
                deathFallAngle = fallEase * 1.48; // Tumbang ke depan
                // Dikalibrasi agar tidak ada bagian yang tembus permukaan lantai sepanjang animasi (minY >= 0.016)
                deathDropY = fallEase * 0.32 + 0.12 * Math.sin(deathProgress * Math.PI);
                if (deathProgress < 0.22) {
                    deathShake = Math.sin((deathProgress / 0.22) * Math.PI) * 0.06;
                }
            }

            // --- ANIMASI DIAM: PUTAR 360 DERAJAT HANYA BAGIAN MERIAM (KEDUA TANGAN BARENGAN SECARA HORIZONTAL) ---
            var isIdle = (aliveFactor > 0.5 && walk < 0.05 && shootState === "idle");
            if (isIdle) {
                idleTwirlTimer += dt;
                if (idleTwirlTimer >= TWIRL_INTERVAL && !isTwirling) {
                    isTwirling = true;
                    twirlProgress = 0.0;
                }
            } else {
                if (walk > 0.05 || shootState !== "idle" || aliveFactor <= 0.5) {
                    isTwirling = false;
                    idleTwirlTimer = 0.0;
                }
            }

            var twirlAngle = 0.0;
            if (isTwirling) {
                twirlProgress += dt / TWIRL_DUR;
                if (twirlProgress >= 1.0) {
                    isTwirling = false;
                    idleTwirlTimer = 0.0;
                } else {
                    // Putaran penuh 360 derajat (0 -> 2*PI) dengan kurva smoothstep horizontal
                    var tp = twirlProgress;
                    var easeTwirl = tp * tp * (3.0 - 2.0 * tp);
                    twirlAngle = easeTwirl * 2.0 * Math.PI;
                }
            }

            // --- ANIMASI BREATHING / NAPAS IDLE ---
            var breathAmt   = aliveFactor * Math.max(0, 1.0 - walk * 1.5);
            var breathCycle = Math.sin(breathTimer * 1.8) * 0.5 + 0.5; // 0..1
            var breathY     = breathCycle * 0.08 * breathAmt;
            var breathSquashY = 1.0 + breathCycle * 0.04 * breathAmt;
            var breathBulgeXZ = 1.0 - breathCycle * 0.02 * breathAmt;

            // --- ANIMASI KEDIPAN MATA ---
            var blinkScale = 1.0;
            if (aliveFactor > 0.5) {
                blinkTimer -= dt;
                if (blinkTimer <= 0 && blinkPhase === 0) {
                    blinkPhase = 0.001;
                }
                if (blinkPhase > 0) {
                    blinkPhase += dt;
                    var bDur = 0.16;
                    if (blinkPhase >= bDur) {
                        blinkPhase = 0;
                        blinkTimer = 2.6 + Math.random() * 2.2;
                    } else {
                        var bp = blinkPhase / bDur;
                        blinkScale = bp < 0.5 ? 1.0 - (bp / 0.5) * 0.95 : 0.05 + ((bp - 0.5) / 0.5) * 0.95;
                    }
                }
            } else {
                blinkPhase = 0;
                blinkTimer = 1.0;
                blinkScale = 0.2;
            }

            eyeNodes.forEach(function (en) {
                en.scl[1] = blinkScale;
            });

            // --- TRANSFORMASI SELURUH BADAN ---
            var baseY = getBaseY(scale);
            tickNode.base = M(Tr(px, baseY, pz), RY(heading));
            var totalScale = BASE_SCALE * scale;
            tickNode.scl  = [totalScale, totalScale, totalScale];

            root.rotAxis  = deathAxis;
            root.rotAngle = deathFallAngle;

            var recoilShock = Math.sin(shootRecoil * Math.PI) * aliveFactor;

            root.off[0] = deathShake;
            root.off[1] = Math.abs(Math.sin(phase)) * 0.12 * walk * aliveFactor + deathDropY - recoilShock * 0.05 + breathY;
            root.off[2] = -recoilShock * 0.22;

            root.rot[0] = -recoilShock * 0.12;
            root.rot[2] = Math.sin(phase) * 0.04 * walk * aliveFactor;

            var recoilBulgeXZ = (1.0 + recoilShock * 0.07) * breathBulgeXZ;
            var recoilSquashY = (1.0 - recoilShock * 0.05) * breathSquashY;
            root.scl = [recoilBulgeXZ, recoilSquashY, recoilBulgeXZ];

            // Kaki: ayunan saat jalan
            legL.rot[0] = (0.1 + Math.sin(phase) * 0.7 * walk) * aliveFactor;
            legR.rot[0] = (0.1 - Math.sin(phase) * 0.7 * walk) * aliveFactor;

            // Tangan (Swings)
            var armAxisL = norm3([0.90, -0.30, 0.30]);
            var armAxisR = norm3([0.90, 0.30, -0.30]);

            var idleArmBob = breathCycle * 0.06 * breathAmt;

            swings[0].scl = [1, 1, 1];
            swings[1].scl = [1, 1, 1];

            swings.forEach(function (sw, idx) {
                var isFiring = (shootState !== "idle" && idx === firingArm);
                var armAxis = (idx === 0) ? armAxisL : armAxisR;

                sw.off[0] = 0;
                sw.off[2] = isFiring ? -recoilShock * 0.22 : 0;

                if (aliveFactor > 0.1) {
                    if (isFiring) {
                        // Tangan yang sedang menembak: terangkat naik dengan Rotary Axis (saat raise, hold, maupun recoil)
                        sw.off[1] = armRaiseY;
                        sw.rotAxis = armAxis;
                        sw.rotAngle = armRaiseAngle;
                    } else {
                        // Bahu/seluruh tangan tetap diam santai dengan napas halus (hanya meriam di ujungnya yang berputar)
                        sw.off[1] = idleArmBob;
                        sw.rotAxis = null;
                        sw.rotAngle = 0;
                    }
                } else {
                    sw.off[1] = 0;
                    sw.rotAxis = null;
                    sw.rotAngle = 0;
                }

                // Animasi ayunan jalan (walkSwing):
                // Tangan yang sedang menembak tidak mengayun jalan agar gerakannya mantap
                var walkSwing = 0;
                if (!isFiring && walk > 0.01) {
                    walkSwing = (idx === 1 ? Math.sin(phase) : Math.sin(phase + Math.PI)) * 0.25 * walk * aliveFactor;
                }

                // Saat mati: rigid body fall, tangan tetap kokoh bersama badan tanpa deformasi
                sw.rot[0] = walkSwing;
                sw.rot[2] = 0;
            });

            // Putar HANYA kedua meriam (cannon) 360 derajat secara horizontal bersamaan saat idle
            // Tangan meriam kiri dan kanan berputar secara berlawanan arah satu sama lain (counter-rotating)
            cannonNodes.forEach(function (cn, idx) {
                if (isTwirling && aliveFactor > 0.5) {
                    cn.rotAxis = [0, 1, 0]; // Sumbu vertikal Y untuk perputaran horizontal mendatar
                    cn.rotAngle = (idx === 0 ? 1 : -1) * twirlAngle;
                } else {
                    cn.rotAxis = null;
                    cn.rotAngle = 0;
                }
            });

            // Kepala
            if (deathProgress <= 0.01 && walk > 0.01) {
                head.rotAxis = norm3([0.35, 0.9, 0.25]);
                head.rotAngle = Math.sin(phase) * 0.12 * walk;
            } else if (deathProgress <= 0.01 && walk <= 0.01) {
                head.rotAxis = norm3([0.15, 0.9, 0.2]);
                head.rotAngle = Math.sin(breathTimer * 0.9) * 0.05 * breathAmt;
            } else {
                head.rotAxis = null;
                head.rotAngle = 0;
            }

            head.off[1] = breathCycle * 0.03 * breathAmt;
            head.off[2] = -recoilShock * 0.08;
            head.rot[0] = -recoilShock * 0.08;
            head.rot[2] = 0;
            head.scl    = [1.0 + recoilShock * 0.03, 1.0 - recoilShock * 0.02, 1.0 + recoilShock * 0.03];
        },

        render: function (PROJMATRIX, VIEWMATRIX) {
            GL.useProgram(SHADER_PROGRAM);

            GL.enableVertexAttribArray(_position);
            GL.enableVertexAttribArray(_normal);
            GL.enableVertexAttribArray(_color);

            GL.uniformMatrix4fv(_Pmatrix, false, new Float32Array(PROJMATRIX));
            GL.uniformMatrix4fv(_Vmatrix, false, new Float32Array(VIEWMATRIX));
            GL.uniform3fv(_uLight, new Float32Array(norm3([0.5, 0.9, 0.7])));

            drawNode(world, LIBS.get_I4());

            GL.disable(GL.CULL_FACE);
        },

        reset: function () {
            bullets.forEach(function (b) {
                var idx = world.kids.indexOf(b.node);
                if (idx >= 0) world.kids.splice(idx, 1);
            });
            bullets = [];
            shootArm = 0;
            firingArm = 0;
            shootState = "idle";
            shootTimer = 0;
            shootCooldown = 0;
            shootRecoil = 0;
            deathProgress = 0;
            blinkTimer = 3.0;
            blinkPhase = 0;
            breathTimer = 0;
            idleTwirlTimer = 0;
            twirlArm = 0;
            isTwirling = false;
            twirlProgress = 0;
        }
    };
}
