// sprout.js - Hanya berisi definisi karakter Sprout
// Dipanggil dari script.js via initSprout(GL)
// Mengembalikan objek { draw(time) } untuk digunakan dalam animation loop utama

// ============================================================
// Kelas helper: objek 3D hierarki dengan VBO/IBO sendiri
// ============================================================
class SproutObject {
    constructor(gl, program, posAttr, colAttr, normAttr, mMatrixUnif, vertices, faces) {
        this.GL = gl;
        this.PROGRAM = program;
        this._position = posAttr;
        this._color = colAttr;
        this._normal = normAttr;
        this._Mmatrix = mMatrixUnif;

        this.vertices = vertices;
        this.faces = faces;

        this.POSITION_MATRIX = LIBS.get_I4();
        this.MOVE_MATRIX = LIBS.get_I4();
        this.JOINT_MATRIX = LIBS.get_I4();

        this.childs = [];

        this.vbo = gl.createBuffer();
        this.ibo = gl.createBuffer();

        this._upload();
    }

    _upload() {
        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.vbo);
        this.GL.bufferData(this.GL.ARRAY_BUFFER, new Float32Array(this.vertices), this.GL.STATIC_DRAW);

        this.GL.bindBuffer(this.GL.ELEMENT_ARRAY_BUFFER, this.ibo);
        this.GL.bufferData(this.GL.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.faces), this.GL.STATIC_DRAW);
    }

    render(parentMatrix) {
        var model = LIBS.multiply(parentMatrix, this.JOINT_MATRIX);
        model = LIBS.multiply(model, this.MOVE_MATRIX);
        model = LIBS.multiply(model, this.POSITION_MATRIX);

        this.GL.useProgram(this.PROGRAM);
        this.GL.uniformMatrix4fv(this._Mmatrix, false, model);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.vbo);

        var stride = 10 * 4;
        this.GL.vertexAttribPointer(this._position, 3, this.GL.FLOAT, false, stride, 0);
        this.GL.vertexAttribPointer(this._color, 4, this.GL.FLOAT, false, stride, 3 * 4);
        this.GL.vertexAttribPointer(this._normal, 3, this.GL.FLOAT, false, stride, 7 * 4);

        this.GL.bindBuffer(this.GL.ELEMENT_ARRAY_BUFFER, this.ibo);
        this.GL.drawElements(this.GL.TRIANGLES, this.faces.length, this.GL.UNSIGNED_SHORT, 0);

        for (var i = 0; i < this.childs.length; i++) {
            this.childs[i].render(model);
        }
    }
}

// ============================================================
// initSprout(GL, CANVAS_WIDTH_HEIGHT_fn)
//   GL        - WebGL context yang sudah dibuat di script.js
//   getSize   - fungsi () => { w, h } untuk mendapatkan ukuran canvas terkini
//
// Return: { draw(time, projMatrix, viewMatrix) }
//   projMatrix & viewMatrix dikirim dari script.js (kamera bebas)
// ============================================================
function initSprout(GL) {

    // ================= SHADERS SPROUT =================
    var sprout_vertex_source = `
        attribute vec3 position;
        attribute vec4 color;
        attribute vec3 normal;

        uniform mat4 SP_Pmatrix;
        uniform mat4 SP_Vmatrix;
        uniform mat4 SP_Mmatrix;

        varying vec4 vColor;
        varying vec3 vNormal;
        varying vec3 vFragPos;

        void main(void) {
            vec4 worldPos = SP_Mmatrix * vec4(position, 1.0);
            gl_Position = SP_Pmatrix * SP_Vmatrix * worldPos;

            vColor = color;
            vNormal = normalize(mat3(SP_Mmatrix) * normal);
            vFragPos = vec3(worldPos);
        }
    `;

    var sprout_fragment_source = `
        precision mediump float;

        varying vec4 vColor;
        varying vec3 vNormal;
        varying vec3 vFragPos;

        void main(void) {
            vec3 normal = normalize(vNormal);
            vec3 lightDir = normalize(vec3(-0.3, 0.8, 0.9));

            float ambient = 0.55;
            float diffuse = max(dot(normal, lightDir), 0.0) * 0.45;

            vec3 viewDir = normalize(vec3(0.0, 0.0, 8.0) - vFragPos);
            vec3 halfDir = normalize(lightDir + viewDir);
            float spec = pow(max(dot(normal, halfDir), 0.0), 16.0) * 0.2;

            vec3 rgb = vColor.rgb * (ambient + diffuse) + vec3(spec);
            gl_FragColor = vec4(rgb, vColor.a);
        }
    `;

    function compileShader(source, type) {
        var shader = GL.createShader(type);
        GL.shaderSource(shader, source);
        GL.compileShader(shader);
        if (!GL.getShaderParameter(shader, GL.COMPILE_STATUS)) {
            console.error('[Sprout] Shader error:', GL.getShaderInfoLog(shader));
            GL.deleteShader(shader);
            return null;
        }
        return shader;
    }

    var vs = compileShader(sprout_vertex_source, GL.VERTEX_SHADER);
    var fs = compileShader(sprout_fragment_source, GL.FRAGMENT_SHADER);

    var SHADER_PROGRAM = GL.createProgram();
    GL.attachShader(SHADER_PROGRAM, vs);
    GL.attachShader(SHADER_PROGRAM, fs);
    GL.linkProgram(SHADER_PROGRAM);

    if (!GL.getProgramParameter(SHADER_PROGRAM, GL.LINK_STATUS)) {
        console.error('[Sprout] Program link error:', GL.getProgramInfoLog(SHADER_PROGRAM));
        return null;
    }

    var _position = GL.getAttribLocation(SHADER_PROGRAM, 'position');
    var _color = GL.getAttribLocation(SHADER_PROGRAM, 'color');
    var _normal = GL.getAttribLocation(SHADER_PROGRAM, 'normal');

    var _Pmatrix = GL.getUniformLocation(SHADER_PROGRAM, 'SP_Pmatrix');
    var _Vmatrix = GL.getUniformLocation(SHADER_PROGRAM, 'SP_Vmatrix');
    var _Mmatrix = GL.getUniformLocation(SHADER_PROGRAM, 'SP_Mmatrix');

    GL.useProgram(SHADER_PROGRAM);
    GL.enableVertexAttribArray(_position);
    GL.enableVertexAttribArray(_color);
    GL.enableVertexAttribArray(_normal);

    // ================= PALET WARNA =================
    var COLOR_WHITE = [0.92, 0.94, 0.96, 1.0];
    var COLOR_CYAN_GLASS = [0.60, 0.90, 1.0, 0.45];
    var COLOR_CYAN_TRIM = [0.72, 0.92, 0.98, 0.85];
    var COLOR_YELLOW_NOTE = [0.98, 0.85, 0.12, 1.0];
    var COLOR_GREEN_LEAF = [0.22, 0.82, 0.22, 1.0];
    var COLOR_GREEN_STEM = [0.15, 0.65, 0.15, 1.0];
    var COLOR_BLUE_PIPE = [0.45, 0.65, 0.95, 1.0];
    var COLOR_PINK_CAPIT = [0.95, 0.32, 0.55, 1.0];
    var COLOR_PURPLE_WHEEL = [0.18, 0.16, 0.35, 1.0];
    var COLOR_RED_BUTTON = [0.92, 0.15, 0.18, 1.0];
    var COLOR_BLACK_FACE = [0.12, 0.12, 0.12, 1.0];
    var COLOR_TAPE = [0.88, 0.88, 0.82, 0.9];

    function makeMesh(geom) {
        return new SproutObject(
            GL, SHADER_PROGRAM,
            _position, _color, _normal, _Mmatrix,
            geom.vertex, geom.faces
        );
    }

    // ================= MODEL SPROUT =================
    // bodyBase — roda bawah berada di y=0 (ground level dunia Spike)
    // Tinggi roda = 0.85, jadi bodyBase diangkat 0.85 agar roda menyentuh tanah
    var bodyBase = makeMesh(LIBS.createCylinder(28, 8, 1.25, 1.1, 1.3, COLOR_WHITE));

    // bodyCollar
    var bodyCollar = makeMesh(LIBS.createCylinder(28, 6, 1.32, 1.32, 0.5, COLOR_CYAN_TRIM));
    LIBS.translateY(bodyCollar.POSITION_MATRIX, 0.25);
    bodyBase.childs.push(bodyCollar);

    var logoSymbol = makeMesh(LIBS.createSphere(16, 16, 0.16, [0.1, 0.75, 0.9, 1.0]));
    LIBS.set_position(logoSymbol.POSITION_MATRIX, 0.0, 0.0, 1.30);
    bodyCollar.childs.push(logoSymbol);

    var redButton = makeMesh(LIBS.createCylinder(16, 4, 0.08, 0.08, 0.06, COLOR_RED_BUTTON));
    LIBS.rotateX(redButton.POSITION_MATRIX, Math.PI / 2);
    LIBS.rotateY(redButton.POSITION_MATRIX, -0.53);
    LIBS.set_position(redButton.POSITION_MATRIX, 0.67, 0.0, 1.14);
    bodyCollar.childs.push(redButton);

    // glassDome
    var glassDome = makeMesh(LIBS.createEllipticParaboloid(28, 16, 1.2, 1.1, 1.6, COLOR_CYAN_GLASS));
    LIBS.translateY(glassDome.POSITION_MATRIX, 0.62);
    bodyBase.childs.push(glassDome);

    // stickyNote
    var stickyNote = makeMesh(LIBS.createBox(0.85, 0.85, 0.02, COLOR_YELLOW_NOTE));
    LIBS.set_position(stickyNote.POSITION_MATRIX, 0.0, 0.63, 0.865);
    LIBS.rotateX(stickyNote.POSITION_MATRIX, 0.41);
    glassDome.childs.push(stickyNote);

    var tape = makeMesh(LIBS.createBox(0.25, 0.12, 0.03, COLOR_TAPE));
    LIBS.set_position(tape.POSITION_MATRIX, 0.0, 0.43, 0.01);
    stickyNote.childs.push(tape);

    var leftEye = makeMesh(LIBS.createSphere(12, 12, 0.075, COLOR_BLACK_FACE));
    LIBS.set_position(leftEye.POSITION_MATRIX, -0.20, 0.07, 0.03);
    stickyNote.childs.push(leftEye);

    var rightEye = makeMesh(LIBS.createSphere(12, 12, 0.075, COLOR_BLACK_FACE));
    LIBS.set_position(rightEye.POSITION_MATRIX, 0.20, 0.07, 0.03);
    stickyNote.childs.push(rightEye);

    var mouth = makeMesh(LIBS.createBox(0.16, 0.035, 0.02, COLOR_BLACK_FACE));
    LIBS.set_position(mouth.POSITION_MATRIX, 0.0, -0.13, 0.03);
    stickyNote.childs.push(mouth);

    // stem
    var stem = makeMesh(LIBS.createCylinder(12, 4, 0.06, 0.06, 0.8, COLOR_GREEN_STEM));
    LIBS.set_position(stem.POSITION_MATRIX, 0.0, 1.58, 0.0);
    glassDome.childs.push(stem);

    var leafLeft = makeMesh(LIBS.createCurvedLeaf(8, 10, 0.42, 0.75, COLOR_GREEN_LEAF));
    LIBS.set_position(leafLeft.POSITION_MATRIX, 0.0, 0.12, 0.0);
    LIBS.rotateY(leafLeft.POSITION_MATRIX, -Math.PI / 2 - 0.3);
    LIBS.rotateX(leafLeft.POSITION_MATRIX, -1.8);
    LIBS.translateY(leafLeft.POSITION_MATRIX, 0.1);
    LIBS.translateZ(leafLeft.POSITION_MATRIX, 0.1);
    stem.childs.push(leafLeft);

    var leafRight = makeMesh(LIBS.createCurvedLeaf(8, 10, 0.42, 0.75, COLOR_GREEN_LEAF));
    LIBS.set_position(leafRight.POSITION_MATRIX, 0.0, 0.12, 0.0);
    LIBS.rotateY(leafRight.POSITION_MATRIX, Math.PI / 2 + 0.3);
    LIBS.rotateX(leafRight.POSITION_MATRIX, -1.8);
    LIBS.translateY(leafRight.POSITION_MATRIX, 0.1);
    LIBS.translateZ(leafRight.POSITION_MATRIX, 0.1);
    stem.childs.push(leafRight);

    // Arms
    function createArm(isLeft) {
        var side = isLeft ? -1 : 1;
        var shoulder = makeMesh(LIBS.createCylinder(16, 6, 0.30, 0.32, 0.7, COLOR_BLUE_PIPE));
        LIBS.translateX(shoulder.JOINT_MATRIX, side * 1.35);
        LIBS.translateY(shoulder.JOINT_MATRIX, 0.15);
        LIBS.rotateZ(shoulder.MOVE_MATRIX, side * -0.55);

        var ring = makeMesh(LIBS.createCylinder(16, 4, 0.35, 0.35, 0.18, COLOR_CYAN_TRIM));
        LIBS.translateY(ring.POSITION_MATRIX, 0.1);
        shoulder.childs.push(ring);

        var wrist = makeMesh(LIBS.createSphere(16, 16, 0.28, COLOR_PINK_CAPIT));
        LIBS.translateY(wrist.POSITION_MATRIX, -0.42);
        shoulder.childs.push(wrist);

        var claw1 = makeMesh(LIBS.createBox(0.12, 0.38, 0.12, COLOR_PINK_CAPIT));
        LIBS.set_position(claw1.POSITION_MATRIX, side * 0.12, -0.20, 0.1);
        LIBS.rotateZ(claw1.POSITION_MATRIX, side * 0.4);
        wrist.childs.push(claw1);

        var claw2 = makeMesh(LIBS.createBox(0.12, 0.38, 0.12, COLOR_PINK_CAPIT));
        LIBS.set_position(claw2.POSITION_MATRIX, side * 0.12, -0.20, -0.1);
        LIBS.rotateZ(claw2.POSITION_MATRIX, side * 0.4);
        wrist.childs.push(claw2);

        return shoulder;
    }

    var leftArm = createArm(true);
    var rightArm = createArm(false);
    bodyBase.childs.push(leftArm);
    bodyBase.childs.push(rightArm);

    // Wheels
    function createWheel(xPos) {
        var wheel = makeMesh(LIBS.createCylinder(20, 6, 0.32, 0.32, 0.65, COLOR_PURPLE_WHEEL));
        // Posisi poros roda ditaruh di JOINT_MATRIX agar roda berputar di tempat (tidak mengorbit titik 0,0,0)
        LIBS.set_position(wheel.JOINT_MATRIX, xPos, -0.85, 0.0);
        // Orientasi silinder roda di POSITION_MATRIX
        LIBS.rotateX(wheel.POSITION_MATRIX, Math.PI / 2);

        var rim = makeMesh(LIBS.createCylinder(16, 4, 0.20, 0.20, 0.67, COLOR_BLUE_PIPE));
        wheel.childs.push(rim);

        return wheel;
    }

    var leftWheel = createWheel(-0.62);
    var rightWheel = createWheel(0.62);
    bodyBase.childs.push(leftWheel);
    bodyBase.childs.push(rightWheel);

    // Posisi dunia Sprout ditaruh di JOINT_MATRIX agar rotasi hadap (MOVE_MATRIX) berputar di tempat seperti Spike
    LIBS.set_position(bodyBase.JOINT_MATRIX, -3.5, 1.17, 0.0);

    // Proyektil Sprout (sphere biasa berwarna pink)
    var projectileMesh = makeMesh(LIBS.createSphere(16, 16, 0.30, COLOR_PINK_CAPIT));

    function getLeftHandWorldPosition() {
        // Matriks dunia bodyBase
        var bodyMatrix = LIBS.get_I4();
        bodyMatrix = LIBS.multiply(bodyMatrix, bodyBase.JOINT_MATRIX);
        bodyMatrix = LIBS.multiply(bodyMatrix, bodyBase.MOVE_MATRIX);
        bodyMatrix = LIBS.multiply(bodyMatrix, bodyBase.POSITION_MATRIX);

        // Matriks dunia leftArm
        var armMatrix = LIBS.multiply(bodyMatrix, leftArm.JOINT_MATRIX);
        armMatrix = LIBS.multiply(armMatrix, leftArm.MOVE_MATRIX);
        armMatrix = LIBS.multiply(armMatrix, leftArm.POSITION_MATRIX);

        // Posisi tengah telapak tangan dalam koordinat lokal shoulder
        var x = 0;
        var y = -0.42;
        var z = 0;

        // Konversi posisi lokal menjadi posisi dunia
        return {
            x: armMatrix[0] * x + armMatrix[4] * y + armMatrix[8] * z + armMatrix[12],
            y: armMatrix[1] * x + armMatrix[5] * y + armMatrix[9] * z + armMatrix[13],
            z: armMatrix[2] * x + armMatrix[6] * y + armMatrix[10] * z + armMatrix[14]
        };
    }

    // ================= PUBLIC API =================
    return {
        bodyBase: bodyBase,
        leftArm: leftArm,
        rightArm: rightArm,
        leftWheel: leftWheel,
        rightWheel: rightWheel,
        glassDome: glassDome,
        stem: stem,
        projectileMesh: projectileMesh,
        getLeftHandWorldPosition: getLeftHandWorldPosition,

        // Dipanggil tiap frame dari script.js
        // projMatrix & viewMatrix = kamera bebas dari script.js
        draw: function (time, projMatrix, viewMatrix, projectiles) {
            GL.useProgram(SHADER_PROGRAM);

            GL.enableVertexAttribArray(_position);
            GL.enableVertexAttribArray(_color);
            GL.enableVertexAttribArray(_normal);

            GL.uniformMatrix4fv(_Pmatrix, false, projMatrix);
            GL.uniformMatrix4fv(_Vmatrix, false, viewMatrix);

            var identity = LIBS.get_I4();
            bodyBase.render(identity);

            // Render semua proyektil aktif
            if (projectiles && projectiles.length > 0) {
                for (var i = 0; i < projectiles.length; i++) {
                    var p = projectiles[i];
                    LIBS.set_position(projectileMesh.JOINT_MATRIX, p.x, p.y, p.z);
                    projectileMesh.render(identity);
                }
            }
        }
    };
}
