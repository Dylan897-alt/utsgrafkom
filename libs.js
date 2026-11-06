// libs.js - library matriks 4x4 (column-major) gaya LIBS
// Nama fungsi sama dengan yang dipakai di kelas (get_projection, get_I4, set_I4, rotateX/Y/Z, translateX/Y/Z),
// ditambah mul, translation, rotationX/Y/Z, scaling, fromTo, transformPoint.
// Semua rotateX/Y/Z & translateX/Y/Z melakukan POST-multiply: M = M * T  (sama seperti cara pakai di main.js contoh)
var LIBS = {
    degToRad: function (angle) { return angle * Math.PI / 180; },

    get_projection: function (angle, a, zMin, zMax) {
        var f = 1 / Math.tan(LIBS.degToRad(0.5 * angle));
        var A = (zMax + zMin) / (zMin - zMax);
        var B = (2 * zMax * zMin) / (zMin - zMax);
        return [f / a, 0, 0, 0,
                0, f, 0, 0,
                0, 0, A, -1,
                0, 0, B, 0];
    },

    get_I4: function () { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; },
    set_I4: function (m) {
        var I = LIBS.get_I4();
        for (var i = 0; i < 16; i++) m[i] = I[i];
        return m;
    },
    copy: function (dst, src) { for (var i = 0; i < 16; i++) dst[i] = src[i]; return dst; },

    // out = a * b
    mul: function (a, b) {
        var o = new Array(16);
        for (var c = 0; c < 4; c++)
            for (var r = 0; r < 4; r++) {
                var s = 0;
                for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
                o[c * 4 + r] = s;
            }
        return o;
    },

    translation: function (x, y, z) { return [1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]; },
    scaling: function (x, y, z) { return [x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1]; },
    rotationX: function (a) { var c = Math.cos(a), s = Math.sin(a); return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]; },
    rotationY: function (a) { var c = Math.cos(a), s = Math.sin(a); return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]; },
    rotationZ: function (a) { var c = Math.cos(a), s = Math.sin(a); return [c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]; },

    translateX: function (m, t) { return LIBS.copy(m, LIBS.mul(m, LIBS.translation(t, 0, 0))); },
    translateY: function (m, t) { return LIBS.copy(m, LIBS.mul(m, LIBS.translation(0, t, 0))); },
    translateZ: function (m, t) { return LIBS.copy(m, LIBS.mul(m, LIBS.translation(0, 0, t))); },
    rotateX: function (m, a) { return LIBS.copy(m, LIBS.mul(m, LIBS.rotationX(a))); },
    rotateY: function (m, a) { return LIBS.copy(m, LIBS.mul(m, LIBS.rotationY(a))); },
    rotateZ: function (m, a) { return LIBS.copy(m, LIBS.mul(m, LIBS.rotationZ(a))); },

    // matriks rotasi yang memutar vektor satuan a menjadi vektor satuan b (Rodrigues)
    fromTo: function (a, b) {
        var vx = a[1]*b[2]-a[2]*b[1], vy = a[2]*b[0]-a[0]*b[2], vz = a[0]*b[1]-a[1]*b[0];
        var c = a[0]*b[0]+a[1]*b[1]+a[2]*b[2], R;
        if (c < -0.99999) {            // berlawanan arah: putar 180 derajat pada sumbu tegak lurus
            var u = Math.abs(a[0]) < 0.9 ? [1,0,0] : [0,1,0];
            var ax = [a[1]*u[2]-a[2]*u[1], a[2]*u[0]-a[0]*u[2], a[0]*u[1]-a[1]*u[0]];
            var l = Math.hypot(ax[0], ax[1], ax[2]); ax = [ax[0]/l, ax[1]/l, ax[2]/l];
            R = [[2*ax[0]*ax[0]-1, 2*ax[0]*ax[1], 2*ax[0]*ax[2]],
                 [2*ax[1]*ax[0], 2*ax[1]*ax[1]-1, 2*ax[1]*ax[2]],
                 [2*ax[2]*ax[0], 2*ax[2]*ax[1], 2*ax[2]*ax[2]-1]];
        } else {
            var k = 1 / (1 + c);
            R = [[1 - k*(vy*vy+vz*vz), -vz + k*vx*vy,      vy + k*vx*vz],
                 [vz + k*vx*vy,        1 - k*(vx*vx+vz*vz), -vx + k*vy*vz],
                 [-vy + k*vx*vz,       vx + k*vy*vz,        1 - k*(vx*vx+vy*vy)]];
        }
        var m = LIBS.get_I4();
        for (var col = 0; col < 3; col++) for (var row = 0; row < 3; row++) m[col*4+row] = R[row][col];
        return m;
    },

    // w=1 titik, w=0 arah
    transformPoint: function (m, p, w) {
        if (w === undefined) w = 1;
        return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12]*w,
                m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13]*w,
                m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]*w];
    }
};
