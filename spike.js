// spike.js — Geometry & rendering API untuk karakter Spike.
// Hanya membuat shader, mesh, dan menyediakan fungsi gambar().
// Semua logika animasi & game state ada di script.js.

function initSpike(GL) {

    // ================= SHADER =================
    var spike_vertex_source = `
        attribute vec3 position;
        attribute vec3 normal;
        uniform mat4 SK_Pmatrix, SK_Vmatrix, SK_Mmatrix;
        uniform mat3 SK_Nmatrix;
        varying vec3 vNormal;
        varying vec3 vView;
        void main(void) {
            vec4 worldPos = SK_Mmatrix * vec4(position, 1.0);
            gl_Position = SK_Pmatrix * SK_Vmatrix * worldPos;
            vNormal = SK_Nmatrix * normal;
            vView = worldPos.xyz;
        }`;

    var spike_fragment_source = `
        #extension GL_OES_standard_derivatives : enable
        precision mediump float;
        varying vec3 vNormal;
        varying vec3 vView;
        uniform vec3  SK_base_color, SK_second_color, SK_eye_position;
        uniform float SK_render_mode, SK_specular_amount, SK_alpha;
        void main(void) {
            if (SK_render_mode > 1.5 && SK_render_mode < 2.5) {
                gl_FragColor = vec4(mix(SK_second_color, SK_base_color, clamp(vView.y / 45., 0., 1.)), 1.);
                return;
            }
            if (SK_render_mode > 2.5 && SK_render_mode < 3.5) { gl_FragColor = vec4(0., 0., 0., .32); return; }
            if (SK_render_mode > 3.5 && SK_render_mode < 4.5) { gl_FragColor = vec4(SK_base_color, 1.); return; }
            vec3 color = SK_base_color;
            if (SK_render_mode > .5 && SK_render_mode < 1.5) {
                float d = length(vView.xz);
                float k = .5 + .5 * sin(vView.x * 1.3) * sin(vView.z * 1.3);
                color = mix(SK_base_color, SK_base_color * 1.12, k * .5);
                color = mix(color, SK_base_color * .75, smoothstep(.35, 0., abs(d - 3.2)));
                color = mix(color, SK_second_color, smoothstep(14., 36., d));
            }
            if (SK_render_mode > 5.5 && SK_render_mode < 6.5) {
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
            vec3 V = normalize(SK_eye_position - vView);
            vec3 N = normalize(vNormal);
            if (dot(N, V) < 0.) N = -N;
            vec3 L = normalize(vec3(.5, 1., .6));
            float lambert = max(dot(N, L), 0.);
            vec3 hemi = mix(vec3(.35, .25, .4), vec3(.6, .7, .8), N.y * .5 + .5);
            vec3 I = color * (hemi * .55 + vec3(1., .95, .85) * lambert * .75);
            // Model Pencahayaan Phong: Specular R . V
            vec3 R = reflect(-L, N);
            float specPhong = pow(max(dot(R, V), 0.), 32.) * SK_specular_amount;
            I += vec3(1., .98, .90) * specPhong;
            I += vec3(.6, .8, 1.) * pow(1. - max(dot(N, V), 0.), 3.) * .22;
            gl_FragColor = vec4(I, SK_alpha);
        }`;

    function compileShader(src, type) {
        var s = GL.createShader(type);
        GL.shaderSource(s, src);
        GL.compileShader(s);
        if (!GL.getShaderParameter(s, GL.COMPILE_STATUS)) {
            console.error('[Spike shader]', GL.getShaderInfoLog(s));
            return null;
        }
        return s;
    }

    var PROG = GL.createProgram();
    GL.attachShader(PROG, compileShader(spike_vertex_source,    GL.VERTEX_SHADER));
    GL.attachShader(PROG, compileShader(spike_fragment_source, GL.FRAGMENT_SHADER));
    GL.linkProgram(PROG);
    if (!GL.getProgramParameter(PROG, GL.LINK_STATUS)) {
        console.error('[Spike link]', GL.getProgramInfoLog(PROG));
        return null;
    }

    var _pos  = GL.getAttribLocation (PROG, 'position');
    var _norm = GL.getAttribLocation (PROG, 'normal');
    var _P    = GL.getUniformLocation(PROG, 'SK_Pmatrix');
    var _V    = GL.getUniformLocation(PROG, 'SK_Vmatrix');
    var _M    = GL.getUniformLocation(PROG, 'SK_Mmatrix');
    var _N    = GL.getUniformLocation(PROG, 'SK_Nmatrix');
    var _bc   = GL.getUniformLocation(PROG, 'SK_base_color');
    var _sc   = GL.getUniformLocation(PROG, 'SK_second_color');
    var _eye  = GL.getUniformLocation(PROG, 'SK_eye_position');
    var _rm   = GL.getUniformLocation(PROG, 'SK_render_mode');
    var _sp   = GL.getUniformLocation(PROG, 'SK_specular_amount');
    var _al   = GL.getUniformLocation(PROG, 'SK_alpha');

    // ================= HELPERS =================
    var TAU  = Math.PI * 2;
    var HAZE = [0.97, 0.86, 0.7];

    // Bezier kubik — P = 4 titik kontrol [[x,y],...] atau [[x,y,z],...]
    var bezier = function (P, t) {
        var s = 1 - t, r = [];
        for (var k = 0; k < P[0].length; k++)
            r.push(s*s*s*P[0][k] + 3*s*s*t*P[1][k] + 3*s*t*t*P[2][k] + t*t*t*P[3][k]);
        return r;
    };

    var kirimBuffer = function (verts, idx) {
        var vb = GL.createBuffer();
        GL.bindBuffer(GL.ARRAY_BUFFER, vb);
        GL.bufferData(GL.ARRAY_BUFFER, new Float32Array(verts), GL.STATIC_DRAW);
        var fb = GL.createBuffer();
        GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, fb);
        GL.bufferData(GL.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), GL.STATIC_DRAW);
        return { vertex: vb, faces: fb, count: idx.length };
    };

    var buatMesh = function (fn, nu, nv) {
        var verts = [], idx = [];
        for (var j = 0; j <= nv; j++) {
            for (var i = 0; i <= nu; i++) {
                var u = i/nu, v = j/nv, p = fn(u, v);
                var vv = Math.min(Math.max(v, 0.002), 0.998), e = 0.002;
                var du = LIBS.vec_sub(fn(u+e, vv), fn(u-e, vv));
                var dv = LIBS.vec_sub(fn(u, vv+e), fn(u, vv-e));
                var n  = LIBS.vec_normalize(LIBS.vec_cross(du, dv));
                verts.push(p[0], p[1], p[2], n[0], n[1], n[2]);
            }
        }
        for (var j = 0; j < nv; j++) {
            for (var i = 0; i < nu; i++) {
                var a = j*(nu+1)+i, b=a+1, c=a+nu+1, d=c+1;
                idx.push(a, c, b, b, c, d);
            }
        }
        return kirimBuffer(verts, idx);
    };

    var buatTabung = function (P, radius, nu, nv) {
        return buatMesh(function (u, v) {
            var c  = bezier(P, v);
            var Tg = LIBS.vec_normalize(LIBS.vec_sub(bezier(P, Math.min(v+.01,1)), bezier(P, Math.max(v-.01,0))));
            var N  = LIBS.vec_normalize(LIBS.vec_cross(Tg, Math.abs(Tg[1]) < .9 ? [0,1,0] : [1,0,0]));
            var B  = LIBS.vec_cross(Tg, N);
            var a  = u*TAU, r = radius(v);
            return [c[0]+r*(Math.cos(a)*N[0]+Math.sin(a)*B[0]),
                    c[1]+r*(Math.cos(a)*N[1]+Math.sin(a)*B[1]),
                    c[2]+r*(Math.cos(a)*N[2]+Math.sin(a)*B[2])];
        }, nu, nv);
    };

    var buatKotak = function () {
        var F = [
            [[0,0,1], [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]],
            [[0,0,-1],[[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]]],
            [[1,0,0], [[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]]],
            [[-1,0,0],[[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]]],
            [[0,1,0], [[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]]],
            [[0,-1,0],[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]]
        ];
        var verts = [], idx = [], vi = 0;
        for (var f = 0; f < F.length; f++) {
            var n = F[f][0], vs = F[f][1];
            for (var k = 0; k < 4; k++) verts.push(vs[k][0],vs[k][1],vs[k][2],n[0],n[1],n[2]);
            idx.push(vi, vi+1, vi+2, vi, vi+2, vi+3);
            vi += 4;
        }
        return kirimBuffer(verts, idx);
    };

    // ================= MESH OBJEK =================
    var SPHERE = buatMesh(function (u, v) {
        return [Math.cos(u*TAU)*Math.sin(v*Math.PI), Math.cos(v*Math.PI), Math.sin(u*TAU)*Math.sin(v*Math.PI)];
    }, 32, 20);

    var CONE = buatMesh(function (u, v) {
        return [(1-v)*Math.cos(u*TAU), v, (1-v)*Math.sin(u*TAU)];
    }, 20, 6);

    var BADAN_1 = [[0,0],[0.95,0],[1.0,0.35],[1.0,1.0]];
    var BADAN_2 = [[1.0,1.0],[1.0,1.65],[0.95,2.0],[0,2.0]];
    var profil  = function (v) { return v < .5 ? bezier(BADAN_1, v*2) : bezier(BADAN_2, (v-.5)*2); };

    var BODY = buatMesh(function (u, v) {
        var p = profil(v), a = u*TAU;
        return [p[0]*Math.cos(a), p[1], p[0]*Math.sin(a)];
    }, 40, 40);

    var CELANA_P = [[0.68,0],[0.95,0.02],[1.03,0.18],[0.98,0.35]];
    var PANTS = buatMesh(function (u, v) {
        var p = bezier(CELANA_P, v), a = u*TAU;
        return [p[0]*Math.cos(a), p[1], p[0]*Math.sin(a)];
    }, 32, 14);

    var PARABOLOID = buatMesh(function (u, v) {
        var p = 1-v, a = u*TAU;
        return [p*Math.cos(a), 1-p*p, p*Math.sin(a)];
    }, 16, 8);

    var MOUTH_P = [[-0.34,0.07,0],[-0.17,-0.17,0],[0.17,-0.17,0],[0.34,0.07,0]];
    var MOUTH   = buatTabung(MOUTH_P, function (v) { return 0.075 + 0.035*Math.sin(v*Math.PI); }, 12, 16);

    var ARM_P = [[0,0,0],[0.1,-0.2,0.05],[0.16,-0.42,0.09],[0.14,-0.56,0.15]];
    var ARM   = buatTabung(ARM_P, function (v) { return 0.22*(1-0.17*v); }, 16, 24);

    var LEG_P = [[0,0,0],[0.03,-0.2,0.04],[0,-0.4,0.015],[0.015,-0.53,0.06]];
    var LEG   = buatTabung(LEG_P, function (v) { return 0.2*(1-0.15*v); }, 14, 18);
    var LEGLEN = 0.53;

    var GROUND = buatMesh(function (u, v) {
        return [45*v*Math.cos(u*TAU), 0, 45*v*Math.sin(u*TAU)];
    }, 64, 24);

    var BOX      = buatKotak();
    var HANDLE_P = [[-0.55,0,0],[-0.62,0.95,0],[0.62,0.95,0],[0.55,0,0]];
    var HANDLE   = buatTabung(HANDLE_P, function () { return 0.13; }, 10, 16);

    // ================= PERMUKAAN BADAN (untuk duri & mata) =================
    var PROFIL = [];
    for (var i = 0; i <= 400; i++) PROFIL.push(profil(i/400));

    var permukaan = function (y) {
        var best = 0, bestD = 9;
        for (var i = 0; i < PROFIL.length; i++) {
            var d = Math.abs(PROFIL[i][1] - y);
            if (d < bestD) { bestD = d; best = i; }
        }
        var i0 = Math.max(best-1, 0), i1 = Math.min(best+1, 400);
        var dr = PROFIL[i1][0]-PROFIL[i0][0], dy = PROFIL[i1][1]-PROFIL[i0][1];
        var l  = Math.hypot(dr, dy) || 1;
        return { r: PROFIL[best][0], nr: dy/l, ny: -dr/l };
    };

    var SPIKES = [];
    var SPIKE_DEF = [[1.92,0.55],[1.5,0.65],[1.05,0.8],[0.55,0.85]];
    for (var i = 0; i < SPIKE_DEF.length; i++) {
        var sy_ = SPIKE_DEF[i][0], sa_ = SPIKE_DEF[i][1], sp_ = permukaan(sy_);
        for (var j = 0; j < 2; j++) {
            var ang = [sa_, Math.PI - sa_][j];
            var d   = LIBS.vec_normalize([sp_.nr*Math.cos(ang), sp_.ny, sp_.nr*Math.sin(ang)]);
            SPIKES.push({ p:[sp_.r*Math.cos(ang)-0.04*d[0], sy_-0.04*d[1], sp_.r*Math.sin(ang)-0.04*d[2]], d:d });
        }
    }

    var EYE_R = permukaan(1.6).r;

    // ================= ROMPI =================
    var VEST_Y0 = 0.5, VEST_Y1 = 1.6, VEST_OFF = 0.07, VEST_A = 2.1;
    var vest_radius = function (y) { return permukaan(y).r + VEST_OFF; };
    var vest_point  = function (a, y, r) { return [r*Math.sin(a), y, -r*Math.cos(a)]; };

    var VEST_SHELL = buatMesh(function (u, v) {
        var a = LIBS.lerp(-VEST_A, VEST_A, u), y = LIBS.lerp(VEST_Y0, VEST_Y1, v);
        return vest_point(a, y, vest_radius(y) + 0.04*Math.sin(v*Math.PI));
    }, 40, 14);

    var buatHem = function (y) {
        return buatMesh(function (u, v) {
            var a = LIBS.lerp(-VEST_A, VEST_A, v), r = vest_radius(y);
            var c = vest_point(a, y, r), dv = [Math.sin(a), 0, -Math.cos(a)];
            var q = u*TAU, w = 0.09;
            return [c[0]+w*Math.cos(q)*dv[0], c[1]+w*Math.sin(q), c[2]+w*Math.cos(q)*dv[2]];
        }, 10, 40);
    };
    var VEST_HEM_LO = buatHem(VEST_Y0);
    var VEST_HEM_HI = buatHem(VEST_Y1);

    var buatTepi = function (a) {
        return buatMesh(function (u, v) {
            var y = LIBS.lerp(VEST_Y0, VEST_Y1, v), c = vest_point(a, y, vest_radius(y));
            var dv = [Math.sin(a), 0, -Math.cos(a)], tg = [Math.cos(a), 0, Math.sin(a)];
            var q = u*TAU, w = 0.12;
            return [c[0]+w*(Math.cos(q)*dv[0]+Math.sin(q)*tg[0]),
                    c[1]+w*(Math.cos(q)*dv[1]+Math.sin(q)*tg[1]),
                    c[2]+w*(Math.cos(q)*dv[2]+Math.sin(q)*tg[2])];
        }, 10, 16);
    };
    var VEST_EDGE_R = buatTepi( VEST_A);
    var VEST_EDGE_L = buatTepi(-VEST_A);

    // ================= DATA LINGKUNGAN =================
    var seed = 7;
    var rnd  = function () { seed = (seed*16807)%2147483647; return seed/2147483647; };

    var ROCKS = [];
    for (var i = 0; i < 14; i++) {
        var a = rnd()*TAU, r = 6+rnd()*13;
        ROCKS.push({ x:Math.cos(a)*r, z:Math.sin(a)*r, s:0.25+rnd()*0.5 });
    }
    var CACTI = [];
    for (var i = 0; i < 7; i++) CACTI.push({ a:i*0.9+0.3, r:8+(i%3)*2.2, s:0.35+0.1*(i%3), i:i });

    var MESAS = [];
    for (var i = 0; i < 6; i++) MESAS.push({ a:i*1.05+0.4, s:5+(i%3)*2 });

    var CLOUDS = [];
    for (var i = 0; i < 6; i++) CLOUDS.push({ a:i*1.1, y:20+(i%3)*4, s:3+(i%2)*1.5 });

    var ULTI_RING = [];
    for (var i = 0; i < 12; i++) {
        var a = (i/12)*TAU+rnd()*0.2;
        ULTI_RING.push({ a:a, r:1.7+rnd()*1.0, h:1.1+rnd()*0.6, ph:rnd()*3 });
    }
    var DROPS = [];
    for (var i = 0; i < 7; i++) DROPS.push({ i:i, ox:(rnd()-.5)*.5, oz:(rnd()-.5)*.5, ph:rnd() });

    // ================= RENDERING API =================

    // Aktifkan program & set kamera — dipanggil sekali per frame dari script.js
    var setCamera = function (projMatrix, viewMatrix, eyePos) {
        GL.useProgram(PROG);
        GL.enableVertexAttribArray(_pos);
        GL.enableVertexAttribArray(_norm);
        GL.uniformMatrix4fv(_P, false, projMatrix);
        GL.uniformMatrix4fv(_V, false, viewMatrix);
        GL.uniform3fv(_eye, eyePos);
    };

    // Gambar satu mesh
    var gambar = function (mesh, M, color, opt) {
        opt = opt || {};
        GL.bindBuffer(GL.ARRAY_BUFFER, mesh.vertex);
        GL.vertexAttribPointer(_pos,  3, GL.FLOAT, false, 4*6, 0);
        GL.vertexAttribPointer(_norm, 3, GL.FLOAT, false, 4*6, 4*3);
        GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, mesh.faces);
        GL.uniformMatrix4fv(_M, false, M);
        GL.uniformMatrix3fv(_N, false, LIBS.normal_matrix(M));
        GL.uniform3fv(_bc,  color);
        GL.uniform3fv(_sc,  opt.color2 || HAZE);
        GL.uniform1f(_rm,   opt.mode   || 0);
        GL.uniform1f(_sp,   opt.spec  == null ? 0.25 : opt.spec);
        GL.uniform1f(_al,   opt.alpha == null ? 1    : opt.alpha);
        GL.drawElements(GL.TRIANGLES, mesh.count, GL.UNSIGNED_INT, 0);
    };

    // ---- Public API ----
    return {
        // Rendering
        setCamera  : setCamera,
        gambar     : gambar,
        // Meshes
        SPHERE     : SPHERE,
        CONE       : CONE,
        BODY       : BODY,
        PANTS      : PANTS,
        PARABOLOID : PARABOLOID,
        MOUTH      : MOUTH,
        ARM        : ARM,
        LEG        : LEG,
        GROUND     : GROUND,
        BOX        : BOX,
        HANDLE     : HANDLE,
        VEST_SHELL : VEST_SHELL,
        VEST_HEM_LO: VEST_HEM_LO,
        VEST_HEM_HI: VEST_HEM_HI,
        VEST_EDGE_R: VEST_EDGE_R,
        VEST_EDGE_L: VEST_EDGE_L,
        // Konstanta & data
        LEGLEN     : LEGLEN,
        EYE_R      : EYE_R,
        SPIKES     : SPIKES,
        VEST_A     : VEST_A,
        VEST_Y0    : VEST_Y0,
        VEST_Y1    : VEST_Y1,
        vest_radius: vest_radius,
        ROCKS      : ROCKS,
        CACTI      : CACTI,
        MESAS      : MESAS,
        CLOUDS     : CLOUDS,
        ULTI_RING  : ULTI_RING,
        DROPS      : DROPS,
        // Fungsi helper
        bezier     : bezier,
        TAU        : TAU,
        ARM_P      : ARM_P,
        LEG_P      : LEG_P
    };
}
